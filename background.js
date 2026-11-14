// ai-sub-ko — background service worker (module)
// Claude·Gemini API 는 여기서만 부른다: API 키가 페이지에 노출되지 않게.
import { normalize, MODELS, GEMINI_DEFAULTS, GEMINI_LIMITS } from './lib/settings.js';
import { DEFAULT_GLOSSARY, sanitizeGlossary, entriesFor, usePacks, overflowTerms } from './lib/glossary.js';
import { hintPhrases, BOOST, captureReason } from './lib/listen.js';
import { API_URL, MODELS_URL, PROMPT_TERMS_MAX, buildSystemPrompt, buildRequestBody, buildHeaders, extractText, pickClaudeModels } from './lib/prompt.js';
import { classify } from './lib/errors.js';
import { dayKey, addUsage, emptyDay, overCap, pruneDays, ptDayKey, emptyGeminiDay } from './lib/cost.js';
import { RateWindow, LruCache, cacheKey, CLAUDE_PER_MIN, SHARED_CACHE_MAX } from './lib/guard.js';
import { GEMINI_BASE, geminiHeaders, buildBatchSystem, buildBatchBody, parseBatch, geminiUsage, classifyGemini, pickGeminiModels } from './lib/gemini.js';

const TIMEOUT_MS = 5000;        // 자막은 늦으면 의미가 없다 → 5초 넘으면 대신 번역
const BATCH_TIMEOUT_MS = 90000; // 미리 번역 100줄 (무료 등급은 느릴 때가 있다)
const TEST_TIMEOUT_MS = 15000;
const GEMINI_TEST_TIMEOUT_MS = 45000;

const err = (code, msg) => Object.assign(new Error(msg || code), { code });

async function getConfig() {
  const sync = normalize(await chrome.storage.sync.get(null));
  const { apiKey = '', geminiKey = '', glossary, geminiModels = {} } = await chrome.storage.local.get(['apiKey', 'geminiKey', 'glossary', 'geminiModels']);
  return {
    ...sync, apiKey, geminiKey,
    glossary: glossary ? sanitizeGlossary(glossary) : DEFAULT_GLOSSARY,
    liteModel: geminiModels.lite || GEMINI_DEFAULTS.lite
  };
}

const packsOf = msg => (Array.isArray(msg.packs) && msg.packs.length ? msg.packs : ['common', 'f1']);

// ===== 토큰 새는 것 막기 (1.0.17) =====
// 분당 상한: 탭 여러 개 · 고장 난 반복이 한꺼번에 부르는 것을 막는다 (넘으면 1분 동안 대신 번역)
const claudeRate = new RateWindow(CLAUDE_PER_MIN);
// 같이 쓰는 번역 기억: 같은 줄을 다른 탭 · 새로고침 · 되감기 뒤에 다시 사지 않게. 크롬을 끄면 지워짐 (storage.session)
let shared = null, sharedSaveTimer = 0;
const inflight = new Map(); // 지금 요청 중인 줄 → 그 요청
let sharedLoading = null;
async function sharedCache() {
  if (shared) return shared;
  // 서비스 워커가 깨어날 때 요청 여럿이 동시에 와도 한 번만 읽는다 (따로 읽으면 먼저 기억한 줄이 덮여 사라짐)
  sharedLoading ||= chrome.storage.session.get('trCache').catch(() => ({})).then(({ trCache = [] }) => {
    shared ||= new LruCache(SHARED_CACHE_MAX, Array.isArray(trCache) ? trCache : []);
    sharedLoading = null;
    return shared;
  });
  return sharedLoading;
}
function saveSharedSoon() {
  clearTimeout(sharedSaveTimer);
  sharedSaveTimer = setTimeout(() => chrome.storage.session.set({ trCache: shared.entries() }).catch(() => {}), 2000);
}
// 용어집 · 모델 · 영화 설정이 바뀌면 기억한 번역은 버린다 (옛 용어로 나오지 않게)
chrome.storage.onChanged.addListener((ch, area) => {
  if (Object.keys(ch).some(k => ['glossary', 'model', 'filmTone', 'filmNames', 'filmShort'].includes(k))) {
    shared = new LruCache(SHARED_CACHE_MAX);
    chrome.storage.session.remove('trCache').catch(() => {});
  }
});

// ===== 사용량 (동시 요청이 서로 덮어쓰지 않게 차례로) =====
let usageChain = Promise.resolve();
function updateLocal(key, fn) {
  usageChain = usageChain.then(async () => {
    const cur = (await chrome.storage.local.get(key))[key];
    await chrome.storage.local.set({ [key]: fn(cur) });
  }).catch(() => {});
  return usageChain;
}

/** Claude·크롬 사용량: 현지 날짜별 */
function recordUsage(u, ms, failed = false) {
  return updateLocal('usage', (usage = {}) => {
    const days = usage.days || {};
    const k = dayKey();
    days[k] = failed ? { ...emptyDay(), ...days[k], fails: (days[k]?.fails || 0) + 1 } : addUsage(days[k], u, ms);
    return { days: pruneDays(days) };
  });
}

function recordChrome(n, ms) {
  return updateLocal('usage', (usage = {}) => {
    const days = usage.days || {};
    const k = dayKey();
    const d = { ...emptyDay(), ...days[k] };
    d.chrome = (d.chrome || 0) + n;
    d.chromeMs = (d.chromeMs || 0) + ms;
    days[k] = d;
    return { days: pruneDays(days) };
  });
}

/** Gemini 사용량: 태평양 시간 날짜별 (하루 한도가 그때 다시 찬다) */
function recordGemini(patch) {
  return updateLocal('gemini', (g = {}) => {
    const k = ptDayKey();
    const d = { ...emptyGeminiDay(), ...g[k] };
    for (const [f, v] of Object.entries(patch)) d[f] = (d[f] || 0) + v;
    return pruneDays({ ...g, [k]: d }, 10);
  });
}

async function today() {
  const { usage = {} } = await chrome.storage.local.get('usage');
  return usage.days?.[dayKey()] || emptyDay();
}

async function geminiToday() {
  const { gemini = {} } = await chrome.storage.local.get('gemini');
  return { ...emptyGeminiDay(), ...gemini[ptDayKey()] };
}

async function fetchJSON(url, init, timeoutMs, classifier) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      throw err(classifier(res.status, msg), msg);
    }
    return { data, ms: Date.now() - t0 };
  } catch (e) {
    if (e.name === 'AbortError') throw err('TIMEOUT', `응답 지연 (${Math.round(timeoutMs / 1000)}초 넘게 답이 없음)`);
    if (!e.code) e.code = 'NETWORK';
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ===== Claude =====
async function callClaude(text, context, cfg, packs, timeoutMs, srcLang = 'en') {
  if (!cfg.apiKey) throw err('NO_KEY', 'API 키 없음');
  const extraTerms = overflowTerms(cfg.glossary, packs, text, PROMPT_TERMS_MAX);
  const body = buildRequestBody({ model: cfg.model, system: buildSystemPrompt(cfg.glossary, packs, { ...cfg, srcLang }), text, context, extraTerms });
  const { data, ms } = await fetchJSON(API_URL, { method: 'POST', headers: buildHeaders(cfg.apiKey), body: JSON.stringify(body) }, timeoutMs, classify);
  const out = extractText(data);
  if (!out) throw err('API_ERROR', '빈 응답');
  await recordUsage(data.usage, ms);
  return { text: out, ms, usage: data.usage || {} };
}

/** 모델 목록을 새로 받아 계열별 최신으로 (연결 테스트 때) */
async function refreshClaudeModels(apiKey) {
  const { data } = await fetchJSON(MODELS_URL, { headers: buildHeaders(apiKey) }, TEST_TIMEOUT_MS, classify);
  const picked = pickClaudeModels(data);
  const list = MODELS.map(m => {
    const p = picked[m.family];
    return p ? { ...m, id: p.id, name: `${p.name} · ${p.id}${m.family === 'haiku' ? ' — 가장 빠르고 저렴 (권장)' : ''}` } : m;
  });
  await chrome.storage.local.set({ claudeModels: list });
  return list;
}

// ===== Gemini Flash Lite: 자막 묶음 미리 번역 =====
// 분당 15회 한도 → 요청 사이를 띄운다
let liteChain = Promise.resolve();
let liteNoThinking = false;
let liteLastAt = 0;
function liteSlot() {
  const gap = Math.ceil(60000 / GEMINI_LIMITS.lite.rpm) + 200;
  const p = liteChain.then(async () => {
    const wait = liteLastAt + gap - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    liteLastAt = Date.now();
  });
  liteChain = p.catch(() => {});
  return p;
}

async function callLite(lines, names, cfg, packs, timeoutMs, { count = true } = {}) {
  if (!cfg.geminiKey) throw err('NO_KEY', 'Gemini API 키 없음');
  if (count && (await geminiToday()).lite >= GEMINI_LIMITS.lite.rpd) throw err('DAILY', '오늘 무료 한도');
  await liteSlot();
  const system = buildBatchSystem(cfg.glossary, packs, lines, cfg);
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(cfg.liteModel)}:generateContent`;
  const post = thinking => fetchJSON(url, { method: 'POST', headers: geminiHeaders(cfg.geminiKey), body: JSON.stringify(buildBatchBody({ system, lines, names, thinking })) }, timeoutMs, classifyGemini);
  try {
    let res;
    try {
      res = await post(!liteNoThinking);
    } catch (e) {
      // 생각 수준 설정을 모르는 모델이면 빼고 한 번 더
      if (liteNoThinking || !/thinking/i.test(e.message)) throw e;
      liteNoThinking = true;
      res = await post(false);
    }
    const { data, ms } = res;
    const u = geminiUsage(data);
    await recordGemini({ lite: 1, liteIn: u.input, liteOut: u.output });
    const r = parseBatch(data, lines.length, lines);
    if (!r.lines.some(Boolean)) throw err('API_ERROR', '빈 응답');
    return { ...r, ms };
  } catch (e) {
    if (e.code !== 'NO_KEY') recordGemini({ liteFails: 1 });
    throw e;
  }
}

/** Gemini 모델 목록에서 최신 이름 */
async function refreshGeminiModels(key) {
  const { data } = await fetchJSON(`${GEMINI_BASE}/models?pageSize=1000`, { headers: geminiHeaders(key) }, GEMINI_TEST_TIMEOUT_MS, classifyGemini);
  const picked = pickGeminiModels(data);
  const { geminiModels = {} } = await chrome.storage.local.get('geminiModels');
  const next = { lite: picked.lite || geminiModels.lite || GEMINI_DEFAULTS.lite };
  await chrome.storage.local.set({ geminiModels: next });
  return { ...next, foundLite: !!picked.lite };
}

// ===== 사이트 더하기 (이 사이트에서 켜기) =====
const scriptId = host => `site-${host}`;

async function addSite(host, tabId) {
  const matches = [`https://${host}/*`, `http://${host}/*`];
  const id = scriptId(host);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (!existing.length) {
    await chrome.scripting.registerContentScripts([{
      id, matches, js: ['content.js'], css: ['overlay.css'], allFrames: true, runAt: 'document_idle', persistAcrossSessions: true
    }]).catch(e => { if (!/duplicate/i.test(e.message)) throw e; }); // 팝업 · 권한 허락 알림이 같이 더할 때
  }
  const cfg = normalize(await chrome.storage.sync.get(null));
  if (!cfg.customSites.includes(host)) await chrome.storage.sync.set({ customSites: [...cfg.customSites, host], siteOn: { ...cfg.siteOn, [host]: true } });
  if (tabId != null) {
    // 지금 탭에도 바로 (새로고침 없이)
    await chrome.scripting.insertCSS({ target: { tabId, allFrames: true }, files: ['overlay.css'] }).catch(() => {});
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] }).catch(() => {});
  }
}

// 팝업의 「이 사이트에서 켜기」: 권한 창이 뜨면 팝업이 닫혀 팝업이 더하기를 끝내지 못한다 →
// 팝업이 미리 알려 둔 사이트의 권한이 허락되면 여기서 마저 더한다 (5분 안)
const PENDING_MS = 5 * 60_000;
chrome.permissions.onAdded.addListener(async ({ origins = [] }) => {
  const { sitePending: p = null } = await chrome.storage.session.get('sitePending');
  if (!p || Date.now() - p.at > PENDING_MS) return;
  const hit = p.hosts.filter(h => origins.some(o => o === `https://${h}/*` || o === `http://${h}/*`));
  if (!hit.length) return;
  const rest = p.hosts.filter(h => !hit.includes(h));
  if (rest.length) await chrome.storage.session.set({ sitePending: { ...p, hosts: rest } });
  else await chrome.storage.session.remove('sitePending');
  for (const h of hit) await addSite(h, p.tabId).catch(() => {});
});

async function removeSite(host) {
  await chrome.scripting.unregisterContentScripts({ ids: [scriptId(host)] }).catch(() => {});
  const cfg = normalize(await chrome.storage.sync.get(null));
  const siteOn = { ...cfg.siteOn };
  delete siteOn[host];
  await chrome.storage.sync.set({ customSites: cfg.customSites.filter(h => h !== host), siteOn });
  await chrome.permissions.remove({ origins: [`https://${host}/*`, `http://${host}/*`] }).catch(() => {});
}

// ===== 음성 번역 (1.0): 탭 소리 → offscreen 의 크롬 내장 음성 인식(맥 안) → 콘텐츠 스크립트 =====
// 소리를 서버로 보내지 않는다. 한 번에 한 탭만. 상태는 storage.session (서비스 워커가 쉬었다 깨어도)
const OFF_URL = 'offscreen.html';

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  try {
    await chrome.offscreen.createDocument({ url: OFF_URL, reasons: ['USER_MEDIA'], justification: '탭 소리를 맥 안 음성 인식으로 받아 적어 자막으로 번역' });
  } catch (e) {
    if (!/single offscreen|already/i.test(e.message)) throw e;
  }
}

async function listenState() {
  const { listen = null } = await chrome.storage.session.get('listen');
  return listen; // { tabId, lang }
}

async function closeOffscreenIfIdle() {
  if (!(await listenState()) && await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument().catch(() => {});
}

/** 이 크롬 · 이 언어로 쓸 수 있는지 (offscreen 에서 검사 — 서비스 워커에는 음성 인식이 없다) */
async function listenSupport(lang) {
  const cfg = normalize(await chrome.storage.sync.get(null));
  if (cfg.listenWhen === 'off') return { ok: false, reason: 'off' };
  await ensureOffscreen();
  const r = await chrome.runtime.sendMessage({ type: 'off-support', lang: lang || cfg.listenLang }).catch(() => null);
  await closeOffscreenIfIdle();
  return r || { ok: false, reason: 'unknown' };
}

const tellTab = (tabId, m) => chrome.tabs.sendMessage(tabId, { type: 'f1ko-listen', ...m }).catch(() => {});

/** 영상 탭에 콘텐츠 스크립트가 없으면 (목록에 없는 사이트) activeTab 으로 넣는다 */
async function ensureContent(tabId) {
  try { if ((await chrome.tabs.sendMessage(tabId, { type: 'f1ko-ping' }))?.ok) return true; } catch { /* 없음 */ }
  try {
    await chrome.scripting.insertCSS({ target: { tabId, allFrames: true }, files: ['overlay.css'] });
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
    return true;
  } catch {
    return false;
  }
}

async function setListenBadge(tabId, on) {
  await chrome.action.setBadgeText({ tabId, text: on ? '음성' : '' }).catch(() => {});
  if (on) await chrome.action.setBadgeBackgroundColor({ tabId, color: '#0E7C66' }).catch(() => {});
}

async function listenStart(tabId, streamId = null, lang = null) {
  const cfg = await getConfig();
  if (cfg.listenWhen === 'off') return { ok: false, reason: 'off' };
  lang = lang || cfg.listenLang;
  const old = await listenState();
  if (old && old.tabId !== tabId) await listenStop(old.tabId, 'moved');
  if (!streamId) {
    try { streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }); } catch (e) { return { ok: false, reason: captureReason(e.message), error: e.message }; }
  }
  if (!(await ensureContent(tabId))) return { ok: false, reason: 'page' };
  let packs = ['common'];
  try { const st = await chrome.tabs.sendMessage(tabId, { type: 'f1ko-status' }); if (Array.isArray(st?.packs)) packs = st.packs; } catch { /* 기본 */ }
  const phrases = cfg.listenHints ? hintPhrases(entriesFor(cfg.glossary, usePacks(cfg.glossary, packs)), lang) : [];
  await ensureOffscreen();
  const r = await chrome.runtime.sendMessage({ type: 'off-start', tabId, streamId, lang, phrases, boost: BOOST }).catch(e => ({ ok: false, reason: 'unknown', error: e.message }));
  if (!r?.ok) { await closeOffscreenIfIdle(); return r || { ok: false, reason: 'unknown' }; }
  await chrome.storage.session.set({ listen: { tabId, lang, at: Date.now() } });
  await setListenBadge(tabId, true);
  await tellTab(tabId, { kind: 'start', lang });
  return { ok: true };
}

async function listenStop(tabId, reason = 'user') {
  const cur = await listenState();
  if (await chrome.offscreen.hasDocument()) await chrome.runtime.sendMessage({ type: 'off-stop' }).catch(() => {});
  await chrome.storage.session.remove('listen');
  const t = tabId ?? cur?.tabId;
  if (t != null) { await setListenBadge(t, false); await tellTab(t, { kind: 'stopped', reason }); }
  await closeOffscreenIfIdle();
  return { ok: true };
}

/** ⌥L: 쓸 수 있으면 시작 · 멈추기, 못 쓰면 시작하지 않고 같은 이유를 자막 자리에 */
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'listen-toggle' || !tab?.id) return;
  const cur = await listenState();
  if (cur?.tabId === tab.id) { await listenStop(tab.id); return; }
  const cfg = normalize(await chrome.storage.sync.get(null));
  const sup = await listenSupport(cfg.listenLang);
  if (!sup.ok) {
    await ensureContent(tab.id);
    await tellTab(tab.id, { kind: 'notice', reason: sup.reason, lang: cfg.listenLang });
    return;
  }
  const r = await listenStart(tab.id, null, cfg.listenLang);
  if (!r.ok) {
    await ensureContent(tab.id);
    await tellTab(tab.id, { kind: 'notice', reason: r.reason, lang: cfg.listenLang });
  }
});

chrome.tabs.onRemoved.addListener(async tabId => {
  if ((await listenState())?.tabId === tabId) await listenStop(tabId, 'closed');
});

// ===== 메시지 =====
const handlers = {
  async 'f1ko-listen-support'(msg) {
    return listenSupport(msg.lang);
  },

  async 'f1ko-listen-start'(msg) {
    return listenStart(msg.tabId, msg.streamId || null, msg.lang || null);
  },

  async 'f1ko-listen-stop'(msg, sender) {
    // 콘텐츠 스크립트(⌥K 끄기)가 부르면 그 탭이 음성 번역 중일 때만 — 다른 탭의 음성 번역은 건드리지 않음
    if (sender?.tab?.id != null) {
      const cur = await listenState();
      if (cur?.tabId !== sender.tab.id) return { ok: true };
      return listenStop(sender.tab.id, msg.reason === 'off' ? 'off' : 'user');
    }
    return listenStop(msg.tabId ?? null);
  },

  /** 음성 번역 중 크롬 내장 번역 (offscreen 에서 — 확장 출처의 번역 모델) */
  async 'f1ko-chrome-translate'(msg) {
    if (!(await chrome.offscreen.hasDocument())) return { ok: false, state: 'no-offscreen' };
    const r = await chrome.runtime.sendMessage({ type: 'off-translate', text: String(msg.text || ''), src: msg.src }).catch(e => ({ ok: false, state: 'error', error: e.message }));
    return r || { ok: false, state: 'error' };
  },

  async 'f1ko-listen-state'(msg, sender) {
    const cur = await listenState();
    const tabId = msg.tabId ?? sender?.tab?.id;
    return { ok: true, listening: !!cur && cur.tabId === tabId, lang: cur?.lang || null, other: !!cur && cur.tabId !== tabId };
  },

  async 'f1ko-translate'(msg) {
    const cfg = await getConfig();
    const srcLang = msg.srcLang === 'ja' ? 'ja' : 'en';
    const key = cacheKey({ model: cfg.model, packs: packsOf(msg), srcLang, text: msg.text });
    const cache = await sharedCache();
    const hit = cache.get(key);
    if (hit !== undefined) return { ok: true, text: hit, ms: 0, cached: true };
    // 같은 줄을 다른 탭이 지금 요청 중이면 그 답을 같이 기다린다 (같은 영상 두 탭 — 실제 키 실측에서 두 배로 나감)
    if (inflight.has(key)) return { ...(await inflight.get(key)), cached: true };
    const job = (async () => {
      if (overCap(await today(), cfg.dailyCapUsd, cfg.priceIn, cfg.priceOut)) throw err('CAP', '오늘 비용 상한');
      if (!claudeRate.tryTake()) throw err('LOCAL_RATE', `1분에 ${CLAUDE_PER_MIN}번 넘게 요청함`);
      try {
        const r = await callClaude(msg.text, msg.context || [], cfg, packsOf(msg), TIMEOUT_MS, srcLang);
        cache.set(key, r.text);
        saveSharedSoon();
        return { ok: true, text: r.text, ms: r.ms };
      } catch (e) {
        if (e.code !== 'NO_KEY') recordUsage(null, 0, true);
        throw e;
      }
    })();
    inflight.set(key, job);
    try { return await job; } finally { inflight.delete(key); }
  },

  async 'f1ko-batch'(msg) {
    const cfg = await getConfig();
    const lines = (msg.lines || []).map(String);
    const r = await callLite(lines, msg.names || [], cfg, packsOf(msg), BATCH_TIMEOUT_MS);
    return { ok: true, lines: r.lines, names: r.names, ms: r.ms };
  },

  async 'f1ko-keys'() {
    const { apiKey = '', geminiKey = '' } = await chrome.storage.local.get(['apiKey', 'geminiKey']);
    return { ok: true, claude: !!apiKey, gemini: !!geminiKey };
  },

  async 'f1ko-count'(msg) {
    if (msg.engine === 'chrome') await recordChrome(msg.n || 1, msg.ms || 0);
    if (msg.engine === 'lite-video') await recordGemini({ videos: 1 });
    return { ok: true };
  },

  async 'f1ko-test'(msg) {
    const cfg = await getConfig();
    if (msg.apiKey) cfg.apiKey = msg.apiKey;
    if (msg.model) cfg.model = msg.model;
    if (!cfg.apiKey) throw err('NO_KEY', 'API 키 없음');
    let models = null, modelsError = '';
    try { models = await refreshClaudeModels(cfg.apiKey); } catch (e) { modelsError = e.message; }
    // 고른 모델이 목록에서 빠졌으면 같은 계열 최신으로
    if (models && !models.some(m => m.id === cfg.model)) {
      const fam = /sonnet/.test(cfg.model) ? 'sonnet' : 'haiku';
      cfg.model = models.find(m => m.family === fam)?.id || cfg.model;
    }
    const r = await callClaude(msg.text, [], cfg, ['common', 'f1'], TEST_TIMEOUT_MS);
    return {
      ok: true, text: r.text, ms: r.ms, model: cfg.model, models, modelsError,
      cacheRead: r.usage.cache_read_input_tokens || 0, cacheWrite: r.usage.cache_creation_input_tokens || 0
    };
  },

  async 'f1ko-gemini-test'(msg) {
    const cfg = await getConfig();
    if (msg.key) cfg.geminiKey = msg.key;
    if (!cfg.geminiKey) throw err('NO_KEY', 'Gemini API 키 없음');
    const models = await refreshGeminiModels(cfg.geminiKey);
    cfg.liteModel = models.lite;
    const result = { ok: true, models };
    try {
      const r = await callLite([msg.text], [], cfg, ['common', 'f1'], GEMINI_TEST_TIMEOUT_MS);
      result.lite = { ok: true, ms: r.ms, text: r.lines[0] || '' };
    } catch (e) {
      result.lite = { ok: false, code: e.code, error: e.message };
    }
    return result;
  },

  async 'f1ko-site-pending'(msg) {
    // hosts: 이 사이트 + (영상이 다른 주소의 iframe 안이면) 그 플레이어 주소들
    const hosts = (Array.isArray(msg.hosts) ? msg.hosts : [msg.host]).map(h => String(h || '').toLowerCase()).filter(h => /^[a-z0-9.-]+$/.test(h));
    await chrome.storage.session.set({ sitePending: { hosts, tabId: msg.tabId ?? null, at: Date.now() } });
    return { ok: true };
  },

  async 'f1ko-site-add'(msg) {
    await chrome.storage.session.remove('sitePending');
    await addSite(msg.host, msg.tabId ?? null);
    return { ok: true };
  },

  async 'f1ko-site-remove'(msg) {
    await removeSite(msg.host);
    return { ok: true };
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'f1ko-open-options') { chrome.runtime.openOptionsPage(); return false; }
  if (msg?.type === 'f1ko-off') {
    // offscreen 의 받아 적은 글 · 상태 → 그 탭으로
    tellTab(msg.tabId, { kind: msg.kind, text: msg.text, final: msg.final, reason: msg.reason, error: msg.error });
    if (msg.kind === 'stopped') {
      chrome.storage.session.remove('listen').then(() => setListenBadge(msg.tabId, false)).then(closeOffscreenIfIdle);
    }
    return false;
  }
  const h = handlers[msg?.type];
  if (!h) return false;
  h(msg, sender)
    .then(sendResponse)
    .catch(e => sendResponse({ ok: false, code: e.code || 'API_ERROR', error: e.message }));
  return true; // 비동기 응답
});

// 「이 사이트에서 켜기」로 더한 사이트: 크롬은 확장이 업데이트되면 등록한 콘텐츠 스크립트를 지운다 (2026-11-12 시험).
// 목록(customSites) · 권한은 남으므로 업데이트 · 크롬 시작 때 권한이 있는 사이트를 다시 등록한다
async function restoreSites() {
  const cfg = normalize(await chrome.storage.sync.get(null));
  for (const host of cfg.customSites) {
    const ok = await chrome.permissions.contains({ origins: [`https://${host}/*`, `http://${host}/*`] }).catch(() => false);
    if (!ok) continue; // 권한이 없으면 팝업이 「이 사이트에서 켜기」를 다시 보여 준다
    const id = scriptId(host);
    if ((await chrome.scripting.getRegisteredContentScripts({ ids: [id] })).length) continue;
    await chrome.scripting.registerContentScripts([{
      id, matches: [`https://${host}/*`, `http://${host}/*`], js: ['content.js'], css: ['overlay.css'], allFrames: true, runAt: 'document_idle', persistAcrossSessions: true
    }]).catch(() => {});
  }
}
chrome.runtime.onStartup.addListener(() => { restoreSites(); });

// 처음 설치하면 상세 설정(API 키 넣기)부터
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
  restoreSites();
});

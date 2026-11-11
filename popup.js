import { normalize, GEMINI_LIMITS, pickEngine, hasKey } from './lib/settings.js';
import { modelState, downloadModel, MODEL_TEXT } from './lib/translator.js';
import { BUILTIN_SITES, siteFor, originPattern } from './lib/sites.js';
import { packName } from './lib/glossary.js';
import { dayKey, costUsd, ptDayKey } from './lib/cost.js';
import { checkSupport, reasonText, captureReason, chromeVersion, LISTEN_LANGS } from './lib/listen.js';

const $ = id => document.getElementById(id);
let cfg = normalize({});
let tab = null;
let last = null;            // 지금 탭의 상태 (영상 프레임이 대답)
let keys = { claude: false, gemini: false };
let model = 'available';

const TOGGLES = ['showPrev', 'showEn', 'hideOriginal'];
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = v => (v || 0).toLocaleString('ko-KR');

function render() {
  for (const id of TOGGLES) $(id).checked = cfg[id];
  $('chromeFallback').checked = cfg.chromeFallback;
  $('hideHint').textContent = cfg.hideOriginal ? '읽기는 계속하고 화면에서만 숨겨요' : '사이트 자막과 겹치지 않게 ‘맨 아래에서 띄우기’를 올려 주세요';
  $('bottomPct').value = cfg.bottomPct;
  $('bottomVal').textContent = `${cfg.bottomPct}%`;
  $('fontScale').value = cfg.fontScale;
  $('fontVal').textContent = `${cfg.fontScale}%`;
  renderSites();
}

async function save(patch) {
  cfg = normalize({ ...cfg, ...patch });
  render();
  await chrome.storage.sync.set(patch);
}

// ===== 적용 사이트 =====
function renderSites() {
  const here = tab?.url ? siteFor(new URL(tab.url).hostname, cfg.customSites) : null;
  const all = [...BUILTIN_SITES, ...cfg.customSites.map(h => ({ id: h, name: h }))];
  $('sites').innerHTML = all.map(s => `<label class="${here?.id === s.id ? 'here' : ''}"><span>${esc(s.name)}${here?.id === s.id ? ' <span class="muted">· 지금 탭</span>' : ''}</span><input type="checkbox" data-site="${esc(s.id)}" ${cfg.siteOn[s.id] === false ? '' : 'checked'} aria-label="${esc(s.name)} 에 적용"></label>`).join('');
  $('siteCount').textContent = `${all.length}곳 · 상세 설정에서 관리`;
  const canAdd = !here && tab?.url && originPattern(tab.url);
  $('addSite').hidden = $('addHint').hidden = !canAdd;
}

$('sites').addEventListener('change', e => {
  const id = e.target.dataset.site;
  if (id) save({ siteOn: { ...cfg.siteOn, [id]: e.target.checked } });
});

$('addSite').addEventListener('click', async () => {
  const o = originPattern(tab.url);
  if (!o) return;
  const patterns = [o.pattern.replace(/^http:/, 'https:'), o.pattern.replace(/^https:/, 'http:')];
  const granted = await chrome.permissions.request({ origins: patterns }).catch(() => false);
  if (!granted) { $('addHint').textContent = '권한을 허락해야 이 사이트에서 쓸 수 있어요.'; return; }
  await chrome.runtime.sendMessage({ type: 'f1ko-site-add', host: o.host, tabId: tab.id });
  cfg = normalize(await chrome.storage.sync.get(null));
  render();
  $('where').textContent = `${o.host} 에서 켰어요 · 영상 위 KO 버튼을 확인해 주세요`;
});

// ===== 번역 엔진 (이 탭에만). 키가 없는 엔진은 고를 수 없다 =====
function renderEngine() {
  const mode = last?.mode || 'live';
  const auto = pickEngine(mode, keys);
  const using = pickEngine(mode, keys, last?.override);
  // Flash Lite 는 자막 전체를 받은 영상(일반 영상)에서만 — 라이브 탭에서는 고를 수 없게
  const liveTab = !!last && mode !== 'vod';
  for (const b of $('engine').querySelectorAll('button')) {
    const v = b.dataset.v, ok = hasKey(v, keys), vodOnly = v === 'lite' && liveTab;
    b.disabled = !ok || vodOnly;
    b.classList.toggle('on', ok && v === using);
    b.classList.toggle('model', v === 'chrome' && model !== 'available');
    b.querySelector('small').textContent = !ok ? '키 없음' : vodOnly ? '일반 영상만' : v === 'chrome' && model !== 'available' ? '모델 받기 전' : v === auto ? '자동' : '';
    b.title = !ok ? '상세 설정에서 키를 넣어야 고를 수 있어요'
      : vodOnly ? '자막 전체를 미리 받는 일반 영상에서만 써요. 라이브는 한 줄씩 번역해야 해서 Claude·크롬 내장으로 번역해요 (YouTube 는 자막(CC)을 켜면 일반 영상으로 잡혀요)'
        : v === 'lite' ? '자막 전체를 받을 수 있는 영상에서만 써요' : '';
  }
  $('keyHint').hidden = keys.claude && keys.gemini;
  $('engineReset').hidden = !last?.override;
}

async function setOverride(engine) {
  if (!tab) return;
  try { await chrome.tabs.sendMessage(tab.id, { type: 'f1ko-engine', engine }); } catch { /* 영상 탭이 아님 */ }
  refreshStatus();
}
$('engine').addEventListener('click', e => {
  const v = e.target.closest('button')?.dataset.v;
  if (v) setOverride(v);
});
$('engineReset').addEventListener('click', () => setOverride(null));
$('keyLink').addEventListener('click', e => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
$('chromeFallback').addEventListener('change', e => save({ chromeFallback: e.target.checked }));

// ===== 크롬 번역 모델 =====
let modelSrc = 'en';
async function refreshModel() {
  model = await modelState('en');
  modelSrc = 'en';
  // 음성 번역 원문이 일본어면 일본어 → 한국어 모델도 (영어 모델이 있어도)
  if (cfg.listenLang === 'ja' && model === 'available') {
    const ja = await modelState('ja');
    if (ja !== 'available') { model = ja; modelSrc = 'ja'; }
  }
  $('modelWarn').hidden = model === 'available';
  $('modelText').textContent = (modelSrc === 'ja' && model !== 'unsupported' ? '일본어 → 한국어 · ' : '') + (MODEL_TEXT[model] || '');
  $('modelDl').hidden = !['downloadable', 'downloading'].includes(model);
  renderEngine();
}
$('modelDl').addEventListener('click', async () => {
  $('modelDl').disabled = true;
  $('modelText').textContent = '내려받기 시작… 끝날 때까지 팝업을 열어 두세요';
  try {
    await downloadModel(p => { $('modelText').textContent = `번역 모델 내려받는 중 ${Math.round(p * 100)}%`; }, modelSrc);
  } catch (e) {
    $('modelText').textContent = `내려받기 실패: ${e.message}`;
  } finally {
    $('modelDl').disabled = false;
    refreshModel();
  }
});

for (const id of TOGGLES) $(id).addEventListener('change', e => save({ [id]: e.target.checked }));
$('bottomPct').addEventListener('input', e => save({ bottomPct: Number(e.target.value) }));
$('fontScale').addEventListener('input', e => save({ fontScale: Number(e.target.value) }));
$('enabled').addEventListener('change', e => chrome.storage.local.set({ enabled: e.target.checked }));
$('openOptions').addEventListener('click', e => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

// ===== 지금 탭의 상태 =====
async function refreshStatus() {
  let st = null;
  if (tab?.id != null) {
    try { st = await chrome.tabs.sendMessage(tab.id, { type: 'f1ko-status' }); } catch { st = null; }
  }
  last = st;
  renderEngine();
  const dotSrc = $('dotSrc'), dotEng = $('dotEng'), dotGl = $('dotGl');
  if (!st) {
    $('where').textContent = $('addSite').hidden ? '영상이 있는 탭에서 열어 주세요' : '이 사이트는 아직 목록에 없어요';
    dotSrc.className = 'dot'; $('srcText').textContent = '영상이 있는 적용 사이트 탭이 아니에요';
    dotEng.className = 'dot'; $('engText').textContent = `자동: 라이브 ${engineLabel(pickEngine('live', keys))} · 일반 영상 ${engineLabel(pickEngine('vod', keys))}`;
    dotGl.className = 'dot'; $('glText').textContent = '용어집: 사이트·제목을 보고 골라요';
    return;
  }
  const kind = st.mode === 'vod' ? '일반 영상' : '라이브';
  $('where').textContent = !st.siteOn ? `${st.site} — 이 사이트는 꺼 두었어요` : `지금 탭: ${st.site} ${kind}${st.enabled ? '' : ' · 꺼짐'}`;
  if (st.koHuman) { dotSrc.className = 'dot ok'; $('srcText').innerHTML = '<b>사람이 만든 한국어 자막</b> · 번역 안 함'; }
  else if (st.skipAsr) { dotSrc.className = 'dot warn'; $('srcText').innerHTML = '<b>자동 생성 자막</b> · 번역하지 않게 해 둠'; }
  else if (!st.enabled) { dotSrc.className = 'dot'; $('srcText').textContent = '켜면 영어 자막을 찾아요'; }
  else if (st.found) { dotSrc.className = 'dot ok'; $('srcText').innerHTML = `<b>영어 자막 감지됨</b> · ${esc(st.source)}`; }
  else { dotSrc.className = 'dot err'; $('srcText').innerHTML = '<b>영어 자막 못 찾음</b> · CC 에서 영어를 켜 주세요'; }

  if (st.block) { dotEng.className = 'dot warn'; $('engText').innerHTML = `<b>${esc(st.engineName || '자막 멈춤')}</b> · ${esc(st.block.split(' — ')[0])}`; }
  else if (st.vod && st.engine === 'lite') {
    dotEng.className = st.vod.finished ? 'dot ok' : 'dot warn';
    $('engText').innerHTML = `<b>Gemini 3.5 Flash Lite</b> · ${st.vod.finished ? '미리 번역 완료' : `미리 번역 중 ${n(st.vod.done)}/${n(st.vod.n)}줄`}`;
  } else {
    dotEng.className = st.engine ? 'dot ok' : 'dot';
    $('engText').innerHTML = `<b>${esc(st.engineName || '—')}</b>${st.avgMs && st.engine !== 'chrome' ? ` · 평균 ${(st.avgMs / 1000).toFixed(1)}초` : ''}${st.fails ? ` · 실패 ${st.fails}` : ''}`;
  }
  const extra = st.packs.filter(p => p !== 'common');
  dotGl.className = 'dot';
  $('glText').innerHTML = `용어집: ${esc(st.packs.map(packName).join(' · '))}${extra.length ? '' : ' <span class="muted">(제목·사이트로 고를 묶음 없음)</span>'}`;
}

// ===== 음성 번역 (1.0): 쓸 수 없으면 단추를 회색으로 두고 이유 · 해결을 단추 아래에 늘 보인다 =====
const SR = self.SpeechRecognition || self.webkitSpeechRecognition;
const listen = { reason: '', listening: false, installing: false, failed: false, busy: false };

/** 크롬 자체 페이지 · 웹 스토어는 탭 소리를 넘겨주지 않는다 */
function pageReason() {
  const url = tab?.url || '';
  return !/^https?:/.test(url) || /chromewebstore\.google\.com|chrome\.google\.com\/webstore/.test(url) ? 'page' : null;
}

async function refreshListen() {
  const st = tab?.id != null ? await chrome.runtime.sendMessage({ type: 'f1ko-listen-state', tabId: tab.id }).catch(() => null) : null;
  listen.listening = !!st?.listening;
  let reason;
  if (cfg.listenWhen === 'off') reason = 'off';
  else if (listen.installing) reason = 'downloading';
  else {
    reason = (await checkSupport(SR, cfg.listenLang)).reason;
    if (reason === 'ok') reason = pageReason() || 'ok';
    if (reason === 'no-pack' && listen.failed) reason = 'pack-failed';
  }
  if (!listen.busy || reason !== 'ok') listen.reason = listen.sticky || reason;
  renderListen();
}

function renderListen() {
  const lang = cfg.listenLang;
  for (const b of $('listenLang').querySelectorAll('button')) {
    b.classList.toggle('on', b.dataset.v === lang);
    b.disabled = listen.listening;
  }
  const btn = $('listenBtn'), note = $('listenNote');
  if (listen.listening) {
    btn.innerHTML = '음성 번역 멈추기 <small>⌥L</small>';
    btn.className = 'primary stop';
    btn.disabled = false;
    $('packBtn').hidden = true;
    note.className = 'listen-note ok';
    $('listenTitle').textContent = `음성 번역 중 · 크롬 내장 음성 인식 (맥 안) · ${LISTEN_LANGS[lang].name} → 한국어`;
    $('listenFix').textContent = '크롬 탭에 「공유 중」 표시가 떠요. 소리는 그대로 들려요.';
    return;
  }
  const r = listen.reason || 'unknown';
  const t = reasonText(r, lang, chromeVersion(navigator.userAgent));
  btn.innerHTML = '음성 번역 시작 <small>⌥L</small>';
  btn.className = 'primary';
  btn.disabled = r !== 'ok' || listen.busy;
  $('packBtn').hidden = !t.action;
  $('packBtn').textContent = r === 'pack-failed' ? '다시 받기' : '언어 팩 받기';
  $('packBtn').disabled = listen.installing;
  note.className = `listen-note ${r === 'ok' ? 'ok' : ['no-pack', 'downloading', 'off'].includes(r) ? 'warn' : 'err'}`;
  $('listenTitle').textContent = r === 'ok' ? `✓ ${t.title}` : t.title;
  $('listenFix').textContent = r === 'ok' ? '탭 소리를 맥 안에서 받아 적어 한국어로 번역해요. 소리는 맥 밖으로 나가지 않아요.' : t.fix;
}

$('listenLang').addEventListener('click', e => {
  const v = e.target.closest('button')?.dataset.v;
  if (!v || listen.listening || v === cfg.listenLang) return;
  listen.failed = false; listen.sticky = '';
  save({ listenLang: v }).then(() => { refreshListen(); refreshModel(); });
});

$('listenBtn').addEventListener('click', async () => {
  if (!tab) return;
  listen.sticky = '';
  if (listen.listening) {
    await chrome.runtime.sendMessage({ type: 'f1ko-listen-stop', tabId: tab.id }).catch(() => {});
    refreshListen();
    return;
  }
  listen.busy = true; renderListen();
  let streamId;
  try {
    // 팝업의 클릭 안에서 바로 (크롬은 사용자가 확장을 누른 뒤에만 탭 소리를 넘겨준다)
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  } catch (e) {
    listen.busy = false; listen.sticky = captureReason(e.message); listen.reason = listen.sticky; renderListen();
    return;
  }
  const r = await chrome.runtime.sendMessage({ type: 'f1ko-listen-start', tabId: tab.id, streamId, lang: cfg.listenLang }).catch(e => ({ ok: false, reason: 'unknown', error: e.message }));
  listen.busy = false;
  if (!r?.ok) { listen.sticky = r?.reason || 'unknown'; listen.reason = listen.sticky; renderListen(); return; }
  refreshListen();
});

$('packBtn').addEventListener('click', async () => {
  const code = LISTEN_LANGS[cfg.listenLang].code;
  listen.installing = true; listen.failed = false; listen.sticky = '';
  refreshListen();
  try {
    // 언어 팩 받기도 사용자가 누를 때만 된다 (이 확장용으로 따로)
    listen.failed = !(await SR.install({ langs: [code], processLocally: true }));
  } catch {
    listen.failed = true;
  }
  listen.installing = false;
  refreshListen();
});

function engineLabel(e) {
  return { claude: 'Claude', chrome: '크롬 내장', lite: 'Flash Lite' }[e] || e;
}

async function refreshUsage() {
  const { usage = {}, gemini = {} } = await chrome.storage.local.get(['usage', 'gemini']);
  const d = usage.days?.[dayKey()] || {};
  const g = gemini[ptDayKey()] || {};
  const cost = costUsd(d, cfg.priceIn, cfg.priceOut);
  const cap = cfg.dailyCapUsd;
  $('claudeText').textContent = !keys.claude ? '키 없음' : `약 $${cost.toFixed(cost < 1 ? 3 : 2)} / ${cap > 0 ? `상한 $${cap.toFixed(2)}` : '상한 없음'}`;
  const pct = cap > 0 ? Math.min(100, (cost / cap) * 100) : 0;
  $('claudeBar').style.width = `${pct}%`;
  $('claudeBar').className = pct >= 100 ? 'err' : pct >= 80 ? 'warn' : 'claude';
  const rpd = GEMINI_LIMITS.lite.rpd;
  $('liteText').textContent = !keys.gemini ? '키 없음' : `${n(g.lite)} / ${n(rpd)}회 · 무료`;
  const lp = Math.min(100, ((g.lite || 0) / rpd) * 100);
  $('liteBar').style.width = `${lp}%`;
  $('liteBar').className = lp >= 100 ? 'err' : lp >= 80 ? 'warn' : 'lite';
  $('otherText').textContent = `크롬 내장 ${n(d.chrome)}회`;
}

$('diag').addEventListener('click', async () => {
  if (!tab) return;
  try {
    const d = await chrome.tabs.sendMessage(tab.id, { type: 'f1ko-diagnose' });
    await navigator.clipboard.writeText(JSON.stringify(d, null, 2));
    $('diag').textContent = '복사됨 ✓';
  } catch {
    $('diag').textContent = '영상 탭이 아니에요';
  }
  setTimeout(() => ($('diag').textContent = '진단 복사'), 2000);
});

$('pick').addEventListener('click', async () => {
  if (!tab) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'f1ko-pick' });
    window.close();
  } catch {
    $('pick').textContent = '영상 탭이 아니에요';
    setTimeout(() => ($('pick').textContent = '자막 직접 고르기'), 2000);
  }
});

(async () => {
  cfg = normalize(await chrome.storage.sync.get(null));
  const { enabled = false } = await chrome.storage.local.get('enabled');
  $('enabled').checked = enabled;
  $('ver').textContent = `v${chrome.runtime.getManifest().version} · macOS 전용`;
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  render();
  try { const k = await chrome.runtime.sendMessage({ type: 'f1ko-keys' }); if (k?.ok) keys = { claude: k.claude, gemini: k.gemini }; } catch { /* 그대로 */ }
  refreshModel();
  refreshStatus();
  refreshUsage();
  refreshListen();
  setInterval(() => { refreshStatus(); refreshListen(); }, 1500);
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && (ch.usage || ch.gemini)) refreshUsage();
    if (area === 'sync') chrome.storage.sync.get(null).then(v => { cfg = normalize(v); render(); renderEngine(); refreshListen(); });
    if (area === 'local' && (ch.apiKey || ch.geminiKey)) chrome.runtime.sendMessage({ type: 'f1ko-keys' }).then(k => { if (k?.ok) { keys = { claude: k.claude, gemini: k.gemini }; renderEngine(); } }).catch(() => {});
    if (area === 'local' && ch.enabled) { $('enabled').checked = !!ch.enabled.newValue; refreshStatus(); }
  });
})();

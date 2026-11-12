import { SYNC_DEFAULTS, normalize, MODELS, GEMINI_LIMITS, GEMINI_DEFAULTS } from './lib/settings.js';
import { PACKS, DEFAULT_GLOSSARY, sanitizeGlossary, cloneGlossary, cleanEntry, packName } from './lib/glossary.js';
import { exportPacks, toJSON, toCSV, parseImport, previewImport, applyImport, exportFileName, KIND_NAMES } from './lib/glossary-io.js';
import { BUILTIN_SITES, hostFromInput } from './lib/sites.js';
import { dayKey, costUsd, cacheHitRate, sumDays, ptDayKey, liteRemaining, shortWhen } from './lib/cost.js';
import { modelState, downloadModel, MODEL_TEXT } from './lib/translator.js';
import { checkSupport, reasonText, chromeVersion, LISTEN_LANGS, LISTEN_LANG_IDS } from './lib/listen.js';

const $ = id => document.getElementById(id);
let cfg = normalize({});
let glossary = cloneGlossary(DEFAULT_GLOSSARY);
let models = MODELS;
let glPack = 'cloud';
let glGroup = '';
let pending = null;      // 가져오기 미리보기 중인 파일
let lastTest = {};       // 엔진별 마지막 연결 테스트 { claude: {ok, at, model, ms, html}, lite: {...} } — 저장·새로 열어도 남음

const TEST_TEXT = 'Box box, box box. Verstappen pits from the lead and Norris will inherit P1 under the virtual safety car.';
const WHY = {
  NO_KEY: 'API 키를 먼저 넣어 주세요.',
  BAD_KEY: 'API 키가 잘못됐어요.',
  NO_CREDIT: '크레딧이 없어요. Console 의 Billing 에서 확인해 주세요.',
  BAD_MODEL: '이 모델을 쓸 수 없어요.',
  RATE_LIMIT: '요청이 많거나 서버가 붐벼요. 잠시 뒤 다시 해 보세요.',
  DAILY: '오늘 무료 한도를 다 썼어요. 태평양 시간 자정(한국 오후 4~5시)에 다시 채워져요.',
  TIMEOUT: '응답이 너무 늦어요.',
  NETWORK: '네트워크 오류.',
  API_ERROR: 'API 오류.'
};

const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = v => (v || 0).toLocaleString('ko-KR');

function setStatus(id, html, kind = '') {
  $(id).innerHTML = html;
  $(id).className = 'status ' + kind;
}

async function load() {
  cfg = normalize(await chrome.storage.sync.get(null));
  const local = await chrome.storage.local.get(['apiKey', 'geminiKey', 'glossary', 'claudeModels', 'geminiModels', 'glossaryUndo', 'lastTest']);
  lastTest = local.lastTest || {};
  glossary = local.glossary ? sanitizeGlossary(local.glossary) : cloneGlossary(DEFAULT_GLOSSARY);
  models = Array.isArray(local.claudeModels) && local.claudeModels.length ? local.claudeModels : MODELS;
  $('apiKey').value = local.apiKey || '';
  $('geminiKey').value = local.geminiKey || '';
  $('liteId').textContent = local.geminiModels?.lite || GEMINI_DEFAULTS.lite;
  $('glUndo').hidden = !local.glossaryUndo;
  const v = `v${chrome.runtime.getManifest().version}`;
  $('verBadge').textContent = v;
  $('ver').textContent = v.slice(1);
  renderModels();
  renderForm();
  renderKeys(!!local.apiKey, !!local.geminiKey);
  renderTests();
  refreshModel();
  refreshListen();
  renderSites();
  renderGlossary();
  renderUsage();
}

function renderModels() {
  $('model').innerHTML = models.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
  $('model').value = models.some(m => m.id === cfg.model) ? cfg.model : models[0]?.id || SYNC_DEFAULTS.model;
}

function renderForm() {
  $('ytGlossary').value = cfg.ytGlossary;
  $('listenWhen').value = cfg.listenWhen;
  $('listenHints').checked = cfg.listenHints;
  for (const id of ['chromeFallback', 'ytAsr', 'ytPreferKo', 'filmTone', 'filmNames', 'filmShort']) $(id).checked = cfg[id];
  $('cap').value = cfg.dailyCapUsd;
  $('priceIn').value = cfg.priceIn;
  $('priceOut').value = cfg.priceOut;
}

async function saveSync(patch) {
  cfg = normalize({ ...cfg, ...patch });
  await chrome.storage.sync.set(patch);
}

$('ytGlossary').addEventListener('change', e => saveSync({ ytGlossary: e.target.value }));
for (const id of ['chromeFallback', 'ytAsr', 'ytPreferKo', 'filmTone', 'filmNames', 'filmShort']) $(id).addEventListener('change', e => saveSync({ [id]: e.target.checked }));
for (const id of ['cap', 'priceIn', 'priceOut']) {
  $(id).addEventListener('change', () => saveSync({ dailyCapUsd: $('cap').value, priceIn: $('priceIn').value, priceOut: $('priceOut').value }).then(renderUsage));
}

// ===== 엔진 카드: 키 상태 =====
let keyState = { claude: false, gemini: false };
function renderKeys(claude = keyState.claude, gemini = keyState.gemini) {
  keyState = { claude, gemini };
  const set = (id, kind, text) => { $(id).className = `kst ${kind}`; $(id).innerHTML = `<span class="dot"></span>${text}`; };
  const t = e => (lastTest[e] ? ` · 테스트 ${lastTest[e].ok ? '✓' : '✗'} ${shortWhen(lastTest[e].at)}` : '');
  set('kClaude', claude ? (lastTest.claude && !lastTest.claude.ok ? 'warn' : 'ok') : '', claude ? `키 있음${t('claude')} · 라이브에 써요` : '키 없음 · 아래 Claude API 에서 넣어 주세요');
  set('kLite', gemini ? (lastTest.lite && !lastTest.lite.ok ? 'warn' : 'ok') : '', gemini ? `키 있음${t('lite')} · 일반 영상에 써요` : '키 없음 · 아래 Gemini API 에서 넣어 주세요');
}

// ===== 마지막 연결 테스트 (저장하거나 페이지를 다시 열어도 남는다) =====
function renderTests() {
  const box = (id, e) => {
    const r = lastTest[e];
    if (!r) { setStatus(id, '', ''); return; }
    setStatus(id, `<span class="when">마지막 연결 테스트 · ${shortWhen(r.at)} · ${esc(r.model || '')}</span>${r.html}`, r.ok ? 'ok' : 'err');
  };
  box('status', 'claude');
  box('gStatus', 'lite');
  const r = lastTest.lite;
  $('liteTest').textContent = !r ? '—' : r.ok ? `✓ ${(r.ms / 1000).toFixed(2)}초 · ${shortWhen(r.at).replace('오늘 ', '')}` : `✗ ${r.code === 'TIMEOUT' ? '45초 넘게 답이 없음' : WHY[r.code] || r.code || '실패'}`;
  $('liteTest').style.color = !r ? '' : r.ok ? 'var(--ok)' : 'var(--err)';
  renderKeys();
}

async function keepTest(engine, result) {
  lastTest = { ...lastTest, [engine]: { ...result, at: Date.now() } };
  await chrome.storage.local.set({ lastTest });
  renderTests();
}

function saveNote(id, text, err = false) {
  $(id).textContent = text;
  $(id).className = `savemsg${err ? ' err' : ''}`;
  clearTimeout(saveNote[id]);
  if (!err) saveNote[id] = setTimeout(() => ($(id).textContent = ''), 4000);
}

// ===== 크롬 번역 모델 =====
async function refreshModel() {
  const st = await modelState();
  const kind = st === 'available' ? 'ok' : ['downloadable', 'downloading'].includes(st) ? 'warn' : 'err';
  $('modelDot').className = `dot ${kind}`;
  $('modelText').innerHTML = st === 'available' ? '<b>받음 ✓</b> · 인터넷 없이도 번역해요' : `<b>${MODEL_TEXT[st]}</b>`;
  $('modelDl').hidden = $('modelHint').hidden = !['downloadable', 'downloading'].includes(st);
  $('kChrome').className = `kst ${kind === 'err' ? '' : kind}`;
  $('kChrome').innerHTML = `<span class="dot"></span>${st === 'available' ? '모델 받음 · 대신 번역에 써요' : st === 'unsupported' || st === 'unavailable' ? MODEL_TEXT[st] : '번역 모델을 아직 받지 않았어요 · 아래에서 받아 주세요'}`;
  // 음성 번역 원문이 일본어면 일본어 → 한국어 모델도
  const ja = cfg.listenLang === 'ja' ? await modelState('ja') : 'available';
  $('jaModelRow').hidden = ja === 'available';
  $('jaModelText').textContent = `일본어 → 한국어 (음성 번역 원문이 일본어일 때) · ${MODEL_TEXT[ja] || ''}`;
  $('jaModelDl').hidden = !['downloadable', 'downloading'].includes(ja);
}

$('jaModelDl').addEventListener('click', async () => {
  $('jaModelDl').disabled = true;
  try {
    await downloadModel(p => { $('jaModelText').textContent = `일본어 → 한국어 모델 내려받는 중 ${Math.round(p * 100)}%`; }, 'ja');
  } catch (e) {
    $('jaModelText').textContent = `내려받기 실패 · ${e.message}`;
  } finally {
    $('jaModelDl').disabled = false;
    setTimeout(refreshModel, 600);
  }
});

$('modelDl').addEventListener('click', async () => {
  $('modelDl').disabled = true;
  $('modelProg').hidden = false;
  $('modelText').innerHTML = '<b>내려받기 시작…</b> · 크롬이 준비하는 동안 0% 에서 잠깐 멈출 수 있어요';
  try {
    await downloadModel(p => {
      $('modelBar').style.width = `${Math.round(p * 100)}%`;
      $('modelText').innerHTML = `<b>번역 모델 내려받는 중 ${Math.round(p * 100)}%</b>`;
    });
  } catch (e) {
    $('modelText').innerHTML = `<b>내려받기 실패</b> · ${esc(e.message)}`;
  } finally {
    $('modelDl').disabled = false;
    setTimeout(() => { $('modelProg').hidden = true; refreshModel(); }, 600);
  }
});

// ===== 음성 번역 (1.0) =====
const SR = self.SpeechRecognition || self.webkitSpeechRecognition;
const packJob = {}; // 언어별 { installing, failed }

async function refreshListen() {
  const ver = chromeVersion(navigator.userAgent);
  const rows = [];
  const api = !!SR && typeof SR.available === 'function' && typeof SR.install === 'function';
  rows.push(`<div><span class="dot ${api ? 'ok' : 'err'}"></span><span class="name">크롬 음성 인식 기능</span><span class="what">${api ? `있음 · Chrome ${ver || '?'}` : esc(reasonText('no-api', 'en', ver).title)}</span>${api ? '' : `<span class="hint fix">${esc(reasonText('no-api', 'en', ver).fix)}</span>`}</div>`);
  for (const lang of LISTEN_LANG_IDS) {
    const L = LISTEN_LANGS[lang];
    let reason = (await checkSupport(SR, lang)).reason;
    if (packJob[lang]?.installing) reason = 'downloading';
    else if (reason === 'no-pack' && packJob[lang]?.failed) reason = 'pack-failed';
    const t = reasonText(reason, lang, ver);
    const kind = reason === 'ok' ? 'ok' : ['no-pack', 'downloading'].includes(reason) ? 'warn' : 'err';
    const state = reason === 'ok' ? '맥 안 처리 · 언어 팩 있음' : t.title;
    const btn = t.action ? `<button type="button" class="blue" data-pack="${lang}">${reason === 'pack-failed' ? '다시 받기' : '언어 팩 받기'}</button>` : '';
    const pick = `<label class="hint"><input type="radio" name="listenLang" value="${lang}" ${cfg.listenLang === lang ? 'checked' : ''}> 원문 언어</label>`;
    rows.push(`<div><span class="dot ${kind}"></span><span class="name">${L.name} (${L.code})</span><span class="what">${esc(state)}</span>${btn}${pick}${reason === 'ok' ? '' : `<span class="hint fix">${esc(t.fix)}</span>`}</div>`);
  }
  if (cfg.listenWhen === 'off') rows.push(`<div><span class="dot warn"></span><span class="what">${esc(reasonText('off').title)} — 팝업의 「음성 번역 시작」이 회색이 돼요</span></div>`);
  $('listenCheck').innerHTML = rows.join('');
}

$('listenCheck').addEventListener('click', async e => {
  const lang = e.target.closest('button')?.dataset.pack;
  if (!lang) return;
  packJob[lang] = { installing: true, failed: false };
  refreshListen();
  try {
    // 크롬은 사용자가 누를 때만 언어 팩을 받게 해 준다 (이 확장용으로 따로)
    packJob[lang].failed = !(await SR.install({ langs: [LISTEN_LANGS[lang].code], processLocally: true }));
  } catch {
    packJob[lang].failed = true;
  }
  packJob[lang].installing = false;
  refreshListen();
});
$('listenCheck').addEventListener('change', e => {
  if (e.target.name === 'listenLang') saveSync({ listenLang: e.target.value }).then(() => { refreshListen(); refreshModel(); });
});
$('listenRecheck').addEventListener('click', refreshListen);
$('listenWhen').addEventListener('change', e => saveSync({ listenWhen: e.target.value }).then(refreshListen));
$('listenHints').addEventListener('change', e => saveSync({ listenHints: e.target.checked }));

// ===== Claude =====
async function saveClaude() {
  const apiKey = $('apiKey').value.trim();
  if (apiKey && !apiKey.startsWith('sk-ant-')) { saveNote('saveMsg', '키 모양이 이상해요. sk-ant- 로 시작하는지 확인해 주세요.', true); return; }
  await saveSync({ model: $('model').value });
  await chrome.storage.local.set({ apiKey });
  saveNote('saveMsg', apiKey ? '✓ 저장됨 · 열려 있는 탭에도 바로 적용돼요' : '✓ 저장됨 · Claude 키가 없으면 다른 엔진만 써요');
}

async function testClaude() {
  const apiKey = $('apiKey').value.trim();
  if (!apiKey) { saveNote('saveMsg', WHY.NO_KEY, true); return; }
  $('test').disabled = true;
  setStatus('status', '테스트 중… (모델 목록도 새로 받는 중)', 'info');
  try {
    const res = await chrome.runtime.sendMessage({ type: 'f1ko-test', apiKey, model: $('model').value, text: TEST_TEXT });
    if (res?.ok) {
      let modelLine = '';
      if (res.models) {
        const before = models.map(m => m.id).join();
        models = res.models;
        const changed = before !== models.map(m => m.id).join();
        const picked = models.find(m => m.id === res.model);
        cfg.model = res.model;
        renderModels();
        await saveSync({ model: res.model, ...(picked ? { priceIn: picked.priceIn, priceOut: picked.priceOut } : {}) });
        renderForm();
        modelLine = `\n✓ 모델 목록 새로고침: ${models.map(m => `<b>${esc(m.name.split(' · ')[0])}</b> (${esc(m.id)})`).join(' · ')} · ${changed ? '바뀐 것 반영' : '바뀐 것 없음'}`;
      } else if (res.modelsError) {
        modelLine = `\n모델 목록은 못 받았어요 (${esc(res.modelsError)}) — 지금 목록 그대로`;
      }
      const cache = res.cacheRead ? '캐시 적중' : res.cacheWrite ? '캐시 저장 (다음부터 적중)' : '캐시 안 걸림 — 지시문이 짧을 수 있음';
      await keepTest('claude', { ok: true, ms: res.ms, model: res.model, html: `✓ 연결 성공 · ${(res.ms / 1000).toFixed(2)}초 · ${cache}${modelLine}\n<span class="tr">“${esc(res.text)}”</span>` });
    } else {
      await keepTest('claude', { ok: false, code: res?.code, model: $('model').value, html: `✗ 실패: ${WHY[res?.code] || ''}\n${esc(res?.error || '')}` });
    }
  } catch (e) {
    await keepTest('claude', { ok: false, model: $('model').value, html: '✗ 실패: ' + esc(e.message) });
  } finally {
    $('test').disabled = false;
    renderUsage();
  }
}

$('save').addEventListener('click', saveClaude);
$('test').addEventListener('click', testClaude);
$('model').addEventListener('change', () => {
  const m = models.find(x => x.id === $('model').value);
  if (m) { $('priceIn').value = m.priceIn; $('priceOut').value = m.priceOut; saveSync({ priceIn: m.priceIn, priceOut: m.priceOut }); }
  saveNote('saveMsg', '저장을 눌러야 모델이 바뀌어요.');
});
const toggleShow = (inputId, btnId) => () => {
  const el = $(inputId);
  el.type = el.type === 'password' ? 'text' : 'password';
  $(btnId).textContent = el.type === 'password' ? '보기' : '숨기기';
};
$('showKey').addEventListener('click', toggleShow('apiKey', 'showKey'));
$('showGKey').addEventListener('click', toggleShow('geminiKey', 'showGKey'));

// ===== Gemini =====
async function saveGemini() {
  const key = $('geminiKey').value.trim();
  // 키 형식은 바뀔 수 있어 모양으로 막지 않는다 (맞는지는 연결 테스트로). 붙여 넣다 섞인 빈칸만 막음
  if (/\s/.test(key)) { saveNote('gSaveMsg', '키 중간에 빈칸이 있어요. 다시 붙여 넣어 주세요.', true); return; }
  await chrome.storage.local.set({ geminiKey: key });
  saveNote('gSaveMsg', key ? '✓ 저장됨 · 열려 있는 탭에도 바로 적용돼요' : '✓ 저장됨 · 키가 없으면 일반 영상은 Claude 또는 크롬 내장으로 번역해요');
}

async function testGemini() {
  const key = $('geminiKey').value.trim();
  if (!key) { saveNote('gSaveMsg', WHY.NO_KEY, true); return; }
  $('gTest').disabled = true;
  $('liteTest').textContent = '테스트 중…';
  $('liteTest').style.color = '';
  try {
    const res = await chrome.runtime.sendMessage({ type: 'f1ko-gemini-test', key, text: TEST_TEXT });
    if (!res?.ok) {
      await keepTest('lite', { ok: false, code: res?.code, model: $('liteId').textContent, html: `✗ 실패: ${WHY[res?.code] || ''}\n${esc(res?.error || '')}` });
      return;
    }
    $('liteId').textContent = res.models.lite + (res.models.foundLite ? '' : ' (목록에 없음)');
    const r = res.lite;
    await keepTest('lite', r.ok
      ? { ok: true, ms: r.ms, model: res.models.lite, html: `✓ 3.5 Flash Lite 번역 결과 · ${(r.ms / 1000).toFixed(2)}초\n<span class="tr">“${esc(r.text)}”</span>` }
      : { ok: false, code: r.code, model: res.models.lite, html: `✗ 3.5 Flash Lite: ${esc(r.error)}${r.code === 'TIMEOUT' ? '\n무료 등급 서버가 붐빌 때 이래요. 잠시 뒤 다시 해 보고, 계속 그러면 AI Studio 에서 같은 모델로 직접 보내 속도를 확인해 주세요. 그동안 일반 영상은 Claude·크롬 내장으로 번역해요.' : ''}` });
  } catch (e) {
    await keepTest('lite', { ok: false, model: $('liteId').textContent, html: '✗ 실패: ' + esc(e.message) });
  } finally {
    $('gTest').disabled = false;
    renderUsage();
  }
}

$('gSave').addEventListener('click', saveGemini);
$('gTest').addEventListener('click', testGemini);

// ===== 적용 사이트 =====
async function renderSites() {
  const { pickers = {} } = await chrome.storage.local.get('pickers');
  const pickedFor = hosts => Object.keys(pickers).find(h => hosts.some(x => h === x || h.endsWith('.' + x)));
  const rows = [
    ...BUILTIN_SITES.map(s => ({ ...s, glText: s.packs === 'auto' ? '제목·채널 보고 자동' : s.packs.map(packName).join(' · ') })),
    ...cfg.customSites.map(h => ({ id: h, name: h, hosts: [h], where: '자동 찾기', glText: '자동', custom: true }))
  ];
  $('sites').innerHTML = `<div class="r head"><span>적용</span><span>사이트</span><span>자막 위치</span><span>용어집</span><span></span></div>` + rows.map(s => {
    const ph = pickedFor(s.hosts);
    const where = ph ? `직접 고름 · <button type="button" class="plain" data-unpick="${esc(ph)}">지우기</button>` : esc(s.where);
    return `<div class="r"><input type="checkbox" data-site="${esc(s.id)}" ${cfg.siteOn[s.id] === false ? '' : 'checked'} aria-label="${esc(s.name)} 에 적용">
      <b>${esc(s.name)}${s.hosts[0] !== s.name ? ` <span class="hint">${esc(s.hosts[0])}</span>` : ''}</b><span>${where}</span><span>${esc(s.glText)}</span>
      ${s.custom ? `<button type="button" class="plain" data-remove="${esc(s.id)}" aria-label="${esc(s.name)} 빼기">✕</button>` : '<span></span>'}</div>`;
  }).join('');
}

$('sites').addEventListener('change', e => {
  const id = e.target.dataset.site;
  if (id) saveSync({ siteOn: { ...cfg.siteOn, [id]: e.target.checked } });
});
$('sites').addEventListener('click', async e => {
  const rm = e.target.dataset.remove, unpick = e.target.dataset.unpick;
  if (rm) {
    await chrome.runtime.sendMessage({ type: 'f1ko-site-remove', host: rm });
    cfg = normalize(await chrome.storage.sync.get(null));
    renderSites();
  }
  if (unpick) {
    const { pickers = {} } = await chrome.storage.local.get('pickers');
    delete pickers[unpick];
    await chrome.storage.local.set({ pickers });
    renderSites();
  }
});
$('addSite').addEventListener('click', async () => {
  const host = hostFromInput($('newSite').value);
  if (!host) { $('siteMsg').textContent = '주소나 도메인을 확인해 주세요 (예: learn.example.com)'; return; }
  const granted = await chrome.permissions.request({ origins: [`https://${host}/*`, `http://${host}/*`] }).catch(() => false);
  if (!granted) { $('siteMsg').textContent = '권한을 허락해야 그 사이트에서 쓸 수 있어요.'; return; }
  await chrome.runtime.sendMessage({ type: 'f1ko-site-add', host });
  cfg = normalize(await chrome.storage.sync.get(null));
  $('newSite').value = '';
  $('siteMsg').textContent = `${host} 를 추가했어요. 그 사이트를 새로고침하면 영상 위에 KO 버튼이 생겨요.`;
  renderSites();
});

// ===== 사용량 =====
async function renderUsage() {
  const { usage = {}, gemini = {} } = await chrome.storage.local.get(['usage', 'gemini']);
  const days = usage.days || {};
  const d = days[dayKey()] || {};
  const g = gemini[ptDayKey()] || {};
  const m = sumDays(days, dayKey().slice(0, 7));
  $('sClaude').textContent = `${num(d.requests)}회`;
  $('sClaudeSub').textContent = `${d.requests ? `평균 ${(d.ms / d.requests / 1000).toFixed(1)}초 · ` : ''}$${costUsd(d, cfg.priceIn, cfg.priceOut).toFixed(3)} · 캐시 ${Math.round(cacheHitRate(d) * 100)}%`;
  $('sChrome').textContent = `${num(d.chrome)}회`;
  $('sChromeSub').textContent = `${d.chrome ? `평균 ${(d.chromeMs / d.chrome / 1000).toFixed(1)}초 · ` : ''}무료`;
  $('sLite').textContent = `${num(g.lite)}회`;
  $('sLiteSub').textContent = `영상 ${num(g.videos)}편 · ${num(liteRemaining(g, GEMINI_LIMITS.lite.rpd))}회 남음`;
  $('liteLeft').textContent = `${num(liteRemaining(g, GEMINI_LIMITS.lite.rpd))} / ${num(GEMINI_LIMITS.lite.rpd)}`;
  const mtok = v => `${((v || 0) / 1e6).toFixed(2)}M`;
  $('sMonth').textContent = `이번 달 Claude ${num(m.requests)}회 · 입력 ${mtok(m.input + m.cacheRead + m.cacheWrite)} (캐시 읽기 ${mtok(m.cacheRead)}) · 출력 ${mtok(m.output)} · 실패 ${num(m.fails)} · 예상 $${costUsd(m, cfg.priceIn, cfg.priceOut).toFixed(2)} · Gemini 날짜는 태평양 시간 기준`;
}

$('resetUsage').addEventListener('click', async () => {
  if (!confirm('사용량 기록을 지울까요? (청구·한도와는 상관없어요)')) return;
  await chrome.storage.local.remove(['usage', 'gemini']);
  renderUsage();
});

// ===== 용어집 =====
const allPackIds = () => [...new Set([...PACKS.map(p => p.id), ...Object.keys(glossary.packs)])];

function renderGlossary() {
  $('glPacks').innerHTML = allPackIds().map(id => {
    const note = PACKS.find(p => p.id === id)?.note;
    return `<button type="button" data-pack="${esc(id)}" class="${id === glPack ? 'on' : ''}">${esc(packName(id))} ${(glossary.packs[id] || []).length}${note ? ` · ${esc(note)}` : ''}</button>`;
  }).join('');
  const groups = PACKS.find(p => p.id === glPack)?.groups || [...new Set((glossary.packs[glPack] || []).map(x => x.group).filter(Boolean))];
  const list = glossary.packs[glPack] || [];
  $('glGroups').innerHTML = groups.length
    ? `<span class="hint">${esc(packName(glPack))} 안에서:</span><button type="button" data-group="" class="${glGroup ? '' : 'on'}">전체</button>` +
      groups.map(gr => `<button type="button" data-group="${esc(gr)}" class="${glGroup === gr ? 'on' : ''}">${esc(gr)} ${list.filter(x => x.group === gr).length}</button>`).join('')
    : '';
  const groupOpts = sel => ['', ...groups].map(gr => `<option value="${esc(gr)}" ${gr === (sel || '') ? 'selected' : ''}>${esc(gr || '—')}</option>`).join('');
  const kindOpts = sel => Object.entries({ ko: '한국어로', keep: '영어 그대로', fix: '잘못 번역 막기' })
    .map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
  const rows = list.map((x, i) => ({ x, i })).filter(({ x }) => !glGroup || x.group === glGroup).map(({ x, i }) =>
    `<div class="r"><input type="text" data-i="${i}" data-f="en" value="${esc(x.en)}" aria-label="영어">
      <select data-i="${i}" data-f="group" aria-label="구분">${groupOpts(x.group)}</select>
      <select data-i="${i}" data-f="kind" aria-label="처리">${kindOpts(x.kind)}</select>
      <input type="text" data-i="${i}" data-f="ko" value="${esc(x.ko)}" aria-label="한국어 표기" ${x.kind === 'keep' ? 'disabled placeholder="—"' : ''}>
      <button class="x" data-del="${i}" type="button" aria-label="지우기">✕</button></div>`);
  $('glList').innerHTML = `<div class="r head"><span>영어</span><span>구분</span><span>처리</span><span>한국어 표기</span><span></span></div>${rows.join('') || '<div class="r"><span class="hint">아직 없어요 — 아래에서 추가해 주세요</span></div>'}`;
}

async function saveGlossary(msgText = '저장됨', undo = false) {
  if (undo) {
    const { glossary: cur } = await chrome.storage.local.get('glossary');
    await chrome.storage.local.set({ glossaryUndo: cur || cloneGlossary(DEFAULT_GLOSSARY) });
    $('glUndo').hidden = false;
  }
  glossary = sanitizeGlossary(glossary);
  await chrome.storage.local.set({ glossary });
  renderGlossary();
  $('glMsg').textContent = msgText;
  clearTimeout(saveGlossary.t);
  saveGlossary.t = setTimeout(() => ($('glMsg').textContent = ''), 3000);
}

$('glPacks').addEventListener('click', e => { const id = e.target.closest('button')?.dataset.pack; if (id != null) { glPack = id; glGroup = ''; renderGlossary(); } });
$('glGroups').addEventListener('click', e => { const g = e.target.closest('button')?.dataset.group; if (g != null) { glGroup = g; renderGlossary(); } });
$('glList').addEventListener('change', e => {
  const i = Number(e.target.dataset.i), f = e.target.dataset.f;
  if (Number.isNaN(i) || !f) return;
  const row = { ...glossary.packs[glPack][i], [f]: e.target.value };
  if (f === 'kind' && row.kind !== 'keep' && !row.ko) row.ko = row.en; // 한국어로 바꿨는데 비어 있으면 일단 영어로 채움
  const c = cleanEntry(row);
  if (!c) { $('glMsg').textContent = '영어와 (그대로가 아니면) 한국어를 둘 다 넣어 주세요'; renderGlossary(); return; }
  glossary.packs[glPack][i] = c;
  saveGlossary();
});
$('glList').addEventListener('click', e => {
  if (e.target.dataset.del == null) return;
  glossary.packs[glPack].splice(Number(e.target.dataset.del), 1);
  saveGlossary('지움');
});
$('glKind').addEventListener('change', () => { $('glKo').disabled = $('glKind').value === 'keep'; });
$('glAdd').addEventListener('click', () => {
  const c = cleanEntry({ en: $('glEn').value, ko: $('glKo').value, kind: $('glKind').value, group: glGroup });
  if (!c) { $('glMsg').textContent = '영어와 (그대로가 아니면) 한국어를 둘 다 넣어 주세요'; return; }
  const list = (glossary.packs[glPack] ||= []);
  // 같은 영어(대소문자 무시)가 이미 있으면 뒤에 붙이지 않고 그 줄을 바꾼다 (붙이면 정리 때 새 줄이 조용히 버려짐)
  const i = list.findIndex(x => String(x.en || '').toLowerCase() === c.en.toLowerCase());
  if (i >= 0) list[i] = { ...c, group: c.group || list[i].group || '' };
  else list.push(c);
  $('glEn').value = $('glKo').value = '';
  saveGlossary(i >= 0 ? `이미 있던 “${list[i].en}” 항목을 새 내용으로 바꿨어요` : '추가함');
});

// 내보내기
$('glExport').addEventListener('click', () => {
  const scope = $('exScope').value, fmt = $('exFmt').value;
  const packs = exportPacks(glossary, scope, glPack);
  const count = Object.values(packs).reduce((a, l) => a + l.length, 0);
  if (!count) { $('ioMsg').textContent = scope === 'edited' ? '기본값과 다른 용어가 없어요' : '내보낼 용어가 없어요'; return; }
  const text = fmt === 'csv' ? toCSV(packs) : toJSON(packs);
  const blob = new Blob([text], { type: fmt === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = exportFileName(scope, glPack, fmt);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  $('ioMsg').textContent = `${num(count)}개를 ${a.download} 로 내보냈어요`;
});

// 가져오기 → 미리보기
$('glImport').addEventListener('click', () => $('glFile').click());
$('glFile').addEventListener('change', async e => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  let incoming;
  try { incoming = parseImport(await f.text()); } catch (err) { $('ioMsg').textContent = `✗ ${err.message}`; return; }
  pending = { file: f.name, incoming, preview: previewImport(glossary, incoming) };
  showImport();
});

function showImport() {
  const { file, incoming, preview } = pending;
  const total = Object.values(incoming.packs).reduce((a, l) => a + l.length, 0);
  $('impFile').textContent = `${file} · ${num(total + incoming.skipped.length)}줄`;
  $('impAdd').textContent = num(preview.added.length);
  $('impChg').textContent = num(preview.changed.length);
  $('impSame').textContent = num(preview.same);
  $('impSkip').textContent = num(incoming.skipped.length);
  const kindTxt = x => KIND_NAMES[x.kind];
  const koTxt = x => (x.kind === 'keep' ? '—' : esc(x.ko));
  const rows = [
    ...preview.added.slice(0, 8).map(({ pack, entry }) => `<div class="r"><b style="color: var(--ok)">새로</b><span>${esc(entry.en)} <span class="hint">${esc(packName(pack))}</span></span><span>${kindTxt(entry)}</span><span>${koTxt(entry)}</span></div>`),
    ...preview.changed.slice(0, 8).map(({ entry, before }) => `<div class="r"><b style="color: var(--warn)">바뀜</b><span>${esc(entry.en)}</span><span>${kindTxt(entry)}</span><span><s class="hint">${before.kind === 'keep' ? '(그대로)' : esc(before.ko)}</s> → ${koTxt(entry)}</span></div>`),
    ...incoming.skipped.slice(0, 8).map(s => `<div class="r"><b class="bad">건너뜀</b><span>${esc(s.line)}${s.en ? ` · ${esc(s.en)}` : ''}</span><span></span><span class="bad">${esc(s.reason)}</span></div>`)
  ];
  const more = preview.added.length + preview.changed.length + incoming.skipped.length - rows.length;
  $('impRows').innerHTML = `<div class="r head"><span>상태</span><span>영어</span><span>처리</span><span>한국어</span></div>${rows.join('')}${more > 0 ? `<div class="r"><span></span><span class="hint">… ${num(more)}줄 더</span></div>` : ''}${rows.length ? '' : '<div class="r"><span></span><span class="hint">바뀌는 용어가 없어요</span></div>'}`;
  $('impReplaceHint').textContent = `· ${Object.keys(incoming.packs).map(packName).join(' · ')} 묶음을 파일 내용으로 바꿔요 (파일에 없는 용어는 지워지고, 다른 묶음은 그대로예요)`;
  updateApplyLabel();
  $('imp').showModal();
}

function updateApplyLabel() {
  if (!pending) return;
  const mode = document.querySelector('input[name=impMode]:checked').value;
  const total = Object.values(pending.incoming.packs).reduce((a, l) => a + l.length, 0);
  const n = mode === 'replace' ? total : pending.preview.added.length + pending.preview.changed.length;
  $('impApply').textContent = `${num(n)}개 적용`;
  $('impApply').disabled = n === 0 && mode === 'merge';
}
for (const r of document.querySelectorAll('input[name=impMode]')) r.addEventListener('change', updateApplyLabel);
$('impCancel').addEventListener('click', () => { pending = null; $('imp').close(); });
$('impApply').addEventListener('click', async () => {
  if (!pending) return;
  const mode = document.querySelector('input[name=impMode]:checked').value;
  glossary = applyImport(glossary, pending.incoming, mode);
  const first = Object.keys(pending.incoming.packs)[0];
  if (first) { glPack = first; glGroup = ''; }
  pending = null;
  $('imp').close();
  await saveGlossary('가져옴', true);
  $('ioMsg').textContent = '가져왔어요. 마음에 안 들면 되돌리기를 누르세요';
});

$('glUndo').addEventListener('click', async () => {
  const { glossaryUndo } = await chrome.storage.local.get('glossaryUndo');
  if (!glossaryUndo) return;
  glossary = sanitizeGlossary(glossaryUndo);
  await chrome.storage.local.set({ glossary });
  await chrome.storage.local.remove('glossaryUndo');
  $('glUndo').hidden = true;
  renderGlossary();
  $('ioMsg').textContent = '바로 전 상태로 되돌렸어요';
});

$('glReset').addEventListener('click', async () => {
  if (!confirm('용어집을 모두 기본값으로 되돌릴까요? (되돌리기로 한 번 복구할 수 있어요)')) return;
  const { glossary: cur } = await chrome.storage.local.get('glossary');
  if (cur) { await chrome.storage.local.set({ glossaryUndo: cur }); $('glUndo').hidden = false; }
  glossary = cloneGlossary(DEFAULT_GLOSSARY);
  await chrome.storage.local.remove('glossary');
  renderGlossary();
  $('ioMsg').textContent = '기본값으로 되돌렸어요';
});

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && (ch.usage || ch.gemini)) renderUsage();
  if (area === 'local' && ch.pickers) renderSites();
  if (area === 'local' && (ch.apiKey || ch.geminiKey)) chrome.storage.local.get(['apiKey', 'geminiKey']).then(v => renderKeys(!!v.apiKey, !!v.geminiKey));
  if (area === 'local' && ch.lastTest) { lastTest = ch.lastTest.newValue || {}; renderTests(); }
  if (area === 'sync' && (ch.customSites || ch.siteOn)) chrome.storage.sync.get(null).then(v => { cfg = normalize(v); renderSites(); });
});

load();

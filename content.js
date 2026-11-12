// ai-sub-ko — content script (적용 사이트, 모든 프레임)
// 영어 자막을 읽어 → 한국어 자막. 라이브는 한 줄씩(Claude · 크롬 내장),
// 자막 전체를 받을 수 있는 일반 영상은 Gemini Flash Lite 로 미리 번역해 두고 재생 시각에 맞춰 보여 준다.
// 콘텐츠 스크립트는 import 를 못 해서 lib/ 는 동적 import 로 불러온다 (web_accessible_resources).
(async () => {
  'use strict';
  if (window.__f1ko) return;
  window.__f1ko = true;

  const load = p => import(chrome.runtime.getURL(p));
  const [SET, G, SEG, ERR, COST, SITES, VOD, LIS] = await Promise.all([
    load('lib/settings.js'), load('lib/glossary.js'), load('lib/segment.js'), load('lib/errors.js'),
    load('lib/cost.js'), load('lib/sites.js'), load('lib/vod.js'), load('lib/listen.js')
  ]);
  const { normalize, pickEngine, hasKey, ENGINE_BADGE, ENGINE_NAMES } = SET;

  const POLL_MS = 200;
  const CONTEXT_LINES = 4;            // 한 줄 번역에 넘길 직전 원문 줄 수
  const SOFT_COOLDOWN_MS = 60_000;    // 일시 오류 때 대신 번역으로 버티는 시간
  const CLEAR_GRACE_MS = 300;         // 원문 자막이 사라지면 이만큼만 기다렸다 한국어 자막도 지움 (바뀌는 순간의 깜빡임 흡수)
  const NO_CAPTION_WARN_MS = 10_000;  // 켜고 이만큼 자막이 안 잡히면 안내
  const YT_ORIGINAL_MS = 1000;        // YouTube: 이 간격으로 플레이어 자막이 자동 번역(영어 >> 한국어)인지 보고 영어 원문으로 돌림
  const YT_RELOAD_MS = 3000;          // YouTube: 켜고 이만큼 자막 전체(timedtext)가 안 오면 플레이어 자막 트랙을 한 번 다시 켬
  const TRACK_STABLE_MS = 1000;       // 자막 트랙 줄 수가 이만큼 그대로면 다 받은 것으로 보고 미리 번역
  const BATCH = 100;                  // 미리 번역 한 번에 보내는 줄 수
  const DEBUG = false;

  // 플레이어별 자막 요소 후보 (위에서부터). 못 찾으면 자막 직접 고르기
  const CAPTION_SELECTORS = [
    '.bmpui-ui-subtitle-overlay',        // F1 TV (Bitmovin)
    '.bmpui-subtitle-region-container',
    '.ytp-caption-window-container',     // YouTube
    '.jw-captions',                      // JW Player (Anthropic Academy)
    '.jw-text-track-container',
    '.vjs-text-track-display',           // Video.js
    '[class*="subtitle-overlay"]',
    '[class*="caption-window"]',
    '[class*="captions-text"]'
  ];
  // 자막 자리에 뜨는 플레이어 안내 (YouTube 자막을 켤 때 ‘영어 (자동 생성됨) 설정을 확인하려면 ⚙ 을 클릭하세요’) — 원문이 아님
  // (id 가 caption-window-_N 인 것은 안내만이 아니다 — 광고 뒤 진짜 자막 창도 그 id 로 뜬다. 톱니 아이콘(svg)으로만 가린다)
  const CAPTION_HINT = '.caption-window:has(svg)';

  const S = {
    cfg: normalize({}),
    glossary: G.DEFAULT_GLOSSARY,
    site: null,
    siteOn: false,
    packs: ['common'],
    enabled: false,
    chromeTr: {},             // 원문 언어별 크롬 번역기 { en, ja }
    listen: null,             // 음성 번역 중 (1.0): { lang, seg, lastAt, cleared }
    listenAsked: false,       // 이 영상에서 음성 번역을 권했는지
    shownSeq: 0,
    seg: new SEG.Segmenter(),
    timer: null,
    seq: 0,
    cache: new Map(),
    history: [],
    block: {},                // { claude: { until, code } } — until = Infinity 는 설정을 고칠 때까지
    keys: { claude: false, gemini: false },
    override: null,           // 팝업에서 이 탭에만 고른 엔진
    used: '',                 // 마지막으로 번역한 엔진 (버튼 표시)
    mode: 'live',             // live | vod
    vod: null,                // { key, cues, tr, names, done, running, failed }
    vodShown: -1,
    trackSeen: null,
    videoKey: '',
    ytLive: false,
    koHuman: false,
    skipAsr: false,
    ytReloaded: false,        // 이 영상에서 자막 트랙 다시 켜기를 이미 했는지
    ytOriginalAt: 0,          // 자동 번역 확인을 마지막으로 부탁한 시각
    ytAdAt: 0,                // 마지막으로 광고가 보인 시각 (광고 중에는 광고 자막을 다시 받게 되므로 기다림)
    inAd: false,              // YouTube 광고 중 (번역 쉼)
    pickSel: '',
    picking: false,
    source: '',
    lastSeenAt: 0,
    enabledAt: 0,
    warned: false,
    curSrc: '', cur: '', prev: '', en: '',
    holdTimer: null,
    ms: [],
    fails: 0,
    hiddenTracks: new Set(),
    chromeN: 0, chromeMs: 0
  };
  const log = (...a) => DEBUG && console.log('[AISUBKO]', ...a);

  // ===== 설정 =====
  async function loadSettings() {
    S.cfg = normalize(await chrome.storage.sync.get(null));
    const { glossary, enabled = false, pickers = {} } = await chrome.storage.local.get(['glossary', 'enabled', 'pickers']);
    S.glossary = glossary ? G.sanitizeGlossary(glossary) : G.DEFAULT_GLOSSARY;
    S.pickSel = typeof pickers[location.hostname] === 'string' ? pickers[location.hostname] : '';
    await refreshKeys();
    applySite();
    updatePacks();
    setEnabled(enabled, true);
    applyLook();
    if (S.site?.id === 'youtube') window.postMessage({ __aisubko: 'get-tracks' }, location.origin);
  }

  async function refreshKeys() {
    try {
      const r = await chrome.runtime.sendMessage({ type: 'f1ko-keys' });
      if (r?.ok) S.keys = { claude: r.claude, gemini: r.gemini };
    } catch { /* 확장이 다시 읽힘 */ }
  }

  function applySite() {
    S.site = SITES.siteFor(location.hostname, S.cfg.customSites);
    S.siteOn = SITES.siteEnabled(S.cfg, S.site);
    showRoot();
    applyHideOriginal();
  }

  /** 적용 사이트이거나 음성 번역 중이면 화면을 보인다 (음성 번역은 목록에 없는 사이트에서도) */
  function showRoot() {
    if (root) root.style.display = S.siteOn || S.listen ? '' : 'none';
  }

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'sync') {
      const before = S.cfg;
      chrome.storage.sync.get(null).then(v => {
        S.cfg = normalize(v);
        const engineKeys = ['chromeFallback', 'model', 'filmTone', 'filmNames', 'filmShort', 'ytGlossary'];
        if (engineKeys.some(k => before[k] !== S.cfg[k])) resetBlocks();
        applySite();
        updatePacks();
        applyLook();
        applyHideOriginal();
        maybeRunVod();
        if (S.site?.id === 'youtube' && before.ytPreferKo !== S.cfg.ytPreferKo) window.postMessage({ __aisubko: 'get-tracks' }, location.origin);
      });
    }
    if (area === 'local') {
      if (ch.apiKey || ch.geminiKey) refreshKeys().then(resetBlocks);
      if (ch.geminiModels || ch.claudeModels) resetBlocks();
      if (ch.glossary) { S.glossary = ch.glossary.newValue ? G.sanitizeGlossary(ch.glossary.newValue) : G.DEFAULT_GLOSSARY; S.cache.clear(); }
      if (ch.pickers) { S.pickSel = ch.pickers.newValue?.[location.hostname] || ''; applyHideOriginal(); }
      if (ch.enabled) setEnabled(!!ch.enabled.newValue);
    }
  });

  function resetBlocks() {
    S.block = {}; S.cache.clear(); updateBadge(); maybeRunVod();
  }

  // ===== 화면 =====
  let root, btn, msg, box, lPrev, lCur, lEn, pickBar, pickBox, pickStyle;
  function mountUI() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'f1ko-root';
    root.innerHTML = `
      <button id="f1ko-btn" type="button">KO</button>
      <span id="f1ko-listen">음성 번역</span>
      <div id="f1ko-msg"></div>
      <div id="f1ko-box"><div id="f1ko-prev"></div><div id="f1ko-cur"></div><div id="f1ko-en"></div></div>
      <div id="f1ko-pickbar"><b>KO</b><span><b>자막 글자를 클릭해 주세요</b> · 영어 자막이 화면에 나올 때 그 글자를 클릭해 주세요</span><span class="esc">Esc 그만두기</span></div>
      <div id="f1ko-pickbox"><span>이 글자를 자막으로 쓸까요? · 클릭하면 이 사이트에 기억해요</span></div>`;
    btn = root.querySelector('#f1ko-btn');
    msg = root.querySelector('#f1ko-msg');
    box = root.querySelector('#f1ko-box');
    lPrev = root.querySelector('#f1ko-prev');
    lCur = root.querySelector('#f1ko-cur');
    lEn = root.querySelector('#f1ko-en');
    pickBar = root.querySelector('#f1ko-pickbar');
    pickBox = root.querySelector('#f1ko-pickbox');
    btn.addEventListener('click', () => chrome.storage.local.set({ enabled: !S.enabled }));
    msg.addEventListener('click', e => {
      if (e.target.dataset.options) chrome.runtime.sendMessage({ type: 'f1ko-open-options' });
      if (e.target.dataset.pick) startPicker();
    });
    attachRoot();
    document.addEventListener('fullscreenchange', attachRoot);
    document.addEventListener('webkitfullscreenchange', attachRoot);
    showRoot();
    updateBadge();
    applyLook();
  }

  // 전체 화면일 때는 전체 화면 요소 안에 있어야 보인다.
  // 단, <video> 자체가 전체 화면이면(기본 플레이어의 전체 화면 단추) 그 안의 자식은 그려지지 않는다 →
  // 화면을 body 에 두고 popover 로 맨 위 층(top layer)에 올려 전체 화면 위에 보이게 한다
  function attachRoot() {
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    const replaced = !!fs && /^(VIDEO|CANVAS|IMG)$/.test(fs.tagName);
    const host = fs && !replaced ? fs : document.body;
    if (root.parentElement !== host) host.appendChild(root);
    if (replaced && typeof root.showPopover === 'function') {
      if (!root.popover) root.popover = 'manual';
      try { root.hidePopover(); } catch { /* 닫혀 있음 */ }
      try { root.showPopover(); } catch { /* 못 올림 */ }
    } else if (root.popover) {
      try { root.hidePopover(); } catch { /* 닫혀 있음 */ }
      root.removeAttribute('popover');
    }
    placeBox();
  }

  function mainVideo() {
    let best = null, area = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      if (r.width * r.height > area) { best = v; area = r.width * r.height; }
    }
    return best;
  }

  /** 자막 상자를 영상 기준으로: 맨 아래에서 bottomPct% 띄우고, 글자 크기는 영상 폭에 맞춰 */
  // YouTube 는 화면 오른쪽 위에 상단 바 버튼(+ 만들기 · 알림 · 계정)이 있어서 KO 버튼을 그 왼쪽에 둔다. 전체 화면·다른 사이트는 오른쪽 위
  function placeBtn() {
    const bar = S.site?.id === 'youtube' && root.parentElement === document.body && document.querySelector('ytd-masthead #end #buttons');
    const r = bar ? bar.getBoundingClientRect() : null;
    const onBar = !!(r && r.width && r.bottom > 0);
    btn.style.top = onBar ? `${Math.round(r.top + (r.height - btn.offsetHeight) / 2)}px` : '';
    btn.style.right = onBar ? `${Math.round(innerWidth - r.left + 8)}px` : '';
    const chip = root.querySelector('#f1ko-listen');
    if (chip) {
      const b = btn.getBoundingClientRect();
      chip.style.display = S.listen ? 'block' : 'none';
      chip.style.top = `${Math.round(b.top + (b.height - chip.offsetHeight) / 2)}px`;
      chip.style.right = `${Math.round(innerWidth - b.left + 6)}px`;
    }
  }

  function placeBox() {
    if (!box) return;
    placeBtn();
    const v = mainVideo();
    const r = v ? v.getBoundingClientRect() : { left: 0, width: innerWidth, bottom: innerHeight, height: innerHeight };
    const base = Math.min(40, Math.max(15, r.width * 0.024)) * (S.cfg.fontScale / 100);
    box.style.left = `${r.left + r.width / 2}px`;
    box.style.bottom = `${Math.max(0, innerHeight - r.bottom) + r.height * (S.cfg.bottomPct / 100)}px`;
    box.style.maxWidth = `${Math.round(r.width * 0.9)}px`;
    box.style.fontSize = `${base.toFixed(1)}px`;
  }

  function applyLook() {
    if (!box) return;
    lPrev.style.display = S.cfg.showPrev && S.prev ? 'block' : 'none';
    lEn.style.display = S.cfg.showEn && S.en ? 'block' : 'none';
    lCur.style.display = S.cur ? '' : 'none';
    placeBox();
  }

  /** important: 오류 안내처럼 놓치면 안 되는 글 — 보이는 동안 덜 중요한 글(모델 내려받기 등)이 덮지 않는다 */
  function showMsg(html, ms = 3500, important = false) {
    if (!msg) return;
    // 중요한 안내가 떠 있는 동안에는 덜 중요한 글도, 덜 중요한 지우기('')도 덮지 않는다
    if (!important && Date.now() < (showMsg._until || 0)) return;
    showMsg._until = important && html ? Date.now() + (ms || 8000) : 0;
    msg.innerHTML = html;
    msg.style.display = html ? 'block' : 'none';
    clearTimeout(showMsg._t);
    if (html && ms) showMsg._t = setTimeout(() => (msg.style.display = 'none'), ms);
  }

  function esc(t) {
    return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function setLines(prev, cur, en) {
    S.prev = prev; S.cur = cur; S.en = en;
    lPrev.textContent = prev;
    lCur.textContent = cur;
    lEn.textContent = en;
    box.style.display = cur ? 'flex' : 'none';
    applyLook();
  }

  function render(src, out) {
    clearTimeout(S.holdTimer);
    S.vodShown = -1;
    const prev = SEG.isContinuation(S.curSrc, src) ? S.prev : S.cur;
    S.curSrc = src;
    setLines(prev, out, src.split('\n').slice(-2).join(' '));
    if (S.listen) showListenSource();
  }

  /** 원문이 사라짐 → 진행 중인 번역은 버리고, 잠깐 뒤 한국어 자막도 지움 */
  function clearSoon() {
    clearTimeout(S.timer);
    S.seq += 1;                 // 늦게 도착한 번역이 지운 자막을 다시 띄우지 않게
    clearTimeout(S.holdTimer);
    S.holdTimer = setTimeout(() => {
      S.curSrc = '';
      S.vodShown = -1;
      if (box) setLines('', '', '');
    }, CLEAR_GRACE_MS);
  }

  // ===== 엔진 =====
  const usable = e => !(S.block[e] && Date.now() < S.block[e].until);
  const fallbackEngine = () => (S.cfg.chromeFallback ? 'chrome' : null);

  /** 지금 쓸 엔진: 팝업에서 고른 것(키가 있을 때) > 자동 (일반 영상 Flash Lite → Claude → 크롬, 라이브 Claude → 크롬) */
  function lineEngine() {
    return pickEngine(S.listen ? 'live' : S.mode, S.keys, S.override); // 음성 번역은 라이브 순서 (자막 전체가 없음)
  }

  /** 한 줄 번역 때 차례로 시도할 엔진 */
  function lineChain() {
    const e = lineEngine();
    const fb = fallbackEngine();
    if (e === 'lite') {
      // 미리 번역이 아직 안 된 줄: 그동안은 대신 번역. Flash Lite 가 막히면 Claude 키가 있으면 Claude
      if (usable('lite')) return [fb];
      return S.keys.claude ? ['claude', fb] : [fb];
    }
    if (e === 'chrome') return ['chrome'];
    return [e, fb];
  }

  /** 버튼에 보일 엔진 */
  function shownEngine() {
    if (S.used) return S.used;
    if (!S.listen && S.mode === 'vod' && lineEngine() === 'lite' && usable('lite')) return 'lite';
    return lineChain().find(e => e && (e === 'chrome' || usable(e))) || '';
  }

  function updateBadge() {
    if (!btn) return;
    const on = S.enabled || !!S.listen;
    const e = on ? shownEngine() : '';
    btn.textContent = e ? ENGINE_BADGE[e] : 'KO';
    btn.className = e ? `on ${e}` : '';
    btn.style.display = on ? '' : 'none'; // 꺼져 있으면 버튼을 숨긴다 (켜기: ⌥K · 툴바 팝업)
    btn.title = `${on ? `엔진: ${ENGINE_NAMES[e] || '멈춤'}` : '꺼짐'} · ⌥K 켜기/끄기 · ⌥O 원문 · ⌥L 음성 번역`;
  }

  function blockText() {
    for (const [e, b] of Object.entries(S.block)) if (Date.now() < b.until) return ERR.describe(b.code, e, fallbackEngine());
    return '';
  }

  // ===== 사이트 영어 자막 숨기기 (설정 hideOriginal). 읽기는 계속 =====
  function applyHideOriginal() {
    const hide = S.enabled && S.siteOn && S.cfg.hideOriginal && !S.koHuman;
    document.documentElement.classList.toggle('f1ko-hide-original', hide);
    if (!pickStyle && S.pickSel) { pickStyle = document.createElement('style'); document.documentElement.appendChild(pickStyle); }
    if (pickStyle) pickStyle.textContent = hide && S.pickSel ? `${S.pickSel} { opacity: 0 !important; }` : '';
    for (const v of document.querySelectorAll('video')) {
      for (const tr of v.textTracks || []) {
        if (hide && tr.mode === 'showing' && /subtitles|captions/.test(tr.kind)) {
          tr.mode = 'hidden';           // 화면에서만 숨김 — activeCues 는 계속 들어온다
          S.hiddenTracks.add(tr);
        }
      }
    }
    if (!hide) {
      for (const tr of S.hiddenTracks) if (tr.mode === 'hidden') tr.mode = 'showing';
      S.hiddenTracks.clear();
    }
  }

  // ===== 크롬 내장 번역 =====
  /** 모델을 받은 상태일 때만 쓴다. 내려받기는 팝업·상세 설정의 버튼으로 (크롬이 사용자가 누를 때만 허락) */
  const srcLang = () => S.listen?.lang || 'en';

  async function ensureChromeTranslator(src = 'en') {
    if (S.chromeTr[src]) return true;
    if (!('Translator' in self)) { showMsg('크롬 내장 번역을 쓸 수 없어요 (크롬 138 이상 필요)', 6000); return false; }
    const opts = { sourceLanguage: src, targetLanguage: 'ko' };
    const avail = await Translator.availability(opts);
    if (avail !== 'available') {
      const warned = (S.modelWarned ||= {});
      if (!warned[src]) {
        warned[src] = true;
        const what = src === 'ja' ? '일본어 → 한국어 크롬 번역 모델' : '크롬 번역 모델';
        showMsg(avail === 'unavailable' ? `이 Mac 에서는 ${what}을 쓸 수 없어요`
          : `${what}을 아직 받지 않았어요 · 팝업이나 <u data-options="1">상세 설정</u>에서 내려받아 주세요`, 8000);
      }
      return false;
    }
    S.chromeTr[src] = await Translator.create(opts);
    return true;
  }

  /** 음성 번역 중에는 offscreen(확장 출처)에서 번역 — 페이지 출처에서는 받은 일본어 모델도 '안 받음' 으로 보임 */
  async function translateChromeViaExtension(text, src) {
    const r = await chrome.runtime.sendMessage({ type: 'f1ko-chrome-translate', text, src });
    if (r?.ok) return r.text;
    const warned = (S.modelWarned ||= {});
    if (!warned[src] && r?.state && r.state !== 'error') {
      warned[src] = true;
      const what = src === 'ja' ? '일본어 → 한국어 크롬 번역 모델' : '크롬 번역 모델';
      showMsg(r.state === 'unavailable' ? `이 Mac 에서는 ${what}을 쓸 수 없어요`
        : `${what}을 아직 받지 않았어요 · 팝업이나 <u data-options="1">상세 설정</u>에서 내려받아 주세요`, 8000);
    }
    throw new Error('크롬 번역 불가');
  }

  async function translateChrome(text) {
    const src = srcLang();
    const t0 = performance.now();
    let raw;
    if (S.listen) raw = await translateChromeViaExtension(text, src);
    else {
      if (!(await ensureChromeTranslator(src))) throw new Error('크롬 번역 불가');
      raw = await S.chromeTr[src].translate(text);
    }
    const out = G.fixChromeTranslation(raw, S.glossary, S.packs);
    S.chromeN += 1; S.chromeMs += Math.round(performance.now() - t0);
    return out;
  }

  // ===== API 엔진 (background 경유 — 키는 background 에만) =====
  async function translateApi(engine, text) {
    const res = await chrome.runtime.sendMessage({ type: 'f1ko-translate', text, context: S.history.slice(-CONTEXT_LINES), packs: S.packs, srcLang: srcLang() });
    if (!res || !res.ok) throw Object.assign(new Error(res?.error || '응답 없음'), { code: res?.code || 'API_ERROR' });
    S.ms.push(res.ms); if (S.ms.length > 30) S.ms.shift();
    return res.text;
  }

  function handleError(engine, e) {
    log('오류', engine, e.code, e.message);
    S.fails += 1;
    const code = e.code || 'API_ERROR';
    const until = ERR.HARD.has(code) ? Infinity
      : code === 'CAP' ? COST.nextMidnight()
        : code === 'DAILY' ? COST.nextPtMidnight()
          : Date.now() + SOFT_COOLDOWN_MS;
    S.block[engine] = { until, code };
    if (S.used === engine) S.used = ''; // 버튼이 다음 엔진을 보이게
    const fb = engine === 'lite' && S.keys.claude ? 'claude' : fallbackEngine();
    const link = ERR.HARD.has(code) ? ' · <u data-options="1">설정 열기</u>' : '';
    showMsg(esc(ERR.describe(code, engine, fb)) + link, ERR.HARD.has(code) ? 8000 : 5000, true);
    updateBadge();
  }

  async function translate(text) {
    if (S.cache.has(text)) return S.cache.get(text);
    let out = null;
    for (const e of lineChain()) {
      if (!e) break;
      if (e !== 'chrome' && !usable(e)) continue;
      try {
        out = e === 'chrome' ? await translateChrome(text) : await translateApi(e, text);
        if (S.used !== e) { S.used = e; updateBadge(); }
        break;
      } catch (err) {
        if (/context invalidated/i.test(err.message)) { showMsg('확장이 업데이트됐어요 — 페이지를 새로고침(⌘R)해 주세요', 0); throw err; }
        if (e === 'chrome') throw err;
        handleError(e, err);
      }
    }
    if (out == null) return null;
    S.cache.set(text, out);
    if (S.cache.size > 500) S.cache.delete(S.cache.keys().next().value);
    return out;
  }

  // ===== 일반 영상: 자막 전체 미리 번역 (Gemini Flash Lite) =====
  async function startVod(id, cues) {
    if (!cues.length) return;
    const key = VOD.vodKey(id, cues);
    if (S.vod?.key === key) return;
    // loading: 저장해 둔 번역을 읽는 동안 — 그 사이 시계(tick)가 미리 번역을 시작해 같은 영상을 다시 요청하지 않게
    const v = { key, cues, tr: new Array(cues.length).fill(null), names: [], done: false, running: false, loading: true, failed: new Set(), tries: {} };
    S.vod = v;
    S.mode = 'vod';
    S.vodShown = -1;
    const { vodCache = {} } = await chrome.storage.local.get('vodCache').catch(() => ({}));
    v.loading = false;
    const hit = vodCache[key];
    if (S.vod === v && hit && Array.isArray(hit.tr) && hit.tr.length === cues.length) {
      v.tr = hit.tr;
      v.names = Array.isArray(hit.names) ? hit.names : [];
      v.done = v.tr.every(Boolean);
    }
    log('자막 전체', cues.length, '줄', v.done ? '(저장해 둔 번역)' : '');
    updateBadge();
    maybeRunVod();
  }

  async function saveVod(v) {
    const { vodCache = {} } = await chrome.storage.local.get('vodCache');
    vodCache[v.key] = { tr: v.tr, names: v.names, at: Date.now() };
    await chrome.storage.local.set({ vodCache: VOD.pruneVodCache(vodCache) });
  }

  async function maybeRunVod() {
    const v = S.vod;
    if (!v || v.done || v.running || v.loading || !S.enabled || !S.siteOn || S.koHuman || S.listen) return;
    if (lineEngine() !== 'lite' || !usable('lite')) return;
    v.running = true;
    const n = v.cues.length;
    const t = mainVideo()?.currentTime || 0;
    const ranges = VOD.orderFrom(VOD.batchRanges(n, BATCH), v.cues, t);
    for (const [a, b] of ranges) {
      if (S.vod !== v || !S.enabled || lineEngine() !== 'lite' || !usable('lite')) break;
      const rk = `${a}-${b}`;
      if (v.failed.has(rk) || v.tr.slice(a, b).every(Boolean)) continue;
      const doneLines = v.tr.filter(Boolean).length;
      showMsg(`자막 ${n}줄 미리 번역 중 · ${doneLines}줄 끝 · 그동안은 ${esc(ENGINE_NAMES[lineChain().find(Boolean)] || '자막 멈춤')}`, 0);
      try {
        const res = await chrome.runtime.sendMessage({ type: 'f1ko-batch', lines: v.cues.slice(a, b).map(c => c.text), names: S.cfg.filmNames ? v.names : [], packs: S.packs });
        if (!res?.ok) throw Object.assign(new Error(res?.error || '응답 없음'), { code: res?.code || 'API_ERROR' });
        res.lines.forEach((tx, i) => { if (tx) v.tr[a + i] = tx; });
        for (const nm of res.names || []) if (!v.names.some(x => x.en.toLowerCase() === nm.en.toLowerCase())) v.names.push(nm);
        if (v.names.length > 80) v.names = v.names.slice(-80);
        if (!v.tr.slice(a, b).every(Boolean)) {
          v.tries[rk] = (v.tries[rk] || 0) + 1;
          if (v.tries[rk] >= 2) v.failed.add(rk); // 끝까지 빠진 줄은 한 줄씩 번역으로
        }
        S.used = 'lite';
        updateBadge();
      } catch (e) {
        if (/context invalidated/i.test(e.message)) break;
        handleError('lite', e);
        break;
      }
    }
    v.running = false;
    if (S.vod !== v) return;
    const ranges2 = VOD.batchRanges(n, BATCH);
    v.done = ranges2.every(([a, b]) => v.failed.has(`${a}-${b}`) || v.tr.slice(a, b).every(Boolean));
    await saveVod(v).catch(() => {});
    if (v.done) {
      showMsg(`자막 ${n}줄 미리 번역을 끝냈어요`, 2500);
      chrome.runtime.sendMessage({ type: 'f1ko-count', engine: 'lite-video' }).catch(() => {});
    } else if (usable('lite')) {
      setTimeout(maybeRunVod, 1000);
    } else {
      showMsg('', 0);
    }
  }

  /** 미리 번역된 줄을 재생 시각에 맞춰. 번역이 아직 없으면 false (한 줄씩 번역으로) */
  function renderVod() {
    const v = mainVideo();
    if (!v || !S.vod) return false;
    const { cur, prev } = VOD.activeAt(S.vod.cues, v.currentTime);
    if (cur < 0) {
      if (S.vodShown >= 0) { S.vodShown = -1; clearSoon(); } // 한 번만 (매번 부르면 지우기 시계가 계속 다시 시작)
      return true;
    }
    S.lastSeenAt = Date.now();
    S.source = `자막 전체 ${S.vod.cues.length}줄 (미리 번역)`;
    if (!S.vod.tr[cur]) return false;
    if (S.vodShown === cur) return true;
    clearTimeout(S.holdTimer);
    clearTimeout(S.timer);
    S.seq += 1;
    S.vodShown = cur;
    S.curSrc = '';
    if (S.used !== 'lite') { S.used = 'lite'; updateBadge(); }
    setLines(prev >= 0 ? S.vod.tr[prev] || '' : '', S.vod.tr[cur], S.vod.cues[cur].text);
    return true;
  }

  /** YouTube 가 아닌 사이트: 브라우저 자막 트랙에 줄이 다 들어와 있으면 미리 번역 */
  function checkTrackVod() {
    if (S.vod || S.site?.id === 'youtube') return;
    const v = mainVideo();
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    for (const tr of v.textTracks || []) {
      if (!/subtitles|captions/.test(tr.kind) || tr.mode === 'disabled') continue;
      if (!(/^en\b/i.test(tr.language || '') || /english|영어/i.test(tr.label || ''))) continue;
      const n = tr.cues?.length || 0;
      if (!n) continue;
      const seen = S.trackSeen;
      if (seen && seen.tr === tr && seen.n === n) {
        if (Date.now() - seen.at > TRACK_STABLE_MS) startVod(`${location.origin}${location.pathname}#${tr.label || tr.language}`, VOD.cuesFromTrack(tr.cues));
      } else {
        S.trackSeen = { tr, n, at: Date.now() };
      }
      return;
    }
  }

  // ===== YouTube: 자막 전체·트랙 목록은 yt-main.js(MAIN world) 가 알려 준다 =====
  function ytVideoId() {
    try {
      const u = new URL(location.href);
      return u.searchParams.get('v') || (u.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{6,})/) || [])[1] || '';
    } catch { return ''; }
  }

  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || typeof e.data.__aisubko !== 'string') return;
    if (e.data.__aisubko === 'timedtext') onTimedtext(String(e.data.url || ''), e.data.body);
    if (e.data.__aisubko === 'tracks') onTracks(e.data);
    if (e.data.__aisubko === 'untranslated' && S.enabled) showMsg('YouTube 자동 번역 자막을 끄고 영어 원문으로 바꿨어요 · 번역은 이 확장이 해요', 5000);
  });

  function onTimedtext(url, body) {
    checkVideoChange(); // 새 영상의 자막이 주소 바뀜보다 먼저 와도 지워지지 않게
    const info = VOD.timedtextInfo(url);
    if (!info || !info.english || S.ytLive) return;
    if (info.videoId && info.videoId !== ytVideoId()) return;
    if (info.asr && !S.cfg.ytAsr) {
      S.skipAsr = true;
      if (S.enabled) { setLines('', '', ''); showMsg('자동 생성 영어 자막은 번역하지 않게 해 두었어요 · <u data-options="1">설정 열기</u>', 6000); }
      return;
    }
    S.skipAsr = false;
    const cues = VOD.parseJson3(body);
    if (cues.length) startVod(`yt:${info.videoId}:${info.lang}:${info.asr ? 'asr' : 'std'}`, cues);
  }

  function onTracks(d) {
    if (!d || (d.videoId && d.videoId !== ytVideoId())) return;
    S.ytLive = !!d.live;
    S.ytTitle = `${d.title || ''} ${d.channel || ''}`;
    updatePacks();
    const tracks = Array.isArray(d.tracks) ? d.tracks : [];
    const ko = tracks.find(t => /^ko\b/i.test(t.lang || '') && t.kind !== 'asr');
    const wasKo = S.koHuman;
    S.koHuman = !!(ko && S.cfg.ytPreferKo);
    if (S.koHuman && S.enabled) {
      window.postMessage({ __aisubko: 'set-track', lang: ko.lang }, location.origin);
      setLines('', '', '');
      if (!wasKo) showMsg('사람이 만든 한국어 자막이 있어서 그걸 보여 드릴게요 · 번역하지 않아요', 5000);
    }
    applyHideOriginal();
    if (S.enabled && !S.koHuman && !tracks.some(t => /^en\b/i.test(t.lang || ''))) {
      S.warned = true;
      showMsg('이 영상에는 영어 자막이 없어요. 자막(CC)에 영어나 ‘영어 (자동 생성)’ 이 생기면 바로 시작할게요', 8000);
    }
  }

  /** YouTube 플레이어가 자막(CC)을 켠 채 열렸는데 timedtext 를 받지 않을 때가 있다 (자막이 안 보이거나 미리 번역을 못 함).
   *  켜고 조금 지나도 자막 전체가 안 왔으면 플레이어의 자막 트랙을 한 번 껐다 켜게 한다 — 플레이어가 스스로 다시 받는다 (따로 요청하지 않음) */
  function maybeReloadYtCaptions() {
    if (S.site?.id !== 'youtube' || S.vod || S.ytLive || S.ytReloaded) return;
    if (document.querySelector('#movie_player.ad-showing')) { S.ytAdAt = Date.now(); return; }
    if (Date.now() - Math.max(S.enabledAt, S.ytAdAt) < YT_RELOAD_MS) return;
    S.ytReloaded = true;
    window.postMessage({ __aisubko: 'reload-captions', videoId: ytVideoId() }, location.origin);
  }

  /** YouTube 가 자막을 자동 번역(영어 >> 한국어)으로 켜면 번역된 한국어를 원문으로 읽게 된다 → 영어 원문 트랙으로 돌리게 한다 */
  function keepYtOriginal() {
    if (S.site?.id !== 'youtube' || Date.now() - S.ytOriginalAt < YT_ORIGINAL_MS) return;
    S.ytOriginalAt = Date.now();
    window.postMessage({ __aisubko: 'keep-original' }, location.origin);
  }

  /** 영상이 바뀌면 (YouTube 는 페이지를 새로 읽지 않는다) 미리 번역·상태를 처음부터 */
  function checkVideoChange() {
    const key = S.site?.id === 'youtube' ? ytVideoId() : location.href;
    if (key === S.videoKey) return;
    S.videoKey = key;
    S.vod = null; S.mode = 'live'; S.vodShown = -1; S.trackSeen = null;
    S.koHuman = false; S.skipAsr = false; S.ytLive = false; S.ytTitle = ''; S.ytReloaded = false;
    S.warned = false; S.lastSeenAt = 0; S.enabledAt = Date.now(); S.listenAsked = false;
    if (!S.listen) S.history = [];
    S.seg = new SEG.Segmenter();
    if (box && !S.listen) setLines('', '', '');
    updatePacks();
    applyHideOriginal();
    if (S.site?.id === 'youtube') setTimeout(() => window.postMessage({ __aisubko: 'get-tracks' }, location.origin), 1200);
  }

  /** 이 영상에 쓸 용어집 묶음 (사이트 설정 · 제목·채널) */
  function updatePacks() {
    const channel = document.querySelector('ytd-video-owner-renderer #channel-name, #owner #channel-name')?.textContent || '';
    const title = S.site?.id === 'youtube' ? `${S.ytTitle || ''} ${document.title} ${channel}` : document.title;
    const next = SITES.packsFor(S.site, title, S.cfg.ytGlossary);
    if (next.join() !== S.packs.join()) { S.packs = next; S.cache.clear(); }
  }

  // ===== 원문 자막 읽기 =====
  // 플레이어가 자막을 지우지 않고 display:none·visibility:hidden 으로만 감추면 innerText 에 옛 글자가 남는다 →
  // 보이는 요소만 읽는다. opacity 는 보지 않는다 (우리가 숨길 때 opacity:0 을 쓰므로)
  function rendered(el) {
    return el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : el.getClientRects().length > 0;
  }

  /** 자막 요소의 글자. 플레이어 안내 창이 섞여 있으면 그 창은 빼고 읽는다 */
  function sourceText(el) {
    if (!el.querySelector(CAPTION_HINT)) return el.innerText || el.textContent;
    return [...el.querySelectorAll('.caption-window')].filter(w => !w.matches(CAPTION_HINT) && rendered(w))
      .map(w => w.innerText || w.textContent).join('\n');
  }

  function readSource() {
    const sels = S.pickSel ? [S.pickSel, ...CAPTION_SELECTORS] : CAPTION_SELECTORS;
    for (const sel of sels) {
      let els;
      try { els = document.querySelectorAll(sel); } catch { continue; } // 고른 선택자가 깨졌으면 건너뜀
      for (const el of els) {
        if ((root && root.contains(el)) || !rendered(el) || el.closest(CAPTION_HINT)) continue;
        const t = SEG.clean(sourceText(el));
        if (t) { S.source = sel === S.pickSel ? '직접 고른 자막 위치' : `요소 ${sel}`; return t; }
      }
    }
    for (const v of document.querySelectorAll('video')) {
      for (const tr of v.textTracks || []) {
        if (tr.mode === 'disabled' || !tr.activeCues || !tr.activeCues.length) continue;
        const t = SEG.clean([...tr.activeCues].map(c => c.text).join('\n'));
        if (t) { S.source = `자막 트랙 ${tr.language || tr.label || '?'}`; return t; }
      }
    }
    return '';
  }

  function noCaptionHint() {
    if (S.site?.id === 'f1') return '영어 자막이 안 보여요 — 플레이어 아래 CC 에서 <b>English</b> 를 켜 주세요';
    if (S.site?.id === 'youtube') return '영어 자막이 안 보여요 — 플레이어의 자막(CC) 버튼으로 영어 자막을 켜 주세요';
    return '영어 자막을 못 찾았어요 — CC 에서 영어 자막을 켜고, 그래도 안 되면 <u data-pick="1">자막 직접 고르기</u>를 눌러 주세요';
  }

  function tick() {
    if (!root) return;
    checkVideoChange();
    if (S.listen) { listenTick(); return; } // 음성 번역 중에는 사이트 자막을 읽지 않는다
    if (S.enabled) placeBtn(); // 한국어 자막을 보여 주는 중·자동 생성 자막 건너뜀일 때도 버튼은 상단 바 옆에
    if (S.enabled && S.siteOn && S.cfg.listenWhen === 'always' && !S.listenAsked) suggestListen();
    if (!S.enabled || !S.siteOn || S.koHuman || S.skipAsr || S.picking) return;
    placeBox();
    checkTrackVod();
    maybeReloadYtCaptions();
    // YouTube 광고 중에는 번역하지 않는다 (광고 자막 번역 비용 · 광고는 같은 <video> 라 본편 미리 번역 줄도 시각이 어긋남)
    if (S.site?.id === 'youtube' && document.querySelector('#movie_player.ad-showing')) {
      if (!S.inAd) { S.inAd = true; S.seg = new SEG.Segmenter(); clearSoon(); }
      S.lastSeenAt = Date.now(); // 광고가 끝나도 ‘영어 자막이 안 보여요’ 를 바로 띄우지 않게
      return;
    }
    S.inAd = false;
    keepYtOriginal();
    if (S.vod && !S.vod.done && !S.vod.running && !S.vod.loading) maybeRunVod(); // 일시 오류로 멈췄던 미리 번역 다시
    if (S.vod && lineEngine() === 'lite' && renderVod()) return;
    let src = readSource();
    if (SEG.isKorean(src)) src = ''; // 한국어 자막은 번역하지 않는다
    if (src) S.lastSeenAt = Date.now();
    else if (!S.warned && Date.now() - Math.max(S.enabledAt, S.lastSeenAt) > NO_CAPTION_WARN_MS) {
      S.warned = true;
      showMsg(noCaptionHint(), 10000);
      if (S.cfg.listenWhen === 'auto' && !S.listenAsked) suggestListen();
    }
    const r = S.seg.onSource(src, Date.now());
    if (r === undefined) return;
    if (r === null) { clearSoon(); return; }
    clearTimeout(S.timer);
    S.timer = setTimeout(() => doTranslate(src), r);
  }

  /** ordered: 음성 번역 조각 — 차례로 오는 조각이라 뒤 조각이 먼저 요청됐다고 앞 조각을 버리지 않는다 (더 오래된 것만 버림) */
  async function doTranslate(src, ordered = false) {
    S.seg.started();
    const my = ++S.seq;
    try {
      const out = await translate(src);
      S.history = SEG.pushHistory(S.history, src);
      if (out == null) return;
      if (ordered ? my < S.shownSeq || !S.listen : my !== S.seq) return; // 더 새 자막이 이미 요청됨, 또는 자막 멈춤
      S.shownSeq = my;
      log(src, '→', out);
      render(src, out);
    } catch (e) {
      log('번역 실패', e);
    }
  }

  // ===== 음성 번역 (1.0): background → offscreen 의 크롬 내장 음성 인식(맥 안)이 받아 적은 글 =====
  const LISTEN_CLEAR_MS = 5000; // 받아 적은 글이 이만큼 없으면 자막을 지움

  function onListen(m) {
    if (m.kind === 'start') listenOn(m.lang);
    else if (m.kind === 'stopped') listenOff(m.reason);
    else if (m.kind === 'notice') listenNotice(m.reason, m.lang);
    else if (!S.listen) return;
    else if (m.kind === 'text') onListenText(String(m.text || ''), !!m.final);
    else if (m.kind === 'restart') S.listen.seg.restart();
    else if (m.kind === 'silence') {
      const v = mainVideo();
      if (v && !v.paused) showMsg('30초 동안 소리가 없어요 · 영상이 멈췄거나 탭 소리가 꺼져 있는지 봐 주세요', 8000, true);
    }
  }

  function listenOn(lang) {
    if (!LIS.LISTEN_LANGS[lang]) lang = 'en';
    S.listen = { lang, seg: new LIS.ListenSegmenter(lang), lastAt: Date.now(), cleared: true };
    S.history = []; S.used = ''; S.cache.clear();
    S.shownSeq = ++S.seq;
    S.source = '음성 번역 (크롬 내장 음성 인식 · 맥 안)';
    if (box) setLines('', '', '');
    showRoot(); updateBadge(); placeBtn();
    showMsg(`${LIS.LISTEN_LANGS[lang].name} 소리를 받아 적어 번역해요 · 크롬 내장 음성 인식, 맥 안에서 처리 · ⌥L 멈추기`, 6000, true);
  }

  const STOP_TEXT = {
    user: '음성 번역을 멈췄어요',
    moved: '다른 탭에서 음성 번역을 시작해서 여기는 멈췄어요',
    ended: '탭 소리가 끊겨서 음성 번역을 멈췄어요 · 다시 하려면 ⌥L',
    failed: '받아 적기가 계속 멈춰서 음성 번역을 껐어요 · 다시 하려면 ⌥L, 계속되면 팝업의 「진단 복사」를 보내 주세요'
  };

  function listenOff(reason = 'user') {
    const was = !!S.listen;
    S.listen = null;
    S.seq += 1; S.shownSeq = S.seq;
    if (box) setLines('', '', '');
    S.history = []; S.used = ''; S.cache.clear(); S.lastSeenAt = Date.now();
    showRoot(); updateBadge(); if (root) placeBtn();
    if (reason === 'no-pack') listenNotice('no-pack', S.cfg.listenLang);
    else if (was && STOP_TEXT[reason]) showMsg(STOP_TEXT[reason], 5000, true);
  }

  /** 쓸 수 없을 때 (⌥L · 시작 실패) — 이유와 해결을 자막 자리에 */
  function listenNotice(reason, lang = 'en') {
    const t = LIS.reasonText(reason, lang, LIS.chromeVersion(navigator.userAgent));
    const act = t.action ? ' · 팝업을 열어 「언어 팩 받기」를 눌러 주세요' : '';
    if (root) { showRoot(); }
    showMsg(`<b>음성 번역을 시작할 수 없어요 — ${esc(t.title)}</b><br>${esc(t.fix)}${act}`, 8000, true);
  }

  /** 사이트 자막이 없을 때 (또는 늘 소리로): 쓸 수 있으면 ⌥L 을 권하고, 못 쓰면 그 이유를 */
  async function suggestListen() {
    if (S.listenAsked || S.listen) return;
    S.listenAsked = true;
    let r = null;
    try { r = await chrome.runtime.sendMessage({ type: 'f1ko-listen-support' }); } catch { return; }
    if (S.listen || !r) return;
    // 자막을 못 찾은 경우(auto)는 「CC 켜기 · 자막 직접 고르기」 안내를 지우지 않고 음성 번역을 덧붙인다
    if (r.ok) {
      showMsg(S.cfg.listenWhen === 'always'
        ? '소리를 받아 적어 번역할 수 있어요 · 아이콘이나 <b>⌥L</b> 을 누르면 음성 번역을 시작해요'
        : `${noCaptionHint()}<br>자막이 없는 영상이면 아이콘이나 <b>⌥L</b> 로 음성 번역을 시작해요`, 15000, true);
    }
    else if (r.reason !== 'off') {
      const t = LIS.reasonText(r.reason, S.cfg.listenLang, LIS.chromeVersion(navigator.userAgent));
      showMsg(`${noCaptionHint()}<br>음성 번역도 쓸 수 없어요 — ${esc(t.title)} · ${esc(t.fix)}`, 15000, true);
    }
  }

  function onListenText(text, final) {
    const L = S.listen;
    L.lastAt = Date.now();
    for (const piece of L.seg.update(text, Date.now(), final)) sendPiece(piece);
    showListenSource();
  }

  function listenTick() {
    placeBox();
    const L = S.listen;
    for (const piece of L.seg.tick(Date.now())) sendPiece(piece);
    // 말이 끝나고 한참 조용하면 자막을 지움
    if (!L.cleared && Date.now() - L.lastAt > LISTEN_CLEAR_MS) { L.cleared = true; S.seq += 1; S.shownSeq = S.seq; if (box) setLines('', '', ''); }
  }

  function sendPiece(piece) {
    if (!piece) return;
    S.listen.cleared = false;
    S.lastSeenAt = Date.now();
    doTranslate(piece, true);
  }

  /** 원문 줄: 번역으로 보낸 끝부분 + 아직 받아 적는 중인 부분(흐리게) */
  function showListenSource() {
    if (!box || !S.listen) return;
    const { done, pending } = S.listen.seg.view();
    S.en = [done, pending].filter(Boolean).join(S.listen.lang === 'ja' ? '' : ' ');
    lEn.innerHTML = `${esc(done)}${done && pending && S.listen.lang !== 'ja' ? ' ' : ''}<span class="f1ko-pending">${esc(pending)}</span>`;
    if (S.en) { S.listen.cleared = false; box.style.display = 'flex'; }
    else if (!S.cur) box.style.display = 'none';
    applyLook();
  }

  // ===== 자막 직접 고르기 =====
  function captionContainer(el) {
    let n = el;
    for (let i = 0; i < 4 && n.parentElement; i++) {
      const p = n.parentElement;
      if (p.querySelector('video') || (p.innerText || '').length > 300) break;
      if (!/caption|subtitle|cue|track|text/i.test(String(p.className))) break;
      n = p;
    }
    return n;
  }

  function selectorFor(el) {
    const part = n => {
      if (n.id && !/\d{3,}/.test(n.id)) return `#${CSS.escape(n.id)}`;
      const cls = [...n.classList].filter(c => !/\d{3,}|active|hover|focus|visible|show|hidden/i.test(c)).slice(0, 2);
      return n.tagName.toLowerCase() + cls.map(c => `.${CSS.escape(c)}`).join('');
    };
    const parts = [];
    let n = el;
    for (let i = 0; n && n !== document.body && n !== document.documentElement && i < 4; i++, n = n.parentElement) {
      const p = part(n);
      parts.unshift(p);
      if (p.startsWith('#')) break;
    }
    return parts.join(' > ');
  }

  function startPicker() {
    if (!root || S.picking) return;
    S.picking = true;
    showMsg('', 0);
    pickBar.style.display = 'flex';
    let target = null;
    const onMove = e => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || root.contains(el) || el.tagName === 'VIDEO' || !SEG.clean(el.innerText || '')) { pickBox.style.display = 'none'; target = null; return; }
      target = captionContainer(el);
      const r = target.getBoundingClientRect();
      Object.assign(pickBox.style, { display: 'block', left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
    };
    const stop = () => {
      S.picking = false;
      pickBar.style.display = 'none';
      pickBox.style.display = 'none';
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
    };
    const onClick = async e => {
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      const sel = selectorFor(target);
      stop();
      const { pickers = {} } = await chrome.storage.local.get('pickers');
      await chrome.storage.local.set({ pickers: { ...pickers, [location.hostname]: sel } });
      S.pickSel = sel;
      S.warned = false; S.lastSeenAt = Date.now();
      showMsg('자막 위치를 기억했어요 · 다음 줄부터 한국어 자막을 보여 드려요', 3500);
    };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); stop(); } };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  }

  // ===== 켜기/끄기 =====
  async function setEnabled(on, silent = false) {
    if (on === S.enabled) return;
    S.enabled = on;
    S.enabledAt = Date.now();
    S.warned = false;
    S.used = '';
    S.seg = new SEG.Segmenter();
    applyHideOriginal();
    updateBadge();
    if (!root) return;
    if (on) {
      if (S.site?.id === 'youtube') window.postMessage({ __aisubko: 'get-tracks' }, location.origin);
      if (!silent && S.siteOn) showMsg(`한국어 자막 켬 · ${esc(ENGINE_NAMES[shownEngine()] || '자막 멈춤')}`, 3000);
      maybeRunVod();
    } else {
      clearTimeout(S.timer);
      clearTimeout(S.holdTimer);
      S.seq += 1;               // 끄기 전에 보낸 번역이 늦게 와서 자막을 다시 띄우지 않게
      S.curSrc = '';
      setLines('', '', '');
      if (!silent && S.siteOn) showMsg('한국어 자막 끔', 1500);
    }
  }

  document.addEventListener('keydown', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey || !root || !S.siteOn) return;
    // 맥에서 ⌥K 는 e.key 가 '˚' 로 들어오므로 물리 키(e.code)로 본다
    if (e.code === 'KeyK') { e.preventDefault(); chrome.storage.local.set({ enabled: !S.enabled }); }
    if (e.code === 'KeyO') {
      e.preventDefault();
      const next = !S.cfg.showEn;
      chrome.storage.sync.set({ showEn: next });
      showMsg(next ? '영어 원문 보이기' : '영어 원문 숨기기', 1500);
    }
  }, true);

  // 되감기·건너뛰기: 한 줄씩 번역 중이던 자막은 바로 지운다 (미리 번역은 시각으로 다시 맞춤)
  document.addEventListener('seeking', e => {
    if (e.target?.tagName !== 'VIDEO' || !S.enabled) return;
    S.seg = new SEG.Segmenter();
    clearSoon();
  }, true);

  // ===== 팝업과 대화 (영상이 있는 프레임만 대답) =====
  chrome.runtime.onMessage.addListener((m, _s, sendResponse) => {
    if (!root) return false;
    if (m?.type === 'f1ko-status') {
      const avg = S.ms.length ? Math.round(S.ms.reduce((a, b) => a + b, 0) / S.ms.length) : 0;
      const e = shownEngine();
      sendResponse({
        enabled: S.enabled,
        site: S.site?.name || location.hostname,
        siteOn: S.siteOn,
        found: Date.now() - S.lastSeenAt < 15_000 && !!S.lastSeenAt,
        source: S.source,
        engine: e,
        engineName: ENGINE_NAMES[e] || '',
        block: blockText(),
        avgMs: avg,
        fails: S.fails,
        mode: S.mode,
        vod: S.vod ? { n: S.vod.cues.length, done: S.vod.tr.filter(Boolean).length, finished: S.vod.done } : null,
        packs: S.packs,
        koHuman: S.koHuman,
        skipAsr: S.skipAsr,
        override: S.override,
        picked: !!S.pickSel,
        listening: !!S.listen,
        listenLang: S.listen?.lang || null
      });
      return false;
    }
    if (m?.type === 'f1ko-engine') {
      S.override = m.engine || null;
      if (S.override && !hasKey(S.override, S.keys)) S.override = null; // 키가 없는 엔진은 고를 수 없음
      if (S.override === 'lite' && S.mode !== 'vod') showMsg('Flash Lite 는 자막 전체를 받을 수 있는 영상에서만 돼요 · 이 영상은 라이브 순서로 번역해요', 5000);
      S.used = '';
      S.cache.clear();
      updateBadge();
      maybeRunVod();
      sendResponse({ ok: true });
      return false;
    }
    if (m?.type === 'f1ko-pick') { startPicker(); sendResponse({ ok: true }); return false; }
    if (m?.type === 'f1ko-ping') { sendResponse({ ok: true }); return false; }
    if (m?.type === 'f1ko-listen') { onListen(m); return false; }
    if (m?.type === 'f1ko-diagnose') { sendResponse(diagnose()); return false; }
    return false;
  });

  /** 자막이 어디 그려지는지 알아내기용 (팝업 › 진단 복사) */
  function diagnose() {
    const els = [];
    for (const el of document.querySelectorAll('[class*="subtitle"], [class*="caption"], [class*="cue"]')) {
      if (root.contains(el)) continue;
      els.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 160), text: SEG.clean(el.innerText).slice(0, 120) });
      if (els.length >= 25) break;
    }
    const tracks = [];
    for (const v of document.querySelectorAll('video')) {
      for (const tr of v.textTracks || []) {
        tracks.push({ kind: tr.kind, label: tr.label, lang: tr.language, mode: tr.mode, cues: tr.cues?.length || 0, active: tr.activeCues ? [...tr.activeCues].map(c => c.text).join(' / ').slice(0, 120) : '' });
      }
    }
    return {
      url: location.href, frame: window === top ? 'top' : 'iframe', site: S.site?.id || '', videos: document.querySelectorAll('video').length,
      source: S.source, picked: S.pickSel, mode: S.mode, vod: S.vod ? S.vod.cues.length : 0, packs: S.packs,
      shadowHosts: [...document.querySelectorAll('*')].filter(e => e.shadowRoot).slice(0, 10).map(e => e.tagName.toLowerCase()),
      elements: els, tracks
    };
  }

  // 크롬 내장 번역 사용량은 모아서 가끔 보낸다
  setInterval(() => {
    if (!S.chromeN) return;
    const n = S.chromeN, ms = S.chromeMs;
    S.chromeN = 0; S.chromeMs = 0;
    chrome.runtime.sendMessage({ type: 'f1ko-count', engine: 'chrome', n, ms }).catch(() => {});
  }, 10_000);

  // 영상이 있는 프레임에서만 화면을 붙인다
  const boot = setInterval(() => {
    if (document.querySelector('video')) {
      clearInterval(boot); mountUI();
      loadSettings().then(async () => {
        // 음성 번역 중인 탭에서 페이지가 바뀌면 (탭 소리는 계속 받는 중) 이어서 보여 준다
        const r = await chrome.runtime.sendMessage({ type: 'f1ko-listen-state' }).catch(() => null);
        if (r?.listening && !S.listen) listenOn(r.lang);
      });
    }
  }, 1000);
  setInterval(tick, POLL_MS);
  addEventListener('resize', placeBox);
})();

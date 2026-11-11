// 설정 기본값. sync: 엔진·모델·보기·상한·사이트 / local: API 키·용어집·사용량·자막 위치 (기기 밖으로 안 나감)

export const MODELS = [
  { id: 'claude-haiku-5-5', name: 'Haiku 5.5 · claude-haiku-5-5 — 가장 빠르고 저렴 (권장)', family: 'haiku', priceIn: 0.10, priceOut: 0.50 },
  { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5 · claude-sonnet-5-5 — 품질↑, 비용·지연↑', family: 'sonnet', priceIn: 2.00, priceOut: 10.00 }
];

/** Gemini 모델 이름 기본값. 상세 설정 › Gemini 연결 테스트 때 이 키로 쓸 수 있는 최신 이름으로 바뀐다 */
export const GEMINI_DEFAULTS = { lite: 'gemini-3.5-flash-lite' };
/** AI Studio 무료 등급 한도 (2026-10 사용자 화면 기준). 실제 값은 AI Studio › 비율 제한 */
export const GEMINI_LIMITS = { lite: { rpm: 15, rpd: 500 } };

/** 엔진: claude · lite(Gemini 3.5 Flash Lite, 자막 전체 미리 번역) · chrome(크롬 내장) */
export const ENGINES = ['claude', 'lite', 'chrome'];
export const ENGINE_NAMES = { claude: 'Claude', chrome: '크롬 내장 번역', lite: 'Gemini Flash Lite' };
export const ENGINE_BADGE = { claude: 'KO·Claude', chrome: 'KO·크롬', lite: 'KO·Lite' };

export const SYNC_DEFAULTS = {
  chromeFallback: true,          // AI 번역이 안 될 때 크롬 내장 번역 (끄면 자막을 멈추고 알림만)
  model: 'claude-haiku-5-5',
  showPrev: true,                // 지난 자막(바로 앞 문장)을 윗줄에 흐리게
  showEn: true,                  // 한국어 아래에 영어 원문을 작게
  hideOriginal: true,            // 사이트 영어 자막을 화면에서 숨김 (읽기는 계속)
  fontScale: 110,                // %
  bottomPct: 12,                 // 영상 맨 아래에서 띄우는 거리 (영상 높이의 %)
  dailyCapUsd: 1.0,              // Claude 하루 예상 금액 상한 (0 = 없음)
  priceIn: 0.10,                 // 100만 토큰당 달러
  priceOut: 0.50,
  siteOn: {},                    // 사이트별 켜기/끄기 { f1: true, youtube: false, 'example.com': true } — 없으면 켜짐
  customSites: [],               // 이 사이트에서 켜기로 더한 호스트 이름 ['example.com']
  ytAsr: true,                   // YouTube 자동 생성 영어 자막도 번역
  ytPreferKo: true,              // 사람이 만든 한국어 자막이 있으면 그걸 보여 주기
  ytGlossary: 'auto',            // auto(제목·채널 보고) | common(공통만)
  filmTone: true,                // 영화·드라마: 인물 관계에 맞게 반말·존댓말
  filmNames: true,               // 영화·드라마: 인물 이름 표기 고정
  filmShort: true,               // 영화·드라마: 한 줄 짧게
  listenWhen: 'auto',            // 음성 번역(1.0): auto(사이트 자막이 없을 때 안내) | always(늘 소리로 안내) | off(쓰지 않음)
  listenLang: 'en',              // 음성 번역 원문 언어: en | ja
  listenHints: true              // 용어집 고유 이름을 음성 인식에 알려 주기 (영어만, 세기는 고정)
};

export const LIMITS = {
  fontScale: [70, 160],
  bottomPct: [0, 40],
  dailyCapUsd: [0, 100]
};

const BOOLS = ['chromeFallback', 'showPrev', 'showEn', 'hideOriginal', 'ytAsr', 'ytPreferKo', 'filmTone', 'filmNames', 'filmShort', 'listenHints'];
// 0.3 까지의 키: displayMode(ko|koEn|both), lines(1|2) → 켜기/끄기 세 개로 옮김.
// 0.4 까지: engine(claude|chrome). 0.5: engineLive·engineVod(→ 자동), fallback(chrome|none → chromeFallback)
const OLD_KEYS = ['displayMode', 'lines', 'engine', 'engineLive', 'engineVod', 'fallback'];

/** 범위 밖 값·이상한 값을 기본값 쪽으로 정리. 저장소는 get(null) 로 읽어 넘긴다 (옛 키를 옮기려고) */
export function normalize(raw = {}) {
  const s = { ...SYNC_DEFAULTS, ...raw };
  if (raw.showPrev === undefined && raw.lines !== undefined) s.showPrev = Number(raw.lines) >= 2;
  if (raw.showEn === undefined && raw.displayMode !== undefined) s.showEn = raw.displayMode === 'koEn';
  if (raw.hideOriginal === undefined && raw.displayMode !== undefined) s.hideOriginal = raw.displayMode !== 'both';
  if (raw.chromeFallback === undefined && raw.fallback !== undefined) s.chromeFallback = raw.fallback !== 'none';
  for (const k of OLD_KEYS) delete s[k];
  for (const k of BOOLS) s[k] = typeof s[k] === 'boolean' ? s[k] : SYNC_DEFAULTS[k];
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    const v = Number(s[k]);
    s[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : SYNC_DEFAULTS[k];
  }
  if (!['auto', 'common'].includes(s.ytGlossary)) s.ytGlossary = SYNC_DEFAULTS.ytGlossary;
  if (!['auto', 'always', 'off'].includes(s.listenWhen)) s.listenWhen = SYNC_DEFAULTS.listenWhen;
  if (!['en', 'ja'].includes(s.listenLang)) s.listenLang = SYNC_DEFAULTS.listenLang;
  if (typeof s.model !== 'string' || !s.model.startsWith('claude-')) s.model = SYNC_DEFAULTS.model;
  for (const k of ['priceIn', 'priceOut']) {
    const v = Number(s[k]);
    s[k] = Number.isFinite(v) && v >= 0 ? v : SYNC_DEFAULTS[k];
  }
  s.siteOn = s.siteOn && typeof s.siteOn === 'object' && !Array.isArray(s.siteOn)
    ? Object.fromEntries(Object.entries(s.siteOn).filter(([, v]) => typeof v === 'boolean'))
    : {};
  s.customSites = Array.isArray(s.customSites)
    ? [...new Set(s.customSites.filter(h => typeof h === 'string' && /^[a-z0-9.-]+$/i.test(h)).map(h => h.toLowerCase()))]
    : [];
  return s;
}

/** 이 엔진을 쓸 키가 있는지 (크롬 내장은 키가 없어도 됨) */
export function hasKey(engine, keys = {}) {
  return engine === 'chrome' || (engine === 'claude' && !!keys.claude) || (engine === 'lite' && !!keys.gemini);
}

/**
 * 이 탭에서 먼저 쓸 엔진. 팝업에서 고른 것(키가 있을 때) > 자동:
 * 일반 영상(자막 전체를 받음) = Flash Lite → Claude → 크롬, 라이브 = Claude → 크롬. 키가 없는 엔진은 건너뜀.
 * Flash Lite 는 자막 전체를 받은 영상에서만 (라이브에서 고르면 라이브 순서로)
 */
export function pickEngine(mode, keys = {}, override = null) {
  let e = override && ENGINES.includes(override) && hasKey(override, keys) ? override
    : mode === 'vod' && keys.gemini ? 'lite'
      : keys.claude ? 'claude' : 'chrome';
  if (e === 'lite' && mode !== 'vod') e = keys.claude ? 'claude' : 'chrome';
  return e;
}

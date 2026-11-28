// Safari판 (2026-11-29, 맥 앱 안 Safari 웹 확장): 같은 코드가 크롬 · Safari 에서 돈다. 여기는 순수 로직 + 아주 작은 DOM 도우미.
// 콘텐츠 스크립트도 불러오므로 하위 import 금지.
// - Safari 에는 크롬 내장 번역(Translator)이 없다 → 엔진 'chrome' 자리를 담는 맥 앱의 맥 번역(Apple Translation)이 맡는다.
//   저장된 엔진 이름('chrome')은 그대로 두고 보이는 글만 「맥 번역」으로 바꾼다.
// - Safari 에는 tabCapture · offscreen 이 없다 → 음성 번역 칸을 숨긴다.
// - API 키 · 외부 AI 동의는 맥 앱 › 설정에서 받고, background 가 네이티브 메시지로 받아 온다.

/** 확장 주소로 판정 (safari-web-extension://). url 을 주면 그 주소로 (시험용) */
export function isSafari(url) {
  try {
    const u = url ?? globalThis.chrome?.runtime?.getURL?.('') ?? '';
    return String(u).startsWith('safari-web-extension:');
  } catch { return false; }
}

export const SAFARI = isSafari();

/** 크롬판 화면 글 → Safari판 글. 긴 것부터 바꾼다 */
const BRAND = [
  [/AI 번역·크롬/g, 'AI 번역·맥'],
  [/크롬 내장 번역 모델/g, '맥 번역 언어'],
  [/크롬 번역 모델/g, '맥 번역 언어'],
  [/크롬 내장 번역/g, '맥 번역'],
  [/크롬 번역/g, '맥 번역'],
  [/크롬 내장/g, '맥 번역'],
  [/크롬/g, 'Safari']
];

export function brandText(text, safari = SAFARI) {
  let t = String(text ?? '');
  if (!safari) return t;
  for (const [re, to] of BRAND) t = t.replace(re, to);
  return t;
}

/** 팝업 · 상세 설정: 지금과 앞으로 그려지는 글자를 Safari 글로 (크롬이면 아무것도 안 함) */
export function watchBrand(root = globalThis.document?.body, safari = SAFARI) {
  if (!safari || !root) return;
  const fix = node => {
    const w = node.ownerDocument.createTreeWalker(node, 4 /* NodeFilter.SHOW_TEXT */);
    for (let n = node.nodeType === 3 ? node : w.nextNode(); n; n = w.nextNode()) {
      if (/크롬/.test(n.nodeValue)) { const v = brandText(n.nodeValue, true); if (v !== n.nodeValue) n.nodeValue = v; }
      if (node.nodeType === 3) break;
    }
  };
  fix(root);
  new MutationObserver(ms => { for (const m of ms) fix(m.target); }).observe(root, { subtree: true, childList: true, characterData: true });
}

/** 맥 번역 상태 글 (Translation LanguageAvailability: installed · supported · unsupported) */
export const MAC_TEXT = {
  available: '받음 ✓ · 이 맥 안에서 번역해요',
  downloadable: '맥 번역 언어를 아직 받지 않았어요 · AI 자막 번역 앱 › 설정 › 엔진에서 받아 주세요',
  unavailable: '이 맥에서는 맥 번역을 쓸 수 없어요',
  old: '맥 번역은 macOS 26 이상에서 돼요 · 지금은 Claude · Gemini 키로 번역해요',
  noapp: 'AI 자막 번역 앱과 연결하지 못했어요 · 앱을 한 번 열어 주세요'
};

/** 네이티브 응답의 상태 → 크롬판 modelState 와 같은 이름 */
export function macState(r) {
  const s = r?.state;
  if (s === 'installed' || s === 'available') return 'available';
  if (s === 'supported' || s === 'downloadable') return 'downloadable';
  if (s === 'unsupported' || s === 'unavailable') return 'unavailable';
  if (s === 'old-macos') return 'old';
  return 'noapp';
}

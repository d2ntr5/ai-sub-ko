// 크롬 내장 번역(Translator API) 모델 상태·내려받기. 확장 페이지(팝업·상세 설정)·콘텐츠 스크립트에서 같이 쓴다.
// 내려받기는 크롬이 사용자가 누른 직후에만 허락한다 → 버튼 클릭 안에서 downloadModel 을 부를 것.

export const TR_OPTS = { sourceLanguage: 'en', targetLanguage: 'ko' };
/** 원문 언어별 (1.0 음성 번역: 일본어 → 한국어도) */
export const trOpts = (src = 'en') => ({ sourceLanguage: src === 'ja' ? 'ja' : 'en', targetLanguage: 'ko' });

/** 'available'(받음) · 'downloadable'(받을 수 있음) · 'downloading'(받는 중) · 'unavailable' · 'unsupported'(크롬 138 미만) */
export async function modelState(src = 'en') {
  if (typeof self === 'undefined' || !('Translator' in self)) return 'unsupported';
  try { return await self.Translator.availability(trOpts(src)); } catch { return 'unavailable'; }
}

export const MODEL_TEXT = {
  available: '받음 ✓ · 인터넷 없이도 번역해요',
  downloadable: '번역 모델을 아직 받지 않았어요',
  downloading: '번역 모델 내려받는 중…',
  unavailable: '이 Mac 에서는 크롬 번역 모델을 쓸 수 없어요',
  unsupported: '크롬 138 이상에서만 쓸 수 있어요'
};

/** 모델 받기 (onProgress(0~1)). 다 받으면 끝남 */
export async function downloadModel(onProgress = () => {}, src = 'en') {
  const t = await self.Translator.create({
    ...trOpts(src),
    monitor(m) { m.addEventListener('downloadprogress', e => onProgress(e.loaded)); }
  });
  onProgress(1);
  t.destroy?.();
}

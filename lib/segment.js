// 롤업 자막 끊기: F1 TV 자동 자막은 한 글자씩 늘어나며 바뀐다.
// 문장이 끝나면(. ? ! …) 바로, 아니면 0.35초 멈출 때, 계속 바뀌어도 1.2초마다 번역.

export const SETTLE_MS = 350;
export const MAX_WAIT_MS = 1200;

/** 이미 한국어인 자막 (한글이 로마자보다 많음) — 번역할 원문이 아니다 (예: 한국어 광고 자막) */
export function isKorean(t) {
  const ko = (String(t || '').match(/[가-힣]/g) || []).length;
  const en = (String(t || '').match(/[A-Za-z]/g) || []).length;
  return ko > 0 && ko >= en;
}

/** 자막 글자 정리. 자막의 화자 바뀜 표시(>>)는 번역·화면에 필요 없어 뺀다 */
export function clean(t) {
  return (t || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/(^|\s)>>+(?=\s|$)/g, '$1').replace(/[ \t]+/g, ' ')
    .split('\n').map(s => s.trim()).filter(Boolean).join('\n').trim();
}

export function endsSentence(t) {
  return /[.?!…][”"')\]]*$/.test(t.trim());
}

export class Segmenter {
  constructor({ settleMs = SETTLE_MS, maxWaitMs = MAX_WAIT_MS } = {}) {
    this.settleMs = settleMs;
    this.maxWaitMs = maxWaitMs;
    this.last = '';
    this.firstChangeAt = null;
  }

  /**
   * 원문이 들어올 때마다. 반환: undefined = 그대로, null = 자막 사라짐(지우기), 숫자 = 그 ms 뒤 번역
   */
  onSource(src, now) {
    if (src === this.last) return undefined;
    this.last = src;
    if (!src) { this.firstChangeAt = null; return null; }
    if (this.firstChangeAt == null) this.firstChangeAt = now;
    if (endsSentence(src)) return 0;
    return now - this.firstChangeAt >= this.maxWaitMs ? 0 : this.settleMs;
  }

  /** 번역을 시작했으면 기다림 시계를 다시 */
  started() { this.firstChangeAt = null; }
}

/** 문맥 기록: 같은 문장이 늘어난 것이면 바꿔 끼우고, 새 문장이면 뒤에 붙인다 */
export function pushHistory(history, src, max = 20) {
  const h = history.slice();
  const last = h[h.length - 1];
  if (last && src.startsWith(last)) h[h.length - 1] = src;
  else if (last !== src) h.push(src);
  return h.slice(-max);
}

/** 두 줄 표시: 새 원문이 이전 원문을 이어 쓴 것이면 같은 줄, 아니면 이전 번역을 윗줄로 */
export function isContinuation(prevSrc, src) {
  if (!prevSrc) return false;
  const a = prevSrc.replace(/\s+/g, ' ').trim(), b = src.replace(/\s+/g, ' ').trim();
  return b.startsWith(a) || a.startsWith(b);
}

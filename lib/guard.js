// 토큰이 새는 것 막기 (1.0.17). 실제 키 실측(2026-11-12)에서 Claude 1회 ≈ 입력 1,400토큰(캐시 89%) · 약 0.00005달러,
// 줄마다 번역이면 분당 20회(강의) ~ 50회(라이브 롤업). 새는 길: 안 보는 탭 · 켜 둔 채 잊음 · 탭 여러 개 · 새로고침(같은 줄 다시)

/** 영상 앞에 사람이 없다고 보는 시간. 영화 한 편(3시간)은 끊지 않게 */
export const UNATTENDED_MS = 3 * 60 * 60_000;
/** Claude 분당 상한 (모든 탭 합계). 라이브 롤업 한 탭이 1.2초마다 = 분당 50회 */
export const CLAUDE_PER_MIN = 60;
/** 탭 · 새로고침 사이에 같이 쓰는 번역 기억 (줄 수) */
export const SHARED_CACHE_MAX = 2000;

/**
 * AI 번역(Claude · Gemini)을 쉬어야 하는 이유. '' = 쉬지 않음
 * hidden: 탭이 안 보임 (자막을 볼 사람이 없음 · 화면 속 화면은 예외)
 * idle: 오래 조작이 없음 (켜 둔 채 잠듦 · 자동 다음 영상)
 */
export function pauseReason({ hidden = false, pip = false, lastInputAt = 0, now = Date.now(), unattendedMs = UNATTENDED_MS } = {}) {
  if (hidden && !pip) return 'hidden';
  if (now - lastInputAt > unattendedMs) return 'idle';
  return '';
}

/** 최근 windowMs 안의 횟수를 세는 창. tryTake 가 false 면 이번 요청은 보내지 않는다 */
export class RateWindow {
  constructor(limit, windowMs = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.times = [];
  }

  tryTake(now = Date.now()) {
    while (this.times.length && now - this.times[0] >= this.windowMs) this.times.shift();
    if (this.times.length >= this.limit) return false;
    this.times.push(now);
    return true;
  }
}

/** 오래 안 쓴 것부터 버리는 기억 (Map 의 넣은 순서를 씀) */
export class LruCache {
  constructor(max = SHARED_CACHE_MAX, entries = []) {
    this.max = max;
    this.map = new Map();
    for (const [k, v] of entries) if (typeof k === 'string' && typeof v === 'string') this.set(k, v);
  }

  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }

  set(k, v) {
    this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }

  entries() {
    return [...this.map.entries()];
  }

  get size() {
    return this.map.size;
  }
}

/** 같은 번역으로 볼 조건: 모델 · 용어집 묶음 · 원문 언어 · 원문 줄이 같음 (앞 문맥은 보지 않음 — 같은 영상의 같은 줄) */
export function cacheKey({ model = '', packs = [], srcLang = 'en', text = '' }) {
  return `${model}|${[...packs].join(',')}|${srcLang}|${String(text).trim()}`;
}

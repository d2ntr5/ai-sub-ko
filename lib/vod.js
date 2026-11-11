// 일반 영상(자막 전체를 받을 수 있는 영상): 자막 줄 목록 만들기, 재생 시각의 줄 찾기, 묶음 나누기
import { clean } from './segment.js';

/** YouTube timedtext(json3) → [{ start, end, text }] (초). 빈 줄·줄바꿈만 있는 이벤트는 뺀다 */
export function parseJson3(body) {
  let data;
  try { data = typeof body === 'string' ? JSON.parse(body) : body; } catch { return []; }
  const out = [];
  for (const ev of data?.events || []) {
    if (!Array.isArray(ev.segs)) continue;
    const text = clean(ev.segs.map(s => s.utf8 || '').join('').replace(/\n+/g, ' '));
    if (!text) continue;
    const start = (ev.tStartMs || 0) / 1000;
    out.push({ start, end: start + (ev.dDurationMs || 2000) / 1000, text });
  }
  return out;
}

/** timedtext 주소에서 영상·언어 정보. 자동 번역(tlang) 주소는 영어 원문이 아니라 null */
export function timedtextInfo(url) {
  try {
    const u = new URL(url);
    if (!u.pathname.includes('/api/timedtext') || u.searchParams.get('tlang')) return null;
    const lang = u.searchParams.get('lang') || '';
    return { videoId: u.searchParams.get('v') || '', lang, asr: u.searchParams.get('kind') === 'asr', english: /^en\b/i.test(lang) };
  } catch {
    return null;
  }
}

/** 브라우저 자막 트랙(TextTrack.cues) → 줄 목록 */
export function cuesFromTrack(cues) {
  return [...(cues || [])].map(c => ({ start: c.startTime, end: c.endTime, text: clean(c.text) })).filter(c => c.text);
}

/** t 초에 보이는 줄: { cur, prev } (가장 늦게 시작한 줄이 cur). 없으면 cur = -1 */
export function activeAt(cues, t) {
  let cur = -1;
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].start > t) break;
    if (t < cues[i].end) cur = i;
  }
  return { cur, prev: cur > 0 ? cur - 1 : -1 };
}

/** 묶음 나누기 → [[시작, 끝)] */
export function batchRanges(n, size) {
  const out = [];
  for (let i = 0; i < n; i += size) out.push([i, Math.min(n, i + size)]);
  return out;
}

/** 지금 재생 위치부터 먼저 번역하도록 묶음 순서를 바꾼다 */
export function orderFrom(ranges, cues, t) {
  const i = ranges.findIndex(([a, b]) => cues[b - 1] && cues[b - 1].end >= t);
  return i <= 0 ? ranges : [...ranges.slice(i), ...ranges.slice(0, i)];
}

/** 미리 번역 저장 키 (같은 영상·같은 자막이면 다시 요청하지 않게) */
export function vodKey(id, cues) {
  let h = 0;
  for (const c of cues) for (let i = 0; i < c.text.length; i++) h = (h * 31 + c.text.charCodeAt(i)) | 0;
  return `${id}:${cues.length}:${(h >>> 0).toString(36)}`;
}

/** 저장해 둔 미리 번역이 너무 많으면 오래된 것부터 지운다 */
export function pruneVodCache(cache, keep = 30) {
  const keys = Object.keys(cache || {}).sort((a, b) => (cache[b].at || 0) - (cache[a].at || 0)).slice(0, keep);
  return Object.fromEntries(keys.map(k => [k, cache[k]]));
}

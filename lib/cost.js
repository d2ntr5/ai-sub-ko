// 사용량·예상 금액. 이 기기에서 센 토큰으로 계산한 대략값 (실제 청구는 Console Billing)

export function dayKey(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function emptyDay() {
  return { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ms: 0, fails: 0 };
}

/** 응답 usage 를 하루 기록에 더한다 (새 객체) */
export function addUsage(day, u, ms = 0) {
  const d = { ...emptyDay(), ...day };
  d.requests += 1;
  d.input += u?.input_tokens || 0;
  d.output += u?.output_tokens || 0;
  d.cacheRead += u?.cache_read_input_tokens || 0;
  d.cacheWrite += u?.cache_creation_input_tokens || 0;
  d.ms += ms;
  return d;
}

/** 달러. 캐시 쓰기는 입력의 1.25배, 캐시 읽기는 0.1배 */
export function costUsd(d, priceIn, priceOut) {
  if (!d) return 0;
  return ((d.input || 0) * priceIn + (d.cacheWrite || 0) * priceIn * 1.25 +
    (d.cacheRead || 0) * priceIn * 0.1 + (d.output || 0) * priceOut) / 1e6;
}

/** 캐시 적중률 (입력 쪽 토큰 중 캐시에서 읽은 비율) */
export function cacheHitRate(d) {
  const total = (d?.input || 0) + (d?.cacheRead || 0) + (d?.cacheWrite || 0);
  return total ? (d.cacheRead || 0) / total : 0;
}

export function sumDays(days, prefix = '') {
  const s = emptyDay();
  for (const [k, d] of Object.entries(days || {})) {
    if (!k.startsWith(prefix)) continue;
    for (const f of Object.keys(s)) s[f] += d[f] || 0;
  }
  return s;
}

/** 최근 n 일만 남긴다 */
export function pruneDays(days, keep = 62) {
  const keys = Object.keys(days || {}).sort().slice(-keep);
  return Object.fromEntries(keys.map(k => [k, days[k]]));
}

export function overCap(day, cap, priceIn, priceOut) {
  return cap > 0 && costUsd(day, priceIn, priceOut) >= cap;
}

/** 다음 자정 (현지 시각) */
export function nextMidnight(now = new Date()) {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

// ===== Gemini 무료 등급: 하루 한도는 태평양 시간 자정에 다시 찬다 =====
const PT = 'America/Los_Angeles';
const ptParts = d => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone: PT, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
}).formatToParts(d).map(p => [p.type, p.value]));

/** 태평양 시간 날짜 'YYYY-MM-DD' */
export function ptDayKey(now = new Date()) {
  const p = ptParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 다음 태평양 시간 자정 (ms). 서머타임(UTC-7)·표준시(UTC-8) 둘 다 확인해 맞는 쪽 */
export function nextPtMidnight(now = new Date()) {
  const p = ptParts(now);
  const base = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + 1);
  for (const off of [7, 8]) {
    const t = base + off * 3600_000;
    if (t > now.getTime() && ptParts(new Date(t)).hour === '00') return t;
  }
  return base + 8 * 3600_000;
}

export function emptyGeminiDay() {
  return { lite: 0, liteIn: 0, liteOut: 0, liteFails: 0, videos: 0 };
}

/** 오늘 남은 Flash Lite 요청 */
export function liteRemaining(gday, rpd) {
  return Math.max(0, rpd - (gday?.lite || 0));
}

/** 마지막 테스트 시각: 오늘이면 '오늘 14:20', 아니면 '10월 25일 09:05' */
export function shortWhen(ts, now = new Date()) {
  const d = new Date(ts), p = n => String(n).padStart(2, '0');
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  return dayKey(d) === dayKey(now) ? `오늘 ${hm}` : `${d.getMonth() + 1}월 ${d.getDate()}일 ${hm}`;
}

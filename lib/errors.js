// API 오류 → 코드와 안내 문구.
// hard = 설정을 고칠 때까지 대신 번역, soft = 1분 뒤 다시, CAP = Claude 하루 비용 상한(자정까지), DAILY = Gemini 하루 한도(태평양 시간 자정까지)
import { ENGINE_NAMES } from './settings.js';

export const HARD = new Set(['NO_KEY', 'BAD_KEY', 'NO_CREDIT', 'BAD_MODEL']);
export const SOFT = new Set(['TIMEOUT', 'RATE_LIMIT', 'NETWORK', 'API_ERROR']);

export function classify(status, message = '') {
  const m = String(message);
  if (status === 401 || status === 403) return 'BAD_KEY';
  if (/credit balance|billing/i.test(m)) return 'NO_CREDIT';
  if (status === 429 || status === 529) return 'RATE_LIMIT';
  if (status === 404 || (status === 400 && /model/i.test(m))) return 'BAD_MODEL';
  return 'API_ERROR';
}

const WHAT = {
  NO_KEY: n => `${n} API 키가 없어요`,
  BAD_KEY: n => `${n} API 키가 잘못됐어요`,
  NO_CREDIT: n => `${n} API 크레딧이 없어요`,
  BAD_MODEL: n => `${n} 모델을 쓸 수 없어요 (상세 설정에서 연결 테스트를 해 주세요)`,
  CAP: () => '오늘 Claude 비용 상한에 닿았어요',
  DAILY: n => `${n} 오늘 무료 한도를 다 썼어요`,
  TIMEOUT: n => `${n} 응답이 늦어요`,
  RATE_LIMIT: n => `${n} 요청이 몰렸어요`,
  NETWORK: () => '네트워크 오류가 났어요',
  API_ERROR: n => `${n} 오류가 났어요`
};

/** 목적격 조사: 받침 있는 한글 끝 → 을, 그 밖(영어 이름 포함) → 를. 영어 이름은 띄어 씀 ("Claude 를") */
export function eul(name) {
  const c = String(name).slice(-1).charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return name + ((c - 0xac00) % 28 ? '을' : '를');
  return `${name} 를`;
}

/** 안내 문구: "Claude 응답이 늦어요 — 1분 동안 크롬 내장 번역을 써요" */
export function describe(code, engine = 'claude', fallback = 'chrome') {
  const what = (WHAT[code] || WHAT.API_ERROR)(ENGINE_NAMES[engine] || engine);
  const to = fallback ? eul(ENGINE_NAMES[fallback] || fallback) : null;
  if (!to) {
    // 대신 번역을 꺼 둠(chromeFallback): 언제 다시 되는지를 알려 준다 (일시 오류는 저절로 다시)
    if (HARD.has(code)) return `${what} — 고칠 때까지 자막을 멈춰요 · 상세 설정에서 확인해 주세요`;
    if (code === 'CAP') return `${what} — 자정까지 자막을 멈춰요`;
    if (code === 'DAILY') return `${what} — 태평양 시간 자정(한국 오후 4~5시)까지 자막을 멈춰요`;
    return `${what} — 자막을 멈췄어요 · 1분 뒤 다시 해 봐요`;
  }
  if (HARD.has(code)) return `${what} — 고칠 때까지 ${to} 써요 · 상세 설정에서 확인해 주세요`;
  if (code === 'CAP') return `${what} — 자정까지 ${to} 써요`;
  if (code === 'DAILY') return `${what} — 태평양 시간 자정(한국 오후 4~5시)까지 ${to} 써요`;
  return `${what} — 1분 동안 ${to} 써요`;
}

/** 0.4 까지 쓰던 Claude → 크롬 문구 (팝업 등) */
export const MESSAGES = Object.fromEntries([...HARD, ...SOFT, 'CAP', 'DAILY'].map(c => [c, describe(c)]));

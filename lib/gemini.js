// Gemini API (Google AI Studio 키): Flash Lite 로 자막 묶음 미리 번역.
// 키는 background 에서만 쓴다.
import { glossaryPrompt } from './glossary.js';
import { packRules } from './prompt.js';

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const BATCH_SIZE = 100;          // 한 번에 보내는 자막 줄 수

export function geminiHeaders(key) {
  return { 'content-type': 'application/json', 'x-goog-api-key': key };
}

const BATCH_RULES = `너는 영상 자막 번역가다. 번호가 붙은 영어 자막 줄들을 한국어 자막으로 옮긴다.

규칙:
- 줄 수와 순서를 그대로 지킨다. 줄을 합치거나 나누지 않는다. 각 줄에는 그 줄의 번역만.
- 앞뒤 줄을 함께 보고 문맥에 맞게 옮긴다. 한 문장이 여러 줄에 걸쳐 있으면 각 줄이 자연스럽게 이어지도록.
- 자막답게 짧고 자연스러운 구어체. 내용을 지어내지 않는다.
- 자동 생성 자막의 음성 인식 오류가 명백하면 문맥상 맞는 뜻으로.
- 숫자·단위·코드·명령어·URL 은 원문 그대로.
- 용어집을 따른다. "(영어 그대로)" 인 말은 번역하지 않고, "→" 가 있으면 그 한국어 표기를 쓴다.
- names 에는 이번 줄들에 나온 사람 이름과 정한 한글 표기를 넣는다 (없으면 빈 배열).`;

/** 미리 번역 지시문: 규칙 + 묶음 규칙 + 이번 줄들에 나온 용어만 */
export function buildBatchSystem(glossary, packs, lines, opts = {}) {
  const extra = packRules(packs, opts);
  return `${BATCH_RULES}${extra ? `\n\n${extra}` : ''}\n\n용어집:\n${glossaryPrompt(glossary, packs, lines.join('\n'))}`;
}

export function buildBatchUser(lines, names = []) {
  const known = names.length ? `지금까지 정한 인물 이름 표기 (그대로 쓸 것):\n${names.map(n => `- ${n.en} → ${n.ko}`).join('\n')}\n\n` : '';
  return `${known}번역할 자막 ${lines.length}줄:\n${lines.map((l, i) => `${i + 1}. ${l.replace(/\n/g, ' ')}`).join('\n')}`;
}

/** thinking: 생각 수준을 minimal 로 (Flash Lite 기본값과 같지만 기본값이 바뀌어도 느려지지 않게). 모델이 거부하면 false 로 다시 */
export function buildBatchBody({ system, lines, names, thinking = true }) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: buildBatchUser(lines, names) }] }],
    generationConfig: {
      ...(thinking ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}),
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          lines: { type: 'ARRAY', items: { type: 'STRING' } },
          names: { type: 'ARRAY', items: { type: 'OBJECT', properties: { en: { type: 'STRING' }, ko: { type: 'STRING' } }, required: ['en', 'ko'] } }
        },
        required: ['lines']
      }
    }
  };
}

export function responseText(data) {
  return (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
}

/** 응답 → { lines: n 개 (못 받은 줄은 null), names } */
export function parseBatch(data, n, src = []) {
  let obj = {};
  try { obj = JSON.parse(responseText(data) || '{}'); } catch { obj = {}; }
  const got = Array.isArray(obj.lines) ? obj.lines : [];
  // 요청을 '1. 원문' 꼴로 보내서 모델이 번호를 따라 붙일 때가 있다 → 원문 줄에 없던 앞 번호는 뗀다
  const NUM = /^\s*\d{1,4}[.)]\s+/;
  const tidy = (t, i) => (NUM.test(t) && !NUM.test(String(src[i] ?? '')) ? t.replace(NUM, '') : t).trim();
  const lines = Array.from({ length: n }, (_, i) => (typeof got[i] === 'string' && got[i].trim() ? tidy(got[i], i) || null : null));
  const names = (Array.isArray(obj.names) ? obj.names : [])
    .filter(x => x && typeof x.en === 'string' && typeof x.ko === 'string' && x.en.trim() && x.ko.trim())
    .map(x => ({ en: x.en.trim().slice(0, 60), ko: x.ko.trim().slice(0, 60) }));
  return { lines, names, complete: got.length === n };
}

export function geminiUsage(data) {
  const u = data?.usageMetadata || {};
  return { input: u.promptTokenCount || 0, output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) };
}

/** HTTP 오류 → 코드. 429 중 하루 한도는 DAILY (태평양 시간 자정까지), 나머지는 분당 한도 */
export function classifyGemini(status, message = '') {
  const m = String(message);
  if (/API key not valid|API_KEY_INVALID|API key expired/i.test(m) || status === 401 || status === 403) return 'BAD_KEY';
  if (status === 429) return /per ?day|PerDay|daily/i.test(m) ? 'DAILY' : 'RATE_LIMIT';
  if (status === 404 || (status === 400 && /model/i.test(m))) return 'BAD_MODEL';
  if (status === 503 || status === 500) return 'RATE_LIMIT';
  return 'API_ERROR';
}

/** 모델 목록(GET /v1beta/models)에서 Flash Lite 최신 이름 */
export function pickGeminiModels(list) {
  const names = (list?.models || []).map(m => String(m.name || '').replace(/^models\//, '')).filter(Boolean);
  const ver = n => Number((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  const lite = names.filter(n => /flash-lite/.test(n) && !/tts|image|live|preview|audio/.test(n))
    .sort((a, b) => ver(b) - ver(a) || a.length - b.length);
  return { lite: lite[0] || null };
}

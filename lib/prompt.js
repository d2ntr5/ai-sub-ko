// 번역 지시문과 Claude 요청 만들기. 지시문(용어집 포함)은 같은 묶음이면 매번 똑같아야 캐시가 걸린다 — 시각·랜덤 값을 넣지 말 것.
import { glossaryPrompt } from './glossary.js';

export const API_URL = 'https://api.anthropic.com/v1/messages';
export const MODELS_URL = 'https://api.anthropic.com/v1/models?limit=100';
export const API_VERSION = '2023-06-01';

const BASE_RULES = `너는 영상 자막 번역가다. 영어 자막을 한국어 자막으로 옮긴다.
자막은 자동 생성(음성 인식)일 수 있어 오타·끊김이 있을 수 있다.

규칙:
- "번역할 자막"만 번역한다. "이전 자막"은 문맥 파악용이며 번역하지 않는다.
- 답은 JSON 의 ko 에 번역문만 넣는다. 설명, 따옴표, 원문, 접두어 금지.
- 자막답게 짧고 자연스러운 구어체.
- 음성 인식 오류가 명백하면 문맥상 맞는 뜻으로 번역한다 (예: "Hamleton" → 해밀턴).
- 문장이 중간에 끊겨 있으면 끊긴 그대로 자연스럽게 옮긴다. 내용을 지어내지 않는다.
- 숫자·단위·코드·명령어·URL 은 원문 그대로.
- 아래 용어집을 따른다. "(영어 그대로)" 인 말은 번역하지 않고, "→" 가 있으면 그 한국어 표기를 쓴다.`;

const F1_RULES = `F1(포뮬러 1) 중계:
- 중계 톤 유지.
- 드라이버 이름은 용어집의 한글 표기를 쓴다. 성만 나오면 성만 한글로 (예: Verstappen → 페르스타펜).
- 용어집에 없는 드라이버는 국내 F1 팬들이 쓰는 한글 표기로.
- 팀 이름은 영어 그대로.
- 랩타임·순위·숫자·드라이버 약어(VER, NOR 등)는 원문 그대로 (P1, 1분 32초 등).
- "Box, box"는 피트인 지시이므로 "박스, 박스"로.`;

const TECH_RULES = `기술 강의·발표:
- 제품·서비스 이름, 코드, 명령어, 파일 이름, 옵션 이름은 영어 그대로.
- 기술 용어는 한국어 기술 문서에서 쓰는 표기를 따른다 (용어집이 먼저).
- 강의하는 말투(해요체)로, 뜻이 정확하게.`;

const JA_RULES = `원문이 일본어인 자막 (음성 번역 — 소리를 받아 적은 글):
- 일본어 자막을 한국어 자막으로 옮긴다. 받아 적은 글이라 문장부호가 없고 낱말이 잘못 들렸을 수 있다.
- 용어집의 영어 표기는 같은 이름·용어의 일본어 표기(가타카나 등)에도 그대로 적용한다 (예: ルクレール = Leclerc → 르클레르).
- 일본어 인명·지명은 국내 표기법(외래어 표기법)을 따른다.`;

function filmRules(o) {
  const lines = ['영화·드라마:'];
  if (o.filmTone !== false) lines.push('- 인물 관계에 맞게 반말·존댓말을 정한다 (친구·가족·연인은 반말, 처음 보는 사람·상사·공적인 자리는 존댓말).');
  if (o.filmNames !== false) lines.push('- 같은 인물 이름은 처음 정한 한글 표기를 끝까지 쓴다.');
  if (o.filmShort !== false) lines.push('- 한 줄은 16자 안팎으로 짧게. 길면 뜻을 줄이되 빠뜨리지 않는다.');
  lines.push('- 욕설·감탄사는 한국 자막 관례에 맞게 자연스럽게.');
  return lines.join('\n');
}

/** 묶음에 맞는 추가 규칙 */
export function packRules(packs, opts = {}) {
  const out = [];
  if (packs.includes('f1')) out.push(F1_RULES);
  // 영화·드라마면 강의 말투(해요체) 규칙은 넣지 않는다 — 제목에 'Cloud'·'AI' 가 든 영화에서 반말·존댓말 규칙과 부딪힘 (기술 용어집은 그대로)
  if (packs.some(p => ['cloud', 'ai', 'dev'].includes(p)) && !packs.includes('film')) out.push(TECH_RULES);
  if (packs.includes('film')) out.push(filmRules(opts));
  if (opts.srcLang === 'ja') out.push(JA_RULES);
  return out.join('\n\n');
}

/** 한 줄씩 번역(Claude·Gemini Live) 지시문 = 규칙 + 묶음 규칙 + 용어집. Haiku 5.5 는 512 토큰 이상이어야 캐시가 걸린다 */
export function buildSystemPrompt(glossary, packs = ['common', 'f1'], opts = {}) {
  const extra = packRules(packs, opts);
  return `${BASE_RULES}${extra ? `\n\n${extra}` : ''}\n\n용어집:\n${glossaryPrompt(glossary, packs)}`;
}

export function buildUserContent(text, context = []) {
  const ctx = context.length ? `이전 자막(문맥 참고용, 번역하지 말 것):\n${context.join('\n')}\n\n` : '';
  return `${ctx}번역할 자막:\n${text}`;
}

/** 답 형식 {ko} — 모델이 번역문 밖에 해설("이 자막은 … 옮기겠습니다")을 붙이지 못하게 (structured outputs) */
export const ANSWER_FORMAT = {
  type: 'json_schema',
  schema: { type: 'object', properties: { ko: { type: 'string' } }, required: ['ko'], additionalProperties: false }
};

/**
 * 생각(thinking)은 끄지 않고(adaptive) 노력 수준 low 로 지연을 줄인다 — 문서 권장 ("effort 로 조절, disabled 말고").
 * Sonnet 5.5 는 thinking disabled 를 400 으로 거부한다. 생각도 max_tokens 에 들어가므로 넉넉히. temperature 는 보내지 않는다
 */
export function buildRequestBody({ model, system, text, context }) {
  return {
    model,
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: ANSWER_FORMAT },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildUserContent(text, context) }]
  };
}

export function buildHeaders(apiKey) {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
    // 확장(브라우저)에서 직접 부를 때 필요. 키는 background 에만 있고 페이지에는 안 간다
    'anthropic-dangerous-direct-browser-access': 'true'
  };
}

/** 응답 {ko} 에서 번역문만. JSON 이 아니면 (거절·max_tokens 로 잘림) 빈 글 → 빈 응답 오류 */
export function extractText(data) {
  const raw = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  try { return String(JSON.parse(raw)?.ko ?? '').trim(); } catch { return ''; }
}

/**
 * 모델 목록(GET /v1/models)에서 계열별 최신 하나씩: { haiku: {id, name}, sonnet: {id, name} }.
 * created_at 이 가장 늦은 것. 그 계열이 없으면 빠진다
 */
export function pickClaudeModels(list) {
  const out = {};
  for (const fam of ['haiku', 'sonnet']) {
    const cands = (list?.data || list || []).filter(m => typeof m?.id === 'string' && m.id.includes(fam));
    cands.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || b.id.localeCompare(a.id));
    if (cands[0]) out[fam] = { id: cands[0].id, name: cands[0].display_name || cands[0].id };
  }
  return out;
}

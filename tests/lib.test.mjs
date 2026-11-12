import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, SYNC_DEFAULTS, MODELS, pickEngine, hasKey } from '../lib/settings.js';
import { DEFAULT_GLOSSARY, PACKS, sanitizeGlossary, glossaryPrompt, fixChromeTranslation, cleanEntry, entriesFor } from '../lib/glossary.js';
import { buildSystemPrompt, buildRequestBody, buildHeaders, extractText, buildUserContent, pickClaudeModels, packRules } from '../lib/prompt.js';
import { classify, HARD, SOFT, MESSAGES, describe, eul } from '../lib/errors.js';
import { addUsage, costUsd, cacheHitRate, sumDays, pruneDays, overCap, dayKey, nextMidnight, emptyDay, ptDayKey, nextPtMidnight, liteRemaining, shortWhen } from '../lib/cost.js';
import { Segmenter, pushHistory, isContinuation, endsSentence, clean, isKorean } from '../lib/segment.js';
import { siteFor, siteEnabled, autoPacks, packsFor, originPattern, hostFromInput } from '../lib/sites.js';
import { parseJson3, timedtextInfo, cuesFromTrack, activeAt, batchRanges, orderFrom, vodKey, pruneVodCache } from '../lib/vod.js';
import { buildBatchSystem, buildBatchBody, buildBatchUser, parseBatch, classifyGemini, pickGeminiModels, geminiUsage } from '../lib/gemini.js';
import { exportPacks, toJSON, toCSV, parseCSV, parseImport, previewImport, applyImport, exportFileName, packIdFromName } from '../lib/glossary-io.js';

test('설정 정리', () => {
  assert.deepEqual(normalize({}), SYNC_DEFAULTS);
  assert.equal(normalize({ dailyCapUsd: '' }).dailyCapUsd, SYNC_DEFAULTS.dailyCapUsd, '빈 상한 칸은 0(없음)이 아니라 기본값');
  assert.equal(normalize({ dailyCapUsd: '-5' }).dailyCapUsd, 0);
  assert.equal(normalize({ dailyCapUsd: '2.5' }).dailyCapUsd, 2.5);
  assert.equal(normalize({ priceIn: '' }).priceIn, SYNC_DEFAULTS.priceIn);
  const s = normalize({ bottomPct: 99, fontScale: 'x', lines: 1.6, displayMode: '?', model: 'other', priceIn: -1, chromeFallback: 'x', siteOn: { f1: false, bad: 1 }, customSites: ['Ex.com', 'ex.com', 'bad host', 3] });
  assert.equal(s.bottomPct, 40);
  assert.equal(s.fontScale, SYNC_DEFAULTS.fontScale);
  assert.equal(s.chromeFallback, true);
  assert.equal(s.displayMode, undefined);
  assert.equal(s.lines, undefined);
  assert.equal(s.model, 'claude-haiku-5-5');
  assert.equal(s.priceIn, SYNC_DEFAULTS.priceIn);
  assert.deepEqual(s.siteOn, { f1: false });
  assert.deepEqual(s.customSites, ['ex.com']);
  assert.equal(MODELS[0].id, SYNC_DEFAULTS.model);
});

test('옛 설정 옮기기 (0.3 보기 설정, 0.4·0.5 엔진)', () => {
  assert.deepEqual(pick(normalize({ displayMode: 'ko', lines: 1 })), { showPrev: false, showEn: false, hideOriginal: true });
  assert.deepEqual(pick(normalize({ displayMode: 'koEn', lines: 2 })), { showPrev: true, showEn: true, hideOriginal: true });
  assert.deepEqual(pick(normalize({ displayMode: 'both' })), { showPrev: true, showEn: false, hideOriginal: false });
  assert.deepEqual(pick(normalize({ displayMode: 'both', showEn: true, hideOriginal: true, showPrev: 'x' })), { showPrev: true, showEn: true, hideOriginal: true });
  const old = normalize({ engine: 'chrome', engineLive: 'live', engineVod: 'lite', fallback: 'none' });
  assert.deepEqual([old.engine, old.engineLive, old.engineVod, old.fallback], [undefined, undefined, undefined, undefined], '엔진은 이제 자동');
  assert.equal(old.chromeFallback, false, "fallback: 'none' → 크롬 대신 번역 끔");
  assert.equal(normalize({ fallback: 'chrome' }).chromeFallback, true);
  assert.equal(normalize({ fallback: 'none', chromeFallback: true }).chromeFallback, true, '새 키가 있으면 옛 키는 무시');
});

function pick(s) {
  return { showPrev: s.showPrev, showEn: s.showEn, hideOriginal: s.hideOriginal };
}

test('엔진 고르기: 키가 있는 것 중 자동, 탭에서 고른 것은 키가 있을 때만', () => {
  const both = { claude: true, gemini: true }, none = {}, onlyG = { gemini: true }, onlyC = { claude: true };
  assert.equal(pickEngine('vod', both), 'lite');
  assert.equal(pickEngine('live', both), 'claude');
  assert.equal(pickEngine('vod', onlyC), 'claude', 'Gemini 키 없으면 Claude');
  assert.equal(pickEngine('vod', none), 'chrome');
  assert.equal(pickEngine('live', onlyG), 'chrome', 'Flash Lite 는 라이브에 안 씀');
  assert.equal(pickEngine('vod', both, 'chrome'), 'chrome');
  assert.equal(pickEngine('vod', onlyG, 'claude'), 'lite', '키 없는 엔진은 고를 수 없음 → 자동');
  assert.equal(pickEngine('live', both, 'lite'), 'claude', '라이브에서 Flash Lite 를 골라도 라이브 순서');
  assert.equal(pickEngine('live', both, 'live'), 'claude', '없어진 엔진은 무시');
  assert.ok(hasKey('chrome', none));
  assert.ok(!hasKey('claude', onlyG) && hasKey('lite', onlyG));
});

test('용어집 기본값: 묶음 6개, F1 22명, 클라우드에 AWS·GCP·Azure', () => {
  assert.deepEqual(PACKS.map(p => p.id), ['common', 'f1', 'cloud', 'ai', 'dev', 'film']);
  const f1 = DEFAULT_GLOSSARY.packs.f1;
  assert.equal(f1.filter(x => x.group === '드라이버').length, 22);
  assert.ok(f1.filter(x => x.group === '팀').every(x => x.kind === 'keep'));
  const groups = new Set(DEFAULT_GLOSSARY.packs.cloud.map(x => x.group));
  for (const g of ['공통', 'AWS', 'GCP', 'Azure']) assert.ok(groups.has(g), g);
  assert.ok(DEFAULT_GLOSSARY.packs.film.length > 30);
  // 기본값 자체도 정리 규칙을 통과해야 한다 (중복·빈 줄 없음)
  for (const [id, list] of Object.entries(DEFAULT_GLOSSARY.packs)) {
    assert.equal(sanitizeGlossary(DEFAULT_GLOSSARY).packs[id].length, list.length, id);
  }
});

test('용어집 정리·옛 형식 옮기기', () => {
  assert.equal(cleanEntry({ en: 'Lambda', ko: '람다', kind: 'keep' }).ko, '', '그대로는 한국어 칸 비움');
  assert.equal(cleanEntry({ en: 'x', ko: '', kind: 'ko' }), null);
  assert.equal(cleanEntry({ en: '', ko: 'y' }), null);
  const v1 = sanitizeGlossary({ drivers: [['A', '에이'], ['a', '중복'], ['', 'x'], 'bad'], teams: [['T', 'T']], terms: [['DRS', 'DRS'], ['box', '박스']] });
  assert.deepEqual(v1.packs.f1, [
    { en: 'A', ko: '에이', kind: 'ko', group: '드라이버' },
    { en: 'T', ko: '', kind: 'keep', group: '팀' },
    { en: 'DRS', ko: '', kind: 'keep', group: '용어' },
    { en: 'box', ko: '박스', kind: 'ko', group: '용어' }
  ]);
  assert.ok(v1.packs.cloud.length > 50, '다른 묶음은 기본값');
  const v2 = sanitizeGlossary({ packs: { cloud: [{ en: 'x', ko: '엑스', kind: 'ko' }], 내묶음: [{ en: 'y', kind: 'keep' }] } });
  assert.equal(v2.packs.cloud.length, 1);
  assert.equal(v2.packs['내묶음'].length, 1);
  assert.ok(v2.packs.film.length > 0, '빠진 기본 묶음은 채움');
});

test('지시문 용어집: 묶음별, 글에 나온 말만 고르기', () => {
  const p = glossaryPrompt(DEFAULT_GLOSSARY, ['common', 'f1']);
  assert.match(p, /\[F1\]/);
  assert.match(p, /Max Verstappen → 막스 페르스타펜/);
  assert.match(p, /- DRS \(영어 그대로\)/);
  const only = glossaryPrompt(DEFAULT_GLOSSARY, ['common', 'cloud'], 'Put it in an S3 bucket in one availability zone');
  assert.match(only, /S3 \(영어 그대로\)/);
  assert.match(only, /bucket → 버킷 \(다른 뜻으로 옮기지 말 것\)/);
  assert.match(only, /availability zone → 가용 영역/);
  assert.doesNotMatch(only, /Lambda/);
  assert.equal(glossaryPrompt(DEFAULT_GLOSSARY, ['common']), '(없음)');
  assert.equal(entriesFor(DEFAULT_GLOSSARY, ['f1'], 'Verstappen pits').length, 1, '성만 나와도');
});

test('크롬 번역 보정', () => {
  const out = fixChromeTranslation('Verstappen 은 가상 안전 차량 아래 피트 정지, Max Verstappen 체크 무늬 깃발', DEFAULT_GLOSSARY, ['common', 'f1']);
  assert.equal(out, '페르스타펜 은 버추얼 세이프티카 아래 피트스톱, 막스 페르스타펜 체커기');
  assert.equal(fixChromeTranslation('안전 차량', DEFAULT_GLOSSARY, ['f1']), '세이프티카');
  assert.equal(fixChromeTranslation('양동이에 넣고 가용성 영역', DEFAULT_GLOSSARY, ['cloud']), '버킷에 넣고 가용 영역');
  assert.equal(fixChromeTranslation('availability zone 두 개', DEFAULT_GLOSSARY, ['cloud']), '가용 영역 두 개', '영어로 남은 말은 한국어 표기로');
  assert.equal(fixChromeTranslation('안전 차량', DEFAULT_GLOSSARY, ['cloud']), '안전 차량', 'F1 아니면 F1 보정 안 함');
});

test('지시문은 캐시가 걸릴 만큼 길고 매번 같다 (F1)', () => {
  const a = buildSystemPrompt(DEFAULT_GLOSSARY), b = buildSystemPrompt(DEFAULT_GLOSSARY);
  assert.equal(a, b);
  // Haiku 5.5 최소 캐시 512 토큰 — 한국어·영어 섞인 글은 대략 2.5자/토큰 이하라 1,500자면 넉넉히 넘는다
  assert.ok(a.length > 1500, `지시문 ${a.length}자`);
  assert.match(a, /막스 페르스타펜/);
  assert.match(a, /F1\(포뮬러 1\) 중계/);
});

test('묶음 규칙: 기술·영화', () => {
  assert.match(packRules(['common', 'cloud']), /제품·서비스 이름/);
  assert.equal(packRules(['common']), '');
  const film = packRules(['film'], { filmTone: true, filmNames: false, filmShort: true });
  assert.match(film, /반말·존댓말/);
  assert.doesNotMatch(film, /처음 정한 한글 표기/);
  assert.match(film, /16자/);
  const sys = buildSystemPrompt(DEFAULT_GLOSSARY, ['common', 'film'], {});
  assert.match(sys, /\[영화·드라마\]/);
  assert.doesNotMatch(sys, /포뮬러/);
});

test('요청 본문·헤더', () => {
  const body = buildRequestBody({ model: 'claude-haiku-5-5', system: 'S', text: 'Box box', context: ['a', 'b'] });
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.deepEqual(body.thinking, { type: 'adaptive' });
  assert.equal(body.output_config.effort, 'low');
  assert.deepEqual(body.output_config.format.schema.required, ['ko']);
  assert.equal(body.temperature, undefined);
  assert.deepEqual(body.system[0].cache_control, { type: 'ephemeral' });
  assert.equal(body.messages[0].content, '이전 자막(문맥 참고용, 번역하지 말 것):\na\nb\n\n번역할 자막:\nBox box');
  assert.equal(buildUserContent('x'), '번역할 자막:\nx');
  const h = buildHeaders('sk-ant-x');
  assert.equal(h['x-api-key'], 'sk-ant-x');
  assert.equal(h['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(extractText({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"ko":" 박스 "}' }] }), '박스');
  assert.equal(extractText({ content: [{ type: 'text', text: '이 자막은 … 옮기겠습니다.' }] }), '');
  assert.equal(extractText({ content: [{ type: 'text', text: '{"ko":"잘' }] }), '');
  assert.equal(extractText({}), '');
});

test('Claude 모델 목록에서 계열별 최신', () => {
  const r = pickClaudeModels({ data: [
    { id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', created_at: '2026-05-01T00:00:00Z' },
    { id: 'claude-haiku-5-6', display_name: 'Claude Haiku 5.6', created_at: '2026-09-01T00:00:00Z' },
    { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', created_at: '2026-05-01T00:00:00Z' },
    { id: 'claude-opus-5-5', created_at: '2026-10-01T00:00:00Z' }
  ] });
  assert.deepEqual(r, { haiku: { id: 'claude-haiku-5-6', name: 'Claude Haiku 5.6' }, sonnet: { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' } });
  assert.deepEqual(pickClaudeModels({ data: [] }), {});
});

test('오류 분류·문구', () => {
  assert.equal(classify(401, ''), 'BAD_KEY');
  assert.equal(classify(400, 'Your credit balance is too low'), 'NO_CREDIT');
  assert.equal(classify(429, ''), 'RATE_LIMIT');
  assert.equal(classify(529, 'Overloaded'), 'RATE_LIMIT');
  assert.equal(classify(404, 'model: claude-x'), 'BAD_MODEL');
  assert.equal(classify(400, 'invalid model'), 'BAD_MODEL');
  assert.equal(classify(500, ''), 'API_ERROR');
  for (const c of [...HARD, ...SOFT, 'CAP', 'DAILY']) assert.ok(MESSAGES[c], c);
  assert.equal(describe('TIMEOUT', 'claude', 'chrome'), 'Claude 응답이 늦어요 — 1분 동안 크롬 내장 번역을 써요');
  assert.equal(describe('NO_CREDIT', 'claude', 'chrome'), 'Claude API 크레딧이 없어요 — 고칠 때까지 크롬 내장 번역을 써요 · 상세 설정에서 확인해 주세요');
  assert.match(describe('DAILY', 'lite', 'claude'), /^Gemini Flash Lite 오늘 무료 한도를 다 썼어요 — 태평양 시간 자정.*Claude 를 써요$/);
  assert.equal(describe('RATE_LIMIT', 'claude', null), 'Claude 요청이 몰렸어요 — 자막을 멈췄어요 · 1분 뒤 다시 해 봐요');
  assert.match(describe('BAD_KEY', 'claude', null), /고칠 때까지 자막을 멈춰요 · 상세 설정/);
  assert.match(describe('CAP', 'claude', null), /자정까지 자막을 멈춰요$/);
  assert.deepEqual(['크롬 내장 번역', '번역 모델', 'Claude'].map(eul), ['크롬 내장 번역을', '번역 모델을', 'Claude 를']);
});

test('사용량·금액', () => {
  let d = addUsage(undefined, { input_tokens: 150, output_tokens: 50, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 }, 800);
  d = addUsage(d, { input_tokens: 150, output_tokens: 50, cache_creation_input_tokens: 900 }, 1200);
  assert.equal(d.requests, 2);
  assert.equal(d.ms, 2000);
  // (300*0.1 + 900*0.1*1.25 + 900*0.1*0.1 + 100*0.5) / 1e6
  assert.ok(Math.abs(costUsd(d, 0.10, 0.50) - (30 + 112.5 + 9 + 50) / 1e6) < 1e-12);
  assert.ok(Math.abs(cacheHitRate(d) - 900 / 2100) < 1e-9);
  assert.equal(overCap(d, 0, 0.1, 0.5), false);
  assert.equal(overCap(d, 0.0001, 0.1, 0.5), true);
  const days = { '2026-10-01': d, '2026-10-02': d, '2026-09-30': d };
  assert.equal(sumDays(days, '2026-10').requests, 4);
  assert.deepEqual(Object.keys(pruneDays(days, 2)), ['2026-10-01', '2026-10-02']);
  assert.equal(dayKey(new Date(2026, 9, 5)), '2026-10-05');
  assert.equal(new Date(nextMidnight(new Date(2026, 9, 5, 13))).getDate(), 6);
  assert.deepEqual(emptyDay().fails, 0);
  assert.equal(addUsage({ chrome: 3 }, {}, 0).chrome, 3, '크롬 횟수는 그대로 남음');
});

test('태평양 시간 날짜·자정 (Gemini 하루 한도)', () => {
  // 2026-10-26 10:00 KST = 2026-10-26 01:00 UTC = 2026-10-25 18:00 PDT
  const t = new Date('2026-10-26T01:00:00Z');
  assert.equal(ptDayKey(t), '2026-10-25');
  assert.equal(new Date(nextPtMidnight(t)).toISOString(), '2026-10-26T07:00:00.000Z', '서머타임 UTC-7');
  // 서머타임 끝난 뒤 (11월)
  assert.equal(new Date(nextPtMidnight(new Date('2026-11-10T12:00:00Z'))).toISOString(), '2026-11-11T08:00:00.000Z', '표준시 UTC-8');
  // 서머타임이 끝나는 날 (2026-11-01): 그날 자정은 PDT, 다음 자정은 PST
  assert.equal(new Date(nextPtMidnight(new Date('2026-11-01T12:00:00Z'))).toISOString(), '2026-11-02T08:00:00.000Z');
  assert.equal(liteRemaining({ lite: 32 }, 500), 468);
  assert.equal(liteRemaining({ lite: 600 }, 500), 0);
});

test('마지막 테스트 시각 표시', () => {
  const now = new Date(2026, 9, 26, 15, 0);
  assert.equal(shortWhen(new Date(2026, 9, 26, 14, 5).getTime(), now), '오늘 14:05');
  assert.equal(shortWhen(new Date(2026, 9, 25, 9, 7).getTime(), now), '10월 25일 09:07');
});

test('롤업 자막 끊기', () => {
  const s = new Segmenter();
  assert.equal(s.onSource('Box', 0), 350);
  assert.equal(s.onSource('Box', 100), undefined, '같으면 그대로');
  assert.equal(s.onSource('Box box', 200), 350);
  assert.equal(s.onSource('Box box Verstappen', 1300), 0, '1.2초 넘게 바뀌면 바로');
  s.started();
  assert.equal(s.onSource('Box box Verstappen pits.', 1400), 0, '문장이 끝나면 바로');
  assert.equal(s.onSource('', 1500), null);
  assert.ok(endsSentence('Is it rain?"'));
  assert.ok(!endsSentence('and the'));
  assert.equal(clean('  <c>Hello</c>&nbsp; world \n\n  next '), 'Hello world\nnext');
  assert.equal(clean('>> Yeah. >> when they\'re using AI.'), "Yeah. when they're using AI.", '화자 표시 >> 빼기');
  assert.equal(clean('>> [music]\n>> AI was like'), '[music]\nAI was like');
  assert.equal(clean('>>'), '');
  assert.equal(clean('if a >> b'), 'if a b');
  assert.equal(clean('<v Instructor>A VPC &amp; a subnet &lt;3 &#39;ok&#x27; &bogus;'), "A VPC & a subnet <3 'ok' &bogus;", 'WebVTT 문자 참조 풀기');
  assert.equal(clean('&gt;&gt; next'), 'next', '참조로 온 화자 표시도 빼기');
  assert.equal(clean('a->b x>>y'), 'a->b x>>y', '낱말에 붙은 > 는 그대로');
});

test('문맥 기록·두 줄', () => {
  let h = pushHistory([], 'Box');
  h = pushHistory(h, 'Box box');
  h = pushHistory(h, 'Norris leads');
  assert.deepEqual(h, ['Box box', 'Norris leads']);
  assert.equal(pushHistory(Array.from({ length: 25 }, (_, i) => `l${i}`), 'new').length, 20);
  assert.ok(isContinuation('Box box', 'Box box Verstappen'));
  assert.ok(!isContinuation('Box box', 'Norris leads'));
  assert.ok(!isContinuation('', 'x'));
});

test('사이트·묶음 고르기', () => {
  assert.equal(siteFor('f1tv.formula1.com').id, 'f1');
  assert.equal(siteFor('www.youtube.com').id, 'youtube');
  assert.equal(siteFor('explore.skillbuilder.aws').id, 'skillbuilder');
  assert.equal(siteFor('anthropic.skilljar.com').id, 'academy');
  assert.equal(siteFor('other.skilljar.com'), null);
  assert.equal(siteFor('notyoutube.com'), null);
  assert.equal(siteFor('learn.example.com', ['example.com']).id, 'example.com');
  assert.ok(siteEnabled(normalize({}), siteFor('www.youtube.com')));
  assert.ok(!siteEnabled(normalize({ siteOn: { youtube: false } }), siteFor('www.youtube.com')));
  assert.deepEqual(autoPacks('AWS re:Invent keynote — Claude on Bedrock'), ['cloud', 'ai']);
  assert.deepEqual(autoPacks('2026 Japanese Grand Prix highlights | F1'), ['f1']);
  assert.deepEqual(autoPacks('Dune: Part Three | Official Trailer'), ['film']);
  assert.deepEqual(packsFor(siteFor('f1tv.formula1.com'), 'anything'), ['common', 'f1']);
  assert.deepEqual(packsFor(siteFor('explore.skillbuilder.aws'), ''), ['common', 'cloud', 'dev']);
  assert.deepEqual(packsFor(siteFor('www.youtube.com'), 'Azure Functions tutorial', 'common'), ['common']);
  assert.deepEqual(originPattern('https://learn.example.com/a?b'), { host: 'learn.example.com', pattern: 'https://learn.example.com/*' });
  assert.equal(originPattern('chrome://extensions'), null);
  assert.equal(hostFromInput(' Learn.Example.com/path '), 'learn.example.com');
  assert.equal(hostFromInput('localhost'), null);
});

test('YouTube 자막 전체(json3)·재생 시각의 줄', () => {
  const body = JSON.stringify({ events: [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] },
    { tStartMs: 1500, dDurationMs: 10, segs: [{ utf8: '\n' }] },
    { tStartMs: 2000, dDurationMs: 3000, segs: [{ utf8: 'and that\'s why' }] },
    { tStartMs: 4000 }
  ] });
  const cues = parseJson3(body);
  assert.deepEqual(cues, [{ start: 0, end: 2, text: 'Hello world' }, { start: 2, end: 5, text: "and that's why" }]);
  assert.deepEqual(parseJson3('not json'), []);
  assert.deepEqual(parseJson3(JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '>> Hi' }, { utf8: ' >> there' }] }] })),
    [{ start: 0, end: 1, text: 'Hi there' }], '자동 자막의 >> 도 뺀다');
  assert.deepEqual(activeAt(cues, 2.5), { cur: 1, prev: 0 });
  assert.deepEqual(activeAt(cues, 1), { cur: 0, prev: -1 });
  assert.equal(activeAt(cues, 9).cur, -1);
  assert.deepEqual(timedtextInfo('https://www.youtube.com/api/timedtext?v=abc123&lang=en&kind=asr&fmt=json3'), { videoId: 'abc123', lang: 'en', asr: true, english: true });
  assert.equal(timedtextInfo('https://www.youtube.com/api/timedtext?v=abc&lang=en&tlang=ko'), null, '자동 번역 주소는 원문이 아님');
  assert.equal(timedtextInfo('https://www.youtube.com/api/timedtext?v=abc&lang=ja').english, false);
  assert.deepEqual(cuesFromTrack([{ startTime: 1, endTime: 2, text: '<i>Hi</i>' }, { startTime: 2, endTime: 3, text: ' ' }]), [{ start: 1, end: 2, text: 'Hi' }]);
});

test('미리 번역 묶음 나누기·순서·저장', () => {
  assert.deepEqual(batchRanges(250, 100), [[0, 100], [100, 200], [200, 250]]);
  const cues = Array.from({ length: 250 }, (_, i) => ({ start: i, end: i + 1, text: `l${i}` }));
  assert.deepEqual(orderFrom(batchRanges(250, 100), cues, 150), [[100, 200], [200, 250], [0, 100]], '지금 위치부터');
  assert.deepEqual(orderFrom(batchRanges(250, 100), cues, 0)[0], [0, 100]);
  assert.equal(vodKey('yt:a', cues), vodKey('yt:a', cues.map(c => ({ ...c }))));
  assert.notEqual(vodKey('yt:a', cues), vodKey('yt:a', cues.slice(1)));
  const cache = Object.fromEntries(Array.from({ length: 35 }, (_, i) => [`k${i}`, { at: i }]));
  const pruned = pruneVodCache(cache, 30);
  assert.equal(Object.keys(pruned).length, 30);
  assert.ok(!('k0' in pruned) && 'k34' in pruned, '오래된 것부터 지움');
});

test('Gemini 미리 번역 요청·응답', () => {
  const sys = buildBatchSystem(DEFAULT_GLOSSARY, ['common', 'cloud'], ['Create a Lambda function', 'in your region']);
  assert.match(sys, /줄 수와 순서를 그대로/);
  assert.match(sys, /Lambda \(영어 그대로\)/);
  assert.match(sys, /region → 리전/);
  assert.doesNotMatch(sys, /BigQuery/, '나온 용어만');
  assert.equal(buildBatchUser(['a', 'b\nc']), '번역할 자막 2줄:\n1. a\n2. b c');
  assert.match(buildBatchUser(['a'], [{ en: 'Paul', ko: '폴' }]), /Paul → 폴/);
  const body = buildBatchBody({ system: 'S', lines: ['a'], names: [] });
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(body.generationConfig.responseSchema.required, ['lines']);
  const data = { candidates: [{ content: { parts: [{ text: '{"lines":["가"," ",null],"names":[{"en":"Paul","ko":"폴"},{"en":""}]}' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } };
  assert.deepEqual(parseBatch(data, 3), { lines: ['가', null, null], names: [{ en: 'Paul', ko: '폴' }], complete: true });
  assert.deepEqual(parseBatch({}, 2).lines, [null, null]);
  assert.deepEqual(geminiUsage(data), { input: 100, output: 20 });
});

test('Gemini 오류·모델 목록', () => {
  assert.equal(classifyGemini(400, 'API key not valid. Please pass a valid API key.'), 'BAD_KEY');
  assert.equal(classifyGemini(403, ''), 'BAD_KEY');
  assert.equal(classifyGemini(429, 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 500, quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier'), 'DAILY');
  assert.equal(classifyGemini(429, 'Quota exceeded ... PerMinute'), 'RATE_LIMIT');
  assert.equal(classifyGemini(404, 'models/x is not found'), 'BAD_MODEL');
  assert.equal(classifyGemini(503, 'overloaded'), 'RATE_LIMIT');
  const picked = pickGeminiModels({ models: [
    { name: 'models/gemini-3.1-flash-lite' }, { name: 'models/gemini-3.5-flash-lite' }, { name: 'models/gemini-3.5-flash-lite-preview-tts' },
    { name: 'models/gemini-3.5-live-translate-preview' }, { name: 'models/gemini-3.8-flash' }
  ] });
  assert.deepEqual(picked, { lite: 'gemini-3.5-flash-lite' });
  assert.deepEqual(pickGeminiModels({}), { lite: null });
});

test('용어집 내보내기·가져오기 (JSON·CSV)', () => {
  const g = sanitizeGlossary({ packs: { cloud: [{ en: 'region', ko: '지역', kind: 'ko', group: '공통' }, { en: 'Lambda', kind: 'keep', group: 'AWS' }] } });
  assert.deepEqual(Object.keys(exportPacks(g, 'pack', 'cloud')), ['cloud']);
  const edited = exportPacks(g, 'edited');
  assert.deepEqual(edited.cloud, [{ en: 'region', ko: '지역', kind: 'ko', group: '공통' }], '기본값과 다른 줄만');
  assert.ok(!edited.f1);
  const json = toJSON({ cloud: g.packs.cloud });
  assert.deepEqual(parseImport(json).packs.cloud, g.packs.cloud, 'JSON 왕복');
  const csv = toCSV({ cloud: g.packs.cloud, film: [{ en: 'Hi, "you"', ko: '안녕, 너', kind: 'ko', group: '관용' }] });
  assert.ok(csv.startsWith('﻿묶음,구분,영어,처리,한국어\r\n'));
  assert.match(csv, /클라우드,AWS,Lambda,그대로,\r\n/);
  const back = parseImport(csv);
  assert.deepEqual(back.packs.cloud, g.packs.cloud, 'CSV 왕복');
  assert.equal(back.packs.film[0].en, 'Hi, "you"', '쉼표·따옴표');
  assert.deepEqual(parseCSV('a,"b\nc",d\r\ne'), [['a', 'b\nc', 'd'], ['e']]);
  assert.equal(packIdFromName('영화·드라마'), 'film');
  assert.equal(packIdFromName('내 묶음'), '내 묶음');
});

test('가져오기 검사·미리보기·적용', () => {
  const csv = [
    '묶음,구분,영어,처리,한국어',
    '클라우드,공통,region,한국어,리전',
    '클라우드,공통,landing zone,한국어,랜딩 존 2',
    '클라우드,GCP,Cloud Functions,그대로,',
    '클라우드,,serverless,바꿈,서버리스',
    '클라우드,,,한국어,빈 영어',
    '클라우드,,thing,한국어,',
    '내 묶음,,foo,한국어,푸',
    ''
  ].join('\n');
  const inc = parseImport(csv);
  assert.deepEqual(inc.skipped.map(s => [s.line, s.reason]), [
    ['5번째 줄', '처리 값은 한국어 · 그대로 · 막기 중 하나여야 해요'],
    ['6번째 줄', '영어 칸이 비어 있어요'],
    ['7번째 줄', '한국어 칸이 비어 있어요']
  ]);
  const base = sanitizeGlossary({ packs: { cloud: [{ en: 'region', ko: '지역', kind: 'ko', group: '공통' }, { en: 'Cloud Functions', kind: 'keep', group: 'GCP' }, { en: 'VPC', kind: 'keep', group: '공통' }] } });
  const pv = previewImport(base, inc);
  assert.deepEqual(pv.added.map(a => a.entry.en), ['landing zone', 'foo']);
  assert.deepEqual(pv.changed.map(c => [c.entry.en, c.before.ko, c.entry.ko]), [['region', '지역', '리전']]);
  assert.equal(pv.same, 1);
  const merged = applyImport(base, inc, 'merge');
  assert.deepEqual(merged.packs.cloud.map(x => x.en), ['region', 'Cloud Functions', 'VPC', 'landing zone']);
  assert.equal(merged.packs.cloud[0].ko, '리전');
  assert.equal(merged.packs['내 묶음'].length, 1, '없는 묶음 이름 → 새 묶음');
  const replaced = applyImport(base, inc, 'replace');
  assert.deepEqual(replaced.packs.cloud.map(x => x.en), ['region', 'landing zone', 'Cloud Functions'], '파일에 없는 VPC 는 지워짐');
  assert.equal(replaced.packs.f1.length, base.packs.f1.length, '다른 묶음은 그대로');
  assert.throws(() => parseImport('a,b\n1,2'), /첫 줄은/);
  assert.throws(() => parseImport('{"x":1}'), /용어집 파일이 아니에요/);
  assert.throws(() => parseImport(''), /빈 파일/);
  const legacy = parseImport(JSON.stringify({ drivers: [['Max Verstappen', '막스']], teams: [], terms: [] }));
  assert.equal(legacy.packs.f1[0].ko, '막스', '0.4 까지의 JSON');
  assert.equal(exportFileName('pack', 'cloud', 'json', new Date(2026, 9, 26)), 'ai-sub-ko-용어집-클라우드-20261026.json');
  assert.equal(exportFileName('all', 'cloud', 'csv', new Date(2026, 0, 2)), 'ai-sub-ko-용어집-전체-20260102.csv');
});

test('isKorean: 이미 한국어인 자막은 번역 원문이 아님', () => {
  assert.equal(isKorean('용어를 사용 했더니 Cursor가\n단번에 정확히 수행 했네요.'), true);
  assert.equal(isKorean('Suno에서 음성'), true);
  assert.equal(isKorean('the background of music along with it.'), false);
  assert.equal(isKorean('Sam Altman 이 말했다 that ChatGPT uses water'), false);
  assert.equal(isKorean(''), false);
});

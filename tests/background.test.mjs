// background.js 를 가짜 chrome·fetch·WebSocket 으로 돌려 본다 (실제 API 호출 없음)
import test from 'node:test';
import assert from 'node:assert/strict';

const store = { sync: {}, local: {}, session: {} };
const listeners = [];
function area(name) {
  return {
    async get(keys) {
      const s = store[name];
      if (keys == null) return structuredClone(s);
      if (typeof keys === 'string') return keys in s ? { [keys]: structuredClone(s[keys]) } : {};
      if (Array.isArray(keys)) return Object.fromEntries(keys.filter(k => k in s).map(k => [k, structuredClone(s[k])]));
      return Object.fromEntries(Object.entries(keys).map(([k, d]) => [k, k in s ? s[k] : d]));
    },
    async set(obj) { Object.assign(store[name], structuredClone(obj)); },
    async remove(k) { for (const x of [].concat(k)) delete store[name][x]; }
  };
}
const registered = [];
const injected = [];
// 음성 번역(1.0)용 가짜: offscreen 문서 · 탭 소리 · 탭 메시지 · 단축키
const fake = { offscreen: false, offReplies: {}, toOff: [], toTab: [], badge: {}, captureError: null, commands: [], contentPresent: true, permAdded: [], installed: [], granted: new Set() };
globalThis.chrome = {
  storage: { sync: area('sync'), local: area('local'), session: area('session') },
  runtime: {
    onMessage: { addListener: f => listeners.push(f) },
    onInstalled: { addListener: f => fake.installed.push(f) },
    onStartup: { addListener: () => {} },
    openOptionsPage: () => {},
    async sendMessage(m) { fake.toOff.push(m); const r = fake.offReplies[m.type]; return typeof r === 'function' ? r(m) : r; }
  },
  offscreen: {
    async hasDocument() { return fake.offscreen; },
    async createDocument(o) { fake.offscreen = true; fake.offUrl = o.url; fake.offReasons = o.reasons; },
    async closeDocument() { fake.offscreen = false; }
  },
  tabCapture: { async getMediaStreamId({ targetTabId }) { if (fake.captureError) throw new Error(fake.captureError); return `stream-${targetTabId}`; } },
  tabs: {
    async sendMessage(tabId, m) {
      fake.toTab.push([tabId, m]);
      if (m.type === 'f1ko-ping') { if (!fake.contentPresent) throw new Error('no receiver'); return { ok: true }; }
      if (m.type === 'f1ko-status') return { packs: ['common', 'f1'] };
      return undefined;
    },
    onRemoved: { addListener: () => {} }
  },
  action: { async setBadgeText({ tabId, text }) { fake.badge[tabId] = text; }, async setBadgeBackgroundColor() {} },
  commands: { onCommand: { addListener: f => fake.commands.push(f) } },
  scripting: {
    async getRegisteredContentScripts({ ids }) { return registered.filter(r => ids.includes(r.id)); },
    async registerContentScripts(list) { registered.push(...list); },
    async unregisterContentScripts({ ids }) { for (const id of ids) registered.splice(registered.findIndex(r => r.id === id), 1); },
    async insertCSS(o) { injected.push(['css', o]); },
    async executeScript(o) { injected.push(['js', o]); }
  },
  permissions: { async remove() { return true; }, async contains({ origins }) { return origins.every(o => fake.granted.has(o)); }, onAdded: { addListener: f => fake.permAdded.push(f) } }
};

let calls = [];
let reply = () => ({ status: 200, body: { content: [{ type: 'text', text: '{"ko":"박스, 박스!"}' }], usage: { input_tokens: 120, output_tokens: 20, cache_read_input_tokens: 900 } } });
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
  const r = reply(url, init);
  return { ok: r.status < 400, status: r.status, json: async () => r.body };
};

await import('../background.js');

function send(msg) {
  return new Promise(resolve => {
    const ret = listeners[0](msg, {}, resolve);
    if (ret !== true) resolve(undefined);
  });
}
const settle = () => new Promise(r => setTimeout(r, 20));

test('키 없으면 NO_KEY', async () => {
  const r = await send({ type: 'f1ko-translate', text: 'Box box' });
  assert.deepEqual([r.ok, r.code], [false, 'NO_KEY']);
  assert.equal(calls.length, 0);
  assert.deepEqual(await send({ type: 'f1ko-keys' }), { ok: true, claude: false, gemini: false });
});

test('Claude 정상 번역 + 사용량 기록 + 요청 모양 (묶음 반영)', async () => {
  store.local.apiKey = 'sk-ant-test';
  const r = await send({ type: 'f1ko-translate', text: 'Box box', context: ['Norris leads'] });
  assert.equal(r.ok, true);
  assert.equal(r.text, '박스, 박스!');
  const c = calls.at(-1);
  assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(c.init.headers['x-api-key'], 'sk-ant-test');
  assert.equal(c.body.model, 'claude-haiku-5-5');
  assert.deepEqual(c.body.thinking, { type: 'adaptive' });
  assert.match(c.body.system[0].text, /막스 페르스타펜/, '묶음이 없으면 F1');
  assert.match(c.body.messages[0].content, /Norris leads[\s\S]*번역할 자막:\nBox box/);
  const day = Object.values(store.local.usage.days)[0];
  assert.equal(day.requests, 1);
  assert.equal(day.cacheRead, 900);
  await send({ type: 'f1ko-translate', text: 'Create a Lambda function', packs: ['common', 'cloud'] });
  assert.match(calls.at(-1).body.system[0].text, /Lambda \(영어 그대로\)/);
  assert.doesNotMatch(calls.at(-1).body.system[0].text, /페르스타펜/);
});

test('크레딧 없음 → NO_CREDIT, 실패 수 기록', async () => {
  reply = () => ({ status: 400, body: { error: { message: 'Your credit balance is too low to access the Anthropic API.' } } });
  const r = await send({ type: 'f1ko-translate', text: 'x' });
  assert.deepEqual([r.ok, r.code], [false, 'NO_CREDIT']);
  await settle();
  assert.equal(Object.values(store.local.usage.days)[0].fails, 1);
});

test('하루 상한에 닿으면 CAP (API 안 부름)', async () => {
  reply = () => ({ status: 200, body: { content: [{ type: 'text', text: '{"ko":"ok"}' }], usage: { input_tokens: 10, output_tokens: 1 } } });
  store.sync.dailyCapUsd = 0.0000001;
  const before = calls.length;
  const r = await send({ type: 'f1ko-translate', text: 'x' });
  assert.deepEqual([r.ok, r.code], [false, 'CAP']);
  assert.equal(calls.length, before);
  store.sync.dailyCapUsd = 1;
});

test('Claude 연결 테스트: 모델 목록 새로고침, 빠진 모델은 같은 계열 최신으로', async () => {
  reply = url => (url.includes('/v1/models')
    ? { status: 200, body: { data: [
      { id: 'claude-haiku-5-6', display_name: 'Claude Haiku 5.6', created_at: '2026-09-01T00:00:00Z' },
      { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', created_at: '2026-05-01T00:00:00Z' }
    ] } }
    : { status: 200, body: { content: [{ type: 'text', text: '{"ko":"테스트"}' }], usage: { input_tokens: 10, output_tokens: 3, cache_creation_input_tokens: 800 } } });
  const r = await send({ type: 'f1ko-test', apiKey: 'sk-ant-other', model: 'claude-haiku-5-5', text: 'hi' });
  assert.equal(r.ok, true);
  assert.equal(r.cacheWrite, 800);
  assert.equal(r.model, 'claude-haiku-5-6');
  assert.deepEqual(r.models.map(m => m.id), ['claude-haiku-5-6', 'claude-sonnet-5-5']);
  assert.deepEqual(store.local.claudeModels.map(m => m.id), ['claude-haiku-5-6', 'claude-sonnet-5-5']);
  assert.equal(calls.at(-1).init.headers['x-api-key'], 'sk-ant-other');
  assert.equal(calls.at(-1).body.model, 'claude-haiku-5-6');
  // 목록을 못 받아도 테스트는 계속
  reply = url => (url.includes('/v1/models') ? { status: 500, body: {} } : { status: 200, body: { content: [{ type: 'text', text: '{"ko":"ok"}' }], usage: {} } });
  const r2 = await send({ type: 'f1ko-test', apiKey: 'sk-ant-other', model: 'claude-sonnet-5-5', text: 'hi' });
  assert.equal(r2.ok, true);
  assert.ok(r2.modelsError);
  assert.equal(r2.model, 'claude-sonnet-5-5');
});

test('Gemini 미리 번역: 키 없음 → NO_KEY, 정상 → 줄 번역·사용량, 하루 한도 → DAILY', async () => {
  let r = await send({ type: 'f1ko-batch', lines: ['a'] });
  assert.deepEqual([r.ok, r.code], [false, 'NO_KEY']);
  store.local.geminiKey = 'AIzaTEST';
  reply = () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: '{"lines":["하나","둘"],"names":[{"en":"Paul","ko":"폴"}]}' }] } }], usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 40 } } });
  r = await send({ type: 'f1ko-batch', lines: ['one', 'two'], packs: ['common', 'film'] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines, ['하나', '둘']);
  assert.deepEqual(r.names, [{ en: 'Paul', ko: '폴' }]);
  const c = calls.at(-1);
  assert.match(c.url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(c.init.headers['x-goog-api-key'], 'AIzaTEST');
  assert.match(c.body.systemInstruction.parts[0].text, /영화·드라마/);
  assert.match(c.body.contents[0].parts[0].text, /1\. one\n2\. two/);
  assert.deepEqual(c.body.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' });
  await settle();
  const g = Object.values(store.local.gemini)[0];
  assert.deepEqual([g.lite, g.liteIn, g.liteOut], [1, 300, 40]);
  // 이 기기에서 센 하루 요청이 한도에 닿으면 부르지 않는다
  g.lite = 500;
  const before = calls.length;
  r = await send({ type: 'f1ko-batch', lines: ['x'] });
  assert.deepEqual([r.ok, r.code], [false, 'DAILY']);
  assert.equal(calls.length, before);
  g.lite = 1;
  // 서버가 하루 한도라고 하면 DAILY
  reply = () => ({ status: 429, body: { error: { message: 'Quota exceeded, quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier' } } });
  r = await send({ type: 'f1ko-batch', lines: ['x'] });
  assert.deepEqual([r.ok, r.code], [false, 'DAILY']);
});

test('Gemini: 생각 수준 설정을 거부하면 빼고 한 번 더', async () => {
  let n = 0;
  reply = (url, init) => {
    const b = JSON.parse(init.body);
    n += 1;
    if (b.generationConfig.thinkingConfig) return { status: 400, body: { error: { message: 'Thinking level is not supported for this model.' } } };
    return { status: 200, body: { candidates: [{ content: { parts: [{ text: '{"lines":["됨"]}' }] } }], usageMetadata: {} } };
  };
  const r = await send({ type: 'f1ko-batch', lines: ['x'] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines, ['됨']);
  assert.equal(n, 2);
  assert.equal(calls.at(-1).body.generationConfig.thinkingConfig, undefined);
});

test('Gemini 연결 테스트: 모델 목록에서 Flash Lite 이름을 고르고 시험', async () => {
  reply = url => (url.includes('/models?')
    ? { status: 200, body: { models: [{ name: 'models/gemini-3.6-flash-lite' }, { name: 'models/gemini-3.5-live-translate-preview' }] } }
    : { status: 200, body: { candidates: [{ content: { parts: [{ text: '{"lines":["박스, 박스!"]}' }] } }], usageMetadata: {} } });
  const r = await send({ type: 'f1ko-gemini-test', key: 'AIzaOTHER', text: 'Box box' });
  assert.equal(r.ok, true);
  assert.equal(r.models.lite, 'gemini-3.6-flash-lite');
  assert.deepEqual(store.local.geminiModels, { lite: 'gemini-3.6-flash-lite' });
  assert.equal(r.lite.ok, true);
  assert.equal(r.lite.text, '박스, 박스!');
  assert.equal(r.live, undefined, 'Live 는 없어짐');
  assert.match(calls.at(-1).url, /gemini-3\.6-flash-lite:generateContent/);
  assert.equal(calls.at(-1).init.headers['x-goog-api-key'], 'AIzaOTHER');
  assert.equal(await send({ type: 'f1ko-live', text: 'x' }), undefined, 'Live 메시지는 대답 안 함');
});

test('크롬 내장 번역 횟수 기록', async () => {
  await send({ type: 'f1ko-count', engine: 'chrome', n: 3, ms: 600 });
  await send({ type: 'f1ko-count', engine: 'lite-video' });
  await settle();
  const day = Object.values(store.local.usage.days)[0];
  assert.deepEqual([day.chrome, day.chromeMs], [3, 600]);
  assert.equal(Object.values(store.local.gemini)[0].videos, 1);
});

test('사이트 더하기·빼기: 콘텐츠 스크립트 등록, 지금 탭에 바로', async () => {
  const r = await send({ type: 'f1ko-site-add', host: 'learn.example.com', tabId: 7 });
  assert.equal(r.ok, true);
  assert.equal(registered[0].id, 'site-learn.example.com');
  assert.deepEqual(registered[0].matches, ['https://learn.example.com/*', 'http://learn.example.com/*']);
  assert.equal(registered[0].allFrames, true);
  assert.deepEqual(store.sync.customSites, ['learn.example.com']);
  assert.equal(store.sync.siteOn['learn.example.com'], true);
  assert.deepEqual(injected.map(([k, o]) => [k, o.target.tabId]), [['css', 7], ['js', 7]]);
  await send({ type: 'f1ko-site-add', host: 'learn.example.com' });
  assert.equal(registered.length, 1, '두 번 더해도 하나');
  await send({ type: 'f1ko-site-remove', host: 'learn.example.com' });
  assert.equal(registered.length, 0);
  assert.deepEqual(store.sync.customSites, []);
});

test('팝업 「이 사이트에서 켜기」: 권한 창에 팝업이 닫혀도 허락되면 background 가 마저 더함', async () => {
  injected.length = 0;
  await send({ type: 'f1ko-site-pending', host: 'class.example.com', tabId: 9 });
  // 다른 사이트 권한이 더해지면 무시
  for (const f of fake.permAdded) await f({ origins: ['https://other.example.com/*'] });
  assert.equal(registered.length, 0);
  for (const f of fake.permAdded) await f({ origins: ['https://class.example.com/*', 'http://class.example.com/*'] });
  assert.equal(registered[0]?.id, 'site-class.example.com');
  assert.ok(store.sync.customSites.includes('class.example.com'));
  assert.deepEqual(injected.map(([k, o]) => [k, o.target.tabId]), [['css', 9], ['js', 9]]);
  assert.equal(store.session.sitePending, undefined, '한 번 쓰면 지움');
  await send({ type: 'f1ko-site-remove', host: 'class.example.com' });
  // 영상이 다른 주소의 iframe 안: 플레이어 주소 여러 개를 한 번에
  await send({ type: 'f1ko-site-pending', hosts: ['player.example.net', 'cdn.example.org'], tabId: 9 });
  for (const f of fake.permAdded) await f({ origins: ['https://player.example.net/*', 'http://player.example.net/*', 'https://cdn.example.org/*', 'http://cdn.example.org/*'] });
  assert.deepEqual(registered.map(r => r.id).sort(), ['site-cdn.example.org', 'site-player.example.net']);
  assert.equal(store.session.sitePending, undefined);
  await send({ type: 'f1ko-site-remove', host: 'player.example.net' });
  await send({ type: 'f1ko-site-remove', host: 'cdn.example.org' });
});

test('확장 업데이트 뒤: 권한이 남은 직접 더한 사이트만 콘텐츠 스크립트를 다시 등록', async () => {
  store.sync.customSites = ['a.example.com', 'b.example.com'];
  fake.granted = new Set(['https://a.example.com/*', 'http://a.example.com/*']);
  registered.length = 0;
  for (const f of fake.installed) await f({ reason: 'update' });
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(registered.map(r => r.id), ['site-a.example.com']);
  assert.deepEqual(registered[0].matches, ['https://a.example.com/*', 'http://a.example.com/*']);
  for (const f of fake.installed) await f({ reason: 'update' });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(registered.length, 1, '이미 있으면 그대로');
  registered.length = 0; store.sync.customSites = []; fake.granted = new Set();
});

// ===== 음성 번역 (1.0) =====
test('음성 번역: 쓸 수 있는지 검사는 offscreen 에서 (끝나면 문서를 닫음), 꺼 두면 off', async () => {
  fake.offReplies['off-support'] = m => ({ ok: m.lang === 'en', reason: m.lang === 'en' ? 'ok' : 'no-pack' });
  assert.deepEqual(await send({ type: 'f1ko-listen-support', lang: 'en' }), { ok: true, reason: 'ok' });
  assert.equal(fake.offUrl, 'offscreen.html');
  assert.deepEqual(fake.offReasons, ['USER_MEDIA']);
  assert.equal(fake.offscreen, false, '듣는 중이 아니면 검사 뒤 닫음');
  assert.equal((await send({ type: 'f1ko-listen-support', lang: 'ja' })).reason, 'no-pack');
  store.sync.listenWhen = 'off';
  assert.deepEqual(await send({ type: 'f1ko-listen-support' }), { ok: false, reason: 'off' });
  delete store.sync.listenWhen;
});

test('음성 번역 시작: offscreen 에 탭 소리 · 언어 · 용어 힌트(영어), 상태 · 배지 · 탭 알림, 멈추기', async () => {
  fake.toOff = []; fake.toTab = [];
  fake.offReplies['off-start'] = { ok: true };
  const r = await send({ type: 'f1ko-listen-start', tabId: 5, streamId: 'sid-5', lang: 'en' });
  assert.equal(r.ok, true);
  const start = fake.toOff.find(m => m.type === 'off-start');
  assert.equal(start.streamId, 'sid-5');
  assert.equal(start.lang, 'en');
  assert.ok(start.phrases.includes('Leclerc') && start.phrases.includes('McLaren'), 'F1 이름 힌트');
  assert.ok(start.phrases.length <= 100);
  assert.equal(start.boost, 2);
  assert.deepEqual(store.session.listen.tabId, 5);
  assert.equal(fake.badge[5], '음성');
  assert.ok(fake.toTab.some(([t, m]) => t === 5 && m.type === 'f1ko-listen' && m.kind === 'start' && m.lang === 'en'));
  assert.deepEqual(await send({ type: 'f1ko-listen-state', tabId: 5 }), { ok: true, listening: true, lang: 'en', other: false });
  // offscreen 이 받아 적은 글 → 그 탭으로
  fake.toTab = [];
  await send({ type: 'f1ko-off', tabId: 5, kind: 'text', text: 'box box', final: false });
  assert.deepEqual(fake.toTab[0][1], { type: 'f1ko-listen', kind: 'text', text: 'box box', final: false, reason: undefined, error: undefined });
  // 멈추기
  await send({ type: 'f1ko-listen-stop', tabId: 5 });
  assert.equal(store.session.listen, undefined);
  assert.equal(fake.badge[5], '');
  assert.equal(fake.offscreen, false);
});

test('음성 번역: 일본어는 힌트 없음 · 다른 탭으로 옮기면 먼저 탭을 멈춤 · 탭 소리 오류는 이유로', async () => {
  fake.toOff = []; fake.toTab = [];
  await send({ type: 'f1ko-listen-start', tabId: 1, streamId: 's1', lang: 'ja' });
  assert.deepEqual(fake.toOff.find(m => m.type === 'off-start').phrases, []);
  await send({ type: 'f1ko-listen-start', tabId: 2, streamId: 's2', lang: 'en' });
  assert.ok(fake.toTab.some(([t, m]) => t === 1 && m.kind === 'stopped' && m.reason === 'moved'));
  assert.equal(store.session.listen.tabId, 2);
  await send({ type: 'f1ko-listen-stop', tabId: 2 });
  fake.captureError = 'Cannot capture a tab with an active stream.';
  assert.deepEqual(await send({ type: 'f1ko-listen-start', tabId: 3 }), { ok: false, reason: 'busy', error: fake.captureError });
  fake.captureError = null;
  fake.offReplies['off-start'] = { ok: false, reason: 'no-pack' };
  assert.equal((await send({ type: 'f1ko-listen-start', tabId: 3, streamId: 's3' })).reason, 'no-pack');
  assert.equal(store.session.listen, undefined);
  fake.offReplies['off-start'] = { ok: true };
});

test('⌥L: 못 쓰면 시작하지 않고 그 탭에 이유, 쓸 수 있으면 시작 · 다시 누르면 멈춤', async () => {
  const cmd = fake.commands[0];
  fake.toTab = [];
  fake.offReplies['off-support'] = { ok: false, reason: 'no-api' };
  await cmd('listen-toggle', { id: 9 });
  assert.ok(fake.toTab.some(([t, m]) => t === 9 && m.kind === 'notice' && m.reason === 'no-api'));
  assert.equal(store.session.listen, undefined);
  fake.offReplies['off-support'] = { ok: true, reason: 'ok' };
  await cmd('listen-toggle', { id: 9 });
  assert.equal(store.session.listen.tabId, 9);
  await cmd('listen-toggle', { id: 9 });
  assert.equal(store.session.listen, undefined);
});

test('음성 번역 원문이 일본어면 Claude 지시문에 일본어 규칙', async () => {
  store.local.apiKey = 'sk-ant-test';
  await send({ type: 'f1ko-translate', text: 'ルクレールがピットに入ります', srcLang: 'ja', packs: ['common', 'f1'] });
  assert.match(calls.at(-1).body.system[0].text, /원문이 일본어인 자막/);
  await send({ type: 'f1ko-translate', text: 'Box box', packs: ['common', 'f1'] });
  assert.doesNotMatch(calls.at(-1).body.system[0].text, /원문이 일본어인 자막/);
});

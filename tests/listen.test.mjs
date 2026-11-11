import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSupport, reasonText, captureReason, tidy, units, ListenSegmenter, hintPhrases, chromeVersion, LISTEN_LANGS } from '../lib/listen.js';

class FakeSR { constructor() {} }
FakeSR.prototype.processLocally = false;
const fake = state => Object.assign(class extends FakeSR {}, {
  available: async ({ langs, processLocally }) => (processLocally ? state[langs[0]] ?? 'unavailable' : 'available'),
  install: async () => true
});

test('checkSupport: 기능 없음 · 맥 안 미지원 · 언어 팩 없음 · 받는 중 · 됨', async () => {
  assert.equal((await checkSupport(undefined)).reason, 'no-api');
  assert.equal((await checkSupport(class {})).reason, 'no-api'); // available/install 없음 (옛 크롬)
  assert.equal((await checkSupport(fake({}), 'en')).reason, 'no-local');
  assert.equal((await checkSupport(fake({ 'en-US': 'downloadable' }), 'en')).reason, 'no-pack');
  assert.equal((await checkSupport(fake({ 'ja-JP': 'downloading' }), 'ja')).reason, 'downloading');
  const ok = await checkSupport(fake({ 'ja-JP': 'available' }), 'ja');
  assert.deepEqual(ok, { ok: true, reason: 'ok', pack: 'available' });
  // available() 가 던지면 맥 안 미지원으로
  const bad = Object.assign(class extends FakeSR {}, { available: async () => { throw new Error('x'); }, install: async () => true });
  assert.equal((await checkSupport(bad)).reason, 'no-local');
});

test('reasonText: 모든 이유에 늘 보일 안내 · 언어 팩은 받기 동작', () => {
  for (const r of ['ok', 'off', 'no-api', 'no-local', 'no-pack', 'downloading', 'pack-failed', 'page', 'busy', 'unknown']) {
    const t = reasonText(r, 'en', 120);
    assert.ok(t.title.length > 5, r);
    if (r !== 'ok') assert.ok(t.fix.length > 5, r);
  }
  assert.equal(reasonText('no-pack', 'ja').action, 'install');
  assert.match(reasonText('no-pack', 'ja').title, /일본어/);
  assert.match(reasonText('no-api', 'en', 120).title, /120/);
  assert.match(reasonText('no-api').fix, /이상으로 업데이트/);
  assert.doesNotMatch(JSON.stringify(reasonText('no-local')), /서버로 보내요/); // 서버로 보내는 대안은 없다
});

test('captureReason: tabCapture 오류 → 이유', () => {
  assert.equal(captureReason('Cannot capture a tab with an active stream.'), 'busy');
  assert.equal(captureReason('Extension has not been invoked for the current page (see activeTab permission). Chrome pages cannot be captured.'), 'page');
  assert.equal(captureReason('weird'), 'unknown');
});

test('chromeVersion', () => {
  assert.equal(chromeVersion('Mozilla/5.0 (Macintosh) Chrome/157.0.8103.50 Safari/537.36'), 157);
  assert.equal(chromeVersion('Safari'), 0);
});

test('tidy: 일본어 낱말 사이 빈칸 빼기 (영어는 그대로)', () => {
  assert.equal(tidy('ルク レール が ピアストリ を かわし て 3 番 手', 'ja'), 'ルクレールがピアストリをかわして3番手');
  assert.equal(tidy('the  quick   fox', 'en'), 'the quick fox');
  assert.equal(tidy('AWS の VPC です', 'ja'), 'AWSのVPCです');
  assert.equal(units('ab cd', 'ja').length, 4);
});

test('ListenSegmenter: 쉼에서 끊고, 길면 중간에 끊고, 보낸 앞부분은 다시 보내지 않음', () => {
  const s = new ListenSegmenter('en', { pauseMs: 700, maxUnits: 6, minUnits: 2 });
  assert.deepEqual(s.update('and the lights', 0), []);
  assert.deepEqual(s.update('and the lights go out', 300), []);
  assert.deepEqual(s.tick(600), []);                      // 아직 쉼이 짧음
  assert.deepEqual(s.tick(1100), ['and the lights go out']);
  assert.deepEqual(s.tick(2000), []);                     // 같은 것을 두 번 보내지 않음
  // 같은 묶음에 이어 붙음 → 새 부분만
  const r = s.update('and the lights go out in abu dhabi norris gets a good launch', 2100);
  assert.deepEqual(r, ['in abu dhabi norris gets a']);   // 6낱말이 모이면 바로
  assert.equal(s.view().pending, 'good launch');
  assert.deepEqual(s.update('and the lights go out in abu dhabi norris gets a good launch from pole', 2200, true), ['good launch from pole']);
  // final 뒤에는 새 묶음 (다음 결과의 중간 글만 옴)
  assert.deepEqual(s.update('verstappen', 2300), []);
  assert.equal(s.view().pending, 'verstappen');
});

test('ListenSegmenter: 중간 결과로 다음 결과 몫까지 보냈으면 확정 뒤 그만큼 건너뜀 (같은 말을 두 번 번역하지 않음)', () => {
  const s = new ListenSegmenter('en', { maxUnits: 4, minUnits: 1 });
  // 중간 글 = 결과1 'a b c' + 결과2 'd e f' 가 이어져 옴
  assert.deepEqual(s.update('a b c d e f', 0), ['a b c d']);
  // 결과1 확정 ('a b c') → 이미 4개 보냄 = 결과2 의 'd' 까지
  assert.deepEqual(s.update('a b c', 10, true), []);
  // 이제 중간 글은 결과2 만
  assert.deepEqual(s.update('d e f', 20), []);
  assert.equal(s.view().pending, 'e f');
});

test('ListenSegmenter: 짧은 조각은 쉼이 조금 길어도 기다렸다가, 아주 길게 쉬면 보냄', () => {
  const s = new ListenSegmenter('en', { pauseMs: 700, maxUnits: 18, minUnits: 3 });
  s.update('okay', 0);
  assert.deepEqual(s.tick(800), []);
  assert.deepEqual(s.tick(2200), ['okay']);
});

test('ListenSegmenter: 인식기가 앞부분을 고쳐 줄어들어도 깨지지 않음', () => {
  const s = new ListenSegmenter('en', { maxUnits: 3, minUnits: 1 });
  assert.deepEqual(s.update('a b c d', 0), ['a b c']);
  assert.deepEqual(s.update('a b', 10), []);
  assert.deepEqual(s.update('a b x y z', 20), ['x y z']); // 보낸 개수가 2로 줄었으니 그 뒤 3개
});

test('ListenSegmenter: 일본어는 글자 수로', () => {
  const s = new ListenSegmenter('ja', { maxUnits: 10, minUnits: 2 });
  const out = s.update('本日 は クラウド の 基本 的 な ネットワーク', 0);
  assert.deepEqual(out, ['本日はクラウドの基本']);
  assert.equal(s.view().pending, '的なネットワーク');
});

test('hintPhrases: 영어만, 고유 이름 · 드라이버 성, 최대 개수', () => {
  const entries = [
    { en: 'Charles Leclerc', ko: '샤를 르클레르', kind: 'ko', group: '드라이버' },
    { en: 'McLaren', ko: '', kind: 'keep', group: '팀' },
    { en: 'safety car', ko: '세이프티카', kind: 'ko', group: '용어' },
    { en: 'S3', ko: '', kind: 'keep', group: 'AWS' }
  ];
  assert.deepEqual(hintPhrases(entries, 'en'), ['Charles Leclerc', 'Leclerc', 'McLaren']);
  assert.deepEqual(hintPhrases(entries, 'ja'), []);
  const many = Array.from({ length: 300 }, (_, i) => ({ en: `Name${i}`, kind: 'keep' }));
  assert.equal(hintPhrases(many, 'en').length, 100);
});

test('LISTEN_LANGS: 영어 · 일본어', () => {
  assert.equal(LISTEN_LANGS.en.code, 'en-US');
  assert.equal(LISTEN_LANGS.ja.code, 'ja-JP');
  assert.equal(LISTEN_LANGS.ja.tr, 'ja');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafari, brandText, macState, MAC_TEXT } from '../lib/platform.js';
import { readFileSync } from 'node:fs';

test('isSafari: 확장 주소로 판정 (Safari판 2026-11-29)', () => {
  assert.equal(isSafari('safari-web-extension://ABCD-1234/'), true);
  assert.equal(isSafari('chrome-extension://abcdefghijklmnop/'), false);
  assert.equal(isSafari(''), false);
});

test('brandText: Safari 면 크롬 내장 번역 → 맥 번역, 크롬판은 그대로', () => {
  assert.equal(brandText('AI 번역·크롬', true), 'AI 번역·맥');
  assert.equal(brandText('AI 번역이 안 될 때 크롬 내장 번역', true), 'AI 번역이 안 될 때 맥 번역');
  assert.equal(brandText('크롬 번역 모델', true), '맥 번역 언어');
  assert.equal(brandText('설정은 이 컴퓨터의 크롬에만 저장돼요', true), '설정은 이 컴퓨터의 Safari에만 저장돼요');
  assert.equal(brandText('AI 번역·크롬', false), 'AI 번역·크롬');
});

test('macState: 앱 확장 응답 → 크롬판 상태 이름', () => {
  assert.equal(macState({ state: 'installed' }), 'available');
  assert.equal(macState({ state: 'supported' }), 'downloadable');
  assert.equal(macState({ state: 'unsupported' }), 'unavailable');
  assert.equal(macState({ state: 'old-macos' }), 'old');
  assert.equal(macState(null), 'noapp');
  for (const k of ['available', 'downloadable', 'unavailable', 'old', 'noapp']) assert.ok(MAC_TEXT[k]);
});

test('Safari판 manifest 만들기: tabCapture · offscreen · ⌥L 빼고 nativeMessaging 넣음', async () => {
  const { safariManifest } = await import('../safari/scripts/manifest.mjs');
  const src = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  const m = safariManifest(src);
  assert.ok(!m.permissions.includes('tabCapture'));
  assert.ok(!m.permissions.includes('offscreen'));
  assert.ok(m.permissions.includes('nativeMessaging'));
  assert.equal(m.commands, undefined);
  assert.equal(m.version, src.version.split('.').length === 3 ? m.version : src.version);
  assert.ok(m.description.length <= 132);
  assert.doesNotMatch(m.description, /윈도우|Windows|크롬 내장/);
});

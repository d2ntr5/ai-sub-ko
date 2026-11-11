// ai-sub-ko 1.0 — offscreen 문서: 탭 소리를 받아 크롬 내장 음성 인식(맥 안, processLocally)으로 받아 적는다.
// 소리를 서버로 보내지 않는다. 받은 소리는 다시 재생해 탭 소리가 꺼지지 않게 한다.
// background 와만 대화한다 (type 'off-*' 를 받고, 'f1ko-off' 로 결과를 보낸다).
import { checkSupport, LISTEN_LANGS } from './lib/listen.js';

const SR = self.SpeechRecognition || self.webkitSpeechRecognition;
const SILENCE_MS = 30_000;        // 이만큼 조용하면 알림 (영상이 멈췄는지는 콘텐츠 스크립트가 본다)
const SILENCE_RMS = 0.003;
const FAIL_WINDOW_MS = 60_000;    // 1분 안에
const FAIL_MAX = 3;               // 3번 실패하면 멈춤

let cur = null; // { tabId, lang, stream, ctx, analyser, rec, stopped, fails: [], sent, quietSince, silenceSent, timer }

const send = (tabId, kind, extra = {}) => chrome.runtime.sendMessage({ type: 'f1ko-off', tabId, kind, ...extra }).catch(() => {});

async function start({ tabId, streamId, lang, phrases = [], boost = 2 }) {
  stop('replaced');
  const L = LISTEN_LANGS[lang] || LISTEN_LANGS.en;
  const sup = await checkSupport(SR, lang);
  if (!sup.ok) return { ok: false, reason: sup.reason };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } });
  } catch (e) {
    return { ok: false, reason: 'unknown', error: `${e.name} ${e.message}` };
  }
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  src.connect(ctx.destination); // 탭 소리가 그대로 들리게
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  const c = { tabId, lang, code: L.code, phrases, boost, stream, ctx, analyser, rec: null, stopped: false, fails: [], sent: 0, quietSince: Date.now(), silenceSent: false };
  cur = c;
  stream.getAudioTracks()[0].addEventListener('ended', () => { if (cur === c) { stop('ended'); send(tabId, 'stopped', { reason: 'ended' }); } });
  c.timer = setInterval(() => watchSilence(c), 1000);
  listen(c);
  return { ok: true };
}

/** 음성 인식 하나 시작. 크롬 음성 인식은 오래 켜 두면 스스로 끝날 수 있어 끝나면 곧바로 다시 시작한다 */
function listen(c) {
  const r = new SR();
  r.lang = c.code;
  r.continuous = true;
  r.interimResults = true;
  r.processLocally = true;
  if (c.phrases.length && typeof SpeechRecognitionPhrase === 'function') {
    try { r.phrases = c.phrases.map(p => new SpeechRecognitionPhrase(p, c.boost)); } catch { /* 힌트 없이 */ }
  }
  c.rec = r;
  c.sent = 0; // 이 인식에서 확정으로 보낸 결과 수
  let lastError = '';
  r.onresult = e => {
    if (cur !== c || c.rec !== r) return;
    const res = e.results;
    // 새로 확정된 결과는 하나씩 final 로, 나머지(아직 안 확정)는 이어 붙여 중간 글로
    while (c.sent < res.length && res[c.sent].isFinal) {
      send(c.tabId, 'text', { text: res[c.sent][0].transcript, final: true });
      c.sent += 1;
    }
    let interim = '';
    for (let i = c.sent; i < res.length; i++) interim += `${res[i][0].transcript} `;
    send(c.tabId, 'text', { text: interim.trim(), final: false });
  };
  r.onerror = e => { lastError = e.error; };
  r.onend = () => {
    if (cur !== c || c.rec !== r || c.stopped) return;
    if (lastError === 'language-not-supported') { stop('no-pack'); send(c.tabId, 'stopped', { reason: 'no-pack' }); return; }
    if (lastError && lastError !== 'no-speech' && lastError !== 'aborted') {
      const now = Date.now();
      c.fails = c.fails.filter(t => now - t < FAIL_WINDOW_MS).concat(now);
      if (c.fails.length >= FAIL_MAX) { stop('failed'); send(c.tabId, 'stopped', { reason: 'failed', error: lastError }); return; }
    }
    send(c.tabId, 'restart', { error: lastError });
    setTimeout(() => { if (cur === c && !c.stopped) listen(c); }, 50);
  };
  try {
    r.start(c.stream.getAudioTracks()[0]);
  } catch (e) {
    stop('failed');
    send(c.tabId, 'stopped', { reason: 'failed', error: e.message });
  }
}

function watchSilence(c) {
  if (cur !== c) return;
  const buf = new Float32Array(c.analyser.fftSize);
  c.analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += v * v;
  const rms = Math.sqrt(sum / buf.length);
  const now = Date.now();
  if (rms > SILENCE_RMS) { c.quietSince = now; c.silenceSent = false; return; }
  if (!c.silenceSent && now - c.quietSince > SILENCE_MS) { c.silenceSent = true; send(c.tabId, 'silence'); }
}

// 음성 번역 중 크롬 내장 번역: 크롬 번역기는 언어 팩 상태를 출처(origin)마다 따로 보여서 (페이지에서는 일본어 모델이
// '안 받음' 으로 보임 — 2026-11-11 시험) 확장 출처인 여기서 번역한다
const translators = {};
async function translate({ text, src = 'en' }) {
  if (!('Translator' in self)) return { ok: false, state: 'unsupported' };
  const opts = { sourceLanguage: src === 'ja' ? 'ja' : 'en', targetLanguage: 'ko' };
  if (!translators[opts.sourceLanguage]) {
    const st = await self.Translator.availability(opts).catch(() => 'unavailable');
    if (st !== 'available') return { ok: false, state: st };
    translators[opts.sourceLanguage] = await self.Translator.create(opts);
  }
  return { ok: true, text: await translators[opts.sourceLanguage].translate(text) };
}

function stop(_why) {
  const c = cur;
  if (!c) return;
  c.stopped = true;
  cur = null;
  clearInterval(c.timer);
  try { c.rec?.abort(); } catch { /* 이미 끝남 */ }
  for (const t of c.stream.getTracks()) t.stop();
  c.ctx.close().catch(() => {});
}

chrome.runtime.onMessage.addListener((m, _s, sendResponse) => {
  if (!m?.type?.startsWith('off-')) return false;
  if (m.type === 'off-support') { checkSupport(SR, m.lang).then(sendResponse); return true; }
  if (m.type === 'off-start') { start(m).then(sendResponse, e => sendResponse({ ok: false, reason: 'unknown', error: e.message })); return true; }
  if (m.type === 'off-stop') { stop('user'); sendResponse({ ok: true }); return false; }
  if (m.type === 'off-translate') { translate(m).then(sendResponse, e => sendResponse({ ok: false, state: 'error', error: e.message })); return true; }
  if (m.type === 'off-state') { sendResponse({ listening: !!cur, tabId: cur?.tabId ?? null, lang: cur?.lang || null }); return false; }
  return false;
});

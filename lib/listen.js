// 음성 번역 (1.0): 자막이 없는 영상의 탭 소리를 크롬 내장 음성 인식(맥 안, processLocally)으로 받아 적어 원문으로 쓴다.
// 소리를 서버로 보내지 않는다 — processLocally 만. 다른 엔진 · 내려받는 모델 없음.
// 여기는 순수 로직 (지원 검사 해석 · 받아 적은 글 끊기 · 용어 힌트). 테스트: tests/listen.test.mjs

/** 원문 언어. code = 음성 인식 언어, tr = 크롬 번역(Translator) 원문 언어 */
export const LISTEN_LANGS = {
  en: { code: 'en-US', tr: 'en', name: '영어' },
  ja: { code: 'ja-JP', tr: 'ja', name: '일본어' }
};
export const LISTEN_LANG_IDS = Object.keys(LISTEN_LANGS);

/** 언어 팩 받기 · 맥 안 처리 · 탭 소리(tabCapture + offscreen) 가 모두 확인된 크롬 (2026-11-11 크롬 157 에서 시험).
 *  판정은 이 숫자가 아니라 기능이 있는지로 한다 — 안내 문구에만 쓴다 */
export const MIN_CHROME = 139;

/** 단추 쓸 수 있음 / 없음의 이유 */
export const REASONS = ['ok', 'off', 'no-api', 'no-local', 'no-pack', 'downloading', 'pack-failed', 'page', 'busy', 'unknown'];

/**
 * 음성 인식 지원 검사 (확장 페이지 · offscreen 에서. 서비스 워커에는 SpeechRecognition 이 없다).
 * SR = SpeechRecognition 생성자. 반환 { ok, reason, pack } — pack = available() 그대로
 */
export async function checkSupport(SR, lang = 'en') {
  const L = LISTEN_LANGS[lang] || LISTEN_LANGS.en;
  if (!SR || typeof SR.available !== 'function' || typeof SR.install !== 'function' || !('processLocally' in (SR.prototype || {}))) {
    return { ok: false, reason: 'no-api', pack: null };
  }
  let pack;
  try { pack = await SR.available({ langs: [L.code], processLocally: true }); } catch { pack = 'unavailable'; }
  if (pack === 'available') return { ok: true, reason: 'ok', pack };
  if (pack === 'downloadable') return { ok: false, reason: 'no-pack', pack };
  if (pack === 'downloading') return { ok: false, reason: 'downloading', pack };
  return { ok: false, reason: 'no-local', pack };
}

/** 크롬 버전 (navigator.userAgent 에서). 모르면 0 */
export function chromeVersion(ua = '') {
  const m = String(ua).match(/Chrome\/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * 이유 → 안내 { title, fix, action }. action = 'install'(언어 팩 받기) · 'retry'(다시 받기) · null.
 * 단추 아래에 늘 보이는 글 (마우스를 올려야 보이는 방식 아님)
 */
export function reasonText(reason, lang = 'en', chrome = 0) {
  const name = (LISTEN_LANGS[lang] || LISTEN_LANGS.en).name;
  const ver = chrome ? `이 크롬(${chrome})` : '이 크롬';
  switch (reason) {
    case 'ok': return { title: `이 크롬에서 쓸 수 있어요 · 크롬 내장 음성 인식 (맥 안) · ${name}`, fix: '', action: null };
    case 'off': return { title: '음성 번역을 꺼 두었어요', fix: '상세 설정 › 음성 번역 › 언제 쓸까요 에서 켜 주세요.', action: null };
    case 'no-api': return { title: `${ver}은 음성 번역을 지원하지 않아요`, fix: `크롬을 ${MIN_CHROME} 이상으로 업데이트해 주세요 — 크롬 메뉴 › 도움말 › Chrome 정보. 업데이트 뒤 다시 열면 자동으로 다시 검사해요.`, action: null };
    case 'no-local': return { title: `이 브라우저는 ${name} 음성 인식을 맥 안에서 할 수 없어요`, fix: 'Google Chrome 최신판에서 써 주세요. 소리를 서버로 보내는 방식은 쓰지 않아요.', action: null };
    case 'no-pack': return { title: `${name} 언어 팩이 있어야 시작할 수 있어요`, fix: `「언어 팩 받기」를 누르면 크롬이 받아요 (약 ${lang === 'ja' ? 170 : 200} MB, 한 번만). 다 받으면 다시 검사해서 단추가 켜져요.`, action: 'install' };
    case 'downloading': return { title: `${name} 언어 팩 받는 중`, fix: '다 받으면 다시 검사해서 단추가 켜져요. 팝업을 닫아도 크롬이 계속 받아요.', action: null };
    case 'pack-failed': return { title: '언어 팩을 받지 못했어요', fix: '인터넷 연결과 맥의 남은 공간(300 MB 이상)을 확인하고 다시 받아 주세요.', action: 'retry' };
    case 'page': return { title: '이 페이지에서는 음성 번역을 쓸 수 없어요', fix: '크롬 설정 · 웹 스토어 같은 크롬 자체 페이지는 탭 소리를 넘겨주지 않아요. 영상이 있는 탭에서 다시 열어 주세요.', action: null };
    case 'busy': return { title: '이 탭 소리를 다른 곳에서 쓰고 있어요', fix: '다른 확장이나 화면 공유가 이 탭 소리를 쓰는 중이에요. 그쪽을 멈추고 다시 눌러 주세요.', action: null };
    default: return { title: '음성 번역을 시작하지 못했어요', fix: '페이지를 새로고침(⌘R)한 뒤 다시 눌러 주세요. 계속되면 팝업의 「진단 복사」를 보내 주세요.', action: null };
  }
}

/** tabCapture 오류 글 → 이유 */
export function captureReason(message = '') {
  const m = String(message);
  if (/active stream|already being captured|capturing/i.test(m)) return 'busy';
  if (/chrome:\/\/|chrome-extension|webstore|cannot be captured|Extension has not been invoked|not allowed/i.test(m)) return 'page';
  return 'unknown';
}

/** 받아 적은 일본어는 소음 속 중간 결과에서 낱말 사이에 빈칸이 들어온다 ('ルク レール が') → 빈칸을 뺀다 (영숫자 사이 빈칸은 둔다) */
export function tidy(text, lang = 'en') {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (lang !== 'ja') return t;
  const cjk = '\\u3000-\\u30ff\\u3400-\\u9fff\\uff00-\\uffef';
  return t.replace(new RegExp(`(?<=[${cjk}]) (?=[${cjk}A-Za-z0-9])|(?<=[A-Za-z0-9]) (?=[${cjk}])`, 'g'), '');
}

/** 끊는 단위: 영어 = 낱말, 일본어 = 글자 */
export function units(text, lang = 'en') {
  const t = tidy(text, lang);
  if (!t) return [];
  return lang === 'ja' ? [...t.replace(/\s+/g, '')] : t.split(' ');
}

const joinUnits = (u, lang) => (lang === 'ja' ? u.join('') : u.join(' '));

export const LISTEN_SEG = {
  pauseMs: 700,             // 받아 적은 글이 이만큼 안 바뀌면 (쉼) 그때까지를 번역
  maxUnits: { en: 18, ja: 40 }, // 쉼 없이 이어져도 이만큼 모이면 번역
  minUnits: { en: 3, ja: 6 }    // 너무 짧은 조각은 쉼이 와도 다음과 합침 (단, 문장 끝 결과면 보냄)
};

/**
 * 받아 적은 글 끊기. 음성 인식은 결과 묶음 전체(확정 + 중간)를 계속 다시 보내므로,
 * 이미 번역으로 보낸 앞부분(committed 개수)을 기억하고 그 뒤만 본다.
 * 문장부호가 없어서 쉼(pauseMs)과 길이(maxUnits)로 끊는다.
 */
export class ListenSegmenter {
  constructor(lang = 'en', opts = {}) {
    this.lang = lang;
    this.pauseMs = opts.pauseMs ?? LISTEN_SEG.pauseMs;
    this.maxUnits = opts.maxUnits ?? LISTEN_SEG.maxUnits[lang] ?? 18;
    this.minUnits = opts.minUnits ?? LISTEN_SEG.minUnits[lang] ?? 3;
    this.reset();
  }

  reset() {
    this.all = [];          // 이번 인식 묶음의 단위 전체
    this.committed = 0;     // 그중 번역으로 보낸 개수
    this.changedAt = 0;
  }

  /** 음성 인식이 다시 시작됨 (새 결과 묶음): 보낸 개수를 처음부터 */
  restart() { this.all = []; this.committed = 0; }

  /**
   * 새 결과. text = 아직 확정 안 된 결과들의 글 (확정되면 그 결과 하나를 final=true 로 한 번 더).
   * 반환: 번역할 조각 배열
   */
  update(text, now, final = false) {
    const u = units(text, this.lang);
    if (final) {
      // 확정된 결과 하나: 남은 부분만 보내고, 중간 결과일 때 이미 다음 결과 몫까지 보냈으면 그만큼 다음 묶음으로 넘김
      const carry = Math.max(0, this.committed - u.length);
      const out = this.committed < u.length ? [joinUnits(u.slice(this.committed), this.lang)] : [];
      this.all = []; this.committed = carry; this.changedAt = now;
      return out;
    }
    // 앞부분이 다시 받아 적혀 줄어들면 (인식기가 고침) 보낸 개수를 넘지 않게
    if (u.length < this.committed) this.committed = u.length;
    if (u.join('\u0001') !== this.all.join('\u0001')) this.changedAt = now;
    this.all = u;
    const out = [];
    while (this.all.length - this.committed >= this.maxUnits) {
      out.push(this.take(this.committed + this.maxUnits));
    }
    return out.filter(Boolean);
  }

  /** 시계: 쉼이 길면 남은 것을 보냄 */
  tick(now) {
    const rest = this.all.length - this.committed;
    if (rest <= 0 || now - this.changedAt < this.pauseMs) return [];
    if (rest < this.minUnits && now - this.changedAt < this.pauseMs * 3) return [];
    return [this.take(this.all.length)].filter(Boolean);
  }

  take(end) {
    const piece = joinUnits(this.all.slice(this.committed, end), this.lang);
    this.committed = end;
    return piece;
  }

  /** 화면 원문 줄: 보낸 끝부분(굵게) + 아직 안 보낸 부분(흐리게) */
  view(maxDone = this.lang === 'ja' ? 24 : 10) {
    const done = this.all.slice(Math.max(0, this.committed - maxDone), this.committed);
    const pending = this.all.slice(this.committed);
    return { done: joinUnits(done, this.lang), pending: joinUnits(pending, this.lang) };
  }
}

/**
 * 용어 힌트(SpeechRecognitionPhrase): 쓰는 묶음의 고유 이름 (영어 그대로 · 드라이버 성). 최대 100개.
 * 일본어는 시험에서 효과가 없어 보내지 않는다. 세게(5.0) 하면 같은 이름이 되풀이돼 망가진다 → 2.0 고정
 */
export const BOOST = 2.0; // 세기는 「보통」 하나로 고정 (2026-11-11 결정, 시험에서 1.0 효과 없음 · 5.0 망가짐)

export function hintPhrases(entries = [], lang = 'en', max = 100) {
  if (lang !== 'en') return [];
  const out = new Set();
  for (const x of entries) {
    if (!x?.en) continue;
    const en = String(x.en).trim();
    const proper = x.kind === 'keep' || x.group === '드라이버' || x.group === '팀' || /^[A-Z]/.test(en);
    if (!proper || en.length < 3) continue;
    out.add(en);
    if (x.group === '드라이버') { const last = en.split(' ').pop(); if (last.length >= 3) out.add(last); }
    if (out.size >= max) break;
  }
  return [...out].slice(0, max);
}

// 적용 사이트와 사이트별 용어집 고르기

export const BUILTIN_SITES = [
  { id: 'f1', name: 'F1 TV(formula1.com)', hosts: ['formula1.com'], packs: ['f1'], where: '기본 제공' },
  { id: 'youtube', name: 'YouTube', hosts: ['youtube.com'], packs: 'auto', where: '기본 제공' },
  { id: 'skillbuilder', name: 'AWS Skill Builder', hosts: ['skillbuilder.aws'], packs: ['cloud', 'dev'], where: '자동 찾기' },
  { id: 'academy', name: 'Anthropic Academy', hosts: ['anthropic.skilljar.com'], packs: ['ai', 'dev'], where: '자동 찾기' }
];

const hostMatches = (hostname, h) => hostname === h || hostname.endsWith('.' + h);

/** 지금 페이지의 사이트. 목록에 없으면 null */
export function siteFor(hostname, customSites = []) {
  const host = String(hostname || '').toLowerCase();
  const b = BUILTIN_SITES.find(s => s.hosts.some(h => hostMatches(host, h)));
  if (b) return b;
  const c = customSites.find(h => hostMatches(host, h));
  return c ? { id: c, name: c, hosts: [c], packs: 'auto', where: '자동 찾기', custom: true } : null;
}

export function siteEnabled(cfg, site) {
  return !!site && cfg.siteOn?.[site.id] !== false;
}

// 제목·채널 글자로 고르는 묶음
const AUTO_RULES = [
  ['f1', /\bF1\b|Formula ?1|Formula One|Grand Prix|포뮬러|그랑프리/i],
  ['cloud', /\bAWS\b|Amazon Web Services|\bGCP\b|Google Cloud|\bAzure\b|Kubernetes|\bcloud\b|클라우드/i],
  ['ai', /\bAI\b|\bLLM|Claude|Anthropic|ChatGPT|\bGPT|Gemini|machine learning|deep learning|neural|인공지능|머신러닝|딥러닝/i],
  ['dev', /programming|coding|developer|\bcode\b|JavaScript|TypeScript|Python|\bgit\b|GitHub|DevOps|프로그래밍|개발자|코딩/i],
  ['film', /trailer|\bmovie\b|\bfilm\b|\bdrama\b|episode|official clip|\bscene\b|예고편|드라마|영화|명장면/i]
];

export function autoPacks(text) {
  return AUTO_RULES.filter(([, re]) => re.test(text || '')).map(([id]) => id);
}

/** 이 영상에 쓸 묶음 (공통은 항상) */
export function packsFor(site, title = '', ytGlossary = 'auto') {
  let list = [];
  if (site?.packs === 'auto') list = site.id === 'youtube' && ytGlossary === 'common' ? [] : autoPacks(title);
  else if (Array.isArray(site?.packs)) list = site.packs;
  return ['common', ...list.filter(p => p !== 'common')];
}

/** 권한·등록용 주소 모양. http(s) 가 아니면 null */
export function originPattern(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || !u.hostname) return null;
    return { host: u.hostname.toLowerCase(), pattern: `${u.protocol}//${u.hostname}/*` };
  } catch {
    return null;
  }
}

/** 입력한 도메인·주소를 호스트 이름으로 ('https://www.x.com/a' → 'www.x.com') */
export function hostFromInput(text) {
  // '*.example.com' 은 example.com 으로 (하위 도메인은 원래 함께 켜진다). 전에는 '*' 가 남아 권한만 받고 목록에서 빠졌다
  const t = String(text || '').trim().replace(/^(https?:\/\/)?\*\./i, '$1');
  if (!t) return null;
  const o = originPattern(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  // 빈 칸 없는 낱말 둘 이상 ('.com' · 'a..b' · 'localhost' 는 안 됨)
  return o && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(o.host) ? o.host : null;
}

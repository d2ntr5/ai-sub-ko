// 용어집: 묶음(공통·F1·클라우드·AI·LLM·개발 일반·영화·드라마)별 { en, ko, kind, group }.
// kind: ko = 한국어로 · keep = 영어 그대로 · fix = 잘못 번역 막기 (한국어 표기로 고정)
// Claude·Gemini 지시문에 넣고, 크롬 내장 번역 결과도 이걸로 고친다.

export const PACKS = [
  { id: 'common', name: '공통', note: '어디서나' },
  { id: 'f1', name: 'F1', groups: ['드라이버', '팀', '용어'] },
  { id: 'cloud', name: '클라우드', groups: ['공통', 'AWS', 'GCP', 'Azure'] },
  { id: 'ai', name: 'AI·LLM' },
  { id: 'dev', name: '개발 일반' },
  { id: 'film', name: '영화·드라마', groups: ['호칭', '관용'] }
];
export const KINDS = ['ko', 'keep', 'fix'];

export function packName(id) {
  return PACKS.find(p => p.id === id)?.name || id;
}

const e = (group, kind) => ([en, ko = '']) => ({ en, ko: kind === 'keep' ? '' : ko, kind, group });

const F1_DRIVERS = [
  ['Max Verstappen', '막스 페르스타펜'], ['Isack Hadjar', '이삭 아자르'], ['Lando Norris', '랜도 노리스'],
  ['Oscar Piastri', '오스카 피아스트리'], ['Charles Leclerc', '샤를 르클레르'], ['Lewis Hamilton', '루이스 해밀턴'],
  ['George Russell', '조지 러셀'], ['Kimi Antonelli', '키미 안토넬리'], ['Fernando Alonso', '페르난도 알론소'],
  ['Lance Stroll', '랜스 스트롤'], ['Pierre Gasly', '피에르 가슬리'], ['Franco Colapinto', '프랑코 콜라핀토'],
  ['Alexander Albon', '알렉산더 알본'], ['Carlos Sainz', '카를로스 사인츠'], ['Esteban Ocon', '에스테반 오콘'],
  ['Oliver Bearman', '올리버 베어먼'], ['Nico Hulkenberg', '니코 휠켄베르크'], ['Gabriel Bortoleto', '가브리에우 보르툴레투'],
  ['Liam Lawson', '리엄 로슨'], ['Arvid Lindblad', '아르비드 린드블라드'], ['Sergio Perez', '세르히오 페레스'],
  ['Valtteri Bottas', '발테리 보타스']
];
const F1_TEAMS = ['Red Bull', 'McLaren', 'Ferrari', 'Mercedes', 'Aston Martin', 'Alpine', 'Williams', 'Haas', 'Racing Bulls', 'Audi', 'Cadillac'];
const F1_TERMS = [
  ['DRS'], ['safety car', '세이프티카'], ['virtual safety car', '버추얼 세이프티카'],
  ['pit stop', '피트스톱'], ['box', '박스'], ['undercut', '언더컷'], ['overcut', '오버컷'],
  ['grid', '그리드'], ['pole position', '폴 포지션'], ['fastest lap', '패스티스트 랩'],
  ['sector', '섹터'], ['dirty air', '더티 에어'], ['degradation', '디그라데이션'],
  ['soft tyre', '소프트 타이어'], ['medium tyre', '미디엄 타이어'], ['hard tyre', '하드 타이어'],
  ['intermediate', '인터미디어트'], ['wet tyre', '웻 타이어'], ['chequered flag', '체커기'],
  ['red flag', '레드 플래그'], ['yellow flag', '옐로 플래그'], ['blue flag', '블루 플래그'],
  ['track limits', '트랙 리밋'], ['penalty', '페널티'], ['stewards', '스튜어드'],
  ['pit lane', '피트레인'], ['formation lap', '포메이션 랩'], ['out lap', '아웃 랩'],
  ['in lap', '인 랩'], ['slipstream', '슬립스트림'], ['apex', '에이펙스'], ['chicane', '시케인'],
  ['lock-up', '락업'], ['overtake mode', '오버테이크 모드']
];

const CLOUD = [
  ...[
    ['availability zone', '가용 영역'], ['region', '리전'], ['virtual machine', '가상 머신'], ['container', '컨테이너'],
    ['serverless', '서버리스'], ['load balancer', '로드 밸런서'], ['auto scaling', '오토 스케일링'],
    ['latency', '지연 시간'], ['throughput', '처리량'], ['high availability', '고가용성'],
    ['fault tolerance', '내결함성'], ['scalability', '확장성'], ['object storage', '객체 스토리지'],
    ['block storage', '블록 스토리지'], ['storage', '스토리지'], ['snapshot', '스냅샷'], ['subnet', '서브넷'],
    ['firewall', '방화벽'], ['workload', '워크로드'], ['on-premises', '온프레미스'], ['multi-cloud', '멀티 클라우드'],
    ['cluster', '클러스터'], ['edge location', '엣지 로케이션'], ['landing zone', '랜딩 존'],
    ['shared responsibility model', '공동 책임 모델'], ['least privilege', '최소 권한'], ['disaster recovery', '재해 복구']
  ].map(e('공통', 'ko')),
  ...[['instance', '인스턴스'], ['bucket', '버킷'], ['endpoint', '엔드포인트'], ['node', '노드'], ['image', '이미지']].map(e('공통', 'fix')),
  ...[['Kubernetes'], ['Terraform'], ['VPC'], ['CDN'], ['IaaS'], ['PaaS'], ['SaaS'], ['DNS']].map(e('공통', 'keep')),
  ...[
    ['AWS'], ['EC2'], ['S3'], ['Lambda'], ['IAM'], ['RDS'], ['DynamoDB'], ['CloudFront'], ['CloudWatch'],
    ['CloudFormation'], ['Route 53'], ['API Gateway'], ['ECS'], ['EKS'], ['Fargate'], ['SQS'], ['SNS'],
    ['Kinesis'], ['Aurora'], ['Bedrock'], ['SageMaker'], ['Elastic Beanstalk'], ['Step Functions'],
    ['EventBridge'], ['AWS Organizations'], ['AWS Management Console']
  ].map(e('AWS', 'keep')),
  ...[['security group', '보안 그룹'], ['IAM role', 'IAM 역할'], ['Well-Architected Framework', 'Well-Architected 프레임워크']].map(e('AWS', 'ko')),
  ...[
    ['Google Cloud'], ['Compute Engine'], ['Cloud Storage'], ['Cloud Run'], ['Cloud Functions'], ['BigQuery'],
    ['GKE'], ['Cloud SQL'], ['Spanner'], ['Firestore'], ['Pub/Sub'], ['Vertex AI'], ['Cloud Build'],
    ['Artifact Registry'], ['Dataflow'], ['Looker']
  ].map(e('GCP', 'keep')),
  ...[['project', '프로젝트'], ['service account', '서비스 계정']].map(e('GCP', 'ko')),
  ...[
    ['Azure'], ['Azure Functions'], ['Azure Virtual Machines'], ['Blob Storage'], ['Azure Kubernetes Service'],
    ['AKS'], ['Azure SQL Database'], ['Cosmos DB'], ['Entra ID'], ['Azure DevOps'], ['App Service'],
    ['Azure OpenAI'], ['Azure Monitor'], ['Logic Apps'], ['Event Hubs']
  ].map(e('Azure', 'keep')),
  ...[['resource group', '리소스 그룹'], ['subscription', '구독']].map(e('Azure', 'ko'))
];

const AI = [
  ...[
    ['Claude'], ['Anthropic'], ['Claude Code'], ['MCP'], ['LLM'], ['GPT'], ['Gemini'], ['RAG'], ['API'], ['SDK'],
    ['Agent SDK'], ['Agent Skills'], ['temperature']
  ].map(e('', 'keep')),
  ...[['token', '토큰'], ['prompt', '프롬프트'], ['agent', '에이전트']].map(e('', 'fix')),
  ...[
    ['context window', '컨텍스트 창'], ['prompt caching', '프롬프트 캐싱'], ['prompt engineering', '프롬프트 엔지니어링'],
    ['system prompt', '시스템 프롬프트'], ['agentic', '에이전틱'], ['subagent', '서브에이전트'], ['tool use', '도구 사용'],
    ['embedding', '임베딩'], ['vector database', '벡터 데이터베이스'], ['fine-tuning', '파인튜닝'],
    ['inference', '추론'], ['reasoning', '추론'], ['extended thinking', '확장 사고'], ['hallucination', '할루시네이션'],
    ['training', '학습'], ['dataset', '데이터셋'], ['benchmark', '벤치마크'], ['evaluation', '평가'],
    ['guardrail', '가드레일'], ['alignment', '정렬'], ['multimodal', '멀티모달'], ['transformer', '트랜스포머'],
    ['neural network', '신경망'], ['parameter', '매개변수'], ['chain of thought', '생각의 사슬']
  ].map(e('', 'ko'))
];

const DEV = [
  ...[['CLI'], ['IDE'], ['CI/CD'], ['Git'], ['GitHub'], ['Docker'], ['JSON'], ['YAML'], ['REST API']].map(e('', 'keep')),
  ...[['library', '라이브러리'], ['function', '함수'], ['branch', '브랜치'], ['commit', '커밋']].map(e('', 'fix')),
  ...[
    ['deploy', '배포'], ['deployment', '배포'], ['repository', '저장소'], ['pull request', '풀 리퀘스트'],
    ['merge', '병합'], ['build', '빌드'], ['unit test', '단위 테스트'], ['test', '테스트'], ['dependency', '의존성'],
    ['framework', '프레임워크'], ['runtime', '런타임'], ['environment variable', '환경 변수'], ['debug', '디버그'],
    ['refactor', '리팩터링'], ['pipeline', '파이프라인'], ['database', '데이터베이스'], ['query', '쿼리'],
    ['schema', '스키마'], ['backend', '백엔드'], ['frontend', '프론트엔드'], ['variable', '변수'], ['package', '패키지'],
    ['terminal', '터미널'], ['script', '스크립트'], ['production', '프로덕션'], ['staging', '스테이징'], ['rollback', '롤백']
  ].map(e('', 'ko'))
];

const FILM = [
  ...[
    ['detective', '형사'], ['sheriff', '보안관'], ['Your Honor', '재판장님'], ['Mom', '엄마'], ['Dad', '아빠'],
    ['Grandma', '할머니'], ['Grandpa', '할아버지'], ['lieutenant', '경위'], ['sergeant', '경사'], ['officer', '경관'],
    ['counselor', '변호사님'], ['Mr. President', '대통령님'], ['Your Majesty', '폐하'], ['Agent', '요원'],
    ['partner', '파트너'], ['boss', '보스'], ['honey', '자기야']
  ].map(e('호칭', 'ko')),
  ...[
    ['Oh my God', '세상에'], ["I'm sorry for your loss", '삼가 조의를 표해요'], ['Copy that', '알았다'],
    ['Roger that', '알았다'], ["What's up", '무슨 일이야'], ['Hang in there', '조금만 버텨'],
    ['Break a leg', '행운을 빌어'], ['Good luck', '행운을 빌어'], ['Take care', '잘 지내'],
    ['Long time no see', '오랜만이야'], ['No way', '말도 안 돼'], ['Calm down', '진정해'], ['Trust me', '날 믿어'],
    ['Watch out', '조심해'], ['I got this', '내가 할게'], ['Never mind', '됐어'], ["I'm on it", '바로 할게'],
    ['Thank God', '다행이다'], ['What the hell', '뭐야'], ["It's not what it looks like", '오해야'],
    ['We need to talk', '얘기 좀 해'], ['Fair enough', '그럴 만하네']
  ].map(e('관용', 'ko'))
];

export const DEFAULT_GLOSSARY = Object.freeze({
  v: 2,
  packs: {
    common: [],
    f1: [
      ...F1_DRIVERS.map(e('드라이버', 'ko')),
      ...F1_TEAMS.map(t => ({ en: t, ko: '', kind: 'keep', group: '팀' })),
      ...F1_TERMS.map(([en, ko]) => (ko ? { en, ko, kind: 'ko', group: '용어' } : { en, ko: '', kind: 'keep', group: '용어' }))
    ],
    cloud: CLOUD,
    ai: AI,
    dev: DEV,
    film: FILM
  }
});

export function cloneGlossary(g = DEFAULT_GLOSSARY) {
  return { v: 2, packs: Object.fromEntries(Object.entries(g.packs).map(([k, list]) => [k, list.map(x => ({ ...x }))])) };
}

const clip = (s, n = 80) => String(s ?? '').trim().slice(0, n);

/** 한 줄 검사. 잘못된 줄이면 null */
export function cleanEntry(x) {
  if (!x || typeof x !== 'object') return null;
  const en = clip(x.en), kind = KINDS.includes(x.kind) ? x.kind : 'ko';
  const ko = kind === 'keep' ? '' : clip(x.ko);
  if (!en || (kind !== 'keep' && !ko)) return null;
  return { en, ko, kind, group: clip(x.group, 20) };
}

/** 묶음 하나 정리: 잘못된 줄을 빼고 같은 영어(대소문자 무시)는 앞의 것만 */
export function cleanPack(list) {
  const out = [], seen = new Set();
  for (const x of Array.isArray(list) ? list : []) {
    const c = cleanEntry(x);
    if (!c || seen.has(c.en.toLowerCase())) continue;
    seen.add(c.en.toLowerCase());
    out.push(c);
  }
  return out;
}

/**
 * 저장된 용어집을 정리. v2 { packs } 그대로, 0.4 까지의 { drivers, teams, terms } 는 F1 묶음으로 옮긴다.
 * 기본 묶음이 빠져 있으면 기본값으로 채운다 (새 버전에서 묶음이 늘어도 보이게)
 */
export function sanitizeGlossary(g) {
  const out = cloneGlossary();
  if (g && typeof g === 'object' && g.packs && typeof g.packs === 'object') {
    for (const [id, list] of Object.entries(g.packs)) {
      const name = clip(id, 30);
      if (name) out.packs[name] = cleanPack(list);
    }
  } else if (g && (Array.isArray(g.drivers) || Array.isArray(g.terms) || Array.isArray(g.teams))) {
    const rows = (k, group) => (Array.isArray(g[k]) ? g[k] : [])
      .filter(r => Array.isArray(r) && r.length >= 2)
      .map(([en, ko]) => (k === 'teams' || String(en).trim() === String(ko).trim()
        ? { en, ko: '', kind: 'keep', group }
        : { en, ko, kind: 'ko', group }));
    out.packs.f1 = cleanPack([...rows('drivers', '드라이버'), ...rows('teams', '팀'), ...rows('terms', '용어')]);
  }
  return out;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const wordRe = (w, flags = 'gi') => new RegExp(`(^|[^A-Za-z0-9])${escapeRe(w)}(?=$|[^A-Za-z0-9])`, flags);

/** 글에 이 말이 나오는지 (F1 드라이버는 성만 나와도) */
function appears(x, text) {
  if (wordRe(x.en, 'i').test(text)) return true;
  if (x.group === '드라이버') {
    const last = x.en.split(' ').slice(-1)[0];
    return last.length >= 3 && wordRe(last, 'i').test(text);
  }
  return false;
}

/** 묶음들의 줄 (text 를 주면 그 글에 나온 말만) */
export function entriesFor(g, packs, text = null) {
  const out = [];
  for (const id of packs) {
    for (const x of g.packs[id] || []) if (text == null || appears(x, text)) out.push({ ...x, pack: id });
  }
  return out;
}

const LINE = {
  ko: x => `- ${x.en} → ${x.ko}`,
  keep: x => `- ${x.en} (영어 그대로)`,
  fix: x => `- ${x.en} → ${x.ko} (다른 뜻으로 옮기지 말 것)`
};

/** 지시문에 넣을 용어집 글. text 를 주면 그 글에 나온 말만 (Gemini 미리 번역) */
export function glossaryPrompt(g, packs = ['common', 'f1'], text = null) {
  const parts = [];
  for (const id of packs) {
    const list = entriesFor(g, [id], text);
    if (!list.length) continue;
    parts.push(`[${packName(id)}]`, ...list.map(x => LINE[x.kind](x)), '');
  }
  return parts.join('\n').trim() || '(없음)';
}

// 크롬 내장 번역이 자주 내놓는 직역 → 바른 용어
const CHROME_FIXES = {
  f1: [
    [/드래그 (감소|저감) 시스템/g, 'DRS'],
    [/가상 (안전 차량|안전차|세이프티 ?카)/g, '버추얼 세이프티카'], // '안전 차량'보다 먼저
    [/안전 (차량|차)/g, '세이프티카'],
    [/피트 (정지|스톱)/g, '피트스톱'],
    [/(체크 무늬|체커|바둑판) 깃발/g, '체커기'],
    [/빨간 깃발/g, '레드 플래그'],
    [/노란 깃발/g, '옐로 플래그'],
    [/파란 깃발/g, '블루 플래그'],
    [/폴 위치/g, '폴 포지션'],
    [/가장 빠른 랩/g, '패스티스트 랩']
  ],
  cloud: [
    [/양동이/g, '버킷'],
    [/가용성 (영역|구역)/g, '가용 영역'],
    [/서버 없는/g, '서버리스'],
    [/람다 함수/g, 'Lambda 함수']
  ],
  ai: [
    [/(대형|큰) 언어 모델/g, 'LLM'],
    [/환각/g, '할루시네이션'],
    [/미세 조정/g, '파인튜닝']
  ],
  dev: [
    [/끌어오기 요청/g, '풀 리퀘스트'],
    [/저장소를 밀어/g, '저장소에 푸시해']
  ]
};

/**
 * 크롬 번역 결과 보정: 영어로 남은 F1 드라이버 이름(성·전체)을 한글로, 흔한 직역을 바른 용어로,
 * 영어로 남은 '한국어로'·'막기' 용어는 한국어 표기로
 */
export function fixChromeTranslation(text, g, packs = ['common', 'f1']) {
  let out = text;
  for (const id of packs) {
    for (const x of g.packs[id] || []) {
      if (x.kind === 'keep') continue;
      if (x.group === '드라이버') {
        out = out.replace(wordRe(x.en, 'g'), `$1${x.ko}`);
        const last = x.en.split(' ').slice(-1)[0], koLast = x.ko.split(' ').slice(-1)[0];
        if (last.length >= 3) out = out.replace(wordRe(last, 'g'), `$1${koLast}`);
      } else {
        out = out.replace(wordRe(x.en, 'gi'), `$1${x.ko}`);
      }
    }
    for (const [re, rep] of CHROME_FIXES[id] || []) out = out.replace(re, rep);
  }
  return out;
}

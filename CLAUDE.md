# ai-sub-ko 작업 규칙

2026-11-11 `d2ntr5/3rd-party-tool` 에서 lipi 저장소 하위 폴더로 옮겼다 (이력 보존). 버전 · CHANGELOG 는 Lipi 앱과 따로(`manifest.json` · `ai-sub-ko/CHANGELOG.md`), 릴리즈는 저장소 맨 위의 `make ai-sub-ko-publish VERSION=x.y.z` — 사용자가 지시할 때만.

Chrome 확장 (Manifest V3, 빌드 단계 없는 순수 JS, **macOS 전용**). F1 TV · YouTube · 강의 사이트의 영어 자막 → Claude · Gemini 3.5 Flash Lite · 크롬 내장 번역 → 한국어 자막. 사용자 설명서·구조는 `README.md`.

## 바꾸지 않는 결정 (핸드오프 문서 기준 + 0.5·0.6 에서 정한 것)

- 원문은 사이트 자체의 **글자 자막**(자막 요소, textTracks, YouTube timedtext)에서 읽는다. 화면 글자 인식은 하지 않는다.
- **음성 번역 (1.0, 2026-11-11 사용자 결정)**: 자막이 없으면 탭 소리를 **크롬 내장 음성 인식 · 맥 안(processLocally)** 으로만 받아 적는다. 소리를 서버로 보내지 않는다 — Google 서버 받아 적기 · Whisper(transformers.js 등) · Gemini 오디오는 넣지 않는다 (Whisper 는 시험에서 작은 모델도 메모리 5 GB+). 원문 언어는 영어 · 일본어. 단축키 ⌥L(chrome.commands `listen-toggle`).
- 쓸 수 없는 크롬이면 「음성 번역 시작」 단추를 회색으로 두고 이유 · 해결을 단추 아래에 **늘** 보인다 (마우스 올려야 보이는 방식 금지). ⌥L 도 시작하지 않고 같은 안내. 검사: 기능 → 맥 안 처리 → 언어 팩 (`lib/listen.js` `checkSupport`). 언어 팩은 사용자 클릭으로만 받는다 (`SpeechRecognition.install`, 확장 출처마다 따로).
- 음성 인식 · 크롬 번역 모델 상태는 출처마다 따로 보인다 → 음성 인식은 offscreen 문서에서, 음성 번역 중 크롬 내장 번역도 offscreen 에서 (`f1ko-chrome-translate`).
- Claude·Gemini 는 **API 키**로 부른다 (사용자가 키를 만들어 둠). claude.ai·gemini.google.com·chatgpt.com 세션을 긁는 방식은 쓰지 않는다.
- API 호출은 **background service worker 에서만**. 키는 `chrome.storage.local` (sync 아님). 키를 콘텐츠 스크립트·페이지로 보내지 않는다 (콘텐츠 스크립트는 `f1ko-keys` 로 있는지만 묻는다).
- 대신 번역: 키·크레딧·모델 오류 → 설정이 바뀔 때까지. 지연(5초)·429/529·네트워크 → 1분 후 복귀. Claude 하루 상한 → 자정까지. Gemini 하루 한도 → 태평양 시간 자정까지 (Flash Lite 가 막히면 Claude 키가 있으면 Claude).
- 엔진은 자동 (`pickEngine`): 일반 영상 = Flash Lite 미리 번역 → Claude → 크롬, 라이브 = Claude → 크롬. **키가 없는 엔진은 건너뛰고 고를 수도 없다.** 팝업에서 고른 엔진은 그 탭에만. Flash Lite 는 자막 전체를 받은 영상에서만.
- AI 번역이 안 될 때 크롬 내장 번역은 스위치(`chromeFallback`)로 켜고 끈다. 크롬 번역 모델은 팝업·상세 설정 버튼으로만 받는다 (크롬이 사용자 조작 때만 허락) — 콘텐츠 스크립트는 받은 모델만 쓰고 안 받았으면 안내만.
- Gemini Live Translate 는 텍스트 자막을 받지 못해 0.6 에서 뺐다. 다시 넣으려면 텍스트 입력이 되는지 먼저 확인.
- YouTube 자막 전체는 플레이어가 받은 timedtext 응답을 MAIN world(`yt-main.js`)에서 넘겨받는다 — 자막을 따로 다시 요청하지 않는다.
- 단축키 ⌥K 켜기/끄기, ⌥O 영어 원문. `e.code`(KeyK/KeyO)로 판정 (맥 ⌥ 특수문자). ⌥L 음성 번역은 크롬 단축키(chrome.commands) — 탭 소리 권한(activeTab 호출)이 필요해서.
- 사용자에게 보이는 확장 안 문구는 한국어 존댓말(‘~요’)·간결 (0.6.4 부터. 짧은 라벨·상태 표시는 명사형 그대로). 목적격 조사가 엔진 이름에 붙을 땐 `lib/errors.js` 의 `eul()`.

## 코드 규칙

- 순수 로직은 `lib/` (ES 모듈)에 두고 `tests/` 에서 `node --test`. 콘텐츠 스크립트는 import 를 못 하므로 `lib/` 를 `import(chrome.runtime.getURL(...))` 로 불러온다 (`web_accessible_resources`). 새 최상위 파일은 `scripts/package.sh` 목록과 `../Scripts/ai-sub-ko-release.sh` 의 문법 확인 목록에도.
- Claude 요청 (`lib/prompt.js`): 모델 기본 `claude-haiku-5-5`, `thinking: {type: 'adaptive'}` + `output_config.effort: 'low'` (문서 권장: 끄지 말고 effort 로. Sonnet 5.5 는 disabled 를 400 으로 거부. 생각도 max_tokens 에 들어가 2000) + `output_config.format` = JSON `{ko}` (structured outputs — 번역문 밖 해설이 자막에 섞이지 않게. prefill 은 400), `temperature`·`top_p` 보내지 않음(400), 지시문은 같은 묶음이면 매번 같은 글이어야 캐시 — 시각·랜덤 값 금지. Haiku 5.5 캐시 최소 512 토큰(테스트가 F1 지시문 길이를 확인).
- Gemini 요청 (`lib/gemini.js`): 미리 번역은 JSON 스키마 `{lines, names}`, 줄 수가 같아야 한다. 무료 등급 한도(`GEMINI_LIMITS`: Flash Lite 분당 15·하루 500)를 넘지 않게 background 가 간격을 두고 센다. API 키 형식은 검사하지 않는다 (형식이 바뀜 — 연결 테스트로 확인).
- 용어집 (`lib/glossary.js`): 묶음별 `{en, ko, kind, group}` (kind = ko · keep · fix). 0.4 까지의 `{drivers, teams, terms}` 는 `sanitizeGlossary` 가 F1 묶음으로 옮긴다 — 옛 형식 읽기를 지우지 말 것.
- 저장 키·메시지 이름의 `f1ko` 접두어는 옛 설정이 사라지지 않게 그대로 둔다.
- 맥미니에서 실제 크롬 시험: 시험용 프로필(`--user-data-dir`)로 따로 띄우고 `--remote-debugging-pipe --enable-unsafe-extension-debugging` + CDP `Extensions.loadUnpacked` · `Extensions.triggerAction`(팝업 열기). 같은 프로필에 다시 불러오면 서비스 워커가 옛 코드로 남으니 `Extensions.uninstall` 뒤 다시 불러온다. 시험이 끝나면 크롬을 끈다 (맥 메모리 16 GB).
- 클라우드 세션에는 실제 사이트·API 가 없다 → Playwright Chromium 에 확장을 불러와 가짜 페이지·가짜 응답으로 확인할 수 있다 (`channel: 'chromium'`, `--headless=new`, 한글 파일 이름은 `LANG=C.UTF-8`). 실측이 필요한 건 README ‘아직 확인 못 한 것’에 적는다.
- 사용자에게 보이는 변경마다 `manifest.json` 의 `version` 을 올린다.
- 주석·커밋 메시지·문서는 한국어.

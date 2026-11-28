# Safari판 (맥 앱 · Mac App Store)

처음 정한 날: 2026-11-29 (사용자 「진행」, 시안대로 · 정할 것은 추천대로). 크롬판은 그대로이고, Safari판은 **같은 확장 코드**를 맥 앱 안 Safari 웹 확장으로 담아 Mac App Store 에 냅니다.

## 1. 확정 (사용자 · 총괄 2026-11-29)
- 1단계(자막 번역 + 맥 번역 엔진)만, 맥만. 음성 번역 · iOS 없음.
- 이름 「AI 자막 번역」, 무료, 판매 국가 한국만. 최소 macOS 15.
- 크롬판에서 옮기기: 용어집 파일만 (내보내기 → 가져오기), 키는 다시 넣기.
- 개인 시청용 문구: 크롬판 문장 그대로 + 「영상을 내려받거나 저장하지 않아요」.

## 2. 크롬판과 다른 점 (코드)
| | 크롬판 | Safari판 | 어디 |
|---|---|---|---|
| 판정 | — | 확장 주소가 `safari-web-extension:` | `lib/platform.js` `SAFARI` |
| 키 없는 엔진 | 크롬 내장 번역 (Translator) | **맥 번역** (Apple Translation, 앱 확장이 번역) — 저장된 엔진 이름 `chrome` 은 그대로, 보이는 글만 `brandText` · `watchBrand` | `background.js` `f1ko-chrome-translate` · `f1ko-mac-state` → `native()` |
| API 키 | `chrome.storage.local` | 맥 앱 › 설정 → 키체인 공유 그룹. background 가 `sendNativeMessage({type:'keys'})` 로 받음 (15초 캐시), **동의한 엔진의 키만** | `background.js` `apiKeys()` · `safari/Shared/SharedStore.swift` |
| 음성 번역 | 됨 | 없음 (tabCapture · offscreen 없음) — 칸 숨김, `listenSupport` = off | `.chrome-only` |
| 상세 설정 · 팝업 | 키 칸 · 모델 받기 | 「앱에서 키 넣기」 · 「앱에서 받기」 (`aisubko://settings`) | `options.html` · `popup.js` |
| manifest | `manifest.json` | 만들 때 tabCapture · offscreen · commands 빼고 nativeMessaging 더함 | `safari/scripts/manifest.mjs` |

- 화면 없이 번역(`TranslationSession(installedSource:target:)`)은 **macOS 26 이상**. macOS 15~25 에서는 맥 번역이 「macOS 26 이상에서 돼요」(`old-macos`)로 쓸 수 없고 Claude · Gemini 는 됨 (2026-11-29 빌드에서 확인, 시안의 「macOS 15+」는 SwiftUI 화면 안 번역 기준이었음).

## 3. 맥 앱 (`safari/`)
- `project.yml` (xcodegen) — 앱 `AISubKo` + 앱 확장 `AISubKoExtension` (확장 파일은 빌드 때 `safari/build/ext/Resources` 로 복사).
- 화면: `App/MainView.swift`(첫 화면, 시안 2장) · `SettingsView.swift`(엔진 · 사이트 · 용어집 · 정보 + 동의 창, 시안 4 · 5장) · `HelpView.swift`(도움말 · 키 없이 해 보기, 시안 3 · 9장).
- 앱 확장: `Extension/SafariWebExtensionHandler.swift` — `keys` · `state` · `translate` · `open`.
- 샌드박스 · `network.client`(설정의 연결 테스트 · 확장의 API 호출) · `keychain-access-groups`(팀 ID 는 빌드가 채움 — 공개 저장소라 적지 않음).

## 4. 만들기
| 명령 | 결과 | 번들 ID |
|---|---|---|
| `bash safari/scripts/safari.sh build 1.0.0` | 서명 없이 컴파일 → `safari/build/AISubKo Unsigned.app` (Check 빌드는 그대로 둠) | — |
| `bash safari/scripts/safari.sh check 1.0.0` | `safari/build/AI 자막 번역 Check.app`, Apple Development 서명 | `io.github.d2ntr5.ai-sub-ko.check` (+ `.extension`) |
| `bash safari/scripts/safari.sh pkg 1.0.0` | `safari/build/AISubKo-1.0.0.pkg` | `io.github.d2ntr5.ai-sub-ko` (+ `.extension`) |
| `bash safari/scripts/safari.sh upload 1.0.0` | pkg + altool 확인 · 올리기 | 〃 |

- 서명 재료 · API 키는 저장소 밖 (`~/MacAppStoreSigning` · `~/AppStoreConnectSigning`, Bhasha `docs/APPSTORE.md` 3장과 같음). 프로파일 4개는 2026-11-29 API 로 만듦(만료 2027-11).
- 빌드 번호 = 커밋 수 + 100. `safari/appstore/CHANGELOG.md` 맨 위 `## x.y.z` 가 없으면 멈춤.
- 확인 빌드 자체 점검: `"…/MacOS/AISubKo" -AISubKoSelfCheck ~/Library/Containers/io.github.d2ntr5.ai-sub-ko.check/Data/tmp/selfcheck.json` — 샌드박스 안 키체인 공유 그룹 쓰기 · 읽기 · 지우기 + 맥 번역 한 줄. 2026-11-29: 모두 통과, 번역 1.7초.
- 스크린샷: `-AISubKoSnapshot <컨테이너 안 폴더>` → 2880×1800 PNG 4장 (`safari/appstore/screenshots/`).

## 5. App Store Connect
- 정보 · 심사 메모: `safari/appstore/metadata.md`. 앱 레코드 · 앱 개인정보는 웹에서(총괄).

## 6. 실제 Safari 에서 확인할 것 (맥 시험 세션, `docs/TESTING.md` 2장)
`docs/TESTING.md` 2장 1~9. 이 세션이 직접 확인한 것: 컴파일 · 서명 · 샌드박스 · 키체인 공유 그룹 · 맥 번역(앱 프로세스) · 스크린샷 2배. Safari 안 동작(확장 켜기 · 허용 · 자막 · MAIN world · 앱 확장 안 번역 · 네이티브 메시지)은 맥 시험 결과로.

## 7. 시험 결과 (맥 시험, 2026-11-29, Check 빌드 = 빌드 198 과 같은 코드)
- 통과 8 · 실패 0 · 확인 못 함 1 (`docs/TESTING.md` 2장, 자세한 것은 PR #42 댓글).
- 확인 전이던 것: 키 없이 ⌥K → 「AI 번역·맥」 맥 번역 자막 **됨**(앱 확장 TranslationSession · 네이티브 메시지). `aisubko-check://settings` 로 앱 설정 **열림**. YouTube MAIN world(`yt-main.js`) 미리 번역은 **Safari 에서 안 됨** — 한 줄 번역으로 동작(아래 알려진 문제).
- 확인 못 함: 「Safari에서 켜기」 단추 흐름(Safari 가 자동 클릭으로 확장 켜기를 막음 — 사용자 확인).

## 8. 알려진 문제 (다음 Safari판 1.0.1 후보)
1. YouTube 자막 전체(timedtext)를 MAIN world 에서 받지 못해 Gemini 미리 번역이 안 되고, 팝업이 「YouTube 라이브」로 보임 — Safari 의 `world: MAIN` 콘텐츠 스크립트 동작 확인 필요.
2. YouTube CC 기본이 영어가 아닌 언어(시험 영상은 스페인어)면 그 자막을 영어로 보고 번역하고 팝업은 「영어 자막 감지됨」 — 크롬판도 같은지 확인 뒤 고침.
3. 설정 창이 이미 열려 있으면 「앱에서 키 넣기」가 엔진 탭이 아니라 마지막 탭으로 열림.

## 9. 제출 직전 점검표 (1.0.0, 빌드 198, 2026-11-29 API 로 다시 읽음)
| 항목 | 상태 | 근거 |
|---|---|---|
| 빌드 | 198 VALID, 버전 1.0.0 에 붙음 | API `appStoreVersions/…/build` |
| 시험 | 통과 8 · 실패 0 · 확인 못 함 1 | 7장 |
| 샌드박스 2.4.5(i) · 앱 안 업데이트 없음 2.4.5(vii) | 됨 | 권한 파일, Sparkle 0 |
| 외부 AI 동의 5.1.2(i) | 됨 | 동의 창 · 거두기 시험 통과(8번) |
| 키 없는 데모 2.1 | 됨 (macOS 26+) | 3번 통과, 심사 메모에 macOS 26 |
| 이름 · 부제 · 설명 · 키워드 · URL | 됨 | `safari/appstore/metadata.md` |
| 스크린샷 | 4장 2880×1800, COMPLETE | API |
| 가격 · 판매 국가 | 무료 · KOR 만 | API |
| 분류 · 연령 · 저작권 | 생산성 · 모두 없음 · 2026 d2ntr5 | API |
| 개인정보 처리방침 · 앱 개인정보 | URL 넣음 · 게시(총괄, 웹) | PRIVACY.md Safari판 장 |
| 심사 연락처 | 채움(총괄) | API (값 출력 안 함) |
| 수출 규정 | `ITSAppUsesNonExemptEncryption = false` | Info.plist |
| 심사 제출 | **안 함 — 사용자 승인 뒤** | 총괄 정정 2026-11-29 |

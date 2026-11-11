# 크롬 웹 스토어 「개인정보 보호」 칸 (ai-sub-ko 1.0.0)

대시보드 개인정보 보호(Privacy) 탭에 붙여 넣는 글. 칸 이름은 대시보드 화면에서 확인 전 — 영어 UI 이름을 함께 적었다.
근거는 1.0.0 코드 (`manifest.json` · `background.js` · `offscreen.js` · `content.js`).

## 단일 목적 (Single purpose)

```
영상의 자막(사이트 자막, 또는 자막이 없을 때 탭 소리를 맥 안에서 받아 적은 글)을 한국어로 번역해 영상 위에 자막으로 보여 줍니다.
```
English: `Translates video captions into Korean subtitles shown over the video — from the site's own captions, or, when there are none, from the tab's audio transcribed on the user's Mac.`

## 권한별 사유 (Permission justification)

| 권한 | 사유 (붙여 넣을 글) |
|---|---|
| `storage` | 설정, 사용자가 넣은 API 키, 용어집, 사용량을 사용자 브라우저에 저장합니다. API 키는 이 기기의 로컬 저장소에만 둡니다. |
| `scripting` | 사용자가 팝업에서 「이 사이트에서 켜기」를 누른 사이트에 자막 화면을 등록하고, 음성 번역을 시작한 탭에 자막 화면을 넣는 데 씁니다. |
| `tabCapture` | 사용자가 「음성 번역 시작」이나 단축키를 누른 탭의 소리만 받아, 크롬 내장 음성 인식으로 맥 안에서 받아 적습니다. 소리는 저장하거나 밖으로 보내지 않습니다. |
| `offscreen` | 서비스 워커에는 소리 · 음성 인식 기능이 없어서, 화면 없는 문서(offscreen)에서 탭 소리를 받아 적고 크롬 내장 번역을 돌립니다. |
| `activeTab` | 사용자가 확장을 누른 탭에서만 탭 소리를 받고 자막 화면을 넣기 위해 씁니다 (적용 사이트 목록에 없는 사이트 포함). |
| `https://api.anthropic.com/*` | 사용자가 넣은 Anthropic API 키로 Claude 에 자막 글 번역을 요청합니다. |
| `https://generativelanguage.googleapis.com/*` | 사용자가 넣은 Google AI Studio 키로 Gemini 에 자막 글 번역을 요청합니다. |
| `https://f1tv.formula1.com/*`, `https://*.formula1.com/*` | F1 TV · formula1.com 영상 플레이어의 영어 자막을 읽고 그 위에 한국어 자막을 그립니다. |
| `https://www.youtube.com/*` | YouTube 플레이어의 자막을 읽고 그 위에 한국어 자막을 그립니다. |
| `https://skillbuilder.aws/*`, `https://*.skillbuilder.aws/*` | AWS Skill Builder 강의 영상의 자막을 읽고 한국어 자막을 그립니다. |
| `https://anthropic.skilljar.com/*` | Anthropic Academy 강의 영상의 자막을 읽고 한국어 자막을 그립니다. |
| 선택 권한 `https://*/*`, `http://*/*` | 처음에는 받지 않습니다. 사용자가 목록에 없는 사이트에서 「이 사이트에서 켜기」를 누를 때 그 사이트 하나만 크롬이 묻고 허락받습니다. |

`host_permissions` 를 넓게 묻는 칸이 따로 있으면: 「자막을 읽어야 하는 영상 사이트와 번역 API 두 곳만 기본으로 받고, 다른 사이트는 사용자가 고를 때 하나씩 받습니다.」

## 원격 코드 (Remote code)

- **아니요, 원격 코드를 쓰지 않습니다.** 모든 JS 는 패키지 안에 있습니다. `lib/*.js` 는 패키지 안 파일을 `chrome.runtime.getURL` 로 불러옵니다. `eval` · `new Function` · 외부 스크립트 없음 (1.0.0 코드에서 확인).
- 외부로 나가는 요청은 번역 API 두 곳(JSON 데이터)뿐.

## 데이터 사용 (Data usage) — 체크할 항목

| 항목 (영어 UI) | 체크 | 이유 |
|---|---|---|
| 웹사이트 콘텐츠 (Website content) | **예** | 영상 자막 글(사이트 자막 · 받아 적은 글)을 읽고, 번역을 위해 사용자가 고른 AI(Anthropic · Google)로 보냄. 크롬 내장 번역 · 음성 인식은 맥 안에서 처리 |
| 인증 정보 (Authentication information) | **예 (보수적으로)** | 사용자가 넣은 API 키를 브라우저 로컬에 저장하고, 그 키의 주인인 Anthropic · Google API 를 부를 때만 보냄. 개발자에게는 오지 않음 |
| 개인 식별 정보 · 건강 · 금융 · 위치 · 웹 기록 · 사용자 활동 · 개인 통신 | 아니요 | 모으지 않음. 소리는 맥 밖으로 나가지 않고 저장하지 않음 |

인증 (세 가지 모두 체크):
- 승인된 사용 사례 외에 제3자에게 판매 · 전송하지 않음
- 핵심 기능과 관계없는 목적으로 쓰거나 전송하지 않음
- 신용도 판단 · 대출 목적으로 쓰거나 전송하지 않음

## 개인정보처리방침 URL

- 글: 저장소 맨 위 `PRIVACY.md` (한국어 · 영어)
- 대시보드에 넣을 주소: https://github.com/d2ntr5/ai-sub-ko/blob/main/PRIVACY.md

## 짚어 둘 것

- 설정은 `chrome.storage.sync` 라 사용자가 크롬 동기화를 켜 두면 Google 계정으로 사용자 다른 크롬에 동기화됨 (API 키 · 용어집 · 사용량은 `local` 이라 동기화 안 됨). 방침 글에 적어 둠.
- 사이트 자막을 미리 번역한 결과(일반 영상)는 다시 요청하지 않게 로컬에 저장됨 (`vodCache`, 최근 영상 30개까지).
- sync 에 들어가는 것: 보기 · 엔진 · 상한 설정과 사용자가 더한 사이트 이름(호스트) 목록. 자막 글 · 키는 들어가지 않음.

# 개인정보처리방침 · Privacy Policy

**AI 자막 번역 (ai-sub-ko)** 크롬 확장 · 시행일 2026-11-11 · 게시자 d2ntr5

[English below](#english)

## 한국어

### 요약
- 개발자는 서버를 운영하지 않으며, 어떤 정보도 개발자에게 오지 않습니다.
- 번역할 **자막 글**만, 사용자가 API 키를 넣은 AI 회사(Anthropic 또는 Google)로 보냅니다.
- 음성 번역의 **소리는 사용자 기기 밖으로 나가지 않습니다.** 크롬 내장 음성 인식이 기기 안에서 받아 적고, 소리는 저장하지 않습니다.
- 판매 · 광고 · 분석 도구가 없습니다.

### 다루는 정보와 쓰는 곳

| 정보 | 어디에 두나 | 어디로 보내나 |
|---|---|---|
| 영상 자막 글 (사이트 자막, 또는 음성 번역으로 받아 적은 글) | 번역하는 동안 메모리. 일반 영상의 미리 번역 결과는 다시 요청하지 않도록 브라우저 로컬 저장소에 최근 30편까지 | 사용자가 키를 넣은 AI: Anthropic(Claude) 또는 Google(Gemini). 크롬 내장 번역을 쓰면 기기 안에서만 처리 |
| 탭 소리 (음성 번역 중) | 저장하지 않음 | 보내지 않음 — 크롬 내장 음성 인식이 기기 안에서 처리 |
| API 키 (Anthropic · Google) | 브라우저 로컬 저장소 (`chrome.storage.local`, 동기화 안 됨) | 그 키를 발급한 회사의 API를 부를 때만 |
| 용어집 · 사용량 기록 | 브라우저 로컬 저장소 | 보내지 않음 |
| 설정 (보기 · 엔진 · 상한, 사용자가 더한 사이트 주소) | `chrome.storage.sync` — 사용자가 크롬 동기화를 켜 두면 사용자 자신의 Google 계정으로 다른 크롬에 동기화 | 개발자에게는 보내지 않음 |

### 제3자
- 자막 글을 보내는 Anthropic · Google 은 각 회사의 약관과 개인정보처리방침에 따라 처리합니다. 특히 Google AI Studio 무료 등급은 입력 · 출력이 Google 제품 개선에 쓰이고 사람이 검토할 수 있습니다. 회사 · 민감한 영상이면 각 회사의 정책을 확인해 주세요.
- 그 밖의 제3자에게 정보를 팔거나 넘기지 않습니다.

### 지우기
- 확장을 지우면 브라우저에 저장된 키 · 용어집 · 설정이 함께 지워집니다. 상세 설정에서 키를 지우거나 용어집을 초기화할 수도 있습니다.

### 문의
- https://github.com/d2ntr5/ai-sub-ko/issues 또는 크롬 웹 스토어 등록정보의 연락처.
- 이 방침이 바뀌면 이 파일을 고치고 시행일을 바꿉니다.

<a id="english"></a>

## English

### Summary
- The developer runs no server, and no information is sent to the developer.
- Only the **caption text** to be translated is sent, to the AI provider whose API key you added (Anthropic or Google).
- In voice translation, **the tab's audio never leaves your device.** Chrome's built-in speech recognition transcribes it on the device, and the audio is not stored.
- No sales, no ads, no analytics.

### What is handled and where

| Information | Where it is kept | Where it is sent |
|---|---|---|
| Video caption text (site captions, or text transcribed by voice translation) | In memory while translating. Pre-translated results for regular videos are kept in local browser storage (last 30 videos) to avoid repeat requests | The AI provider whose key you added: Anthropic (Claude) or Google (Gemini). Chrome's built-in translation runs on the device only |
| Tab audio (during voice translation) | Not stored | Not sent — processed on the device by Chrome's built-in speech recognition |
| API keys (Anthropic, Google) | Local browser storage (`chrome.storage.local`, not synced) | Only to the provider that issued the key, when calling its API |
| Glossary, usage records | Local browser storage | Not sent |
| Settings (display, engine, caps, sites you added) | `chrome.storage.sync` — synced through your own Google account to your other Chrome browsers if Chrome sync is on | Never sent to the developer |

### Third parties
- Anthropic and Google process the caption text under their own terms and privacy policies. Note that on the Google AI Studio free tier, inputs and outputs may be used to improve Google products and may be reviewed by people. Check each provider's policy for work or sensitive content.
- Information is not sold or transferred to any other third party.

### Deleting data
- Removing the extension deletes the keys, glossary and settings stored in the browser. You can also clear keys or reset the glossary in the options page.

### Contact
- https://github.com/d2ntr5/ai-sub-ko/issues or the contact on the Chrome Web Store listing.
- If this policy changes, this file is updated along with its effective date.

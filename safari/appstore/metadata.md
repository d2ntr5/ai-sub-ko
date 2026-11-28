# App Store Connect 정보 (Safari판, 한국어 현지화만)

`safari/scripts/appstore_meta.py` 가 이 값을 넣습니다. 판매 국가 한국만 · 무료 (총괄 확정 2026-11-29).

## 이름 · 부제
- 이름: `AI 자막 번역`
- 부제: `영상 영어 자막을 한국어로 · Safari 확장`

## 설명
```
AI 자막 번역은 Safari에서 보는 영상의 영어 자막을 한국어 자막으로 바꿔 영상 위에 보여 주는 Safari 확장이에요. 이 앱을 설치하면 확장이 함께 들어 있어요.

■ 이렇게 써요
1. 앱 첫 화면의 「Safari에서 켜기」로 확장을 켜요.
2. 영상을 틀고 플레이어 자막(CC)을 English 로 둬요.
3. ⌥K 또는 Safari 툴바 KO › 켜기 — 영상 위에 한국어 자막이 나와요. ⌥O 로 영어 원문도 같이 볼 수 있어요.

■ 번역 엔진 (가진 키에 맞춰 자동)
· 맥 번역 — 키 없이, 이 맥 안에서 번역해요 (macOS 26 이상)
· Claude — Anthropic API 키가 있으면. 문맥과 용어집을 따라 자연스럽게
· Gemini Flash Lite — Google AI Studio 키가 있으면. 자막 전체가 있는 영상을 미리 번역
Claude · Gemini 는 처음 키를 저장할 때 무엇이 어디로 가는지 보여 드리고 동의를 받은 뒤에만 자막 글을 보내요. 키는 이 맥의 키체인에만 두고, 비용은 사용자 계정에 바로 청구돼요.

■ 용어집
F1 · 클라우드 · AI · 개발 · 영화 · 드라마 묶음으로 이름과 용어를 정해진 한국어 표기로 맞춰요.

■ 알아 두세요
· 번역은 생성형 AI(Anthropic Claude · Google Gemini)나 맥 번역이 만들어요. 영상 위 자막에 「AI 번역」이 표시돼요.
· 개인 시청용이에요. 번역 자막은 이 맥에서만 보이고 저장 · 배포하지 않아요. 영상을 내려받거나 저장하지 않아요. 각 사이트의 이용약관을 지켜 주세요.
· 사이트 자체의 글자 자막을 번역해요. 자막이 없는 영상은 번역하지 않아요.
```

## 키워드
`자막,번역,영어자막,한국어자막,Safari,확장,AI번역,강의,영상,외국어`

## URL
- 지원: https://github.com/d2ntr5/ai-sub-ko/issues
- 마케팅: https://github.com/d2ntr5/ai-sub-ko
- 개인정보 처리방침: https://github.com/d2ntr5/ai-sub-ko/blob/main/PRIVACY.md

## 분류 · 연령 · 저작권
- 분류: 생산성 (보조 없음). 연령: 모든 항목 없음. 저작권: `2026 d2ntr5`.
- 수출 규정: 빌드 Info.plist `ITSAppUsesNonExemptEncryption = false` (HTTPS 만).

## 스크린샷 (2880×1800, `safari/appstore/screenshots/`)
1. 첫 화면 「Safari에서 켜고 바로 써요」 2. 설정 › 엔진 「키 없이도 맥 번역으로」 3. 동의 창 「외부 AI로 보내기 전에 물어요」 4. 도움말 「⌥K 하나로 켜고 끄기」.
- 앱 확인 빌드의 `-AISubKoSnapshot` 으로 화면 밖에서 2배로 그림 (new-mac-app 5a-8). Safari 화면은 실제 Safari 시험 뒤 더할지 정함.

## 심사 메모 (App Review Information › Notes)
```
This app contains a Safari web extension that shows Korean subtitles over videos by translating the site's own English captions.

How to review without any API key — this key-free demo needs macOS 26 or later (on-device translation without a window uses TranslationSession(installedSource:target:), available from macOS 26; on macOS 15–25 the app still works with the user's own Claude or Gemini key):
1. Open the app and click "Safari에서 켜기" (Turn on in Safari), then enable "AI 자막 번역" in Safari Settings > Extensions.
2. In Safari, open https://www.youtube.com/watch?v=UF8uR6Z6KLc (it has English captions; the Help window has a "데모 영상 열기" link).
3. Turn on the player's captions (CC, English). Click the toolbar button "KO" and allow access to youtube.com when Safari asks.
4. Press Option-K (or use the popup's switch). The button over the video shows "AI 번역·맥" and Korean subtitles appear. This uses Apple's Translation framework on device; no key or account is needed.

Claude (Anthropic) and Gemini (Google) are optional and use the user's own API key, entered in the app's Settings > 엔진. The first time a key is saved, a consent sheet explains what is sent (caption text and glossary only) and where; nothing is sent to those providers before the user agrees (guideline 5.1.2(i)). Consent can be withdrawn in Settings > 정보.

The developer runs no server. Videos are never downloaded or saved. No in-app purchases. Updates come only through the App Store.
```

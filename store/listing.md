# 크롬 웹 스토어 등록정보 (ai-sub-ko 1.0.18)

2026-11-11 준비. 업로드 · 제출은 게시자가 직접 한다.
**게시됨 (1.0.18, 2026-11-13)** · 처음 게시 1.0.1 (2026-11-12): https://chromewebstore.google.com/detail/ckifmgaaeodbodmpoigiadfmfecpodli — 공개 · 대한민국 · 무료.
대시보드 칸에 그대로 붙여 넣는 글. 「확인 전」은 대시보드 화면에서 직접 확인할 것.

## 올릴 zip

- `make store` → `build/ai-sub-ko-<버전>-store.zip` (지금 1.0.18)
- 릴리즈 zip(`ai-sub-ko-<버전>.zip`)과 파일이 같다. 다른 점은 맨 위 `ai-sub-ko/` 폴더 없이 `manifest.json` 이 zip 맨 위에 있는 것뿐 — 스토어는 zip 맨 위에 manifest 가 있어야 받는다.
- 들어 있는 것: manifest · 화면 · 스크립트 · `lib/` · `icons/`. 시험(`tests/`) · `scripts/` · 문서 · `package.json` 은 없다. 난독화 · 압축(minify) 없음.

## 이름 · 짧은 설명 (manifest 에서 그대로 읽힘 — 대시보드에서 따로 고칠 수 없음)

- 이름: `AI 자막 번역 (ai-sub-ko)`
- 짧은 설명 (111자, 132자 이내):
  `F1 TV·YouTube·강의 영상의 영어 자막을, 자막이 없으면 소리를 맥 안에서 받아 적어(영어·일본어) Claude·Gemini·크롬 내장 번역으로 한국어 자막으로 보여 준다 (macOS 전용)`

## 자세한 설명 — 한국어 (기본)

```
영상의 영어 · 일본어를 한국어 자막으로 영상 위에 보여 주는 크롬 확장이에요. macOS 크롬에서 써요.

■ 사이트 자막 번역
F1 TV · YouTube · AWS Skill Builder · Anthropic Academy 등에서 플레이어의 영어 자막(CC)을 읽어 한국어 자막으로 바꿔 보여 줘요. 목록에 없는 사이트도 팝업의 「이 사이트에서 켜기」로 더할 수 있어요.

■ 음성 번역 (1.0 새 기능)
영어 자막이 없는 영상은 탭 소리를 크롬 내장 음성 인식이 맥 안에서 받아 적어 번역해요.
· 원문 언어: 영어 · 일본어
· 시작 · 멈추기: 툴바 팝업의 「음성 번역 시작」 또는 ⌥L
· 소리는 맥 밖으로 나가지 않아요 (서버로 보내지 않음)
· 처음 한 번 언어 팩을 받아요 (영어 약 190 MB · 일본어 약 170 MB)
· 이 크롬에서 쓸 수 없으면 시작 단추가 회색이 되고 이유와 해결 방법이 늘 보여요

■ 번역 엔진 (가진 키에 맞춰 자동)
· Claude — Anthropic API 키가 있으면. 문맥과 용어집을 따라 자연스럽게 번역
· Gemini Flash Lite — Google AI Studio 키가 있으면. 자막 전체가 있는 일반 영상을 미리 번역
· 크롬 내장 번역 — 키 없이 무료, 맥 안에서 번역
API 키는 사용자가 직접 만들어 넣고, 이 브라우저 안에만 저장돼요. 비용은 사용자 계정에 바로 청구돼요 (Claude 하루 상한 설정 가능).

■ 용어집
F1 · 클라우드(AWS · Google Cloud · Azure) · AI · 개발 · 영화 · 드라마 묶음. 드라이버 · 팀 · 서비스 이름을 정해진 한국어 표기로 맞춰요. JSON · CSV 로 내보내고 가져올 수 있어요.

■ 단축키
⌥K 켜기 · 끄기 · ⌥O 원문 보이기 · ⌥L 음성 번역

■ 개인정보
번역할 자막 글은 사용자가 키를 넣은 AI(Anthropic 또는 Google)로만 보내요. 소리 · API 키 · 설정은 개발자에게 오지 않아요. 판매 · 광고 없음.
```

## 자세한 설명 — 영어 (예비)

영어 등록정보를 따로 두려면 확장에 `_locales`(기본 언어 · 영어) 가 있어야 한다 (확인 전 — 지금 확장은 다국어 설정이 없어 등록정보 언어가 하나). 지금은 한국어 하나로 올리고, 아래 글은 1.0.1 등에서 `_locales` 를 더하기로 하면 쓴다.

```
Shows Korean subtitles on top of videos, translated from English or Japanese. For Chrome on macOS.

■ Site caption translation
Reads the player's English captions (CC) on F1 TV, YouTube, AWS Skill Builder, Anthropic Academy and more, and shows them as Korean subtitles. Add other sites from the popup with "Turn on for this site".

■ Voice translation (new in 1.0)
For videos without English captions, Chrome's built-in speech recognition transcribes the tab's audio on your Mac, then it is translated.
· Source languages: English, Japanese
· Start / stop: "Start voice translation" in the toolbar popup, or ⌥L
· Audio never leaves your Mac (nothing is sent to a server)
· A one-time language pack download (English about 190 MB, Japanese about 170 MB)
· If this Chrome can't do it, the start button is greyed out and the reason and fix are always shown

■ Translation engines (picked automatically from the keys you add)
· Claude — with your Anthropic API key; follows context and the glossary
· Gemini Flash Lite — with your Google AI Studio key; pre-translates full caption tracks
· Chrome built-in translation — free, no key, runs on your Mac
You create and enter your own API keys; they are stored only in this browser. Usage is billed to your own account (a daily Claude cap can be set).

■ Glossary
Packs for F1, cloud (AWS, Google Cloud, Azure), AI, development, film and drama. Keeps names of drivers, teams and services consistent. Import and export as JSON or CSV.

■ Shortcuts
⌥K on/off · ⌥O show original · ⌥L voice translation

■ Privacy
Caption text to translate is sent only to the AI provider whose key you added (Anthropic or Google). Audio, API keys and settings are never sent to the developer. No sales, no ads.
```

## 배포

- 결제: 무료 · 공개 상태: 공개 · **지역: 대한민국만** (2026-11-11 사용자 결정)

## 카테고리 · 언어

- 카테고리: **접근성 (Accessibility)** 추천 — 자막을 띄우는 확장. 다른 후보: 교육(Education). 대시보드의 정확한 분류 이름은 확인 전
- 언어: **한국어**

## 그림 (`store/images/`)

| 파일 | 크기 | 무엇 |
|---|---|---|
| `icon-128.png` | 128×128 | 확장 아이콘 (`icons/icon128.png` 그대로) |
| `screenshot-1-english.png` | 1280×800 | 자막 없는 영어 강의 영상 위 음성 번역 (실제 화면) |
| `screenshot-2-japanese.png` | 1280×800 | 일본어 강의 영상 위 음성 번역 (실제 화면) |
| `screenshot-3-popup.png` | 1280×800 | 툴바 팝업 「음성 번역 멈추기」 상태 (실제 팝업 + 설명 글) |
| `screenshot-4-settings.png` | 1280×800 | 상세 설정 › 음성 번역 (실제 화면 + 설명 글) |
| `promo-small-440x280.png` | 440×280 | 작은 홍보 타일 |

- 영상 화면은 직접 그린 강의 슬라이드(「Cloud Networking 101」)와 macOS 음성으로 만든 소리 — F1 · 방송사 로고나 실제 영상 장면 없음.
- 시험 프로필에 API 키를 넣지 않아 번역은 크롬 내장 번역(KO·크롬)으로 찍힘.
- 원본 캡처는 `store/raw/`, 합성 HTML 은 `store/compose/`.

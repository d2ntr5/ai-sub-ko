# 시험

## 1. 크롬판
- 단위 시험 `make test`. 실제 크롬 시험은 `CLAUDE.md` 「실제 크롬 시험」.

## 2. Safari판 (확인 빌드 `AI 자막 번역 Check`, 번들 ID `io.github.d2ntr5.ai-sub-ko.check`)
만들기: `bash safari/scripts/safari.sh check 1.0.0` → `safari/build/AI 자막 번역 Check.app`. 사용자 설치본은 아직 없음.

| # | 항목 | 기대 |
|---|---|---|
| 1 | 앱 첫 화면 「Safari에서 켜기」 | Safari 설정 › 확장이 열리고 「AI 자막 번역 Check」가 보임. 체크하면 앱으로 돌아왔을 때 1번 줄이 ✓ |
| 2 | YouTube `https://www.youtube.com/watch?v=UF8uR6Z6KLc`, CC English, 툴바 KO › 허용 | Safari 허용 창 → 「항상 허용」 뒤 팝업에 「영어 자막 감지됨」 |
| 3 | ⌥K (키 없음) | 영상 위 단추 「AI 번역·맥」, 한국어 자막이 맥 번역으로 나옴 (앱 확장 TranslationSession) |
| 4 | YouTube 미리 번역 경로 (MAIN world `yt-main.js`) | 팝업 상태 줄에 자막 전체 줄 수(미리 번역 n줄 또는 「자막 전체 받음」). 안 되면 한 줄 번역만 — 결과에 어느 쪽인지 |
| 5 | ⌥O | 영어 원문 보이기 · 숨기기 |
| 6 | 팝업 | 음성 번역 칸 없음, 「크롬」 글자 없음(맥 번역 · Safari), 버전 줄 「v1.0.0 · Safari · macOS」 |
| 7 | 팝업 「AI 자막 번역 앱 › 설정에서 키 넣기」 · 상세 설정 「앱에서 키 넣기」 | 확인 앱 설정 창이 열림 (`aisubko-check://settings`) |
| 8 | 앱 설정 › 엔진: 가짜 Claude 키 `sk-ant-test` 저장 | 동의 창이 뜸. 「안 보내요」 → 저장 안 됨. 「보내도 돼요」(읽음 체크 뒤) → 저장, 팝업 Claude 「키 있음」(15초 안). 정보 탭 「동의 거두기」 → 팝업 Claude 「키 없음」. 끝나면 키 지움 |
| 9 | Safari commands: ⌥L | Safari판은 commands 를 빼서 아무 일도 없어야 함 (확인 전 항목이었던 「Safari 26 commands」는 Safari판에서 쓰지 않음) |

- 정리: 확인 앱 · Safari 시험 탭 닫기, Safari 설정에서 「AI 자막 번역 Check」 끄기, 키체인 시험 키 지움(8번).

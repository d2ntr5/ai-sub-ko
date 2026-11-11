#!/usr/bin/env bash
# ai-sub-ko(크롬 확장, 저장소의 ai-sub-ko/)를 검사 · 묶고 GitHub Release ai-sub-ko-latest 를 새로 만듭니다.
# (2026-11-11 d2ntr5/3rd-party-tool 의 release.sh 중 ai-sub-ko 부분을 옮김)
#
#   make ai-sub-ko-publish VERSION=0.6.11              # = bash Scripts/ai-sub-ko-release.sh 0.6.11
#   bash Scripts/ai-sub-ko-release.sh 0.6.11 --no-publish   # ai-sub-ko/build/ 까지만 (올리지 않음)
#
# Lipi 앱 릴리즈와 서로 지우지 않게:
#   - 이 스크립트는 태그 ai-sub-ko-latest 하나만 지우고 다시 만든다 (Lipi 의 v* 릴리즈 · 태그는 건드리지 않음).
#   - --latest=false 로 만들어 저장소의 Latest 표시는 Lipi 앱 릴리즈에 남긴다.
#   - Lipi 의 Scripts/release.sh 는 「최신 2개만」 정리를 v* 태그에만 한다.
#   - Sparkle 피드(lipi-releases)와는 관계없음 (확장은 앱 안 업데이트가 없음, 사용자가 zip 을 받아 덮어씀).
# 서명 비밀값은 없습니다. 필요: node, gh(로그인)
set -euo pipefail

VERSION="${1:-}"
PUBLISH=1
[ "${2:-}" = "--no-publish" ] && PUBLISH=0
if [ -z "$VERSION" ]; then
  echo "사용법: bash Scripts/ai-sub-ko-release.sh <version> [--no-publish]" >&2
  exit 1
fi
REPO=d2ntr5/lipi
TAG=ai-sub-ko-latest

cd "$(dirname "$0")/../ai-sub-ko"

CODE_VERSION=$(node -p "require('./manifest.json').version")
if [ "$CODE_VERSION" != "$VERSION" ]; then
  echo "ai-sub-ko/manifest.json 의 버전($CODE_VERSION)이 $VERSION 이 아닙니다." >&2
  exit 1
fi
if [ "$PUBLISH" = 1 ]; then
  if [ -n "$(git status --porcelain)" ]; then
    echo "커밋하지 않은 변경이 있습니다. 커밋 · push 한 뒤 릴리즈하세요." >&2
    exit 1
  fi
  git fetch -q origin
  SHA=$(git rev-parse HEAD)
  if [ -z "$(git branch -r --contains "$SHA")" ]; then
    echo "HEAD($SHA) 가 아직 push 되지 않았습니다." >&2
    exit 1
  fi
  TOP=$(grep -m1 '^## ' CHANGELOG.md || true)
  if [ "$TOP" != "## $VERSION" ]; then
    echo "ai-sub-ko/CHANGELOG.md 맨 위 제목이 '## $VERSION' 이 아닙니다 (지금: '$TOP')." >&2
    exit 1
  fi
fi
export GITHUB_SHA
GITHUB_SHA=$(git rev-parse HEAD)

echo "== 문법 · manifest · 테스트"
for f in background.js content.js yt-main.js popup.js options.js offscreen.js lib/*.js; do node --check "$f"; done
node -e "const m=require('./manifest.json'); if(m.manifest_version!==3) throw new Error('MV3 아님'); console.log(m.name, m.version)"
node --test
echo "== 설치 파일 묶기"
scripts/package.sh
FILES=("build/ai-sub-ko-$VERSION.zip" "build/build-$VERSION.json")
ls -la "${FILES[@]}"

if [ "$PUBLISH" = 0 ]; then
  echo "== --no-publish: ai-sub-ko/build/ 에만 만들었습니다."
  exit 0
fi

echo "== GitHub Release $TAG ($REPO, 지우고 새로 만듦)"
NOTES_FILE=$(mktemp)
{
  awk -v v="## $VERSION" '/^## /{ if (on) exit; on = ($0 == v); next } on' CHANGELOG.md
  echo
  echo "main ${GITHUB_SHA::7} 빌드. 압축을 풀어 chrome://extensions › 개발자 모드 › 압축해제된 확장 프로그램을 로드합니다 로 설치. 자세한 방법은 ai-sub-ko/README.md."
} > "$NOTES_FILE"
gh release delete "$TAG" --repo "$REPO" --yes --cleanup-tag 2>/dev/null || true
gh release create "$TAG" "${FILES[@]}" --repo "$REPO" --target "$SHA" --title "ai-sub-ko $VERSION" \
  --notes-file "$NOTES_FILE" --latest=false
rm -f "$NOTES_FILE"
gh release view "$TAG" --repo "$REPO" --json url,assets -q '.url, (.assets[].name)'

#!/usr/bin/env bash
# ai-sub-ko 를 검사 · 묶고 이 저장소(d2ntr5/ai-sub-ko)의 GitHub Release v<버전> 을 만듭니다.
#
#   make publish VERSION=1.0.1              # = bash scripts/release.sh 1.0.1
#   bash scripts/release.sh 1.0.1 --no-publish   # build/ 까지만 (올리지 않음)
#
# 크롬 웹 스토어에는 이 zip(build/ai-sub-ko-<버전>.zip)을 개발자 대시보드에서 직접 올립니다.
# 서명 비밀값은 없습니다. 필요: node, gh(로그인)
set -euo pipefail

VERSION="${1:-}"
PUBLISH=1
[ "${2:-}" = "--no-publish" ] && PUBLISH=0
if [ -z "$VERSION" ]; then
  echo "사용법: bash scripts/release.sh <version> [--no-publish]" >&2
  exit 1
fi
REPO=d2ntr5/ai-sub-ko
TAG="v$VERSION"

cd "$(dirname "$0")/.."

CODE_VERSION=$(node -p "require('./manifest.json').version")
if [ "$CODE_VERSION" != "$VERSION" ]; then
  echo "manifest.json 의 버전($CODE_VERSION)이 $VERSION 이 아닙니다." >&2
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
    echo "CHANGELOG.md 맨 위 제목이 '## $VERSION' 이 아닙니다 (지금: '$TOP')." >&2
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
FILES=("build/ai-sub-ko-$VERSION.zip" "build/ai-sub-ko-$VERSION-store.zip" "build/build-$VERSION.json")
ls -la "${FILES[@]}"

if [ "$PUBLISH" = 0 ]; then
  echo "== --no-publish: build/ 에만 만들었습니다."
  exit 0
fi

echo "== GitHub Release $TAG ($REPO)"
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then echo "$TAG 릴리즈가 이미 있습니다." >&2; exit 1; fi
NOTES_FILE=$(mktemp)
{
  awk -v v="## $VERSION" '/^## /{ if (on) exit; on = ($0 == v); next } on' CHANGELOG.md
  echo
  echo "main ${GITHUB_SHA::7} 빌드. 크롬 웹 스토어에서 설치하는 것을 권합니다. 직접 설치: 압축을 풀어 chrome://extensions › 개발자 모드 › 압축해제된 확장 프로그램을 로드합니다. 자세한 방법은 README.md."
} > "$NOTES_FILE"
gh release create "$TAG" "${FILES[@]}" --repo "$REPO" --target "$SHA" --title "ai-sub-ko $VERSION" \
  --notes-file "$NOTES_FILE"
rm -f "$NOTES_FILE"
gh release view "$TAG" --repo "$REPO" --json url,assets -q '.url, (.assets[].name)'

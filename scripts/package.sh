#!/usr/bin/env bash
# 크롬에 불러올 파일만 모아 build/ai-sub-ko-<버전>.zip 으로 묶는다 (build-<버전>.json 도)
# zip 안은 버전 없는 ai-sub-ko/ 폴더 하나 → 맥에서 풀면 늘 ai-sub-ko 폴더라 쓰던 폴더에 그대로 덮어쓸 수 있다
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./manifest.json').version")
rm -rf build
mkdir -p build/ai-sub-ko
cp -R manifest.json background.js content.js overlay.css popup.html popup.css popup.js options.html options.js \
  yt-main.js offscreen.html offscreen.js lib icons build/ai-sub-ko/
(cd build && zip -qr -X "ai-sub-ko-$VERSION.zip" ai-sub-ko)
printf '{"version": "%s", "sha": "%s"}\n' "$VERSION" "${GITHUB_SHA:-local}" > "build/build-$VERSION.json"
echo "완료: build/ai-sub-ko-$VERSION.zip (AI 자막 번역 $VERSION)"

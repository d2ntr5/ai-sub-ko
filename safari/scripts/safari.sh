#!/usr/bin/env bash
# Safari판 (Mac App Store) 만들기. 크롬판(make dist · make publish)은 건드리지 않는다. 자세한 것은 docs/SAFARI.md.
#
#   bash safari/scripts/safari.sh build  <x.y.z>   # 서명 없이 컴파일만 (확인용)
#   bash safari/scripts/safari.sh check  <x.y.z>   # 「AI 자막 번역 Check」 — 번들 ID …ai-sub-ko.check, Apple Development 서명 (맥 시험용)
#   bash safari/scripts/safari.sh pkg    <x.y.z>   # safari/build/AISubKo-x.y.z.pkg — Mac App Distribution 서명
#   bash safari/scripts/safari.sh upload <x.y.z>   # pkg + altool 확인 + App Store Connect 올리기
#
# 필요 (저장소 밖, 커밋 · 출력 금지):
#   ~/MacAppStoreSigning/  mac-app-distribution.p12 · mac-installer-distribution.p12 · development.p12 · password.txt · AppleWWDRCAG3.cer
#                          ai-sub-ko-appstore · ai-sub-ko-extension-appstore · ai-sub-ko-check-development · ai-sub-ko-check-extension-development (.provisionprofile)
#   ~/AppStoreConnectSigning/asc.env + AuthKey_<KEY_ID>.p8 (upload)
set -euo pipefail

MODE="${1:-}"; VERSION="${2:-}"
if [[ ! "$MODE" =~ ^(build|check|pkg|upload)$ ]] || [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "사용법: bash safari/scripts/safari.sh build|check|pkg|upload <x.y.z>" >&2; exit 1
fi
HERE="$(cd "$(dirname "$0")/.." && pwd)"   # safari/
ROOT="$(cd "$HERE/.." && pwd)"
OUT="$HERE/build"
SIGNING="${MAS_SIGNING_DIR:-$HOME/MacAppStoreSigning}"
cd "$ROOT"
# 빌드 번호: 커밋 수 + 100 (App Store Connect 는 올릴 때마다 더 커야 함)
BUILD=$(( $(git rev-list --count HEAD) + 100 ))

case "$MODE" in
  check|build) BASE=io.github.d2ntr5.ai-sub-ko.check; NAME="AI 자막 번역 Check"; SCHEME=aisubko-check
               P12=development; PROF_APP=ai-sub-ko-check-development; PROF_EXT=ai-sub-ko-check-extension-development ;;
  *)           BASE=io.github.d2ntr5.ai-sub-ko; NAME="AISubKo"; SCHEME=aisubko
               P12=mac-app-distribution; PROF_APP=ai-sub-ko-appstore; PROF_EXT=ai-sub-ko-extension-appstore ;;
esac
TEAM=$(security cms -D -i "$SIGNING/$PROF_APP.provisionprofile" 2>/dev/null | plutil -extract TeamIdentifier.0 raw -o - - 2>/dev/null || true)
[ "$MODE" = build ] && TEAM=${TEAM:-TEAM}
[ -n "$TEAM" ] || { echo "프로파일 $PROF_APP 이 없습니다 ($SIGNING)." >&2; exit 1; }
GROUP="$TEAM.$BASE.shared"

grep -qx "## $VERSION" safari/appstore/CHANGELOG.md || { echo "safari/appstore/CHANGELOG.md 에 '## $VERSION' 이 없습니다." >&2; exit 1; }

echo "== 확장 파일 ($VERSION)"
EXT="$OUT/ext/Resources"
rm -rf "$OUT/ext"; mkdir -p "$EXT"
cp -R background.js content.js overlay.css popup.html popup.css popup.js options.html options.js yt-main.js lib icons "$EXT/"
node safari/scripts/manifest.mjs manifest.json "$EXT/manifest.json" "$VERSION"
for f in "$EXT"/*.js "$EXT"/lib/*.js; do node --check "$f"; done

echo "== 프로젝트 · 컴파일 ($MODE, 빌드 $BUILD)"
(cd "$HERE" && xcodegen generate --quiet)
DD="$OUT/DerivedData"
xcodebuild -project "$HERE/AISubKo.xcodeproj" -scheme AISubKo -configuration Release -derivedDataPath "$DD" \
  ARCHS="arm64 x86_64" ONLY_ACTIVE_ARCH=NO MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD" \
  AISUBKO_KEYCHAIN_GROUP="$GROUP" AISUBKO_URL_SCHEME="$SCHEME" -quiet build
SRC_APP="$DD/Build/Products/Release/AISubKo.app"
APP="$OUT/$NAME.app"
[ "$MODE" = build ] && [ -d "$APP" ] && { rm -rf "$OUT/check-keep.app"; mv "$APP" "$OUT/check-keep.app"; }
rm -rf "$APP"; ditto "$SRC_APP" "$APP"
APPEX="$APP/Contents/PlugIns/AISubKoExtension.appex"
# 확장 파일은 Resources 바로 밑에 (manifest.json 이 없으면 Safari 가 못 읽고 App Store 가 90850 으로 거부)
mkdir -p "$APPEX/Contents/Resources"
ditto "$EXT" "$APPEX/Contents/Resources"
[ -f "$APPEX/Contents/Resources/manifest.json" ] || { echo "appex 에 manifest.json 이 없습니다." >&2; exit 1; }
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BASE" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BASE.extension" "$APPEX/Contents/Info.plist"
if [ "$MODE" != pkg ] && [ "$MODE" != upload ]; then
  for p in "$APP/Contents/Info.plist" "$APPEX/Contents/Info.plist"; do
    /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName $NAME" -c "Set :CFBundleName $NAME" "$p"
  done
fi
lipo -info "$APP/Contents/MacOS/AISubKo"
if [ "$MODE" = build ]; then
  # 서명 없는 빌드가 시험 중인 Check 빌드를 덮어쓰지 않게 이름을 바꿔 둔다 (2026-11-29 한 번 덮어씀)
  rm -rf "$OUT/AISubKo Unsigned.app"; mv "$APP" "$OUT/AISubKo Unsigned.app"
  [ -d "$OUT/check-keep.app" ] && mv "$OUT/check-keep.app" "$APP"
  echo "Built $OUT/AISubKo Unsigned.app (서명 없음)"; exit 0
fi

echo "== 서명"
KC_DIR=$(mktemp -d); KC="$KC_DIR/mas.keychain-db"; KC_PASS=$(uuidgen)
cleanup() { security delete-keychain "$KC" 2>/dev/null || true; rm -rf "$KC_DIR"; return 0; }
trap cleanup EXIT
security create-keychain -p "$KC_PASS" "$KC"
security set-keychain-settings -lut 3600 "$KC"
security unlock-keychain -p "$KC_PASS" "$KC"
PASS=$(cat "$SIGNING/password.txt")
for p in "$P12" mac-installer-distribution; do
  security import "$SIGNING/$p.p12" -k "$KC" -P "$PASS" -T /usr/bin/codesign -T /usr/bin/productbuild >/dev/null
done
security import "$SIGNING/AppleWWDRCAG3.cer" -k "$KC" >/dev/null 2>&1 || true
security set-key-partition-list -S apple-tool:,apple: -s -k "$KC_PASS" "$KC" >/dev/null
identity() { security find-identity -p "$2" "$KC" | awk -v n="$1" 'index($0, n) { print $2; exit }'; }
if [ "$P12" = development ]; then SIGN_ID=$(identity "Apple Development" codesigning)
else SIGN_ID=$(identity "Mac App Distribution" codesigning); [ -n "$SIGN_ID" ] || SIGN_ID=$(identity "3rd Party Mac Developer Application" codesigning); fi
[ -n "$SIGN_ID" ] || { echo "$P12.p12 에 서명 인증서가 없습니다." >&2; exit 1; }

ent() { sed -e "s/__TEAM__/$TEAM/g" -e "s/__BUNDLE_ID__/$2/g" -e "s/__GROUP__/$GROUP/g" "$1" > "$3"; plutil -lint "$3" >/dev/null; }
ent safari/Extension/Extension.entitlements "$BASE.extension" "$KC_DIR/ext.entitlements"
ent safari/App/App.entitlements "$BASE" "$KC_DIR/app.entitlements"
cp "$SIGNING/$PROF_EXT.provisionprofile" "$APPEX/Contents/embedded.provisionprofile"
cp "$SIGNING/$PROF_APP.provisionprofile" "$APP/Contents/embedded.provisionprofile"
chmod 644 "$APPEX/Contents/embedded.provisionprofile" "$APP/Contents/embedded.provisionprofile"
# 확장 속성이 남으면 pkg 안에 ._ 파일이 생겨 App Store 가 「Invalid product archive」(90229)로 거부 (2026-11-29)
xattr -cr "$APP"
codesign --force --sign "$SIGN_ID" --keychain "$KC" --entitlements "$KC_DIR/ext.entitlements" --options runtime --timestamp=none "$APPEX"
codesign --force --sign "$SIGN_ID" --keychain "$KC" --entitlements "$KC_DIR/app.entitlements" --options runtime --timestamp=none "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -d --entitlements - "$APP" 2>/dev/null | grep -c app-sandbox >/dev/null
if [ "$MODE" = check ]; then echo "Built $APP"; exit 0; fi

echo "== pkg"
PKG="$OUT/AISubKo-$VERSION.pkg"
INST_ID=$(identity "Mac Installer Distribution" basic); [ -n "$INST_ID" ] || INST_ID=$(identity "3rd Party Mac Developer Installer" basic)
[ -n "$INST_ID" ] || { echo "Mac Installer Distribution 인증서가 없습니다." >&2; exit 1; }
COPYFILE_DISABLE=1 productbuild --component "$APP" /Applications --sign "$INST_ID" --keychain "$KC" "$PKG"
pkgutil --check-signature "$PKG" | head -3
echo "Built $PKG"
[ "$MODE" = upload ] || exit 0

echo "== App Store Connect 올리기"
# shellcheck disable=SC1090
source "${ASC_ENV:-$HOME/AppStoreConnectSigning/asc.env}"
export API_PRIVATE_KEYS_DIR="$(dirname "${ASC_ENV:-$HOME/AppStoreConnectSigning/asc.env}")"
xcrun altool --validate-app -f "$PKG" -t macos --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID"
xcrun altool --upload-app -f "$PKG" -t macos --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID"

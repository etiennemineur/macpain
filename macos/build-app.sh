#!/bin/bash
# Construit macos/MacPain.app à partir de la version web.
#
#   1. bash build.sh           → dist/ (exactement ce qui est publié sur le site)
#   2. swiftc macos/main.swift → exécutable universel (Apple Silicon + Intel)
#   3. dist/ copié dans MacPain.app/Contents/Resources/web
#   4. icône fabriquée à partir de « images/Macpain logo.png »
#   5. signature ad hoc (usage local ; voir macos/LISEZ-MOI.md pour distribuer)
#
# Les sources web ne sont jamais dupliquées ici : l'application est toujours
# reconstruite à partir de dist/.
#
# Utilisation : bash macos/build-app.sh
#   SIGN_IDENTITY="Developer ID Application: …" bash macos/build-app.sh
#     signe avec cette identité (et l'exécution renforcée) au lieu de la signature ad hoc.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="1.0"
BUNDLE_ID="design.etienne.macpain"
MIN_MACOS="12.0"
APP="macos/MacPain.app"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "→ version web (build.sh)"
bash build.sh >/dev/null
BUILD="$(date +%Y%m%d.%H%M)"

echo "→ compilation Swift"
for arch in arm64 x86_64; do
  xcrun swiftc -O -swift-version 5 -target "$arch-apple-macos$MIN_MACOS" \
    -framework AppKit -framework WebKit \
    macos/main.swift -o "$WORK/MacPain-$arch"
done
lipo -create "$WORK/MacPain-arm64" "$WORK/MacPain-x86_64" -output "$WORK/MacPain"

echo "→ icône"
xcrun swift macos/make-icon.swift "images/Macpain logo.png" "$WORK/icone-1024.png"
ICONSET="$WORK/MacPain.iconset"
mkdir "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z "$s" "$s" "$WORK/icone-1024.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z "$d" "$d" "$WORK/icone-1024.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$WORK/MacPain.icns"

echo "→ assemblage de $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/fr.lproj"
cp "$WORK/MacPain" "$APP/Contents/MacOS/MacPain"
cp "$WORK/MacPain.icns" "$APP/Contents/Resources/MacPain.icns"
rsync -a --exclude '.DS_Store' dist/ "$APP/Contents/Resources/web/"
# Dossier fr.lproj : les panneaux du système (enregistrer, ouvrir, à propos) s'affichent en français.
printf '/* MacPain */\n' > "$APP/Contents/Resources/fr.lproj/InfoPlist.strings"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>MacPain</string>
  <key>CFBundleDisplayName</key><string>MacPain</string>
  <key>CFBundleExecutable</key><string>MacPain</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleIconFile</key><string>MacPain</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$BUILD</string>
  <key>CFBundleDevelopmentRegion</key><string>fr</string>
  <key>LSMinimumSystemVersion</key><string>$MIN_MACOS</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.graphics-design</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSHumanReadableCopyright</key><string>Étienne Mineur. Réplique satirique de MacPaint 1.5 (1985).</string>
</dict>
</plist>
PLIST

echo "→ signature"
if [ -n "${SIGN_IDENTITY:-}" ]; then
  codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" "$APP"
else
  codesign --force --sign - "$APP"
fi
codesign --verify --strict "$APP"

echo "prêt : $APP (version $VERSION, construction $BUILD)"
du -sh "$APP" | cut -f1

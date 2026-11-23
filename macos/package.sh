#!/bin/bash
# Fabrique le fichier à faire télécharger : macos/telechargement/MacPain-<version>.dmg
#
#   1. reconstruit MacPain.app, signée avec le certificat « Developer ID Application »
#      du trousseau (exécution renforcée, horodatage) ;
#   2. fabrique une image disque avec l'application, un raccourci vers Applications et le
#      mode d'emploi bilingue (macos/LISEZ-MOI-telechargement.txt) ;
#   3. signe l'image disque ;
#   4. si NOTARY_PROFILE est donné, l'envoie à Apple pour notarisation et agrafe le ticket.
#
# Utilisation :
#   bash macos/package.sh                               signée, non notarisée
#   NOTARY_PROFILE=macpain bash macos/package.sh        signée et notarisée
#
# Le profil de notarisation se crée une seule fois, par vous, dans le Terminal :
#   xcrun notarytool store-credentials macpain --apple-id VOTRE_IDENTIFIANT_APPLE --team-id 7H5F3NJHAE
# (le Terminal demande alors un « mot de passe pour application », à créer sur account.apple.com).
set -euo pipefail
cd "$(dirname "$0")/.."

IDENTITY="${SIGN_IDENTITY:-$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application: [^"]*\)".*/\1/p' | head -1)}"
if [ -z "$IDENTITY" ]; then
  echo "Aucun certificat « Developer ID Application » dans le trousseau." >&2
  echo "Sans lui, les autres Mac bloqueront l'application. Voir macos/LISEZ-MOI.md." >&2
  exit 1
fi
echo "→ signature : $IDENTITY"
SIGN_IDENTITY="$IDENTITY" bash macos/build-app.sh

APP="macos/MacPain.app"
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")"
OUT="macos/telechargement"
DMG="$OUT/MacPain-$VERSION.dmg"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "→ image disque"
mkdir -p "$OUT"
ditto "$APP" "$STAGE/MacPain.app"
ln -s /Applications "$STAGE/Applications"
# Le mode d'emploi bilingue, dans l'image disque à côté de l'application.
cp macos/LISEZ-MOI-telechargement.txt "$STAGE/LISEZ-MOI - READ ME.txt"
rm -f "$DMG"
hdiutil create -quiet -volname "MacPain" -srcfolder "$STAGE" -fs HFS+ -format UDZO -imagekey zlib-level=9 "$DMG"
codesign --force --timestamp --sign "$IDENTITY" "$DMG"

if [ -n "${NOTARY_PROFILE:-}" ]; then
  echo "→ notarisation par Apple (quelques minutes)"
  xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$DMG"
  echo "→ contrôle Gatekeeper"
  spctl -a -t open --context context:primary-signature -vv "$DMG"
else
  echo "(non notarisée : relancer avec NOTARY_PROFILE=… avant de la mettre en ligne)"
fi

echo "prêt : $DMG"
ls -lh "$DMG" | awk '{print $5}'
shasum -a 256 "$DMG" | cut -c1-64

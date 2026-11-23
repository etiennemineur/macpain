#!/bin/bash
# Construit le paquet Windows 64 bits de MacPain à partir de la version web.
#
#   1. bash build.sh        → dist/ (exactement ce qui est publié sur le site)
#   2. npm install          → Electron et les outils, dans windows/node_modules (la première fois)
#   3. windows/app/ + dist/ assemblés dans un dossier temporaire (dist/ devient « web »)
#   4. icône .ico fabriquée à partir de « images/Macpain logo.png »
#   5. Electron pour Windows x64 téléchargé (la première fois) et habillé : MacPain.exe
#   6. dossier zippé → windows/telechargement/MacPain-<version>-windows-x64.zip
#
# Les sources web ne sont jamais dupliquées ici : l'application est toujours
# reconstruite à partir de dist/. Se lance depuis un Mac ; il faut Node.js (npm)
# et les outils en ligne de commande d'Apple (pour l'icône).
#
# Utilisation : bash windows/build-app.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

VERSION="$(node -p "require('./windows/app/package.json').version")"
SHORT="${VERSION%.0}"
OUT="windows/telechargement"
ZIP="$OUT/MacPain-$SHORT-windows-x64.zip"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK:?}"' EXIT

echo "→ version web (build.sh)"
bash build.sh >/dev/null

echo "→ outils (Electron, packager)"
if [ ! -x windows/node_modules/.bin/electron-packager ]; then
  (cd windows && npm install --no-fund --no-audit)
fi

echo "→ assemblage"
mkdir -p "$WORK/app"
cp windows/app/main.js windows/app/preload.js windows/app/package.json "$WORK/app/"
rsync -a --exclude '.DS_Store' dist/ "$WORK/app/web/"

echo "→ icône"
xcrun swift macos/make-icon.swift "images/Macpain logo.png" "$WORK/icone-1024.png"
sips -z 256 256 "$WORK/icone-1024.png" --out "$WORK/icone-256.png" >/dev/null
(cd windows && node -e "
const m = require('png-to-ico'); const toIco = m.default || m;
toIco(process.argv[1]).then(b => require('fs').writeFileSync(process.argv[2], b));
" "$WORK/icone-256.png" "$WORK/MacPain.ico")

echo "→ Electron pour Windows x64"
ELECTRON="$(node -p "require('./windows/node_modules/electron/package.json').version")"
(cd windows && npx electron-packager "$WORK/app" MacPain \
  --platform=win32 --arch=x64 --out="$WORK/out" --overwrite --asar \
  --electron-version="$ELECTRON" --icon="$WORK/MacPain.ico" --app-version="$VERSION" \
  --app-copyright="Étienne Mineur. Réplique satirique de MacPaint 1.5 (1985)." \
  --win32metadata.CompanyName="Étienne Mineur" \
  --win32metadata.FileDescription="MacPain" \
  --win32metadata.ProductName="MacPain" \
  --win32metadata.InternalName="MacPain" \
  --win32metadata.OriginalFilename="MacPain.exe" >/dev/null)

echo "→ archive"
mv "$WORK/out/MacPain-win32-x64" "$WORK/out/MacPain"
cat > "$WORK/out/MacPain/LISEZ-MOI.txt" <<'TXT'
MacPain pour Windows (64 bits)

1. Gardez tout ce dossier ensemble (ne sortez pas MacPain.exe tout seul).
2. Double-cliquez sur MacPain.exe.
3. Au premier lancement, Windows peut afficher « Windows a protégé votre
   ordinateur » : cliquez sur « Informations complémentaires », puis sur
   « Exécuter quand même ».

Aucune installation, aucune connexion à Internet. Pour désinstaller,
supprimez ce dossier.
TXT
# Fins de ligne Windows pour le Bloc-notes.
perl -pi -e 's/\n/\r\n/' "$WORK/out/MacPain/LISEZ-MOI.txt"
mkdir -p "$OUT"
rm -f "${ROOT:?}/${ZIP:?}"
(cd "$WORK/out" && zip -r -q -X "$ROOT/$ZIP" MacPain)

echo "prêt : $ZIP (version $VERSION, Electron $ELECTRON)"
ls -lh "$ZIP" | awk '{print $5}'
shasum -a 256 "$ZIP" | cut -c1-64

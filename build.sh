#!/bin/bash
# Prépare dist/ : copie le moteur et les polices, écrit fonts.css, et pose une
# version (empreinte courte) sur chaque fichier appelé par la page.
#
# Pourquoi une version dans l'URL : Cloudflare sert les .js et .css avec
# « cache-control: max-age=14400 ». Sans changement d'adresse, un visiteur garde
# l'ancien moteur pendant quatre heures après une publication.
#
# Utilisation : ./build.sh   puis   ~/Developer/etienne-tools-hub/deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

rm -rf dist/sound
mkdir -p dist/fonts dist/sound
cp macpaint.js dist/macpaint.js
cp classic-data.js dist/classic-data.js
cp satire.js dist/satire.js
cp sound/*.wav sound/*.mp3 dist/sound/
cp sound/CREDITS-SONS.txt dist/sound/
cp touch.html touch.css touch.js touch-router.js touch.webmanifest touch-icon-180.png touch-icon-192.png touch-icon-512.png dist/
for image in macpaint-touch-*.png; do [ ! -f "$image" ] || cp "$image" dist/; done
cp fonts/Athene.woff2 fonts/Liverpool.woff2 "fonts/Los Altos.woff2" \
   fonts/Sanfrisco.woff2 fonts/Torrance.woff2 fonts/Valencia.woff2 \
   "fonts/Parc Place.woff2" fonts/Chicago.woff2 dist/fonts/
cp fonts/LICENCE-UrbanRenewal.txt dist/fonts/

short() { shasum -a 256 "$1" | cut -c1-8; }

python3 - <<'PY'
faces = [("Athens","Athene.woff2"),("London","Liverpool.woff2"),("Los Angeles","Los Altos.woff2"),
         ("San Francisco","Sanfrisco.woff2"),("Toronto","Torrance.woff2"),("Venice","Valencia.woff2"),
         ("Palo Alto","Parc Place.woff2"),("Chicago","Chicago.woff2")]
import hashlib, os
out = ["/* Polices embarquées : Urban Renewal (Kreative Korp) et Chicago. Fichiers locaux,",
       "   pas de data: — la CSP du site n'autorise que 'self' pour les polices. */"]
for fam, f in faces:
    h = hashlib.sha256(open(os.path.join("dist/fonts", f), "rb").read()).hexdigest()[:8]
    out.append('@font-face{font-family:"%s";src:url(%s?v=%s) format("woff2");font-display:block}' % (fam, f.replace(" ", "%20"), h))
open("dist/fonts/fonts.css", "w").write("\n".join(out) + "\n")
PY

JSV=$(short dist/macpaint.js)
CSSV=$(short dist/fonts/fonts.css)
python3 - "$JSV" "$CSSV" <<'PY'
import re, sys
js, css = sys.argv[1], sys.argv[2]
p = "dist/index.html"
s = open(p).read()
if 'touch-router.js' not in s:
    s = s.replace('<head>', '<head>\n<script src="touch-router.js"></script>', 1)
s = re.sub(r'touch-router\.js(?:\?v=[0-9a-zA-Z._-]*)?', 'touch-router.js?v='+__import__('hashlib').sha256(open('dist/touch-router.js','rb').read()).hexdigest()[:8], s)
s = re.sub(r'macpaint\.js\?v=[0-9a-zA-Z._-]*', 'macpaint.js?v=' + js, s)
s = re.sub(r'classic-data\.js\?v=[0-9a-zA-Z._-]*', 'classic-data.js?v=' + __import__('hashlib').sha256(open('dist/classic-data.js','rb').read()).hexdigest()[:8], s)
s = re.sub(r'satire\.js\?v=[0-9a-zA-Z._-]*', 'satire.js?v=' + __import__('hashlib').sha256(open('dist/satire.js','rb').read()).hexdigest()[:8], s)
s = re.sub(r'fonts/fonts\.css\?v=[0-9a-zA-Z._-]*', 'fonts/fonts.css?v=' + css, s)
open(p, "w").write(s)
touch = open('touch.html').read()
def revision(m):
    name=m.group(2)
    version=__import__('hashlib').sha256(open('dist/'+name,'rb').read()).hexdigest()[:8]
    return m.group(1)+'="'+name+'?v='+version+'"'
touch = re.sub(r'(src|href)="([^"?]+\.(?:js|css))(?:\?v=[^"]*)?"', revision, touch)
open('dist/touch.html','w').write(touch)
print("moteur", js, "styles", css, "coque iPhone prête")
PY

echo "dist/ prêt :"
ls -1 dist dist/fonts
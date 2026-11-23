# MacPain

**Seriez-vous capable d’affronter MacPain ?** Une réplique satirique de MacPaint 1.5 (1985)
pour le navigateur, qui se retourne peu à peu contre vous. Cinq niveaux de difficulté, de
« I’m Too Young To Die » (le logiciel d’origine, sage et muet) à « Nightmare! » : l’interface
se moque, se démonte, tourne et explose, sous les rires, les applaudissements et le gabber.

À essayer en ligne : **https://etienne.design/tools/macpain/** (ordinateur et iPhone).
Version Mac signée et validée par Apple :
https://etienne.design/tools/macpain/telechargement/MacPain-1.0.dmg

Conception et design : Étienne Mineur.

## Ce que contient ce dépôt

| Fichier ou dossier | Rôle |
|---|---|
| `macpaint.js` | le moteur : dessin bitmap 1 bit, 20 outils, 38 trames, texte, menus, physique des cases |
| `satire.js` | le moteur sonore (Web Audio) et l’humeur : niveaux, pièges d’interface, écran d’accueil à la disquette |
| `touch.html`, `touch.js`, `touch.css` | la version iPhone, pensée pour le portrait |
| `index.html`, `touch-router.js` | la page d’ordinateur et l’aiguillage vers la version iPhone |
| `build.sh` | prépare le dossier `dist/` à publier |
| `sound/` | sons synthétisés et enregistrements du domaine public, avec leurs scripts de fabrication |
| `fonts/` | polices Kreative (licence propre) |
| `reference/` | scripts qui extraient les ressources d’origine de MacPaint 1.5 |
| `verification/` | suites de tests à exécuter dans le navigateur |
| `macos/`, `windows/` | applications natives (Swift, Electron) autour de la version web |

## Ce qui manque, et pourquoi

Les ressources d’origine de MacPaint (polices bitmap, menus, trames), la police Chicago et la
musique du niveau « Nightmare! » ne sont pas publiées ici : elles appartiennent à d’autres
auteurs (voir `LICENCES-TIERS.md`). Sans elles, l’application ne démarre pas telle quelle.

Pour la faire tourner chez soi :

1. Reconstituer `classic-data.js` avec les scripts de `reference/`, à partir d’une image
   disque de MacPaint (par exemple https://archive.org/details/mac_Paint_2), des polices
   d’origine du Macintosh (https://github.com/JohnDDuncanIII/macfonts) et d’une capture
   d’écran 512 × 342 de MacPaint 1.5 nommée `macpaint.png`.
2. Placer une police Chicago dans `fonts/Chicago.ttf` et `fonts/Chicago.woff2`.
3. Facultatif : une boucle musicale `sound/nm_gabber_loop.mp3` pour le dernier niveau.
4. Lancer `./build.sh`, puis servir le dossier `dist/` (par exemple
   `python3 -m http.server` dans `dist/`).

## Licence

Code et éléments originaux : licence MIT (voir `LICENSE`). Les éléments d’autres auteurs
gardent leurs propres conditions (voir `LICENCES-TIERS.md`). MacPaint, Macintosh et Chicago
sont des marques d’Apple Inc. ; MacPain n’est ni édité ni approuvé par Apple.

---

*English summary: MacPain is a satirical browser remake of MacPaint 1.5 (1985) that gradually
turns against you, over five difficulty levels. Play it at https://etienne.design/tools/macpain/.
This repository holds the original code (MIT) and freely redistributable assets ; Apple’s original
resources, the Chicago font and the Nightmare music are not included, see `LICENCES-TIERS.md`
for how to rebuild them.*

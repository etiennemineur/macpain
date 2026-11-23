# MacPain pour macOS

`macos/MacPain.app` est la version web classique (`dist/index.html`) dans une fenêtre
native : une petite application Swift/AppKit avec une `WKWebView`. Pas d'Electron, pas de
navigateur visible, aucune connexion réseau. Environ 9 Mo, Apple Silicon et Intel,
macOS 12 ou plus récent.

## Reconstruire

```bash
bash macos/build-app.sh
```

Le script lance `bash build.sh`, compile `macos/main.swift`, copie `dist/` dans
`MacPain.app/Contents/Resources/web`, fabrique l'icône à partir de
`images/Macpain logo.png` et signe l'application (signature ad hoc). Il faut Xcode ou
les outils en ligne de commande d'Apple. Les sources web ne sont pas dupliquées :
après toute modification du web, relancer le script.

Version et identifiant (`design.etienne.macpain`) : en tête de `build-app.sh`.

## Ce que fait la coque native

- **Vrais menus du Mac.** File, Edit, Goodies, Font, FontSize et Style sont dans la barre
  de menus de macOS, construits à partir des menus du moteur (`__mp.MENUS`), avec leurs
  raccourcis et leurs coches. Le menu « MacPain » reprend le menu Pomme du logiciel
  (About, Difficulty…) et ajoute Taille ×1 / ×2, Plein écran, Recommencer, Quitter.
- **Pas de fenêtre globale : quatre vraies fenêtres.** La feuille (« untitled »), les
  outils, les traits et les trames ont chacun leur fenêtre macOS, posée au lancement là où
  le bloc se trouvait sur l'écran de 1984. Les palettes sont des fenêtres filles de la
  page : elle y recopie à chaque image son morceau d'écran et reçoit leurs clics. Le menu
  « MacPain » propose Taille ×1 / ×2.
- **Les fenêtres bougent pour de bon.** Les sauts et déménagements de blocs du moteur
  déplacent les fenêtres ; en Hurt Me Plenty la feuille pivote avec le trait ; à partir
  d'Ultra-Violence chaque fenêtre erre seule sur tout le bureau (lentement), et en
  Nightmare! elles changent de place, d'angle et de taille plusieurs fois par seconde,
  pendant que les menus se mélangent dans la barre et que trames et outils changent de
  case dans leurs palettes. Ce mouvement passe par une fonction du serveur de fenêtres
  qu'Apple ne documente pas (`CGSSetWindowTransform`) : si elle disparaît d'une version de
  macOS, les fenêtres restent à leur place. Elle interdit le Mac App Store (pas la
  distribution directe).
- **Pièges et réclames : de vraies fenêtres.** À partir de Hurt Me Plenty, chaque boîte
  (aide envahissante, bandeau, question, conditions, réclame…) s'ouvre dans sa propre
  fenêtre macOS, par-dessus les autres, n'importe où sur l'écran, et non plus dans la
  feuille. Le mauvais bouton secoue la fenêtre ; l'aide envahissante se déplace pour de
  bon. `satire.js` appelle pour cela `MacPainNative.popup(el)` (absent sur le site).
- Les fichiers embarqués sont servis sous l'adresse privée `macpain://app/…` : sons par
  `fetch` + Web Audio comme sur le site, niveau de difficulté conservé entre deux
  lancements (`~/Library/WebKit/design.etienne.macpain`). Le dessin n'est jamais rechargé.
- Save → panneau d'enregistrement de macOS ; Open → panneau de choix d'image ;
  Print → panneau d'impression (feuille 576 × 720) ; Quit → quitte l'application.
- Microphone refusé, comme sur le site : le piège des miettes de gomme passe au tapotement.

## Crochets dans le moteur web

`macpaint.js` lit `window.MacPainNative`, que seule l'application pose (avant le
chargement de la page). Sur le site cet objet n'existe pas et rien ne change. Quand il
existe avec `windows: true` : `fit()` ne montre que la zone de dessin, l'écran simulé
reste composé comme en 1984 (les décalages des blocs partent dans `NATIVE.blocks` au
lieu d'être dessinés), les cases ne tombent plus hors de leur palette, `cmd()` confie
quit / print / pagesetup au système, et en Nightmare! les trames changent de case
(`PAT_SLOT`).

## Distribuer à d'autres personnes (hors App Store)

```bash
bash macos/package.sh
```

produit `macos/telechargement/MacPain-1.0.dmg` : l'application signée avec le certificat
« Developer ID Application: les editions volumiques » du trousseau, dans une image disque
avec un raccourci vers Applications. C'est ce fichier qu'on met en téléchargement.

Il reste une étape, à faire une fois par version : la **notarisation** (Apple vérifie
l'absence de logiciel malveillant). Sans elle, les autres Mac bloquent l'ouverture.

1. Une seule fois, créer un « mot de passe pour application » sur account.apple.com
   (Connexion et sécurité), puis l'enregistrer dans le trousseau :
   `xcrun notarytool store-credentials macpain --apple-id VOTRE_IDENTIFIANT_APPLE --team-id 7H5F3NJHAE`
2. À chaque version : `NOTARY_PROFILE=macpain bash macos/package.sh`
   (envoi à Apple, quelques minutes d'attente, ticket agrafé au `.dmg`).

Après cela, la personne qui télécharge voit seulement « MacPain est une app téléchargée
depuis Internet. Voulez-vous vraiment l'ouvrir ? ».

## Mise au point

Lancée avec la variable d'environnement `MACPAIN_VERIF_DIR=/un/dossier`, l'application
évalue dans la page tout fichier `cmd.js` déposé dans ce dossier et écrit la réponse dans
`resultat.json`. Sans cette variable, ce mécanisme n'existe pas.

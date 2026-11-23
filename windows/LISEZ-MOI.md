# MacPain pour Windows

`windows/telechargement/MacPain-1.0-windows-x64.zip` est la version web classique
(`dist/index.html`) dans une application Windows 64 bits : la même coque que
`macos/MacPain.app`, refaite avec Electron (Chromium embarqué). Aucune connexion réseau,
aucune installation : un dossier à décompresser, `MacPain.exe` à double-cliquer.
Environ 155 Mo zippé, 375 Mo décompressé. Windows 10 ou 11, processeur 64 bits.

**Important : ce paquet a été construit et essayé depuis un Mac. Il n'a jamais été lancé
sur un PC.** Voir « Ce qui est vérifié, ce qui ne l'est pas » plus bas.

## Reconstruire

```bash
bash windows/build-app.sh
```

Le script lance `bash build.sh`, assemble `windows/app/` et `dist/` dans un dossier
temporaire (`dist/` y devient `web`), fabrique l'icône à partir de
`images/Macpain logo.png`, habille Electron pour Windows x64 (`MacPain.exe`, nom, version,
icône) et zippe le tout. Les sources web ne sont pas dupliquées : après toute
modification du web, relancer le script.

Il faut Node.js (`npm`) et les outils en ligne de commande d'Apple. La première fois, le
script télécharge Electron (environ 300 Mo dans `windows/node_modules`, plus un cache dans
`~/Library/Caches/electron`). `windows/node_modules` peut être supprimé sans risque : il
sera retéléchargé à la construction suivante.

Version : `windows/app/package.json` (`"version"`). Version d'Electron : `windows/package.json`.

## Essayer sur ce Mac

```bash
cd windows && npx electron app
```

lance exactement le même code (`windows/app/main.js`) sur le Mac, avec `dist/` tel qu'il
est. C'est un banc d'essai, pas un produit : pour le Mac, l'application est `macos/MacPain.app`.

## Pourquoi Electron

- Il se construit pour Windows depuis un Mac, sans PC, sans Wine, sans compilateur.
- Il embarque son propre navigateur : le rendu est le même sur tous les PC (pas de
  dépendance à la version de WebView2 installée), et le même que celui essayé ici.
- `window.open` donne de vraies fenêtres que la page peut remplir elle-même : c'est ce
  dont les palettes et les pièges ont besoin.

Tauri ou WebView2 donneraient un paquet de quelques Mo au lieu de 155, mais demandent un
PC (ou une chaîne de compilation croisée fragile) pour être construits et mis au point.

## Ce que fait la coque

Tout vient de `macos/main.swift`, transposé :

- **Vraie barre de menus Windows.** File, Edit, Goodies, Font, FontSize et Style sont dans
  la barre de menus de la fenêtre de la feuille, construits à partir des menus du moteur
  (`__mp.MENUS`), avec leurs coches. Les raccourcis sont affichés (Ctrl + lettre) et c'est
  la page qui les exécute. Le premier menu, « MacPain », reprend le menu Pomme du logiciel
  (About, Difficulty…) et ajoute Taille ×1 / ×2 / ×4 (selon l'écran), Recommencer, Quitter.
- **Quatre vraies fenêtres.** La feuille (« untitled »), Tools, Lines et Patterns, posées
  au lancement là où le bloc se trouvait sur l'écran de 1984. Les palettes sont des
  fenêtres filles de la page, qui y recopie à chaque image son morceau d'écran et reçoit
  leurs clics ; après un clic dans une palette, le clavier revient à la feuille.
- **Les fenêtres bougent pour de bon.** Les sauts et déménagements de blocs du moteur
  déplacent les fenêtres ; à partir d'Ultra-Violence chaque fenêtre erre seule sur tout le
  bureau ; en Nightmare! elles changent de place plusieurs fois par seconde et les menus
  se mélangent dans la barre.
- **Pièges et réclames : de vraies fenêtres**, par-dessus les autres, n'importe où sur
  l'écran. Le mauvais bouton secoue la fenêtre ; l'aide envahissante se déplace.
- Fichiers servis sous l'adresse privée `macpain://app/…` : sons par `fetch` + Web Audio,
  niveau de difficulté conservé entre deux lancements (dans
  `%APPDATA%\MacPain`). Le dessin n'est jamais rechargé. Le son ne démarre pas avant le
  premier clic (même règle que dans un navigateur).
- Save → boîte d'enregistrement de Windows (dossier Images proposé) ; Open → boîte de
  choix d'image ; Print → boîte d'impression (feuille 576 × 720, 8 × 10 pouces) ; Quit et
  la fermeture de la feuille quittent l'application.
- Microphone refusé, comme sur le site. Liens externes : dans le navigateur de la personne.

### Ce qui diffère de l'application Mac

- **Pas de rotation.** Windows ne sait pas faire pivoter une fenêtre. La feuille ne pivote
  donc pas avec le trait en Hurt Me Plenty, et les fenêtres errantes restent droites.
  **Équivalent proposé :** en Nightmare!, une fois sur trois, une fenêtre saute à la moitié
  de sa taille (×2 → ×1) puis en revient, en plus de ses déplacements. Le changement est
  net, par facteur entier, jamais progressif : un agrandissement intermédiaire aurait
  donné des pixels inégaux.
- **Pixels entiers.** L'application demande à Windows de ne pas appliquer sa « mise à
  l'échelle » (125 %, 150 %…) : un pixel de l'application = un pixel de l'écran, et la
  taille est ×1, ×2, ×4 ou ×8. Les barres de titre et de menus, elles, restent à la
  taille de Windows.
- Page Setup ouvre la boîte d'impression (Windows n'a pas de boîte de mise en page séparée).
- La barre de menus est sur la fenêtre de la feuille, pas en haut de l'écran.

## Ce qui est vérifié, ce qui ne l'est pas

**Vérifié, en lançant ce même code Electron sur le Mac** (y compris à partir du fichier
`app.asar` extrait du zip) :

- la page démarre en mode application (quatre fenêtres aux bonnes places et aux bonnes
  tailles, écran de choix du niveau, rien ne bouge ni ne sonne avant le premier clic) ;
- les menus du moteur sont repris en entier, les coches suivent police, corps et style ;
- le niveau de difficulté est retrouvé après avoir quitté et relancé ;
- en Ultra-Violence les quatre fenêtres se déplacent sur le bureau ; en Nightmare! elles
  changent aussi de taille (×2 ↔ ×1) et les menus changent d'ordre ; au retour au calme
  elles reviennent exactement à leur place et à leur taille ;
- trois pièges ouverts à la main apparaissent chacun dans sa fenêtre, avec leur dessin
  1984, et se referment ;
- l'export écrit un PNG 576 × 720 ; les fichiers de sons se chargent par `fetch` ;
- le zip contient `MacPain.exe` (Windows 64 bits) avec nom, auteur, version 1.0.0 et icône.

**Non vérifié sur le Mac non plus :** les boîtes d'enregistrement, d'ouverture et
d'impression n'ont pas été ouvertes (pendant les essais l'export écrivait directement
dans un dossier) ; aucun son n'a été écouté ; les clics dans les palettes n'ont pas été
faits à la souris (c'est le même code que dans l'application Mac).

**Non vérifié du tout, faute de PC — tout ce qui est propre à Windows :**

- que `MacPain.exe` démarre, et ce qu'en disent Windows et l'antivirus ;
- l'aspect de la barre de menus sur la feuille, l'affichage des raccourcis, les coches ;
- les petites barres de titre des palettes et des pièges (fenêtres « d'outils ») ; Windows
  peut imposer une largeur minimale à une fenêtre : la palette Tools (108 pixels de large
  en ×2) pourrait alors avoir une marge blanche à droite — le dessin, lui, reste net ;
- que les palettes restent au-dessus de la feuille et que le clavier lui revienne ;
- la désactivation de la mise à l'échelle (écrans à 125 % ou 150 %) ;
- la fluidité des fenêtres qui se déplacent et changent de taille ; en Nightmare!, la
  barre de menus est reconstruite à chaque mélange, ce qui referme un menu ouvert ;
- le son, l'impression, l'enregistrement.

Un premier essai sur un vrai PC (ou dans une machine virtuelle Windows) est donc
indispensable avant de mettre le fichier en téléchargement.

## Ce que Windows affichera au téléchargement (sans certificat)

Le paquet n'est **pas signé**. Pour la personne qui télécharge :

1. **Dans le navigateur** (Edge surtout) : possible avertissement « n'est pas couramment
   téléchargé » ; il faut choisir « Conserver ».
2. **Il faut décompresser** : clic droit sur le zip → « Extraire tout ». Lancer
   `MacPain.exe` depuis l'intérieur du zip ne marche pas.
3. **Au premier double-clic** : fenêtre bleue « Windows a protégé votre ordinateur »
   (Microsoft Defender SmartScreen), avec un seul bouton visible, « Ne pas exécuter ». Il
   faut cliquer sur **« Informations complémentaires »** (l'éditeur est alors indiqué
   « Éditeur inconnu »), puis sur **« Exécuter quand même »**. Une seule fois.
4. Sur certains PC récents sous Windows 11, le « Contrôle intelligent des applications »
   bloque tout logiciel non signé, sans bouton pour passer outre. Certains antivirus et
   certains PC d'entreprise ou d'école font de même.

Le fichier `LISEZ-MOI.txt` placé dans le dossier explique les points 2 et 3.

Pour supprimer ces avertissements il faut un certificat de signature de code Windows
(payant, délivré à une personne ou une société après vérification d'identité) et signer
`MacPain.exe`. Même signé, SmartScreen peut encore avertir pendant les premiers
téléchargements, le temps que le fichier acquière une réputation. Rien de cela n'est en
place ici.

## Mise au point

Lancée avec la variable d'environnement `MACPAIN_VERIF_DIR=/un/dossier`, l'application
évalue dans la page tout fichier `cmd.js` déposé dans ce dossier, écrit la réponse et la
place de chaque fenêtre dans `resultat.json`, une image de chaque fenêtre en PNG, et
enregistre les exports dans ce dossier sans ouvrir de boîte. Sans cette variable, ce
mécanisme n'existe pas.

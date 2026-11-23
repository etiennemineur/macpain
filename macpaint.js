/* =====================================================================
   MacPaint 1.5 — réplique bitmap pour le navigateur
   Écran 512 × 342, document 576 × 720, palette fixe, menus Apple.
   Tout est dessiné au pixel sur un seul canvas.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- *
   *  1. Géométrie de l'écran
   * ---------------------------------------------------------------- */
  const SW = 512, SH = 342;
  const CLASSIC = window.MP15_DATA;
  if (!CLASSIC) throw new Error("MacPaint reference data not loaded");
  const MENUBAR = 19;
  /* Application macOS (macos/main.swift) : la coque native pose window.MacPainNative avant le
     chargement. Les menus passent alors dans la vraie barre de menus du Mac, la barre dessinée
     sort de la fenêtre, et au niveau Nightmare! c'est la vraie fenêtre qui bouge. Sur le web cet
     objet n'existe pas : rien ne change. */
  const NATIVE = window.MacPainNative || null;
  /* Fenêtres séparées (application macOS) : la feuille, les outils, les traits et les trames ont
     chacun leur vraie fenêtre. L'écran simulé reste alors composé comme en 1984 ; les
     déplacements des blocs sont transmis aux fenêtres (NATIVE.blocks) au lieu d'être dessinés. */
  const WINDOWS = !!(NATIVE && NATIVE.windows);
  const PAL_X = 15, PAL_Y = 27, PAL_W = 53, PAL_H = 221;
  const TITLE_H = 19;
  const DOC_X = 79, DOC_Y = 28, DOC_W = 419, DOC_H = 306;
  const SB = 0, SB_R = 0, SB_B = 0;
  const VIEW = { x: 80, y: 47, w: 416, h: 240 };
  let widthPopup = false, showPage = false, alignment = "left";
  let polygonPoints = null, helpPage = null;

  const DW = 576, DH = 720;            // feuille MacPaint

  const cv = document.getElementById("screen");
  const ctx = cv.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = false;
  const touchMode = document.documentElement.hasAttribute("data-macpaint-touch");
  const changeListeners = new Set();
  function notifyChange() { for (const fn of changeListeners) fn(); }

  /* ---------------------------------------------------------------- *
   *  2. État
   * ---------------------------------------------------------------- */
  const doc = new Uint8Array(DW * DH);   // 0 = blanc, 1 = noir
  const view = { x: 0, y: 0 };           // haut-gauche de la vue dans la feuille
  let zoom = 1;
  let tool = "brush";

  /* ------------------------------------------------------------------ *
   *  Sons satiriques + rebond des pictogrammes (délégation à satire.js).
   *  satire.js est chargé avant macpaint.js ; en son absence (fichier
   *  local partiel), tout est neutralisé sans erreur.
   * ------------------------------------------------------------------ */
  const SND = (typeof Satire !== "undefined" && Satire.audio) ? Satire.audio : null;
  const MOT = (typeof Satire !== "undefined" && Satire.motion) ? Satire.motion : null;
  /* En mode tactile, touch.js gère déjà les sons ; ici on ne joue qu'en
     mode classique pour éviter les doublons. */
  function cheer(a) { if (touchMode || !SND) return; try { SND.cheer(a); } catch (e) {} }
  function stopSnd() { if (touchMode || !SND) return; try { SND.stop(); } catch (e) {} }
  function selectSnd(t) { if (touchMode || !SND) return; try { SND.select(t); } catch (e) {} }
  function loopSnd(kind) { if (touchMode || !SND) return; try { SND.loop(kind); } catch (e) {} }
  function loopStopSnd() { if (touchMode || !SND) return; try { SND.loopStop(); } catch (e) {} }
  function moveSnd(kind) { if (touchMode || !SND || !SND.motion) return; try { SND.motion(kind); } catch (e) {} }
  function tickSnd(kind) { if (touchMode || !SND) return; try { SND.tick(kind); } catch (e) {} }

/* Chaque case de la palette a ses propres ressorts : la case entière saute,
     s'affaisse ou tremble. L'humeur de la salle (Satire.on) décide du reste :
     les cases ricanent, sursautent, font la ola ou somnolent. */
  const cellSprings = {};       // outil → { y, x }
  const cellQueue = [];         // coups différés : { at, tool, vy, vx }
  let bounceFrame = null;
  let working = false;          // la case tremble doucement pendant le dessin
  let liveNext = 0;
  let workTime = 0;
  let suspense = false;         // long trait : le tremblement s'emballe
  let idleUntil = 0;            // la palette somnole (grillons)
  let hoverCell = null;
  const STROBE = { hit: false, beat: -1e9, next: 0, last: 0, gap: 280, quiet: 0, acc: 0 };
  function startAnim() { if (!bounceFrame) bounceFrame = requestAnimationFrame(stepToolBounce); }
  function cellSpring(t) {
    return cellSprings[t] || (cellSprings[t] = { y: MOT.spring(240, 9), x: MOT.spring(300, 12) });
  }
  /* Niveau 1 (I'm Too Young To Die) : l'application classique, immobile. */
  function classicOnly() { return typeof Satire !== "undefined" && Satire.difficulty && Satire.difficulty.classic(); }
  function kickCell(t, vy, vx, delay) {
    if (!MOT || touchMode || classicOnly()) return;
    if (delay) cellQueue.push({ at: performance.now() + delay, tool: t, vy: vy, vx: vx || 0 });
    else { const sp = cellSpring(t); MOT.kick(sp.y, vy); MOT.kick(sp.x, vx || 0); }
    startAnim();
  }
  /* Sélection : la case choisie bondit et bouscule ses voisines. */
  function kickToolBounce(t) {
    if (!MOT) return;
    kickCell(t, -150, 60);
    const me = CLASSIC.tools.find(c => c.tool === t);
    if (!me) return;
    for (const c of CLASSIC.tools) {
      if (c === me) continue;
      const dx = (cellPos[c.tool].tx - cellPos[t].tx) / 26, dy = (cellPos[c.tool].ty - cellPos[t].ty) / 22, d = Math.hypot(dx, dy);
      if (d <= 2.3) kickCell(c.tool, dy / d * 55 / d, dx / d * 55 / d, d * 45);
    }
  }
  function paletteWave(power, stagger) {
    moveSnd("wave");
    CLASSIC.tools.forEach((c, i) => kickCell(c.tool, -power, 0, 1 + Math.floor(i / 2) * stagger + (i % 2) * stagger / 2));
  }
  function paletteSnicker(times) {
    moveSnd("snicker");
    for (let k = 0; k < times; k++)
      CLASSIC.tools.forEach((c, i) => kickCell(c.tool, -36, (i % 2 ? 1 : -1) * 22, 1 + k * 110 + (i * 37) % 60));
  }
  function paletteFlinch() {
    moveSnd("flinch");
    for (const c of CLASSIC.tools) if (c.tool !== tool) kickCell(c.tool, 0, c.x < 30 ? -75 : 75, 1 + Math.random() * 90);
  }
  function randomCell() {
    const others = CLASSIC.tools.filter(c => c.tool !== tool);
    return others[Math.floor(Math.random() * others.length)].tool;
  }
  if (!touchMode && MOT && typeof Satire.on === "function") Satire.on(function (type, d) {
    switch (type) {
      case "select": idleUntil = 0; break;
      case "difficulty": if (Satire.difficulty.classic()) legoReset(); paletteWave(90, 30); break;   // sinon on garde l'interface en l'état : le nouveau niveau s'installe dessus
      case "mock": paletteSnicker(4); physAvalanche(4); break;
      case "combo": kickCell(tool, -50 - 8 * Math.min(d.n, 10), (d.n % 2 ? 1 : -1) * 40); break;
      case "surprise": physDrop(randomCell(), (Math.random() - 0.5) * 120, -230); break;
      case "suspense": suspense = true; startAnim(); break;
      case "idle": if (!classicOnly()) { idleUntil = performance.now() + 14000; startAnim(); } break;
      case "bored": idleUntil = 0; kickCell(randomCell(), -170, 0); break;
      case "cheer":
        idleUntil = 0;
        if (d.action === "new") legoReset();
        else if (d.action === "draw" || d.action === "fill" || d.action === "erase" || d.action === "text" || d.action === "dot" || d.action === "ovation") legoProgress();
        if (d.action === "undo") { kickCell(tool, 130, 0); moveSnd("droop"); if (d.streak === 3) physDrop(tool, 30, -60); if (d.streak >= 2) paletteSnicker(1); }
        else if (d.action === "redo") kickCell(tool, -110, 0);
        else if (d.action === "erase") paletteFlinch();
        else if (d.action === "ovation") { paletteWave(170, 35); physAvalanche(20); }
        else if (d.action === "new" || d.action === "save") paletteWave(110, 45);
        else if (d.action === "dot") kickCell(tool, -60, 0);
        else if (d.action === "draw" || d.action === "fill" || d.action === "text") {
          kickCell(tool, -70 - 90 * d.energy, 0);
          if (d.category === "hysteria") paletteWave(70, 30);
          else if (d.category === "laugh") paletteSnicker(1);
        }
        break;
    }
  });
  function stepToolBounce() {
    bounceFrame = null;
    const t = performance.now();
    let busy = false;
    for (let i = cellQueue.length - 1; i >= 0; i--) {
      if (cellQueue[i].at > t) continue;
      const q = cellQueue.splice(i, 1)[0], sp = cellSpring(q.tool);
      MOT.kick(sp.y, q.vy); MOT.kick(sp.x, q.vx);
    }
    /* Animation fluide, à la cadence de l'écran. La simulation avance de 60 pas par seconde
       quel que soit l'écran : un pas par image à 60 Hz, un pas une image sur deux à 120 Hz
       (sinon tout irait deux fois plus vite), rattrapage si une image a été sautée. */
    if (t - STROBE.last > 100) STROBE.acc = 1; else STROBE.acc += (t - STROBE.last) * 0.06;
    STROBE.last = t;
    const turns = Math.min(4, Math.floor(STROBE.acc + 0.001));
    STROBE.acc -= turns;
    if (frenzyWas) busy = true;
    for (let n = 0; n < turns; n++) {
      for (const k in cellSprings) {
        const sp = cellSprings[k];
        MOT.stepSpring(sp.y, 1 / 60); MOT.stepSpring(sp.x, 1 / 60);
        if (!sp.y.done || !sp.x.done) busy = true;
      }
      if (legoStep(t)) busy = true;
      if (MOT && physStep(t)) busy = true;
      if (MOT && frenzyStep(t)) busy = true;
    }
    if (working) workTime += 1 / 60; else suspense = false;
    /* Ultra-Violence et au-delà : l'interface ne s'arrête pas pendant qu'on dessine. Tant que le
       trait dure, des cases de la palette continuent de bondir et les blocs de tressaillir. */
    /* … ni quand une fenêtre, un piège ou une publicité est ouvert : à ces niveaux rien ne
       s'arrête jamais, l'interface bouge en permanence dès le premier clic. */
    /* Dès « Hey, Not Too Rough », l'animation des cases ne s'arrête plus non plus, même sans
       rien faire : elle est seulement plus calme. Niveau 2 : les cases bondissent doucement,
       les blocs restent en place. Hurt Me Plenty : plus vif, et les blocs tressaillent un peu.
       Seul le niveau 1 (le logiciel classique) reste immobile. */
    const liveLevel = MOT && !touchMode && Satire.difficulty.started() ? Satire.difficulty.get() : 0;
    const restless = liveLevel >= 1;
    if (restless) busy = true;
    if (restless && t > liveNext) {
      const calm = liveLevel === 1, mild = liveLevel === 2;
      liveNext = t + (calm ? 500 + Math.random() * 700 : mild ? 260 + Math.random() * 380 : 140 + Math.random() * 240);
      kickCell(randomCell(), (calm ? -22 - Math.random() * 30 : mild ? -30 - Math.random() * 45 : -35 - Math.random() * 60), (Math.random() - 0.5) * (calm ? 30 : mild ? 55 : 80));
      const shake = calm ? 0 : mild ? 0.15 : 0.35, force = mild ? 0.4 : 1;
      if (Math.random() < shake) { const b = LEGO[1 + Math.floor(Math.random() * 3)]; MOT.kick(b.sy, (Math.random() - 0.5) * 120 * force); MOT.kick(b.sx, (Math.random() - 0.5) * 80 * force); b.sx.done = b.sy.done = false; }
    }
    if (turns > 0 || working) render();
    if (working || busy || cellQueue.length || t < idleUntil) bounceFrame = requestAnimationFrame(stepToolBounce);
  }

  /* ------------------------------------------------------------------ *
   *  Interface « Lego ». L'écran est découpé en blocs (menus, palette,
   *  épaisseurs, trames, fenêtre). Le moteur continue de tout dessiner à
   *  sa place d'origine ; legoCompose() recopie ensuite chaque bloc là où
   *  il se trouve aujourd'hui, et legoMap() ramène chaque clic dans le
   *  repère d'origine du bloc touché. Plus on travaille, plus l'interface
   *  prend ses aises : les cases s'échangent, les blocs déménagent.
   * ------------------------------------------------------------------ */
  const LEGO = [
    { id: "window",   x: 76, y: 24,  w: 426, h: 270 },
    { id: "patterns", x: 76, y: 296, w: 430, h: 42 },
    { id: "tools",    x: 12, y: 24,  w: 58,  h: 226 },
    { id: "lines",    x: 2,  y: 252, w: 68,  h: 86 },
    { id: "menubar",  x: 0,  y: 0,   w: 512, h: 19 }      // dessiné en dernier : au-dessus
  ];
  const LEGO_LAYOUTS = [
    {},                                                                                   // 0 : comme en 1984
    { tools: [430, 0], lines: [442, 0], window: [-70, 0], patterns: [-70, 0] },           // 1 : palette à droite
    { patterns: [0, -274], window: [0, 44] },                                             // 2 : trames en haut
    { tools: [430, 0], lines: [442, 0], window: [-70, 44], patterns: [-70, -274] },       // 3 : les deux
    { menubar: [0, 323], tools: [0, -20], lines: [0, -20], window: [0, -20], patterns: [0, -20] },        // 4 : menus en bas
    { menubar: [0, 323], tools: [430, -20], lines: [442, -20], window: [-70, -20], patterns: [-70, -20] },// 5
    { menubar: [0, 323], patterns: [0, -294], window: [0, 22], tools: [0, -20], lines: [0, -20] }         // 6
  ];
  let mischief = 0, legoLevel = 0, legoLayout = 0, legoGrab = null, legoMoved = false;
  let legoScene = null, legoTmp = null, legoMenu = null;
  const cellPos = {};                        // outil → place actuelle de sa case
  for (const b of LEGO) { b.ox = 0; b.oy = 0; b.sx = MOT ? MOT.spring(70, 12) : null; b.sy = MOT ? MOT.spring(70, 12) : null; }
  /* La zone de travail (bloc « window ») peut aussi tourner et changer d'échelle
     autour de son centre : en Ultra-Violence elle pivote lentement vers un nouvel
     angle toutes les quelques secondes ; en Nightmare! angle et échelle changent
     brutalement plusieurs fois par seconde. Les clics sont ramenés dans le repère
     de la feuille par la transformation inverse (legoWindowPoint). */
  const WORK = LEGO[0];
  WORK.rot = 0; WORK.sc = 1; WORK.nextTurn = 0; WORK.hit = false; WORK.pulse = 1; WORK.lastBeat = -1e9; WORK.jx = 0; WORK.jy = 0;
  WORK.rs = MOT ? MOT.spring(30, 8) : null; WORK.ss = MOT ? MOT.spring(30, 8) : null;
  if (WORK.ss) { WORK.ss.x = 1; WORK.ss.target = 1; }
  const HEAD = { drag: null, x: 0, y: 0 };
  function headingFollow(e) {
    if (touchMode || !MOT || typeof Satire === "undefined" || Satire.difficulty.get() !== 2 || !Satire.difficulty.started()) return;
    if (HEAD.drag !== drag) { HEAD.drag = drag; HEAD.x = e.clientX; HEAD.y = e.clientY; HEAD.vx = HEAD.vy = 0; return; }
    /* Direction lissée : chaque petit déplacement de la souris tire un peu sur une direction
       moyenne, au lieu de la remplacer. La cible tourne donc en continu, sans à-coups. */
    const dx = e.clientX - HEAD.x, dy = e.clientY - HEAD.y;
    HEAD.x = e.clientX; HEAD.y = e.clientY;
    HEAD.vx = (HEAD.vx || 0) * 0.9 + dx * 0.1; HEAD.vy = (HEAD.vy || 0) * 0.9 + dy * 0.1;
    if (HEAD.vx * HEAD.vx + HEAD.vy * HEAD.vy < 0.5) return;     // presque immobile : pas de direction
    let d = Math.atan2(HEAD.vy, HEAD.vx) - WORK.rs.target;       // par le plus court chemin, sans jamais rembobiner
    d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
    d *= 0.25;                                                   // la cible elle-même ne fait qu'un quart du chemin
    WORK.rs.target += d; WORK.rs.done = false; WORK.followed = true;
    startAnim();
  }
  function workStep(t) {
    const level = (touchMode || !MOT || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) || !Satire.difficulty.started() ? 0 : Satire.difficulty.get();
    const wild = level === 4, turning = level >= 3;          // fenêtre ouverte ou non : ça tourne
    /* Nightmare! : les déplacements se font petit à petit (une à deux secondes), par poses
       successives sur les frappes de la musique, jamais d'un seul coup. */
    WORK.rs.stiffness = WORK.ss.stiffness = wild ? 70 : 30;
    WORK.rs.damping = WORK.ss.damping = wild ? 12 : 8;
    if (!wild) WORK.jxT = WORK.jyT = 0;
    WORK.jx += ((WORK.jxT || 0) - WORK.jx) * 0.09; WORK.jy += ((WORK.jyT || 0) - WORK.jy) * 0.09;
    /* Hurt Me Plenty : la feuille tourne vers la direction du trait (headingFollow), avec un
       ressort mou : elle suit le dessin, toujours un peu en retard sur lui. */
    const follow = level === 2 && !dialog;
    if (follow) { WORK.rs.stiffness = 7; WORK.rs.damping = 5.4; WORK.ss.target = 1; }   // amorti critique : aucun rebond, aucune secousse
    else if (WORK.followed) { WORK.followed = false; WORK.rs.target = 0; }
    if (follow) { /* cible posée par headingFollow */ }
    else if (!turning) { WORK.rs.target = 0; WORK.ss.target = 1; }
    else if (t > WORK.nextTurn) {
      WORK.hit = false;                                         // en musique : un saut par temps, pas au hasard
      /* Nightmare! : nouvel angle, nouvelle échelle et saut de position quatre à huit
         fois par seconde ; une fois sur cinq, la feuille se retrouve la tête en bas. */
      WORK.nextTurn = t + (wild ? 550 + Math.random() * 500 : 3500 + Math.random() * 2500);
      const R = Satire.difficulty.ramp();                         // montée progressive après un changement de niveau
      WORK.rs.target = ((Math.random() - 0.5) * (wild ? 2.5 : 0.5) + (wild && R >= 1 && Math.random() < 0.2 ? Math.PI : 0)) * R;   // ± 70° ou ± 14°
      WORK.ss.target = wild ? 1 + (Math.random() * 0.6 - 0.3) * R : 1;
      WORK.jxT = wild ? Math.round((Math.random() - 0.5) * 90 * R) : 0; WORK.jyT = wild ? Math.round((Math.random() - 0.5) * 60 * R) : 0;
      if (wild) moveSnd("swap"); else moveSnd("move");
    }
    MOT.stepSpring(WORK.rs, 1 / 60); MOT.stepSpring(WORK.ss, 1 / 60);
    /* Le tremblement suit la musique : une secousse sur chaque temps, qui retombe aussitôt.
       Sans musique (son coupé), elle tremble en continu comme avant. */
    WORK.pulse *= 0.9;                                           // la secousse d'une frappe retombe en douceur
    const shiver = wild ? WORK.pulse * 1.6 * Satire.difficulty.ramp() : 0;
    WORK.rot = Math.abs(WORK.rs.x) < 0.002 && !wild ? 0 : WORK.rs.x + shiver * (WORK.shR || 0) * 0.12;
    WORK.sc = Math.abs(WORK.ss.x - 1) < 0.004 && !wild ? 1 : Math.max(0.3, WORK.ss.x + shiver * (WORK.shS || 0) * 0.08);
    return level >= 3 || WORK.rot !== 0 || WORK.sc !== 1;
  }
  /* Point de l'écran → point de la scène, à travers la transformation d'un bloc
     (déplacement, rotation et échelle autour de son centre) ; et l'inverse. */
  function blockPoint(b, p) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = b.rot || 0, sc = b.sc || 1;
    const dx = p.x - cx - b.ox, dy = p.y - cy - b.oy, c = Math.cos(-r), n = Math.sin(-r);
    return { x: cx + (dx * c - dy * n) / sc, y: cy + (dx * n + dy * c) / sc };
  }
  function blockSpot(b, x, y) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = b.rot || 0, sc = b.sc || 1;
    const dx = (x - cx) * sc, dy = (y - cy) * sc, c = Math.cos(r), n = Math.sin(r);
    return { x: cx + b.ox + dx * c - dy * n, y: cy + b.oy + dx * n + dy * c };
  }
  function legoWindowPoint(p) { return blockPoint(WORK, p); }

  /* ------------------------------------------------------------------ *
   *  Nightmare! : apocalypse graphique. Les blocs (palette, épaisseurs,
   *  trames) tournent et changent de taille chacun de leur côté, et par
   *  moments la barre des trames vole en éclats : chacun des 38 carrés,
   *  plus l'échantillon courant, part ailleurs sur l'écran avec sa propre
   *  taille et son propre angle, puis tout se rassemble. Un carré envolé
   *  reste cliquable là où il se trouve.
   * ------------------------------------------------------------------ */
  const FRAGS = [];
  for (let i = 0; i < 38; i++) FRAGS.push({ x: 120 + (i % 19) * 20, y: 300 + Math.floor(i / 19) * 17, w: 19, h: 16 });
  FRAGS.push({ x: 85, y: 305, w: 28, h: 23 });
  for (const f of FRAGS) { f.parent = LEGO[1]; f.k = 0; f.kt = 0; f.next = 0; f.px = 0; f.py = 0; f.rot = 0; f.sc = 1; f.ax = 0; f.ay = 0; f.ar = 0; f.as = 1; f.tx = 0; f.ty = 0; f.tr = 0; f.ts = 1; }
  for (const b of LEGO) if (b !== WORK && b.id !== "menubar") {
    b.rot = 0; b.sc = 1; b.nextTurn = 0;
    b.rs = MOT ? MOT.spring(70, 12) : null; b.ss = MOT ? MOT.spring(70, 12) : null;
    if (b.ss) { b.ss.x = 1; b.ss.target = 1; }
  }
  let shatterNext = 0, shatterUntil = 0;
  function apocalypseStep(t) {
    const wild = frenzyWas;
    for (const b of LEGO) {
      if (b === WORK || b.id === "menubar") continue;
      if (!wild) { b.rs.target = 0; b.ss.target = 1; }
      else if (t > b.nextTurn) {
        b.nextTurn = t + 600 + Math.random() * 700;
        const still = Math.random() < 0.55;                      // une fois sur deux, un bloc reprend sa forme
        const R = Satire.difficulty.ramp();
        b.rs.target = still ? 0 : (Math.random() - 0.5) * 1.2 * R;
        b.ss.target = still ? 1 : 1 + (Math.random() * 0.95 - 0.45) * R;
      }
      MOT.stepSpring(b.rs, 1 / 60); MOT.stepSpring(b.ss, 1 / 60);
      b.rot = Math.abs(b.rs.x) < 0.003 ? 0 : b.rs.x;
      b.sc = Math.abs(b.ss.x - 1) < 0.005 ? 1 : Math.max(0.3, b.ss.x);
    }
    if (wild && t > shatterNext && Satire.difficulty.ramp() >= 1) {
      shatterNext = t + 7000 + Math.random() * 3000;               // en vol un quart du temps environ
      shatterUntil = t + 3000 + Math.random() * 1500;
      moveSnd("flinch");
    }
    const flying = wild && t < shatterUntil;
    let busy = false;
    for (const f of FRAGS) {
      const home = blockSpot(f.parent, f.x + f.w / 2, f.y + f.h / 2);
      if (flying) {
        if (t > f.next) {
          if (!f.k) { f.ax = home.x; f.ay = home.y; f.ar = f.parent.rot; f.as = f.parent.sc; }
          f.next = t + 700 + Math.random() * 800; f.kt = 1; f.hop = 1;
          f.tx = f.w + Math.random() * (SW - 2 * f.w); f.ty = 24 + Math.random() * (SH - 48);
          f.tr = (Math.random() - 0.5) * 5; f.ts = 0.7 + Math.random() * 1.3;
        }
      } else { f.kt = 0; f.next = 0; }
      f.k += (f.kt - f.k) * 0.1;
      if (!f.kt && f.k < 0.01) f.k = 0;
      if (!f.k) continue;
      busy = true;
      f.ax += (f.tx - f.ax) * 0.1; f.ay += (f.ty - f.ay) * 0.1; f.ar += (f.tr - f.ar) * 0.1; f.as += (f.ts - f.as) * 0.1;   // trajet en une demi-seconde environ
      f.hop = (f.hop || 0) * 0.93;                                 // chaque déplacement est un bond
      f.px = home.x + (f.ax - home.x) * f.k; f.py = home.y + (f.ay - home.y) * f.k - Math.sin(Math.PI * f.hop) * 46 * f.k;
      f.rot = f.parent.rot * (1 - f.k) + f.ar * f.k; f.sc = f.parent.sc * (1 - f.k) + f.as * f.k;
    }
    return busy || wild;
  }
  for (const c of CLASSIC.tools) cellPos[c.tool] = { x: c.x, y: c.y, tx: c.x, ty: c.y };
  function cellAt(p) {
    return CLASSIC.tools.find(c => { if (bodies[c.tool]) return false; const q = cellPos[c.tool]; return p.x >= q.x && p.x < q.x + 25 && p.y >= q.y && p.y < q.y + 21; });
  }
  function swapCells(a, b) {
    const list = CLASSIC.tools;
    a = a || list[Math.floor(Math.random() * list.length)].tool;
    while (!b || b === a) b = list[Math.floor(Math.random() * list.length)].tool;
    const A = cellPos[a], B = cellPos[b], tx = A.tx, ty = A.ty;
    A.tx = B.tx; A.ty = B.ty; B.tx = tx; B.ty = ty;
    moveSnd("swap");
    startAnim();
  }
  function legoSetLayout(i) {
    if (i !== legoLayout) moveSnd("move");
    legoLayout = i;
    const L = LEGO_LAYOUTS[i];
    for (const b of LEGO) { const o = L[b.id] || [0, 0]; b.sx.target = o[0]; b.sy.target = o[1]; b.sx.done = b.sy.done = false; }
    startAnim();
  }
  function legoRearrange() {
    const max = legoLevel >= 4 && !NATIVE ? LEGO_LAYOUTS.length : 4;       // les menus ne déménagent qu'au palier 4
    let i = legoLayout;
    while (i === legoLayout) i = Math.floor(Math.random() * max);
    legoSetLayout(i);
  }
  function legoReset() {
    mischief = 0; legoLevel = 0;
    physRecall();
    for (const c of CLASSIC.tools) { cellPos[c.tool].tx = c.x; cellPos[c.tool].ty = c.y; }
    legoSetLayout(0);
  }
  /* Appelé à chaque geste accompli. */
  function legoProgress() {
    if (!MOT || touchMode) return;
    mischief++;
    const level = Satire.difficulty.levelFor(mischief);     // paliers réglés par la difficulté choisie
    if (level !== legoLevel) {
      legoLevel = level;
      cheer("level");
      paletteWave(120, 30);
      if (level >= 3) legoRearrange(); else if (level === 2) { swapCells(); swapCells(); }
      physAvalanche(2 + 3 * level);
      return;
    }
    if (legoLevel >= 1 && mischief % 7 === 3) physAvalanche(1 + legoLevel);
    if (legoLevel >= 1) moveSnd("thump");
    if (legoLevel >= 1) for (const b of LEGO) if (b.id !== "window" && b.id !== "menubar") MOT.kick(b.sy, -40 - 10 * legoLevel);
    if (legoLevel >= 2 && mischief % (legoLevel >= 5 ? 3 : 6) === 0) swapCells();
    if (legoLevel >= 3 && mischief % (legoLevel >= 5 ? 5 : 10) === 0) legoRearrange();
    startAnim();
  }
  function legoStep(t) {
    if (!MOT) return false;
    if (!legoTight) legoTighten();
    let busy = legoLevel >= 5;
    if (workStep(t)) busy = true;
    if (!WINDOWS && apocalypseStep(t)) busy = true;                                  // dernier palier : tout tangue en permanence
    LEGO.forEach((b, i) => {
      MOT.stepSpring(b.sx, 1 / 60); MOT.stepSpring(b.sy, 1 / 60);
      if (!b.sx.done || !b.sy.done) busy = true;
      let x = b.sx.x, y = b.sy.x;
      if (legoLevel >= 5 && b.id !== "window") { x += Math.sin(t / 900 + i * 1.7) * 3; y += Math.cos(t / 1100 + i) * 2; }
      // Pas de deux pixels : la trame grise du bureau reste en phase.
      if (frenzyWas) { x += b.jx2 || 0; y += b.jy2 || 0; }       // secousse posée sur chaque frappe (pas de bruit image par image : ce serait du flou)
      if (b === WORK) { x += WORK.jx; y += WORK.jy; }
      if (NATIVE && b.id === "menubar") { x = 0; y = 0; }         // barre du Mac : hors de la fenêtre, immobile
      b.ox = Math.round(x / 2) * 2; b.oy = b.id === "menubar" ? Math.round(y) : Math.round(y / 2) * 2;
    });
    if (WINDOWS) {                                               // chaque bloc est une fenêtre : rien ne bouge dans l'écran simulé
      const out = NATIVE.blocks || (NATIVE.blocks = {});
      for (const b of LEGO) { out[b.id] = [b.ox, b.oy, b.rot || 0, b.sc === undefined ? 1 : b.sc]; b.ox = 0; b.oy = 0; }
      WORK.rot = 0; WORK.sc = 1;
    }
    for (const k in cellPos) {
      const q = cellPos[k];
      if (q.x === q.tx && q.y === q.ty) continue;
      const ease = frenzyWas ? 0.1 : 0.2;
      q.x += (q.tx - q.x) * ease; q.y += (q.ty - q.y) * ease;
      if (Math.abs(q.tx - q.x) < 0.6 && Math.abs(q.ty - q.y) < 0.6) { q.x = q.tx; q.y = q.ty; } else busy = true;
    }
    return busy;
  }
  function legoCompose() {
    legoMoved = LEGO.some(b => b.ox || b.oy || b.rot || (b.sc !== undefined && b.sc !== 1)) || FRAGS.some(f => f.k);
    if (!legoMoved) return;
    if (!legoScene) {
      legoScene = document.createElement("canvas"); legoScene.width = SW; legoScene.height = SH;
      legoTmp = document.createElement("canvas"); legoTmp.width = SW; legoTmp.height = SH;
    }
    legoScene.getContext("2d").drawImage(cv, 0, 0);
    fillDesk();
    ctx.imageSmoothingEnabled = false;
    for (const b of LEGO) {
      if (b.rot || (b.sc !== undefined && b.sc !== 1)) {
        ctx.save();
        ctx.translate(b.x + b.w / 2 + b.ox, b.y + b.h / 2 + b.oy);
        ctx.rotate(b.rot); ctx.scale(b.sc, b.sc);
        ctx.drawImage(legoScene, b.x, b.y, b.w, b.h, -b.w / 2, -b.h / 2, b.w, b.h);
        ctx.fillStyle = "#fff";                                  // la place vide des carrés envolés
        for (const f of FRAGS) if (f.k && f.parent === b) ctx.fillRect(f.x - b.x - b.w / 2, f.y - b.y - b.h / 2, f.w, f.h);
        ctx.restore();
      } else {
        ctx.drawImage(legoScene, b.x, b.y, b.w, b.h, b.x + b.ox, b.y + b.oy, b.w, b.h);
        ctx.fillStyle = "#fff";
        for (const f of FRAGS) if (f.k && f.parent === b) ctx.fillRect(f.x + b.ox, f.y + b.oy, f.w, f.h);
      }
    }
    for (const f of FRAGS) {                                      // les carrés envolés, par-dessus tout
      if (!f.k) continue;
      ctx.save();
      ctx.translate(f.px, f.py); ctx.rotate(f.rot); ctx.scale(f.sc, f.sc);
      ctx.fillStyle = "#000"; ctx.fillRect(-f.w / 2 - 1, -f.h / 2 - 1, f.w + 2, f.h + 2);
      ctx.drawImage(legoScene, f.x, f.y, f.w, f.h, -f.w / 2, -f.h / 2, f.w, f.h);
      ctx.restore();
    }
    ctx.fillStyle = "#000";
  }
  function legoDrop() {                                          // menu déroulant : suit la barre, s'ouvre vers le haut au besoin
    const L = menuLayout(menuOpen), bar = LEGO[4];
    let x = L.x; if (x + L.w > SW) x = SW - L.w;
    const r = { x: Math.max(0, x - 1), y: MENUBAR, w: L.w + 6, h: Math.min(SH - MENUBAR, L.h + 8) };
    r.dx = bar.ox; r.dy = r.y + bar.oy + r.h > SH ? bar.oy - r.h - MENUBAR : bar.oy;
    return r;
  }
  function legoDrawMenu() {
    if (!legoMoved) { drawMenu(); return; }
    const t = legoTmp.getContext("2d");
    t.drawImage(cv, 0, 0);                                       // écran composé, mis de côté
    ctx.drawImage(legoScene, 0, 0);                              // le menu se dessine dans le repère d'origine
    drawMenu();
    if (!legoMenu) { legoMenu = document.createElement("canvas"); legoMenu.width = SW; legoMenu.height = SH; }
    const r = legoDrop(), m = legoMenu.getContext("2d");
    m.drawImage(cv, 0, 0);
    ctx.drawImage(legoTmp, 0, 0);
    ctx.drawImage(legoMenu, r.x, r.y, r.w, r.h, r.x + r.dx, r.y + r.dy, r.w, r.h);
  }

  /* ------------------------------------------------------------------ *
   *  Rendu net des blocs tournés. L'écran simulé ne fait que 512 × 342
   *  points : y faire tourner une fenêtre de quelques degrés casse ses
   *  lignes en escaliers et effiloche ses bords. Dès qu'un bloc tourne,
   *  change de taille ou qu'une case vole, la composition est donc refaite
   *  sur un second canevas, posé exactement sur l'écran mais à la
   *  définition réelle de l'appareil : chaque point du Mac y est un carré
   *  net, quelle que soit sa rotation. Les menus et dialogues, eux, restent
   *  droits et sont recopiés tels quels. Les clics vont toujours à l'écran.
   * ------------------------------------------------------------------ */
  let legoHi = null, legoHiDesk = null;
  function legoSharp() {
    const need = !touchMode && (LEGO.some(b => b.rot || (b.sc !== undefined && b.sc !== 1)) || FRAGS.some(f => f.k) || Object.keys(bodies).length > 0);
    if (!need) { if (legoHi && legoHi.style.display !== "none") legoHi.style.display = "none"; return; }
    if (!legoHi) {
      legoHi = document.createElement("canvas");
      legoHi.setAttribute("aria-hidden", "true");
      cv.parentNode.insertBefore(legoHi, cv.nextSibling);
    }
    const dpr = window.devicePixelRatio || 1, W = Math.max(SW, Math.round(cv.clientWidth * dpr)), H = Math.round(W * SH / SW);
    if (legoHi.width !== W || legoHi.height !== H) { legoHi.width = W; legoHi.height = H; legoHiDesk = null; }
    legoHi.style.cssText = "position:absolute;pointer-events:none;display:block;left:" + cv.style.left + ";top:" + cv.style.top +
      ";width:" + cv.style.width + ";height:" + cv.style.height + ";transform:" + (cv.style.transform || "none");
    const g = legoHi.getContext("2d"), K = W / SW;
    g.setTransform(K, 0, 0, K, 0, 0);
    g.imageSmoothingEnabled = false;
    if (!legoMoved) g.drawImage(cv, 0, 0);                       // rien n'a bougé : seules des cases volent par-dessus
    else {
      if (!legoHiDesk) {
        const c = document.createElement("canvas"); c.width = 2; c.height = 2;
        const x = c.getContext("2d");
        x.fillStyle = "#fff"; x.fillRect(0, 0, 2, 2); x.fillStyle = "#000"; x.fillRect(0, 0, 1, 1); x.fillRect(1, 1, 1, 1);
        legoHiDesk = g.createPattern(c, "repeat");
      }
      g.fillStyle = legoHiDesk; g.fillRect(0, 0, SW, SH);
      for (const b of LEGO) {
        g.save();
        g.translate(b.x + b.w / 2 + b.ox, b.y + b.h / 2 + b.oy);
        if (b.rot) g.rotate(b.rot);
        if (b.sc !== undefined && b.sc !== 1) g.scale(b.sc, b.sc);
        g.drawImage(legoScene, b.x, b.y, b.w, b.h, -b.w / 2, -b.h / 2, b.w, b.h);
        g.fillStyle = "#fff";
        for (const f of FRAGS) if (f.k && f.parent === b) g.fillRect(f.x - b.x - b.w / 2, f.y - b.y - b.h / 2, f.w, f.h);
        g.restore();
      }
      for (const f of FRAGS) {
        if (!f.k) continue;
        g.save();
        g.translate(f.px, f.py); g.rotate(f.rot); g.scale(f.sc, f.sc);
        g.fillStyle = "#000"; g.fillRect(-f.w / 2 - 1, -f.h / 2 - 1, f.w + 2, f.h + 2);
        g.drawImage(legoScene, f.x, f.y, f.w, f.h, -f.w / 2, -f.h / 2, f.w, f.h);
        g.restore();
      }
    }
    drawBodies(g);
    if (menuOpen >= 0) {                                           // menu déroulant : recopié droit depuis l'écran
      const bar = LEGO[4], r = legoMoved ? legoDrop() : null;
      g.drawImage(cv, bar.x + bar.ox, bar.y + bar.oy, bar.w, bar.h, bar.x + bar.ox, bar.y + bar.oy, bar.w, bar.h);
      if (r) g.drawImage(cv, r.x + r.dx, r.y + r.dy, r.w, r.h, r.x + r.dx, r.y + r.dy, r.w, r.h);
      else { const L = menuLayout(menuOpen); g.drawImage(cv, 0, MENUBAR, SW, Math.min(SH - MENUBAR, L.h + 8), 0, MENUBAR, SW, Math.min(SH - MENUBAR, L.h + 8)); }
    }
    if (dialog && dialog._rect) { const r = dialog._rect; g.drawImage(cv, r.x - 2, r.y - 2, r.w + 8, r.h + 8, r.x - 2, r.y - 2, r.w + 8, r.h + 8); }
  }
  /* Les blocs sont rognés au plus près de leur objet : sans cela chacun emportait
     une marge de trame grise du bureau, qui tournait avec lui et jurait avec le fond. */
  let legoTight = false;
  function legoTighten() {
    legoTight = true;
    const data = chromeCtx.getImageData(0, 0, SW, SH).data;
    const dark = (x, y) => data[(y * SW + x) * 4] < 128;
    const desk = (x, y, w, h) => {                                // segment entièrement en damier
      const first = dark(x, y);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (dark(x + i, y + j) !== (((i + j) & 1) ? !first : first)) return false;
      return w * h > 1;
    };
    for (const b of LEGO) {
      if (b.id === "menubar") continue;
      while (b.h > 8 && desk(b.x, b.y, b.w, 1)) { b.y++; b.h--; }
      while (b.h > 8 && desk(b.x, b.y + b.h - 1, b.w, 1)) b.h--;
      while (b.w > 8 && desk(b.x, b.y, 1, b.h)) { b.x++; b.w--; }
      while (b.w > 8 && desk(b.x + b.w - 1, b.y, 1, b.h)) b.w--;
    }
  }
  /* Point de l'écran → point dans le repère d'origine du bloc touché. */
  function legoMap(p, down) {
    if (!legoMoved || dialog) return p;
    const inside = (b, ox, oy) => p.x >= b.x + ox && p.x < b.x + ox + b.w && p.y >= b.y + oy && p.y < b.y + oy + b.h;
    const within = (r, q) => q.x >= r.x && q.x < r.x + r.w && q.y >= r.y && q.y < r.y + r.h;
    if (menuOpen >= 0) {
      const bar = LEGO[4];
      if (inside(bar, bar.ox, bar.oy)) return { x: p.x - bar.ox, y: p.y - bar.oy };
      const r = legoDrop();
      if (inside(r, r.dx, r.dy)) return { x: p.x - r.dx, y: p.y - r.dy };
    }
    let b = !down && drag ? legoGrab : null;
    if (!b) {
      for (let i = FRAGS.length - 1; i >= 0; i--) {              // un carré envolé se clique là où il est
        const f = FRAGS[i];
        if (!f.k) continue;
        const dx = p.x - f.px, dy = p.y - f.py, c = Math.cos(-f.rot), n = Math.sin(-f.rot);
        const q = { x: f.x + f.w / 2 + (dx * c - dy * n) / f.sc, y: f.y + f.h / 2 + (dx * n + dy * c) / f.sc };
        if (within(f, q)) { if (down) legoGrab = f.parent; return q; }
      }
      for (let i = LEGO.length - 1; i >= 0 && !b; i--) if (within(LEGO[i], blockPoint(LEGO[i], p))) b = LEGO[i];
    }
    if (down) legoGrab = b;
    return b ? blockPoint(b, p) : { x: 4, y: 150 };             // entre deux blocs : le bureau
  }

  /* ------------------------------------------------------------------ *
   *  Modèle physique. Une case peut se décrocher de la palette : elle
   *  devient un corps soumis à la gravité, qui tombe, rebondit sur le bas
   *  et les bords de l'écran, s'écrase à l'impact, heurte les autres
   *  cases, puis est rappelée à sa place par un ressort (avec dépassement).
   *  Les corps vivent dans le repère de l'écran, par-dessus les blocs, et
   *  restent cliquables là où ils se trouvent. Chaque choc a son bruit.
   * ------------------------------------------------------------------ */
  const bodies = {};                         // outil → corps libre
  const GRAVITY = 560, BOUNCE = 0.6;
  let rawPointer = { x: -99, y: -99 };
  function physHome(t) { const q = cellPos[t], b = LEGO[2]; return { x: q.tx + b.ox, y: q.ty + b.oy }; }
  function physDrop(t, vx, vy, stay) {
    if (!MOT || touchMode || bodies[t] || classicOnly() || WINDOWS) return;
    const q = cellPos[t], b = LEGO[2];
    bodies[t] = { x: q.x + b.ox, y: q.y + b.oy, vx: vx, vy: vy, a: 0, va: (Math.random() - 0.5) * 9, sq: 0, zoom: 1, zt: 1,
                  free: true, until: performance.now() + (stay || 2600) + Math.random() * 2400 };
    startAnim();
  }
  function physAvalanche(n) {
    if (WINDOWS) return;                                         // une case ne quitte pas sa fenêtre
    const left = CLASSIC.tools.map(c => c.tool).filter(t => !bodies[t]);
    for (let i = 0; i < n && left.length; i++) {
      const t = left.splice(Math.floor(Math.random() * left.length), 1)[0];
      physDrop(t, (Math.random() - 0.3) * 150, -40 - Math.random() * 140);
    }
  }
  function physRecall() { for (const t in bodies) bodies[t].until = 0; }
  function bodyAt(p) {
    // La case grandit depuis son bord bas : la zone cliquable suit sa taille.
    for (const t in bodies) {
      const b = bodies[t], z = b.zoom || 1, cx = b.x + 12.5, bottom = b.y + 21;
      if (Math.abs(p.x - cx) <= 13.5 * z && p.y <= bottom + 2 && p.y >= bottom - 23 * z) return t;
    }
    return null;
  }
  function physStep(now) {
    const dt = 1 / 60, list = Object.keys(bodies);
    for (const t of list) {
      const b = bodies[t];
      b.sq *= 0.8;
      b.zoom += (b.zt - b.zoom) * 0.2;
      if (frenzyWas && now < frenzyAir) {
        /* Nightmare!, pendant une rafale : dès qu'elle touche le sol la case rebondit
           ailleurs, avec une nouvelle taille ; à la fin de la rafale elle rentre. */
        b.free = true; b.until = frenzyAir;
        if (b.y >= SH - 23 && Math.abs(b.vy) < 60 && Math.random() < 0.09) {
          b.vy = -(240 + Math.random() * 330); b.vx = (Math.random() - 0.5) * 520; b.va = (Math.random() - 0.5) * 14;
          b.zt = 0.8 + Math.random() * 0.9;
          moveSnd("bounce", 0.35);
        }
        if (b.y < 22 && b.vy < 0) b.vy = -b.vy * 0.6;                 // plafond : sous la barre de menus
      } else b.zt = 1;
      if (b.free && now > b.until) { b.free = false; moveSnd("spring"); }
      if (b.free) {
        b.vy += GRAVITY * dt;
        if (legoLevel >= 4) {                                    // palier 4 : les cases fuient le pointeur
          const dx = b.x + 12 - rawPointer.x, dy = b.y + 10 - rawPointer.y, d = Math.hypot(dx, dy);
          if (d < 34 && d > 0.5) { b.vx += dx / d * 26; b.vy += dy / d * 26 - 8; }
        }
        b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt;
        const floor = SH - 22;
        if (b.y > floor) {
          b.y = floor;
          if (b.vy > 55) { moveSnd("bounce", b.vy / 420); b.sq = Math.min(0.4, b.vy / 700); b.vy = -b.vy * BOUNCE; b.va = -b.va * 0.5 + b.vx * 0.03; }
          else { b.vy = 0; b.va = 0; b.a *= 0.7; }
          b.vx *= 0.82;
        }
        if (b.x < 1) { b.x = 1; if (b.vx < -40) moveSnd("bounce", -b.vx / 420); b.vx = -b.vx * BOUNCE; }
        if (b.x > SW - 26) { b.x = SW - 26; if (b.vx > 40) moveSnd("bounce", b.vx / 420); b.vx = -b.vx * BOUNCE; }
      } else {
        // Ressort de rappel, peu amorti : la case dépasse sa place et oscille.
        const h = physHome(t);
        b.vx += ((h.x - b.x) * 95 - b.vx * 6.5) * dt; b.vy += ((h.y - b.y) * 95 - b.vy * 6.5) * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.a *= 0.86;
        if (Math.abs(h.x - b.x) < 0.6 && Math.abs(h.y - b.y) < 0.6 && Math.hypot(b.vx, b.vy) < 9) {
          delete bodies[t]; moveSnd("bounce", 0.25); kickCell(t, -40, 0);
        }
      }
    }
    // Chocs entre cases libres : deux disques qui se repoussent.
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = bodies[list[i]], B = bodies[list[j]];
      if (!A || !B || !A.free || !B.free) continue;
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
      if (d >= 23 || d < 0.01) continue;
      const nx = dx / d, ny = dy / d, push = (23 - d) / 2;
      A.x -= nx * push; A.y -= ny * push; B.x += nx * push; B.y += ny * push;
      const rel = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
      if (rel < 0) {
        const imp = -(1 + 0.5) * rel / 2;
        A.vx -= imp * nx; A.vy -= imp * ny; B.vx += imp * nx; B.vy += imp * ny;
        if (rel < -70) moveSnd("bounce", -rel / 500);
      }
    }
    return Object.keys(bodies).length > 0;
  }
  function drawBodies(g) {
    g = g || ctx;
    for (const t in bodies) {
      const b = bodies[t], cell = CLASSIC.tools.find(c => c.tool === t), selected = t === tool;
      g.save();
      g.translate(Math.round(b.x) + 12.5, Math.round(b.y) + 21);          // pivot : le bas de la case
      g.scale((1 + b.sq * 0.6) * (b.zoom || 1), (1 - b.sq) * (b.zoom || 1));   // écrasement à l'impact, et taille propre
      g.translate(0, -10.5);
      if (Math.abs(b.a) > 0.02) g.rotate(b.a);
      g.translate(-12.5, -10.5);
      g.fillStyle = "#000"; g.fillRect(-1, -1, 27, 23);
      g.fillStyle = selected ? "#000" : "#fff"; g.fillRect(0, 0, 25, 21);
      g.fillStyle = selected ? ACCENT : "#000";
      for (let y = 0; y < 21; y++) for (let x = 0; x < 25; x++) if (cell.rows[y][x] === "1") g.fillRect(x, y, 1, 1);
      g.restore();
    }
    g.fillStyle = "#000";
  }

  /* ------------------------------------------------------------------ *
   *  Nightmare! : frénésie. Tout vibre en permanence, la barre de menus
   *  change de hauteur deux fois par seconde, les blocs déménagent, les
   *  cases s'échangent et tombent sans attendre les paliers, et tout
   *  l'écran tressaute sur chaque coup de grosse caisse de la musique.
   *  La barre de menus s'arrête le temps qu'un menu est ouvert.
   * ------------------------------------------------------------------ */
  const calmMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function frenzy() { return !!MOT && !touchMode && !calmMotion && Satire.difficulty.frenzy(); }
  let frenzyBar = 0, frenzyMove = 0, frenzyDrop = 0, frenzyAir = 0, frenzyShake = 0, frenzyWas = false, frenzyMix = 0;
  const APP = { rot: 0, sc: 1, next: 0, x: null, y: null, r: null, s: null };
  if (MOT) { APP.x = MOT.spring(95, 13); APP.y = MOT.spring(95, 13); APP.r = MOT.spring(95, 13); APP.s = MOT.spring(95, 13); APP.s.x = APP.s.target = 1; }
  function appTarget(t) {
    const R = Satire.difficulty.ramp(), w = cv.offsetWidth || 512, h = cv.offsetHeight || 342;
    APP.next = t + 450;
    APP.x.target = (Math.random() - 0.5) * 0.36 * w * R; APP.y.target = (Math.random() - 0.5) * 0.3 * h * R;
    APP.r.target = ((Math.random() - 0.5) * (Math.random() < 0.2 ? 1.5 : 0.6)) * R;      // ± 17°, parfois ± 43°
    APP.s.target = 1 + (Math.random() * 0.6 - 0.42) * R;                                  // de 0,58 à 1,18
    for (const k of ["x", "y", "r", "s"]) APP[k].done = false;
  }
  function cutShuffle() {                                        // nouvel ordre complet, sans glissement
    const cells = CLASSIC.tools.map(c => cellPos[c.tool]).filter(Boolean), spots = cells.map(q => [q.tx, q.ty]);
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), v = spots[i]; spots[i] = spots[j]; spots[j] = v; }
    cells.forEach((q, i) => { q.tx = q.x = spots[i][0]; q.ty = q.y = spots[i][1]; });
    for (let i = PAT_SLOT.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), v = PAT_SLOT[i]; PAT_SLOT[i] = PAT_SLOT[j]; PAT_SLOT[j] = v; }
    patMixed = true;
  }
  function frenzyStep(t) {
    const on = frenzy();
    if (on !== frenzyWas) {
      frenzyWas = on;
      document.body.style.overflow = on ? "hidden" : "";      // la fenêtre qui tourne déborde : pas de barres de défilement
      for (const b of LEGO) { b.sx.stiffness = b.sy.stiffness = on ? 80 : 70; b.sx.damping = b.sy.damping = on ? 13 : 12; }
      if (!on && NATIVE) NATIVE.post("pose", null);
      if (!on) patShuffle(true);
      if (!on) { cv.style.transform = ""; APP.rot = 0; APP.sc = 1; for (const k of ["x", "y", "r"]) { APP[k].x = APP[k].v = APP[k].target = 0; } APP.s.x = APP.s.target = 1; APP.s.v = 0; }
    }
    if (!on) return false;
    if (menuOpen < 0 && t > frenzyBar && Satire.difficulty.ramp() > 0.5) {
      frenzyBar = t + 700 + Math.random() * 700;
      const bar = LEGO[4], spots = [0, 323, 46, 120, 200, 270];
      let y = bar.sy.target;
      while (y === bar.sy.target) y = spots[Math.floor(Math.random() * spots.length)];
      if (NATIVE) NATIVE.post("shuffle"); else { bar.sy.target = y; bar.sy.done = false; }
      moveSnd("hop");
    }
    /* Dans leurs fenêtres, outils et trames changent tous de case d'un coup, en « cut », sur les
       frappes de la musique (voir l'écouteur « beat ») ; sans musique, toutes les 300 ms. */
    if (WINDOWS && performance.now() - WORK.lastBeat > 700 && t > frenzyMix) { frenzyMix = t + 300; cutShuffle(); }
    if (t > frenzyMove && Satire.difficulty.ramp() > 0.75) {
      frenzyMove = t + 1500 + Math.random() * 1200;
      const barY = LEGO[4].sy.target;
      legoSetLayout(Math.floor(Math.random() * 4));
      LEGO[4].sy.target = barY;
      swapCells(); swapCells();
    }
    /* Les cases d'outils s'envolent par rafales de 2,5 à 4 s, puis rentrent : entre deux
       rafales (7 à 11 s), on voit la palette et le plan de travail. */
    if (t > frenzyDrop && Satire.difficulty.ramp() >= 1) { frenzyDrop = t + 7000 + Math.random() * 4000; frenzyAir = t + 2500 + Math.random() * 1500; physAvalanche(20); }
    frenzyShake *= 0.88;
    /* Toute la fenêtre du logiciel bouge dans la page noire : position, rotation et taille.
       Les cibles sont tirées sur les frappes de la musique (appTarget), les ressorts y vont
       vite mais sans à-coup ; sans musique, une nouvelle cible toutes les 450 ms. */
    if (performance.now() - WORK.lastBeat > 700 && t > APP.next) appTarget(t);
    for (const k of ["x", "y", "r", "s"]) MOT.stepSpring(APP[k], 1 / 60);
    APP.rot = APP.r.x; APP.sc = Math.max(0.35, APP.s.x);
    if (NATIVE && NATIVE.moveWindow) {                          // la vraie fenêtre du Mac prend la pose
      const w = cv.offsetWidth || 512, h = cv.offsetHeight || 342;
      cv.style.transform = "";
      NATIVE.post("pose", { x: (APP.x.x + (WORK.shR || 0) * frenzyShake) / w, y: (APP.y.x + (WORK.shS || 0) * frenzyShake) / h, r: APP.rot, s: APP.sc });
    } else
      cv.style.transform = "translate(" + (APP.x.x + (WORK.shR || 0) * frenzyShake).toFixed(1) + "px," + (APP.y.x + (WORK.shS || 0) * frenzyShake).toFixed(1) + "px) rotate(" + APP.rot.toFixed(4) + "rad) scale(" + APP.sc.toFixed(4) + ")";
    return true;
  }
  if (!touchMode && MOT && typeof Satire.on === "function") {
    Satire.on(function (type, d) {
      if (type === "beat" && frenzy()) {                         // la grosse caisse secoue tout
        frenzyShake = d.fill ? 16 : 10;
        WORK.hit = true; WORK.pulse = 1; WORK.lastBeat = performance.now();
        WORK.shR = Math.random() - 0.5; WORK.shS = Math.random() - 0.5;
        /* la fenêtre entière : nouvelle pose sur les frappes espacées, coup de zoom sur chacune */
        if ((d.gap || 0.3) >= 0.16 || Math.random() < 0.3) appTarget(performance.now());
        if (WINDOWS && (d.gap || 0.3) >= 0.16) cutShuffle();
        MOT.kick(APP.s, (Math.random() < 0.5 ? -1 : 1) * 1.6 * Satire.difficulty.ramp());
        for (const b of LEGO) { const k = (b.id === "window" ? 10 : 7) * Satire.difficulty.ramp(); b.jx2 = (Math.random() - 0.5) * k; b.jy2 = (Math.random() - 0.5) * k; }
        STROBE.hit = true; STROBE.beat = WORK.lastBeat; STROBE.gap = Math.max(60, (d.gap || 0.28) * 1000); STROBE.quiet = STROBE.beat + STROBE.gap + 400;   // pendant un silence de la boucle, tout se fige
        for (const c of CLASSIC.tools) kickCell(c.tool, -30 - Math.random() * 30, (Math.random() - 0.5) * 60);
      }
      if (frenzy() || Satire.difficulty.get() >= 1) startAnim();
    });
    setTimeout(function () { if (Satire.difficulty.get() >= 1) startAnim(); }, 900);
  }
  let newConfirmed = false;
  let pattern = 0;
  /* Le texte suit la trame, comme les formes : trame blanche → texte blanc,
     toute autre trame → texte noir. Plus de sélecteur d'encre séparé. */
  function inkWhite() { return PAT[pattern].every(function (v) { return !v; }); }
  let lineWidth = 0;                     // 0..3
  let noOutline = false;                // Independent of spray dispersion.
  const outlineWidth = () => noOutline ? 0 : [1,2,4,8][lineWidth];
  /* À partir du niveau 3 (Hurt Me Plenty), l'épaisseur du trait ne tient plus en
     place : elle saute au hasard entre 1, 2, 4 et 8, même au milieu d'un trait.
     De plus en plus vite : toutes les 0,9 à 1,8 s, puis 0,4 à 0,9 s en
     Ultra-Violence, puis 0,09 à 0,26 s en Nightmare!. Le pinceau, les contours
     des formes et la bombe suivent ; le crayon reste à un pixel. */
  let widthNext = 0;
  setInterval(function () {
    if (typeof Satire === "undefined" || !Satire.difficulty) return;
    const level = Satire.difficulty.get(), t = performance.now();
    if (level < 2 || document.hidden || t < widthNext) return;
    if (WINDOWS && !Satire.difficulty.started()) return;         // palette visible dans sa fenêtre : rien avant le premier clic
    const pace = level === 2 ? [900, 900] : level === 3 ? [400, 500] : [90, 170];
    widthNext = t + pace[0] + Math.random() * pace[1];
    let next = lineWidth;
    while (next === lineWidth) next = Math.floor(Math.random() * 4);
    lineWidth = next;
    if (level < 4 && Satire.audio && Satire.audio.motion) { try { Satire.audio.motion("hop"); } catch (e) {} }
    render();
  }, 60);
  let fontName = "Geneva";
  let fontSize = 12;
  let style = "plain";
  const styles = new Set();
  let gridOn = false;
  let fatBits = false;
  let brushShape = 3;
  let mirror = 0;                        // 0 aucun, 1 horizontal, 2 vertical, 3 les deux
  let sel = null;                        // {x,y,w,h,mask,data}
  let clipboard = null;
  const undoStack = [], redoStack = [];
  let menuOpen = -1, menuHover = -1, menuTrack = false;
  let documentOpen = true;
  let dialog = null;
  let dirty = true;
  let mouse = { x: 0, y: 0, in: false };

  /* ---------------------------------------------------------------- *
   *  3. Polices et texte 1 bit
   * ---------------------------------------------------------------- */
  const FONTS = Object.keys(CLASSIC.fonts).sort().map(name=>({name,css:name}));

  const SIZES = [9, 10, 12, 14, 18, 24, 36, 48, 72];

  const textCache = new Map();

  /* Original FONT strikes: integer bearings/advances, MacRoman, no vector rasterizer. */
  function textBmp(str, fam, size, bold, italic) {
    const key = [str,fam,size,!!bold,!!italic].join("\0");
    if (textCache.has(key)) return textCache.get(key);
    const family = CLASSIC.fonts[fam] || CLASSIC.fonts.Geneva;
    const sizes = Object.keys(family).map(Number);
    const base = sizes.includes(size) ? size : sizes.reduce((a,b)=>Math.abs(b-size)<Math.abs(a-size)?b:a);
    // Prefer an exact integer enlargement when possible (36=18x2,48=24x2,72=24x3).
    const div = sizes.filter(n=>size>=n && size%n===0).sort((a,b)=>b-a);
    const chosen = div.length ? div[0] : base;
    const f = family[chosen], scale = size/chosen;
    const chars = Array.from(str||"").map(ch=>f.glyphs[String(CLASSIC.charcodes[ch] === undefined ? 0xffff : CLASSIC.charcodes[ch])] || f.glyphs["65535"]);
    const advance = chars.reduce((a,g)=>a+(g?g.advance:0),0);
    const h0=f.height;
    let minX=0,maxX=Math.max(1,advance+4+(italic?Math.ceil(h0/4):0)),extentPen=1;
    for(const g of chars) {
      if(!g)continue;
      if(g.w) {
        minX=Math.min(minX,extentPen+g.offset+(italic?Math.floor((f.ascent-h0+1)/4):0));
        maxX=Math.max(maxX,extentPen+g.offset+g.w+(italic?Math.floor(f.ascent/4):0)+(bold?1:0));
      }
      extentPen+=g.advance;
    }
    const shift=-minX,w0=maxX+shift;
    const bits0=new Uint8Array(w0*h0);let pen=1+shift;
    for(const g of chars) {
      if(!g)continue;
      for(let y=0;y<h0;y++) for(let x=0;x<g.w;x++) if(g.rows[y][x]==="1") {
        const X=pen+g.offset+x+(italic?Math.floor((f.ascent-y)/4):0);
        if(X>=0&&X<w0) {bits0[y*w0+X]=1;if(bold&&X+1<w0)bits0[y*w0+X+1]=1;}
      }
      pen+=g.advance;
    }
    const w=Math.max(1,Math.round(w0*scale)),h=Math.max(1,Math.round(h0*scale));
    const bits=new Uint8Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)bits[y*w+x]=bits0[Math.min(h0-1,Math.floor(y/scale))*w0+Math.min(w0-1,Math.floor(x/scale))];
    const result={bits,w,h,pad:Math.round((1+shift)*scale),asc:Math.round(f.ascent*scale),adv:Math.round(advance*scale),lineHeight:Math.round((f.ascent+f.descent+f.leading)*scale)};
    textCache.set(key,result);return result;
  }

  /* Dessine un bitmap 1 bit, avec options (dither pour le grisé). */
  function blit(ctx2, bmp, x, y, opt) {
    const dither = opt && opt.dither;
    const bx = Math.round(x), by = Math.round(y);
    ctx2.fillStyle = "#000";
    for (let j = 0; j < bmp.h; j++) {
      const sy = by + j;
      if (sy < 0 || sy >= SH) continue;
      let run = -1;
      for (let i = 0; i <= bmp.w; i++) {
        const on = i < bmp.w && bmp.bits[j * bmp.w + i];
        if (on && run < 0) run = i;
        if ((!on || i === bmp.w) && run >= 0) {
          let a = bx + run, b = bx + i;
          run = -1;
          if (b <= 0 || a >= SW) continue;
          if (a < 0) a = 0;
          if (b > SW) b = SW;
          if (dither) {                       // texte grisé : une ligne sur deux
            if ((sy & 1) === 0) ctx2.fillRect(a, sy, b - a, 1);
          } else {
            ctx2.fillRect(a, sy, b - a, 1);
          }
        }
      }
    }
  }

  /* Texte à la ligne de base (y = baseline). */
  function drawText(str, x, y, fam, size, bold, italic, opt) {
    const b = textBmp(str, fam, size, bold, italic);
    blit(ctx, b, x + 1 - b.pad, y - b.asc, opt);
    return b.adv;
  }

  function textWidth(str, fam, size, bold, italic) {
    return textBmp(str, fam, size, bold, italic).adv;
  }

  /* ---------------------------------------------------------------- *
   *  4. Motifs 8 × 8
   * ---------------------------------------------------------------- */
  /* Trames 8 × 8 au format QuickDraw : 8 octets, ligne par ligne, bit de poids
     fort à gauche, 1 = encre. Valeurs des ressources PAT# et des constantes
     QuickDraw (white, ltGray, gray, dkGray, black). */
  const PAT_LIB = CLASSIC.patterns.map((hex,i)=>["Pattern "+(i+1),hex]);

  function hexToPat(hex) {
    const a = new Uint8Array(64);
    for (let y = 0; y < 8; y++) {
      const b = parseInt(hex.substr(y * 2, 2), 16);
      for (let x = 0; x < 8; x++) a[y * 8 + x] = (b >> (7 - x)) & 1;
    }
    return a;
  }

  const PAT = CLASSIC.patterns.map(hexToPat);
  /* Fenêtres séparées, Nightmare! : les trames changent de case. PAT_SLOT[case] = numéro de la
     trame montrée dans cette case ; sans mélange, chaque trame est dans sa case d'origine. */
  const PAT_SLOT = PAT.map((_, i) => i);
  let patMixed = false;
  function patShuffle(reset) {
    if (reset) { if (!patMixed) return; for (let i = 0; i < PAT_SLOT.length; i++) PAT_SLOT[i] = i; patMixed = false; return; }
    const a = Math.floor(Math.random() * PAT_SLOT.length); let b = a;
    while (b === a) b = Math.floor(Math.random() * PAT_SLOT.length);
    const v = PAT_SLOT[a]; PAT_SLOT[a] = PAT_SLOT[b]; PAT_SLOT[b] = v; patMixed = true;
  }
  const PAT_DEF = PAT.map(p=>p.slice());

  function pat(x, y) {
    return PAT[pattern][(y & 7) * 8 + (x & 7)];
  }

  /* ---------------------------------------------------------------- *
   *  5. Icônes de la palette (bitmaps 23 × 21, relevés sur MacPaint)
   * ---------------------------------------------------------------- */
  const ICON = {
    lasso: [
      "······#######···",
      "···###·······##·",
      "··#············#",
      "·#·············#",
      "#··············#",
      "#············##·",
      "#·········###···",
      "·###···###······",
      "##··###·········",
      "#·#·#···········",
      "·###············",
      "···#············",
      "···#············",
      "··#·············",
    ],
    marquee: [
      "####··#####··###",
      "#··············#",
      "#··············#",
      "················",
      "················",
      "#··············#",
      "#··············#",
      "#··············#",
      "················",
      "················",
      "#··············#",
      "#··············#",
      "###··#####··####",
    ],
    brush: [
      "·······##·······",
      "···##·#··###····",
      "··#··##··#··#···",
      "··#··##··#··#·#·",
      "···#··#··#··##·#",
      "···#··#··#··#··#",
      "·##·#·······#··#",
      "#··##··········#",
      "#···#·········#·",
      "·#············#·",
      "··#···········#·",
      "··#··········#··",
      "···#·········#··",
      "····#·······#···",
      "·····#······#···",
      "·····#······#···",
    ],
    pencil: [
      "·········#··········",
      "········###·········",
      "········###·········",
      "·······#####········",
      "·······#·###········",
      "······##··###·······",
      "······#···###·······",
      "·····##····###······",
      "·····#·····###······",
      "····##······###·····",
      "····###########·····",
      "···##········###····",
      "···##········###····",
      "··##··········###···",
      "·###··········####··",
      "#####·······########",
    ],
    spray: [
      "·····###········",
      "····#···#·······",
      "····#··##·······",
      "····#·#·##······",
      "····##··#·##····",
      "····#···#··###··",
      "···#····#···###·",
      "··#····#·#···###",
      "·#······#····###",
      "#···········####",
      "#··········#·###",
      "·#········#··###",
      "··#······#···###",
      "···#····#····###",
      "····#··#·····##·",
      "·····##······#··",
    ],
    bucket: [
      "#···········",
      "··#·········",
      "#···#·#·#···",
      "··#····###··",
      "#·····#···#·",
      "·····#######",
      "·····#·····#",
      "·····#··####",
      "·····#··#··#",
      "·····#··####",
      "·····#··#··#",
      "·····#··####",
      "·····#··####",
      "·····#·····#",
      "·····#·····#",
      "·····#######",
    ],
    eraser: [
      "·····###···",
      "·····#·#···",
      "·····###···",
      "·····###···",
      "·····###···",
      "·····###···",
      "·····###···",
      "··#########",
      "··#·······#",
      "··#########",
      "··#·······#",
      "··#·······#",
      "··#·······#",
      "··#·#·#·#·#",
      "·#·#·#·#·##",
      "##########·",
    ],
    text: [
      "·····####·",
      "·····#···#",
      "····#····#",
      "····##··#·",
      "···#··###·",
      "···#···#··",
      "··#····#··",
      "··#···#···",
      "·#····#···",
      "·#···#····",
      "#····#····",
      "#···#·····",
      "####······",
      "###·······",
      "##········",
      "#·········",
    ],
    line: [
      "##··············",
      "··##············",
      "····##··········",
      "······##········",
      "········##······",
      "··········##····",
      "············##··",
      "··············##",
    ],
    rrect: [
      "········#######·",
      "·······#······#·",
      "······#······###",
      "·····#······#·##",
      "····#······#·##·",
      "···#······#·##··",
      "··#······#·##···",
      "·#······#·##····",
      "########·##·····",
      "#······###······",
      "#······##·······",
      "########········",
    ],
    rect: [
      "################",
      "#··············#",
      "#··············#",
      "#··············#",
      "#··············#",
      "#··············#",
      "#··············#",
      "#··············#",
      "#··············#",
      "#··············#",
      "################",
    ],
    oval: [
      ".......................",
      ".......................",
      ".......................",
      ".......................",
      ".......................",
      "........########.......",
      "......###......###.....",
      ".....##..........##....",
      "....##............##...",
      "....#..............#...",
      "....#..............#...",
      "....#..............#...",
      "....##............##...",
      ".....##..........##....",
      "......###......###.....",
      "........########.......",
      ".......................",
      ".......................",
      ".......................",
      ".......................",
      "......................."
    ],
  };

  const APPLE = [
    "....##.....",
    "...###.....",
    "...##......",
    "..#######..",
    ".#########.",
    "###########",
    "###########",
    "###########",
    "##########.",
    ".########..",
    "..######..."
  ];

  const CHECK = [
    "......X",
    ".....XX",
    "X...XX.",
    "XX.XX..",
    ".XXX...",
    "..X....",
    "......."
  ];

  function drawBitmap(rows, x, y) {
    ctx.fillStyle = "#000";
    for (let j = 0; j < rows.length; j++)
      for (let i = 0; i < rows[j].length; i++)
        if (rows[j][i] === "X" || rows[j][i] === "#") ctx.fillRect(x + i, y + j, 1, 1);
  }

  /* ---------------------------------------------------------------- *
   *  6. Primitives de dessin
   * ---------------------------------------------------------------- */
  /* Une sélection bornée : MacPaint n'écrit jamais en dehors de la sélection
     active, ni pour le pinceau, ni pour le pot de peinture, ni pour les formes. */
  function inSel(x, y) {
    if (!sel) return true;
    if (x < sel.x || y < sel.y || x >= sel.x + sel.w || y >= sel.y + sel.h) return false;
    if (!sel.mask) return true;
    return !!sel.mask[(y - sel.y) * sel.w + (x - sel.x)];
  }

  function px(x, y, v) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= DW || y >= DH) return;
    if (sel && !inSel(x, y)) return;
    doc[y * DW + x] = v;
    if (mirror & 1) { const mx = DW - 1 - x; if (mx >= 0 && mx < DW) doc[y * DW + mx] = v; }
    if (mirror & 2) { const my = DH - 1 - y; if (my >= 0 && my < DH) doc[my * DW + x] = v; }
  }

  function stamp(x, y, size, v, usePat) {
    const o = Math.floor((size - 1) / 2);
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        const X = x - o + i, Y = y - o + j;
        px(X, Y, usePat ? pat(X, Y) : v);
      }
  }

  function line(x0, y0, x1, y1, size, v, usePat) {
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      stamp(x0, y0, size, v, usePat);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  function rectShape(x0, y0, x1, y1, w, fill) {
    if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
    if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const edge = x < x0 + w || x > x1 - w || y < y0 + w || y > y1 - w;
        if (edge) px(x, y, 1);
        else if (fill) px(x, y, pat(x, y));
      }
  }

  function rrectShape(x0, y0, x1, y1, w, fill) {
    if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
    if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
    const r = Math.min(8, Math.floor((x1 - x0) / 2), Math.floor((y1 - y0) / 2));
    const inside = function (x, y, inset) {
      const ax = x0 + inset, ay = y0 + inset, bx = x1 - inset, by = y1 - inset;
      if (x < ax || x > bx || y < ay || y > by) return false;
      const rr = Math.max(0, r - inset);
      if (rr === 0) return true;
      const cx = x < ax + rr ? ax + rr : (x > bx - rr ? bx - rr : x);
      const cy = y < ay + rr ? ay + rr : (y > by - rr ? by - rr : y);
      const dx = x - cx, dy = y - cy;
      return dx * dx + dy * dy <= rr * rr + rr;
    };
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!inside(x, y, 0)) continue;
        if (!inside(x, y, w)) px(x, y, 1);
        else if (fill) px(x, y, pat(x, y));
      }
  }

  function ovalShape(x0, y0, x1, y1, w, fill) {
    if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
    if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const rx = (x1 - x0) / 2 + 0.5, ry = (y1 - y0) / 2 + 0.5;
    if (rx <= 0 || ry <= 0) return;
    const inEll = function (x, y, inset) {
      const ax = rx - inset, ay = ry - inset;
      if (ax <= 0 || ay <= 0) return false;
      const u = (x + 0.5 - cx - 0.5) / ax, v = (y + 0.5 - cy - 0.5) / ay;
      return u * u + v * v <= 1;
    };
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!inEll(x, y, 0)) continue;
        if (!inEll(x, y, w)) px(x, y, 1);
        else if (fill) px(x, y, pat(x, y));
      }
  }

  function floodFill(x, y) {
    if (x < 0 || y < 0 || x >= DW || y >= DH) return;
    const target = doc[y * DW + x];
    const seen = new Uint8Array(DW * DH);
    const stack = [x, y];
    while (stack.length) {
      const cy = stack.pop(), cx = stack.pop();
      if (cx < 0 || cy < 0 || cx >= DW || cy >= DH) continue;
      const i = cy * DW + cx;
      if (seen[i] || doc[i] !== target) continue;
      if (sel && !inSel(cx, cy)) continue;
      seen[i] = 1;
      stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
    }
    for (let i = 0; i < seen.length; i++) if (seen[i]) doc[i] = target ? 1-pat(i % DW, (i / DW) | 0) : pat(i % DW, (i / DW) | 0);
  }

  const BRUSHES = [
    { w: 2, h: 2, bits: "11" + "11" },
    { w: 4, h: 4, bits: "1111".repeat(4) },
    { w: 8, h: 8, bits: "11111111".repeat(8) },
    { w: 3, h: 3, bits: "010" + "111" + "010" },
    { w: 5, h: 5, bits: "01110" + "11111" + "11111" + "11111" + "01110" },
    { w: 7, h: 7, bits: "0011100" + "0111110" + "1111111" + "1111111" + "1111111" + "0111110" + "0011100" },
    { w: 8, h: 1, bits: "11111111" },
    { w: 1, h: 8, bits: "11111111" }
  ];

  function brushAt(x, y) {
    /* L'épaisseur de trait choisie (1, 2, 4, 8) grossit aussi le pinceau :
       chaque point de la forme de brosse devient un carré de k × k pixels. */
    const b = BRUSHES[brushShape], k = [1, 2, 4, 8][lineWidth], w = b.w * k, h = b.h * k;
    const ox = Math.floor((w - 1) / 2), oy = Math.floor((h - 1) / 2);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++)
        if (b.bits[((j / k) | 0) * b.w + ((i / k) | 0)] === "1") px(x - ox + i, y - oy + j, pat(x - ox + i, y - oy + j));
  }

  /* ---------------------------------------------------------------- *
   *  7. Historique et feuille
   * ---------------------------------------------------------------- */
  function pushUndo() {
    undoStack.push({ d: doc.slice(), l: layerSnapshot() });
    if (undoStack.length > 24) undoStack.shift();
    redoStack.length = 0;
    scheduleSave();
  }
  function undo() {
    if (!undoStack.length) return;
    textCommit();
    redoStack.push({ d: doc.slice(), l: layerSnapshot() });
    const s = undoStack.pop();
    doc.set(s.d); restoreLayers(s.l);
    sel = null; selectedText = null;
    renderTextLayers();
    scheduleSave();
    cheer("undo");
    render();
  }
  /* Ultra-Violence : pour annuler, il faut retracer le dernier trait à l'envers
     (partir de là où il finissait, finir là où il commençait). Demander
     l'annulation une seconde fois fait céder le logiciel : le filet de sécurité
     reste là. */
  let strokeA = null, strokeB = null, lastEnds = null, undoArmed = false;
  function requestUndo() {
    const hard = typeof Satire !== "undefined" && Satire.difficulty && Satire.difficulty.get() === 3 && Satire.traps && Satire.traps.note;
    if (!hard || !lastEnds || !undoStack.length || undoArmed) { undoArmed = false; undo(); return; }
    undoArmed = true;
    Satire.traps.note("Pour annuler, retracez votre dernier trait à l’envers. (Ou redemandez, si vous y tenez.)");
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push({ d: doc.slice(), l: layerSnapshot() });
    const s = redoStack.pop();
    doc.set(s.d); restoreLayers(s.l);
    selectedText = null;
    renderTextLayers();
    scheduleSave();
    cheer("redo");
    render();
  }

  let saveTimer = null;
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveLocal, 600);
  }
  function saveLocal() {
    try {
      let s = "";
      for (let i = 0; i < doc.length; i += 8) {
        let b = 0;
        for (let k = 0; k < 8; k++) b |= doc[i + k] << k;
        s += String.fromCharCode(b);
      }
      localStorage.setItem("macpaint.doc", btoa(s));
    } catch (e) { /* stockage plein ou refusé */ }
  }
  function loadLocal() {
    try {
      const s = atob(localStorage.getItem("macpaint.doc") || "");
      if (s.length * 8 !== doc.length) return false;
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        for (let k = 0; k < 8; k++) doc[i * 8 + k] = (c >> k) & 1;
      }
      return true;
    } catch (e) { return false; }
  }

  /* ---------------------------------------------------------------- *
   *  8. Sélections
   * ---------------------------------------------------------------- */
  function selContains(x, y) {
    if (!sel) return false;
    const i = x - sel.x, j = y - sel.y;
    if (i < 0 || j < 0 || i >= sel.w || j >= sel.h) return false;
    return !sel.mask || sel.mask[j * sel.w + i] === 1;
  }

  function selClear() {
    sel = null;
  }

  function selLift() {
    if (!sel) return;
    pushUndo();
    const d = new Uint8Array(sel.w * sel.h);
    for (let j = 0; j < sel.h; j++)
      for (let i = 0; i < sel.w; i++) {
        const X = sel.x + i, Y = sel.y + j;
        if (X < 0 || Y < 0 || X >= DW || Y >= DH) continue;
        if (sel.mask && !sel.mask[j * sel.w + i]) continue;
        d[j * sel.w + i] = doc[Y * DW + X];
        doc[Y * DW + X] = 0;
      }
    sel.data = d;
  }

  function selCommit() {
    if (!sel || !sel.data) return;
    for (let j = 0; j < sel.h; j++)
      for (let i = 0; i < sel.w; i++) {
        if (sel.mask && !sel.mask[j * sel.w + i]) continue;
        const X = sel.x + i, Y = sel.y + j;
        if (X < 0 || Y < 0 || X >= DW || Y >= DH) continue;
        doc[Y * DW + X] = sel.data[j * sel.w + i];
      }
    sel.data = null;
  }

  function selBounds() {
    if (sel) return { x: sel.x, y: sel.y, w: sel.w, h: sel.h };
    return { x: 0, y: 0, w: DW, h: DH };
  }

  function selApply(fn) {
    const b = selBounds();
    pushUndo();
    const src = new Uint8Array(b.w * b.h);
    for (let j = 0; j < b.h; j++)
      for (let i = 0; i < b.w; i++)
        src[j * b.w + i] = doc[(b.y + j) * DW + b.x + i];
    fn(src, b);
    for (let j = 0; j < b.h; j++)
      for (let i = 0; i < b.w; i++)
        doc[(b.y + j) * DW + b.x + i] = src[j * b.w + i];
    scheduleSave();
    render();
  }

  /* ---------------------------------------------------------------- *
   *  9. Texte (outil)
   * ---------------------------------------------------------------- */
  const textState = { active: false, x: 0, y: 0, lines: [""], li: 0, ci: 0, base: null, blink: 0 };

  /* Calques de texte : un texte validé reste un objet superposé, déplaçable et
     rééditable, au lieu d'être figé dans la feuille (comme un logiciel moderne). */
  const textLayers = [];   // {id, x, y, lines, font, size, styles, alignment}
  let textLayerId = 1;
  let selectedText = null; // id du calque sélectionné (déplacement / édition)
  function cloneTextLayer(l){return {id:l.id,x:l.x,y:l.y,lines:l.lines.slice(),font:l.font,size:l.size,styles:l.styles.slice(),alignment:l.alignment,white:!!l.white};}
  function layerSnapshot(){return textLayers.map(cloneTextLayer);}
  function restoreLayers(layers){textLayers.length=0;for(const l of layers)textLayers.push(cloneTextLayer(l));}

  /* Rendu des calques de texte : un canevas superposé 1 bit, redessiné quand un
     calque change, puis composé au-dessus de la feuille. */
  const textCanvas = document.createElement("canvas");
  textCanvas.width = DW; textCanvas.height = DH;
  const tctx = textCanvas.getContext("2d");

  function layerLineHeight(layer){ return textBmp("", layer.font, layer.size, false, false).lineHeight; }

  function stampLayerLine(layer, str, x, baseline, fam, bold, italic) {
    if (!str) return;
    if (layer.alignment !== "left") {
      const tw = textWidth(str, fam, layer.size, bold, italic);
      x -= layer.alignment === "middle" ? Math.round(tw / 2) : tw;
    }
    const b = textBmp(str, fam, layer.size, bold, italic);
    const bw = b.w, bh = b.h;
    let g = b.bits.slice();
    const at = function (arr, i, j) { return (i >= 0 && j >= 0 && i < bw && j < bh) ? arr[j * bw + i] : 0; };
    if (layer.styles.includes("outline") || layer.styles.includes("shadow")) {
      const o = new Uint8Array(bw * bh);
      for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
        if (at(g, i, j)) continue;
        o[j * bw + i] = (at(g, i - 1, j) || at(g, i + 1, j) || at(g, i, j - 1) || at(g, i, j + 1)) ? 1 : 0;
      }
      g = o;
      if (layer.styles.includes("shadow")) {
        const s = g.slice();
        for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
          const v = at(s, i, j);
          if (v && i + 1 < bw && j + 1 < bh) g[(j + 1) * bw + i + 1] = 1;
        }
      }
    }
    tctx.fillStyle = layer.white ? "#fff" : "#000";
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
      if (!g[j * bw + i]) continue;
      tctx.fillRect(x + i - b.pad, baseline - b.asc + j, 1, 1);
    }
    if (layer.styles.includes("underline")) {
      const y = baseline + 2;
      for (let i = 0; i < b.adv; i++) tctx.fillRect(x + i, y, 1, 1);
    }
  }

  function drawLayerText(layer) {
    const fam = (FONTS.find(function (f) { return f.name === layer.font; }) || FONTS[0]).css;
    const bold = layer.styles.includes("bold");
    const italic = layer.styles.includes("italic");
    const lh = layerLineHeight(layer);
    for (let i = 0; i < layer.lines.length; i++) stampLayerLine(layer, layer.lines[i], layer.x, layer.y + i * lh, fam, bold, italic);
  }

  function renderTextLayers() {
    tctx.clearRect(0, 0, DW, DH);
    for (const layer of textLayers) drawLayerText(layer);
  }

  /* Boîte englobante d'un calque (pour le pointage et le déplacement). */
  function textLayerBounds(layer) {
    const lh = layerLineHeight(layer);
    const fam = (FONTS.find(function (f) { return f.name === layer.font; }) || FONTS[0]).css;
    const bold = layer.styles.includes("bold");
    const italic = layer.styles.includes("italic");
    let w = 0;
    for (const line of layer.lines) w = Math.max(w, textWidth(line, fam, layer.size, bold, italic));
    const asc = textBmp("M", layer.font, layer.size, bold, italic).asc;
    const x = layer.alignment === "middle" ? layer.x - Math.round(w / 2) : layer.alignment === "right" ? layer.x - w : layer.x;
    return { x: x - 2, y: layer.y - asc - 2, w: w + 4, h: lh * layer.lines.length + 4 };
  }

  function textLayerAt(x, y) {
    for (let i = textLayers.length - 1; i >= 0; i--) {
      const b = textLayerBounds(textLayers[i]);
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return textLayers[i];
    }
    return null;
  }

  /* Rééditer un calque : on le retire de la liste, on recharge son contenu et son
     style dans l'éditeur, puis l'utilisateur revalide (nouveau calque). */
  function editTextLayerById(id) {
    const i = textLayers.findIndex(function (t) { return t.id === id; });
    if (i < 0) return false;
    const layer = textLayers[i];
    pushUndo();
    textLayers.splice(i, 1);
    renderTextLayers();
    fontName = layer.font; fontSize = layer.size;
    styles.clear(); layer.styles.forEach(function (s) { styles.add(s); });
    alignment = layer.alignment;
    selectedText = null;
    textState.active = true; textState.x = layer.x; textState.y = layer.y;
    textState.lines = layer.lines.slice(); textState.li = layer.lines.length - 1; textState.ci = textState.lines[textState.li].length;
    textState.base = doc.slice(); textState.blink = Date.now();
    render();
    return true;
  }

  function textLineHeight() {
    return textBmp("",fontName,fontSize,false,false).lineHeight;
  }

  function textRender() {
    if (!textState.base) return;
    doc.set(textState.base);
    for (let i = 0; i < textState.lines.length; i++) {
      stampLine(textState.lines[i], textState.x, textState.y + i * textLineHeight());
    }
    render();
  }

  function stampLine(str, x, baseline) {
    if (!str) return;
    const fam = (FONTS.find(function (f) { return f.name === fontName; }) || FONTS[0]).css;
    const bold = styles.has("bold");
    if(alignment!=="left") {
      const tw=textWidth(str,fam,fontSize,bold,styles.has("italic"));
      x-=alignment==="middle"?Math.round(tw/2):tw;
    }
    const italic = styles.has("italic");
    const b = textBmp(str, fam, fontSize, bold, italic);
    const bw = b.w, bh = b.h;
    /* application des styles */
    let g = b.bits.slice();
    const at = function (arr, i, j) { return (i >= 0 && j >= 0 && i < bw && j < bh) ? arr[j * bw + i] : 0; };
    if (styles.has("outline") || styles.has("shadow")) {
      const o = new Uint8Array(bw * bh);
      for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
        if (at(g, i, j)) continue;
        o[j * bw + i] = (at(g, i - 1, j) || at(g, i + 1, j) || at(g, i, j - 1) || at(g, i, j + 1)) ? 1 : 0;
      }
      g = o;
      if (styles.has("shadow")) {
        const s = g.slice();
        for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
          const v = at(s, i, j);
          if (v && i + 1 < bw && j + 1 < bh) g[(j + 1) * bw + i + 1] = 1;
        }
      }
    }
    for (let j = 0; j < bh; j++)
      for (let i = 0; i < bw; i++) {
        if (!g[j * bw + i]) continue;
        px(x + i - b.pad, baseline - b.asc + j, inkWhite() ? 0 : 1);
      }
    if (styles.has("underline")) {
      const y = baseline + 2;
      for (let i = 0; i < b.adv; i++) px(x + i, y, inkWhite() ? 0 : 1);
    }
  }

  function textCommit() {
    if (!textState.active) return;
    textState.active = false;
    /* Le texte validé quitte la feuille bitmap et devient un calque superposé. */
    if (textState.base) doc.set(textState.base);
    const content = textState.lines.filter(function (l) { return l.length > 0; });
    if (content.length) {
      textLayers.push({ id: textLayerId++, x: textState.x, y: textState.y, lines: content, font: fontName, size: fontSize, styles: [...styles], alignment: alignment, white: inkWhite() });
      renderTextLayers();
      cheer("text");
    }
    textState.base = null;
    scheduleSave();
    render();
  }
  function textBegin(x, y) {
    textCommit();
    pushUndo();
    textState.active = true;
    textState.x = x;
    textState.y = y;
    textState.lines = [""];
    textState.li = 0;
    textState.ci = 0;
    textState.base = doc.slice();
    textState.blink = Date.now();
    render();
  }
  function textInsert(ch) {
    if (!textState.active) return;
    const l = textState.lines[textState.li];
    textState.lines[textState.li] = l.slice(0, textState.ci) + ch + l.slice(textState.ci);
    textState.ci += ch.length;
    tickSnd("type");
    textRender();
  }
  function textBackspace() {
    if (!textState.active) return;
    const l = textState.lines[textState.li];
    if (textState.ci > 0) {
      textState.lines[textState.li] = l.slice(0, textState.ci - 1) + l.slice(textState.ci);
      textState.ci--;
    } else if (textState.li > 0) {
      textState.ci = textState.lines[textState.li - 1].length;
      textState.lines[textState.li - 1] += l;
      textState.lines.splice(textState.li, 1);
      textState.li--;
    }
    textRender();
  }
  function textCaretPos() {
    const fam = (FONTS.find(function (f) { return f.name === fontName; }) || FONTS[0]).css;
    const bold = styles.has("bold");
    const str = textState.lines[textState.li].slice(0, textState.ci);
    const w = str ? textWidth(str, fam, fontSize, bold, styles.has("italic")) : 0;
    const full=textState.lines[textState.li],tw=textWidth(full,fam,fontSize,bold,styles.has("italic"));
    const offset=alignment==="middle"?Math.round(tw/2):alignment==="right"?tw:0;
    return { x: textState.x + w-offset, y: textState.y + textState.li * textLineHeight() };
  }

  /* ---------------------------------------------------------------- *
   *  10. Rendu de l'écran
   * ---------------------------------------------------------------- */
  const docCanvas = document.createElement("canvas");
  docCanvas.width = DW; docCanvas.height = DH;
  const dctx = docCanvas.getContext("2d");
  const docImg = dctx.createImageData(DW, DH);
  const docPx = new Uint32Array(docImg.data.buffer);

  function syncDoc() {
    for (let i = 0; i < doc.length; i++) docPx[i] = doc[i] ? 0xff000000 : 0xffffffff;
    dctx.putImageData(docImg, 0, 0);
  }

  function viewWH() {
    return { w: Math.floor(VIEW.w / zoom), h: Math.floor(VIEW.h / zoom) };
  }
  function clampView() {
    const v = viewWH();
    view.x = Math.max(0, Math.min(DW - v.w, view.x));
    view.y = Math.max(0, Math.min(DH - v.h, view.y));
  }

  function fill(x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
    if (c !== "#000") ctx.fillStyle = "#000";
  }

  const chromeCanvas=document.createElement("canvas");chromeCanvas.width=SW;chromeCanvas.height=SH;
  const chromeCtx=chromeCanvas.getContext("2d"),chromeImage=chromeCtx.createImageData(SW,SH);
  const chromePacked=atob(CLASSIC.chrome);
  for(let i=0;i<SW*SH;i++) {const v=(chromePacked.charCodeAt(i>>3)>>(7-(i&7)))&1;const k=i*4;chromeImage.data[k]=chromeImage.data[k+1]=chromeImage.data[k+2]=v?0:255;chromeImage.data[k+3]=255;}
  chromeCtx.putImageData(chromeImage,0,0);
  function drawWindowChrome() { }
  function drawMenuBar() {
    // Menu headings in the supplied reference; original Chicago bitmap labels.
    const boxes=[[12,23],[35,35],[71,35],[109,64],[174,43],[218,91],[310,48]];
    boxes.forEach((b,i)=>{MENUS[i].x=b[0];MENUS[i].w=b[1];});
    /* Le fruit du logo suit le niveau de difficulté ; la pomme d'origine (niveau 2)
       reste celle de l'image de référence. */
    if (typeof Satire !== "undefined" && Satire.difficulty && Satire.difficulty.get() !== 1) {
      const rows = Satire.difficulty.fruit(), fx0 = 23 - Math.floor(rows[0].length / 2), fy0 = Math.round(7.5 - rows.length / 2);
      fill(15, 1, 18, 15, "#fff");
      ctx.fillStyle = "#000";
      for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) if (rows[j][i] === "#") ctx.fillRect(fx0 + i, fy0 + j, 1, 1);
    }
    if(menuOpen>=0) {
      const b=boxes[menuOpen];
      const image=ctx.getImageData(b[0],0,b[1],18);
      for(let i=0;i<image.data.length;i+=4) image.data[i]=image.data[i+1]=image.data[i+2]=255-image.data[i];
      ctx.putImageData(image,b[0],0);
    }
  }

  function drawApple(x, y, color) {
    ctx.fillStyle = color;
    for (let j = 0; j < APPLE.length; j++)
      for (let i = 0; i < APPLE[j].length; i++)
        if (APPLE[j][i] === "#") ctx.fillRect(x + i, y + j, 1, 1);
    ctx.fillStyle = "#000";
  }

  function drawTextInverse(str, x, y, fam, size) {
    const b = textBmp(str, fam, size, false, false);
    const old = ctx.fillStyle;
    ctx.fillStyle = "#fff";
    for (let j = 0; j < b.h; j++)
      for (let i = 0; i < b.w; i++)
        if (b.bits[j * b.w + i]) ctx.fillRect(x + i, y - b.asc + j, 1, 1);
    ctx.fillStyle = old;
  }

  const ACCENT = "#39ff14";

  function drawPalette() {
const now = performance.now(), idle = now < idleUntil, moving = [];
    for (const cell of CLASSIC.tools) {
      const sp = cellSprings[cell.tool], selected = cell.tool === tool, q = cellPos[cell.tool];
      const hx = Math.round(q.x), hy = Math.round(q.y), away = hx !== cell.x || hy !== cell.y;
      let ox = sp ? Math.round(sp.x.x) : 0, oy = sp ? Math.round(sp.y.x) : 0;
      if (frenzyWas) { ox += Math.round((Math.random() - 0.5) * 3); oy += Math.round((Math.random() - 0.5) * 3); }
      if (idle) oy += Math.round(Math.sin(now / 260 - (cell.y - 28) / 22 * 0.7 + (cell.x > 30 ? 0.5 : 0)) * 1.4);
      if (selected && working && !classicOnly()) {
        ox += Math.round(Math.sin(workTime * 26) * (suspense ? 3 : 1.5));
        if (suspense) oy += Math.round(Math.sin(workTime * 41));
      }
      if (bodies[cell.tool]) { fill(cell.x, cell.y, 25, 21, "#fff"); if (!away) continue; fill(hx, hy, 25, 21, "#fff"); continue; }
      if (selected || ox || oy || away) moving.push({ cell: cell, ox: ox, oy: oy, selected: selected, away: away, x: hx, y: hy });
    }
    for (const m of moving) if (m.away) fill(m.cell.x, m.cell.y, 25, 21, "#fff");   // la case a quitté sa place d'origine
    moving.sort((a, b) => a.selected - b.selected);       // la case choisie passe devant
    for (const m of moving) {
      const cell = m.cell, cx = m.x + m.ox, cy = m.y + m.oy;
      if (m.ox || m.oy || (m.away && (cellPos[cell.tool].x !== cellPos[cell.tool].tx || cellPos[cell.tool].y !== cellPos[cell.tool].ty))) {
        if (!m.away) fill(cell.x, cell.y, 25, 21, "#fff");
        fill(cx - 1, cy - 1, 27, 23, "#000");
      }
      fill(cx, cy, 25, 21, m.selected ? "#000" : "#fff");
      ctx.fillStyle = m.selected ? ACCENT : "#000";
      for(let y=0;y<21;y++)for(let x=0;x<25;x++)if(cell.rows[y][x]==="1")ctx.fillRect(cx+x,cy+y,1,1);
      ctx.fillStyle="#000";
    }
    for(let i=0;i<PAT.length;i++) {
      if(PAT[i].every((v,j)=>v===PAT_DEF[i][j]))continue;
      const x=120+(i%19)*20,y=300+Math.floor(i/19)*17;
      fill(x,y,19,16,"#fff");ctx.fillStyle="#000";
      for(let yy=0;yy<16;yy++)for(let xx=0;xx<19;xx++)if(PAT[i][(yy&7)*8+(xx&7)])ctx.fillRect(x+xx,y+yy,1,1);
    }
    if (patMixed) for (let s = 0; s < PAT_SLOT.length; s++) {     // trames mélangées : chaque case montre sa trame du moment
      const x=120+(s%19)*20,y=300+Math.floor(s/19)*17,q=PAT[PAT_SLOT[s]];
      fill(x,y,19,16,"#fff");ctx.fillStyle="#000";
      for(let yy=0;yy<16;yy++)for(let xx=0;xx<19;xx++)if(q[(yy&7)*8+(xx&7)])ctx.fillRect(x+xx,y+yy,1,1);
    }
    // Current pattern sample (the two rows retain their exact original resources).
    fill(85,305,28,23,"#fff");ctx.fillStyle="#000";
    for(let y=0;y<23;y++)for(let x=0;x<28;x++)if(PAT[pattern][(y&7)*8+(x&7)])ctx.fillRect(85+x,305+y,1,1);
    if(pattern!==0){ctx.strokeStyle=ACCENT;ctx.strokeRect(84.5,304.5,29,24);}
    // Empty first row = no outline; retain the four historical stroke widths.
    if(lineWidth!==0||noOutline){fill(19,271,22,15,"#fff");drawBitmap(CHECK,20,noOutline?262:[277,288,301,316][lineWidth]);}
  }

  /* Les icônes relevées sur la capture ne partagent pas les mêmes marges : sans
     recentrage, certaines touchaient le filet du haut et d'autres flottaient,
     d'où un décalage visible d'une case à l'autre. On mesure l'encre de chaque
     icône une fois, puis on la pose au centre de sa case. */
  const ICON_BOX = {};
  (function () {
    for (const k in ICON) {
      const rows = ICON[k];
      let x0 = 999, y0 = 999, x1 = -1, y1 = -1;
      for (let j = 0; j < rows.length; j++)
        for (let i = 0; i < rows[j].length; i++)
          if (rows[j][i] === "#") {
            if (i < x0) x0 = i; if (i > x1) x1 = i;
            if (j < y0) y0 = j; if (j > y1) y1 = j;
          }
      if (x1 >= 0) ICON_BOX[k] = { x0: x0, y0: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }
  })();

  /* Variante pleine d'une icône : on remplit chaque ligne entre son premier et
     son dernier pixel d'encre. Sert à montrer, dans la palette, que le double-clic
     a mis l'outil de forme en mode plein. */
  function drawIconFilled(name, x, y, color, cellW, cellH) {
    const rows = ICON[name];
    if (!rows) return;
    let dx = 0, dy = 0;
    const b = ICON_BOX[name];
    if (b && cellW && cellH) {
      dx = Math.round((cellW - b.w) / 2) - b.x0;
      dy = Math.round((cellH - b.h) / 2) - b.y0;
    }
    ctx.fillStyle = color;
    for (let j = 0; j < rows.length; j++) {
      const a = rows[j].indexOf("#"), z = rows[j].lastIndexOf("#");
      if (a >= 0) ctx.fillRect(x + dx + a, y + dy + j, z - a + 1, 1);
    }
    ctx.fillStyle = "#000";
  }

  function drawIcon(name, x, y, color, cellW, cellH) {
    const rows = ICON[name];
    if (!rows) return;
    let dx = 0, dy = 0;
    const b = ICON_BOX[name];
    if (b && cellW && cellH) {
      dx = Math.round((cellW - b.w) / 2) - b.x0;
      dy = Math.round((cellH - b.h) / 2) - b.y0;
    }
    ctx.fillStyle = color;
    for (let j = 0; j < rows.length; j++)
      for (let i = 0; i < rows[j].length; i++)
        if (rows[j][i] === "#") ctx.fillRect(x + dx + i, y + dy + j, 1, 1);
    ctx.fillStyle = "#000";
  }

  /* Bureau du Macintosh : trame 50 % dessinée par un motif 2 × 2 mis en cache,
     sinon chaque rendu coûterait quatre-vingt mille rectangles. */
  let DESK_PAT = null;
  function fillDesk() {
    if (!DESK_PAT) {
      const c = document.createElement("canvas");
      c.width = 2; c.height = 2;
      const x = c.getContext("2d");
      x.fillStyle = "#fff"; x.fillRect(0, 0, 2, 2);
      x.fillStyle = "#000"; x.fillRect(0, 0, 1, 1); x.fillRect(1, 1, 1, 1);
      DESK_PAT = ctx.createPattern(c, "repeat");
    }
    ctx.fillStyle = DESK_PAT;
    ctx.fillRect(0, 0, SW, SH);
    ctx.fillStyle = "#000";
  }

  function ditherRect(x, y, w, h) {
    ctx.fillStyle = "#000";
    for (let j = 0; j < h; j++)
      for (let i = (j & 1); i < w; i += 2) ctx.fillRect(x + i, y + j, 1, 1);
  }

  function arrow(x, y, dir) {
    ctx.fillStyle = "#000";
    for (let j = 0; j < 3; j++) {
      if (dir === "up") ctx.fillRect(x + 2 - j, y + j, 2 * j + 1, 1);
      else if (dir === "down") ctx.fillRect(x + 2 - j, y + 4 - j, 2 * j + 1, 1);
      else if (dir === "left") ctx.fillRect(x + j, y + 2 - j, 1, 2 * j + 1);
      else ctx.fillRect(x + 4 - j, y + 2 - j, 1, 2 * j + 1);
    }
    if (dir === "up") ctx.fillRect(x + 2, y + 3, 1, 2);
    else if (dir === "down") ctx.fillRect(x + 2, y, 1, 2);
    else if (dir === "left") ctx.fillRect(x + 3, y + 2, 2, 1);
    else ctx.fillRect(x, y + 2, 2, 1);
  }

  function scrollGeom() {
    const v = viewWH();
    const bx = VIEW.x + VIEW.w, by = VIEW.y + VIEW.h;
    const trackY = VIEW.y + SB, trackH = VIEW.h - 2 * SB;
    const thumbH = Math.max(24, Math.round(trackH * v.h / DH));
    const ty = trackY + Math.round((trackH - thumbH) * (view.y / Math.max(1, DH - v.h)));
    const trackX = VIEW.x + SB, trackW = VIEW.w - 2 * SB;
    const thumbW = Math.max(24, Math.round(trackW * v.w / DW));
    const tx = trackX + Math.round((trackW - thumbW) * (view.x / Math.max(1, DW - v.w)));
    return { bx: bx, by: by, trackY: trackY, trackH: trackH, thumbH: thumbH, ty: ty, trackX: trackX, trackW: trackW, thumbW: thumbW, tx: tx };
  }

  /* Case de redimensionnement, en bas à droite de la fenêtre : un carré blanc
     bordé, traversé de trois diagonales, comme dans MacPaint. */
  function drawSizeBox() {
    const x = VIEW.x + VIEW.w, y = VIEW.y + VIEW.h;
    fill(x, y, SB_R, SB_B, "#fff");
    fill(x, y, SB_R, 1, "#000");
    fill(x, y, 1, SB_B, "#000");
    for (let i = 0; i < 3; i++) {
      const d = 3 + i * 3;
      for (let k = 0; k < d; k++) ctx.fillRect(x + SB_R - 1 - k, y + SB_B - 1 - k, 1, 1);
    }
  }

  function drawScrollbars() {
    const g = scrollGeom();
    const bx = g.bx, by = g.by;

    /* --- barre verticale --- */
    fill(bx, VIEW.y, SB_R, VIEW.h, "#fff");
    ditherRect(bx + 1, g.trackY, SB_R - 2, g.trackH);
    fill(bx, VIEW.y, 1, VIEW.h, "#000");
    fill(bx, VIEW.y, SB_R, 1, "#000");
    fill(bx, by - 1, SB_R, 1, "#000");
    fill(bx, VIEW.y, SB_R, SB, "#fff");
    fill(bx, by - SB, SB_R, SB, "#fff");
    fill(bx, VIEW.y + SB - 1, SB_R, 1, "#000");
    fill(bx, by - SB, SB_R, 1, "#000");
    arrow(bx + Math.floor((SB_R - 5) / 2), VIEW.y + Math.floor((SB - 5) / 2), "up");
    arrow(bx + Math.floor((SB_R - 5) / 2), by - SB + Math.floor((SB - 5) / 2), "down");

    fill(bx + 2, g.ty, SB_R - 4, g.thumbH, "#fff");
    ctx.strokeStyle = "#000";
    ctx.strokeRect(bx + 2.5, g.ty + 0.5, SB_R - 5, g.thumbH - 1);

    /* --- barre horizontale --- */
    fill(VIEW.x, by, VIEW.w, SB_B, "#fff");
    ditherRect(g.trackX, by + 1, g.trackW, SB_B - 2);
    fill(VIEW.x, by, VIEW.w, 1, "#000");
    fill(VIEW.x, by, 1, SB_B, "#000");
    fill(bx - 1, by, 1, SB_B, "#000");
    fill(VIEW.x, by, SB, SB_B, "#fff");
    fill(bx - SB, by, SB, SB_B, "#fff");
    fill(VIEW.x + SB - 1, by, 1, SB_B, "#000");
    fill(bx - SB, by, 1, SB_B, "#000");
    arrow(VIEW.x + Math.floor((SB - 5) / 2), by + Math.floor((SB_B - 5) / 2), "left");
    arrow(bx - SB + Math.floor((SB - 5) / 2), by + Math.floor((SB_B - 5) / 2), "right");

    fill(g.tx, by + 2, g.thumbW, SB_B - 4, "#fff");
    ctx.strokeRect(g.tx + 0.5, by + 2.5, g.thumbW - 1, SB_B - 5);

    /* coin */
    fill(bx, by, SB_R, SB_B, "#fff");
  }

  function drawDoc() {
    syncDoc();
    ctx.save();
    ctx.beginPath();
    ctx.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    ctx.clip();
    const v = viewWH();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(docCanvas, view.x, view.y, v.w, v.h, VIEW.x, VIEW.y, v.w * zoom, v.h * zoom);
    ctx.drawImage(textCanvas, view.x, view.y, v.w, v.h, VIEW.x, VIEW.y, v.w * zoom, v.h * zoom);
    if (selectedText !== null) {
      const layer = textLayers.find(function (l) { return l.id === selectedText; });
      if (layer) {
        const b = textLayerBounds(layer);
        const hx = VIEW.x + (b.x - view.x) * zoom, hy = VIEW.y + (b.y - view.y) * zoom;
        ctx.strokeStyle = ACCENT; ctx.setLineDash([4, 4]);
        ctx.strokeRect(hx - 0.5, hy - 0.5, b.w * zoom + 1, b.h * zoom + 1);
        ctx.setLineDash([]);
      }
    }

    /* bord de la feuille */
    const px0 = VIEW.x - view.x * zoom, py0 = VIEW.y - view.y * zoom;
    ctx.strokeStyle = "#000";
    ctx.strokeRect(px0 - 0.5, py0 - 0.5, DW * zoom + 1, DH * zoom + 1);

    if (gridOn) {
      ctx.fillStyle = "rgba(0,0,0,.25)";
      for (let gx = view.x - (view.x % 8); gx < view.x + v.w; gx += 8) {
        const sx = Math.round(VIEW.x + (gx - view.x) * zoom);
        ctx.fillRect(sx, VIEW.y, 1, VIEW.h);
      }
      for (let gy = view.y - (view.y % 8); gy < view.y + v.h; gy += 8) {
        const sy = Math.round(VIEW.y + (gy - view.y) * zoom);
        ctx.fillRect(VIEW.x, sy, VIEW.w, 1);
      }
    }

    if (zoom > 1) {
      ctx.fillStyle = "#fff";
      for (let i = 0; i <= v.w; i++) {
        const sx = Math.round(VIEW.x + i * zoom) - 1;
        ctx.fillRect(sx, VIEW.y, 1, Math.min(VIEW.h, v.h * zoom));
      }
      for (let j = 0; j <= v.h; j++) {
        const sy = Math.round(VIEW.y + j * zoom) - 1;
        ctx.fillRect(VIEW.x, sy, Math.min(VIEW.w, v.w * zoom), 1);
      }
    }
    ctx.restore();
  }

  function drawSelection() {
    if (!sel) return;
    const t = Math.floor(Date.now() / 160) % 8;
    const x0 = VIEW.x + (sel.x - view.x) * zoom;
    const y0 = VIEW.y + (sel.y - view.y) * zoom;
    const w = sel.w * zoom, h = sel.h * zoom;
    ctx.save();
    ctx.beginPath();
    ctx.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    ctx.clip();
    if (!sel.mask) {
      for (let i = 0; i < w; i++) {
        if (((i + t) & 3) < 2) {
          ctx.fillStyle = ACCENT; ctx.fillRect(x0 + i, y0, 1, 1); ctx.fillRect(x0 + i, y0 + h - 1, 1, 1);
        } else {
          ctx.fillStyle = "#000"; ctx.fillRect(x0 + i, y0, 1, 1); ctx.fillRect(x0 + i, y0 + h - 1, 1, 1);
        }
      }
      for (let j = 0; j < h; j++) {
        if (((j + t) & 3) < 2) { ctx.fillStyle = ACCENT; ctx.fillRect(x0, y0 + j, 1, 1); ctx.fillRect(x0 + w - 1, y0 + j, 1, 1); }
        else { ctx.fillStyle = "#000"; ctx.fillRect(x0, y0 + j, 1, 1); ctx.fillRect(x0 + w - 1, y0 + j, 1, 1); }
      }
    } else {
      for (let j = 0; j < sel.h; j++)
        for (let i = 0; i < sel.w; i++) {
          if (!sel.mask[j * sel.w + i]) continue;
          const edge = i === 0 || j === 0 || i === sel.w - 1 || j === sel.h - 1 ||
            !sel.mask[j * sel.w + i - 1] || !sel.mask[j * sel.w + i + 1] ||
            !sel.mask[(j - 1) * sel.w + i] || !sel.mask[(j + 1) * sel.w + i];
          if (!edge) continue;
          const X = Math.round(x0 + i * zoom), Y = Math.round(y0 + j * zoom);
          ctx.fillStyle = ((i + j + t) & 3) < 2 ? ACCENT : "#000";
          ctx.fillRect(X, Y, Math.max(1, zoom), Math.max(1, zoom));
        }
    }
    ctx.restore();
  }

  function drawFatBitsCursor() {
    if (!fatBits) return;
    const d = screenToDoc(mouse.x, mouse.y);
    if (d.x < 0 || d.y < 0 || d.x >= DW || d.y >= DH) return;
    const x = VIEW.x + (d.x - view.x) * zoom, y = VIEW.y + (d.y - view.y) * zoom;
    ctx.strokeStyle = "#000";
    ctx.strokeRect(x - 0.5, y - 0.5, zoom + 1, zoom + 1);
    ctx.strokeStyle = ACCENT;
    ctx.strokeRect(x + 0.5, y + 0.5, zoom - 1, zoom - 1);
  }

  /* sélection flottante (pixels déplacés ou collés) */
  const floatCanvas = document.createElement("canvas");
  const fctx = floatCanvas.getContext("2d");

  function drawFloating() {
    if (!sel || !sel.data) return;
    floatCanvas.width = sel.w; floatCanvas.height = sel.h;
    const im = fctx.createImageData(sel.w, sel.h);
    const p32 = new Uint32Array(im.data.buffer);
    for (let i = 0; i < sel.data.length; i++) p32[i] = sel.data[i] ? 0xff000000 : 0x00000000;
    fctx.putImageData(im, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(floatCanvas, Math.round(VIEW.x + (sel.x - view.x) * zoom), Math.round(VIEW.y + (sel.y - view.y) * zoom),
      sel.w * zoom, sel.h * zoom);
    ctx.restore();
  }

  function drawLassoPath() {
    if (!drag || drag.kind !== "lasso") return;
    const pts = drag.pts;
    if (!pts || pts.length < 2) return;
    ctx.fillStyle = "#000";
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const x0 = VIEW.x + (a.x - view.x) * zoom, y0 = VIEW.y + (a.y - view.y) * zoom;
      const x1 = VIEW.x + (b.x - view.x) * zoom, y1 = VIEW.y + (b.y - view.y) * zoom;
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
      for (let k = 0; k <= n; k += 2) ctx.fillRect(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), 1, 1);
    }
  }

  function render() {
    if (touchMode) { notifyChange(); return; }
    ctx.drawImage(chromeCanvas,0,0);
    if(!documentOpen) {
      fillDesk();
      ctx.drawImage(chromeCanvas,0,0,78,342,0,0,78,342);
      ctx.drawImage(chromeCanvas,0,0,512,19,0,0,512,19);
      drawMenuBar();drawPalette();legoCompose();drawBodies();
      if(menuOpen>=0)legoDrawMenu();if(dialog)drawDialog();legoSharp();notifyChange();return;
    }
    drawMenuBar();
    drawPalette();
    drawWindowChrome();
    drawDoc();
    drawFloating();
    drawSelection();
    drawLassoPath();
    // MacPaint 1.5 reference has a fixed paint viewport, no modern scrollbars.
    if(showPage) drawPageOverview();
    if(helpPage) {
      const bits=atob(CLASSIC.help[helpPage]);fill(VIEW.x,VIEW.y,VIEW.w,VIEW.h,"#fff");ctx.fillStyle="#000";
      for(let y=0;y<240;y++)for(let x=0;x<416;x++)if((bits.charCodeAt((y*416+x)>>3)>>(7-(x&7)))&1)ctx.fillRect(VIEW.x+x,VIEW.y+y,1,1);
    }
    drawFatBitsCursor();

    /* curseur texte */
    if (textState.active && (Date.now() - textState.blink) % 1000 < 550) {
      const c = textCaretPos();
      const x = VIEW.x + (c.x - view.x) * zoom;
      const cy = VIEW.y + (c.y - view.y) * zoom;
      ctx.fillStyle = ACCENT;
      ctx.fillRect(Math.round(x), Math.round(cy - fontSize), 1, fontSize + 2);
    }

    legoCompose();
    drawBodies();
    if (menuOpen >= 0) legoDrawMenu();
    if (dialog) drawDialog();
    legoSharp();
    notifyChange();
  }

  /* ---------------------------------------------------------------- *
   *  11. Menus
   * ---------------------------------------------------------------- */
  const menuCommands = [
    ["about",null],
    ["new","open","closeDocument","save","saveAs","revert","print","print","catalog","quit"],
    ["undo",null,"cut","copy","paste","clearSel",null,"invert","fill","trace","fliph","flipv","rotate"],
    ["grid","fatbits","showpage","editpattern","brushshape","mirrors","intro","shortcuts"],
    [],[],[]
  ];
  const MENUS=CLASSIC.menus.map((m,i)=>({title:i?m.title:"",apple:i===0,
    items:m.items.map((item,j)=>item.text==="-"?{sep:true}:{t:item.text,k:item.key,cmd:menuCommands[i][j]||"close"}),
    dynamic:i===4?"fonts":i===5?"sizes":i===6?"styles":undefined}));
  /* Réglage de la difficulté (satire.js), à la fin du menu Goodies. */
  /* L'application s'appelle MacPain (sans « t ») : le premier article du menu aussi. */
  for (const item of MENUS[0].items) if (item.t) item.t = item.t.replace("MacPaint", "MacPain");
  /* Le niveau de difficulté se change par le menu du fruit (en haut à gauche) et par Goodies. */
  if (typeof Satire !== "undefined" && Satire.difficulty) for (const k of [0, 3]) {
    const items = MENUS[k].items;
    if (!items[items.length - 1].sep) items.push({sep:true});      // pas de double filet
    items.push({t:"Difficulty...",cmd:"difficulty"});
  }

  function menuItems(mi) {
    const m = MENUS[mi];
    if (m.dynamic === "fonts") {
      return FONTS.map(function (f) {
        return { t: f.name, cmd: "font:" + f.name, font: "Chicago", check: function () { return fontName === f.name; } };
      });
    }
    if (m.dynamic === "sizes") {
      return SIZES.map(function (s) {
        return { t: s===9?"9 point":String(s), cmd: "size:" + s, check: function () { return fontSize === s; } };
      });
    }
    if (m.dynamic === "styles") {
      return CLASSIC.menus[6].items.map(it=>it.text==="-"?{sep:true}:{t:it.text,k:it.key,
        cmd:it.text.startsWith("Align ")?"align:"+it.text.slice(6).toLowerCase():"style:"+it.text.toLowerCase(),
        check:()=>it.text.startsWith("Align ")?alignment===it.text.slice(6).toLowerCase():it.text==="Plain"?styles.size===0:styles.has(it.text.toLowerCase())});
    }

    return m.items;
  }

  function menuLayout(mi) {
    const items = menuItems(mi);
    let w = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].sep) continue;
      const fam = items[i].font || "Chicago";
      const tw = textWidth(items[i].t, fam, 12) + (items[i].k ? 26 + textWidth(items[i].k, "Chicago", 12) : 0);
      w = Math.max(w, tw);
    }
    w += 32;
    let h = 4;
    for (let i = 0; i < items.length; i++) h += items[i].sep ? 7 : 16;
    return { w: w, h: h, items: items, x: MENUS[mi].x, y: MENUBAR };
  }

  function drawMenu() {
    const L = menuLayout(menuOpen);
    let x = L.x;
    if (x + L.w > SW) x = SW - L.w;
    /* ombre tramée */
    for (let j = 0; j < L.h; j += 2)
      for (let i = 2; i < L.w + 2; i += 2) ctx.fillRect(x + i, MENUBAR + 3 + j, 1, 1);
    fill(x, MENUBAR, L.w, L.h, "#fff");
    ctx.strokeStyle = "#000";
    ctx.strokeRect(x + 0.5, MENUBAR + 0.5, L.w - 1, L.h - 1);
    // Classic MENU border is one pixel, not a double frame.

    let y = MENUBAR + 2;
    for (let i = 0; i < L.items.length; i++) {
      const it = L.items[i];
      if (it.sep) {
        fill(x + 8, y + 3, L.w - 16, 1, "#000");
        y += 7;
        continue;
      }
      const fam = it.font || "Chicago";
      const dis = it.disabled;
      if (it.check && it.check()) drawBitmap(CHECK, x + 8, y + 4);
      drawText(it.t, x + 24, y + 12, fam, 12, false, false, { dither: dis });
      if (it.k) drawText("⌘"+it.k, x + L.w - 10 - textWidth("⌘"+it.k, "Chicago", 12), y + 12, "Chicago", 12, false, false, { dither: dis });
      it._rect = { x: x, y: y, w: L.w, h: 16 };
      y += 16;
    }
    const hover=L.items[menuHover];
    if(hover&&hover._rect&&!hover.disabled) {
      const r=hover._rect,im=ctx.getImageData(r.x+1,r.y,r.w-2,r.h);
      for(let i=0;i<im.data.length;i+=4){im.data[i]=255-im.data[i];im.data[i+1]=255-im.data[i+1];im.data[i+2]=255-im.data[i+2];}
      ctx.putImageData(im,r.x+1,r.y);
    }
    L.x = x;
    MENUS[menuOpen]._layout = L;
  }

  /* ---------------------------------------------------------------- *
   *  12. Dialogues
   * ---------------------------------------------------------------- */
  function openDialog(d) {
    dialog = d;
    render();
  }
  function closeDialog() {
    dialog = null;
    render();
  }

  function drawDialog() {
    const d = dialog;
    const w = d.w || 320;
    const h = d.h || 120;
    const x = Math.round((SW - w) / 2), y = Math.round((SH - h) / 2);
    for (let j = 0; j < h; j += 2)
      for (let i = 2; i < w + 2; i += 2) ctx.fillRect(x + i, y + j + 2, 1, 1);
    fill(x, y, w, h, "#fff");
    ctx.strokeStyle = "#000";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
    d._rect = { x: x, y: y, w: w, h: h };

    let ty = y + 22;
    for (let i = 0; i < d.lines.length; i++) {
      const l = d.lines[i];
      if (typeof l === "string") {
        drawText(l, x + 18, ty, "Geneva", 12);
        ty += 16;
      } else {
        drawText(l.t, x + (l.x || 18), ty, l.font || "Geneva", l.size || 12, !!l.bold);
        ty += l.gap || 16;
      }
    }

    if (d.buttons && d.buttons.length) {
      const bw = 64, bh = 20, gap = 16;
      const total = d.buttons.length * bw + (d.buttons.length - 1) * gap;
      let bx = x + Math.round((w - total) / 2);
      const by = y + h - 30;
      for (let i = 0; i < d.buttons.length; i++) {
        const b = d.buttons[i];
        fill(bx, by, bw, bh, "#fff");
        ctx.strokeStyle = "#000";
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        if (b.def) { ctx.strokeRect(bx + 2.5, by + 2.5, bw - 5, bh - 5); }
        drawText(b.label, bx + Math.round((bw - textWidth(b.label, "Chicago", 12)) / 2), by + 14, "Chicago", 12);
        b._rect = { x: bx, y: by, w: bw, h: bh };
        bx += bw + gap;
      }
    }
  }

  /* ---------------------------------------------------------------- *
   *  13. Commandes
   * ---------------------------------------------------------------- */
  const DOC_KEY = "macpaint.doc";
  const ABOUT = Object.freeze({title:"MacPain — pas tout à fait",paragraphs:Object.freeze([
    "Application inspirée très fortement de MacPaint d’Apple (1984).",
    "Une réinterprétation humoristique et non officielle. Le dessin reste sérieux ; le logiciel se réserve le droit de ne pas l’être.",
    "Au programme : rires, encouragements et mauvaise foi. Aucun talent n’est requis pour être applaudi.",
    "Partiellement designé et imaginé par Étienne Mineur.",
    "10 novembre 2026."
  ])});

  function cmd(name) {
    menuOpen = -1;
    if (NATIVE && NATIVE.takes(name)) return;                    // quitter, imprimer : commandes du système
    if (name.indexOf("align:")===0) {alignment=name.slice(6);textRender();render();return;}
    if (name.indexOf("font:") === 0) { fontName = name.slice(5); textRender(); render(); return; }
    if (name.indexOf("size:") === 0) { fontSize = parseInt(name.slice(5), 10); textRender(); render(); return; }
    if (name.indexOf("style:") === 0) {
      style=name.slice(6);
      if(style==="plain") styles.clear();else if(styles.has(style))styles.delete(style);else styles.add(style);
      textRender();render();return;
    }

    switch (name) {
      case "about": {
        const lines=[{t:ABOUT.title,font:"Chicago",size:12,gap:24}];
        for(const paragraph of ABOUT.paragraphs){
          let line="";
          for(const word of paragraph.split(" ")){
            const next=line?line+" "+word:word;
            if(line&&textWidth(next,"Geneva",12)>410){lines.push({t:line,gap:16});line=word;}else line=next;
          }
          lines.push({t:line,gap:22});
        }
        openDialog({w:450,h:52+lines.reduce((n,l)=>n+l.gap,0),lines,
          buttons:[{label:"OK",cmd:"close",def:true}]});
        return;
      }

      case "closeDocument": textCommit();selCommit();saveLocal();documentOpen=false;helpPage=null;showPage=false;render();return;
      case "showpage": showPage=!showPage;render();return;
      case "difficulty": Satire.difficulty.choose();return;
      case "intro": helpPage="intro";render();return;
      case "shortcuts": helpPage="shortcuts";render();return;
      case "catalog":
        openDialog({w:370,h:140,lines:["Print Catalog — web adaptation", "A browser cannot read a Macintosh disk", "catalog. Use Open… and Save… for PNG files."],buttons:[{label:"OK",cmd:"close",def:true}]});return;
      case "calculator":
        openDialog({ w: 300, h: 110, lines: ["The desk accessory calculator", "is not part of this replica."], buttons: [{ label: "OK", cmd: "close", def: true }] });
        return;

      case "new":
        if (!touchMode && !newConfirmed && typeof Satire !== "undefined" && Satire.traps && doc.some(function (v) { return v; })
            && Satire.traps.confirmNew(function () { newConfirmed = true; cmd("new"); newConfirmed = false; })) return;
        documentOpen=true;textCommit();helpPage=null;showPage=false;
        pushUndo();
        doc.fill(0);
        textLayers.length = 0; selectedText = null; renderTextLayers();
        sel = null;
        view.x = view.y = 0;
        scheduleSave();
        cheer("new");
        render();
        return;

      case "open": {
        const f = document.getElementById("file");
        f.value = "";
        f.click();
        return;
      }

      case "close":
        closeDialog();
        return;

      case "save":
      case "saveAs": {
        const go = function () { exportPNG(); cheer("save"); };
        if (typeof Satire !== "undefined" && Satire.traps && !touchMode) Satire.traps.gate(go); else go();   // conditions générales aux niveaux 4 et 5
        return;
      }

      case "revert":
        if (loadLocal()) render();
        return;

      case "pagesetup":
        openDialog({
          w: 330, h: 130,
          lines: ["Page Setup", "", "Page: 8 × 10 inches, 576 × 720 pixels,", "72 dots per inch."],
          buttons: [{ label: "OK", cmd: "close", def: true }]
        });
        return;

      case "print": {
        const w = window.open("", "_blank");
        if (!w) return;
        syncDoc();
        const url = docCanvas.toDataURL("image/png");
        w.document.write('<title>MacPain</title><img src="' + url + '" style="image-rendering:pixelated;width:576px">');
        w.document.close();
        setTimeout(function () { w.focus(); w.print(); }, 300);
        return;
      }

      case "png":
      case "import": {
        const f = document.getElementById("file");
        f.value = "";
        f.click();
        return;
      }

      case "quit":
        openDialog({
          w: 330, h: 120,
          lines: ["Quit MacPain and return to the Desktop?", "", "The sheet is kept in the browser."],
          buttons: [{ label: "Annuler", cmd: "close" }, { label: "Quitter", cmd: "reallyquit", def: true }]
        });
        return;

      case "reallyquit":
        dialog = null;
        saveLocal();
        fill(0, 0, SW, SH, "#fff");
        ctx.fillStyle = "#000";
        drawText("Goodbye.", 224, 180, "Geneva", 12);
        return;

      case "undo": requestUndo(); return;
      case "copy": doCopy(); return;
      case "cut": doCut(); return;
      case "paste": doPaste(); return;

      case "clearSel":
        if (sel) {
          pushUndo();
          for (let j = 0; j < sel.h; j++)
            for (let i = 0; i < sel.w; i++)
              if (selContains(sel.x + i, sel.y + j)) doc[(sel.y + j) * DW + sel.x + i] = 0;
          sel.data = null;
          scheduleSave(); render();
        }
        return;

      case "invert":
        selApply(function (src) { for (let i = 0; i < src.length; i++) src[i] ^= 1; });
        return;

      case "fill":
        selApply(function (src, b) {
          for (let j = 0; j < b.h; j++)
            for (let i = 0; i < b.w; i++)
              src[j * b.w + i] = pat(b.x + i, b.y + j);
        });
        return;

      case "trace": {
        selApply(function (src, b) {
          const out = new Uint8Array(src.length);
          const at = function (i, j) { return (i >= 0 && j >= 0 && i < b.w && j < b.h) ? src[j * b.w + i] : 0; };
          for (let j = 0; j < b.h; j++)
            for (let i = 0; i < b.w; i++) {
              if (!src[j * b.w + i]) continue;
              if (!at(i - 1, j) || !at(i + 1, j) || !at(i, j - 1) || !at(i, j + 1)) out[j * b.w + i] = 1;
            }
          src.set(out);
        });
        return;
      }

      case "fliph":
        selApply(function (src, b) {
          for (let j = 0; j < b.h; j++)
            for (let i = 0; i < b.w / 2; i++) {
              const a = j * b.w + i, c = j * b.w + (b.w - 1 - i);
              const t = src[a]; src[a] = src[c]; src[c] = t;
            }
        });
        return;

      case "flipv":
        selApply(function (src, b) {
          for (let j = 0; j < b.h / 2; j++)
            for (let i = 0; i < b.w; i++) {
              const a = j * b.w + i, c = (b.h - 1 - j) * b.w + i;
              const t = src[a]; src[a] = src[c]; src[c] = t;
            }
        });
        return;

      case "rotate": {
        const b = sel ? { x: sel.x, y: sel.y, w: sel.w, h: sel.h } : { x: 0, y: 0, w: DW, h: DH };
        pushUndo();
        const out = new Uint8Array(b.w * b.h);
        for (let j = 0; j < b.h; j++)
          for (let i = 0; i < b.w; i++) {
            const X = b.x + i, Y = b.y + j;
            const v = (X >= 0 && Y >= 0 && X < DW && Y < DH) ? doc[Y * DW + X] : 0;
            out[i * b.h + (b.h - 1 - j)] = v;
          }
        /* effacer l'ancienne zone, puis écrire la zone tournée */
        for (let j = 0; j < b.h; j++)
          for (let i = 0; i < b.w; i++) {
            const X = b.x + i, Y = b.y + j;
            if (X >= 0 && Y >= 0 && X < DW && Y < DH) doc[Y * DW + X] = 0;
          }
        const nw = b.h, nh = b.w;
        for (let j = 0; j < nh; j++)
          for (let i = 0; i < nw; i++) {
            const X = b.x + i, Y = b.y + j;
            if (X >= 0 && Y >= 0 && X < DW && Y < DH) doc[Y * DW + X] = out[j * nw + i];
          }
        if (sel) sel = { x: b.x, y: b.y, w: nw, h: nh, mask: null, data: null };
        scheduleSave(); render();
        return;
      }

      case "patinv":
        for (let i = 0; i < 64; i++) PAT[pattern][i] ^= 1;
        render();
        return;

      case "patclear":
        PAT[pattern].fill(0);
        render();
        return;

      case "fatbits": {
        const centre = screenToDoc(mouse.x, mouse.y);
        fatBits = !fatBits;
        zoom = fatBits ? 8 : 1;
        const v = viewWH();
        view.x = Math.max(0, Math.min(DW - v.w, centre.x - Math.floor(v.w / 2)));
        view.y = Math.max(0, Math.min(DH - v.h, centre.y - Math.floor(v.h / 2)));
        clampView();
        render();
        return;
      }

      case "grid":
        gridOn = !gridOn;
        render();
        return;

      case "mirrors":
        mirror = (mirror + 1) % 4;
        render();
        return;

      case "brushshape":
        openDialog(brushDialog());
        return;

      case "editpattern":
        openDialog(patternDialog());
        return;

      case "resetpatterns":
        for (let i = 0; i < PAT.length; i++) PAT[i].set(PAT_DEF[i]);
        render();
        return;
    }
  }

  /* Enregistrement : PNG RGBA à pixels strictement noir/blanc, 576 × 720. */
  function exportPNG() {
    textCommit();
    selCommit();
    syncDoc();
    docCanvas.toBlob(function (b) {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "MacPain.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }, "image/png");
  }

  /* presse-papiers interne */
  function doCopy() {
    if (!sel) return;
    const b = selBounds();
    const d = new Uint8Array(b.w * b.h);
    for (let j = 0; j < b.h; j++)
      for (let i = 0; i < b.w; i++) {
        const X = b.x + i, Y = b.y + j;
        if (selContents(X, Y)) d[j * b.w + i] = doc[Y * DW + X];
      }
    clipboard = { w: b.w, h: b.h, data: d };
  }
  function selContents(X, Y) {
    if (!sel) return true;
    const i = X - sel.x, j = Y - sel.y;
    if (i < 0 || j < 0 || i >= sel.w || j >= sel.h) return false;
    return !sel.mask || sel.mask[j * sel.w + i] === 1;
  }
  function doCut() {
    doCopy();
    if (clipboard && sel) {
      pushUndo();
      for (let j = 0; j < sel.h; j++)
        for (let i = 0; i < sel.w; i++)
          if (selChars(i, j)) doc[(sel.y + j) * DW + sel.x + i] = 0;
      sel.data = null;
      scheduleSave(); render();
    }
  }
  function selChars(i, j) { return !sel.mask || sel.mask[j * sel.w + i] === 1; }
  function doPaste() {
    if (!clipboard) return;
    pushUndo();
    const x = Math.max(0, Math.min(DW - clipboard.w, sel ? sel.x : view.x + 8));
    const y = Math.max(0, Math.min(DH - clipboard.h, sel ? sel.y : view.y + 8));
    sel = { x: x, y: y, w: clipboard.w, h: clipboard.h, mask: null, data: clipboard.data.slice() };
    selCommit();
    scheduleSave(); render();
  }

  /* ---------------------------------------------------------------- *
   *  14. Dialogues secondaires
   * ---------------------------------------------------------------- */
  function brushDialog() {
    return {
      w: 320, h: 196,
      lines: [{ t: "Brush Shape", font: "Chicago", size: 12, bold: true, gap: 18 }],
      buttons: [{ label: "OK", cmd: "close", def: true }],
      brushes: true
    };
  }
  function patternDialog() {
    return {
      w: 372, h: 306,
      lines: [
        { t: "Edit Pattern", font: "Chicago", size: 12, bold: true, gap: 22 },
        { t: "Click a square, or pick a classic MacPaint pattern.", gap: 18 }
      ],
      buttons: [
        { label: "Invert", cmd: "patinv" },
        { label: "Clear", cmd: "patclear" },
        { label: "OK", cmd: "close", def: true }
      ],
      pattern: true
    };
  }

  /* ---------------------------------------------------------------- *
   *  15. Souris
   * ---------------------------------------------------------------- */
  function screenToDoc(x, y) {
    return { x: Math.floor(view.x + (x - VIEW.x) / zoom), y: Math.floor(view.y + (y - VIEW.y) / zoom) };
  }
  function inView(x, y) {
    return x >= VIEW.x && y >= VIEW.y && x < VIEW.x + VIEW.w && y < VIEW.y + VIEW.h;
  }

  let drag = null;
  let sprayTimer = null;

  function canvasPos(e) {
    const r = cv.getBoundingClientRect();
    if (APP.rot || APP.sc !== 1) {
      /* Fenêtre tournée ou redimensionnée (Nightmare!) : on ramène le clic dans le repère du
         canevas par la transformation inverse, autour du centre (qui est celui du cadre englobant). */
      const w = cv.offsetWidth, h = cv.offsetHeight, c = Math.cos(-APP.rot), n = Math.sin(-APP.rot);
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      rawPointer = { x: ((dx * c - dy * n) / APP.sc + w / 2) * SW / w, y: ((dx * n + dy * c) / APP.sc + h / 2) * SH / h };
    } else
    rawPointer = { x: (e.clientX - r.left) * SW / r.width, y: (e.clientY - r.top) * SH / r.height };
    return legoMap(rawPointer, e.type === "pointerdown");
  }

  cv.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const p = canvasPos(e);
    mouse.x = p.x; mouse.y = p.y;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { }

    if (dialog) { dialogClick(p); return; }
    if (menuOpen < 0) {                      // une case tombée reste un outil : on la choisit, elle rentre
      const fallen = bodyAt(rawPointer);
      if (fallen) { setTool(fallen); bodies[fallen].until = 0; return; }
    }

    /* barre de menus */
    if (p.y < MENUBAR) {
      for (let i = 0; i < MENUS.length; i++) {
        if (p.x >= MENUS[i].x - 2 && p.x < MENUS[i].x + MENUS[i].w) {
          menuOpen = (menuOpen === i) ? -1 : i;menuHover=-1;menuTrack=menuOpen>=0;
          render();
          return;
        }
      }
      menuOpen = -1; render();
      return;
    }
    if (menuOpen >= 0) {
      const L = MENUS[menuOpen]._layout;
      if (L && p.x >= L.x && p.x < L.x + L.w && p.y >= MENUBAR && p.y < MENUBAR + L.h) {
        for (let i = 0; i < L.items.length; i++) {
          const it = L.items[i];
          if (it._rect && p.y >= it._rect.y && p.y < it._rect.y + it._rect.h) {
            if (it.disabled) return;
            cmd(it.cmd);
            return;
          }
        }
        return;
      }
      menuOpen = -1;
      render();
      return;
    }

    if(p.x>=119&&p.x<499&&p.y>=299&&p.y<333) {
      const col=Math.floor((p.x-119)/20),row=p.y<317?0:1;
      pattern=PAT_SLOT[row*19+col];
      if(isDoublePat(pattern))cmd("editpattern");render();return;
    }
    if(p.x>=15&&p.x<69&&p.y>=257&&p.y<334&&!touchMode&&typeof Satire!=="undefined"&&Satire.traps&&Satire.traps.width(function(w){noOutline=false;lineWidth=[1,2,4,8].indexOf(w);render();}))return;
    if(p.x>=15&&p.x<69&&p.y>=257&&p.y<334){noOutline=p.y<273;if(!noOutline)lineWidth=p.y<286?0:p.y<298?1:p.y<312?2:3;render();return;}
    if(p.x>=85&&p.x<98&&p.y>=32&&p.y<45){cmd("closeDocument");return;}
    /* palette */
    if (p.x >= PAL_X && p.x < PAL_X + PAL_W && p.y >= PAL_Y && p.y < PAL_Y + PAL_H) { paletteClick(p); return; }

    /* barres de défilement */
    if(showPage) {showPage=false;render();return;}

    /* zone de dessin */
    if (!documentOpen)return;
    if (!inView(p.x, p.y)) return;
    const d = screenToDoc(p.x, p.y);
    if (d.x < 0 || d.y < 0 || d.x >= DW || d.y >= DH) {
      if (tool !== "marquee" && tool !== "lasso") return;
    }
    startTool(d, e);
  });

  cv.addEventListener("pointermove", function (e) {
    const p = canvasPos(e);
    mouse.x = p.x; mouse.y = p.y; mouse.in = true;
    if (drag) { headingFollow(e); moveTool(p, e); return; }
    const over = cellAt(p);
    if ((over ? over.tool : null) !== hoverCell) {
      hoverCell = over ? over.tool : null;
      if (hoverCell && hoverCell !== tool && menuOpen < 0 && !dialog) {
        kickCell(hoverCell, -45, 0);
        moveSnd("hop");
        // Palier 4 : une fois sur trois, la case visée se sauve chez une voisine.
        if (legoLevel >= 4 && Math.random() < 0.33) { swapCells(hoverCell); hoverCell = null; }
      }
    }
    if (menuOpen >= 0) {
      /* survol : change de menu ouvert */
      if (p.y < MENUBAR) {
        for (let i = 0; i < MENUS.length; i++) {
          if (p.x >= MENUS[i].x - 2 && p.x < MENUS[i].x + MENUS[i].w && i !== menuOpen) {
            menuOpen = i;menuHover=-1;render();return;
          }
        }
      }
      const L=MENUS[menuOpen]._layout;
      const index=L?L.items.findIndex(it=>it._rect&&p.x>=it._rect.x&&p.x<it._rect.x+it._rect.w&&p.y>=it._rect.y&&p.y<it._rect.y+it._rect.h):-1;
      if(index!==menuHover){menuHover=index;render();}
    }
    if (fatBits) render();
  });

  cv.addEventListener("pointerup", function (e) {
    if(menuTrack){
      menuTrack=false;
      const item=menuOpen>=0&&MENUS[menuOpen]._layout&&MENUS[menuOpen]._layout.items[menuHover];
      if(item&&!item.disabled&&item.cmd)cmd(item.cmd);
    }
    if (drag) endTool(e);
  });
  cv.addEventListener("pointercancel", function (e) { if (drag) endTool(e); });

  /* Filet : si le relâchement a lieu hors de la toile (fenêtre quittée, capture
     de pointeur perdue), le glisser resterait ouvert et les outils sembleraient
     tous morts, pinceau compris. On ferme le glisser dès que le pointeur est
     relâché n'importe où, ou que la fenêtre perd le focus. */
  window.addEventListener("pointerup", function () { if (drag) endTool(); });
  window.addEventListener("pointercancel", function () { if (drag) endTool(); });
  window.addEventListener("blur", function () { if (drag) endTool(); });

  function paletteClick(p) {
    const cell=cellAt(p);
    if(cell){setTool(cell.tool);return;}
  }


  let fillShapes = false;              // formes pleines (double-clic sur l'outil)
  let lastPat = { i: -1, t: 0 };
  let lastTool = { i: -1, t: 0 };
  function isDoubleTool(i) {
    const now = Date.now();
    const dbl = lastTool.i === i && now - lastTool.t < 420;
    lastTool = { i: i, t: now };
    return dbl;
  }
  function isDoublePat(i) {
    const now = Date.now();
    const double = lastPat.i === i && now - lastPat.t < 420;
    lastPat = { i: i, t: now };
    return double;
  }

  function scrollClick(p) {
    const v = viewWH();
    const g = scrollGeom();
    if (p.x >= g.bx) {
      const page = Math.round(v.h * 0.9);
      if (p.y < g.trackY) view.y = Math.max(0, view.y - 16);
      else if (p.y >= g.by - 11) view.y = Math.min(DH - v.h, view.y + 16);
      else if (p.y >= g.ty && p.y < g.ty + g.thumbH) drag = { kind: "scrollY", y0: p.y, v0: view.y };
      else if (p.y < g.ty) view.y = Math.max(0, view.y - page);
      else view.y = Math.min(DH - v.h, view.y + page);
    } else {
      if (p.x < g.trackX) view.x = Math.max(0, view.x - 16);
      else if (p.x >= g.bx - 11) view.x = Math.min(DW - v.w, view.x + 16);
      else if (p.x >= g.tx && p.x < g.tx + g.thumbW) drag = { kind: "scrollX", x0: p.x, v0: view.x };
      else if (p.x < g.tx) view.x = Math.max(0, view.x - Math.round(v.w * 0.9));
      else view.x = Math.min(DW - v.w, view.x + Math.round(v.w * 0.9));
    }
    clampView();
    render();
  }

  function setTool(t) {
    helpPage=null;
    textCommit();
    selCommit();
    if (t === "eraser") eraserSize = 8;
    tool = t;
    if (!touchMode) { selectSnd(t); kickToolBounce(t); }
    cv.style.cursor = t === "text" ? "text" : (t === "spray" ? "crosshair" : "crosshair");
    render();
  }

  /* ---------------------------------------------------------------- *
   *  16. Outils
   * ---------------------------------------------------------------- */
  function startTool(d, e) {
    strokeA = { x: d.x, y: d.y }; strokeB = strokeA;
    if (textState.active) textCommit();
    if(tool==="hand") {drag={kind:"pan",x:mouse.x,y:mouse.y,vx:view.x,vy:view.y};return;}
    if(tool.startsWith("polygon")) {polygonClick(d);return;}
    if(tool.startsWith("freeform")) {loopSnd(tool);working=true;workTime=0;startAnim();pushUndo();drag={kind:"freeform",pts:[d],snap:doc.slice(),filled:tool.endsWith("Fill")};return;}


    if (tool === "marquee" || tool === "lasso") {
      if (sel && selContains(d.x, d.y)) {
        selLift();
        drag = { kind: "moveSel", ax: d.x, ay: d.y, selx: sel.x, sely: sel.y };
        return;
      }
      sel = null;
      if (tool === "marquee") {
        drag = { kind: "marquee", x0: d.x, y0: d.y };
      } else {
        drag = { kind: "lasso", pts: [d], snap: doc.slice() };
      }
      render();
      return;
    }

    if (tool === "text") {
      /* Calque de texte : cliquer un texte le sélectionne et le déplace ; un second
         clic sur le même texte le réédite ; cliquer ailleurs crée un nouveau texte. */
      const hit = textLayerAt(d.x, d.y);
      if (hit) {
        if (selectedText === hit.id) { editTextLayerById(hit.id); return; }
        selectedText = hit.id;
        drag = { kind: "moveText", id: hit.id, lx: hit.x, ly: hit.y, ax: d.x, ay: d.y, undoed: false };
        render(); return;
      }
      selectedText = null;
      textBegin(d.x, d.y); return;
    }

    if (tool === "bucket") {
      pushUndo();
      floodFill(d.x, d.y);
      cheer("fill");
      scheduleSave();
      render();
      return;
    }

    loopSnd(tool);
    working = true; workTime = 0;
    startAnim();
    pushUndo();
    drag = { kind: "paint", last: d, start: d, snap: doc.slice() };

    if (tool === "pencil") {drag.ink=1-doc[d.y*DW+d.x];px(d.x,d.y,drag.ink);}
    else if (tool === "eraser") eraseAt(d.x, d.y);
    else if (tool === "brush") brushAt(d.x, d.y);
    else if (tool === "spray") {
      sprayAt(d.x, d.y);
      sprayTimer = setInterval(function () { sprayAt(drag.last.x, drag.last.y); render(); }, 40);
    } else if (tool === "line" || tool === "rect" || tool === "rrect" || tool === "oval") {
      /* aperçu géré dans moveTool */
    }
    render();
  }

  /* Ultra-Violence : la gomme s'use. Elle perd un pixel de côté à chaque coup
     (de 8 à 2) et, une fois entamée, laisse des miettes. Reprendre la gomme
     dans la palette en donne une neuve. */
  let eraserSize = 8;
  function ultra() { return typeof Satire !== "undefined" && Satire.difficulty && Satire.difficulty.get() === 3; }
  function eraseAt(x, y) {
    const n = ultra() ? eraserSize : 8, o = Math.floor((n - 1) / 2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) px(x - o + i, y - o + j, 0);
    if (n < 8 && Math.random() < 0.035) {
      const cx = x - o - 2 + Math.floor(Math.random() * (n + 4)), cy = y - o - 2 + Math.floor(Math.random() * (n + 4));
      if (cx >= 0 && cy >= 0 && cx < DW && cy < DH && !doc[cy * DW + cx]) {
        px(cx, cy, 1); crumbs.push(cx, cy);                      // une miette, à chasser en soufflant dans le micro
        if (Satire.traps && Satire.traps.crumbs) Satire.traps.crumbs(blowCrumbs);
      }
    }
  }
  const crumbs = [];
  function blowCrumbs() {
    for (let i = 0; i < crumbs.length; i += 2) px(crumbs[i], crumbs[i + 1], 0);
    crumbs.length = 0;
    scheduleSave(); render();
  }

  /* Niveau 2 (Hey, Not Too Rough) : le pot de peinture est un vrai pot. Tant qu'il
     est l'outil choisi, pencher l'iPhone de plus de 22° renverse l'encre : elle
     envahit la feuille par le côté vers lequel on penche, d'autant plus vite que
     l'on penche. Un seul cran d'annulation pour tout le dégât. */
  let tiltRest = null, spill = 0, spillSide = "", spillSaved = false;
  window.addEventListener("deviceorientation", function (e) {
    const on = typeof Satire !== "undefined" && Satire.difficulty && Satire.difficulty.get() === 2 && tool === "bucket" && e.gamma !== null && e.beta !== null && documentOpen && !drag;
    if (!on) { tiltRest = null; spill = 0; spillSide = ""; spillSaved = false; return; }
    if (!tiltRest) { tiltRest = { b: e.beta, g: e.gamma }; return; }                 // position de repos : celle du moment où l'on prend le pot
    const dg = e.gamma - tiltRest.g, db = e.beta - tiltRest.b, lean = Math.max(Math.abs(dg), Math.abs(db));
    if (lean < 22) return;
    const side = Math.abs(dg) >= Math.abs(db) ? (dg > 0 ? "right" : "left") : (db > 0 ? "bottom" : "top");
    if (side !== spillSide) { spillSide = side; spill = 0; }
    if (!spillSaved) { pushUndo(); spillSaved = true; cheer("fill"); }
    const before = spill;
    spill = Math.min(1, spill + (lean - 22) * 0.00022);
    const across = side === "left" || side === "right", size = across ? DW : DH, a = Math.floor(before * size), z = Math.floor(spill * size);
    for (let k = a; k < z; k++) {
      // front irrégulier : l'encre coule, elle n'avance pas en ligne droite
      for (let j = 0; j < (across ? DH : DW); j++) {
        const reach = k + Math.round(Math.sin(j / 23) * 5 + Math.sin(j / 7) * 2);
        const pos = Math.max(0, Math.min(size - 1, reach));
        if (across) px(side === "right" ? DW - 1 - pos : pos, j, 1); else px(j, side === "bottom" ? DH - 1 - pos : pos, 1);
      }
    }
    if (z > a) { scheduleSave(); render(); }
  });

  function sprayAt(x, y) {
    const r = 7 + lineWidth * 2;
    for (let n = 0; n < 10; n++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      px(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 1);
    }
  }

  function sprayPath(a, b) {
    // Deposit along skipped pointer positions, never restore a shape preview.
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.ceil(distance / 4);
    for (let i = 1; i <= steps; i++) {
      sprayAt(Math.round(a.x + (b.x - a.x) * i / steps),
              Math.round(a.y + (b.y - a.y) * i / steps));
    }
  }

  function moveTool(p, e) {
    const d = screenToDoc(p.x, p.y);
    strokeB = d;
    if(drag.kind==="pan") {view.x=Math.round(drag.vx-(p.x-drag.x)/zoom);view.y=Math.round(drag.vy-(p.y-drag.y)/zoom);clampView();render();return;}
    if(drag.kind==="freeform") {drag.pts.push(d);doc.set(drag.snap);paintClosed(drag.pts,drag.filled);render();return;}
    if (drag.kind === "scrollY") {
      const v = viewWH();
      const range = VIEW.h - Math.max(16, Math.round(VIEW.h * v.h / DH));
      view.y = Math.round(drag.v0 + (p.y - drag.y0) / Math.max(1, range) * (DH - v.h));
      clampView(); render(); return;
    }
    if (drag.kind === "scrollX") {
      const v = viewWH();
      const range = VIEW.w - Math.max(16, Math.round(VIEW.w * v.w / DW));
      view.x = Math.round(drag.v0 + (p.x - drag.x0) / Math.max(1, range) * (DW - v.w));
      clampView(); render(); return;
    }
    if (drag.kind === "marquee") {
      const x0 = Math.min(drag.x0, d.x), y0 = Math.min(drag.y0, d.y);
      const w = Math.abs(d.x - drag.x0) + 1, h = Math.abs(d.y - drag.y0) + 1;
      if (d.x < 0 || d.y < 0 || d.x >= DW || d.y >= DH) { /* garder */ }
      sel = { x: x0, y: y0, w: w, h: h, mask: null, data: null };
      render(); return;
    }
    if (drag.kind === "lasso") {
      const last = drag.pts[drag.pts.length - 1];
      if (d.x !== last.x || d.y !== last.y) drag.pts.push(d);
      render();
      return;
    }
    if (drag.kind === "moveSel") {
      sel.x = drag.selx + (d.x - drag.ax);
      sel.y = drag.sely + (d.y - drag.ay);
      render(); return;
    }
    if (drag.kind === "moveText") {
      if (!drag.undoed) { pushUndo(); drag.undoed = true; }
      const layer = textLayers.find(function (l) { return l.id === drag.id; });
      if (layer) { layer.x = drag.lx + (d.x - drag.ax); layer.y = drag.ly + (d.y - drag.ay); renderTextLayers(); }
      render(); return;
    }
    if (drag.kind === "paint") {
      const last = drag.last;
      if (tool === "pencil") line(last.x, last.y, d.x, d.y, 1, drag.ink);
      else if (tool === "brush") brushPath(last, d);
      else if (tool === "eraser") erasePath(last, d);
      else if (tool === "spray") sprayPath(last, d);
      else {
        doc.set(drag.snap);
        const kind=tool.replace(/Fill$/, ""),filled=tool.endsWith("Fill");
        if (tool === "line") line(drag.start.x, drag.start.y, d.x, d.y, outlineWidth(), 1);
        else if (kind === "rect") rectShape(drag.start.x, drag.start.y, d.x, d.y, outlineWidth(), filled);
        else if (kind === "rrect") rrectShape(drag.start.x, drag.start.y, d.x, d.y, outlineWidth(), filled);
        else if (kind === "oval") ovalShape(drag.start.x, drag.start.y, d.x, d.y, outlineWidth(), filled);
      }
      drag.last = d;
      render();
    }
  }

  function brushPath(a, b) {
    let dx = Math.abs(b.x - a.x), dy = -Math.abs(b.y - a.y);
    const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
    let err = dx + dy, x = a.x, y = a.y;
    for (;;) {
      brushAt(x, y);
      if (x === b.x && y === b.y) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  function erasePath(a, b) {
    let dx = Math.abs(b.x - a.x), dy = -Math.abs(b.y - a.y);
    const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
    let err = dx + dy, x = a.x, y = a.y;
    for (;;) {
      eraseAt(x, y);
      if (x === b.x && y === b.y) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  function paintClosed(pts,filled) {
    if(pts.length<2)return;
    if(filled) {
      const minY=Math.max(0,Math.min(...pts.map(p=>p.y))),maxY=Math.min(DH-1,Math.max(...pts.map(p=>p.y)));
      for(let y=minY;y<=maxY;y++) {
        const hits=[];
        for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];if((a.y>y)!==(b.y>y))hits.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y));}
        hits.sort((a,b)=>a-b);for(let i=0;i+1<hits.length;i+=2)for(let x=Math.max(0,Math.ceil(hits[i]));x<=Math.min(DW-1,Math.floor(hits[i+1]));x++)px(x,y,pat(x,y));
      }
    }
    if(!noOutline)for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];line(a.x,a.y,b.x,b.y,outlineWidth(),1);}
  }
  function polygonClick(d) {
    if(!polygonPoints){tickSnd("vertex");kickCell(tool,-70,0);pushUndo();polygonPoints={pts:[d],base:doc.slice(),filled:tool.endsWith("Fill")};return;}
    const first=polygonPoints.pts[0],last=polygonPoints.pts[polygonPoints.pts.length-1];
    const finish=polygonPoints.pts.length>=3&&((Math.abs(d.x-first.x)+Math.abs(d.y-first.y)<6)||(Math.abs(d.x-last.x)+Math.abs(d.y-last.y)<3));
    if(!finish){polygonPoints.pts.push(d);tickSnd("vertex");kickCell(tool,-70,0);}
    doc.set(polygonPoints.base);paintClosed(polygonPoints.pts,polygonPoints.filled);render();
    if(finish){polygonPoints=null;scheduleSave();cheer("draw");}
  }
  function drawPageOverview() {
    fill(VIEW.x,VIEW.y,VIEW.w,VIEW.h,"#fff");ctx.imageSmoothingEnabled=false;
    const k=Math.min((VIEW.w-8)/DW,(VIEW.h-8)/DH);
    ctx.drawImage(docCanvas,VIEW.x+Math.floor((VIEW.w-DW*k)/2),VIEW.y+4,Math.floor(DW*k),Math.floor(DH*k));
  }

  function endTool() {
    if (sprayTimer) { clearInterval(sprayTimer); sprayTimer = null; }
    if (!drag) return;
    if (drag.kind === "lasso") {
      sel = lassoToSelection(drag.pts);
      doc.set(drag.snap);
    }
    if (drag.kind === "marquee" && sel && (sel.w < 2 || sel.h < 2)) sel = null;
    if (drag.kind === "moveSel") selCommit();
    if (drag.kind === "paint" || drag.kind === "freeform") {
      loopStopSnd();
      working = false;
      if (drag.kind === "paint" && (tool === "line" || tool === "rect" || tool === "rrect" || tool === "oval")) tickSnd("shape");
      if (tool === "eraser" && ultra()) eraserSize = Math.max(2, eraserSize - 1);
      const ends = strokeA && strokeB ? { a: strokeA, b: strokeB } : null;
      if (undoArmed && ends && lastEnds) {
        undoArmed = false;
        const near = function (p, q) { return Math.hypot(p.x - q.x, p.y - q.y) < 30; };
        if (near(ends.a, lastEnds.b) && near(ends.b, lastEnds.a)) {       // bien retracé : le trait de contrôle et le trait visé disparaissent
          drag = null; lastEnds = null;
          undo(); undo();
          return;
        }
        if (Satire.traps && Satire.traps.note) Satire.traps.note("Raté : ce n’était pas le même trait. Il reste là, lui aussi.");
      }
      lastEnds = ends;
      cheer(tool === "eraser" ? "erase" : "draw");
    }
    drag = null;
    scheduleSave();
    render();
  }

  function lassoToSelection(pts) {
    if (!pts || pts.length < 3) return null;
    let x0 = DW, y0 = DH, x1 = 0, y1 = 0;
    for (let i = 0; i < pts.length; i++) {
      x0 = Math.min(x0, pts[i].x); y0 = Math.min(y0, pts[i].y);
      x1 = Math.max(x1, pts[i].x); y1 = Math.max(y1, pts[i].y);
    }
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(DW - 1, x1); y1 = Math.min(DH - 1, y1);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w < 2 || h < 2) return null;
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const xs = [];
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length];
        if ((a.y <= y0 + y) !== (b.y <= y0 + y))
          xs.push(a.x + ((y0 + y - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
      xs.sort(function (a, b) { return a - b; });
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) {
          const mx = x - x0;
          if (mx >= 0 && mx < w) mask[y * w + mx] = 1;
        }
    }
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length];
      let dx = Math.abs(b.x - a.x), dy = -Math.abs(b.y - a.y);
      const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
      let err = dx + dy, x = a.x, y = a.y;
      for (;;) {
        const mx = x - x0, my = y - y0;
        if (mx >= 0 && my >= 0 && mx < w && my < h) mask[my * w + mx] = 1;
        if (x === b.x && y === b.y) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x += sx; }
        if (e2 <= dx) { err += dx; y += sy; }
      }
    }
    return { x: x0, y: y0, w: w, h: h, mask: mask, data: null };
  }

  /* ---------------------------------------------------------------- *
   *  17. Clavier
   * ---------------------------------------------------------------- */
  window.addEventListener("keydown", function (e) {
    if (e.target && e.target.closest && e.target.closest("[data-macpaint-controls]")) return;
    const meta = e.metaKey || e.ctrlKey;

    if (dialog) {
      if (e.key === "Escape") { closeDialog(); e.preventDefault(); }
      else if (e.key === "Enter") {
        const b = dialog.buttons && dialog.buttons.find(function (x) { return x.def; });
        closeDialog();
        if (b && b.cmd && b.cmd !== "close") cmd(b.cmd);
        e.preventDefault();
      }
      return;
    }

    if(e.key==="Enter"&&polygonPoints){paintClosed(polygonPoints.pts,polygonPoints.filled);polygonPoints=null;scheduleSave();render();return;}
    if (e.key === "Escape") {
      if(polygonPoints){doc.set(polygonPoints.base);polygonPoints=null;render();return;}
      if (menuOpen >= 0) { menuOpen = -1; render(); }
      else if (textState.active) textCommit();
      else if (sel) { sel = null; render(); }
      e.preventDefault();
      return;
    }

    if (meta && !e.altKey) {
      const k = e.key.toLowerCase();
      if(textState.active) {
        const styleKey={p:"plain",b:"bold",i:"italic",u:"underline",o:"outline",s:"shadow"};
        const alignKey={l:"left",m:"middle",r:"right"};
        if(styleKey[k]) {cmd("style:"+styleKey[k]);e.preventDefault();return;}
        if(alignKey[k]) {cmd("align:"+alignKey[k]);e.preventDefault();return;}
      }
      if(k==="e"){cmd("trace");e.preventDefault();return;}
      if (k === "z") { e.shiftKey ? redo() : undo(); e.preventDefault(); return; }
      if (k === "x") { doCut(); e.preventDefault(); return; }
      if (k === "c") { doCopy(); e.preventDefault(); return; }
      if (k === "v") { doPaste(); e.preventDefault(); return; }
      if (k === "s") { cmd("save"); e.preventDefault(); return; }
      if (k === "o") { cmd("open"); e.preventDefault(); return; }
      if (k === "n") { cmd("new"); e.preventDefault(); return; }
      if (k === "p") { cmd("print"); e.preventDefault(); return; }
      if (k === "i") { cmd("invert"); e.preventDefault(); return; }
      if (k === "b") { cmd("fatbits"); e.preventDefault(); return; }
      if (k === "a") { sel = { x: 0, y: 0, w: DW, h: DH, mask: null, data: null }; render(); e.preventDefault(); return; }
    }

    if (textState.active) {
      if (e.key === "Backspace") { textBackspace(); e.preventDefault(); return; }
      if (e.key === "Enter") {
        textState.lines.splice(textState.li + 1, 0, textState.lines[textState.li].slice(textState.ci));
        textState.lines[textState.li] = textState.lines[textState.li].slice(0, textState.ci);
        textState.li++; textState.ci = 0;
        textRender(); e.preventDefault(); return;
      }
      if (e.key === "ArrowLeft" && textState.ci > 0) { textState.ci--; render(); e.preventDefault(); return; }
      if (e.key === "ArrowRight" && textState.ci < textState.lines[textState.li].length) { textState.ci++; render(); e.preventDefault(); return; }
      if (e.key.length === 1) { textInsert(e.key); e.preventDefault(); return; }
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (sel) { cmd("clearSel"); e.preventDefault(); }
      return;
    }

    const step = e.shiftKey ? 32 : 8;
    if (e.key === "ArrowLeft") { view.x -= step; clampView(); render(); e.preventDefault(); }
    if (e.key === "ArrowRight") { view.x += step; clampView(); render(); e.preventDefault(); }
    if (e.key === "ArrowUp") { view.y -= step; clampView(); render(); e.preventDefault(); }
    if (e.key === "ArrowDown") { view.y += step; clampView(); render(); e.preventDefault(); }
  });

  /* ---------------------------------------------------------------- *
   *  18. Dialogues : clics
   * ---------------------------------------------------------------- */
  function dialogClick(p) {
    const d = dialog;
    if (!d._rect) return;
    /* zones spéciales (grille de motif, formes de brosse) */
    if (d._hits) {
      for (let i = 0; i < d._hits.length; i++) {
        const h = d._hits[i];
        if (p.x >= h.x && p.x < h.x + h.w && p.y >= h.y && p.y < h.y + h.h) { h.act(); return; }
      }
    }
    if (d.buttons) {
      for (let i = 0; i < d.buttons.length; i++) {
        const b = d.buttons[i];
        if (b._rect && p.x >= b._rect.x && p.x < b._rect.x + b._rect.w && p.y >= b._rect.y && p.y < b._rect.y + b._rect.h) {
          if (b.cmd === "close") closeDialog();
          else { const c = b.cmd; closeDialog(); cmd(c); }
          return;
        }
      }
    }
  }

  /* dessin des contenus spécifiques des dialogues */
  const _drawDialog = drawDialog;
  drawDialog = function () {
    _drawDialog();
    const d = dialog;
    if (!d._rect) return;
    const x0 = d._rect.x, y0 = d._rect.y;

    if (d.brushes) {
      const sw = 56, sh = 40, gap = 8;
      const total = 4 * sw + 3 * gap;
      const bx = x0 + Math.round((d._rect.w - total) / 2), by = y0 + 44;
      d._hits = [];
      for (let i = 0; i < BRUSHES.length; i++) {
        const cx = bx + (i % 4) * (sw + gap), cy = by + Math.floor(i / 4) * (sh + gap);
        fill(cx, cy, sw, sh, i === brushShape ? "#000" : "#fff");
        const b = BRUSHES[i];
        const s = 3;
        const ox = cx + Math.round((sw - b.w * s) / 2), oy = cy + Math.round((sh - b.h * s) / 2);
        ctx.fillStyle = i === brushShape ? ACCENT : "#000";
        for (let y = 0; y < b.h; y++)
          for (let x = 0; x < b.w; x++)
            if (b.bits[y * b.w + x] === "1") ctx.fillRect(ox + x * s, oy + y * s, s, s);
        if (i !== brushShape) { ctx.strokeStyle = "#000"; ctx.strokeRect(cx + 0.5, cy + 0.5, sw - 1, sh - 1); }
        d._hits.push({ x: cx, y: cy, w: sw, h: sh, act: (function (k) { return function () { brushShape = k; closeDialog(); }; })(i) });
      }
    }

    if (d.pattern) {
      const cell = 15, gx = x0 + 22, gy = y0 + 58;
      d._hits = [];
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 8; j++) {
          const on = PAT[pattern][i * 8 + j];
          fill(gx + j * cell, gy + i * cell, cell, cell, on ? "#000" : "#fff");
          ctx.strokeStyle = "#000";
          ctx.strokeRect(gx + j * cell + 0.5, gy + i * cell + 0.5, cell - 1, cell - 1);
          d._hits.push({
            x: gx + j * cell, y: gy + i * cell, w: cell, h: cell,
            act: (function (k) { return function () { PAT[pattern][k] ^= 1; render(); }; })(i * 8 + j)
          });
        }

      /* aperçu répété 8 × 8 */
      const pv = 96, px0 = x0 + d._rect.w - pv - 22, py0 = gy;
      for (let y = 0; y < pv; y++)
        for (let x = 0; x < pv; x++)
          if (PAT[pattern][(y & 7) * 8 + (x & 7)]) ctx.fillRect(px0 + x, py0 + y, 1, 1);
      ctx.strokeStyle = "#000";
      ctx.strokeRect(px0 - 0.5, py0 - 0.5, pv, pv);

      /* bibliothèque de trames classiques */
      drawText("Classic patterns", gx, y0 + 218, "Geneva", 10);
      const lc = 17, lx = gx, ly = y0 + 228;
      for (let i = 0; i < PAT_LIB.length; i++) {
        const cx = lx + (i % 10) * lc, cy = ly + Math.floor(i / 10) * lc;
        const p = hexToPat(PAT_LIB[i][1]);
        fill(cx, cy, 16, 16, "#fff");
        ctx.fillStyle = "#000";
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++)
            if (p[y * 8 + x]) ctx.fillRect(cx + x * 2, cy + y * 2, 2, 2);
        let same = true;
        for (let k = 0; k < 64; k++) if (p[k] !== PAT[pattern][k]) { same = false; break; }
        ctx.strokeStyle = same ? ACCENT : "#000";
        ctx.strokeRect(cx - 0.5, cy - 0.5, 17, 17);
        d._hits.push({
          x: cx, y: cy, w: 16, h: 16,
          act: (function (k) { return function () { PAT[pattern].set(hexToPat(PAT_LIB[k][1])); render(); }; })(i)
        });
      }
    }
  };

  /* ---------------------------------------------------------------- *
   *  19. Import / export
   * ---------------------------------------------------------------- */
  document.getElementById("file").addEventListener("change", function (e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function () {
      const im = new Image();
      im.onload = function () { importImage(im); };
      im.onerror = function () {
        openDialog({ w: 320, h: 100, lines: ["This file is not a readable image."], buttons: [{ label: "OK", cmd: "close", def: true }] });
      };
      im.src = String(reader.result);
    };
    reader.readAsDataURL(f);
  });

  function importImage(im) {
    documentOpen=true;helpPage=null;showPage=false;
    const c = document.createElement("canvas");
    c.width = DW; c.height = DH;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, DW, DH);
    const k = Math.min(DW / im.width, DH / im.height);
    const w = im.width * k, h = im.height * k;
    g.drawImage(im, (DW - w) / 2, (DH - h) / 2, w, h);
    const d = g.getImageData(0, 0, DW, DH).data;
    const v = new Float32Array(DW * DH);
    for (let i = 0; i < DW * DH; i++) v[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    pushUndo();
    for (let y = 0; y < DH; y++)
      for (let x = 0; x < DW; x++) {
        const i = y * DW + x;
        const o = v[i];
        const n = o < 128 ? 0 : 255;
        const er = o - n;
        doc[i] = n ? 0 : 1;
        if (x + 1 < DW) v[i + 1] += er * 7 / 16;
        if (y + 1 < DH) {
          if (x > 0) v[i + DW - 1] += er * 3 / 16;
          v[i + DW] += er * 5 / 16;
          if (x + 1 < DW) v[i + DW + 1] += er / 16;
        }
      }
    scheduleSave();
    render();
  }

  /* ---------------------------------------------------------------- *
   *  20. Démarrage
   * ---------------------------------------------------------------- */
  const TOOLS = CLASSIC.tools.map(c=>c.tool);

  function fit() {
    if (touchMode) { fitDpr = window.devicePixelRatio || 1; return; }
    /* L'écran est agrandi d'un facteur entier de pixels de matériel : à 2,2×, une
       ligne de 1 px ferait 2 px puis 3 px et la page paraîtrait sale. On mesure la
       fenêtre en pixels de matériel (taille CSS × densité, zoom du navigateur inclus)
       pour que chaque pixel de MacPaint tombe sur un nombre exact de pixels. */
    const dpr = window.devicePixelRatio || 1;
    const dw = window.innerWidth * dpr, dh = window.innerHeight * dpr;
    if (WINDOWS) {                                              // la fenêtre de la feuille ne montre que la zone de dessin
      const dpr = window.devicePixelRatio || 1, k = Math.max(1, Math.round(window.innerWidth * dpr / VIEW.w));
      cv.style.width = (SW * k / dpr) + "px"; cv.style.height = (SH * k / dpr) + "px";
      cv.style.transform = ""; cv.style.left = (-VIEW.x * k / dpr) + "px"; cv.style.top = (-VIEW.y * k / dpr) + "px";
      cv.style.cursor = tool === "text" ? "text" : "crosshair";
      fitDpr = dpr;
      return;
    }
    const crop = NATIVE ? MENUBAR : 0;                          // barre de menus dessinée : hors champ
    let k = Math.floor(Math.min(dw / SW, dh / (SH - crop) + (crop ? 1e-6 : 0)));
    if (!isFinite(k) || k < 1) k = 1;
    k = Math.min(k, 16);
    /* Facteurs 1, 2, 4, 8, 16 seulement : chaque pixel de MacPaint occupe un
       nombre entier de pixels d'écran, et ce nombre est une puissance de deux,
       comme les agrandissements d'époque. Aucun lissage, aucun facteur 3 ou 5. */
    let p2 = 1;
    while (p2 * 2 <= k) p2 *= 2;
    k = p2;
    let cw = SW * k / dpr, ch = SH * k / dpr;
    // A small viewport may scroll, but never resamples the original pixels.
    cv.style.width = (Math.round(cw * 1000) / 1000) + "px";
    cv.style.height = (Math.round(ch * 1000) / 1000) + "px";
    /* Placement au pixel de matériel près : la toile est posée en absolu, jamais
       avec une transformation CSS. Une transformation, même d'une fraction de
       pixel, fait rééchantillonner la couche par le navigateur et rend l'image
       floue en haute résolution. Ici chaque pixel de MacPaint occupe un nombre
       entier de pixels d'écran, sans lissage. */
    const cut = crop * k / dpr;
    const left = Math.max(0,(window.innerWidth - cw) / 2), top = crop ? (window.innerHeight - (ch - cut)) / 2 - cut : Math.max(0,(window.innerHeight - ch) / 2);
    if (crop) cv.style.clipPath = "inset(" + cut + "px 0 0 0)";
    cv.style.transform = "";
    cv.style.left = (Math.round(left * dpr) / dpr).toFixed(4) + "px";
    cv.style.top = (Math.round(top * dpr) / dpr).toFixed(4) + "px";
    cv.style.cursor = tool === "text" ? "text" : "crosshair";
    fitDpr = dpr;
  }

  /* Le facteur peut changer sans redimensionnement : zoom du navigateur,
     passage d'un écran à l'autre. On surveille la densité. */
  let fitDpr = 0;

  function boot() {
    fit();
    window.addEventListener("resize", fit);
    /* On arrive toujours sur une planche vierge : le dessin précédent n'est plus rechargé. */
    render();
    setInterval(function () {
      if ((window.devicePixelRatio || 1) !== fitDpr) fit();
      if (sel || textState.active || menuOpen >= 0 || fatBits) render();
    }, 180);

    // All FONT strikes are synchronous data; no system font or font network lookup.

  }

  /* Public bridge shared by the classic and touch shells. No duplicate paint engine. */
  let touchCheckpoint = null, textCheckpoint = null;
  function cloneSelection(s) {
    return s ? { ...s, mask:s.mask?s.mask.slice():null, data:s.data?s.data.slice():null } : null;
  }
  function checkpoint() {
    return { pixels:doc.slice(), selection:cloneSelection(sel), undo:undoStack.slice(), redo:redoStack.slice(),
      polygon:polygonPoints?{...polygonPoints,pts:polygonPoints.pts.map(p=>({...p}))}:null,
      layers:layerSnapshot(), selectedText:selectedText,
      view:{...view},zoom:zoom };
  }
  function restoreCheckpoint(c) {
    doc.set(c.pixels);sel=cloneSelection(c.selection);polygonPoints=c.polygon;
    undoStack.splice(0,undoStack.length,...c.undo);redoStack.splice(0,redoStack.length,...c.redo);
    restoreLayers(c.layers);selectedText=c.selectedText;renderTextLayers();
    view.x=c.view.x;view.y=c.view.y;zoom=c.zoom;
    textState.active=false;textState.base=null;scheduleSave();render();
  }
  function pointForTouch(x,y) {
    if(!Number.isFinite(x)||!Number.isFinite(y))throw new TypeError("Invalid drawing coordinates");
    return {x:Math.round(x),y:Math.round(y)};
  }
  const publicAPI = {
    about:ABOUT,
    drawWindowTitle(target,width){
      const b=textBmp('untitled','Chicago',12,false,false),left=Math.floor((width-b.adv)/2);
      target.fillStyle='#fff';target.fillRect(0,0,width,19);
      target.fillStyle='#000';target.fillRect(0,18,width,1);
      for(let y=4;y<=14;y+=2)target.fillRect(2,y,width-4,1);
      target.fillStyle='#fff';target.fillRect(8,3,13,13);target.fillRect(left-5,2,b.adv+10,15);
      target.fillStyle='#000';target.fillRect(9,4,11,1);target.fillRect(9,14,11,1);target.fillRect(9,4,1,11);target.fillRect(19,4,1,11);
      for(let y=0;y<b.h;y++)for(let x=0;x<b.w;x++)if(b.bits[y*b.w+x])target.fillRect(left-b.pad+x,14-b.asc+y,1,1);
    },
    width:DW,height:DH,tools:Object.freeze(TOOLS.slice()),
    fonts:Object.freeze(FONTS.map(f=>f.name)),sizes:Object.freeze(SIZES.slice()),
    brushes:Object.freeze(BRUSHES.map(b=>Object.freeze({...b}))),
    subscribe(fn){changeListeners.add(fn);return ()=>changeListeners.delete(fn);},
    state(){return {tool,pattern,width:tool==='spray'?[1,2,4,8][lineWidth]:outlineWidth(),font:fontName,size:fontSize,styles:[...styles],alignment,
      brush:brushShape,mirror,canUndo:undoStack.length>0,canRedo:redoStack.length>0,canPaste:!!clipboard,
      documentOpen,textActive:textState.active,caret:textState.active?textCaretPos():null,
      textLayers:textLayers.length,selectedText,penWhite:inkWhite(),
      selection:sel?{x:sel.x,y:sel.y,w:sel.w,h:sel.h}:null,polygonPoints:polygonPoints?polygonPoints.pts.length:0,dialog};},
    hasInk(){return doc.some(v=>v===1) || textLayers.length>0;},
    setTool(name){if(!TOOLS.includes(name))throw new RangeError("Unknown tool");setTool(name);},
    setPattern(i){if(!Number.isInteger(i)||!PAT[i])throw new RangeError("Unknown pattern");pattern=i;render();},
    pattern(i=pattern){if(!PAT[i])throw new RangeError("Unknown pattern");return PAT[i].slice();},
    setPatternPixel(x,y,on){if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>7||y<0||y>7)throw new RangeError("Invalid pattern cell");PAT[pattern][y*8+x]=on?1:0;render();},
    setWidth(w){if(w===0){noOutline=true;render();return;}const i=[1,2,4,8].indexOf(w);if(i<0)throw new RangeError("Invalid width");lineWidth=i;noOutline=false;render();},
    setBrush(i){if(!Number.isInteger(i)||!BRUSHES[i])throw new RangeError("Invalid brush");brushShape=i;render();},
    setMirror(i){if(!Number.isInteger(i)||i<0||i>3)throw new RangeError("Invalid mirror");mirror=i;render();},
    command(name){
      const commands=['new','open','revert','close','cut','copy','paste','clearSel','invert','fill','trace','fliph','flipv','rotate','resetpatterns'];
      const font=name.startsWith('font:')&&FONTS.some(f=>f.name===name.slice(5));
      const size=name.startsWith('size:')&&SIZES.includes(Number(name.slice(5)));
      const face=name.startsWith('style:')&&['plain','bold','italic','underline','outline','shadow'].includes(name.slice(6));
      const align=name.startsWith('align:')&&['left','middle','right'].includes(name.slice(6));
      if(!commands.includes(name)&&!font&&!size&&!face&&!align)throw new RangeError("Unsupported command");
      cmd(name);
    },
    undo(){requestUndo();},redo(){redo();},
    beginStroke(x,y,options={}){
      textCommit();touchCheckpoint=checkpoint();const d=pointForTouch(x,y);
      mouse.x=VIEW.x+(d.x-view.x)*zoom;mouse.y=VIEW.y+(d.y-view.y)*zoom;
      startTool(d,options);
    },
    moveStroke(x,y,options={}){
      if(!drag)return;const d=pointForTouch(x,y);
      const p={x:VIEW.x+(d.x-view.x)*zoom,y:VIEW.y+(d.y-view.y)*zoom};
      mouse.x=p.x;mouse.y=p.y;moveTool(p,options);
    },
    endStroke(){endTool();touchCheckpoint=null;},
    cancelStroke(){const c=touchCheckpoint;touchCheckpoint=null;endTool();if(c)restoreCheckpoint(c);},
    finishPolygon(){if(!polygonPoints||polygonPoints.pts.length<3)return false;paintClosed(polygonPoints.pts,polygonPoints.filled);polygonPoints=null;scheduleSave();render();return true;},
    clearSelection(){selCommit();sel=null;render();},
    beginText(x,y){textCommit();textCheckpoint=checkpoint();const d=pointForTouch(x,y);textBegin(d.x,d.y);},
    setText(value){if(!textState.active)return;const lines=String(value).slice(0,2000).replace(/\r\n?/g,'\n').split('\n');textState.lines=lines;textState.li=lines.length-1;textState.ci=lines[textState.li].length;textRender();},
    commitText(){textCommit();textCheckpoint=null;},
    cancelText(){const c=textCheckpoint;textCheckpoint=null;textState.active=false;textState.base=null;if(c)restoreCheckpoint(c);},
    /* Texte en bitmap d'origine (pour dessiner les fenêtres en vrais pixels). */
    bitmapText(value,family,size,bold){const b=textBmp(String(value),family||'Chicago',size||12,!!bold,false);return {bits:b.bits,w:b.w,h:b.h,pad:b.pad,asc:b.asc,adv:b.adv,lineHeight:b.lineHeight};},
    measureText(value){const b=textBmp(String(value),fontName,fontSize,styles.has('bold'),styles.has('italic'));return {width:b.adv,ascent:b.asc,lineHeight:b.lineHeight};},
    drawDocument(target,x,y,scale){
      syncDoc();target.imageSmoothingEnabled=false;target.drawImage(docCanvas,x,y,DW*scale,DH*scale);target.drawImage(textCanvas,x,y,DW*scale,DH*scale);
      if(sel&&sel.data){
        floatCanvas.width=sel.w;floatCanvas.height=sel.h;const im=fctx.createImageData(sel.w,sel.h),p=new Uint32Array(im.data.buffer);
        for(let i=0;i<p.length;i++)p[i]=sel.mask&&!sel.mask[i]?0:sel.data[i]?0xff000000:0xffffffff;
        fctx.putImageData(im,0,0);target.drawImage(floatCanvas,x+sel.x*scale,y+sel.y*scale,sel.w*scale,sel.h*scale);
      }
    },
    exportPNG(){textCommit();selCommit();syncDoc();const c=document.createElement('canvas');c.width=DW;c.height=DH;const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(docCanvas,0,0);g.drawImage(textCanvas,0,0);return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('PNG export failed')),'image/png'));},
    /* Calques de texte : sélection, déplacement, réédition, suppression. */
    textLayers(){return textLayers.map(cloneTextLayer);},
    textLayerAt(x,y){const d=pointForTouch(x,y);const l=textLayerAt(d.x,d.y);return l?l.id:null;},
    textLayerBounds(id){const l=textLayers.find(function(t){return t.id===id;});return l?textLayerBounds(l):null;},
    selectText(id){selectedText=id;render();},
    clearTextSelection(){selectedText=null;render();},
    moveTextLayer(id,x,y){const d=pointForTouch(x,y);const l=textLayers.find(function(t){return t.id===id;});if(!l)return false;l.x=d.x;l.y=d.y;renderTextLayers();scheduleSave();render();return true;},
    beginTextMove(id){const l=textLayers.find(function(t){return t.id===id;});if(!l)return null;pushUndo();return {x:l.x,y:l.y};},
    deleteTextLayer(id){const i=textLayers.findIndex(function(t){return t.id===id;});if(i<0)return false;pushUndo();textLayers.splice(i,1);selectedText=null;renderTextLayers();scheduleSave();render();return true;},
    editTextLayer(id){return editTextLayerById(id);},
  };
  /* Mise au point : MacPaint.mischief(60) saute directement à ce nombre de
     gestes (0 remet tout en place) ; sans argument, renvoie l'état. */
  publicAPI.mischief = function (n) {
    if (n !== undefined && MOT && !touchMode) {
      legoReset();
      for (let i = 0; i < n; i++) {
        mischief++;
        const level = Satire.difficulty.levelFor(mischief);
        if (level !== legoLevel) { legoLevel = level; if (level >= 3) legoRearrange(); else if (level === 2) { swapCells(); swapCells(); } }
      }
      startAnim();
    }
    return { gestes: mischief, palier: legoLevel, disposition: legoLayout };
  };
  publicAPI.avalanche = function (n) { physAvalanche(n === undefined ? 20 : n); return Object.keys(bodies).length; };
  publicAPI.layout = function (i) { if (MOT && !touchMode && LEGO_LAYOUTS[i]) legoSetLayout(i); return legoLayout; };
  window.MacPaint = Object.freeze(publicAPI);

  boot();

  /* accès de mise au point (console) */
  window.__mp = {
    MENUS: MENUS, menuItems: menuItems,
    TOOLS: TOOLS, FONTS:FONTS, SIZES:SIZES, PAT:PAT, VIEW:VIEW,
    cmd:cmd,textBmp:textBmp,fit:fit,
    get documentOpen(){return documentOpen;},get dialog(){return dialog;},get selection(){return sel;},get textActive(){return textState.active;},
    get pattern(){return pattern;},get lineWidth(){return lineWidth;},
    resetForTest(){if(sprayTimer)clearInterval(sprayTimer);drag=null;sel=null;dialog=null;menuOpen=-1;menuHover=-1;menuTrack=false;documentOpen=true;polygonPoints=null;helpPage=null;textState.active=false;textLayers.length=0;selectedText=null;view.x=view.y=0;zoom=1;fatBits=false;showPage=false;doc.fill(0);undoStack.length=redoStack.length=0;pattern=0;lineWidth=0;noOutline=false;fontName="Geneva";fontSize=12;style="plain";styles.clear();alignment="left";tool="brush";renderTextLayers();render();},
    get menuOpen() { return menuOpen; },
    get tool() { return tool; },
    get zoom() { return zoom; },
    get view() { return { x: view.x, y: view.y }; },
    doc: doc,
    docCanvas: docCanvas,
    dctx: dctx,
    render: render,
    undo: undo,
    undoLen: function () { return undoStack.length; }
  };
})();

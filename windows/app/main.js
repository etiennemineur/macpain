// MacPain pour Windows — coque Electron autour de la version web.
//
// Équivalent de macos/main.swift. Les fichiers de dist/ sont embarqués dans le dossier
// « web » et servis sous l'adresse privée macpain://app/… : la page a une vraie origine
// (fetch + Web Audio pour les sons, localStorage conservé pour le niveau de difficulté),
// sans aucune connexion réseau.
//
// Les menus du logiciel sont dans une vraie barre de menus Windows (celle de la feuille).
// Il n'y a pas de fenêtre globale : la feuille, les outils, les traits et les trames ont
// chacun leur fenêtre, et à partir d'Ultra-Violence ces fenêtres errent sur le bureau.
// Windows ne sait pas faire pivoter une fenêtre : elles se déplacent, et en Nightmare!
// elles changent aussi de taille (toujours un nombre entier de pixels d'écran par pixel de 1984).
//
// Construit par windows/build-app.sh.
'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, screen, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const WIN = process.platform === 'win32';
const SCHEME = 'macpain';
// ?classic=1 : un PC à écran tactile ne doit pas être envoyé vers la coque iPhone (touch-router.js).
const START = SCHEME + '://app/index.html?classic=1';
// Paquet : dossier « web » à côté de ce fichier. Essai sur place : dist/ du projet.
const WEB = fs.existsSync(path.join(__dirname, 'web')) ? path.join(__dirname, 'web') : path.resolve(__dirname, '..', '..', 'dist');

// Un pixel de l'application = un pixel de l'écran, quel que soit le réglage « Mise à l'échelle »
// de Windows (125 %, 150 %…). Si Windows n'en tenait pas compte, les tailles ci-dessous restent
// calculées en pixels réels de l'écran (voir dip) : l'agrandissement reste un facteur entier.
if (WIN) app.commandLine.appendSwitch('force-device-scale-factor', '1');

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

// MARK: Fichiers embarqués

const MIME = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8', webmanifest: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8',
  png: 'image/png', svg: 'image/svg+xml', woff2: 'font/woff2', wav: 'audio/wav', mp3: 'audio/mpeg',
};

async function serve(request) {
  const url = new URL(request.url);
  let rel = decodeURIComponent(url.pathname);
  if (rel === '' || rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(WEB, rel));
  // Rien en dehors du dossier embarqué.
  if (url.host !== 'app' || !file.startsWith(WEB + path.sep)) return new Response('', { status: 404 });
  let data;
  try { data = await fs.promises.readFile(file); } catch (e) { return new Response('', { status: 404 }); }
  const headers = { 'Content-Type': MIME[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  let body = data, status = 200;
  // Lecture partielle (éléments <audio>) : « Range: bytes=a-b ».
  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (m && data.length && (m[1] || m[2])) {
    let from = m[1] ? +m[1] : Math.max(0, data.length - +m[2]);
    let to = m[1] && m[2] ? Math.min(+m[2], data.length - 1) : data.length - 1;
    if (from <= to) { body = data.subarray(from, to + 1); status = 206; headers['Content-Range'] = 'bytes ' + from + '-' + to + '/' + data.length; }
  }
  headers['Content-Length'] = String(body.length);
  return new Response(body, { status: status, headers: headers });
}

// MARK: État

// Écran simulé : la zone de dessin et les trois palettes, en pixels de 1984.
const SHEET = { id: 'window', title: 'untitled', x: 80, y: 47, w: 416, h: 240 };
const PALETTES = [
  { id: 'tools', title: 'Tools', x: 15, y: 27, w: 54, h: 222 },
  { id: 'lines', title: 'Lines', x: 15, y: 257, w: 54, h: 78 },
  { id: 'patterns', title: 'Patterns', x: 77, y: 299, w: 424, h: 36 },
];

let main = null;                 // la feuille
let pieces = [];                 // la feuille, puis les palettes ouvertes par la page
let popups = new Map();          // pièges et réclames : de vraies fenêtres, par-dessus tout
let popupCount = 0;
let pending = [];                // fenêtres demandées par la page, en attente de création
let scale = 2;                   // pixels réels de l'écran par pixel de 1984
let factor = 1;                  // pixels réels par unité de mesure des fenêtres (1 sous Windows, 2 sur un Mac Retina)
let lastTick = 0;
let pageMenus = [];              // gabarits de File, Edit, Goodies, Font, FontSize, Style, dans l'ordre d'origine
let appleItems = [];
let menuOrder = null;            // Nightmare! : ordre mélangé
let pageState = {};
let checks = [];                 // articles à coche : [commande, article]

const alive = (w) => w && !w.isDestroyed();
const workArea = () => (alive(main) ? screen.getDisplayMatching(main.getBounds()) : screen.getPrimaryDisplay()).workArea;

/** Longueur de fenêtre pour n pixels de 1984 agrandis k fois. */
const dip = (n, k) => Math.round(n * (k === undefined ? scale : k) / factor);

function allowedScales() {
  const d = screen.getPrimaryDisplay(), a = d.workArea;
  factor = d.scaleFactor || 1;
  // 1, 2, 4 ou 8 : des puissances de deux, comme les agrandissements d'époque.
  const fits = [1, 2, 4, 8].filter((s) => s >= Math.floor(factor) && 512 * s / factor <= a.width * 0.9 && (342 * s + 120) / factor <= a.height);
  return fits.length ? fits : [Math.max(1, Math.floor(factor))];
}

// MARK: Pièces (fenêtres du logiciel)

class Spring {
  constructor(v) { this.x = v; this.v = 0; this.target = v; }
  step(dt, stiffness, damping) { this.v += (stiffness * (this.target - this.x) - damping * this.v) * dt; this.x += this.v * dt; }
}

function makePiece(spec, win) {
  const piece = { id: spec.id, spec: spec, win: win, scale: scale, home: { x: 0, y: 0 }, cx: new Spring(0), cy: new Spring(0),
    roaming: false, nextRoam: 0, roamX: 0, roamY: 0, dragging: false, dragAt: 0, setAt: 0, last: null };
  // L'utilisateur prend la fenêtre par sa barre de titre : on la lui laisse.
  // (Un déplacement que l'application vient de faire elle-même ne compte pas.)
  win.on('will-move', () => { if (Date.now() - piece.setAt < 150) return; piece.dragging = true; piece.dragAt = Date.now(); });
  return piece;
}

/** Marges entre le cadre de la fenêtre (barre de titre, barre de menus, bordures) et son contenu. */
function insets(win) {
  const b = win.getBounds(), c = win.getContentBounds();
  return { left: c.x - b.x, top: c.y - b.y, w: b.width - c.width, h: b.height - c.height };
}

/** Pose la fenêtre à sa place d'origine : l'écran simulé est centré sur l'écran. */
function place(piece) {
  if (!alive(piece.win)) return;
  const a = workArea(), r = piece.spec;
  piece.scale = scale;
  // Sous une autre fenêtre, on laisse la hauteur d'une barre de titre.
  const gap = r.y > 250 ? insets(piece.win).top : 0;
  const left = Math.round(a.x + a.width / 2 - dip(256) + dip(r.x));
  const top = Math.round(a.y + Math.max(30, (a.height - dip(342) - 30) / 2) + dip(r.y) + gap);
  piece.setAt = Date.now();
  piece.win.setContentBounds({ x: left, y: top, width: dip(r.w), height: dip(r.h) });
  anchor(piece);
}

/** La place actuelle de la fenêtre devient sa place de repos. */
function anchor(piece, dx, dy) {
  const b = piece.win.getBounds();
  piece.home = { x: b.x + b.width / 2 - (dx || 0), y: b.y + b.height / 2 - (dy || 0) };
  piece.cx = new Spring(b.x + b.width / 2); piece.cy = new Spring(b.y + b.height / 2);
  piece.last = { x: b.x, y: b.y, width: b.width, height: b.height };
  piece.roaming = false;
}

function setScale(s) {
  scale = s;
  for (const piece of pieces) place(piece);
  buildMenu();
}

function closePalettes() {
  for (const w of popups.values()) if (alive(w)) w.destroy();
  popups = new Map(); popupCount = 0; pending = [];
  for (const piece of pieces.slice(1)) if (alive(piece.win)) piece.win.destroy();
  pieces = pieces.slice(0, 1);
  if (pieces[0]) place(pieces[0]);
}

function restart() {
  closePalettes();
  menuOrder = null;
  if (alive(main)) main.loadURL(START).catch(() => {});
}

// MARK: Lancement

function childOptions(width, height) {
  return {
    width: width, height: height, useContentSize: true, show: false, resizable: false, minimizable: false, maximizable: false,
    fullscreenable: false, closable: false, skipTaskbar: true, backgroundColor: '#ffffff', autoHideMenuBar: true,
    // Windows : petite barre de titre des fenêtres d'outils, et la fenêtre reste au-dessus de la feuille.
    ...(WIN ? { type: 'toolbar', parent: main } : { alwaysOnTop: true }),
  };
}

function createMain() {
  scale = Math.max(...allowedScales());
  main = new BrowserWindow({
    width: dip(SHEET.w), height: dip(SHEET.h), useContentSize: true, show: false, resizable: false, maximizable: false,
    fullscreenable: false, title: SHEET.title, backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      // La feuille peut être recouverte pendant que les palettes se promènent : la page ne se met pas en pause.
      backgroundThrottling: false, spellcheck: false, autoplayPolicy: 'document-user-activation-required',
    },
  });
  pieces = [makePiece(SHEET, main)];
  buildMenu();
  place(pieces[0]);
  main.once('ready-to-show', () => { main.show(); main.focus(); });
  main.on('page-title-updated', (e) => e.preventDefault());
  main.on('closed', () => { main = null; app.quit(); });        // fermer la feuille quitte le logiciel

  const wc = main.webContents;
  wc.setVisualZoomLevelLimits(1, 1).catch(() => {});
  wc.on('render-process-gone', () => restart());
  // Navigation : rien d'autre que les fichiers embarqués ; un lien cliqué part dans le navigateur.
  wc.on('will-navigate', (e, url) => {
    if (url.startsWith(SCHEME + '://app/')) return;
    e.preventDefault();
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
  });
  wc.setWindowOpenHandler((details) => {
    if (details.url !== 'about:blank' && details.url !== '') {
      if (/^https?:/i.test(details.url)) shell.openExternal(details.url);
      return { action: 'deny' };
    }
    const f = {};
    for (const part of (details.features || '').split(',')) { const kv = part.split('='); if (kv.length === 2) f[kv[0].trim()] = parseFloat(kv[1]); }
    if (f.width && f.height) {
      // Un piège ou une réclame.
      pending.push({ popup: true, x: (isFinite(f.left) ? f.left : 500) / 1000, y: (isFinite(f.top) ? f.top : 500) / 1000 });
      return { action: 'allow', overrideBrowserWindowOptions: { ...childOptions(Math.round(f.width), Math.round(f.height)), title: 'MacPain', alwaysOnTop: true, parent: WIN ? main : undefined } };
    }
    const spec = PALETTES[pieces.length - 1 + pending.filter((p) => !p.popup).length];
    if (!spec) return { action: 'deny' };
    pending.push({ popup: false, spec: spec });
    return { action: 'allow', overrideBrowserWindowOptions: { ...childOptions(dip(spec.w), dip(spec.h)), title: spec.title } };
  });
  wc.on('did-create-window', (win) => {
    const ask = pending.shift();
    if (!ask) { win.destroy(); return; }
    win.removeMenu();
    win.on('page-title-updated', (e) => e.preventDefault());
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    if (ask.popup) openPopup(win, ask); else openPalette(win, ask.spec);
  });

  main.loadURL(START).catch(() => {});
}

/** La page ouvre une palette (window.open) : on lui donne sa vraie fenêtre. */
function openPalette(win, spec) {
  win.setTitle(spec.title);
  const piece = makePiece(spec, win);
  pieces.push(piece);
  place(piece);
  win.showInactive();
  win.on('closed', () => { pieces = pieces.filter((p) => p !== piece); });
}

/** Un piège ou une réclame : une vraie fenêtre posée par-dessus les autres. x, y (0 à 1) :
    la place que son centre occupait dans la page, reportée sur tout l'écran. */
function openPopup(win, ask) {
  const id = ++popupCount;
  popups.set(id, win);
  win.setTitle('MacPain');
  win.setAlwaysOnTop(true, 'floating');
  const a = workArea(), b = win.getBounds();
  win.setPosition(Math.round(Math.min(Math.max(a.x, a.x + ask.x * a.width - b.width / 2), a.x + a.width - b.width)),
                  Math.round(Math.min(Math.max(a.y, a.y + ask.y * a.height - b.height / 2), a.y + a.height - b.height)));
  win.showInactive();
  win.on('closed', () => { if (popups.get(id) === win) popups.delete(id); });
}

/** Mauvais bouton : la fenêtre du piège se secoue. */
function shake(win) {
  const offsets = [-7, 7, -5, 5, -3, 3, 0];
  let step = 0, applied = 0;
  const timer = setInterval(() => {
    if (!alive(win)) { clearInterval(timer); return; }
    // décalage relatif : la fenêtre peut être déplacée par le piège pendant la secousse
    const offset = offsets[Math.min(step, offsets.length - 1)], p = win.getPosition();
    win.setPosition(p[0] + offset - applied, p[1]);
    applied = offset;
    if (++step >= offsets.length) clearInterval(timer);
  }, 30);
}

// MARK: Pont avec la page

ipcMain.on('macpain', (event, msg) => {
  if (!alive(main) || event.sender !== main.webContents || !msg) return;
  const d = msg.d;
  switch (msg.n) {
    case 'tick': tick(d || {}); break;
    case 'popupSize': {
      const w = popups.get(d && d.id);
      if (alive(w) && d.h > 10) { const c = w.getContentSize(); if (Math.abs(c[1] - d.h) > 0.5) w.setContentSize(c[0], Math.round(d.h)); }
      break;
    }
    case 'popupMove': {
      const w = popups.get(d && d.id);
      if (alive(w)) {
        const a = workArea(), b = w.getBounds();
        w.setPosition(Math.round(Math.max(a.x, Math.min(a.x + a.width - b.width, a.x + d.x * a.width))),
                      Math.round(Math.max(a.y, Math.min(a.y + a.height - b.height, a.y + d.y * a.height))));
      }
      break;
    }
    case 'popupShake': if (alive(popups.get(d))) shake(popups.get(d)); break;
    case 'popupKey': if (alive(popups.get(d))) popups.get(d).focus(); break;
    case 'popupClose': {
      const w = popups.get(d);
      popups.delete(d);
      if (alive(w)) { const had = w.isFocused(); w.destroy(); if (had && alive(main)) main.focus(); }
      break;
    }
    case 'refocus': if (alive(main) && !main.isFocused() && ![...popups.values()].some((w) => alive(w) && w.isFocused())) main.focus(); break;
    case 'shuffle': shuffleMenus(); break;
    case 'state': pageState = d || {}; syncChecks(); break;
    case 'menus':
      appleItems = (d && d[0] && d[0].items) || [];
      pageMenus = (d || []).slice(1);
      menuOrder = null;
      buildMenu();
      break;
    case 'cmd':
      if (d === 'quit') app.quit();
      else if (d === 'print' || d === 'pagesetup') printDocument();   // Windows : la mise en page se règle dans la boîte d'impression
      break;
  }
});

function pageCommand(command) {
  if (command && alive(main)) main.webContents.executeJavaScript('window.__mp&&window.__mp.cmd(' + JSON.stringify(command) + ');void 0').catch(() => {});
  setTimeout(syncChecks, 0);
}

// MARK: Menus : ceux du logiciel, dans la barre de menus de la feuille

const CHECKED = /^(font|size|style|align):/;

function fill(items) {
  const out = [];
  for (const entry of items) {
    if (entry.sep) { out.push({ type: 'separator' }); continue; }
    const command = entry.cmd || '';
    const item = { label: entry.t || '', click: () => pageCommand(command) };
    if (CHECKED.test(command)) { item.type = 'checkbox'; item.checked = isOn(command); item.id = 'cmd:' + command; }
    // Le raccourci est affiché ; c'est la page qui l'exécute (Ctrl + lettre), pour ne pas le lancer deux fois.
    if (WIN && entry.k) { item.accelerator = 'Ctrl+' + String(entry.k).toUpperCase(); item.registerAccelerator = false; }
    out.push(item);
  }
  return out;
}

function isOn(command) {
  const styles = pageState.styles || [];
  if (command.startsWith('font:')) return command.slice(5) === pageState.font;
  if (command.startsWith('size:')) return parseInt(command.slice(5), 10) === pageState.size;
  if (command === 'style:plain') return styles.length === 0;
  if (command.startsWith('style:')) return styles.includes(command.slice(6));
  if (command.startsWith('align:')) return command.slice(6) === pageState.alignment;
  return false;
}

function syncChecks() {
  for (const [command, item] of checks) item.checked = isOn(command);
}

function buildMenu() {
  // Premier menu : les articles du menu Pomme du logiciel, puis ceux de l'application.
  const first = fill(appleItems);
  if (first.length) first.push({ type: 'separator' });
  for (const s of allowedScales()) first.push({ label: 'Taille ×' + s, type: 'radio', checked: s === scale, click: () => setScale(s) });
  first.push({ label: 'Recommencer', click: restart }, { type: 'separator' }, { label: 'Quitter MacPain', accelerator: WIN ? 'Alt+F4' : 'Cmd+Q', registerAccelerator: false, click: () => app.quit() });
  const order = menuOrder || pageMenus.map((_, i) => i);
  const template = [{ label: 'MacPain', submenu: first }];
  for (const i of order) template.push({ label: pageMenus[i].title || '', submenu: fill(pageMenus[i].items || []) });
  const menu = Menu.buildFromTemplate(template);
  checks = [];
  const walk = (m) => { for (const item of m.items) { if (item.id && item.id.startsWith('cmd:')) checks.push([item.id.slice(4), item]); if (item.submenu) walk(item.submenu); } };
  walk(menu);
  if (WIN) {
    // Sous Windows la barre de menus appartient à une fenêtre : celle de la feuille, et elle seule.
    Menu.setApplicationMenu(null);
    if (alive(main)) {
      const before = main.getContentBounds();
      main.setMenu(menu);
      const after = main.getContentBounds();
      if (after.height !== before.height || after.width !== before.width) main.setContentSize(before.width, before.height);
    }
  } else Menu.setApplicationMenu(menu);
}

/** Nightmare! : la barre de menus ne peut pas bouger, mais ses menus changent de place. */
function shuffleMenus() {
  if (pageMenus.length < 2) return;
  const current = menuOrder || pageMenus.map((_, i) => i);
  let order;
  do { order = current.slice().sort(() => Math.random() - 0.5); } while (order[0] === current[0]);
  menuOrder = order;
  buildMenu();
}

function restoreMenus() {
  if (!menuOrder) return;
  menuOrder = null;
  buildMenu();
}

// MARK: Errance : les fenêtres se promènent sur le bureau

const rand = (a, b) => a + Math.random() * (b - a);

/** Appelé à chaque image par la page. `blocks` : décalage que le moteur donne à chaque bloc
    (sauts, déménagements, secousses de la musique) ; à partir d'Ultra-Violence, chaque fenêtre
    part en plus se promener seule sur tout l'écran. Pas de rotation sous Windows : en Nightmare!
    la fenêtre change de taille à la place, par facteurs entiers. */
function tick(data) {
  if (!alive(main)) return;
  const now = Date.now();
  const dt = Math.min(1 / 30, Math.max(1 / 240, (now - lastTick) / 1000));
  lastTick = now;
  const level = data.level | 0, started = !!data.started, blocks = data.blocks || {};
  const wander = started && level >= 3;
  const nightmare = level >= 4;
  const a = workArea();
  if (!wander) restoreMenus();

  for (const piece of pieces) {
    const win = piece.win;
    if (!alive(win) || win.isMinimized() || !win.isVisible()) continue;
    const block = blocks[piece.id] || [0, 0, 0, 1];
    const dx = dip(block[0] || 0), dy = dip(block[1] || 0);
    if (piece.dragging) {
      if (now - piece.dragAt < 250) continue;
      piece.dragging = false;
      anchor(piece, wander ? 0 : dx, wander ? 0 : dy);
    }

    let want = scale;
    if (wander) {
      if (!piece.roaming || now >= piece.nextRoam) {
        piece.roaming = true;
        piece.nextRoam = now + (nightmare ? rand(350, 1000) : rand(2200, 4500));
        // Nightmare! : une fois sur trois, la fenêtre passe à la moitié de sa taille (ou en revient).
        piece.wantScale = nightmare && scale / 2 >= factor && Math.random() < 1 / 3 ? (piece.scale === scale ? scale / 2 : scale) : (nightmare ? piece.scale : scale);
        const ins = insets(win);
        const halfW = (dip(piece.spec.w, piece.wantScale) + ins.w) / 2, halfH = (dip(piece.spec.h, piece.wantScale) + ins.h) / 2;
        const midX = a.x + a.width / 2, midY = a.y + a.height / 2;
        piece.roamX = rand(Math.min(a.x + halfW, midX), Math.max(a.x + a.width - halfW, midX));
        piece.roamY = rand(Math.min(a.y + halfH, midY), Math.max(a.y + a.height - halfH, midY));
      }
      want = piece.wantScale || scale;
      // Les secousses du moteur (frappes de la musique) s'ajoutent à la promenade.
      piece.cx.target = piece.roamX + (nightmare ? dx : 0);
      piece.cy.target = piece.roamY + (nightmare ? dy : 0);
    } else {
      piece.roaming = false;
      piece.cx.target = piece.home.x + dx;
      piece.cy.target = piece.home.y + dy;
    }

    const stiffness = wander ? (nightmare ? 55 : 7) : 120, damping = wander ? (nightmare ? 9 : 4.2) : 20;
    piece.cx.step(dt, stiffness, damping);
    piece.cy.step(dt, stiffness, damping);

    let width = piece.last.width, height = piece.last.height;
    if (want !== piece.scale) {
      const ins = insets(win);
      piece.scale = want;
      width = dip(piece.spec.w, want) + ins.w; height = dip(piece.spec.h, want) + ins.h;
    }
    const next = { x: Math.round(piece.cx.x - width / 2), y: Math.round(piece.cy.x - height / 2), width: width, height: height };
    const last = piece.last;
    if (next.width !== last.width || next.height !== last.height) win.setBounds(next);
    else if (next.x !== last.x || next.y !== last.y) win.setPosition(next.x, next.y);
    else continue;
    piece.last = next; piece.setAt = now;
  }
}

// MARK: Impression

async function printDocument() {
  if (!alive(main)) return;
  let url;
  try {
    url = await main.webContents.executeJavaScript('MacPaint.exportPNG().then(function(b){return new Promise(function(r){var f=new FileReader();f.onload=function(){r(f.result);};f.readAsDataURL(b);});})');
  } catch (e) { return; }
  if (typeof url !== 'string' || !url.startsWith('data:image/png;base64,')) return;
  // Feuille 576 × 720 à 72 points par pouce, comme en 1985 : 8 × 10 pouces.
  const html = '<!doctype html><meta charset="utf-8"><title>MacPain</title><style>@page{margin:0.25in}html,body{margin:0;background:#fff}' +
    'img{display:block;margin:0 auto;width:8in;height:10in;max-width:100%;object-fit:contain;image-rendering:pixelated}</style><img src="' + url + '">';
  const sheet = new BrowserWindow({ show: false, width: 816, height: 1056, webPreferences: { sandbox: true, javascript: false } });
  sheet.removeMenu();
  try {
    await sheet.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
    sheet.webContents.print({ silent: false, printBackground: true }, () => { if (alive(sheet)) sheet.destroy(); });
  } catch (e) { if (alive(sheet)) sheet.destroy(); }
}

// MARK: Vérification (outil de mise au point)
//
// Lancée avec MACPAIN_VERIF_DIR=/un/dossier, l'application évalue dans la page tout fichier
// « cmd.js » déposé dans ce dossier et écrit la réponse dans « resultat.json » (avec la place
// de chaque fenêtre) et une image de la feuille dans « feuille.png ». Sans cette variable
// d'environnement, rien de tout cela n'existe.

function startVerificationHookIfAsked() {
  const dir = process.env.MACPAIN_VERIF_DIR;
  if (!dir) return;
  const cmd = path.join(dir, 'cmd.js'), out = path.join(dir, 'resultat.json');
  setInterval(async () => {
    let source;
    try { source = fs.readFileSync(cmd, 'utf8'); fs.unlinkSync(cmd); } catch (e) { return; }
    let payload;
    try { payload = { ok: true, valeur: await main.webContents.executeJavaScript('(async function(){' + source + '\n})()') }; }
    catch (e) { payload = { ok: false, erreur: String(e) }; }
    payload.fenetres = BrowserWindow.getAllWindows().map((w) => ({ titre: w.getTitle(), cadre: w.getBounds(), contenu: w.getContentBounds(), visible: w.isVisible(), active: w.isFocused() }));
    payload.menus = (WIN ? [] : (Menu.getApplicationMenu() || { items: [] }).items).map((m) => ({ titre: m.label, articles: (m.submenu ? m.submenu.items : []).map((i) => (i.type === 'separator' ? '—' : (i.checked ? '✓ ' : '') + i.label)) }));
    try { fs.writeFileSync(path.join(dir, 'feuille.png'), (await main.webContents.capturePage()).toPNG()); } catch (e) {}
    let n = 0;
    for (const w of BrowserWindow.getAllWindows()) {
      if (w === main || !w.isVisible()) continue;
      try { fs.writeFileSync(path.join(dir, 'fenetre-' + (++n) + '.png'), (await w.webContents.capturePage()).toPNG()); } catch (e) {}
    }
    let text;
    try { text = JSON.stringify(payload, null, 2); } catch (e) { text = JSON.stringify({ ok: true, valeur: String(payload.valeur) }); }
    fs.writeFileSync(out, text);
  }, 250);
}

// MARK: Application

app.on('second-instance', () => { if (alive(main)) { if (main.isMinimized()) main.restore(); main.focus(); } });
app.on('window-all-closed', () => app.quit());

app.whenReady().then(() => {
  protocol.handle(SCHEME, serve);

  // Microphone et autres autorisations : refusés, comme sur le site ; le piège se rabat sur le tapotement.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  // Export PNG : vraie boîte d'enregistrement.
  session.defaultSession.on('will-download', (event, item) => {
    const name = item.getFilename() || 'MacPain.png';
    const png = /\.png$/i.test(name);
    // Mise au point : pas de boîte, le fichier va dans le dossier de vérification.
    const target = process.env.MACPAIN_VERIF_DIR ? path.join(process.env.MACPAIN_VERIF_DIR, name) : dialog.showSaveDialogSync(alive(main) ? main : undefined, {
      defaultPath: path.join(app.getPath('pictures'), name),
      filters: png ? [{ name: 'Image PNG', extensions: ['png'] }] : [],
    });
    if (!target) { item.cancel(); return; }
    item.setSavePath(target);
    item.once('done', (e, state) => {
      if (state === 'interrupted' && alive(main)) dialog.showMessageBox(main, { type: 'error', message: "L'image n'a pas pu être enregistrée.", detail: target });
    });
  });

  createMain();
  startVerificationHookIfAsked();
});

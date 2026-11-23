/* satire.js — sons satiriques et ressort d'animation pour MacPaint.
 *
 * Le moteur sonore est en Web Audio : tous les sons sont décodés en mémoire,
 * mixés sur trois bus (foule, bruitages, texture du geste) puis passés dans
 * un compresseur. Rien n'est jamais coupé net :
 *   - la texture du geste est une boucle jointive à l'échantillon près, dont
 *     le volume et la hauteur suivent la vitesse du pointeur ;
 *   - la foule est un tapis continu : une réaction en remplace une autre par
 *     fondu enchaîné, et les prises s'enchaînent tant que l'on travaille vite ;
 *   - l'« énergie » monte avec le rythme de travail et retombe toute seule :
 *     elle choisit la réaction (ironie → politesse → rires → hystérie).
 * Sans Web Audio (ou en file://), chaque voix retombe sur un élément <audio>.
 *
 *   Satire.audio.select(outil)   son du pictogramme
 *   Satire.audio.loop(outil)     texture du geste ; loopStop() la termine
 *   Satire.audio.cheer(action)   réaction après le geste
 *   Satire.audio.tick(genre)     ponctuation (type, shape, vertex)
 *   Satire.on(fn)                humeur de la salle, pour animer l'interface
 */
(() => {
  'use strict';

  const BASE = 'sound/';
  const FILES = {
    // Rires et applaudissements réels (archive.org, USC Cinema Archive, CC0/Domaine public)
    // Seules restent les prises sans aucune parole : les annonces de prise (« 28 », « take 1 »…),
    // les « hip hip hourra » et les exclamations ont été écartés (sound/retires-paroles/).
    clap_real_ironic: 'clap_real_ironic.mp3', laugh_02: 'laugh_02.mp3', laugh_03: 'laugh_03.mp3',
    laugh_04: 'laugh_04.mp3', laugh_05: 'laugh_05.mp3', laugh_06: 'laugh_06.mp3', laugh_08: 'laugh_08.mp3', laugh_09: 'laugh_09.mp3',
    laugh_10: 'laugh_10.mp3', laugh_11: 'laugh_11.mp3', laugh_12: 'laugh_12.mp3',
    laugh_13: 'laugh_13.mp3', laugh_14: 'laugh_14.mp3', laugh_15: 'laugh_15.mp3',
    laugh_16: 'laugh_16.mp3', laugh_17: 'laugh_17.mp3', laugh_20: 'laugh_20.mp3',
    applause_01: 'applause_01.mp3', applause_02: 'applause_02.mp3', applause_03: 'applause_03.mp3',
    applause_04: 'applause_04.mp3', applause_05: 'applause_05.mp3', applause_06: 'applause_06.mp3',
    applause_07: 'applause_07.mp3', applause_08: 'applause_08.mp3', applause_09: 'applause_09.mp3',
    applause_10: 'applause_10.mp3', applause_11: 'applause_11.mp3', applause_12: 'applause_12.mp3', applause_14: 'applause_14.mp3',
    // Bruitages comiques synthétiques (ponctuations, pas de foule)
    festive_rimshot_badumtss: 'festive_rimshot_badumtss.wav',
    festive_party_horn: 'festive_party_horn.wav',
    festive_kazoo_fanfare: 'festive_kazoo_fanfare.wav',
    festive_confetti_pop: 'festive_confetti_pop.wav',
    gameshow_win_ding: 'gameshow_win_ding.wav',
    gameshow_sad_trombone: 'gameshow_sad_trombone.wav',
    // Ponctuations d'action (synthèse DSP)
    type_click: 'type_click.wav',
    shape_pop: 'shape_pop.wav',
    oh_no: 'oh_no.wav',
    // Sélections : sons abstraits et rigolos, un par pictogramme (synthèse DSP)
    sel_lasso: 'sel_lasso.wav',
    sel_marquee: 'sel_marquee.wav',
    sel_eraser: 'sel_eraser.wav',
    sel_pencil: 'sel_pencil.wav',
    sel_brush: 'sel_brush.wav',
    sel_bucket: 'sel_bucket.wav',
    sel_spray: 'sel_spray.wav',
    sel_line: 'sel_line.wav',
    sel_rect: 'sel_rect.wav',
    sel_rrect: 'sel_rrect.wav',
    sel_oval: 'sel_oval.wav',
    sel_polygon: 'sel_polygon.wav',
    sel_freeform: 'sel_freeform.wav',
    sel_text: 'sel_text.wav',
    sel_hand: 'sel_hand.wav',
    // Dessin : boucles de texture distinctes par outil de dessin (synthèse DSP)
    draw_pencil: 'draw_pencil.wav',
    draw_brush: 'draw_brush.wav',
    draw_spray: 'draw_spray.wav',
    draw_eraser: 'draw_eraser.wav',
    draw_line: 'draw_line.wav',
    draw_rect: 'draw_rect.wav',
    draw_rrect: 'draw_rrect.wav',
    draw_oval: 'draw_oval.wav',
    draw_polygon: 'draw_polygon.wav',
    draw_freeform: 'draw_freeform.wav',
    // Surprises et suspense (synthèse DSP, sound/synth/make_surprise_sounds.py)
    fx_drumroll: 'fx_drumroll.wav', fx_cymbal: 'fx_cymbal.wav',
    fx_slide_up: 'fx_slide_up.wav', fx_slide_down: 'fx_slide_down.wav',
    fx_boing: 'fx_boing.wav', fx_quack: 'fx_quack.wav', fx_pouet: 'fx_pouet.wav',
    fx_cuckoo: 'fx_cuckoo.wav', fx_wolf: 'fx_wolf.wav', fx_glug: 'fx_glug.wav',
    fx_scratch: 'fx_scratch.wav', fx_kaching: 'fx_kaching.wav',
    fx_marimba: 'fx_marimba.wav', fx_crickets: 'fx_crickets.wav',
    // Nightmare! : sons originaux façon jeu de tir des années 1990, et lecteur de disquette
    // (synthèse, sound/synth/make_nightmare_sounds.py)
    nm_shot: 'nm_shot.wav', nm_pump: 'nm_pump.wav', nm_growl: 'nm_growl.wav', nm_roar: 'nm_roar.wav',
    nm_pain: 'nm_pain.wav', nm_door: 'nm_door.wav', fx_floppy: 'fx_floppy.wav',
    nm_scream: 'nm_scream.wav', nm_scream2: 'nm_scream2.wav', nm_boom: 'nm_boom.wav',
    nm_music: 'nm_gabber_loop.mp3',
    // Arsenal : rechargements, balles et explosions
    nm_cock: 'nm_cock.wav', nm_reload: 'nm_reload.wav', nm_shells: 'nm_shells.wav', nm_casings: 'nm_casings.wav',
    nm_pistol: 'nm_pistol.wav', nm_chaingun: 'nm_chaingun.wav', nm_double: 'nm_double.wav', nm_plasma: 'nm_plasma.wav',
    nm_ricochet: 'nm_ricochet.wav', nm_whizz: 'nm_whizz.wav', nm_impact: 'nm_impact.wav',
    nm_rocket: 'nm_rocket.wav', nm_barrel: 'nm_barrel.wav', nm_bigboom: 'nm_bigboom.wav'
  };

  const SEL = {
    lasso: 'sel_lasso', marquee: 'sel_marquee', eraser: 'sel_eraser',
    pencil: 'sel_pencil', brush: 'sel_brush', bucket: 'sel_bucket',
    spray: 'sel_spray', line: 'sel_line', rect: 'sel_rect',
    rrect: 'sel_rrect', oval: 'sel_oval', polygon: 'sel_polygon',
    freeform: 'sel_freeform', text: 'sel_text', hand: 'sel_hand'
  };
  const DRAW = {
    pencil: 'draw_pencil', brush: 'draw_brush', spray: 'draw_spray',
    eraser: 'draw_eraser', line: 'draw_line', rect: 'draw_rect',
    rrect: 'draw_rrect', oval: 'draw_oval', polygon: 'draw_polygon',
    freeform: 'draw_freeform'
  };

  /* Les réactions de foule (applaudissements/rires) avec escalade. */
  const CATEGORIES = {
    ironic: ['clap_real_ironic', 'gameshow_sad_trombone'],
    polite: ['applause_11', 'applause_12', 'applause_14', 'gameshow_win_ding'],
    laugh: ['laugh_02', 'laugh_03', 'laugh_04', 'laugh_05', 'laugh_06', 'laugh_08', 'laugh_09', 'laugh_10', 'laugh_11', 'laugh_12', 'laugh_13', 'laugh_14', 'laugh_15', 'laugh_16', 'laugh_17', 'laugh_20', 'festive_rimshot_badumtss'],
    hysteria: ['applause_01', 'applause_02', 'applause_03', 'applause_04', 'applause_05', 'applause_06', 'applause_07', 'applause_08', 'applause_09', 'applause_10', 'festive_party_horn', 'festive_kazoo_fanfare', 'festive_confetti_pop']
  };

  const SURPRISES = ['fx_quack', 'fx_pouet', 'fx_cuckoo', 'fx_wolf', 'fx_slide_up', 'fx_slide_down', 'fx_boing'];
  /* Gamme pentatonique (en demi-tons) : les ponctuations montent quand on
     enchaîne les gestes en rythme. */
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const semis = n => Math.pow(2, n / 12);
  const pentaRate = i => semis(PENTA[Math.max(0, i) % PENTA.length] - 5);

  let enabled = true;
  const now = () => performance.now();
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp01 = v => Math.max(0, Math.min(1, v));
  function normTool(t) { return String(t).replace(/Fill$/, ''); }

  /* ------------------------------------------------------------------ *
   *  Humeur de la salle : l'interface s'y abonne pour s'animer.
   * ------------------------------------------------------------------ */
  const listeners = [];
  function on(fn) { if (typeof fn === 'function') listeners.push(fn); }
  function emit(type, data) {
    for (const fn of listeners) { try { fn(type, data || {}); } catch (e) {} }
  }

  /* ------------------------------------------------------------------ *
   *  Sortie Web Audio : bus → compresseur → haut-parleurs
   * ------------------------------------------------------------------ */
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  const bus = {};
  const buffers = {};
  try {
    if (AC && location.protocol !== 'file:') {
      ctx = new AC({ latencyHint: 'interactive' });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5;
      comp.attack.value = 0.004; comp.release.value = 0.22;
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp); comp.connect(ctx.destination);
      for (const name of ['crowd', 'fx', 'loop']) {
        bus[name] = ctx.createGain();
        bus[name].connect(master);
      }
      // iPhone : même comportement que les éléments <audio> (son joué même
      // avec le commutateur silencieux).
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    }
  } catch (e) { ctx = null; }

  function decode(data) {
    return new Promise(function (resolve, reject) {
      const p = ctx.decodeAudioData(data, resolve, reject);
      if (p && p.catch) p.catch(reject);
    });
  }
  if (ctx) {
    const load = function (key, retries) {
      fetch(BASE + FILES[key])
        .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(decode)
        .then(b => { buffers[key] = b; })
        .catch(function () { if (retries > 0) setTimeout(load, 1500, key, retries - 1); });
    };
    for (const key in FILES) load(key, 2);
    const unlock = function () {
      if (ctx.state !== 'running' && enabled && !document.hidden) { try { ctx.resume(); } catch (e) {} }
    };
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'])
      window.addEventListener(type, unlock, { capture: true, passive: true });
  }

  /* ------------------------------------------------------------------ *
   *  Voix : une lecture, avec un gain et une vitesse pilotables en douceur.
   *  Deux fabrications (Web Audio ou <audio>), une seule interface.
   * ------------------------------------------------------------------ */
  const active = new Set();
  const htmlPool = {};

  const reversedBuffers = {};
  function reversed(key) {
    if (!reversedBuffers[key]) {
      const b = buffers[key], r = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
      for (let c = 0; c < b.numberOfChannels; c++) r.getChannelData(c).set(Float32Array.from(b.getChannelData(c)).reverse());
      reversedBuffers[key] = r;
    }
    return reversedBuffers[key];
  }

  /* On n'entend presque jamais deux fois le même son. Chaque fichier a un
     « sac » de variantes (hauteur × couleur × sens de lecture) mélangé et vidé
     une à une : une variante ne revient qu'une fois toutes les autres jouées.
       'pitch' : hauteur, couleur, et lecture à l'envers pour les sons courts
       'color' : couleur seule (la hauteur porte déjà un sens : gamme, montée)
       'crowd' : foule — variations légères, départ décalé                    */
  function shuffled(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  const bags = {};
  function draw(name, make) {                 // tirage sans remise, sans doublon d'un sac au suivant
    let b = bags[name];
    if (!b || !b.left.length) {
      const left = shuffled(typeof make === 'function' ? make() : make);
      if (b && left.length > 1 && left[left.length - 1] === b.last) left.unshift(left.pop());
      b = bags[name] = { left, last: b ? b.last : undefined };
    }
    return (b.last = b.left.pop());
  }
  const RATES = [0.75, 0.84, 0.94, 1, 1.12, 1.26, 1.41];
  const COLORS = [null, null, ['lowpass', 1400, 1], ['lowpass', 3000, 2], ['highpass', 700, 1], ['highpass', 1900, 1.5], ['bandpass', 900, 1.2], ['bandpass', 2300, 1.6], ['peaking', 1500, 2]];
  const CROWD_COLORS = [null, null, null, ['lowpass', 5200, 0.7], ['lowpass', 2900, 0.7], ['highpass', 380, 0.7]];
  function variants(mode, short) {
    const list = [];
    if (mode === 'crowd') { for (const r of [0.92, 0.96, 1, 1.04, 1.09]) for (const c of CROWD_COLORS) list.push({ rate: r, color: c }); return list; }
    if (mode === 'color') { for (const c of COLORS) for (const r of [0.985, 1, 1.015]) list.push({ rate: r, color: c }); return list; }
    for (const r of RATES) for (const c of COLORS) {
      list.push({ rate: r, color: c });
      if (short && c === null) list.push({ rate: r, color: null, reverse: true });
    }
    return list;
  }
  function mutate(key, opts, mode) {
    const short = !opts.loop && buffers[key] && buffers[key].duration < 1.3;
    const m = draw('v:' + mode + ':' + key, function () { return variants(mode, short); });
    opts.rate *= m.rate;
    opts.reverse = !!m.reverse;
    if (m.color) {
      opts.color = m.color;
      opts.gain *= m.color[0] === 'bandpass' ? 1.6 : m.color[0] === 'highpass' ? 1.25 : 1;
    }
    if (mode === 'crowd') opts.offset = rand(0, 0.25);
    else if (mode === 'pitch' && !opts.loop && Math.random() < 0.12) opts.echo = rand(0.1, 0.2);
  }

  function webVoice(key, o) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = o.reverse ? reversed(key) : buffers[key];
    src.loop = !!o.loop;
    src.playbackRate.value = o.rate;
    if (o.fadeIn) { g.gain.value = 0; g.gain.setTargetAtTime(o.gain, t, o.fadeIn / 3); }
    else g.gain.value = o.gain;
    const out = bus[o.bus] || bus.fx;
    let tail = g;
    if (o.color) {                                               // couleur : un filtre tiré au sort
      const f = ctx.createBiquadFilter();
      f.type = o.color[0]; f.frequency.value = o.color[1]; f.Q.value = o.color[2] || 0.7;
      g.connect(f); tail = f;
    }
    src.connect(g); tail.connect(out);
    let echo = null;
    if (o.echo) {                                                // parfois, un écho de salle vide
      echo = ctx.createDelay(0.5); echo.delayTime.value = o.echo;
      const back = ctx.createGain(); back.gain.value = 0.33;
      tail.connect(echo); echo.connect(back); back.connect(echo); echo.connect(out);
    }
    const v = {
      key, t0: now(), dur: src.buffer.duration / o.rate, ended: false,
      setGain(value, tau) { if (!v.ended) g.gain.setTargetAtTime(value, ctx.currentTime, tau || 0.05); },
      setRate(value, tau) { if (!v.ended) src.playbackRate.setTargetAtTime(value, ctx.currentTime, tau || 0.05); },
      stop(fade) {
        if (v.ended || v.stopping) return;
        v.stopping = true;
        const f = fade || 0.15, c = ctx.currentTime;
        try { g.gain.cancelScheduledValues(c); } catch (e) {}
        g.gain.setTargetAtTime(0, c, f / 5);
        try { src.stop(c + f); } catch (e) {}
      }
    };
    src.onended = function () {
      v.ended = true; active.delete(v);
      const release = function () { try { g.disconnect(); tail.disconnect(); if (echo) echo.disconnect(); } catch (e) {} };
      if (echo) setTimeout(release, 1200); else release();
    };
    src.start(0, o.offset ? Math.min(o.offset, src.buffer.duration * 0.3) : 0);
    active.add(v);
    return v;
  }

  function htmlVoice(key, o) {
    const list = htmlPool[key] || (htmlPool[key] = []);
    let a = list.find(x => x.ended || (x.paused && !x._busy));
    if (!a) { a = new Audio(BASE + FILES[key]); a.preload = 'auto'; list.push(a); }
    a._busy = true;
    let level = o.fadeIn ? 0 : o.gain, target = o.gain, tau = (o.fadeIn || 0.05) / 3, last = now(), stopAt = 0, frame = 0;
    const v = {
      key, t0: now(), dur: (isFinite(a.duration) && a.duration ? a.duration : 2.5) / o.rate, ended: false,
      setGain(value, t) { target = value; tau = t || 0.05; if (!frame && !v.ended) frame = requestAnimationFrame(step); },
      setRate(value) { try { a.playbackRate = Math.max(0.5, Math.min(2, value)); } catch (e) {} },
      stop(fade) {
        if (v.ended || v.stopping) return;
        v.stopping = true;
        const f = fade || 0.15;
        stopAt = now() + f * 1000; target = 0; tau = f / 5;
        if (!frame) frame = requestAnimationFrame(step);
      }
    };
    function finish() {
      if (v.ended) return;
      v.ended = true; a._busy = false; active.delete(v);
      try { a.pause(); a.loop = false; } catch (e) {}
    }
    function step() {
      frame = 0;
      if (v.ended) return;
      const t = now(), dt = (t - last) / 1000;
      last = t;
      level += (target - level) * (1 - Math.exp(-dt / tau));
      try { a.volume = clamp01(level); } catch (e) {}
      if (stopAt && t >= stopAt) { finish(); return; }
      if (stopAt || Math.abs(target - level) > 0.004) frame = requestAnimationFrame(step);
    }
    try {
      a.loop = !!o.loop;
      a.currentTime = 0;
      a.volume = clamp01(level);
      if ('preservesPitch' in a) a.preservesPitch = false;
      a.playbackRate = Math.max(0.5, Math.min(2, o.rate));
      a.onended = finish;
      const p = a.play();
      if (p && p.catch) p.catch(finish);
    } catch (e) { finish(); return v; }
    if (o.fadeIn) frame = requestAnimationFrame(step);
    active.add(v);
    return v;
  }
  if (!ctx) {
    // Sans Web Audio : précharge les fichiers comme avant.
    for (const key in FILES) { const a = new Audio(BASE + FILES[key]); a.preload = 'auto'; a.load(); htmlPool[key] = [a]; }
  }

  function voice(key, o) {
    if (!enabled || !FILES[key] || (difficulty === 0 && !(o && o.force))) return null;   // niveau 1 : l'application classique est muette (sauf l'écran d'accueil)
    o = o || {};
    const opts = {
      bus: o.bus || 'fx',
      gain: o.gain === undefined ? 0.8 : o.gain,
      rate: (o.rate || 1) * (1 + rand(-1, 1) * (o.vary === undefined ? 0.04 : o.vary)),
      loop: !!o.loop,
      fadeIn: o.fadeIn || 0
    };
    try {
      // « rate » fourni = hauteur voulue (gamme, montée) : on ne varie que la couleur.
      const mode = o.mutate === undefined ? (o.rate ? 'color' : 'pitch') : o.mutate;
      if (ctx) {
        if (!buffers[key]) return null;                          // pas encore décodé : silence plutôt qu'un retard
        if (mode) mutate(key, opts, mode);
        return webVoice(key, opts);
      }
      if (mode === 'pitch') opts.rate *= draw('h:' + key, RATES);
      return htmlVoice(key, opts);
    } catch (e) { return null; }
  }
  const alive = v => !!v && !v.ended && !v.stopping;

  /* Pour un même événement, plusieurs sons possibles, tirés sans remise. */
  const POOLS = {
    undo:   ['gameshow_sad_trombone', 'fx_slide_down', 'oh_no', 'fx_quack'],
    redo:   ['festive_rimshot_badumtss', 'fx_slide_up', 'festive_party_horn', 'festive_confetti_pop', 'fx_pouet'],
    fresh:  ['festive_kazoo_fanfare', 'festive_party_horn', 'festive_confetti_pop', 'fx_wolf', 'fx_cymbal'],
    text:   ['gameshow_win_ding', 'fx_kaching', 'fx_cuckoo', 'festive_confetti_pop', 'fx_slide_up'],
    fill:   ['fx_glug', 'sel_bucket', 'fx_glug', 'sel_oval'],
    erase:  ['oh_no', 'fx_slide_down', 'gameshow_sad_trombone'],
    save:   ['fx_kaching', 'gameshow_win_ding', 'festive_confetti_pop', 'festive_party_horn'],
    level:  ['fx_slide_down', 'fx_wolf', 'fx_quack', 'fx_pouet', 'fx_cuckoo'],
    dot:    ['fx_boing', 'shape_pop', 'sel_oval', 'sel_polygon', 'sel_text'],
    type:   ['type_click', 'sel_pencil', 'sel_hand', 'sel_rect'],
    shape:  ['shape_pop', 'sel_line', 'sel_text', 'sel_rect'],
    note:   ['fx_marimba', 'sel_line', 'fx_marimba', 'shape_pop'],
    ovation: ['fx_cymbal', 'festive_confetti_pop', 'festive_kazoo_fanfare', 'festive_party_horn'],
    rewind: ['fx_scratch', 'sel_lasso', 'sel_freeform'],
    bored:  ['fx_cuckoo', 'fx_wolf', 'fx_quack', 'fx_pouet'],
    land:   ['sel_rect', 'sel_hand', 'sel_rrect', 'shape_pop'],
    hop:    ['shape_pop', 'sel_pencil', 'type_click', 'sel_text', 'sel_marquee'],
    thump:  ['sel_hand', 'sel_rect', 'sel_rrect'],
    wave:   ['fx_slide_up', 'sel_lasso', 'sel_spray', 'sel_polygon'],
    snicker: ['sel_eraser', 'fx_quack', 'sel_oval', 'sel_freeform'],
    flinch: ['sel_spray', 'sel_freeform', 'sel_brush', 'sel_lasso'],
    swap:   ['fx_boing', 'sel_oval', 'sel_rrect', 'fx_pouet', 'sel_polygon'],
    droop:  ['sel_bucket', 'fx_slide_down', 'sel_brush'],
    move:   ['fx_scratch', 'sel_lasso', 'sel_brush', 'sel_freeform'],
    bounce: ['shape_pop', 'sel_rect', 'sel_hand', 'type_click', 'sel_pencil', 'sel_marquee'],
    spring: ['fx_boing', 'sel_oval', 'sel_bucket', 'fx_slide_up'],
    nm_draw: ['nm_shot', 'nm_double', 'nm_rocket', 'nm_barrel', 'nm_shot', 'nm_bigboom', 'nm_ricochet', 'nm_double'],   // fin de trait : ça explose
    nm_fire: ['nm_pistol', 'nm_chaingun', 'nm_plasma', 'nm_pistol', 'nm_chaingun', 'nm_whizz', 'nm_plasma'],           // début de trait : on tire
    nm_load: ['nm_cock', 'nm_reload', 'nm_pump', 'nm_shells', 'nm_cock', 'nm_casings', 'nm_reload'],                    // changement d'outil : on recharge
    nm_stray: ['nm_ricochet', 'nm_whizz', 'nm_impact', 'nm_casings', 'nm_whizz', 'nm_ricochet'],                        // balles perdues
    nm_hurt: ['nm_pain', 'nm_growl', 'nm_pain'],
    nm_beast: ['nm_growl', 'nm_roar', 'nm_door', 'nm_scream2'],
    nm_crowd: ['nm_scream', 'nm_boom', 'nm_scream2', 'nm_bigboom', 'nm_roar', 'nm_chaingun', 'nm_scream', 'nm_barrel', 'nm_growl', 'nm_rocket', 'nm_double']
  };
  function play(pool, o) { return fx(draw('p:' + pool, POOLS[pool]), o); }

  /* Bruitage ponctuel : la même touche rejouée remplace la précédente par un
     fondu très court, sans empilement ni clic. */
  const fxVoices = {};
  function fx(key, o) {
    const prev = fxVoices[key];
    if (alive(prev)) prev.stop(0.1);
    return (fxVoices[key] = voice(key, o));
  }

  /* ------------------------------------------------------------------ *
   *  Rythme de travail : énergie, cadence, enchaînements
   * ------------------------------------------------------------------ */
  let energy = 0, energyAt = now();
  let lastActionAt = 0, combo = 0, actions = 0, sinceSurprise = 0;
  let undoStreak = 0, undoAt = 0, redoStreak = 0, redoAt = 0;
  let hesitation = 0, hesitationAt = 0, vertexCount = 0;
  let idleTimer = 0, idleVoice = null, surpriseTimer = 0, undoVoice = null, redoVoice = null;

  function getEnergy() {
    const t = now();
    energy *= Math.pow(0.5, (t - energyAt) / 5000);   // retombe de moitié en 5 s
    energyAt = t;
    return energy;
  }
  function bump(amount) { energy = clamp01(getEnergy() + amount); return energy; }
  function categoryFor(e) {
    return e < 0.18 ? 'ironic' : e < 0.42 ? 'polite' : e < 0.72 ? 'laugh' : 'hysteria';
  }
  function action() {
    const t = now();
    combo = t - lastActionAt < 2600 ? combo + 1 : 0;
    lastActionAt = t;
    actions++; sinceSurprise++;
    hesitation = 0;
    wake();
    armIdle();
  }

  /* ------------------------------------------------------------------ *
   *  La foule : un tapis continu, jamais haché.
   * ------------------------------------------------------------------ */
  let crowdVoice = null, crowdTimer = 0, lastCrowdKey = '';

  function crowd(category, gain, chained) {
    if (!enabled) return;
    const t = now();
    // Réaction déjà en train de monter : on la gonfle au lieu d'en relancer une.
    if (!chained && alive(crowdVoice) && t - crowdVoice.t0 < (difficulty >= 4 ? 200 : 650)) {
      crowdVoice.setGain(Math.min(1, gain * 1.1), 0.12);
      return;
    }
    const hell = difficulty >= 4;                               // Nightmare! : plus de rires, des cris et des explosions
    const list = hell ? POOLS.nm_crowd : (CATEGORIES[category] || CATEGORIES.laugh);
    let key = draw('c:' + (hell ? 'hell' : category), list);
    if (key === lastCrowdKey && list.length > 1) key = draw('c:' + (hell ? 'hell' : category), list);
    lastCrowdKey = key;
    const prev = crowdVoice;
    const v = voice(key, { bus: 'crowd', gain: hell ? Math.min(1, gain * 1.15) : gain, fadeIn: chained && !hell ? 0.35 : 0.02, mutate: hell ? 'pitch' : 'crowd', vary: 0.02 });
    if (!v) return;
    crowdVoice = v;
    if (alive(prev) && !hell) prev.stop(chained ? 0.7 : 0.45);   // fondu enchaîné (en Nightmare!, tout se superpose)
    clearTimeout(crowdTimer);
    crowdTimer = setTimeout(sustain, Math.max(300, (v.dur - 0.7) * 1000));
    emit('crowd', { category, energy });
  }
  /* Tant que l'on travaille vite, la salle ne retombe pas entre deux gestes. */
  function sustain() {
    if (!enabled || document.hidden) return;
    const e = getEnergy();
    if (e > 0.5 && now() - lastActionAt < 2200) crowd(categoryFor(e), 0.35 + 0.35 * e, true);
  }

  /* ------------------------------------------------------------------ *
   *  Texture du geste : suit la vitesse du pointeur.
   * ------------------------------------------------------------------ */
  let stroke = null;        // geste en cours
  let lastStroke = null;    // bilan du dernier geste, lu par cheer('draw')
  const LOOP_GAIN = 0.55;

  function duck(down) {
    if (ctx && bus.crowd) bus.crowd.gain.setTargetAtTime(down ? 0.6 : 1, ctx.currentTime, down ? 0.07 : 0.25);
  }
  function loop(tool) {
    endStroke(true);
    wake();
    const name = normTool(tool), key = DRAW[name];
    const floor = name === 'spray' ? 0.85 : (name === 'line' || name === 'rect' || name === 'rrect' || name === 'oval') ? 0.4 : 0.22;
    stroke = {
      tool: name, floor, t0: now(), dist: 0, speed: 0, x: null, y: null, moveAt: 0, roll: null, rolled: false,
      base: draw('loopbase', [0.72, 0.82, 0.92, 1, 1.1, 1.22, 1.36]),
      voice: null,
      timer: setInterval(follow, 50)
    };
    if (difficulty >= 4) play('nm_fire', { gain: 0.5, vary: 0.1 });          // Nightmare! : chaque trait commence par un tir
    if (key) stroke.voice = voice(key, { bus: 'loop', loop: true, gain: LOOP_GAIN * floor, fadeIn: 0.05, vary: 0.03, rate: stroke.base * 0.9 });
    duck(true);
  }
  function onMove(e) {
    const s = stroke;
    if (!s) return;
    const t = now();
    if (s.x !== null) {
      const d = Math.hypot(e.clientX - s.x, e.clientY - s.y);
      const dt = Math.max(4, t - s.moveAt);
      const unit = 600 / Math.max(240, Math.min(window.innerWidth, window.innerHeight));
      s.dist += d * unit;
      s.speed += (clamp01(d * unit / dt / 1.5) - s.speed) * 0.4;
    }
    s.x = e.clientX; s.y = e.clientY; s.moveAt = t;
  }
  window.addEventListener('pointermove', onMove, { capture: true, passive: true });

  function follow() {
    const s = stroke;
    if (!s) return;
    const t = now(), elapsed = t - s.t0;
    if (t - s.moveAt > 80) s.speed *= 0.72;                      // le geste ralentit : le son aussi
    if (alive(s.voice)) {
      s.voice.setGain(LOOP_GAIN * (s.floor + (1 - s.floor) * s.speed), 0.06);
      s.voice.setRate(s.base * (0.9 + 0.32 * s.speed), 0.08);
    }
    /* Nightmare! : tant que le geste dure, les balles sifflent et ricochent, d'autant plus serrées qu'il est rapide. */
    if (difficulty >= 4 && s.speed > 0.15 && t - (s.strayAt || s.t0) > 520 - 300 * s.speed) { s.strayAt = t; play('nm_stray', { gain: 0.3 + 0.2 * s.speed, vary: 0.12 }); }
    // Un très long trait : la salle retient son souffle (roulement de tambour).
    if (!s.rolled && s.voice && elapsed > 2600 && s.dist > 300) {
      s.rolled = true;
      s.rollBase = draw('rollbase', [0.85, 0.93, 1, 1.08, 1.18]);
      s.roll = voice('fx_drumroll', { bus: 'fx', loop: true, gain: 0.05, fadeIn: 0.4, vary: 0, rate: s.rollBase });
      emit('suspense', {});
    }
    if (alive(s.roll)) {
      const k = clamp01((elapsed - 2600) / 5000);
      s.roll.setGain(0.08 + 0.42 * k, 0.2);
      s.roll.setRate(s.rollBase * (1 + 0.22 * k), 0.2);
    }
  }
  function endStroke(silent) {
    const s = stroke;
    if (!s) return;
    stroke = null;
    clearInterval(s.timer);
    if (alive(s.voice)) s.voice.stop(0.2);
    if (alive(s.roll)) s.roll.stop(0.09);
    duck(false);
    if (!silent) lastStroke = { dur: now() - s.t0, dist: s.dist, rolled: s.rolled, at: now() };
  }
  function loopStop() { endStroke(false); }

  /* ------------------------------------------------------------------ *
   *  Silence gêné : quand on s'arrête après avoir bien travaillé.
   * ------------------------------------------------------------------ */
  function wake() {
    if (alive(idleVoice)) idleVoice.stop(0.3);
    idleVoice = null;
  }
  function armIdle() {
    clearTimeout(idleTimer);
    if (actions < 4) return;
    idleTimer = setTimeout(function () {
      if (!enabled || document.hidden || stroke) return;
      idleVoice = voice('fx_crickets', { gain: 0.5, vary: 0.02 });
      emit('idle', {});
      if (difficulty === 3 && !chooser) trapHurry();          // on s'arrête ? « Dépêchez-vous ! »
      idleTimer = setTimeout(function () {
        if (!enabled || document.hidden || stroke) return;
        play('bored', { gain: 0.45 });
        emit('bored', {});
        actions = 0;                                             // puis on laisse l'artiste tranquille
      }, 9000 + rand(0, 4000));
    }, 9000 + rand(0, 3000));
  }

  /* ------------------------------------------------------------------ *
   *  API
   * ------------------------------------------------------------------ */
  /* Son abstrait à la sélection d'un pictogramme. À force d'hésiter entre
     les outils, la salle finit par ricaner. */
  function select(tool) {
    wake();
    const t = now();
    hesitation = t - hesitationAt < 1800 ? hesitation + 1 : 1;
    hesitationAt = t;
    fx(SEL[normTool(tool)] || 'sel_brush', { gain: 0.6, vary: 0.03, rate: 1 + Math.min(0.3, 0.04 * (hesitation - 1)), mutate: 'pitch' });
    if (difficulty >= 4) play('nm_load', { gain: 0.6, vary: 0.08 });        // on recharge
    emit('select', { tool: normTool(tool), hesitation });
    if (hesitation === 5) {
      crowd('laugh', 0.5);
      emit('mock', { reason: 'hesitation' });
      hesitation = 0;
    }
  }

  /* Ponctuation courte : frappe de lettre, forme terminée, sommet de polygone.
     Les formes et les sommets montent la gamme quand on les enchaîne. */
  function tick(kind) {
    if (kind === 'type') play('type', { gain: 0.5, vary: 0.08 });
    else if (kind === 'shape') play('shape', { gain: 0.6, vary: 0.01, rate: pentaRate(now() - lastActionAt < 2600 ? combo + 6 : 5) });
    else if (kind === 'vertex') {
      wake();
      vertexCount = now() - lastActionAt < 6000 ? vertexCount + 1 : 0;
      lastActionAt = now();
      play('note', { gain: 0.5, vary: 0, rate: pentaRate(vertexCount + 2) });
      emit('combo', { n: vertexCount });
    }
  }

/* Chaque animation de l'interface a son bruit : saut d'une case, ola,
     ricanement, sursaut, échange de cases, déménagement d'un bloc. Discrets,
     tirés dans un sac de sons par mouvement, et espacés d'au moins 120 ms. */
const MOTION = {
    hop: { gain: 0.22 }, thump: { gain: 0.3 }, wave: { gain: 0.26 }, snicker: { gain: 0.26 },
    flinch: { gain: 0.38 }, swap: { gain: 0.3 }, droop: { gain: 0.35 }, move: { gain: 0.32 },
    bounce: { gain: 0.34, gap: 45 }, spring: { gain: 0.3 }
  };
  const motionAt = {};
  let landTimer = 0;
  function motion(kind, force) {
    const m = MOTION[kind];
    if (!enabled || !m || document.hidden || difficulty === 0) return;
    const t = now();
    if (t - (motionAt[kind] || 0) < (m.gap || 120)) return;
    motionAt[kind] = t;
    // « force » (0 à 1) : un choc violent sonne plus fort et plus grave.
    const k = force === undefined ? 1 : clamp01(force);
    const v = play(kind, { gain: m.gain * (0.35 + 0.65 * k), vary: 0.1, mutate: 'pitch' });
    if (force !== undefined && v) v.setRate((1.5 - 0.7 * k) * rand(0.9, 1.1), 0.005);
    if (kind === 'move' && v) v.setRate(0.55, 0.01);             // un déménagement, ça traîne
    if (kind === 'move') {                                       // le bloc glisse… puis se pose
      clearTimeout(landTimer);
      landTimer = setTimeout(function () { if (enabled && !document.hidden) play('land', { gain: 0.5, vary: 0.05 }); }, 650);
    }
  }

  function surprise() {
    sinceSurprise = 0;
    clearTimeout(surpriseTimer);
    surpriseTimer = setTimeout(function () {
      if (!enabled || document.hidden) return;
      const key = draw('surprises', SURPRISES);
      fx(key, { gain: 0.5 });
      emit('surprise', { key });
    }, 320);
  }

  function cheerDraw() {
    const s = lastStroke && now() - lastStroke.at < 400 ? lastStroke : null;
    lastStroke = null;
    vertexCount = 0;
    // Un simple point : « boing », et la salle ne se dérange que si elle est chaude.
    if (s && s.dist < 5 && s.dur < 260) {
      const e = bump(0.05);
      play('dot', { gain: 0.4, rate: pentaRate(combo + 3), vary: 0.02 });
      if (e > 0.3) crowd(categoryFor(e), 0.3 + 0.4 * e);
      emit('cheer', { action: 'dot', energy: e, combo });
      return;
    }
    // Fin d'un long trait à suspense : cymbale et ovation.
    if (s && s.rolled) {
      const e = bump(0.45);
      play('ovation', { gain: 0.75, vary: 0.02 });
      crowd('hysteria', 0.95, true);
      emit('cheer', { action: 'ovation', energy: e, combo });
      return;
    }
    if (difficulty >= 4) play('nm_draw', { gain: 0.5, vary: 0.08 });        // Nightmare! : chaque trait est un coup de feu
    const size = s ? clamp01(s.dist / 900) : 0.3;
    const e = bump(0.1 + 0.08 * size);
    const category = categoryFor(e);
    crowd(category, 0.4 + 0.3 * e + 0.2 * size);
    if (combo >= 3) {                                            // en rythme : la gamme monte
      play('note', { gain: 0.28, vary: 0, rate: pentaRate(combo - 3) });
      emit('combo', { n: combo });
    }
    if (sinceSurprise >= 7 && Math.random() < 0.14) surprise();
    emit('cheer', { action: 'draw', category, energy: e, combo });
  }

  /* Réaction après le geste. */
  function cheer(kind) {
    const t = now();
    action();
    if (kind === 'draw' || kind === 'fill' || kind === 'erase' || kind === 'text') trapProgress();
    switch (kind) {
      case 'draw': cheerDraw(); return;
      case 'erase':
        lastStroke = null;
        bump(0.04);
        play(difficulty >= 4 ? 'nm_beast' : 'erase', { gain: 0.7, vary: 0.06 });
        break;
      case 'undo':
        // Une annulation : trombone triste. En rafale : on rembobine, de plus
        // en plus aigu, et la salle finit par se moquer.
        undoStreak = t - undoAt < 1500 ? undoStreak + 1 : 1;
        undoAt = t;
        if (undoStreak === 1) undoVoice = play(difficulty >= 4 ? 'nm_hurt' : 'undo', { gain: 0.72 });
        else {
          if (alive(undoVoice)) undoVoice.stop(0.25);
          play('rewind', { gain: 0.6, vary: 0.02, rate: Math.min(1.9, 1 + 0.12 * (undoStreak - 2)) });
        }
        if (undoStreak === 4) { crowd('laugh', 0.7); emit('mock', { reason: 'undo' }); }
        break;
      case 'redo':
        redoStreak = t - redoAt < 1500 ? redoStreak + 1 : 1;
        redoAt = t;
        if (redoStreak === 1) redoVoice = play('redo', { gain: 0.72 });
        else {
          if (alive(redoVoice)) redoVoice.stop(0.25);
          fx('fx_slide_up', { gain: 0.45, vary: 0.02, rate: Math.min(1.7, 1 + 0.1 * (redoStreak - 2)) });
        }
        break;
      case 'new': energy = 0; combo = 0; play('fresh', { gain: 0.8 }); break;
      case 'text': bump(0.1); play('text', { gain: 0.65 }); break;
      case 'fill':
        play('fill', { gain: 0.65, rate: pentaRate(combo + 4) / pentaRate(4) });
        crowd(categoryFor(bump(0.12)), 0.45);
        break;
      case 'save': play('save', { gain: 0.7 }); crowd('polite', 0.6); break;
      // L'interface franchit un palier d'insolence : sifflet descendant, la salle rit.
      case 'level': play(difficulty >= 4 ? 'nm_beast' : 'level', { gain: 0.55 }); crowd('laugh', 0.6); break;
      default: crowd('polite', 0.6);
    }
    emit('cheer', { action: kind, energy: getEnergy(), combo, streak: kind === 'undo' ? undoStreak : kind === 'redo' ? redoStreak : 0 });
  }

  /* Tout s'éteint en fondu (jamais de coupure nette). */
  function stopAll() {
    endStroke(true);
    clearTimeout(crowdTimer); clearTimeout(idleTimer); clearTimeout(surpriseTimer);
    for (const v of Array.from(active)) v.stop(0.18);
    idleVoice = null;
  }

  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) stopAll();
    musicSync();
  }

  document.addEventListener('visibilitychange', function () { if (document.hidden) stopAll(); });

  /* ------------------------------------------------------------------ *
   *  Difficulté : jusqu'où, et à quelle vitesse, l'interface se retourne
   *  contre l'utilisateur. Choisie à l'ouverture, modifiable par le menu.
   *    max  : palier d'insolence le plus haut que l'interface peut atteindre
   *    pace : multiplie le nombre de gestes nécessaires à chaque palier
   * ------------------------------------------------------------------ */
  const LEVELS = [
    { name: 'I\u2019m Too Young To Die', note: 'L’application classique, telle quelle : ni piège, ni mouvement, ni son.', max: 0, pace: 1 },
    { name: 'Hey, Not Too Rough', note: 'Tranquille : la salle rit et applaudit, les pictos vibrent et bondissent. Aucune fenêtre.', max: 1, pace: 1.2 },
    { name: 'Hurt Me Plenty', note: 'Les blocs déménagent pendant le travail. Ne penchez pas le pot de peinture.', max: 3, pace: 1 },
    { name: 'Ultra-Violence', note: 'Tout est fait pour vous ralentir : pièges, formulaires, disquette.', max: 4, pace: 0.6 },
    { name: 'Nightmare!', note: 'Tout éclate, tourne et tire : cris, explosions, gabber à fond.', max: 5, pace: 0.3 }
  ];
  const STEPS = [12, 25, 40, 60, 85];        // gestes accomplis avant chaque palier (au niveau Difficile)
  const STORE = 'macpaint-difficulte';
  let difficulty = 1, chooser = null;
  try {
    const asked = new URLSearchParams(location.search).get('difficulte');
    const saved = asked !== null ? asked : localStorage.getItem(STORE);
    if (saved !== null && LEVELS[+saved]) difficulty = +saved;
  } catch (e) {}
  /* Le logo en haut à gauche change de fruit avec le niveau : cerises
     (inoffensif), pomme (l'originale), citron (acide), piment (ça pique),
     ananas (hérissé). Dessins en pixels, « # » = encre. */
  const FRUITS = [
    ['.....###...', '....#..#...', '...#...#...', '..#....#...', '.###..###..', '#####.#####', '#####.#####', '#####.#####', '.###...###.'],
    ['.....##..', '....##...', '....#....', '.###.###.', '#########', '#######..', '#######..', '#########', '#########', '.#######.', '..##.##..'],
    ['........##...', '.......##....', '....#####....', '..#########..', '.###########.', '#############', '.###########.', '..#########..', '....#####....'],
    ['....##...', '.....#...', '...####..', '..#####..', '..####...', '.####....', '.###.....', '###......', '##.......', '#........'],
    ['.#..#..#.', '..#.#.#..', '...###...', '.#######.', '#.##.##.#', '#########', '##.##.##.', '#########', '#.##.##.#', '#########', '.##.##.#.', '..#####..']
  ];
  const FRUIT_NAMES = ['cerises', 'pomme', 'citron', 'piment', 'ananas'];
  function levelFor(gestures) {
    const d = LEVELS[difficulty];
    let level = 0;
    while (level < d.max && gestures >= Math.round(STEPS[level] * d.pace)) level++;
    return level;
  }
  /* On arrive toujours sur l'interface de base : rien ne bouge et aucune musique ne part
     tant que l'utilisateur n'a pas cliqué ou touché l'application. Le premier appui (hors
     écran de choix et fenêtres ajoutées) lâche tout. Changer de niveau remet à zéro. */
  let started = false, changedAt = -1e9;
  const ramp = () => Math.max(0, Math.min(1, (performance.now() - changedAt) / 1800));
  document.addEventListener('pointerdown', function (e) {
    if (started || chooser || difficulty === 0) return;
    if (e.target && e.target.closest && e.target.closest('.mp84,[data-macpaint-chooser]')) return;
    started = true; changedAt = performance.now();
    emit('start', { level: difficulty });
    musicSync();
  }, true);
  function setDifficulty(i) {
    if (!LEVELS[i]) return;
    /* Changement en cours de route : on garde l'interface telle qu'elle est et le nouveau
       niveau s'installe progressivement (ramp() passe de 0 à 1 en 1,8 s). Seul le retour au
       niveau 1 remet tout à plat. Avant le premier clic, on reste sur l'interface de base. */
    difficulty = i; changedAt = performance.now();
    if (i === 0) started = false;
    try { localStorage.setItem(STORE, String(i)); } catch (e) {}
    trapsClear();
    chronoSync();
    emit('difficulty', { level: i, name: LEVELS[i].name });
    musicSync();
  }
  /* L'écran s'efface en fondu et reste en place un quart de seconde : sur
     iPhone, le « clic » qui suit un toucher arrive après coup, et sans cela
     il traversait l'écran (un point sur la feuille, ou un niveau choisi par
     le toucher qui venait d'ouvrir le menu). */
  let chooserAt = 0;
  function closeChooser() {
    if (!chooser) return;
    const el = chooser;
    chooser = null;
    window.removeEventListener('keydown', chooserKeys, true);
    el.style.transition = 'opacity .2s';
    el.style.opacity = '0';
    setTimeout(function () { el.remove(); }, 260);
    musicSync();
  }
  /* Écran d'accueil : un tir quand on clique sur la disquette, puis, au choix du niveau, un
     carnage qui grossit avec le niveau. Sons d'armes et d'explosions synthétisés pour
     MacPain (aucun son repris d'un jeu existant). La fenêtre tremble avec. */
  const CARNAGE = [
    [['nm_cock', 0, 0.7], ['nm_pistol', 90, 0.9], ['nm_ricochet', 260, 0.6], ['nm_casings', 330, 0.5]],
    [['nm_pump', 0, 0.8], ['nm_double', 120, 1], ['nm_shells', 300, 0.6], ['nm_pain', 380, 0.7]],
    [['nm_reload', 0, 0.7], ['nm_chaingun', 110, 1], ['nm_impact', 420, 0.8], ['nm_growl', 520, 0.8], ['nm_casings', 600, 0.6]],
    [['nm_rocket', 0, 1], ['nm_barrel', 380, 1], ['nm_scream', 470, 0.9], ['nm_pain', 640, 0.8], ['nm_shells', 760, 0.6]],
    [['nm_double', 0, 1], ['nm_chaingun', 140, 1], ['nm_rocket', 260, 1], ['nm_bigboom', 620, 1], ['nm_scream2', 700, 1], ['nm_roar', 880, 1], ['nm_barrel', 1050, 0.9]]
  ];
  function blast(seq) { seq.forEach(function (q) { setTimeout(function () { voice(q[0], { gain: q[2], force: true, vary: 0.08 }); }, q[1]); }); }
  function quake(el, ms, amp) {
    if (!el || !el.animate) return;
    const k = []; for (let i = 0; i < 10; i++) k.push({ transform: i === 9 ? 'none' : 'translate(' + Math.round((Math.random() - 0.5) * 2 * amp) + 'px,' + Math.round((Math.random() - 0.5) * 2 * amp) + 'px)' });
    el.animate(k, { duration: ms, easing: 'steps(10,end)' });
  }
  function carnage(i) { blast(CARNAGE[Math.max(0, Math.min(CARNAGE.length - 1, i))]); }
  /* La disquette de l'accueil : dessinée point par point (grille de 28 cases, comme l'icône
     du Macintosh). Son nom est écrit dessous, comme sur le bureau de 1984 (floppyName). */
  function floppyCanvas() {
    const K = 4, N = 28, c = document.createElement('canvas'); c.width = (N - 2) * K; c.height = N * K;   // 26 cases de large : le bord droit est la dernière, l'icône est centrée
    const g = c.getContext('2d'), R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * K, y * K, w * K, h * K); };
    for (let y = 1; y < N - 1; y++) { const r = y < 5 ? 20 + y : N - 3; R(y < 2 ? 2 : 1, y, r - (y < 2 ? 2 : 1), 1, '#fff'); }   // le fond blanc, sans déborder du coin coupé
    R(2, 0, 19, 1, '#000'); R(0, 2, 1, N - 3, '#000'); R(1, 1, 1, 1, '#000'); R(1, N - 1, N - 4, 1, '#000');   // bord haut, gauche, bas
    R(21, 1, 1, 1, '#000'); R(22, 2, 1, 1, '#000'); R(23, 3, 1, 1, '#000'); R(24, 4, 1, 1, '#000');           // le coin coupé, en escalier
    R(N - 3, 5, 1, N - 6, '#000');                                                                                 // bord droit
    R(6, 1, 1, 9, '#000'); R(20, 1, 1, 9, '#000'); R(7, 10, 13, 1, '#000');                                       // le volet métallique
    R(15, 3, 3, 1, '#000'); R(15, 8, 3, 1, '#000'); R(15, 3, 1, 6, '#000'); R(17, 3, 1, 6, '#000');               // sa fenêtre
    R(5, 14, 17, 1, '#000'); R(5, 14, 1, 13, '#000'); R(21, 14, 1, 13, '#000');                                   // l'étiquette
    return c;
  }
  /* Le nom sous l'icône, comme dans le Finder : Chicago, noir sur un cartouche blanc. Chaque
     point de la police vaut deux points du dessin (la moitié d'une case de la disquette), pour rester à l'échelle de la disquette. */
  function floppyName(label) {
    const eng = window.MacPaint && typeof window.MacPaint.bitmapText === 'function' ? window.MacPaint : null, Z = 2, c = document.createElement('canvas');
    if (eng) {
      /* On cadre sur l'encre réelle des lettres (le dessin de la police porte des marges
         inégales) : même blanc à gauche et à droite, en haut et en bas. */
      const b = eng.bitmapText(label, 'Chicago', 12, false), padX = 4, padY = 2;
      let x0 = b.w, x1 = -1, y0 = b.h, y1 = -1;
      for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) if (b.bits[j * b.w + i]) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
      if (x1 < 0) { x0 = 0; x1 = b.w - 1; y0 = 0; y1 = b.h - 1; }
      c.width = (x1 - x0 + 1 + padX * 2) * Z; c.height = (y1 - y0 + 1 + padY * 2) * Z;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) if (b.bits[j * b.w + i]) g.fillRect((padX + i - x0) * Z, (padY + j - y0) * Z, Z, Z);
    } else {
      c.width = 108; c.height = 30; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#000'; g.font = '22px MacPainChicago,Chicago,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 54, 16);
    }
    return c;
  }
  function chooserKeys(e) {
    e.stopImmediatePropagation();
    if (chooser && chooser.splash && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); chooser.open(); return; }   // l'accueil : Entrée ou Espace tire
    if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); closeChooser(); }
    else if (e.key >= '1' && e.key <= String(LEVELS.length)) { if (chooser && chooser.splash) return; setDifficulty(+e.key - 1); carnage(+e.key - 1); closeChooser(); }
  }
  /* ------------------------------------------------------------------ *
   *  Kit « vrais pixels ». Pour que les fenêtres ajoutées soient une vraie
   *  simulation du Macintosh de 1984, ni le texte ni les contrôles ne sont
   *  dessinés par le navigateur (qui lisse les lettres et les courbes) :
   *    - chaque mot est un petit canevas tracé avec les polices bitmap
   *      d'origine du moteur (Chicago 12, Geneva 9), agrandi sans lissage ;
   *    - chaque bouton arrondi est tracé point par point (contour d'un
   *      pixel, anneau de trois pixels pour le bouton par défaut, vidéo
   *      inverse quand il est enfoncé ou choisi) ;
   *    - le texte « grisé » est une trame d'un pixel sur deux ;
   *    - filets, barres de titre et cases suivent la taille du pixel Mac
   *      (variable CSS --px), la même que celle de l'écran simulé.
   *  Le texte d'origine reste dans la page, invisible, pour les lecteurs
   *  d'écran. Un observateur redessine tout ce qui change.
   * ------------------------------------------------------------------ */
  const Px = (function () {
    let S = 1;
    const roots = new Map();                     // racine observée → options
    const engine = () => window.MacPaint && typeof window.MacPaint.bitmapText === 'function' ? window.MacPaint : null;
    function scale() {
      const dpr = window.devicePixelRatio || 1, cv = document.getElementById('screen');
      // Version classique : exactement le pixel de l'écran simulé. iPhone : 1,5 pixel CSS environ,
      // arrondi à un nombre entier de pixels de l'appareil.
      if (cv && !cv.hidden && cv.clientWidth > 64 && cv.width) return Math.max(1, Math.round(cv.clientWidth / cv.width * dpr) / dpr);
      return Math.max(1, Math.round(dpr * 1.5)) / dpr;
    }
    function setScale() {
      S = scale();
      document.documentElement.style.setProperty('--px', S + 'px');
    }
    /* Un mot → un canevas. */
    function word(text, o) {
      const b = engine().bitmapText(text, o.font, o.size, false);
      const z = o.zoom, w = Math.max(1, b.adv + 1), h = b.h + (o.underline ? 1 : 0);
      const c = document.createElement('canvas');
      c.width = w * z; c.height = h * z;
      const g = c.getContext('2d');
      g.fillStyle = o.white ? '#fff' : '#000';
      const dx = 1 - b.pad;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        if (!b.bits[y * b.w + x]) continue;
        const X = x + dx;
        if (X < 0 || X >= w || (o.dim && ((X + y) & 1))) continue;
        g.fillRect(X * z, y * z, z, z);
      }
      if (o.underline) for (let x = 0; x < w; x++) if (!(o.dim && (x & 1))) g.fillRect(x * z, (b.asc + 1) * z, z, z);
      /* pointer-events:none : le mot dessiné ne doit jamais être la cible du toucher. Il est
         redessiné quand le bouton s'enfonce ; s'il était la cible, le navigateur perdrait le clic. */
      c.style.cssText = 'pointer-events:none;display:inline-block;vertical-align:middle;image-rendering:pixelated;image-rendering:crisp-edges;width:' + (c.width * S) + 'px;height:' + (c.height * S) + 'px';
      c.setAttribute('aria-hidden', 'true');
      return { canvas: c, space: engine().bitmapText(' ', o.font, o.size, false).adv * z };
    }
    function styleOf(el) {
      const cs = getComputedStyle(el), kind = cs.getPropertyValue('--pxf').trim() || 'chicago';
      const rgb = (cs.color.match(/\d+(\.\d+)?/g) || [0, 0, 0]).map(Number);
      return {
        font: kind === 'geneva' ? 'Geneva' : 'Chicago', size: kind === 'geneva' ? 9 : 12, zoom: kind === 'big' ? 2 : 1,
        white: rgb[0] > 128 && rgb[1] > 128 && rgb[2] > 128,
        dim: !!el.closest('.mp84-dim,.dim,:disabled'),
        underline: /underline/.test(cs.textDecorationLine || cs.textDecoration || ''),
        nowrap: cs.whiteSpace === 'nowrap'
      };
    }
    /* Remplace un nœud de texte par ses mots dessinés (le texte reste, caché). */
    function convert(node) {
      const parent = node.parentNode;
      if (!parent || !engine() || parent.closest('.pxt,textarea,select,option,input,script,style')) return;
      const text = node.nodeValue;
      if (!text || !text.trim()) return;
      const wrap = document.createElement('span');
      wrap.className = 'pxt';
      const keep = document.createElement('span');
      keep.className = 'pxh'; keep.textContent = text;
      wrap.append(keep);
      wrap._text = text;
      parent.replaceChild(wrap, node);
      draw(wrap);
    }
    function draw(wrap) {
      if (!engine() || !wrap.isConnected) return;
      const o = styleOf(wrap.parentNode), text = wrap._text.replace(/’/g, "'").replace(/…/g, '...').replace(/×/g, 'x').replace(/−/g, '-').replace(/[←-⇿]/g, '').replace(/œ/g, 'oe');   // signes absents des polices de 1984
      for (const old of Array.from(wrap.querySelectorAll('canvas'))) old.remove();
      const lead = /^\s/.test(text), tail = /\s$/.test(text), words = text.trim().split(/\s+/);
      const keep = wrap.firstChild, frag = document.createDocumentFragment();
      const parts = o.nowrap ? [words.join(' ')] : words;
      parts.forEach(function (w, i) {
        const r = word(w, o);
        if (i === 0 && lead) r.canvas.style.marginLeft = (r.space * S) + 'px';
        if (i < parts.length - 1 || tail) r.canvas.style.marginRight = (r.space * S) + 'px';
        frag.append(r.canvas);
      });
      wrap.insertBefore(frag, keep);
    }
    function texts(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [];
      while (walker.nextNode()) list.push(walker.currentNode);
      for (const n of list) if (!n.parentNode.closest('.pxh')) convert(n);
    }
    /* Rectangle arrondi plein, tracé rangée par rangée (pas de lissage). */
    function rr(g, x, y, w, h, r, color) {
      g.fillStyle = color;
      r = Math.max(0, Math.min(r, Math.floor(Math.min(w, h) / 2)));
      for (let j = 0; j < h; j++) {
        const d = j < r ? r - j - 0.5 : j >= h - r ? j - (h - r) + 0.5 : 0;
        const inset = d ? Math.round(r - Math.sqrt(Math.max(0, r * r - d * d))) : 0;
        g.fillRect(x + inset, y + j, w - 2 * inset, 1);
      }
    }
    /* Habille un bouton arrondi : fond dessiné à sa taille exacte, en pixels Mac. */
    function skin(b) {
      const w = Math.round(b.offsetWidth / S), h = Math.round(b.offsetHeight / S);
      if (w < 6 || h < 6) return;
      const def = b.matches('.mp84-default,.primary'), inv = b.matches('.mp84-inverse,[aria-pressed=true],.chosen,[data-down]');
      const key = w + 'x' + h + (def ? 'd' : '') + (inv ? 'i' : '') + S;
      if (b._skin === key) return;
      b._skin = key;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      let x = 0, y = 0, W = w, H = h;
      if (def) {                                    // anneau de 3 pixels, 1 pixel de blanc, puis le bouton
        rr(g, 0, 0, w, h, 12, '#000'); rr(g, 3, 3, w - 6, h - 6, 9, '#fff');
        x = 4; y = 4; W = w - 8; H = h - 8;
      }
      rr(g, x, y, W, H, 8, '#000');
      if (!inv) rr(g, x + 1, y + 1, W - 2, H - 2, 7, '#fff');
      b.style.backgroundImage = 'url(' + c.toDataURL() + ')';
    }
    function skins(root, o) {
      if (!o.buttons) return;
      for (const b of root.querySelectorAll(o.buttons)) { if (!b._px) { b._px = true; b.classList.add('px-rr'); } skin(b); }
    }
    function press(root) {                           // enfoncé = vidéo inverse, comme sur le Mac
      let held = null;
      const up = function () { if (held) held.removeAttribute('data-down'); held = null; };
      root.addEventListener('pointerdown', function (ev) {
        up();
        const b = ev.target.closest && ev.target.closest('button,[role=button]');
        if (b && root.contains(b) && !b.disabled) { held = b; b.setAttribute('data-down', ''); }
      });
      for (const t of ['pointerup', 'pointercancel', 'pointerleave']) root.addEventListener(t, up);
    }
    let queued = false;
    function later() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        for (const [root, o] of roots) {
          if (!root.isConnected) continue;                        // pas encore (ou plus) dans la page
          for (const w of root.querySelectorAll('.pxt')) if (!w.querySelector('canvas')) draw(w);   // texte préparé hors de la page
          skins(root, o);
        }
      });
    }
    function redraw(el) { for (const w of el.querySelectorAll('.pxt')) draw(w); }
    /* Surveille une fenêtre : tout texte qui y apparaît ou y change est redessiné. */
    function watch(root, options) {
      if (!root || roots.has(root)) return;
      const o = options || {};
      roots.set(root, o);
      setScale();
      press(root);
      texts(root);
      new MutationObserver(function (list) {
        for (const m of list) {
          if (m.type === 'childList') {
            for (const n of m.addedNodes) {
              if (n.nodeType === 3) { if (!n.parentNode || !n.parentNode.closest('.pxh')) convert(n); }
              else if (n.nodeType === 1 && !n.classList.contains('pxt') && n.tagName !== 'CANVAS') texts(n);
            }
          } else if (m.type === 'characterData') {
            if (m.target.parentNode && !m.target.parentNode.closest('.pxh')) convert(m.target);
          } else if (m.target.nodeType === 1 && !m.target.classList.contains('pxt')) redraw(m.target);   // couleur ou état changé
        }
        later();
      }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'aria-expanded', 'disabled', 'data-down', 'data-pxf', 'hidden', 'open'] });
      if (window.ResizeObserver) new ResizeObserver(later).observe(root);
      later();
    }
    function refresh() {
      const before = S;
      setScale();
      for (const [root, o] of roots) {
        if (!root.isConnected) continue;
        if (S !== before) redraw(root);
        skins(root, o);
      }
    }
    window.addEventListener('resize', function () { setTimeout(refresh, 60); });
    /* Petites images de la case à cocher (vide, cochée d'une croix), 12 × 12 pixels. */
    function checkImage(on) {
      const c = document.createElement('canvas');
      c.width = c.height = 12;
      const g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, 12, 12);
      g.fillStyle = '#fff'; g.fillRect(1, 1, 10, 10);
      g.fillStyle = '#000';
      if (on) for (let i = 1; i < 11; i++) { g.fillRect(i, i, 1, 1); g.fillRect(11 - i, i, 1, 1); }
      return 'url(' + c.toDataURL() + ')';
    }
    function tickImage() {
      const rows = ['........#', '.......#.', '......#..', '#....#...', '##..#....', '.###.....', '..#......'];
      const c = document.createElement('canvas');
      c.width = 9; c.height = 7;
      const g = c.getContext('2d');
      g.fillStyle = '#000';
      rows.forEach(function (row, y) { for (let x = 0; x < 9; x++) if (row[x] === '#') g.fillRect(x, y, 1, 1); });
      return 'url(' + c.toDataURL() + ')';
    }
    function install() {
      setScale();
      const st = document.documentElement.style;
      st.setProperty('--px-tick', tickImage());
      st.setProperty('--px-check', checkImage(false));
      st.setProperty('--px-checked', checkImage(true));
    }
    return { watch, refresh, install, scale: () => S };
  })();

  /* Toutes les fenêtres ajoutées par ce fichier sont dessinées comme sur le
     Macintosh de 1984 : noir et blanc seulement, police Chicago sans lissage,
     boîtes d'alerte à double filet, fenêtres à barre de titre rayée et case de
     fermeture, boutons en rectangle arrondi au trait fin, bouton par défaut
     cerclé d'un trait épais, texte « grisé » en trame de points, case à cocher
     carrée marquée d'une croix, élément choisi en vidéo inverse. */
  const FONT = 'font:12px/1.4 MacPainChicago,Chicago,ui-monospace,Menlo,monospace;';
  const MAC_CSS = '@font-face{font-family:MacPainChicago;src:url(fonts/Chicago.woff2) format("woff2");font-display:block}' +
    '.pxt{white-space:normal}.pxh{font-size:0!important;line-height:0!important;color:transparent!important}' +
    '[data-pxf=geneva]{--pxf:geneva}[data-pxf=big]{--pxf:big}' +
    '.px-rr{border:0!important;border-radius:0!important;outline:0!important;box-shadow:none!important;background-color:transparent!important;background-repeat:no-repeat!important;background-position:0 0!important;background-size:100% 100%!important;image-rendering:pixelated;color:#000}' +
    '.px-rr.primary,.px-rr.mp84-default{padding:calc(var(--px)*8) calc(var(--px)*16)!important;margin:0!important}' +
    '.px-rr[aria-pressed=true],.px-rr.chosen,.px-rr[data-down],.px-rr.mp84-inverse{color:#fff!important}' +
    '.mp84,.mp84 *{font-family:MacPainChicago,Chicago,ui-monospace,Menlo,monospace;font-weight:400;letter-spacing:0}' +
    '.mp84{background:#fff;color:#000;font-size:12px;line-height:1;border:var(--px) solid #000;border-radius:0;padding:calc(var(--px)*11);box-shadow:inset 0 0 0 calc(var(--px)*2) #fff,inset 0 0 0 calc(var(--px)*4) #000}' +
    '.mp84-window{padding:0;box-shadow:var(--px) var(--px) 0 #000}' +
    '.mp84-title{display:flex;align-items:center;gap:calc(var(--px)*4);height:calc(var(--px)*19);padding:0 calc(var(--px)*6);border-bottom:var(--px) solid #000;background:repeating-linear-gradient(#fff 0 var(--px),#000 var(--px) calc(var(--px)*2)) 0 calc(var(--px)*4)/100% calc(var(--px)*11) no-repeat #fff}' +
    '.mp84-title>span{background:#fff;padding:0 calc(var(--px)*6);margin:0 auto;white-space:nowrap}' +
    '.mp84 button.mp84-close{width:calc(var(--px)*11);min-width:0;height:calc(var(--px)*11);min-height:0;padding:0;border:var(--px) solid #000;background:#fff;box-shadow:0 0 0 var(--px) #fff;flex:none}' +
    '.mp84-body{padding:calc(var(--px)*8)}' +
    '.mp84 button{-webkit-appearance:none;appearance:none;background:transparent none no-repeat 0 0/100% 100%;image-rendering:pixelated;color:#000;border:0;border-radius:0;outline:0;min-height:44px;padding:calc(var(--px)*4) calc(var(--px)*12);cursor:pointer}' +
    '.mp84 button.mp84-default{padding:calc(var(--px)*8) calc(var(--px)*16)}' +
    '.mp84 button.mp84-inverse,.mp84 button[data-down]{color:#fff}' +
    '.mp84 input[type=checkbox]{-webkit-appearance:none;appearance:none;width:calc(var(--px)*12);height:calc(var(--px)*12);margin:0;border:0;border-radius:0;background:var(--px-check) 0 0/100% 100% no-repeat;image-rendering:pixelated;flex:none}' +
    '.mp84 input[type=checkbox]:checked{background-image:var(--px-checked)}' +
    '.mp84 input[type=text]{-webkit-appearance:none;appearance:none;border:var(--px) solid #000;border-radius:0;background:#fff;color:#000;font-size:16px}' +
    '.mp84-chip{background:#fff;color:#000;font-size:12px;line-height:1;border:var(--px) solid #000;box-shadow:var(--px) var(--px) 0 #000;padding:calc(var(--px)*1) calc(var(--px)*6)}';
  const mac = t => String(t).replace(/\u2019/g, "'");
  function macStyle() {
    if (document.getElementById('macpain-1984') || !document.head) return;
    const st = document.createElement('style');
    st.id = 'macpain-1984'; st.textContent = MAC_CSS;
    document.head.append(st);
    Px.install();
  }
  function chooseDifficulty(splash) {
    if (chooser || !document.body || document.querySelector('[data-macpaint-chooser]')) return;
    splash = splash === true;
    const make = mk;
    macStyle();
    const font = FONT;
    chooser = make('div', 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;' +
      'background:repeating-conic-gradient(#000 0 25%,#fff 0 50%) 0 0/calc(var(--px)*2) calc(var(--px)*2);overflow:auto;-webkit-user-select:none;user-select:none;touch-action:manipulation');
    chooser.setAttribute('data-macpaint-chooser', ''); chooser.setAttribute('role', 'dialog'); chooser.setAttribute('aria-modal', 'true'); chooser.setAttribute('aria-label', 'Niveau de difficulté');
    const box = make('div', 'width:min(100%,calc(var(--px)*270));box-sizing:border-box');
    box.className = 'mp84';
    Px.watch(box, { buttons: 'button' });
    box.append(make('div', 'font-size:16px;text-align:center;margin-bottom:6px', 'Niveau de difficulté'),
      make('div', 'font-size:12px;text-align:center;margin-bottom:12px', 'Plus le niveau monte, plus l’interface travaille contre vous.'));
    LEVELS.forEach(function (level, i) {
      const b = make('button', 'display:block;width:100%;min-height:48px;margin:0 0 8px;padding:6px 12px;text-align:left');
      if (i === difficulty) b.className = 'mp84-inverse';
      b.type = 'button';
      b.setAttribute('data-difficulty', String(i));
      b.append(make('span', 'display:block', (i + 1) + '. ' + level.name), make('span', 'display:block;font-size:11px;margin-top:2px', level.note));
      b.addEventListener('click', function () {
        if (!chooser || now() - chooserAt < 400) return;         // clic fantôme du toucher précédent
        setDifficulty(i);
        carnage(i);                                              // carnage proportionnel au niveau
        quake(box, 260 + i * 110, 3 + i * 3);
        const el = chooser; setTimeout(function () { if (chooser === el) closeChooser(); }, 120 + i * 60);
      });
      box.append(b);
    });
    box.append(make('div', 'font-weight:400;font-size:11px;text-align:center', 'Modifiable à tout moment : menu du fruit, en haut à gauche.'));
    chooser.append(box);
    if (splash) {
      /* D'abord la disquette seule, qui rebondit sur place ; un clic tire et ouvre le menu. */
      box.style.display = 'none';
      const disk = make('button', 'background:none;border:0;padding:0;margin:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;-webkit-tap-highlight-color:transparent;outline:none');   // pas de liseré de focus du navigateur
      disk.type = 'button'; disk.setAttribute('aria-label', 'Ouvrir MacPain');
      const art = floppyCanvas();
      art.style.cssText = 'display:block;width:min(52vw,calc(var(--px)*156));height:auto;image-rendering:pixelated;image-rendering:crisp-edges;transform-origin:50% 100%';
      const name = floppyName('MacPain');                        // le nom, dessous, qui ne bouge pas
      name.style.cssText = 'display:block;width:min(' + (52 * name.width / art.width).toFixed(2) + 'vw,calc(var(--px)*' + (name.width * 1.5) + '));height:auto;margin-top:calc(var(--px)*8);image-rendering:pixelated;image-rendering:crisp-edges';
      disk.append(art, name);
      if (art.animate) art.animate([
        { transform: 'translateY(0) scale(1.06,0.92)', offset: 0 },
        { transform: 'translateY(-16%) scale(0.97,1.04)', offset: 0.32, easing: 'cubic-bezier(.3,0,.7,1)' },
        { transform: 'translateY(0) scale(1.06,0.92)', offset: 0.6 },
        { transform: 'translateY(-5%) scale(1,1)', offset: 0.75 },
        { transform: 'translateY(0) scale(1,1)', offset: 0.88 },
        { transform: 'translateY(0) scale(1,1)', offset: 1 }
      ], { duration: 1150, iterations: Infinity, easing: 'cubic-bezier(.2,.8,.4,1)' });
      const open = function () {
        if (!chooser || !chooser.splash || now() - chooserAt < 300) return;
        chooser.splash = false; chooserAt = now();
        blast([['nm_double', 0, 1], ['nm_shells', 220, 0.6]]);    // le coup de feu
        quake(chooser, 240, 6);
        disk.remove(); box.style.display = '';
        Px.refresh();
        const current = box.querySelector('[data-difficulty="' + difficulty + '"]');
        if (current) current.focus();
      };
      disk.addEventListener('click', open);
      chooser.splash = true; chooser.open = open;
      chooser.prepend(disk);
    }
    musicSync();
    chooserAt = now();
    for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'])
      chooser.addEventListener(type, function (ev) { ev.stopPropagation(); });
    document.body.append(chooser);
    window.addEventListener('keydown', chooserKeys, true);
    Px.refresh();
    const current = splash ? null : box.querySelector('[data-difficulty="' + difficulty + '"]');   // l'accueil : Entrée et Espace passent déjà par le clavier, pas besoin de focus visible
    if (current) current.focus();
  }
  try {
    if (!new URLSearchParams(location.search).has('difficulte')) {
      const first = function () { chooseDifficulty(true); };      // à l'arrivée : l'accueil à la disquette
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', first);
      else first();
    }
  } catch (e) {}


  window.addEventListener('blur', function () { endStroke(true); });

  /* ------------------------------------------------------------------ *
   *  Pièges d'interface, repris de User Inyerface (userinyerface.com) :
   *    - le bandeau au gros bouton « NON » qui ne fait rien, où seul un mot
   *      banal de la phrase (« ICI ») est le vrai lien ;
   *    - la case déjà cochée, formulée à l'envers ;
   *    - la fenêtre d'aide qui recouvre le travail, dont le gros bouton la
   *      déplace au lieu de la fermer (le vrai lien est minuscule) ;
   *    - le « dépêchez-vous » chronométré, où le bouton qui a l'air inactif
   *      est le bon et le bouton voyant relance tout ;
   *    - au dernier niveau, se tromper ouvre d'autres fenêtres.
   *  Garde-fous : aucun piège ne touche au dessin ni au réglage du son, les
   *  fenêtres ne recouvrent jamais tout l'écran, et Échap les ferme toutes.
   * ------------------------------------------------------------------ */
  const mk = (tag, css, text) => {
    const el = document.createElement(tag);
    const size = /font-size:(\d+)px/.exec(css);
    if (size) el.setAttribute('data-pxf', +size[1] <= 12 ? 'geneva' : +size[1] >= 20 ? 'big' : 'chicago');
    el.style.cssText = macWidth(css.replace(/font-size:\d+px;?/g, '').replace(/font-weight:\d+;?/g, ''));
    if (text) el.textContent = mac(text);
    return el;
  };
  const macWidth = css => css.replace(/min\((\d+)vw,(\d+)px\)/g, (m, vw, px) => 'min(' + vw + 'vw,calc(var(--px)*' + Math.round(px / 1.3) + '))');
  const traps = new Set();
  let trapGestures = 0, bannerDone = false, fooled = 0;
  const quiet = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function wobble(el) {
    if (el.animate && !quiet()) el.animate([{ transform: el._base || 'none' }, { transform: (el._base || '') + ' translateX(-7px) rotate(-1.5deg)' }, { transform: (el._base || '') + ' translateX(7px) rotate(1.5deg)' }, { transform: el._base || 'none' }], { duration: 260 });
  }
  /* L'utilisateur est tombé dans le panneau : la salle le lui fait savoir. */
  function gotcha(el) {
    wobble(el);
    motion('snicker');
    if (++fooled % 3 === 0) { crowd('laugh', 0.6); emit('mock', { reason: 'trap' }); }
  }
  function trapBox(css, label) {
    macStyle();
    const el = mk('div', 'position:fixed;z-index:99990;box-sizing:border-box;-webkit-user-select:none;user-select:none;touch-action:manipulation;' + css);
    el.className = 'mp84';
    Px.watch(el, { buttons: 'button:not(.mp84-close)' });
    el.setAttribute('data-macpaint-trap', label);
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', label);
    for (const type of ['pointerdown', 'pointerup', 'pointermove', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'keypress'])
      el.addEventListener(type, function (ev) { ev.stopPropagation(); });
    el._close = function () {
      traps.delete(el); clearInterval(el._timer); el.remove(); motion('hop');
      if (el._after) { const f = el._after; el._after = null; try { f(); } catch (e) {} }
    };
    document.body.append(el);
    traps.add(el);
    /* Application macOS : chaque piège devient une vraie fenêtre, par-dessus les autres. */
    if (window.MacPainNative && typeof window.MacPainNative.popup === 'function') { try { window.MacPainNative.popup(el); } catch (e) {} }
    motion('swap');
    return el;
  }
  const btn = (css, text, fn) => {
    const kind = /@(default|dim|inverse)/.exec(css);
    const b = mk('button', css.replace(/@(default|dim|inverse);?/g, '').replace(/font-size:1\dpx;?/g, ''));
    b.type = 'button';
    if (kind && kind[1] === 'dim') { const s = mk('span', '', text); s.className = 'mp84-dim'; b.append(s); }
    else b.textContent = mac(text);
    if (kind && kind[1] === 'default') b.className = 'mp84-default';
    if (kind && kind[1] === 'inverse') b.className = 'mp84-inverse';
    b.addEventListener('click', fn);
    return b;
  };
  const trapsNamed = label => Array.from(traps).filter(el => el.getAttribute('data-macpaint-trap') === label);
  const hasTrap = label => trapsNamed(label).length > 0;

  /* 1. Le bandeau : « NON » ne fait rien, seul « ICI » continue. */
  function trapBanner() {
    if (hasTrap('bandeau')) return;
    const el = trapBox('left:50%;bottom:10px;width:min(94vw,430px);transform:translateX(-50%);text-align:center', 'bandeau');
    el._base = 'translateX(-50%)';
    el.append(mk('div', 'font-weight:400;font-size:12px;margin-bottom:8px', 'Ce logiciel dépose des pixels sur votre feuille.'));
    el.append(btn('@inverse;display:block;width:100%;font-size:24px;margin-bottom:8px', 'NON', function () { gotcha(el); }));
    let refuse = null;
    if (difficulty >= 3) {                       // la case cochée d'avance, formulée à l'envers
      const line = mk('label', 'display:flex;align-items:center;gap:8px;justify-content:center;font-weight:400;font-size:12px;margin-bottom:8px;min-height:32px');
      refuse = document.createElement('input'); refuse.type = 'checkbox'; refuse.checked = true;
      refuse.style.cssText = '';
      line.append(refuse, document.createTextNode('Je n\'accepte pas de continuer'));
      el.append(line);
    }
    const phrase = mk('div', 'font-weight:400;font-size:13px;line-height:2');
    const word = (css, text, real) => { const s = mk('span', 'padding:6px 2px;cursor:pointer;' + css, text); s.setAttribute('role', 'button'); s.addEventListener('click', function () { if (real && !(refuse && refuse.checked)) el._close(); else gotcha(el); }); return s; };
    phrase.append('Veuillez ', word('text-decoration:underline', 'cliquer'), ' ', word('', 'ICI', true), ' pour ', word('font-size:16px', 'CONTINUER'));
    el.append(phrase);
  }

  /* 2. L'aide envahissante : le gros bouton la promène, le petit lien la ferme. */
  function trapHelp() {
    const open = trapsNamed('aide').length;
    if (open >= (difficulty >= 4 ? 3 : 1)) return;
    const el = trapBox('width:min(78vw,300px);left:' + Math.round(rand(4, 22)) + 'vw;top:' + Math.round(rand(18, 42)) + 'vh', 'aide');
    el.classList.add('mp84-window');
    const head = mk('div', ''), body = mk('div', '');
    head.className = 'mp84-title'; body.className = 'mp84-body';
    /* La case de fermeture, en haut à gauche comme sur un Mac, replie seulement la fenêtre. */
    const box = btn('', '', function () { body.hidden = !body.hidden; motion('hop'); });
    box.className = 'mp84-close'; box.setAttribute('aria-label', 'Replier');
    head.append(box, mk('span', '', 'Besoin d’aide ?'));
    body.append(mk('div', 'height:54px;border:1px solid #000;margin-bottom:10px'));
    const row = mk('div', 'display:flex;justify-content:space-between;align-items:flex-end;gap:8px');
    const real = mk('span', 'font-size:11px;text-decoration:underline;cursor:pointer;padding:10px 4px', 'non merci');
    real.setAttribute('role', 'button');
    real.addEventListener('click', function () { el._close(); });
    row.append(real, btn('@default;font-size:14px', 'Fermer ↓', function () {
      gotcha(el);
      el.style.transition = 'top 1.6s linear,left .5s';
      el.style.top = Math.round(rand(20, 58)) + 'vh'; el.style.left = Math.round(rand(2, 24)) + 'vw';
      if (difficulty >= 4) trapHelp();               // se tromper en ouvre une autre
    }));
    body.append(row);
    el.append(head, body);
  }

  /* 3. « Dépêchez-vous » : le bouton terne est le bon, le bouton voyant relance. */
  function trapHurry() {
    if (hasTrap('chrono')) return;
    const el = trapBox('left:50%;top:22vh;width:min(86vw,340px);transform:translateX(-50%);text-align:center', 'chrono');
    el._base = 'translateX(-50%)';
    const started = now(), clock = mk('div', 'font-size:28px;margin:6px 0 10px', '00:00:00');
    el._timer = setInterval(function () {
      const ms = now() - started, p = n => String(Math.floor(n)).padStart(2, '0');
      clock.textContent = p(ms / 60000) + ':' + p(ms / 1000 % 60) + ':' + p(ms / 10 % 100);
    }, 50);
    const row = mk('div', 'display:flex;gap:8px;justify-content:center');
    row.append(btn('@dim', 'Encore un instant', function () { el._close(); }),
      btn('@default;font-size:14px', 'Annuler', function () {
        gotcha(el);
        el.style.top = Math.round(rand(10, 50)) + 'vh';
        if (difficulty >= 4) trapHelp();
      }));
    el.append(mk('div', 'font-size:16px', 'Dépêchez-vous, le temps passe !'), clock, row);
  }

  /* 4. La question à l'envers (le bandeau de cookies de User Inyerface) : le
        gros bouton « Oui » est la mauvaise réponse, le texte pâle est la bonne. */
  function trapQuestion() {
    if (hasTrap('question')) return;
    const el = trapBox('left:50%;top:10px;width:min(94vw,430px);transform:translateX(-50%);display:flex;align-items:center;gap:12px', 'question');
    el._base = 'translateX(-50%)';
    const text = mk('div', 'flex:1;font-size:13px', 'Ce dessin utilise des pixels noirs. Est-ce un problème pour vous ?');
    const real = mk('span', 'font-size:11px;cursor:pointer;padding:12px 2px;text-align:center', 'Pas vraiment, non');
    real.className = 'mp84-dim';
    real.setAttribute('role', 'button');
    real.addEventListener('click', function () { el._close(); });
    let grown = 13;
    el.append(text, real, btn('@default;font-size:16px;min-width:76px', 'Oui', function () {
      gotcha(el);
      grown = 22; text.setAttribute('data-pxf', 'big');                       // un problème ? Parlons-en plus fort
    }));
  }

  /* 5. Le chronomètre permanent, comme en haut de la page de jeu : il ne sert
        à rien, il met la pression. */
  let chip = null, chipTimer = 0, chipStart = 0, gateCount = 0;
  function chronoSync() {
    const want = false;                                       // décompte retiré à la demande de l'auteur : plus rien en haut de l'écran
    if (want && !chip) {
      chip = mk('div', 'position:fixed;z-index:99980;left:50%;top:max(3px,env(safe-area-inset-top));transform:translateX(-50%);' +
        'font-size:12px;pointer-events:none');
      chip.className = 'mp84-chip'; macStyle(); Px.watch(chip, {});
      chip.setAttribute('data-macpaint-chrono', ''); chip.setAttribute('aria-hidden', 'true');
      document.body.append(chip);
      chipStart = now();
      chipTimer = setInterval(function () {
        const ms = (now() - chipStart) * (difficulty >= 4 ? 3 : 1), p = n => String(Math.floor(n)).padStart(2, '0');
        chip.textContent = p(ms / 60000) + ':' + p(ms / 1000 % 60) + ':' + p(ms / 10 % 100);
      }, 90);
    } else if (!want && chip) { clearInterval(chipTimer); chip.remove(); chip = null; }
  }

  /* 6. Les conditions générales avant d'enregistrer : texte interminable qui
        défile tout seul, lentement, case cochée à l'envers. « proceed » est
        toujours appelé à la fin (accepter, Échap) : on ne perd jamais l'export. */
  const TERMS = ['Article 1. Les pixels sont fournis en l’état, noirs ou blancs, sans garantie de beauté.',
    'Article 2. L’utilisateur reconnaît que la palette peut changer de place sans préavis.',
    'Article 3. Les rires de la salle ne constituent pas une critique artistique opposable.',
    'Article 4. Toute annulation est définitive jusqu’à la suivante.',
    'Article 5. Le pot de peinture décline toute responsabilité en cas de contour mal fermé.',
    'Article 6. La gomme efface. Elle ne pardonne pas.',
    'Article 7. Aucun chronomètre n’est affiché ; pressez-vous quand même.',
    'Article 8. En cas de litige, la case tombée au sol fait foi.',
    'Article 9. L’ananas, le piment, le citron, la pomme et les cerises sont des marques d’humeur.',
    'Article 10. Vous pouvez enfin accepter. Merci de votre patience.'];
  function gate(proceed) {
    if (difficulty !== 3 || chooser || !document.body || hasTrap('conditions') || hasTrap('disquette')) { proceed(); return; }
    if (++gateCount % 2 === 0) { trapFloppy(proceed); return; }   // une fois sur deux : la disquette
    const el = trapBox('left:50%;top:14vh;width:min(92vw,400px);transform:translateX(-50%)', 'conditions');
    el._base = 'translateX(-50%)';
    el._after = proceed;
    const view = mk('div', 'height:96px;overflow:hidden;border:1px solid #000;padding:6px 8px;font-weight:400;font-size:12px;margin:8px 0');
    const text = mk('div', '');
    for (const line of TERMS) text.append(mk('p', 'margin:0 0 14px', line));
    view.append(text);
    let y = 0, speed = 11, last = now(), end = false;
    const accept = btn('@dim', 'J’accepte', function () {
      if (!end || refuse.checked) { gotcha(el); return; }
      el._close();
    });
    el._timer = setInterval(function () {                       // défilement automatique, très lent
      const t = now(), max = Math.max(0, text.scrollHeight - 80);
      y = Math.min(max, y + speed * (t - last) / 1000); last = t;
      text.style.transform = 'translateY(' + (-y).toFixed(1) + 'px)';
      if (y >= max && !end) { end = true; accept.className = 'mp84-default'; accept.textContent = 'J\'accepte'; motion('hop'); }
    }, 40);
    const line = mk('label', 'display:flex;align-items:center;gap:8px;font-weight:400;font-size:12px;min-height:32px;margin-bottom:8px');
    const refuse = document.createElement('input'); refuse.type = 'checkbox'; refuse.checked = true;
    refuse.style.cssText = '';
    line.append(refuse, document.createTextNode('Je n\'accepte pas les conditions générales'));
    const row = mk('div', 'display:flex;justify-content:space-between;align-items:center;gap:8px');
    const faster = mk('span', 'font-weight:400;font-size:11px;text-decoration:underline;cursor:pointer;padding:10px 2px', 'plus vite');
    faster.setAttribute('role', 'button');
    faster.addEventListener('click', function () { speed = 90; });
    row.append(faster, accept);
    el.append(mk('div', 'font-size:15px;text-align:center', 'Conditions générales des pixels'), view, line, row);
  }

  /* 7. L'épaisseur du trait en millimètres, quatre décimales exigées. */
  function trapWidth(apply) {
    if (difficulty !== 3 || !document.body) return false;
    if (hasTrap('millimetres')) return true;
    const el = trapBox('left:50%;top:18vh;width:min(92vw,360px);transform:translateX(-50%)', 'millimetres');
    el._base = 'translateX(-50%)';
    const field = mk('input', 'width:100%;box-sizing:border-box;min-height:44px;padding:6px 8px;margin:8px 0;-webkit-user-select:text;user-select:text');
    field.type = 'text'; field.inputMode = 'decimal'; field.placeholder = '0,0000'; field.setAttribute('aria-label', 'Épaisseur en millimètres');
    const note = mk('div', 'font-weight:400;font-size:11px;min-height:28px', 'Rappel : 1 pixel = 0,3528 mm. Épaisseurs disponibles : 1, 2, 4 ou 8 pixels.');
    const submit = function () {
      const m = /^\s*(\d+)[.,](\d{4})\s*$/.exec(field.value);
      if (!m) { note.textContent = 'Format refusé. Quatre décimales exactement, par exemple 0,7056.'; gotcha(el); return; }
      const px = parseFloat(m[1] + '.' + m[2]) / 0.3528;
      let best = 1; for (const w of [1, 2, 4, 8]) if (Math.abs(w - px) < Math.abs(best - px)) best = w;
      el._close();
      apply(best);
    };
    field.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    const row = mk('div', 'display:flex;justify-content:space-between;align-items:center;gap:8px');
    const cancel = mk('span', 'font-weight:400;font-size:11px;text-decoration:underline;cursor:pointer;padding:10px 2px', 'renoncer');
    cancel.setAttribute('role', 'button');
    cancel.addEventListener('click', function () { el._close(); });
    row.append(cancel, btn('@default', 'Valider', submit));
    el.append(mk('div', 'font-size:15px', 'Épaisseur du trait, en millimètres'), field, note, row);
    try { field.focus(); } catch (e) {}
    return true;
  }

  /* 8. La double négation avant « Nouvelle feuille » : « Oui », en vert, efface
        (ce que l'on venait de demander ; l'annulation reste possible). */
  function trapConfirmNew(clear) {
    if (difficulty !== 3 || !document.body) return false;
    if (hasTrap('negation')) return true;
    const el = trapBox('left:50%;top:24vh;width:min(92vw,360px);transform:translateX(-50%);text-align:center', 'negation');
    el._base = 'translateX(-50%)';
    const row = mk('div', 'display:flex;gap:8px;justify-content:center;margin-top:10px');
    row.append(btn('@default;font-size:14px;min-width:96px', 'Oui', function () { el._close(); clear(); }),
      btn('@dim', 'Annuler', function () { el._close(); }));
    el.append(mk('div', 'font-size:15px', 'Ne pas annuler la non-suppression du dessin ?'), row);
    return true;
  }

  /* 9. L'enregistrement sur disquette : 45 secondes de lecteur 3,5 pouces, puis
        « Disquette pleine ». L'export a tout de même lieu ; Échap abrège. */
  function trapFloppy(proceed) {
    const el = trapBox('left:50%;top:20vh;width:min(92vw,380px);transform:translateX(-50%);text-align:center', 'disquette');
    el._base = 'translateX(-50%)';
    el._after = proceed;
    const noise = voice('fx_floppy', { loop: true, gain: 0.5, fadeIn: 0.1, vary: 0, mutate: false });
    const bar = mk('div', 'height:12px;border:1px solid #000;margin:10px 0'), fill = mk('div', 'height:100%;width:0;background:#000');
    bar.append(fill);
    const status = mk('div', 'font-weight:400;font-size:12px;min-height:34px', 'Écriture du secteur 1 / 1440…');
    const started = now(), total = 45000;
    const close = el._close;
    el._close = function () { if (alive(noise)) noise.stop(0.15); close(); };
    el._timer = setInterval(function () {
      const k = Math.min(1, (now() - started) / total);
      fill.style.width = (k * 100).toFixed(1) + '%';
      status.textContent = 'Écriture du secteur ' + Math.max(1, Math.round(k * 1440)) + ' / 1440…';
      if (k >= 1) {
        clearInterval(el._timer);
        if (alive(noise)) noise.stop(0.2);
        fx('gameshow_sad_trombone', { gain: 0.6 });
        status.textContent = 'Disquette pleine : veuillez insérer la Disquette 2 pour sauvegarder les 14 derniers pixels.';
        el.append(btn('@default;margin-top:12px', 'Insérer la Disquette 2', function () { el._close(); }));
      }
    }, 120);
    el.append(mk('div', 'font-size:15px', 'Enregistrement sur disquette'), bar, status);
  }

  /* 10. Petit message qui passe (non bloquant, disparaît tout seul). */
  function trapNote(text) {
    if (!document.body) return;
    for (const old of trapsNamed('note')) old._close && old._close();
    const el = trapBox('left:50%;top:9vh;width:min(90vw,380px);transform:translateX(-50%);text-align:center;font-size:13px;pointer-events:none', 'note');
    el.textContent = mac(text);
    el._timer = setTimeout(function () { el._close(); }, 3800);
  }

  /* 11. Les miettes de gomme : il faut souffler dans le micro pour les chasser.
         Le son du micro est seulement mesuré sur place (volume), jamais enregistré
         ni envoyé ; le micro est coupé dès que c'est fini ou au bout de 20 secondes.
         Sans micro, dix tapotements font l'affaire. */
  function trapCrumbs(blow) {
    if (difficulty !== 3 || !document.body || hasTrap('miettes')) return;
    const el = trapBox('left:8px;top:52px;width:min(72vw,250px)', 'miettes');
    const status = mk('div', 'font-weight:400;font-size:12px;margin-bottom:8px', 'La gomme laisse des miettes. Soufflez dans le micro pour les chasser.');
    let stream = null, node = null, taps = 0, stopAt = 0;
    const close = el._close;
    const stopMic = function () {
      clearTimeout(stopAt);
      try { if (node) node.disconnect(); } catch (e) {}
      try { if (stream) stream.getTracks().forEach(function (tr) { tr.stop(); }); } catch (e) {}
      stream = null; node = null;
    };
    el._close = function () { stopMic(); close(); };
    const done = function () { motion('flinch'); try { blow(); } catch (e) {} el._close(); };
    const fallback = function () {
      stopMic();
      status.textContent = 'Micro indisponible. Tapotez dix fois pour souffler.';
      go.textContent = 'Pfff';
      go.onclick = function () { motion('hop'); if (++taps >= 10) done(); };
    };
    const go = btn('@default', 'Activer le micro', function () {
      if (go.onclick || stream) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !AudioCtx) { fallback(); return; }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
        if (!traps.has(el)) { s.getTracks().forEach(function (tr) { tr.stop(); }); return; }
        stream = s;
        const ac = ctx || new AudioCtx();
        try { ac.resume(); } catch (e) {}
        node = ac.createMediaStreamSource(s);
        const meter = ac.createAnalyser(); meter.fftSize = 1024;
        node.connect(meter);
        const buf = new Float32Array(1024);
        let loud = 0;
        status.textContent = 'Soufflez fort ! (Rien n\'est enregistré.)';
        el._timer = setInterval(function () {
          meter.getFloatTimeDomainData(buf);
          let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          loud = Math.sqrt(sum / buf.length) > 0.12 ? loud + 1 : Math.max(0, loud - 1);
          if (loud >= 4) done();
        }, 60);
        stopAt = setTimeout(fallback, 20000);
      }).catch(fallback);
    });
    const row = mk('div', 'display:flex;justify-content:space-between;align-items:center;gap:8px');
    const skip = mk('span', 'font-weight:400;font-size:11px;text-decoration:underline;cursor:pointer;padding:10px 2px', 'tant pis');
    skip.setAttribute('role', 'button');
    skip.addEventListener('click', function () { el._close(); });
    row.append(skip, go);
    el.append(status, row);
  }

  /* 12. Réclames. Offres promotionnelles, parrainage, collaborations, demandes de
         partage, demande d'e-mail et de téléphone : toute la panoplie des fenêtres
         importunes, en version 1984. Ce sont des gags : rien n'est vendu, rien n'est
         partagé, et ce que l'on tape dans les champs n'est ni lu, ni conservé, ni
         envoyé (les champs sont vidés aussitôt). Niveaux 2 à 4 ; jamais en Nightmare!,
         qui ne doit pas ralentir. */
  const PROMOS = ['soldes', 'parrainage', 'collaboration', 'partage', 'contact'];
  function trapPromo(which) {
    if (!document.body || hasTrap('reclame')) return;
    const kind = PROMOS.includes(which) ? which : draw('promos', PROMOS);
    const el = trapBox('left:50%;top:' + Math.round(rand(12, 30)) + 'vh;width:min(92vw,380px);transform:translateX(-50%);text-align:center', 'reclame');
    el._base = 'translateX(-50%)';
    const title = text => mk('div', 'font-size:16px;margin-bottom:8px', text);
    const small = text => mk('div', 'font-size:12px;margin:6px 0 10px', text);
    const answer = mk('div', 'font-size:12px;min-height:14px;margin-top:8px', '');
    const say = text => { answer.textContent = mac(text); gotcha(el); };
    const row = mk('div', 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap');
    const leave = text => {
      const s = mk('span', 'font-size:11px;text-decoration:underline;cursor:pointer;padding:10px 4px;display:inline-block', text);
      s.setAttribute('role', 'button');
      s.addEventListener('click', function () { el._close(); });
      return s;
    };
    if (kind === 'soldes') {
      el.append(title('Offre du jour !'), small('Pixels noirs : 50 % moins chers aujourd’hui seulement. Pixels blancs offerts pour tout pixel noir acheté.'));
      row.append(btn('@default', 'J’en profite', function () { say('Stock épuisé. Revenez hier.'); }));
      el.append(row, answer, leave('non merci'));
    } else if (kind === 'parrainage') {
      el.append(title('Parrainez un ami'), small('Il reçoit 12 pixels. Vous en perdez 12. Tout le monde y gagne, sauf vous.'));
      row.append(btn('@default', 'Parrainer', function () { say('Aucun ami trouvé sur cette disquette.'); }));
      el.append(row, answer, leave('plus tard'));
    } else if (kind === 'collaboration') {
      el.append(title('Proposition de collaboration'), small('Une grande marque de gommes aimerait s’associer à votre dessin. Visibilité garantie.'));
      row.append(btn('@default', 'Accepter', function () { say('Votre réponse a été transmise à personne.'); }),
        btn('', 'Négocier', function () { say('La marque propose de vous payer en visibilité.'); }));
      el.append(row, answer, leave('refuser poliment'));
    } else if (kind === 'partage') {
      el.append(title('Partagez ce chef-d’oeuvre !'), small('Vos proches méritent de le voir. Choisissez votre réseau :'));
      for (const net of ['Minitel', 'Fax', 'Pigeon']) row.append(btn('', net, function () { say('Partage impossible : ' + net + ' ne répond pas. Rien n’a été partagé.'); }));
      el.append(row, answer, leave('garder pour moi'));
    } else {
      el.append(title('Restons en contact'), small('Pour continuer à dessiner, laissez-nous votre e-mail et votre numéro de téléphone.'));
      const field = hint => {
        const f = mk('input', 'width:100%;box-sizing:border-box;min-height:44px;padding:6px 8px;margin:0 0 8px;-webkit-user-select:text;user-select:text');
        f.type = 'text'; f.placeholder = hint; f.autocomplete = 'off'; f.setAttribute('aria-label', hint);
        return f;
      };
      const mail = field('E-mail'), phone = field('Téléphone');
      row.append(btn('@default', 'Envoyer', function () {
        mail.value = ''; phone.value = '';                         // jamais lu, jamais gardé, jamais envoyé
        say('Refusé : ni l’e-mail ni votre téléphone n’existent en 1984.');
      }));
      el.append(mail, phone, row, answer, mk('div', 'font-size:11px;margin-top:6px', 'Rien n’est enregistré ni envoyé. C’est une blague.'), leave('je n’ai pas le téléphone'));
    }
  }

  function trapsClear() {
    for (const el of Array.from(traps)) { el._after = null; try { el._close(); } catch (e) { traps.delete(el); el.remove(); } }
    trapGestures = 0; bannerDone = false;
  }
  /* Appelé à chaque geste accompli : les pièges arrivent selon le niveau. */
  function trapProgress() {
    if (chooser || !document.body) return;
    if (difficulty <= 1) return;                              // Hey, Not Too Rough : niveau tranquille, aucune fenêtre ne s'ouvre
    trapGestures++;
    if (difficulty >= 4) return;                             // Nightmare! : jamais rien à refermer, tout va vite
    if (difficulty >= 1 && ((!bannerDone && trapGestures >= 3) || (difficulty >= 3 && trapGestures % 40 === 0))) { bannerDone = true; trapBanner(); }
    const every = [0, 0, 25, 15, 0][difficulty];
    if (every && trapGestures % every === 0) trapHelp();
    if (difficulty >= 2 && trapGestures % 20 === 10) trapQuestion();
    const ad = [0, 30, 18, 11, 0][difficulty];                   // réclames : de plus en plus souvent
    if (ad && trapGestures % ad === ad - 4) trapPromo();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', chronoSync); else chronoSync();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && traps.size) { e.stopImmediatePropagation(); for (const el of Array.from(traps)) el._close(); }
  }, true);

  /* ------------------------------------------------------------------ *
   *  Nightmare! : musique gabber, fabriquée en direct (aucun fichier).
   *  Grosse caisse saturée sur chaque temps, « stabs » en dents de scie
   *  désaccordées sur les contretemps, charleston, roulement de caisses en
   *  fin de phrase. Le tempo suit l'énergie : de 180 à 220 battements par
   *  minute quand on travaille vite. Chaque coup de pied émet « beat »,
   *  sur lequel l'interface tressaute.
   * ------------------------------------------------------------------ */
  const NIGHTMARE = LEVELS.length - 1;
  const ROOTS = [41, 41, 44, 39, 41, 41, 46, 44];            // fa, fa, la♭, mi♭… (notes MIDI, une par mesure)
  const RIFF = [12, 15, 12, 19, 12, 15, 22, 19];             // contretemps, en demi-tons au-dessus de la basse
  let music = null, musicTimer = 0, nextStep = 0, step = 0;
  const midi = m => 440 * Math.pow(2, (m - 69) / 12);
  function drive(amount) {
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = Math.tanh((i / (n - 1) * 2 - 1) * amount);
    const w = ctx.createWaveShaper(); w.curve = curve; w.oversample = '2x';
    return w;
  }
  /* ------------------------------------------------------------------ *
   *  Ultra-Violence : musique concrète 8 bits. Un séquenceur rigide (grille
   *  de doubles croches à 168 BPM, aucun swing, aucun fondu) découpe des
   *  tranches très courtes dans les bruitages 8 bits du logiciel et les
   *  répète en bégayant, coupées net, avec des silences brusques. Par-dessus :
   *  basse carrée, bruit échantillonné-bloqué, le tout écrêté dur. Chaque
   *  cellule tient deux mesures puis est remplacée d'un coup par une autre.
   * ------------------------------------------------------------------ */
  const ULTRA = 3, CUT_STEP = 60 / 168 / 4;
  const CUT_MASKS = ['x.x.xx..x.x.xxxx', 'xxxx....xxxx....', 'x..x..x.x..x..x.', 'xxxxxxxxxxxxxxxx', 'x.......x.x.....',
    'xx.xx.xx........', '....xxxx....x.xx', 'x.xxx.x.xxx.x.xx', 'x...............', 'xxx.xxx.xxx.xxx.'];
  const CUT_SRC = ['sel_brush', 'sel_pencil', 'sel_eraser', 'sel_bucket', 'sel_spray', 'sel_rect', 'sel_oval', 'sel_lasso',
    'sel_marquee', 'sel_hand', 'sel_polygon', 'sel_freeform', 'sel_rrect', 'shape_pop', 'type_click', 'fx_boing', 'fx_quack', 'fx_pouet', 'fx_kaching', 'fx_scratch'];
  let cut = null, cutTimer = 0, cutNext = 0, cutStep = 0;
  function cutCell() {
    const keys = CUT_SRC.filter(k => buffers[k]);
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const voiceOf = () => {
      const key = pick(keys), b = key && buffers[key];
      return b ? { b, at: Math.random() * Math.max(0, b.duration - 0.09), len: pick([0.02, 0.035, 0.05, 0.07]), rate: pick([0.5, 0.75, 1, 1, 1.5, 2, 3]), mask: pick(CUT_MASKS) } : null;
    };
    return { a: voiceOf(), b: Math.random() < 0.7 ? voiceOf() : null, bass: pick(['x.....x...x.....', 'x..x..x..x..x...', 'xxxx............', 'x.x.x.x.x.x.x.x.', '................']),
      note: pick([29, 29, 32, 27, 34, 41]), noise: pick(['....x.......x...', '....x..x....x.xx', '..x...x...x...x.', '................']), mute: Math.random() < 0.18 ? 8 + 4 * Math.floor(Math.random() * 2) : 16 };
  }
  function cutPlay(v, t, level) {
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = v.b; src.playbackRate.value = v.rate;
    g.gain.setValueAtTime(level, t); g.gain.setValueAtTime(0, t + v.len);     // coupé net : pas de fondu
    src.connect(g); g.connect(cut.clip);
    src.start(t, v.at, v.len * v.rate + 0.01); src.stop(t + v.len + 0.01);
  }
  function cutTick() {
    if (!cut) return;
    if (ctx.state !== 'running') { cutNext = ctx.currentTime + 0.08; return; }
    if (cutNext < ctx.currentTime) cutNext = ctx.currentTime + 0.03;
    while (cutNext < ctx.currentTime + 0.14) {
      const s = cutStep % 16, t = cutNext;
      if (cutStep % 32 === 0) cut.cell = cutCell();                          // nouvelle cellule, sans transition
      const c = cut.cell;
      if (s < c.mute) {                                                       // au-delà : silence brusque
        if (c.a && c.a.mask[s] === 'x') cutPlay(c.a, t, 0.9);
        if (c.b && c.b.mask[(s + 2) % 16] === 'x') cutPlay(c.b, t, 0.6);
        if (c.bass[s] === 'x') {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'square'; o.frequency.setValueAtTime(midi(c.note + (s === 10 ? 12 : 0)), t);
          g.gain.setValueAtTime(0.5, t); g.gain.setValueAtTime(0, t + CUT_STEP * 0.7);
          o.connect(g); g.connect(cut.clip); o.start(t); o.stop(t + CUT_STEP);
        }
        if (c.noise[s] === 'x') {
          const n = ctx.createBufferSource(), g = ctx.createGain();
          n.buffer = cut.noise; n.playbackRate.value = s % 8 === 4 ? 1 : 2.2;
          g.gain.setValueAtTime(0.55, t); g.gain.setValueAtTime(0, t + 0.045);
          n.connect(g); g.connect(cut.clip); n.start(t, Math.random() * 0.3, 0.2); n.stop(t + 0.05);
        }
      }
      cutNext += CUT_STEP; cutStep++;
    }
  }
  function cutSync() {
    const want = !!ctx && enabled && started && difficulty === ULTRA && !document.hidden && !chooser;
    if (want && !cut) {
      const out = ctx.createGain(), clip = drive(6);
      out.gain.value = 0; clip.connect(out); out.connect(ctx.destination);
      out.gain.setTargetAtTime(0.2, ctx.currentTime, 0.2);
      /* Bruit « 8 bits » : chaque valeur tenue huit échantillons, sur seize niveaux. */
      const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate), d = noise.getChannelData(0);
      let hold = 0;
      for (let i = 0; i < d.length; i++) { if (i % 8 === 0) hold = Math.round((Math.random() * 2 - 1) * 8) / 8; d[i] = hold; }
      cut = { out, clip, noise, cell: null };
      cutStep = 0; cutNext = ctx.currentTime + 0.15;
      cutTimer = setInterval(cutTick, 25);
    } else if (!want && cut) {
      const c = cut;
      cut = null;
      clearInterval(cutTimer);
      c.out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(function () { try { c.out.disconnect(); } catch (e) {} }, 600);
    }
  }
  /* Musique du Nightmare! : la boucle « Loop Hardcore Gabber, Extreme Fast » fournie par
     l'auteur (sound/nm_gabber_loop.mp3), jouée sans raccord. LOOP_HITS donne l'instant de
     chacune de ses frappes de grosse caisse, en secondes depuis le premier son (relevé
     hors ligne par flux spectral dans le grave). Un événement « beat » part sur chaque
     frappe réelle : l'interface saute donc avec la musique, et s'arrête dans ses silences. */
  const LOOP_LEN = 20.7298;
  const LOOP_HITS = [0.076, 0.204, 0.285, 0.372, 0.471, 0.587, 0.668, 0.761, 0.889, 1.01, 1.115, 1.399, 1.655, 1.742, 1.852, 2.038, 2.363, 2.793, 3.007, 3.164, 3.35, 3.507, 3.692, 3.803, 3.884, 4.105, 5.515, 5.608, 5.707, 5.881, 6.2, 6.293, 6.496, 6.612, 6.699, 6.839, 7.001, 7.17, 7.251, 7.384, 7.471, 7.646, 8.069, 9.428, 9.77, 9.944, 10.119, 10.287, 10.461, 10.629, 11.012, 11.169, 11.297, 11.512, 11.61, 11.697, 11.779, 11.982, 12.069, 12.249, 12.382, 12.539, 12.725, 12.882, 13.015, 13.096, 13.207, 13.41, 13.596, 13.752, 13.909, 13.99, 14.083, 14.234, 14.327, 14.414, 14.6, 14.722, 14.937, 15.099, 15.285, 15.482, 15.639, 15.807, 15.982, 16.074, 16.492, 16.62, 16.794, 16.963, 17.09, 17.195, 17.526, 17.665, 17.868, 18.007, 18.211, 18.35, 18.553, 18.692, 18.896, 19.07, 19.238, 19.377, 19.581, 19.72, 19.923, 20.097, 20.266, 20.44, 20.538];
  let loopT0 = 0, loopHit = 0, loopWait = 0;
  function loopBounds(b) {
    if (b.__lead === undefined) {
      const d = b.getChannelData(0); let i = 0;
      while (i < d.length && Math.abs(d[i]) < 0.02) i++;
      b.__lead = i / b.sampleRate;
    }
    return b.__lead;
  }
  const hitTime = k => Math.floor(k / LOOP_HITS.length) * LOOP_LEN + LOOP_HITS[k % LOOP_HITS.length];
  function musicTick() {
    if (!music || ctx.state !== 'running') return;
    const at = ctx.currentTime - loopT0;
    while (hitTime(loopHit) < at + 0.12) {
      const k = loopHit++, wait = (hitTime(k) - at) * 1000;
      if (wait < -40) continue;                                // onglet endormi : frappes passées
      const gap = hitTime(k + 1) - hitTime(k), n = k % LOOP_HITS.length;
      setTimeout(function () { if (music && enabled) emit('beat', { step: (n % 4) * 4, bar: n >> 2, fill: gap < 0.11, gap }); }, Math.max(0, wait));
    }
  }
  /* La musique joue quand le niveau est Nightmare!, que le son est permis,
     que la page est visible et que l'écran de choix est fermé. */
  function musicSync() {
    cutSync();
    const want = !!ctx && enabled && started && difficulty === NIGHTMARE && !document.hidden && !chooser;
    clearTimeout(loopWait);
    if (want && !music) {
      const b = buffers.nm_music;
      if (!b) { loopWait = setTimeout(musicSync, 300); return; }   // pas encore décodée
      const lead = loopBounds(b), src = ctx.createBufferSource(), out = ctx.createGain();
      src.buffer = b; src.loop = true; src.loopStart = lead; src.loopEnd = Math.min(b.duration, lead + LOOP_LEN);
      /* Plus de basse : +9 dB sous 110 Hz et une bosse à 60 Hz, puis un limiteur pour ne pas saturer. */
      const shelf = ctx.createBiquadFilter(), sub = ctx.createBiquadFilter(), limit = ctx.createDynamicsCompressor();
      shelf.type = 'lowshelf'; shelf.frequency.value = 110; shelf.gain.value = 9;
      sub.type = 'peaking'; sub.frequency.value = 60; sub.Q.value = 1.1; sub.gain.value = 5;
      limit.threshold.value = -8; limit.knee.value = 4; limit.ratio.value = 12; limit.attack.value = 0.003; limit.release.value = 0.09;
      out.gain.value = 0; src.connect(shelf); shelf.connect(sub); sub.connect(out); out.connect(limit); limit.connect(ctx.destination);
      const t0 = ctx.currentTime + 0.1;
      src.start(t0, lead);
      out.gain.setTargetAtTime(0.6, t0, 0.55);                // la musique monte en un peu moins de deux secondes
      music = { out, src, limit, len: src.loopEnd - lead };
      loopT0 = t0; loopHit = 0;
      musicTimer = setInterval(musicTick, 25);
    } else if (!want && music) {
      const m = music;
      music = null;
      clearInterval(musicTimer);
      m.out.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      setTimeout(function () { try { m.src.stop(); m.limit.disconnect(); } catch (e) {} }, 900);
    }
  }
  document.addEventListener('visibilitychange', musicSync);

  /* ------------------------------------------------------------------ *
   *  Moteur de mouvement (ressort + particule)
   * ------------------------------------------------------------------ */
  function spring(stiffness = 260, damping = 11) {
    return { x: 0, v: 0, target: 0, stiffness, damping, done: false };
  }
  function stepSpring(s, dt) {
    const a = (s.target - s.x) * s.stiffness - s.v * s.damping;
    s.v += a * dt;
    s.x += s.v * dt;
    s.done = Math.abs(s.x - s.target) < 0.01 && Math.abs(s.v) < 0.1;
    return s.x;
  }
  function kick(s, impulse) { s.v += impulse; s.done = false; }

  function particle(x = 0, y = 0) {
    return { x, y, vx: 0, vy: 0, scale: 1, rotation: 0 };
  }
  function stepParticle(p, dt, gravity = 0, restitution = 0, floor = Infinity) {
    p.vy += gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y >= floor && p.vy > 0) {
      p.y = floor;
      p.vy = -p.vy * restitution;
      if (Math.abs(p.vy) < 20) p.vy = 0;
    }
  }

  window.Satire = Object.freeze({
    audio: Object.freeze({
      select,
      loop,
      loopStop,
      cheer,
      tick,
      motion,
      stop: stopAll,
      setEnabled,
      isEnabled: () => enabled,
      energy: getEnergy,
      CATEGORIES: Object.freeze(CATEGORIES)
    }),
    on,
    pixel: Object.freeze({ watch: Px.watch, refresh: Px.refresh, install: macStyle, scale: Px.scale }),
    traps: Object.freeze({ banner: trapBanner, help: trapHelp, hurry: trapHurry, question: trapQuestion, gate, width: trapWidth, confirmNew: trapConfirmNew, floppy: trapFloppy, note: trapNote, crumbs: trapCrumbs, promo: trapPromo, clear: trapsClear }),
    difficulty: Object.freeze({ classic: () => difficulty === 0, fruit: () => FRUITS[difficulty], fruitName: () => FRUIT_NAMES[difficulty], get: () => difficulty, frenzy: () => difficulty === NIGHTMARE && started, started: () => started, ramp, set: setDifficulty, choose: chooseDifficulty, levelFor, LEVELS: Object.freeze(LEVELS) }),
    motion: Object.freeze({ spring, stepSpring, kick, particle, stepParticle })
  });
})();

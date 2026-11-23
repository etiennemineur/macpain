// MacPain pour Windows — pont posé dans la page avant ses scripts.
//
// Même rôle que bridgeScript() dans macos/main.swift : macpaint.js y trouve
// window.MacPainNative, la page ouvre ses trois palettes (fenêtres filles) et y recopie à
// chaque image le morceau d'écran correspondant, et chaque piège part dans sa propre fenêtre.
// Les messages (tick, menus, state, cmd, shuffle, popup*) partent vers main.js.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

if (location.protocol === 'macpain:' && !window.opener) {
  contextBridge.exposeInMainWorld('__macpainHost', {
    post: (n, d) => ipcRenderer.send('macpain', { n: n, d: d === undefined ? null : d }),
  });
  webFrame.executeJavaScript('(' + bridge.toString() + ')();');
}

// Tout ce qui suit s'exécute dans la page (aucun accès à Node ni à Electron).
function bridge() {
  if (window.opener || location.protocol !== 'macpain:' || window.MacPainNative) return;
  var h = window.__macpainHost;
  var PALETTES = [['tools', 15, 27, 54, 222], ['lines', 15, 257, 54, 78], ['patterns', 77, 299, 424, 36]];

  function style() {
    var s = document.createElement('style');
    s.textContent = 'html,body{background:#fff!important;overflow:hidden!important}#screen{box-shadow:none!important}';
    document.documentElement.appendChild(s);
  }
  if (document.documentElement) style(); else document.addEventListener('readystatechange', function once() { document.removeEventListener('readystatechange', once); style(); });

  window.MacPainNative = {
    windows: true, moveWindow: true, blocks: null,
    post: function (n, d) { if (n === 'pose') return; h.post(n, d); },
    takes: function (c) { if (c === 'quit' || c === 'print' || c === 'pagesetup') { this.post('cmd', c); return true; } return false; }
  };

  function menus() {
    return __mp.MENUS.map(function (m, i) {
      return { title: m.title || '', items: __mp.menuItems(i).map(function (it) { return it.sep ? { sep: true } : { t: it.t, k: it.k || '', cmd: it.cmd || '' }; }) };
    });
  }
  function state() { var st = MacPaint.state(); return { font: st.font, size: st.size, styles: st.styles, alignment: st.alignment }; }

  // L'écran de choix est plus haut que la feuille : on le dessine à demi-échelle s'il dépasse.
  function fitChooser() {
    var l = document.querySelectorAll('[data-macpaint-chooser]');
    for (var i = 0; i < l.length; i++) {
      var c = l[i]; c.style.padding = '0';
      var b = c.firstElementChild; if (b && !b.style.zoom && b.offsetHeight > window.innerHeight) b.style.zoom = '0.5';
    }
  }

  // Pièges et réclames : chaque boîte part dans sa propre fenêtre (fille de la page).
  var popups = 0;
  window.MacPainNative.popup = function (el) {
    setTimeout(function () {
      if (!el.isConnected) return;
      var r = el.getBoundingClientRect(), w = Math.max(120, Math.ceil(r.width)), hh = Math.max(30, Math.ceil(r.height));
      var nx = Math.round(Math.max(0, Math.min(1, (r.left + r.width / 2) / window.innerWidth)) * 1000), ny = Math.round(Math.max(0, Math.min(1, (r.top + r.height / 2) / window.innerHeight)) * 1000);
      var win = window.open('about:blank', '', 'width=' + w + ',height=' + hh + ',left=' + nx + ',top=' + ny); if (!win) return;
      var id = ++popups, d = win.document, root = document.documentElement.style;
      var b = d.createElement('base'); b.href = location.href; d.head.appendChild(b);
      var st = d.createElement('style'), mac = document.getElementById('macpain-1984');
      st.textContent = (mac ? mac.textContent : '') + 'html,body{margin:0;background:#fff;overflow:hidden}' +
        '[data-macpaint-trap]{position:static!important;transform:none!important;width:100%!important;margin:0!important;left:auto!important;top:auto!important;right:auto!important;bottom:auto!important;transition:none!important;box-shadow:inset 0 0 0 calc(var(--px)*2) #fff,inset 0 0 0 calc(var(--px)*4) #000!important}' +
        '[data-macpaint-trap].mp84-window{box-shadow:none!important}';
      d.head.appendChild(st);
      ['--px', '--px-tick', '--px-check', '--px-checked'].forEach(function (k) { d.documentElement.style.setProperty(k, root.getPropertyValue(k)); });
      d.body.appendChild(el);
      el.animate = function () { h.post('popupShake', id); return { cancel: function () {}, finished: Promise.resolve() }; };
      new win.ResizeObserver(function () { if (el.isConnected) h.post('popupSize', { id: id, h: Math.ceil(el.getBoundingClientRect().height) }); }).observe(el);
      var gone = new MutationObserver(function () { if (!el.isConnected) { gone.disconnect(); h.post('popupClose', id); } });
      gone.observe(d.body, { childList: true });
      new MutationObserver(function () {
        var l = el.style.left, t = el.style.top;
        if (/vw$/.test(l) && /vh$/.test(t)) h.post('popupMove', { id: id, x: parseFloat(l) / 100, y: parseFloat(t) / 100 });
      }).observe(el, { attributes: true, attributeFilter: ['style'] });
      d.addEventListener('keydown', function (e) { if (e.key === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
      var field = el.querySelector('input[type=text]');
      if (field) { h.post('popupKey', id); setTimeout(function () { try { field.focus(); } catch (x) {} }, 60); }
    }, 0);
  };

  function palettes(cv) {
    var kids = [];
    PALETTES.forEach(function (p) {
      var w = window.open('about:blank'); if (!w) return;
      var d = w.document; d.title = p[0];
      d.documentElement.style.cssText = 'margin:0;height:100%;background:#fff';
      d.body.style.cssText = 'margin:0;height:100%;overflow:hidden;-webkit-user-select:none;user-select:none';
      var c = d.createElement('canvas'); c.width = p[3]; c.height = p[4];
      // Taille posée image par image (voir frame) : toujours un nombre entier de pixels d'écran
      // par pixel de 1984, même si Windows impose à la fenêtre une largeur minimale.
      c.style.cssText = 'display:block;margin:0 auto;image-rendering:pixelated;cursor:crosshair;touch-action:none';
      d.body.appendChild(c);
      ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach(function (t) {
        c.addEventListener(t, function (e) {
          e.preventDefault();
          if (t === 'pointerdown') { try { c.setPointerCapture(e.pointerId); } catch (x) {} }
          var r = cv.getBoundingClientRect(), m = r.width / cv.width, k = c.clientWidth / p[3];
          cv.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, clientX: r.left + (p[1] + e.offsetX / k) * m, clientY: r.top + (p[2] + e.offsetY / k) * m,
            button: e.button, buttons: e.buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey }));
          // Le clavier (raccourcis, texte) reste à la feuille.
          if (t === 'pointerup' || t === 'pointercancel') h.post('refocus');
        });
      });
      kids.push({ p: p, w: w, c: c, g: c.getContext('2d'), k: 0 });
    });
    function frame() {
      for (var i = 0; i < kids.length; i++) {
        var kid = kids[i], p = kid.p;
        var dpr = kid.w.devicePixelRatio || 1, k = Math.max(1, Math.round(kid.w.innerHeight * dpr / p[4])) / dpr;
        if (k !== kid.k) { kid.k = k; kid.c.style.width = (p[3] * k) + 'px'; kid.c.style.height = (p[4] * k) + 'px'; }
        kid.g.drawImage(cv, p[1], p[2], p[3], p[4], 0, 0, p[3], p[4]);
      }
      h.post('tick', { level: Satire.difficulty.get(), started: !!Satire.difficulty.started(), blocks: MacPainNative.blocks });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('load', function () {
    if (!window.__mp || !window.MacPaint) return;
    h.post('menus', menus());
    var q = 0; function send() { q = 0; h.post('state', state()); }
    MacPaint.subscribe(function () { if (!q) q = setTimeout(send, 120); }); send();
    new MutationObserver(function (l) { for (var i = 0; i < l.length; i++) if (l[i].addedNodes.length) { fitChooser(); setTimeout(fitChooser, 150); return; } }).observe(document.documentElement, { childList: true, subtree: true });
    fitChooser(); setTimeout(fitChooser, 150); setTimeout(fitChooser, 600);
    palettes(document.getElementById('screen'));
  });
}

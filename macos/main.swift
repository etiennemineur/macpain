// MacPain pour macOS — coque native autour de la version web.
//
// Une fenêtre, une WKWebView, et les fichiers de dist/ embarqués dans
// MacPain.app/Contents/Resources/web. Aucune connexion réseau : la page est
// servie par un schéma d'URL privé (macpain://app/…), ce qui donne au moteur
// une vraie origine — fetch + decodeAudioData pour les sons, localStorage
// persistant pour le niveau de difficulté — comme sur le site.
//
// Les menus du logiciel (File, Edit, Goodies, Font, FontSize, Style) sont de vrais
// menus macOS, construits à partir de ceux du moteur ; la barre dessinée dans
// l'écran simulé n'est montrée nulle part. Il n'y a pas de fenêtre globale : la
// feuille, les outils, les traits et les trames ont chacun leur vraie fenêtre, et
// aux niveaux Ultra-Violence et Nightmare! ces fenêtres errent sur le bureau.
//
// Construit par macos/build-app.sh (swiftc, sans projet Xcode).

import AppKit
import WebKit
import UniformTypeIdentifiers

let scheme = "macpain"
let startURL = URL(string: "\(scheme)://app/index.html")!

// MARK: - Fichiers embarqués

final class BundleFiles: NSObject, WKURLSchemeHandler {
    let root: URL

    init(root: URL) { self.root = root.standardizedFileURL }

    private func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "webmanifest": return "application/json; charset=utf-8"
        case "txt": return "text/plain; charset=utf-8"
        case "png": return "image/png"
        case "svg": return "image/svg+xml"
        case "woff2": return "font/woff2"
        case "wav": return "audio/wav"
        case "mp3": return "audio/mpeg"
        default: return "application/octet-stream"
        }
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path                      // déjà décodé (« Los Altos.woff2 »), sans ?v=…
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        // Rien en dehors du dossier embarqué.
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
            let r = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1",
                                    headerFields: ["Content-Type": "text/plain", "Content-Length": "0"])!
            task.didReceive(r); task.didReceive(Data()); task.didFinish()
            return
        }
        var headers = [
            "Content-Type": mime(file.pathExtension),
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
        ]
        var body = data
        var status = 200
        // Lecture partielle (éléments <audio>) : « Range: bytes=a-b ».
        if let range = task.request.value(forHTTPHeaderField: "Range"), range.hasPrefix("bytes="), !data.isEmpty {
            let parts = range.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
            if parts.count == 2 {
                var from = Int(parts[0]) ?? -1
                var to = Int(parts[1]) ?? data.count - 1
                if from < 0, let n = Int(parts[1]) { from = max(0, data.count - n); to = data.count - 1 }
                to = min(to, data.count - 1)
                if from >= 0 && from <= to {
                    body = data.subdata(in: from..<(to + 1))
                    status = 206
                    headers["Content-Range"] = "bytes \(from)-\(to)/\(data.count)"
                }
            }
        }
        headers["Content-Length"] = String(body.count)
        let r = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(r); task.didReceive(body); task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// MARK: - Fenêtres qui prennent la pose
//
// Le serveur de fenêtres de macOS sait appliquer une transformation à une fenêtre
// entière (barre de titre comprise) : position, rotation, taille. Les clics arrivent
// quand même au bon endroit. Ces fonctions ne font pas partie de l'interface publiée
// par Apple : si elles manquent sur une version de macOS, les fenêtres restent
// simplement à leur place.

enum WindowServer {
    private typealias Connection = @convention(c) () -> Int32
    private typealias SetTransform = @convention(c) (Int32, Int32, CGAffineTransform) -> Int32
    private static let handle = dlopen(nil, RTLD_NOW)
    private static let connection: Connection? = dlsym(handle, "CGSMainConnectionID").map { unsafeBitCast($0, to: Connection.self) }
    private static let setTransform: SetTransform? = dlsym(handle, "CGSSetWindowTransform").map { unsafeBitCast($0, to: SetTransform.self) }

    static var available: Bool { connection != nil && setTransform != nil }

    /// `screenToWindow` : repère de l'écran (origine en haut à gauche) → repère de la fenêtre.
    @discardableResult
    static func apply(_ screenToWindow: CGAffineTransform, to window: NSWindow) -> Bool {
        guard let connection = connection, let setTransform = setTransform, window.windowNumber > 0 else { return false }
        return setTransform(connection(), Int32(window.windowNumber), screenToWindow) == 0
    }
}

/// Palette : une vraie petite fenêtre, qui ne prend jamais le clavier à la feuille.
final class PalettePanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

/// Ressort amorti (position, angle ou échelle d'une fenêtre).
struct Spring {
    var x: CGFloat, v: CGFloat = 0, target: CGFloat
    init(_ value: CGFloat) { x = value; target = value }
    mutating func step(_ dt: CGFloat, stiffness: CGFloat, damping: CGFloat) {
        v += (stiffness * (target - x) - damping * v) * dt
        x += v * dt
    }
    var resting: Bool { abs(target - x) < 0.01 && abs(v) < 0.01 }
}

/// Une fenêtre du logiciel : la feuille ou une palette.
final class Piece {
    let id: String
    let rect: NSRect                 // sa place dans l'écran simulé de 512 × 342 (origine en haut à gauche)
    let window: NSWindow
    var posed = false
    var roaming = false
    var nextRoam: TimeInterval = 0
    var roamX: CGFloat = 0, roamY: CGFloat = 0          // centre visé pendant l'errance (repère écran, origine en haut)
    var cx = Spring(0), cy = Spring(0), angle = Spring(0), scale = Spring(1)

    init(id: String, rect: NSRect, window: NSWindow) { self.id = id; self.rect = rect; self.window = window }
}

// MARK: - Application

/// Écran simulé : la zone de dessin et les trois palettes, en pixels de 1984.
let sheetRect = NSRect(x: 80, y: 47, width: 416, height: 240)
let paletteRects: [(id: String, title: String, rect: NSRect)] = [
    ("tools", "Tools", NSRect(x: 15, y: 27, width: 54, height: 222)),
    ("lines", "Lines", NSRect(x: 15, y: 257, width: 54, height: 78)),
    ("patterns", "Patterns", NSRect(x: 77, y: 299, width: 424, height: 36)),
]

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, NSMenuItemValidation,
                         WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler {
    var window: NSWindow!                     // la feuille
    var webView: WKWebView!
    var files: BundleFiles!
    var verifTimer: Timer?

    var pieces: [Piece] = []                  // la feuille, puis les palettes ouvertes par la page
    var paletteViews: [WKWebView] = []
    var popups: [Int: NSPanel] = [:]          // pièges et réclames : de vraies fenêtres, par-dessus tout
    var popupCount = 0
    var scale = 2                             // points par pixel de 1984
    var lastTick: TimeInterval = 0

    var pageMenus: [NSMenuItem] = []          // File, Edit, Goodies, Font, FontSize, Style, dans l'ordre d'origine
    var pageState: [String: Any] = [:]
    var menuTracking = false
    var shuffled = false

    // MARK: Lancement

    func applicationDidFinishLaunching(_ note: Notification) {
        scale = allowedScales().contains(2) ? 2 : 1
        buildMenu(from: [])

        let web = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
        files = BundleFiles(root: web)

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(files, forURLScheme: scheme)
        config.websiteDataStore = .default()        // localStorage conservé entre deux lancements
        config.preferences.javaScriptCanOpenWindowsAutomatically = true   // la page ouvre ses palettes
        config.userContentController.add(self, name: "macpain")
        config.userContentController.addUserScript(
            WKUserScript(source: bridgeScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsMagnification = false
        webView.allowsBackForwardNavigationGestures = false
        webView.setValue(false, forKey: "drawsBackground")   // pas d'éclair blanc au lancement
        // La feuille peut être recouverte par une autre fenêtre pendant que les palettes se
        // promènent : la page ne doit pas se mettre en pause pour autant.
        let occlusion = Selector(("_setWindowOcclusionDetectionEnabled:"))
        if webView.responds(to: occlusion) { webView.perform(occlusion, with: nil) }

        window = NSWindow(contentRect: NSRect(origin: .zero, size: size(of: sheetRect)),
                          styleMask: [.titled, .closable, .miniaturizable],
                          backing: .buffered, defer: false)
        window.title = "untitled"
        window.delegate = self
        window.backgroundColor = .white
        window.tabbingMode = .disallowed
        window.isReleasedWhenClosed = false
        window.contentView = webView
        pieces = [Piece(id: "window", rect: sheetRect, window: window)]
        place(pieces[0])
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(webView)
        NSApp.activate(ignoringOtherApps: true)

        let center = NotificationCenter.default
        center.addObserver(forName: NSMenu.didBeginTrackingNotification, object: nil, queue: .main) { [weak self] _ in self?.menuTracking = true }
        center.addObserver(forName: NSMenu.didEndTrackingNotification, object: nil, queue: .main) { [weak self] _ in self?.menuTracking = false }

        webView.load(URLRequest(url: startURL))
        startVerificationHookIfAsked()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool { true }
    func windowWillClose(_ notification: Notification) { NSApp.terminate(nil) }   // fermer la feuille quitte le logiciel

    // Les palettes et les pièges flottent au-dessus de la feuille, mais pas au-dessus des
    // autres applications : quand MacPain n'est plus au premier plan, ils rentrent dans le rang.
    func applicationDidResignActive(_ notification: Notification) { floatPanels(false) }
    func applicationDidBecomeActive(_ notification: Notification) { floatPanels(true) }
    func floatPanels(_ float: Bool) {
        for piece in pieces.dropFirst() { piece.window.level = float ? .floating : .normal }
        for panel in popups.values { panel.level = float ? NSWindow.Level(rawValue: NSWindow.Level.floating.rawValue + 1) : .normal }
    }

    // MARK: Pont avec la page

    /// Posé avant les scripts de la page : macpaint.js y trouve window.MacPainNative.
    /// Après le chargement, la page ouvre ses trois palettes (des fenêtres filles) et y
    /// recopie à chaque image le morceau d'écran correspondant ; les clics reçus par une
    /// palette sont renvoyés au moteur, à l'endroit de l'écran simulé qu'elle montre.
    func bridgeScript() -> String {
        let palettes = paletteRects.map { "['\($0.id)',\(Int($0.rect.minX)),\(Int($0.rect.minY)),\(Int($0.rect.width)),\(Int($0.rect.height))]" }.joined(separator: ",")
        return """
        (function(){
          if(window.opener||location.protocol!=='\(scheme):')return;
          var s=document.createElement('style');s.textContent='html,body{background:#fff!important;overflow:hidden!important}#screen{box-shadow:none!important}';document.documentElement.appendChild(s);
          var h=window.webkit.messageHandlers.macpain;
          window.MacPainNative={
            windows:true,moveWindow:true,blocks:null,
            post:function(n,d){if(n==='pose')return;h.postMessage({n:n,d:d===undefined?null:d});},
            takes:function(c){if(c==='quit'||c==='print'||c==='pagesetup'){this.post('cmd',c);return true;}return false;}
          };
          function menus(){return __mp.MENUS.map(function(m,i){return {title:m.title||'',items:__mp.menuItems(i).map(function(it){
            return it.sep?{sep:true}:{t:it.t,k:it.k||'',cmd:it.cmd||''};})};});}
          function state(){var st=MacPaint.state();return {font:st.font,size:st.size,styles:st.styles,alignment:st.alignment};}
          // L'écran de choix est plus haut que la feuille : on le dessine à demi-échelle s'il dépasse.
          function fitChooser(){var l=document.querySelectorAll('[data-macpaint-chooser]');for(var i=0;i<l.length;i++){var c=l[i];c.style.padding='0';
            var b=c.firstElementChild;if(b&&!b.style.zoom&&b.offsetHeight>window.innerHeight)b.style.zoom='0.5';}}
          // Pièges et réclames : chaque boîte part dans sa propre fenêtre (fille de la page).
          var popups=0;
          window.MacPainNative.popup=function(el){setTimeout(function(){
            if(!el.isConnected)return;
            var r=el.getBoundingClientRect(),w=Math.max(120,Math.ceil(r.width)),hh=Math.max(30,Math.ceil(r.height));
            var nx=Math.round(Math.max(0,Math.min(1,(r.left+r.width/2)/window.innerWidth))*1000),ny=Math.round(Math.max(0,Math.min(1,(r.top+r.height/2)/window.innerHeight))*1000);
            var win=window.open('about:blank','','width='+w+',height='+hh+',left='+nx+',top='+ny);if(!win)return;
            var id=++popups,d=win.document,root=document.documentElement.style;
            var b=d.createElement('base');b.href=location.href;d.head.appendChild(b);
            var st=d.createElement('style'),mac=document.getElementById('macpain-1984');
            st.textContent=(mac?mac.textContent:'')+'html,body{margin:0;background:#fff;overflow:hidden}'+
              '[data-macpaint-trap]{position:static!important;transform:none!important;width:100%!important;margin:0!important;left:auto!important;top:auto!important;right:auto!important;bottom:auto!important;transition:none!important;box-shadow:inset 0 0 0 calc(var(--px)*2) #fff,inset 0 0 0 calc(var(--px)*4) #000!important}'+
              '[data-macpaint-trap].mp84-window{box-shadow:none!important}';
            d.head.appendChild(st);
            ['--px','--px-tick','--px-check','--px-checked'].forEach(function(k){d.documentElement.style.setProperty(k,root.getPropertyValue(k));});
            d.body.appendChild(el);
            el.animate=function(){h.postMessage({n:'popupShake',d:id});return {cancel:function(){},finished:Promise.resolve()};};
            new win.ResizeObserver(function(){if(el.isConnected)h.postMessage({n:'popupSize',d:{id:id,h:Math.ceil(el.getBoundingClientRect().height)}});}).observe(el);
            var gone=new MutationObserver(function(){if(!el.isConnected){gone.disconnect();h.postMessage({n:'popupClose',d:id});}});
            gone.observe(d.body,{childList:true});
            new MutationObserver(function(){var l=el.style.left,t=el.style.top;
              if(/vw$/.test(l)&&/vh$/.test(t))h.postMessage({n:'popupMove',d:{id:id,x:parseFloat(l)/100,y:parseFloat(t)/100}});}).observe(el,{attributes:true,attributeFilter:['style']});
            d.addEventListener('keydown',function(e){if(e.key==='Escape')window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));});
            var field=el.querySelector('input[type=text]');
            if(field){h.postMessage({n:'popupKey',d:id});setTimeout(function(){try{field.focus();}catch(x){}},60);}
          },0);};
          function palettes(cv){
            var kids=[];
            [\(palettes)].forEach(function(p){
              var w=window.open('about:blank');if(!w)return;
              var d=w.document;d.title=p[0];
              d.documentElement.style.cssText='margin:0;height:100%;background:#fff';
              d.body.style.cssText='margin:0;height:100%;overflow:hidden;-webkit-user-select:none;user-select:none';
              var c=d.createElement('canvas');c.width=p[3];c.height=p[4];
              c.style.cssText='display:block;width:100vw;height:100vh;image-rendering:pixelated;cursor:crosshair;touch-action:none';
              d.body.appendChild(c);
              ['pointerdown','pointermove','pointerup','pointercancel'].forEach(function(t){c.addEventListener(t,function(e){
                e.preventDefault();
                if(t==='pointerdown'){try{c.setPointerCapture(e.pointerId);}catch(x){}}
                var r=cv.getBoundingClientRect(),m=r.width/cv.width,k=c.clientWidth/p[3];
                cv.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,clientX:r.left+(p[1]+e.offsetX/k)*m,clientY:r.top+(p[2]+e.offsetY/k)*m,
                  button:e.button,buttons:e.buttons,pointerId:1,pointerType:'mouse',isPrimary:true,shiftKey:e.shiftKey,altKey:e.altKey,metaKey:e.metaKey,ctrlKey:e.ctrlKey}));
              });});
              kids.push({p:p,g:c.getContext('2d')});
            });
            function frame(){
              for(var i=0;i<kids.length;i++){var p=kids[i].p;kids[i].g.drawImage(cv,p[1],p[2],p[3],p[4],0,0,p[3],p[4]);}
              h.postMessage({n:'tick',d:{level:Satire.difficulty.get(),started:!!Satire.difficulty.started(),blocks:MacPainNative.blocks}});
              requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
          }
          window.addEventListener('load',function(){
            if(!window.__mp||!window.MacPaint)return;
            h.postMessage({n:'menus',d:menus()});
            var q=0;function send(){q=0;h.postMessage({n:'state',d:state()});}
            MacPaint.subscribe(function(){if(!q)q=setTimeout(send,120);});send();
            new MutationObserver(function(l){for(var i=0;i<l.length;i++)if(l[i].addedNodes.length){fitChooser();setTimeout(fitChooser,150);return;}}).observe(document.documentElement,{childList:true,subtree:true});
            fitChooser();setTimeout(fitChooser,150);setTimeout(fitChooser,600);
            palettes(document.getElementById('screen'));
          });
        })();
        """
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let name = body["n"] as? String else { return }
        switch name {
        case "tick":
            tick(body["d"] as? [String: Any] ?? [:])
        case "popupSize":
            if let d = body["d"] as? [String: Any], let panel = popups[d["id"] as? Int ?? 0], let h = (d["h"] as? NSNumber)?.doubleValue, h > 10 {
                var content = panel.contentRect(forFrameRect: panel.frame)
                if abs(content.height - CGFloat(h)) > 0.5 {
                    content.origin.y += content.height - CGFloat(h); content.size.height = CGFloat(h)
                    panel.setFrame(panel.frameRect(forContentRect: content), display: true)
                }
            }
        case "popupMove":
            if let d = body["d"] as? [String: Any], let panel = popups[d["id"] as? Int ?? 0], let screen = NSScreen.main,
               let x = (d["x"] as? NSNumber)?.doubleValue, let y = (d["y"] as? NSNumber)?.doubleValue {
                let visible = screen.visibleFrame
                var frame = panel.frame
                frame.origin.x = min(visible.maxX - frame.width, visible.minX + CGFloat(x) * visible.width)
                frame.origin.y = max(visible.minY, visible.maxY - CGFloat(y) * visible.height - frame.height)
                panel.setFrame(frame, display: true, animate: false)
            }
        case "popupShake":
            if let panel = popups[body["d"] as? Int ?? 0] { shake(panel) }
        case "popupKey":
            popups[body["d"] as? Int ?? 0]?.makeKeyAndOrderFront(nil)
        case "popupClose":
            if let id = body["d"] as? Int, let panel = popups.removeValue(forKey: id) { panel.close() }
        case "shuffle":
            shuffleMenus()
        case "state":
            pageState = body["d"] as? [String: Any] ?? [:]
        case "menus":
            buildMenu(from: body["d"] as? [[String: Any]] ?? [])
        case "cmd":
            switch body["d"] as? String {
            case "quit": NSApp.terminate(nil)
            case "print": printDocument()
            case "pagesetup": NSPageLayout().beginSheet(with: NSPrintInfo.shared, modalFor: window, delegate: nil, didEnd: nil, contextInfo: nil)
            default: break
            }
        default:
            break
        }
    }

    func page(_ js: String) { webView.evaluateJavaScript(js, completionHandler: nil) }

    // MARK: Menus : ceux du logiciel, dans la barre de menus du Mac

    func buildMenu(from menus: [[String: Any]]) {
        let main = NSMenu()

        // Menu de l'application : les articles du menu Pomme du logiciel, puis ceux du système.
        let appItem = NSMenuItem(); main.addItem(appItem)
        let app = NSMenu(); appItem.submenu = app
        if let apple = menus.first { fill(app, with: apple["items"] as? [[String: Any]] ?? []) }
        if app.items.isEmpty { app.addItem(withTitle: "MacPain", action: nil, keyEquivalent: "") }
        app.addItem(.separator())
        for scale in allowedScales() {
            let item = app.addItem(withTitle: "Taille ×\(scale)", action: #selector(setScale(_:)), keyEquivalent: "")
            item.tag = scale
        }
        app.addItem(withTitle: "Recommencer", action: #selector(restart), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Masquer MacPain", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let others = app.addItem(withTitle: "Masquer les autres", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        others.keyEquivalentModifierMask = [.command, .option]
        app.addItem(withTitle: "Tout afficher", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Quitter MacPain", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        pageMenus = []
        for menu in menus.dropFirst() {
            let item = NSMenuItem()
            let sub = NSMenu(title: menu["title"] as? String ?? "")
            fill(sub, with: menu["items"] as? [[String: Any]] ?? [])
            item.submenu = sub
            main.addItem(item)
            pageMenus.append(item)
        }
        shuffled = false
        NSApp.mainMenu = main
    }

    func fill(_ menu: NSMenu, with items: [[String: Any]]) {
        for entry in items {
            if entry["sep"] != nil { menu.addItem(.separator()); continue }
            let command = entry["cmd"] as? String ?? ""
            // « Quit » du menu File : la commande Quitter du Mac, avec son raccourci, est dans le menu de l'application.
            let key = command == "quit" ? "" : (entry["k"] as? String ?? "").lowercased()
            let item = menu.addItem(withTitle: entry["t"] as? String ?? "", action: #selector(pageCommand(_:)), keyEquivalent: key)
            item.representedObject = command
        }
    }

    @objc func pageCommand(_ sender: NSMenuItem) {
        guard let command = sender.representedObject as? String, !command.isEmpty,
              let data = try? JSONSerialization.data(withJSONObject: [command]),
              let json = String(data: data, encoding: .utf8) else { return }
        page("window.__mp&&window.__mp.cmd(\(json)[0])")
    }

    /// Coches des menus Font, FontSize et Style, d'après l'état envoyé par le moteur.
    func validateMenuItem(_ item: NSMenuItem) -> Bool {
        if item.action == #selector(setScale(_:)) {
            item.state = item.tag == scale ? .on : .off
            return true
        }
        guard item.action == #selector(pageCommand(_:)), let command = item.representedObject as? String else { return true }
        let styles = pageState["styles"] as? [String] ?? []
        var on = false
        if command.hasPrefix("font:") { on = command.dropFirst(5) == (pageState["font"] as? String ?? "") }
        else if command.hasPrefix("size:") { on = Int(command.dropFirst(5)) == (pageState["size"] as? Int) }
        else if command == "style:plain" { on = styles.isEmpty }
        else if command.hasPrefix("style:") { on = styles.contains(String(command.dropFirst(6))) }
        else if command.hasPrefix("align:") { on = command.dropFirst(6) == (pageState["alignment"] as? String ?? "") }
        item.state = on ? .on : .off
        return true
    }

    /// Nightmare! : la barre de menus du Mac ne peut pas bouger, mais ses menus changent de place.
    func shuffleMenus() {
        guard let main = NSApp.mainMenu, !menuTracking, pageMenus.count > 1 else { return }
        var order = pageMenus
        repeat { order.shuffle() } while order.first === main.items.dropFirst().first
        for item in pageMenus { main.removeItem(item) }
        for item in order { main.addItem(item) }
        shuffled = true
    }

    func restoreMenus() {
        guard shuffled, let main = NSApp.mainMenu, !menuTracking else { return }
        for item in pageMenus { main.removeItem(item) }
        for item in pageMenus { main.addItem(item) }
        shuffled = false
    }

    @objc func restart() {
        closePalettes()
        webView.load(URLRequest(url: startURL))
    }


    // MARK: Fenêtres : la feuille et les palettes, à la place qu'elles avaient à l'écran en 1984

    func size(of rect: NSRect) -> NSSize { NSSize(width: rect.width * CGFloat(scale), height: rect.height * CGFloat(scale)) }

    func allowedScales() -> [Int] {
        let room = NSScreen.main?.visibleFrame.size ?? NSSize(width: 1440, height: 900)
        let fits = [1, 2].filter { 512 * CGFloat($0) <= room.width && 342 * CGFloat($0) + 80 <= room.height }
        return fits.isEmpty ? [1] : fits
    }

    /// Pose la fenêtre à sa place d'origine : l'écran simulé est centré sur l'écran du Mac.
    func place(_ piece: Piece) {
        guard let screen = NSScreen.main else { return }
        let visible = screen.visibleFrame, m = CGFloat(scale)
        // Sous une autre fenêtre, on laisse la hauteur d'une barre de titre.
        let gap: CGFloat = piece.rect.minY > 250 ? (piece.id == "lines" ? 24 : 30) : 0
        let left = visible.midX - 256 * m + piece.rect.minX * m
        let top = visible.maxY - max(30, (visible.height - 342 * m - 30) / 2) - piece.rect.minY * m - gap
        let content = NSRect(x: left, y: top - piece.rect.height * m, width: piece.rect.width * m, height: piece.rect.height * m)
        release(piece)
        piece.window.setFrame(piece.window.frameRect(forContentRect: content), display: true)
    }

    @objc func setScale(_ sender: NSMenuItem) {
        scale = sender.tag
        for piece in pieces { place(piece) }
    }

    /// La page ouvre une palette (window.open) : on lui donne sa vraie fenêtre.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard webView === self.webView else { return nil }
        if let width = windowFeatures.width?.doubleValue, let height = windowFeatures.height?.doubleValue {
            return openPopup(configuration, width: CGFloat(width), height: CGFloat(height),
                             x: CGFloat(windowFeatures.x?.doubleValue ?? 500) / 1000, y: CGFloat(windowFeatures.y?.doubleValue ?? 500) / 1000)
        }
        guard paletteViews.count < paletteRects.count else { return nil }
        let spec = paletteRects[paletteViews.count]
        let view = WKWebView(frame: NSRect(origin: .zero, size: size(of: spec.rect)), configuration: configuration)
        view.navigationDelegate = self
        let panel = PalettePanel(contentRect: NSRect(origin: .zero, size: size(of: spec.rect)),
                                 styleMask: [.titled, .utilityWindow], backing: .buffered, defer: false)
        panel.title = spec.title
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.isReleasedWhenClosed = false
        panel.contentView = view
        let piece = Piece(id: spec.id, rect: spec.rect, window: panel)
        pieces.append(piece)
        paletteViews.append(view)
        place(piece)
        if !NSApp.isActive { panel.level = .normal }
        panel.orderFront(nil)
        return view
    }

    /// Un piège ou une réclame : une vraie fenêtre posée par-dessus les autres. x, y (0 à 1) :
    /// la place que son centre occupait dans la page, reportée sur tout l'écran du Mac.
    func openPopup(_ configuration: WKWebViewConfiguration, width: CGFloat, height: CGFloat, x: CGFloat, y: CGFloat) -> WKWebView {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: height), configuration: configuration)
        view.navigationDelegate = self
        let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: width, height: height),
                            styleMask: [.titled, .utilityWindow], backing: .buffered, defer: false)
        panel.title = "MacPain"
        panel.isFloatingPanel = true
        panel.level = NSWindow.Level(rawValue: NSWindow.Level.floating.rawValue + 1)
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.isReleasedWhenClosed = false
        panel.contentView = view
        let visible = (NSScreen.main ?? NSScreen.screens[0]).visibleFrame
        var frame = panel.frame
        frame.origin.x = min(max(visible.minX, visible.minX + x * visible.width - frame.width / 2), visible.maxX - frame.width)
        frame.origin.y = min(max(visible.minY, visible.maxY - y * visible.height - frame.height / 2), visible.maxY - frame.height)
        panel.setFrame(frame, display: true)
        if !NSApp.isActive { panel.level = .normal }
        panel.orderFront(nil)
        popupCount += 1
        popups[popupCount] = panel
        return view
    }

    /// Mauvais bouton : la fenêtre du piège se secoue.
    func shake(_ panel: NSPanel) {
        let offsets: [CGFloat] = [-7, 7, -5, 5, -3, 3, 0]
        var step = 0, applied: CGFloat = 0
        Timer.scheduledTimer(withTimeInterval: 0.03, repeats: true) { timer in
            // décalage relatif : la fenêtre peut être déplacée par le piège pendant la secousse
            let offset = offsets[min(step, offsets.count - 1)]
            var origin = panel.frame.origin
            origin.x += offset - applied
            applied = offset
            panel.setFrameOrigin(origin)
            step += 1
            if step >= offsets.count { timer.invalidate() }
        }
    }

    func closePalettes() {
        for panel in popups.values { panel.close() }
        popups = [:]; popupCount = 0
        for piece in pieces { release(piece) }
        for piece in pieces.dropFirst() { piece.window.close() }
        pieces = Array(pieces.prefix(1))
        paletteViews = []
    }

    // MARK: Errance : les fenêtres se promènent sur le bureau

    /// Appelé à chaque image par la page. `blocks` : décalage, angle et échelle que le moteur
    /// donne à chaque bloc (sauts, déménagements, secousses de la musique) ; à partir
    /// d'Ultra-Violence, chaque fenêtre part en plus se promener seule sur tout l'écran.
    func tick(_ data: [String: Any]) {
        guard WindowServer.available, let screen = window.screen ?? NSScreen.main, let primary = NSScreen.screens.first else { return }
        let now = ProcessInfo.processInfo.systemUptime
        let dt = CGFloat(min(1.0 / 30, max(1.0 / 240, now - lastTick)))
        lastTick = now
        let level = (data["level"] as? Int) ?? 0, started = (data["started"] as? Bool) ?? false
        let blocks = data["blocks"] as? [String: [NSNumber]] ?? [:]
        let wander = started && level >= 3 && !menuTracking
        let nightmare = level >= 4
        let visible = screen.visibleFrame, top = primary.frame.height, m = CGFloat(scale)
        if !wander { restoreMenus() }

        for piece in pieces {
            if piece.window.isMiniaturized || !piece.window.isVisible { continue }
            let frame = piece.window.frame
            let homeX = frame.midX, homeY = top - frame.midY                 // repère écran, origine en haut
            let block = blocks[piece.id]?.map { CGFloat($0.doubleValue) } ?? [0, 0, 0, 1]
            let dx = (block.count > 0 ? block[0] : 0) * m, dy = (block.count > 1 ? block[1] : 0) * m
            if !piece.posed { piece.cx = Spring(homeX); piece.cy = Spring(homeY); piece.angle = Spring(0); piece.scale = Spring(1) }

            if wander {
                if !piece.roaming || now >= piece.nextRoam {
                    piece.roaming = true
                    piece.nextRoam = now + (nightmare ? Double.random(in: 0.35...1.0) : Double.random(in: 2.2...4.5))
                    let s: CGFloat = nightmare ? .random(in: 0.6...1.2) : 1
                    let halfW = frame.width * s / 2, halfH = frame.height * s / 2
                    piece.roamX = .random(in: min(visible.minX + halfW, visible.midX)...max(visible.maxX - halfW, visible.midX))
                    piece.roamY = top - .random(in: min(visible.minY + halfH, visible.midY)...max(visible.maxY - halfH, visible.midY))
                    piece.angle.target = nightmare ? .random(in: -0.5...0.5) : .random(in: -0.12...0.12)
                    piece.scale.target = s
                }
                // Les secousses du moteur (frappes de la musique) s'ajoutent à la promenade.
                piece.cx.target = piece.roamX + (nightmare ? dx : 0)
                piece.cy.target = piece.roamY + (nightmare ? dy : 0)
            } else {
                piece.roaming = false
                piece.cx.target = homeX + dx
                piece.cy.target = homeY + dy
                piece.angle.target = block.count > 2 ? block[2] : 0
                piece.scale.target = block.count > 3 && block[3] > 0 ? block[3] : 1
            }

            let stiffness: CGFloat = wander ? (nightmare ? 55 : 7) : 120
            let damping: CGFloat = wander ? (nightmare ? 9 : 4.2) : 20
            piece.cx.step(dt, stiffness: stiffness, damping: damping)
            piece.cy.step(dt, stiffness: stiffness, damping: damping)
            piece.angle.step(dt, stiffness: stiffness, damping: damping)
            piece.scale.step(dt, stiffness: stiffness, damping: damping)

            let atHome = !wander && abs(piece.cx.x - homeX) < 0.3 && abs(piece.cy.x - homeY) < 0.3
                && abs(piece.cx.target - homeX) < 0.3 && abs(piece.cy.target - homeY) < 0.3
                && abs(piece.angle.x) < 0.002 && abs(piece.angle.target) < 0.002
                && abs(piece.scale.x - 1) < 0.002 && abs(piece.scale.target - 1) < 0.002
            if atHome { release(piece); continue }

            let s = min(1.6, max(0.3, piece.scale.x))
            let t = CGAffineTransform(translationX: -piece.cx.x, y: -piece.cy.x)
                .concatenating(CGAffineTransform(rotationAngle: -piece.angle.x))
                .concatenating(CGAffineTransform(scaleX: 1 / s, y: 1 / s))
                .concatenating(CGAffineTransform(translationX: frame.width / 2, y: frame.height / 2))
            if WindowServer.apply(t, to: piece.window) { piece.posed = true }
        }
    }

    /// Remet la fenêtre droite, à sa place, à sa taille.
    func release(_ piece: Piece) {
        guard piece.posed, let primary = NSScreen.screens.first else { return }
        let frame = piece.window.frame
        WindowServer.apply(CGAffineTransform(translationX: -frame.minX, y: -(primary.frame.height - frame.maxY)), to: piece.window)
        piece.posed = false
        piece.roaming = false
    }

    // MARK: Impression

    func printDocument() {
        let js = "const b=await MacPaint.exportPNG();return await new Promise(function(r){const f=new FileReader();f.onload=function(){r(f.result);};f.readAsDataURL(b);});"
        webView.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { [weak self] result in
            guard let self = self, case .success(let value) = result, let url = value as? String,
                  let comma = url.firstIndex(of: ","), let data = Data(base64Encoded: String(url[url.index(after: comma)...])),
                  let image = NSImage(data: data) else { return }
            image.size = NSSize(width: 576, height: 720)                       // 72 points par pouce, comme en 1985
            let view = NSImageView(frame: NSRect(origin: .zero, size: image.size))
            view.image = image
            view.imageScaling = .scaleNone
            let info = NSPrintInfo.shared.copy() as! NSPrintInfo
            info.horizontalPagination = .fit; info.verticalPagination = .fit
            info.isHorizontallyCentered = true; info.isVerticallyCentered = true
            let operation = NSPrintOperation(view: view, printInfo: info)
            operation.jobTitle = "MacPain"
            operation.runModal(for: self.window, delegate: nil, didRun: nil, contextInfo: nil)
        }
    }

    // MARK: Navigation : rien d'autre que les fichiers embarqués

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.shouldPerformDownload { decisionHandler(.download); return }
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        switch url.scheme?.lowercased() {
        case scheme, "about", "blob", "data":
            decisionHandler(.allow)
        case "http", "https", "mailto":
            // Un lien cliqué s'ouvre dans le navigateur de l'utilisateur, jamais ici.
            if action.navigationType == .linkActivated { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel)
        default:
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { if webView === self.webView { restart() } }

    // MARK: Export PNG : vrai panneau d'enregistrement

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename.isEmpty ? "MacPain.png" : suggestedFilename
        panel.canCreateDirectories = true
        if suggestedFilename.lowercased().hasSuffix(".png") { panel.allowedContentTypes = [.png] }
        panel.beginSheetModal(for: window) { result in
            guard result == .OK, let url = panel.url else { completionHandler(nil); return }
            // Le panneau a déjà demandé s'il fallait remplacer ; WKDownload refuse
            // d'écrire par-dessus un fichier existant.
            try? FileManager.default.removeItem(at: url)
            completionHandler(url)
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        let alert = NSAlert()
        alert.messageText = "L'image n'a pas pu être enregistrée."
        alert.informativeText = error.localizedDescription
        alert.beginSheetModal(for: window, completionHandler: nil)
    }

    // MARK: Ouverture d'image : panneau de fichiers

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.image]
        panel.beginSheetModal(for: window) { result in
            completionHandler(result == .OK ? panel.urls : nil)
        }
    }

    // Microphone : refusé, comme sur le site ; le piège se rabat sur le tapotement.
    @available(macOS 12.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.deny)
    }

    // MARK: Vérification (outil de mise au point)
    //
    // Lancée avec MACPAIN_VERIF_DIR=/un/dossier, l'application évalue dans la page
    // tout fichier « cmd.js » déposé dans ce dossier et écrit la réponse dans
    // « resultat.json ». Sans cette variable d'environnement, rien de tout cela
    // n'existe : un double-clic sur l'application ne l'active jamais.

    func startVerificationHookIfAsked() {
        guard let dir = ProcessInfo.processInfo.environment["MACPAIN_VERIF_DIR"], !dir.isEmpty else { return }
        let base = URL(fileURLWithPath: dir, isDirectory: true)
        let cmd = base.appendingPathComponent("cmd.js"), out = base.appendingPathComponent("resultat.json")
        verifTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            guard let self = self, let source = try? String(contentsOf: cmd, encoding: .utf8) else { return }
            try? FileManager.default.removeItem(at: cmd)
            self.webView.callAsyncJavaScript(source, arguments: [:], in: nil, in: .page) { result in
                var payload: [String: Any]
                switch result {
                case .success(let value): payload = ["ok": true, "valeur": value]
                case .failure(let error): payload = ["ok": false, "erreur": "\(error)"]
                }
                if !JSONSerialization.isValidJSONObject(payload) { payload = ["ok": true, "valeur": "\(payload["valeur"] ?? "")"] }
                let data = (try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted])) ?? Data()
                try? data.write(to: out, options: .atomic)
            }
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()

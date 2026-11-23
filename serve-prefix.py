#!/usr/bin/env python3
"""Sert dist/ sous /tools/macpaint/ avec la CSP de production, pour contrôler
en local une page qui sera publiée sur etienne.design. Ne pas publier ce fichier.
"""
import http.server, functools, os, sys

CSP = ("default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; "
       "style-src 'self' 'unsafe-inline'; font-src 'self'; "
       "img-src 'self' data: blob:; media-src 'self' blob:; "
       "connect-src 'self' blob: data:; object-src 'none'; "
       "base-uri 'self'; form-action 'self'; frame-ancestors 'none'")

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

if __name__ == "__main__":
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
    handler = functools.partial(Handler, directory=root)
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()

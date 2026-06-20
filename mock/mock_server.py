#!/usr/bin/env python3
"""Local mock backend for the «Где Жить» Mini App — fetch-path parity with the real
Railway backend so api.js LIVE mode can be smoke-tested before Railway exists.

Run:  python mock/mock_server.py
Then in main.js set  BASE_URL = 'http://localhost:8787'  and open http://localhost:8787/

It serves:
  - the app static files (index.html, main.js, views/, style.css, mock/) from the app root
  - GET  /api/result     -> result_hot           (or result_empty if ?empty=1)
  - GET  /api/countries  -> countries (all)
  - GET  /api/calc       -> calc_example
  - POST /api/auth       -> {ok, user}
  - POST /api/event      -> {ok: true}
Stdlib only. CORS '*'. NOT for production — the real backend validates initData (HMAC).
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # gde-zhit-app/
DATA = os.path.join(ROOT, "mock", "mock_app_data.json")
PORT = int(os.environ.get("PORT", "8787"))

CTYPE = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
}


def load():
    with open(DATA, encoding="utf-8") as f:
        return json.load(f)


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        ln = int(self.headers.get("Content-Length", 0) or 0)
        if ln:
            self.rfile.read(ln)
        if path == "/api/event":
            self._json({"ok": True})
        elif path == "/api/auth":
            self._json({"ok": True, "user": {"id": 0, "first_name": "Demo", "username": "demo"}})
        else:
            self._json({"ok": False}, 404)

    def do_GET(self):
        u = urlparse(self.path)
        path, qs = u.path, parse_qs(u.query)
        if path.startswith("/api/"):
            d = load()
            if path == "/api/result":
                self._json(d["result_empty"] if qs.get("empty") else d["result_hot"])
            elif path == "/api/countries":
                self._json(d["countries"])
            elif path == "/api/calc":
                self._json(d["calc_example"])
            else:
                self._json({"ok": False}, 404)
            return
        # static
        rel = path.lstrip("/") or "index.html"
        fp = os.path.normpath(os.path.join(ROOT, rel))
        if not fp.startswith(ROOT) or not os.path.isfile(fp):
            self.send_response(404)
            self._cors()
            self.end_headers()
            return
        ext = os.path.splitext(fp)[1]
        with open(fp, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", CTYPE.get(ext, "application/octet-stream"))
        self._cors()
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):  # quiet
        pass


if __name__ == "__main__":
    print(f"Где Жить mock backend → http://localhost:{PORT}/  (Ctrl+C to stop)")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()

"""Local web UI server (127.0.0.1 only, stdlib)."""
from __future__ import annotations
import json, os, threading, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import protocol as p, store
from .hid import DeviceNotFound, Mouse

WEB = os.path.join(os.path.dirname(__file__), "web")
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml"}


class Handler(BaseHTTPRequestHandler):
    mouse: Mouse | None = None
    token = ""

    def log_message(self, *a): pass

    def _send(self, code, body, ctype="application/json"):
        if not isinstance(body, bytes): body = json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body))); self.send_header("Cache-Control", "no-store")
        self.end_headers(); self.wfile.write(body)

    def _mouse(self):
        if Handler.mouse is None: Handler.mouse = Mouse()
        return Handler.mouse

    def _host_ok(self):   # DNS-rebinding guard
        return (self.headers.get("Host") or "").split(":")[0] in ("127.0.0.1", "localhost")

    def do_GET(self):
        if not self._host_ok(): return self._send(403, {"error": "bad host"})
        if self.path.startswith("/api/"):
            return self._api("GET", None)
        name = "index.html" if self.path in ("/", "") else self.path.lstrip("/")
        f = os.path.normpath(os.path.join(WEB, name))
        if not f.startswith(WEB) or not os.path.isfile(f):
            return self._send(404, {"error": "not found"})
        self._send(200, open(f, "rb").read(), TYPES.get(os.path.splitext(f)[1], "application/octet-stream"))

    def do_POST(self):
        # CSRF guard: only our own page (token served by GET /api/state, same-origin only)
        if not self._host_ok() or self.headers.get("X-RS7-Token") != Handler.token:
            return self._send(403, {"error": "bad token"})
        n = int(self.headers.get("Content-Length") or 0)
        try: body = json.loads(self.rfile.read(n) or b"{}")
        except ValueError: return self._send(400, {"error": "bad json"})
        self._api("POST", body)

    def _api(self, method, body):
        try:
            m = self._mouse(); path = self.path.split("?")[0]
            if method == "GET" and path == "/api/state":
                return self._send(200, {"info": m.info(), "config": m.config(),
                                        "keys": m.keys(), "macros": store.load(), "buttons": p.BUTTONS, "token": Handler.token,
                                        "meta": {"rates": p.REPORT_RATES, "sleep": p.SLEEP_MINUTES,
                                                 "lights": p.LIGHT_MODES, "sensor_bits": p.SENSOR_BITS}})
            if method == "POST" and path == "/api/config": return self._send(200, m.set_config(body))
            if method == "POST" and path == "/api/keys": return self._send(200, m.set_keys([tuple(e) for e in body["keys"]]))
            if method == "POST" and path == "/api/keys/reset": return self._send(200, m.reset_keys())
            if method == "POST" and path == "/api/macros":
                macros = body["macros"]
                m.upload_macros([x["events"] for x in macros])   # validates; raises before saving
                store.save(macros); return self._send(200, {"macros": macros})
            if method == "POST" and path == "/api/light": return self._send(200, {"light_mode": m.set_light(int(body["mode"]))})
            self._send(404, {"error": "unknown endpoint"})
        except DeviceNotFound as e:
            self._send(503, {"error": str(e)})
        except (p.ProtocolError, KeyError, ValueError, TypeError) as e:
            self._send(400, {"error": str(e)})
        except PermissionError as e:
            self._send(503, {"error": f"{e} - install the udev rule (see README)"})
        except OSError as e:
            Handler.mouse = None; self._send(503, {"error": f"device I/O error: {e}"})


def serve(port=7777, open_browser=True) -> int:
    Handler.token = os.urandom(8).hex()
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}/"
    print("RS7 UI on", url, "(Ctrl+C to quit)")
    if open_browser: threading.Timer(0.4, webbrowser.open, [url]).start()
    try: srv.serve_forever()
    except KeyboardInterrupt: pass
    return 0

"""Local web UI server (127.0.0.1 only, stdlib)."""
from __future__ import annotations
import json, os, threading, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import __version__, events, profiles, protocol as p, store
from .hid import DeviceNotFound, Mouse

WEB = os.path.join(os.path.dirname(__file__), "web")
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml"}


FEED = events.Feed()


class Handler(BaseHTTPRequestHandler):
    mouse: Mouse | None = None
    token = ""

    def log_message(self, *a): pass

    def _send(self, code, body, ctype="application/json"):
        if not isinstance(body, bytes): body = json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body))); self.send_header("Cache-Control", "no-store")
        self.end_headers(); self.wfile.write(body)

    def _profiles(self, m):
        st = profiles.load_profiles()
        if st is None:
            st = profiles.seed(m.snapshot(store.load())); profiles.save_profiles(st)
        return st

    def _sse(self):
        """Server-sent events: live button/wheel state from the device (see events.py)."""
        self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close"); self.end_headers()
        try:
            self.wfile.write(("data: " + json.dumps({"hello": 1, "ok": FEED.ok, "mask": FEED.mask}) + "\n\n").encode()); self.wfile.flush()
            if not FEED.ok: return
            last = FEED.seq
            while True:
                evs, last = FEED.since(last)
                if not FEED.ok: return
                out = "".join("data: " + json.dumps(e) + "\n\n" for e in evs) or ": ping\n\n"
                self.wfile.write(out.encode()); self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError): return

    def _autosave(self, m):
        """Every change made through the app is stored in the active profile."""
        try:
            st = profiles.load_profiles()
            if st:
                t = next(x for x in st["profiles"] if x["id"] == st["active"])
                t.update(m.snapshot(store.load())); profiles.save_profiles(st)
        except (OSError, StopIteration, p.ProtocolError, KeyError): pass

    def _mouse(self):
        if Handler.mouse is None: Handler.mouse = Mouse()
        return Handler.mouse

    def _host_ok(self):   # DNS-rebinding guard
        return (self.headers.get("Host") or "").split(":")[0] in ("127.0.0.1", "localhost")

    def do_GET(self):
        if not self._host_ok(): return self._send(403, {"error": "bad host"})
        if self.path.split("?")[0] == "/api/events": return self._sse()
        if self.path.startswith("/api/"):
            return self._api("GET", None)
        if self.path.split("?")[0] == "/model/mouse.obj":      # optional user-supplied 3D model (not bundled)
            from . import model; f = model.DEST()
            if not os.path.isfile(f): return self._send(404, {"error": "no model"})
            return self._send(200, open(f, "rb").read(), "text/plain; charset=utf-8")
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
                return self._send(200, {"info": m.info(), "config": m.config(), "version": __version__,
                                        "profiles": self._profiles(m), "settings": {**profiles.load_settings(), "tray_supported": __import__("rs7.tray", fromlist=["x"]).watcher_available()},
                                        "keys": m.keys(), "macros": store.load(), "buttons": p.BUTTONS, "token": Handler.token,
                                        "meta": {"rates": p.REPORT_RATES, "sleep": p.SLEEP_MINUTES,
                                                 "lights": p.LIGHT_MODES, "sensor_bits": p.SENSOR_BITS}})
            if method == "GET" and path == "/api/status":      # light poll for the Home view (DPI stage changes)
                c = m.config(); return self._send(200, {"dpi_index": c["dpi_index"], "dpis": c["dpis"]})
            if method == "POST" and path == "/api/profiles":
                st = self._profiles(m); act = body.get("action")
                snap = m.snapshot(store.load()) if act in ("add", "save") else None
                profiles.save_profiles(profiles.edit(st, act, body, snap)); return self._send(200, st)
            if method == "POST" and path == "/api/profiles/apply":
                st = self._profiles(m); t = next((x for x in st["profiles"] if x["id"] == body.get("id")), None)
                if t is None: raise ValueError("unknown profile")
                m.apply_profile(t, store.load()); st["active"] = t["id"]; profiles.save_profiles(st)
                return self._send(200, {"profiles": st, "config": m.config(), "keys": m.keys()})
            if method == "POST" and path == "/api/settings":
                s = profiles.save_settings(body)
                if "tray" in body:
                    from . import tray
                    tray.set_autostart(s["tray"]); (tray.start if s["tray"] else tray.stop)()
                return self._send(200, s)
            if method == "POST" and path == "/api/config":
                r = m.set_config(body); self._autosave(m); return self._send(200, r)
            if method == "POST" and path == "/api/keys":
                r = m.set_keys([tuple(e) for e in body["keys"]]); self._autosave(m); return self._send(200, r)
            if method == "POST" and path == "/api/keys/reset":
                r = m.reset_keys(); self._autosave(m); return self._send(200, r)
            if method == "POST" and path == "/api/macros":
                macros = body["macros"]
                if not all(isinstance(x.get("name"), str) and len(x["name"]) <= 40 for x in macros): raise ValueError("macro name: string up to 40 chars")
                m.upload_macros([x["events"] for x in macros])   # validates; raises before saving
                store.save(macros); return self._send(200, {"macros": macros})
            if method == "POST" and path == "/api/light":
                r = {"light_mode": m.set_light(int(body["mode"]))}; self._autosave(m); return self._send(200, r)
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
    Handler.token = os.urandom(8).hex(); FEED.start()
    srv = None
    for p_ in range(port, port + 10):                       # an old `rs7 gui` may still hold the port: try the next ones
        try: srv = ThreadingHTTPServer(("127.0.0.1", p_), Handler); break
        except OSError as e:
            if e.errno != 98: raise
            print(f"port {p_} is busy (is an older `rs7 gui` still running? close it, or it keeps serving the old version)")
    if srv is None: print("no free port in %d..%d, use --port" % (port, port + 9)); return 1
    url = f"http://127.0.0.1:{srv.server_address[1]}/"
    print("RS7 UI on", url, "(Ctrl+C to quit)")
    if open_browser: threading.Timer(0.4, webbrowser.open, [url]).start()
    try: srv.serve_forever()
    except KeyboardInterrupt: pass
    return 0

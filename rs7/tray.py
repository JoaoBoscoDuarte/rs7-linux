"""System tray indicator, implemented directly as a StatusNotifierItem + dbusmenu over D-Bus.

Needs only PyGObject (``python3-gi``, preinstalled on GNOME/KDE desktops) — no AppIndicator typelib.
Works on KDE, XFCE, Cinnamon, MATE, Budgie, and GNOME with the "AppIndicator and KStatusNotifierItem
Support" extension (ubuntu-appindicators / gnome-shell-extension-appindicator)."""
from __future__ import annotations
import locale, os, subprocess, sys, threading

from . import profiles, store
from .hid import DeviceNotFound, Mouse
from .protocol import ProtocolError

TXT = {
    "en": {"battery": "Battery: {p}%{c}", "charging": " (charging)", "profiles": "Profiles", "open": "Open RS7 Config",
           "quit": "Quit", "offline": "Mouse not found"},
    "pt-BR": {"battery": "Bateria: {p}%{c}", "charging": " (carregando)", "profiles": "Perfis", "open": "Abrir RS7 Config",
              "quit": "Sair", "offline": "Mouse não encontrado"},
}


def pick_lang(setting: str) -> str:
    if setting in TXT: return setting
    lang = os.environ.get("LANG") or locale.getlocale()[0] or "en"
    return "pt-BR" if lang.lower().startswith("pt") else "en"


# ---- icon: percentage digits + level bar, rasterised without any imaging library ---------------
_FONT = {"0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
         "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001001001001",
         "8": "111101111101111", "9": "111101111001111", "?": "111001010000010"}


def battery_pixmap(percent, charging=False, size=32):
    """ARGB32 bytes (network order) of a size x size icon."""
    px = bytearray(size * size * 4)

    def rect(x, y, w, h, c):
        for yy in range(max(0, y), min(size, y + h)):
            for xx in range(max(0, x), min(size, x + w)):
                i = (yy * size + xx) * 4; px[i:i + 4] = bytes((255,) + c)

    pct = None if percent is None else max(0, min(100, int(percent)))
    col = (154, 160, 166) if pct is None else (229, 72, 77) if pct < 20 else (245, 165, 36) if pct < 40 else (61, 214, 140)
    if charging: col = (96, 165, 250)
    text = "?" if pct is None else str(pct)
    sc = 3 if len(text) < 3 else 2
    w = len(text) * 3 * sc + (len(text) - 1) * sc; x = (size - w) // 2; y = 4
    for ch in text:
        for i, b in enumerate(_FONT[ch]):
            if b == "1": rect(x + (i % 3) * sc, y + (i // 3) * sc, sc, sc, col)
        x += 4 * sc
    by, bw = size - 11, size - 4
    rect(2, by, bw, 8, col); rect(3, by + 1, bw - 2, 6, (30, 30, 30))
    rect(3, by + 1, round((bw - 2) * (pct or 0) / 100), 6, col)
    return bytes(px)


def menu_model(battery, state, lang):
    """Pure menu description: list of (kind, label, payload). battery = (percent, charging) or None."""
    t = TXT[lang]
    items = [("info", t["offline"] if battery is None else
              t["battery"].format(p=battery[0], c=t["charging"] if battery[1] else ""), None)]
    if state:
        items += [("sep", "", None), ("info", t["profiles"], None)]
        items += [("profile", x["name"], {"id": x["id"], "active": x["id"] == state["active"]}) for x in state["profiles"]]
    return items + [("sep", "", None), ("open", t["open"], None), ("quit", t["quit"], None)]


# ---- D-Bus plumbing -------------------------------------------------------------------------------
SNI_XML = """<node><interface name="org.kde.StatusNotifierItem">
<method name="Activate"><arg type="i" direction="in"/><arg type="i" direction="in"/></method>
<method name="ContextMenu"><arg type="i" direction="in"/><arg type="i" direction="in"/></method>
<method name="SecondaryActivate"><arg type="i" direction="in"/><arg type="i" direction="in"/></method>
<method name="Scroll"><arg type="i" direction="in"/><arg type="s" direction="in"/></method>
<property name="Category" type="s" access="read"/><property name="Id" type="s" access="read"/>
<property name="Title" type="s" access="read"/><property name="Status" type="s" access="read"/>
<property name="WindowId" type="u" access="read"/><property name="IconName" type="s" access="read"/>
<property name="IconPixmap" type="a(iiay)" access="read"/><property name="OverlayIconName" type="s" access="read"/>
<property name="OverlayIconPixmap" type="a(iiay)" access="read"/><property name="AttentionIconName" type="s" access="read"/>
<property name="AttentionIconPixmap" type="a(iiay)" access="read"/><property name="AttentionMovieName" type="s" access="read"/>
<property name="ToolTip" type="(sa(iiay)ss)" access="read"/><property name="ItemIsMenu" type="b" access="read"/>
<property name="Menu" type="o" access="read"/>
<signal name="NewIcon"/><signal name="NewToolTip"/><signal name="NewStatus"><arg type="s"/></signal>
</interface></node>"""
MENU_XML = """<node><interface name="com.canonical.dbusmenu">
<method name="GetLayout"><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="as" direction="in"/>
<arg type="u" direction="out"/><arg type="(ia{sv}av)" direction="out"/></method>
<method name="GetGroupProperties"><arg type="ai" direction="in"/><arg type="as" direction="in"/><arg type="a(ia{sv})" direction="out"/></method>
<method name="GetProperty"><arg type="i" direction="in"/><arg type="s" direction="in"/><arg type="v" direction="out"/></method>
<method name="Event"><arg type="i" direction="in"/><arg type="s" direction="in"/><arg type="v" direction="in"/><arg type="u" direction="in"/></method>
<method name="EventGroup"><arg type="a(isvu)" direction="in"/><arg type="ai" direction="out"/></method>
<method name="AboutToShow"><arg type="i" direction="in"/><arg type="b" direction="out"/></method>
<method name="AboutToShowGroup"><arg type="ai" direction="in"/><arg type="ai" direction="out"/><arg type="ai" direction="out"/></method>
<property name="Version" type="u" access="read"/><property name="TextDirection" type="s" access="read"/>
<property name="Status" type="s" access="read"/><property name="IconThemePath" type="as" access="read"/>
<signal name="LayoutUpdated"><arg type="u"/><arg type="i"/></signal>
</interface></node>"""


def item_props(kind, label, payload):
    from gi.repository import GLib
    V = GLib.Variant
    if kind == "sep": return {"type": V("s", "separator")}
    d = {"label": V("s", label.replace("_", "__")), "enabled": V("b", kind in ("open", "quit", "profile"))}
    if kind == "profile":
        d["toggle-type"] = V("s", "radio"); d["toggle-state"] = V("i", 1 if payload["active"] else 0)
    return d


def open_ui():
    subprocess.Popen([sys.executable, "-m", "rs7", "gui"], start_new_session=True,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


class Tray:
    def __init__(self, loop):
        from gi.repository import Gio, GLib
        self.Gio, self.GLib, self.loop = Gio, GLib, loop
        self.mouse = None; self.items = []; self.rev = 1; self.pix = battery_pixmap(None); self.tip = "RS7"
        self.conn = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        self.name = "org.kde.StatusNotifierItem-%d-1" % os.getpid()
        self.item_info = Gio.DBusNodeInfo.new_for_xml(SNI_XML).interfaces[0]
        self.menu_info = Gio.DBusNodeInfo.new_for_xml(MENU_XML).interfaces[0]
        self.conn.register_object("/StatusNotifierItem", self.item_info, self.sni_call, self.sni_get, None)
        self.conn.register_object("/Menu", self.menu_info, self.menu_call, self.menu_get, None)
        Gio.bus_own_name_on_connection(self.conn, self.name, Gio.BusNameOwnerFlags.NONE, None, None)
        self.conn.call_sync("org.kde.StatusNotifierWatcher", "/StatusNotifierWatcher", "org.kde.StatusNotifierWatcher",
                            "RegisterStatusNotifierItem", GLib.Variant("(s)", (self.name,)), None,
                            Gio.DBusCallFlags.NONE, 3000, None)

    # --- SNI
    def sni_get(self, conn, sender, path, iface, prop):
        V = self.GLib.Variant
        pix = [(32, 32, self.pix)]
        return {"Category": V("s", "Hardware"), "Id": V("s", "rs7-linux"), "Title": V("s", "RS7"), "Status": V("s", "Active"),
                "WindowId": V("u", 0), "IconName": V("s", ""), "IconPixmap": V("a(iiay)", pix), "OverlayIconName": V("s", ""),
                "OverlayIconPixmap": V("a(iiay)", []), "AttentionIconName": V("s", ""), "AttentionIconPixmap": V("a(iiay)", []),
                "AttentionMovieName": V("s", ""), "ToolTip": V("(sa(iiay)ss)", ("", [], self.tip, "")),
                "ItemIsMenu": V("b", True), "Menu": V("o", "/Menu")}.get(prop)

    def sni_call(self, conn, sender, path, iface, method, params, inv):
        if method == "Activate": open_ui()
        inv.return_value(None)

    # --- dbusmenu
    def layout(self):
        V = self.GLib.Variant
        kids = [V("(ia{sv}av)", (i + 1, item_props(*it), [])) for i, it in enumerate(self.items)]
        return (0, {"children-display": V("s", "submenu")}, kids)

    def menu_get(self, conn, sender, path, iface, prop):
        V = self.GLib.Variant
        return {"Version": V("u", 3), "TextDirection": V("s", "ltr"), "Status": V("s", "normal"), "IconThemePath": V("as", [])}.get(prop)

    def menu_call(self, conn, sender, path, iface, method, params, inv):
        V = self.GLib.Variant
        if method == "GetLayout": inv.return_value(V("(u(ia{sv}av))", (self.rev, self.layout())))
        elif method == "GetGroupProperties":
            ids = params.unpack()[0] or range(1, len(self.items) + 1)
            inv.return_value(V("(a(ia{sv}))", ([(i, item_props(*self.items[i - 1])) for i in ids if 0 < i <= len(self.items)],)))
        elif method == "GetProperty": inv.return_value(V("(v)", (V("s", ""),)))
        elif method == "AboutToShow": inv.return_value(V("(b)", (False,)))
        elif method == "AboutToShowGroup": inv.return_value(V("(aiai)", ([], [])))
        elif method == "EventGroup": inv.return_value(V("(ai)", ([],)))
        elif method == "Event":
            i, ev = params.unpack()[:2]
            if ev == "clicked" and 0 < i <= len(self.items): self.clicked(*self.items[i - 1])
            inv.return_value(None)
        else: inv.return_value(None)

    def clicked(self, kind, label, payload):
        if kind == "open": open_ui()
        elif kind == "quit": self.loop.quit()
        elif kind == "profile" and not payload["active"]:
            threading.Thread(target=self.switch, args=(payload["id"],), daemon=True).start()

    def switch(self, pid):
        try:
            st = profiles.load_profiles(); t = next(x for x in st["profiles"] if x["id"] == pid)
            (self.mouse or Mouse()).apply_profile(t, store.load()); st["active"] = pid; profiles.save_profiles(st)
        except Exception as e:                      # tray must survive anything the device throws
            print("profile switch failed:", e, file=sys.stderr)
        self.GLib.idle_add(self.refresh)

    def refresh(self):
        lang = pick_lang(profiles.load_settings()["lang"])
        try:
            self.mouse = self.mouse or Mouse(); inf = self.mouse.info(); bat = (inf["percent"], inf["charging"])
        except (DeviceNotFound, OSError, ProtocolError, PermissionError):
            self.mouse = None; bat = None
        st = profiles.load_profiles()
        if st is None and self.mouse:               # first run: same seeding as the web UI
            try: st = profiles.seed(self.mouse.snapshot(store.load())); profiles.save_profiles(st)
            except (OSError, ProtocolError): st = None
        self.pix = battery_pixmap(bat and bat[0], bool(bat and bat[1]))
        self.items = menu_model(bat, st, lang)
        self.tip = self.items[0][1]; self.rev += 1
        V = self.GLib.Variant
        for sig, args in (("NewIcon", None), ("NewToolTip", None)):
            self.conn.emit_signal(None, "/StatusNotifierItem", "org.kde.StatusNotifierItem", sig, args)
        self.conn.emit_signal(None, "/Menu", "com.canonical.dbusmenu", "LayoutUpdated", V("(ui)", (self.rev, 0)))
        return True


RUNDIR = os.environ.get("XDG_RUNTIME_DIR") or "/tmp"
PIDFILE = os.path.join(RUNDIR, "rs7-tray-%d.pid" % os.getuid())


def running_pid():
    try:
        pid = int(open(PIDFILE).read()); os.kill(pid, 0); return pid
    except (OSError, ValueError):
        return None


def start():
    if running_pid() is None:
        subprocess.Popen([sys.executable, "-m", "rs7", "tray"], start_new_session=True,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def stop():
    pid = running_pid()
    if pid:
        import signal; os.kill(pid, signal.SIGTERM)


def watcher_available() -> bool:
    """True if something on the session bus implements StatusNotifierWatcher (i.e. a tray can be shown)."""
    try:
        from gi.repository import Gio, GLib
        c = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        r = c.call_sync("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "NameHasOwner",
                        GLib.Variant("(s)", ("org.kde.StatusNotifierWatcher",)), None, Gio.DBusCallFlags.NONE, 1500, None)
        return bool(r.unpack()[0])
    except Exception:
        return False


def run() -> int:
    if running_pid() not in (None, os.getpid()):
        print("tray already running"); return 0
    with open(PIDFILE, "w") as f: f.write(str(os.getpid()))
    try:
        from gi.repository import GLib
    except ImportError:
        sys.exit("tray needs PyGObject: sudo apt install python3-gi  (Fedora: python3-gobject)")
    loop = GLib.MainLoop()
    try:
        t = Tray(loop)
    except Exception as e:
        sys.exit("could not register the tray icon (%s). On GNOME enable the 'AppIndicator and KStatusNotifierItem "
                 "Support' extension." % e)
    t.refresh(); GLib.timeout_add_seconds(60, t.refresh)
    import signal
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, lambda: loop.quit() or False)
    try: loop.run()
    except KeyboardInterrupt: pass
    finally:
        try: os.remove(PIDFILE)
        except OSError: pass
    return 0


AUTOSTART = os.path.expanduser("~/.config/autostart/rs7-tray.desktop")


def set_autostart(on: bool) -> None:
    if not on:
        try: os.remove(AUTOSTART)
        except FileNotFoundError: pass
        return
    os.makedirs(os.path.dirname(AUTOSTART), exist_ok=True)
    with open(AUTOSTART, "w") as f:
        import shutil
        exe = shutil.which("rs7")
        cmd = f"{exe} tray" if exe else f"{sys.executable} -m rs7 tray"
        f.write(f"[Desktop Entry]\nType=Application\nName=RS7 Tray\nExec={cmd}\nX-GNOME-Autostart-enabled=true\nNoDisplay=true\n")

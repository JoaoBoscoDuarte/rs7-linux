"""Software profiles + app settings (the mouse holds one live config; profiles are snapshots re-applied on demand)."""
from __future__ import annotations
import json, os, uuid

from . import protocol as p

DIR = os.path.join(os.environ.get("XDG_CONFIG_HOME", os.path.expanduser("~/.config")), "rs7-linux")
PROFILES_PATH, SETTINGS_PATH = os.path.join(DIR, "profiles.json"), os.path.join(DIR, "settings.json")
CFG_FIELDS = ("dpis", "dpi_count", "dpi_index", "report_rate", "lod", "debounce_ms", "sleep_min",
              "scroll_reverse", "e_sports", "sensor_flag", "light_mode")
MAX_PROFILES, DEFAULT_PROFILES, NAME_MAX = 20, 5, 40
DEFAULT_SETTINGS = {"lang": "auto", "theme": "auto", "tray": False}


def _read(path, default):
    try:
        with open(path) as f: return json.load(f)
    except (OSError, ValueError):
        return default


def _write(path, data):
    os.makedirs(DIR, exist_ok=True)
    with open(path + ".tmp", "w") as f: json.dump(data, f, indent=1)
    os.replace(path + ".tmp", path)


# ---- pure helpers -------------------------------------------------------
def clean_name(name) -> str:
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > NAME_MAX:
        raise p.ProtocolError(f"profile name: 1..{NAME_MAX} chars")
    return name.strip()


def snapshot(cfg: dict, keys, macros) -> dict:
    """cfg from Mouse.config(), keys from Mouse.keys(), macros = saved macro library."""
    out = []
    for e in list(keys)[:6]:
        e = tuple(e)
        if e[0] == p.T_MACRO:
            name = macros[e[1]]["name"] if e[1] < len(macros) else None
            out.append({"macro": name, "count": e[2], "mode": e[3]})
        elif e[0] == 255: out.append(list(p.DEFAULT_KEYS[len(out)]))        # unset = factory default
        else: out.append(list(e))
    return {"config": {k: cfg[k] for k in CFG_FIELDS}, "keys": out}


def resolve_keys(entries, macros):
    res = []
    for e in entries:
        if isinstance(e, dict):
            names = [m["name"] for m in macros]
            if e.get("macro") not in names: raise p.ProtocolError(f"macro not found: {e.get('macro')!r}")
            res.append((p.T_MACRO, names.index(e["macro"]), e["count"], e["mode"]))
        else: res.append(tuple(e))
    if len(res) != 6: raise p.ProtocolError("profile needs 6 button entries")
    if res[0][0] == p.T_MOUSE and res[0][1] == 0:
        raise p.ProtocolError("left click disabled: refusing, you would lose the mouse")
    return res


def new_profile(name, snap) -> dict:
    return {"id": uuid.uuid4().hex[:8], "name": clean_name(name), **json.loads(json.dumps(snap))}


def seed(snap) -> dict:
    ps = [new_profile(f"Profile {i}", snap) for i in range(1, DEFAULT_PROFILES + 1)]
    return {"active": ps[0]["id"], "profiles": ps}


def edit(state: dict, action: str, body: dict, snap=None) -> dict:
    """add | rename | delete | save | select. `snap` = current mouse snapshot (for add/save)."""
    ps = state["profiles"]; find = lambda i: next((x for x in ps if x["id"] == i), None)
    if action == "add":
        if len(ps) >= MAX_PROFILES: raise p.ProtocolError(f"max {MAX_PROFILES} profiles")
        n = new_profile(body.get("name") or f"Profile {len(ps) + 1}", snap); ps.append(n); state["active"] = n["id"]
    else:
        t = find(body.get("id"))
        if t is None: raise p.ProtocolError("unknown profile")
        if action == "rename": t["name"] = clean_name(body.get("name"))
        elif action == "save": t.update(json.loads(json.dumps(snap)))
        elif action == "select": state["active"] = t["id"]
        elif action == "delete":
            if len(ps) <= 1: raise p.ProtocolError("keep at least one profile")
            ps.remove(t)
            if state["active"] == t["id"]: state["active"] = ps[0]["id"]
        else: raise p.ProtocolError("unknown action")
    return state


def load_profiles(): return _read(PROFILES_PATH, None)
def save_profiles(s): _write(PROFILES_PATH, s)


def load_settings() -> dict:
    s = _read(SETTINGS_PATH, {}); return {**DEFAULT_SETTINGS, **{k: s[k] for k in DEFAULT_SETTINGS if k in s}}


def save_settings(new: dict) -> dict:
    s = load_settings()
    for k, ok in (("lang", ("auto", "en", "pt-BR")), ("theme", ("auto", "light", "dark")), ("tray", (True, False))):
        if k in new:
            if new[k] not in ok: raise p.ProtocolError(f"bad {k}")
            s[k] = new[k]
    _write(SETTINGS_PATH, s); return s

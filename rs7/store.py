"""Macro library on disk (the mouse memory cannot be read back reliably, so this is the source of truth)."""
import json, os

PATH = os.path.join(os.environ.get("XDG_CONFIG_HOME", os.path.expanduser("~/.config")), "rs7-linux", "macros.json")


def load():
    try:
        with open(PATH) as f: return json.load(f)
    except (OSError, ValueError):
        return []


def save(macros):
    os.makedirs(os.path.dirname(PATH), exist_ok=True)
    tmp = PATH + ".tmp"
    with open(tmp, "w") as f: json.dump(macros, f, indent=1)
    os.replace(tmp, PATH)

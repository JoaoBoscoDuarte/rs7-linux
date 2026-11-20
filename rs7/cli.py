"""Command line: rs7 info|show|dpi|set|keys|light|gui."""
from __future__ import annotations
import argparse, json, sys

from . import protocol as p
from .hid import DeviceNotFound, Mouse


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="rs7", description="Configure the Smailwolf RS7 mouse on Linux")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("info"); sub.add_parser("show"); sub.add_parser("keys")
    s = sub.add_parser("dpi"); s.add_argument("slot", type=int, choices=range(1, 7)); s.add_argument("value", type=int)
    s = sub.add_parser("set"); s.add_argument("field"); s.add_argument("value")
    s = sub.add_parser("light"); s.add_argument("mode", choices=p.LIGHT_MODES)
    s = sub.add_parser("macro"); s.add_argument("action", choices=["list", "upload"]); s.add_argument("file", nargs="?")
    s = sub.add_parser("gui"); s.add_argument("--port", type=int, default=7777); s.add_argument("--no-browser", action="store_true")
    a = ap.parse_args(argv)
    try:
        if a.cmd == "gui":
            from .server import serve
            return serve(a.port, not a.no_browser)
        m = Mouse()
        if a.cmd == "info": out = m.info()
        elif a.cmd == "show": out = m.config()
        elif a.cmd == "keys": out = dict(zip(p.BUTTONS, m.keys()))
        elif a.cmd == "dpi":
            d = m.config()["dpis"]; d[a.slot - 1] = a.value
            out = m.set_config({"dpis": d})
        elif a.cmd == "macro":
            from . import store
            if a.action == "list": out = store.load()
            else:
                out = json.load(open(a.file)); m.upload_macros([x["events"] for x in out]); store.save(out)
        else:
            v = json.loads(a.value)
            out = m.set_config({a.field: v})
        print(json.dumps(out, indent=2)); return 0
    except (DeviceNotFound, p.ProtocolError, PermissionError) as e:
        print("error:", e, file=sys.stderr); return 1


if __name__ == "__main__":
    sys.exit(main())

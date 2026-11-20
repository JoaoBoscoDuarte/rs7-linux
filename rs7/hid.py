"""hidraw transport for the RS7 vendor config interface (USB interface 2)."""
from __future__ import annotations
import glob, os, select, threading

from . import protocol as p

IDS = ("A8A4:2255", "A8A5:2255")        # USB cable, 2.4G dongle


class DeviceNotFound(Exception):
    pass


def find_node() -> str:
    for h in sorted(glob.glob("/sys/class/hidraw/hidraw*")):
        real = os.path.realpath(h + "/device")
        if any(i in real.upper() for i in IDS) and ":1.2/" in real:
            return "/dev/" + os.path.basename(h)
    raise DeviceNotFound("RS7 not found (plugged in? udev rule installed? see README)")


class Mouse:
    def __init__(self, node: str | None = None):
        self.fd = os.open(node or find_node(), os.O_RDWR)
        self.lock = threading.Lock()

    def close(self): os.close(self.fd)

    def xfer(self, req: bytes) -> bytes:
        with self.lock:
            while select.select([self.fd], [], [], 0.03)[0]:
                os.read(self.fd, 64)            # drop stale input
            os.write(self.fd, req)
            if not select.select([self.fd], [], [], 1.0)[0]:
                raise p.ProtocolError("no reply from mouse")
            return p.check_reply(req, os.read(self.fd, 64))

    # -- high level ------------------------------------------------------
    def info(self):
        v = p.parse_version(self.xfer(p.req_version()))
        v.update(p.parse_battery(self.xfer(p.req_battery())))
        return v

    def config(self) -> dict:
        return p.parse_config(self.xfer(p.req_config()))

    def set_config(self, changes: dict) -> dict:
        """Read-modify-write, then read back and verify every requested field."""
        cur = self.xfer(p.req_config())
        self.xfer(p.build_config_write(cur, changes))
        new = self.config()
        bad = {k: new.get(k) for k, v in changes.items() if new.get(k) != v}
        if bad:
            raise p.ProtocolError(f"readback mismatch: {bad}")
        return new

    def keys(self): return p.parse_keys(self.xfer(p.req_keys()))

    def set_keys(self, entries):
        self.xfer(p.build_keys_write(entries))
        return self.keys()

    def reset_keys(self): return self.set_keys(p.DEFAULT_KEYS[:6])

    def set_light(self, mode: int):
        self.xfer(p.req_light(mode))
        return self.config()["light_mode"]

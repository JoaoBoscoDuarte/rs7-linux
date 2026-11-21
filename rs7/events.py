"""Live button/wheel feed straight from the mouse's evdev node (passive read, nothing is grabbed).
Needs read access to /dev/input/event* (group `input` on most distros). Without it the UI falls back to browser events."""
from __future__ import annotations
import collections, glob, os, struct, threading, time

EV_KEY, EV_REL, REL_WHEEL = 1, 2, 8
BTN = {0x110: 1, 0x111: 2, 0x112: 4, 0x113: 8, 0x114: 16, 0x115: 16, 0x116: 8}   # left right middle side(back) extra(forward) forward back
IDS = ("a8a4", "a8a5")
FMT = struct.Struct("llHHi")


def find_nodes():
    out = []
    for d in sorted(glob.glob("/sys/class/input/event*")):
        try:
            vid = open(d + "/device/id/vendor").read().strip().lower(); pid = open(d + "/device/id/product").read().strip().lower()
            if vid not in IDS or pid != "2255": continue
            words = open(d + "/device/capabilities/key").read().split()
            bits = int("".join(w.zfill(16) for w in words) or "0", 16)      # words are space separated, most significant first
            if bits >> 0x110 & 1: out.append("/dev/input/" + os.path.basename(d))   # has BTN_LEFT: the pointer node
        except (OSError, ValueError): continue
    return out


class Feed:
    def __init__(self):
        self.cv = threading.Condition(); self.seq = 0; self.events = collections.deque(maxlen=256)
        self.mask = 0; self.ok = False; self.started = False

    def push(self, ev):
        with self.cv:
            self.seq += 1; self.events.append((self.seq, ev)); self.cv.notify_all()

    def handle(self, etype, code, value):
        """Feed one evdev event; emits {"b": mask} on button changes and {"w": ±1} on wheel ticks."""
        if etype == EV_KEY and code in BTN:
            m = BTN[code]; new = (self.mask | m) if value else (self.mask & ~m)
            if new != self.mask: self.mask = new; self.push({"b": new})
        elif etype == EV_REL and code == REL_WHEEL and value: self.push({"w": 1 if value > 0 else -1})

    def since(self, last, timeout=15.0):
        with self.cv:
            if self.seq == last: self.cv.wait(timeout)
            return [e for s, e in self.events if s > last], self.seq

    def start(self):
        if not self.started: self.started = True; threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        while True:
            nodes = find_nodes()
            if not nodes: self.ok = False; time.sleep(3); continue
            try:
                fd = os.open(nodes[0], os.O_RDONLY); self.ok = True; self.mask = 0
                while True:
                    data = os.read(fd, FMT.size * 32)
                    for i in range(0, len(data) - FMT.size + 1, FMT.size):
                        _, _, t, c, v = FMT.unpack_from(data, i); self.handle(t, c, v)
            except OSError: self.ok = False; time.sleep(2)

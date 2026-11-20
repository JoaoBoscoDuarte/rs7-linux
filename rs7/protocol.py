"""Pure protocol layer (no I/O). See docs/PROTOCOL.md.

Every frame is 64 bytes on the vendor HID interface (no report ID):
    d[0]=0x55  d[1]=cmd  d[2]=type  d[3]=checksum  d[4:]=payload
    checksum = sum(d[4:]) & 0xFF.   Replies start with 0xAA and echo cmd in d[1].
"""
from __future__ import annotations

FRAME_LEN = 64
REPORT_RATES = (125, 250, 500, 1000)   # config value = index (wire byte = index + 1)
SLEEP_MINUTES = (255, 1, 3, 5, 10, 20, 30, 60)   # 255 = firmware default / unset
SENSOR_BITS = {"ripple": 0x01, "angle_snap": 0x10, "motion_sync": 0x20}
DPI_MIN, DPI_MAX, DPI_SLOTS = 100, 20000, 6
LIGHT_MODES = ("off", "steady", "breathing")

CMD_VERSION, CMD_LIGHT = 0x03, 0x21
CMD_KEYS_READ, CMD_KEYS_WRITE = 0x08, 0x09
CMD_CFG_READ, CMD_CFG_WRITE = 0x0E, 0x0F
CMD_BATTERY = 0x30
T_READ, T_WRITE = 0xA5, 0xAE


class ProtocolError(Exception):
    pass


def checksum(d) -> int:
    return sum(d[4:]) & 0xFF


def frame(cmd: int, typ: int = 0, payload: bytes = b"") -> bytes:
    if len(payload) > FRAME_LEN - 4:
        raise ProtocolError("payload too long")
    d = bytearray(FRAME_LEN)
    d[0], d[1], d[2] = 0x55, cmd, typ
    d[4:4 + len(payload)] = payload
    d[3] = checksum(d)
    return bytes(d)


def check_reply(req: bytes, rep: bytes) -> bytes:
    if len(rep) != FRAME_LEN or rep[0] != 0xAA or rep[1] != req[1]:
        raise ProtocolError("unexpected reply: " + bytes(rep).hex(" "))
    return rep


# ---- info ---------------------------------------------------------------
def req_version(): return frame(CMD_VERSION)
def req_battery(): return frame(CMD_BATTERY, T_READ, bytes([0x2E, 1, 1, 0, 0, 0]))
def parse_battery(r): return {"percent": r[8], "charging": bool(r[9])}


def parse_version(r):
    ident = bytes(r[8:20]).split(b"\0")[0].decode("ascii", "replace")
    build = bytes(r[23:]).decode("ascii", "replace").strip("\0")
    return {"id": ident, "build": build, "fw": build[:3], "date": build[3:14].replace("  ", " ")}


# ---- main config block --------------------------------------------------
def req_config(): return frame(CMD_CFG_READ, T_READ, bytes([0x2F, 1, 1, 0, 0]))


def parse_config(r) -> dict:
    return {
        "light_mode": r[9],
        "report_rate": max(0, min(3, r[10] - 1)),
        "dpi_count": r[11],
        "dpi_index": max(0, r[12] - 1),
        "dpis": [r[13 + 2 * k] | r[14 + 2 * k] << 8 for k in range(DPI_SLOTS)],
        "scroll_reverse": r[48] == 1,
        "lod": 2 if r[49] == 2 else 1,           # mm; 0xFF (unset) shows as 1
        "sensor_flag": r[50],
        "debounce_ms": r[51],
        "sleep_min": r[52],                       # 0xFF = never configured (firmware default)
        "e_sports": r[53] == 1,
    }


def validate_changes(ch: dict) -> None:
    for k, v in ch.items():
        if k == "dpis":
            if len(v) != DPI_SLOTS or not all(DPI_MIN <= x <= DPI_MAX for x in v):
                raise ProtocolError(f"dpis: {DPI_SLOTS} values in {DPI_MIN}..{DPI_MAX}")
        elif k == "report_rate" and v not in range(4): raise ProtocolError("report_rate 0..3")
        elif k == "dpi_count" and v not in range(1, 7): raise ProtocolError("dpi_count 1..6")
        elif k == "dpi_index" and v not in range(6): raise ProtocolError("dpi_index 0..5")
        elif k == "lod" and v not in (1, 2): raise ProtocolError("lod 1|2")
        elif k == "sleep_min" and v not in SLEEP_MINUTES: raise ProtocolError(f"sleep_min in {SLEEP_MINUTES}")
        elif k == "debounce_ms" and v not in range(0, 21): raise ProtocolError("debounce_ms 0..20")
        elif k == "sensor_flag" and v & ~0x31: raise ProtocolError("sensor_flag bits 0x01|0x10|0x20")
        elif k not in {"light_mode", "scroll_reverse", "e_sports", "report_rate", "dpi_count",
                       "dpi_index", "lod", "sleep_min", "debounce_ms", "sensor_flag", "dpis"}:
            raise ProtocolError("unknown field " + k)
    if ch.get("light_mode", 0) not in range(len(LIGHT_MODES)):
        raise ProtocolError("light_mode 0..2")


def build_config_write(r: bytes, ch: dict) -> bytes:
    """Read-modify-write: start from the device's own config reply, patch fields."""
    validate_changes(ch)
    cur = parse_config(r); cur.update(ch)
    if cur["dpi_index"] >= cur["dpi_count"]:
        raise ProtocolError("dpi_index must be < dpi_count")
    d = bytearray(r)
    d[1], d[2] = CMD_CFG_WRITE, T_WRITE
    d[4], d[5], d[6], d[7], d[8] = 0x2F, 1, 1, 0, 0
    d[9] = cur["light_mode"]; d[10] = cur["report_rate"] + 1
    d[11] = cur["dpi_count"]; d[12] = cur["dpi_index"] + 1
    for k, v in enumerate(cur["dpis"]):
        d[13 + 2 * k], d[14 + 2 * k] = v & 255, v >> 8
    d[48] = int(cur["scroll_reverse"]); d[49] = cur["lod"]; d[50] = cur["sensor_flag"]
    d[51] = cur["debounce_ms"]; d[52] = cur["sleep_min"]; d[53] = int(cur["e_sports"])
    d[0] = 0x55
    d[3] = checksum(d)
    return bytes(d)


def req_light(mode: int):
    if mode not in range(len(LIGHT_MODES)): raise ProtocolError("light_mode 0..2")
    return frame(CMD_LIGHT, 0, bytes([3, 0, 0, 0, 0, 0, mode]))


# ---- buttons ------------------------------------------------------------
BUTTONS = ("left", "right", "middle", "back", "forward", "dpi")
T_MOUSE, T_SPECIAL, T_KEY, T_MEDIA, T_MACRO = 0x20, 0x21, 0x10, 0x30, 0x70
MACRO_MODES = {0: "repeat N times", 2: "loop while button held", 3: "loop until any click"}   # 2/3 labels from vendor strings, unverified
DEFAULT_KEYS = [
    (T_MOUSE, 1, 0, 0), (T_MOUSE, 2, 0, 0), (T_MOUSE, 4, 0, 0),
    (T_MOUSE, 8, 0, 0), (T_MOUSE, 16, 0, 0), (T_SPECIAL, 0x55, 0, 0),
    (T_SPECIAL, 0x38, 1, 0), (T_SPECIAL, 0x38, 255, 0),   # wheel up / down (not remappable)
]


def req_keys(): return frame(CMD_KEYS_READ, T_READ, bytes([0x20]))


def parse_keys(r):
    return [tuple(r[8 + 4 * i:12 + 4 * i]) for i in range(7)]


def build_keys_write(entries) -> bytes:
    """entries: up to 6 (type,code1,code2,code3); rest of the table = factory defaults."""
    if len(entries) != len(BUTTONS): raise ProtocolError("need 6 button entries")
    for e in entries:
        if len(e) != 4 or not all(0 <= x <= 255 for x in e): raise ProtocolError("bad entry")
        if e[0] not in (T_MOUSE, T_SPECIAL, T_KEY, T_MEDIA, T_MACRO): raise ProtocolError("bad action type")
        if e[0] == T_MACRO and (e[1] > 31 or e[3] not in MACRO_MODES or (e[3] == 0 and not 1 <= e[2] <= 255)):
            raise ProtocolError("bad macro binding (index 0..31, mode 0|2|3, count 1..255)")
    table = list(entries) + DEFAULT_KEYS[6:]
    payload = bytearray([0x20, 0, 0, 0])
    for e in table: payload += bytes(e)
    return frame(CMD_KEYS_WRITE, T_READ, bytes(payload))


# ---- macros -------------------------------------------------------------
# Image layout (vendor web tool): 64-byte index (32 x u16 LE offset, 0 = empty) then 4-byte events:
#   delay_ms u16 LE | flags | code     flags: 0x40 key/button down, 0x03 mouse / 0x02 key, 0x80 last event
MACRO_MAX, MACRO_IMAGE_MAX, MACRO_CHUNK = 32, 4096, 56
CMD_MACRO_WRITE, CMD_MACRO_COMMIT = 0x0D, 0x10


def build_macro_image(macros) -> bytes:
    """macros: list (<=32) of event lists; event = dict(kind='key'|'mouse', code, down, delay_ms)."""
    if len(macros) > MACRO_MAX: raise ProtocolError("max 32 macros")
    img = bytearray(64); body = bytearray()
    for i, evs in enumerate(macros):
        if not evs: continue
        off = 64 + len(body)
        img[2 * i], img[2 * i + 1] = off & 255, off >> 8
        for j, e in enumerate(evs):
            if e["kind"] not in ("key", "mouse") or not 0 <= e["code"] <= 255: raise ProtocolError("bad macro event")
            delay = max(0, min(65535, int(e.get("delay_ms", 0))))
            fl = (0x40 if e["down"] else 0) | (0x03 if e["kind"] == "mouse" else 0x02) | (0x80 if j == len(evs) - 1 else 0)
            body += bytes([delay & 255, delay >> 8, fl, e["code"]])
    img += body
    if len(img) > MACRO_IMAGE_MAX: raise ProtocolError("macro memory full (4096 bytes)")
    return bytes(img)


def macro_frames(image: bytes):
    """Frames exactly as the vendor tool sends them (it leaves chk=0 on chunks; device ignores chk)."""
    out = []
    for off in range(0, len(image), MACRO_CHUNK):
        ch = image[off:off + MACRO_CHUNK]
        d = bytearray(frame(CMD_MACRO_WRITE, 0, bytes([len(ch), off & 255, off >> 8, 0]) + ch)); d[3] = 0
        out.append(bytes(d))
    c = bytearray(frame(CMD_MACRO_COMMIT, T_READ, bytes([0, 0, 0, 5]))); c[3] = 0x22
    out.append(bytes(c))
    return out

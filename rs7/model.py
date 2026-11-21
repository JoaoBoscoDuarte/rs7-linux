"""Optional user-supplied 3D mouse model (OBJ). Not bundled: its licence is the user's responsibility.
Installed to ~/.config/rs7-linux/model/mouse.obj and shown by the Home 3D view (see README)."""
import io, os, zipfile

from . import profiles
from .protocol import ProtocolError

MAX = 20 * 1024 * 1024
DEST = lambda: os.path.join(profiles.DIR, "model", "mouse.obj")


def import_model(path: str) -> str:
    if not path or not os.path.isfile(path): raise ProtocolError("give the path of a .obj or a .zip containing one")
    with open(path, "rb") as f: raw = f.read(MAX + 1)
    if len(raw) > MAX: raise ProtocolError("file too large (max 20 MB)")
    if zipfile.is_zipfile(io.BytesIO(raw)):
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            objs = [i for i in z.infolist() if i.filename.lower().endswith(".obj") and not i.is_dir() and 0 < i.file_size <= MAX]
            if not objs: raise ProtocolError("no .obj file inside the zip")
            raw = z.read(max(objs, key=lambda i: i.file_size))      # only reads the bytes; nothing is extracted to disk by name
    if b"\nv " not in b"\n" + raw or b"\nf " not in b"\n" + raw: raise ProtocolError("not a Wavefront OBJ (no vertices/faces)")
    dest = DEST(); os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest + ".tmp", "wb") as f: f.write(raw)
    os.replace(dest + ".tmp", dest); return dest


def remove() -> str:
    try: os.remove(DEST()); return "removed"
    except FileNotFoundError: return "no model installed"

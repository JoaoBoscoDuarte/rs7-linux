import io, os, tempfile, unittest, zipfile
os.environ["XDG_CONFIG_HOME"] = tempfile.mkdtemp()
from rs7 import model, protocol as p

OBJ = b"o x\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"


class Model(unittest.TestCase):
    def test_import_obj_and_zip(self):
        d = tempfile.mkdtemp(); o = os.path.join(d, "m.obj"); open(o, "wb").write(OBJ)
        self.assertEqual(open(model.import_model(o), "rb").read(), OBJ)
        z = os.path.join(d, "m.zip")
        with zipfile.ZipFile(z, "w") as f: f.writestr("../../evil/mouse.obj", OBJ); f.writestr("readme.txt", b"hi")
        dest = model.import_model(z); self.assertTrue(dest.startswith(os.environ["XDG_CONFIG_HOME"]))   # no path traversal
        self.assertEqual(model.remove(), "removed"); self.assertEqual(model.remove(), "no model installed")

    def test_rejects_junk(self):
        d = tempfile.mkdtemp(); j = os.path.join(d, "j.obj"); open(j, "wb").write(b"not a model")
        for bad in (j, os.path.join(d, "missing"), None):
            with self.assertRaises(p.ProtocolError): model.import_model(bad)

if __name__ == "__main__": unittest.main()

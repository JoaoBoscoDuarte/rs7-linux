import os, unittest
from rs7 import protocol as p

def fx(n): return bytes.fromhex(open(os.path.join(os.path.dirname(__file__), "fixtures", n)).read())


class Proto(unittest.TestCase):
    def test_frame_checksum(self):
        f = p.frame(0x0E, p.T_READ, bytes([0x2F, 1, 1]))
        self.assertEqual(len(f), 64); self.assertEqual(f[:3], bytes([0x55, 0x0E, 0xA5]))
        self.assertEqual(f[3], (0x2F + 2) & 0xFF)

    def test_real_replies_checksum(self):      # device's own replies obey the same checksum
        for n in ("version_reply.hex",):   # NB: other replies use a different device-side checksum
            r = fx(n); self.assertEqual(r[3], p.checksum(r))

    def test_parse_config(self):
        c = p.parse_config(fx("config_reply.hex"))
        self.assertEqual(c["dpis"], [800, 1600, 2400, 3200, 6400, 20000])
        self.assertEqual((c["dpi_count"], c["dpi_index"], c["report_rate"]), (6, 1, 1))
        self.assertEqual(c["debounce_ms"], 10)

    def test_version(self):
        self.assertEqual(p.parse_version(fx("version_reply.hex"))["id"], "YJX.co.mouse")

    def test_write_roundtrip(self):
        r = fx("config_reply.hex"); d = p.parse_config(r)["dpis"]; d[0] = 1000
        w = p.build_config_write(r, {"dpis": d, "report_rate": 3})
        self.assertEqual((w[1], w[2], w[3]), (0x0F, 0xAE, p.checksum(w)))
        sim = bytearray(w); sim[1], sim[2], sim[0] = 0x0E, 0xA5, 0xAA     # device would echo this
        c = p.parse_config(bytes(sim)); self.assertEqual((c["dpis"][0], c["report_rate"]), (1000, 3))
        # untouched bytes preserved
        self.assertEqual(w[25:48], r[25:48])

    def test_validation(self):
        r = fx("config_reply.hex")
        for bad in ({"dpis": [50] * 6}, {"report_rate": 4}, {"lod": 3}, {"sleep_min": 2}, {"dpi_index": 6}, {"nope": 1}, {"dpi_count": 1}):
            with self.assertRaises(p.ProtocolError): p.build_config_write(r, bad)

    def test_keys(self):
        f = p.build_keys_write(p.DEFAULT_KEYS[:6])
        self.assertEqual(f[1:3], bytes([9, 0xA5])); self.assertEqual(f[8:12], bytes([0x20, 1, 0, 0]))
        self.assertEqual(f[32:36], bytes([0x21, 0x38, 1, 0]))     # wheel entries = defaults
        with self.assertRaises(p.ProtocolError): p.build_keys_write(p.DEFAULT_KEYS[:5])

if __name__ == "__main__": unittest.main()

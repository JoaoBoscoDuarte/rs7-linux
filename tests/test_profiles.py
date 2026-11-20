import json, unittest
from rs7 import profiles as pr, protocol as p

CFG = {"dpis": [800, 1600, 2400, 3200, 6400, 20000], "dpi_count": 6, "dpi_index": 1, "report_rate": 3, "lod": 1,
       "debounce_ms": 10, "sleep_min": 255, "scroll_reverse": False, "e_sports": False, "sensor_flag": 1,
       "light_mode": 0, "extra": 1}
MACROS = [{"name": "tap A", "events": []}, {"name": "spam", "events": []}]


class Profiles(unittest.TestCase):
    def snap(self, keys=None): return pr.snapshot(CFG, keys or [(255, 255, 255, 255)] * 6, MACROS)

    def test_snapshot_defaults_and_macro_names(self):
        k = list(p.DEFAULT_KEYS[:6]); k[4] = (p.T_MACRO, 1, 3, 0)
        s = self.snap(k); self.assertNotIn("extra", s["config"])
        self.assertEqual(s["keys"][4], {"macro": "spam", "count": 3, "mode": 0})
        self.assertEqual(self.snap()["keys"][0], [0x20, 1, 0, 0])        # 0xFF -> factory default

    def test_resolve_macro_by_name_survives_reorder(self):
        s = self.snap([(0x20, 1, 0, 0)] * 4 + [(p.T_MACRO, 1, 3, 0), (0x21, 0x55, 0, 0)])
        self.assertEqual(pr.resolve_keys(s["keys"], list(reversed(MACROS)))[4], (p.T_MACRO, 0, 3, 0))
        with self.assertRaises(p.ProtocolError): pr.resolve_keys(s["keys"], [])

    def test_refuse_disabled_left_click(self):
        with self.assertRaises(p.ProtocolError): pr.resolve_keys([[0x20, 0, 0, 0]] + [[0x20, 2, 0, 0]] * 5, MACROS)

    def test_edit_limits(self):
        st = pr.seed(self.snap()); self.assertEqual(len(st["profiles"]), 5)
        for _ in range(15): pr.edit(st, "add", {"name": "x"}, self.snap())
        self.assertEqual(len(st["profiles"]), 20)
        with self.assertRaises(p.ProtocolError): pr.edit(st, "add", {"name": "x"}, self.snap())
        for x in list(st["profiles"])[:19]: pr.edit(st, "delete", {"id": x["id"]})
        with self.assertRaises(p.ProtocolError): pr.edit(st, "delete", {"id": st["profiles"][0]["id"]})
        self.assertEqual(st["active"], st["profiles"][0]["id"])

    def test_rename_validation_and_independence(self):
        st = pr.seed(self.snap()); a, b = st["profiles"][:2]
        pr.edit(st, "rename", {"id": a["id"], "name": " Gaming "}); self.assertEqual(a["name"], "Gaming")
        a["config"]["dpis"][0] = 123; self.assertEqual(b["config"]["dpis"][0], 800)      # deep copies
        for bad in ("", "  ", "x" * 41, None):
            with self.assertRaises(p.ProtocolError): pr.edit(st, "rename", {"id": a["id"], "name": bad})
        json.dumps(st)

    def test_settings_validation(self):
        for bad in ({"lang": "fr"}, {"theme": "x"}, {"tray": "yes"}):
            with self.assertRaises(p.ProtocolError): pr.save_settings(bad)

if __name__ == "__main__": unittest.main()

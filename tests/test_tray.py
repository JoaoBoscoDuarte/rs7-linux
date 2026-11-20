import unittest
from rs7 import tray


class Tray(unittest.TestCase):
    def test_pixmap(self):
        for pct, ch in ((None, False), (0, False), (7, True), (35, False), (100, True)):
            px = tray.battery_pixmap(pct, ch); self.assertEqual(len(px), 32 * 32 * 4)
            self.assertTrue(any(px[i] for i in range(0, len(px), 4)))          # something drawn (alpha)
        self.assertNotEqual(tray.battery_pixmap(10), tray.battery_pixmap(90))

    def test_menu_model(self):
        st = {"active": "b", "profiles": [{"id": "a", "name": "A"}, {"id": "b", "name": "B"}]}
        m = tray.menu_model((80, True), st, "pt-BR")
        self.assertEqual(m[0][1], "Bateria: 80% (carregando)")
        self.assertEqual([x[2] for x in m if x[0] == "profile"], [{"id": "a", "active": False}, {"id": "b", "active": True}])
        self.assertEqual([x[0] for x in m][-2:], ["open", "quit"])
        self.assertEqual(tray.menu_model(None, None, "en")[0][1], "Mouse not found")

    def test_lang_pick(self):
        self.assertEqual(tray.pick_lang("en"), "en"); self.assertEqual(tray.pick_lang("pt-BR"), "pt-BR")

if __name__ == "__main__": unittest.main()

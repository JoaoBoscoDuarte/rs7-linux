import unittest
from rs7 import events as ev


class Feed(unittest.TestCase):
    def test_buttons_and_wheel(self):
        f = ev.Feed()
        f.handle(1, 0x110, 1); f.handle(1, 0x113, 1); f.handle(1, 0x110, 0); f.handle(2, 8, 1); f.handle(2, 8, -1); f.handle(2, 0, 5)
        self.assertEqual([e for _, e in f.events], [{"b": 1}, {"b": 9}, {"b": 8}, {"w": 1}, {"w": -1}])
        f.handle(1, 0x113, 1)                               # repeat press: no duplicate event
        self.assertEqual(len(f.events), 5)

    def test_forward_back_aliases(self):
        f = ev.Feed(); f.handle(1, 0x114, 1); self.assertEqual(f.mask, 16); f.handle(1, 0x114, 0); f.handle(1, 0x116, 1); self.assertEqual(f.mask, 8)

    def test_since_returns_new_events_only(self):
        f = ev.Feed(); f.handle(1, 0x111, 1); evs, last = f.since(0, 0.01); self.assertEqual(evs, [{"b": 2}])
        self.assertEqual(f.since(last, 0.01)[0], [])

if __name__ == "__main__": unittest.main()

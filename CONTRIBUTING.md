# Contributing
- Run `python3 -m unittest discover -s tests -t .` before sending a PR; protocol logic stays in `rs7/protocol.py` (pure, testable).
- New device/firmware reports: open an issue with `lsusb`, `rs7 info`, `rs7 show`.
- Reverse-engineering rules: only replay commands observed in vendor tools; verify every new write by read-back; never fuzz unknown commands on real hardware; do not commit vendor binaries.
- Add a fixture under `tests/fixtures/` (real reply hex) when you decode a new field.
- Translations: add a language block to `rs7/web/i18n.js` (same keys as `en`; the checker in CI/tests will complain on missing keys) and to `TXT` in `rs7/tray.py`.

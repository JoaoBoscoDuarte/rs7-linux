# Changelog

## 0.4.0
- New Home screen: live mouse view that lights the clicked button / wheel direction, click counters, and a movement test pad (trail, position, speed, estimated event rate, current DPI). Browser Back/Forward mouse buttons are swallowed while on Home.

## 0.3.0
- Profiles: 5 by default, add with `+` (max 20), rename, delete. Every change made in the app is saved into the active profile; switching applies it to the mouse (with read-back). `rs7 profile list|apply`.
- UI redesign (sidebar, vendor-site-inspired dark navy look, own SVG mouse), light/dark/auto theme, English and Português (Brasil), Settings and About tabs, credits footer.
- Tray icon (`rs7 tray`): battery percentage icon, profile switcher, open app. Pure D-Bus StatusNotifierItem + dbusmenu, no extra libraries; toggle + autostart in Settings.
- Cross-process lock so the tray and the web UI never interleave HID frames.
- Security: HTML-escape dynamic labels (macro/profile names), names capped at 40 chars server-side.

## 0.2.0
- Macros: editor with keyboard recorder, upload to mouse, bind to buttons (repeat / while held / until click).
- UI shows firmware version/date; screenshots in README.
- Documented that per-stage DPI colours are not stored by this firmware.

## 0.1.0
- Initial release: hidraw transport, protocol codec, CLI (`rs7`), local web UI (`rs7 gui`).
- DPI stages, polling rate, LOD, debounce, sleep, scroll direction, e-sports, sensor options, lighting mode, button remapping.

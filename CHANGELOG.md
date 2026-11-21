# Changelog

## 0.8.0
- 2D mouse is shorter (better proportions); the side view was removed.
- Buttons tab now uses the same 2D drawing (click a button on the mouse to remap it).
- Live button/wheel feed from the device (evdev → server-sent events): side buttons and quick clicks now light up reliably; browser events remain as fallback with an explanatory hint.

## 0.7.2
- `rs7 gui`: when the port is already taken (e.g. an older instance still running) it says so and uses the next free port instead of crashing with a traceback.

## 0.7.1
- Home shows why the 3D view is off (no model / older server needs a restart / no WebGL / load error) instead of failing silently.

## 0.7.0
- Optional 3D view with a user-supplied OBJ model (`rs7 model import/remove`): rotate/zoom/auto-rotate, glowing L/R panels, wheel (spins), DPI and side buttons; flipped normals fixed, recoloured to a white RS7 look. Falls back to the vector drawings when no model is installed or WebGL is missing. The model is not bundled (licence unknown); three.js r170 vendored again.

## 0.6.1
- Top view: broader, rounder rear (no more pointed tail) and a smooth waist.
- Home: every button now lights up on a quick click (kept lit at least 200 ms); side buttons are also detected from the pointer `buttons` mask and have a failsafe timeout; works with pointer and mouse events.

## 0.6.0
- Removed the experimental 3D mouse (it did not look right) and its vendored three.js. Home now has accurate vector drawings traced from the product photos: top view (centre slit, wheel with glow, DPI pill, arched seam, side buttons) and a side view, with a flip animation between them. Buttons, wheel and DPI light up in both views.

## 0.5.1
- 3D mouse redone from the product photos: concave waist, rounder narrower rear, hump ahead of the middle, arched seam behind the main buttons, centre slit with wheel + DPI pill, two side pills, satin finish, environment reflections, wheel glow ring, 3/4 front-left default view. Still an approximation of the RS7.

## 0.5.0
- Home: 3D mouse (three.js vendored, procedural model): drag to rotate, scroll to zoom, auto-rotate, reset view; buttons, wheel and DPI button light up in 3D. 2D/3D switch, automatic fallback to the SVG when WebGL is unavailable. The model approximates the RS7 shape; a real .glb can replace the geometry.

## 0.4.2
- Home: DPI button added to the mouse view (between L and R, behind the wheel). It flashes and the DPI label updates when the mouse changes DPI stage (light `/api/status` poll about once a second while Home is open); DPI change counter added.

## 0.4.1
- Fix: Back/Forward side buttons were drawn swapped in the mouse view (Forward is the front one, Back the rear one) on Home and Buttons tabs.

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

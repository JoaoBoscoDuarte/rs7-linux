#!/bin/sh
# Installs the udev rule (needs sudo) and the rs7 command (per-user, via pip).
set -e
cd "$(dirname "$0")"
sudo cp udev/99-rs7.rules /etc/udev/rules.d/99-rs7.rules
sudo udevadm control --reload && sudo udevadm trigger
python3 -m pip install --user --break-system-packages . 2>/dev/null || python3 -m pip install --user .
mkdir -p "$HOME/.local/share/applications"
sed "s|^Exec=.*|Exec=$HOME/.local/bin/rs7 gui|" rs7.desktop > "$HOME/.local/share/applications/rs7.desktop"
echo "Done. Re-plug the mouse, then run: rs7 gui"

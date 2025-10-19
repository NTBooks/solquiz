#!/bin/sh
set -e

echo "[fonts] Detecting OS and installing fonts (no sudo, for Nixpacks)..."

if command -v apk >/dev/null 2>&1; then
  echo "[fonts] Alpine detected"
  apk add --no-cache fontconfig ttf-dejavu ttf-liberation noto-fonts || true
  fc-cache -f || true
  echo "[fonts] Installed on Alpine: fontconfig, ttf-dejavu, ttf-liberation, noto-fonts"
elif command -v apt-get >/dev/null 2>&1; then
  echo "[fonts] Debian/Ubuntu detected"
  apt-get update -y || true
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    fontconfig fonts-dejavu-core fonts-liberation fonts-freefont-ttf \
    libvips libvips-dev || true
  fc-cache -f || true
  echo "[fonts] Installed on Debian: fontconfig + common fonts (+libvips)"
else
  echo "[fonts] Unsupported distro. Please install fontconfig + a Sans font (DejaVu/Noto)." >&2
fi

# Optional debug
fc-list | head -n 10 || true
echo "[fonts] Setup complete."
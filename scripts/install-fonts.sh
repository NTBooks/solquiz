#!/usr/bin/env sh
set -e

echo "[fonts] Detecting OS and installing fallback fonts..."

if [ -f /etc/alpine-release ]; then
  echo "[fonts] Alpine Linux detected"
  # Need root for apk
  if [ "$(id -u)" -ne 0 ]; then
    echo "[fonts] This script needs to run as root inside the container/host (apk)." >&2
    exit 1
  fi
  apk add --no-cache fontconfig ttf-dejavu ttf-liberation noto-fonts
  fc-cache -f
  echo "[fonts] Installed: fontconfig, ttf-dejavu, ttf-liberation, noto-fonts"
elif [ -f /etc/debian_version ] || [ -f /etc/lsb-release ]; then
  echo "[fonts] Debian/Ubuntu detected"
  if [ "$(id -u)" -ne 0 ]; then
    echo "[fonts] This script needs to run as root (apt). Try: sudo $0" >&2
    exit 1
  fi
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    fontconfig fonts-dejavu-core fonts-liberation fonts-noto-core
  fc-cache -f
  echo "[fonts] Installed: fontconfig, fonts-dejavu-core, fonts-liberation, fonts-noto-core"
else
  echo "[fonts] Unsupported distro. Please install a system font pack and fontconfig manually." >&2
  echo "Suggested packages: fontconfig + DejaVu Sans (or Noto) family."
  exit 1
fi

echo "[fonts] Done."



#!/usr/bin/env bash
# scripts/install-arch.sh
#
# Web Presence - Arch Linux Installer
# https://github.com/KanashiiDev/web-presence
#
# Usage:
# curl -fsSL https://raw.githubusercontent.com/KanashiiDev/web-presence/main/scripts/install-arch.sh | bash

set -euo pipefail

REPO="KanashiiDev/web-presence"
PKG_NAME="web-presence"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"

# Colors
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; BOLD=''; RESET=''
fi

info()    { echo -e "${BLUE}::${RESET} $*"; }
success() { echo -e "${GREEN}✓${RESET}  $*"; }
warn()    { echo -e "${YELLOW}⚠${RESET}  $*"; }
error()   { echo -e "${RED}✗${RESET}  $*" >&2; exit 1; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

# Checks
header "Web Presence - Arch Linux Installer"

[[ "$OSTYPE" == "linux"* ]] || error "This script is for Linux only."
command -v pacman &>/dev/null || error "pacman not found. This script requires Arch Linux."
command -v sudo   &>/dev/null || error "sudo is required."
command -v curl   &>/dev/null || error "curl is required."

# Map machine arch to package arch naming
case "$(uname -m)" in
  x86_64)  ARCH="x64" ;;
  *) error "Unsupported architecture: $(uname -m)" ;;
esac

# Find latest release asset for this architecture
header "Checking latest release..."

RELEASE_JSON="$(curl -fsSL "$API_URL")" || error "Failed to reach GitHub API."

DOWNLOAD_URL="$(printf '%s' "$RELEASE_JSON" \
  | grep -o '"browser_download_url": *"[^"]*"' \
  | grep "web-presence[^\"]*${ARCH}\.pkg\.tar\.zst" \
  | grep -oP '(?<=")[^"]+(?=")' \
  | tail -n1)"

[[ -n "$DOWNLOAD_URL" ]] || error "No package found for architecture '${ARCH}' in the latest release."

VERSION="$(printf '%s' "$RELEASE_JSON" | grep -oP '"tag_name":\s*"\K[^"]*' | head -n1)"
FILENAME="$(basename "$DOWNLOAD_URL")"

success "Found ${FILENAME} (${VERSION:-unknown version})"

# Download to a temp dir
header "Downloading package..."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PKG_FILE="${TMP_DIR}/${FILENAME}"
curl -fL --progress-bar -o "$PKG_FILE" "$DOWNLOAD_URL" || error "Download failed."
success "Downloaded ${FILENAME}"

# Install directly (dependencies resolved from official repos)
header "Installing ${PKG_NAME}..."
sudo pacman -U --noconfirm "$PKG_FILE"

# Done
header "Done!"
success "${PKG_NAME} installed successfully."
echo
echo -e "  ${BOLD}Start:${RESET}   web-presence-bridge"
echo -e "  ${BOLD}Remove:${RESET}  sudo pacman -Rns ${PKG_NAME}"
echo
warn "Automatic updates are not supported on this OS. To install new versions, run this script again."
info "The tray icon will appear after launch. Make sure Discord is running."

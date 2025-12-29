#!/usr/bin/env bash

# ===============================================
# Discord MUSIC RPC - IPC Diagnostic Tool (Linux)
# ===============================================

# --- Message storage ---
ERROR_LIST=()
WARNING_LIST=()

add_error() {
    ERROR_LIST+=("$1")
}

add_warning() {
    WARNING_LIST+=("$1")
}

echo "==============================================="
echo "  Discord MUSIC RPC - IPC Diagnostic Tool Results"
echo "==============================================="

USER_ID=$(id -u)
XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$USER_ID}
USER_NAME=$(whoami)

# ---------------------------------
# 1) Check if Discord is running
# ---------------------------------

DISCORD_PIDS=$(pgrep -f "[D]iscord" 2>/dev/null)
if [[ -z "$DISCORD_PIDS" ]]; then
    add_warning "Discord is NOT running."
fi

# ----------------------------------
# 2) Check Discord installation type
# -----------------------------------

DISCORD_PATH=$(which discord 2>/dev/null)
DISCORD_TYPE="unknown"

if [[ -z "$DISCORD_PATH" ]]; then
    add_error "Discord executable not found in PATH."
else
    if [[ "$DISCORD_PATH" == *"flatpak"* ]]; then
        DISCORD_TYPE="flatpak"
        add_warning "Flatpak Discord detected – IPC may work with restrictions."
    elif [[ "$DISCORD_PATH" == *"/snap/"* ]]; then
        DISCORD_TYPE="snap"
        add_warning "Snap Discord detected – IPC may work with restrictions."
    else
        DISCORD_TYPE="native"
    fi
fi

# ---------------------------
# 3) Check XDG_RUNTIME_DIR
# ---------------------------

if [[ ! -d "$XDG_RUNTIME_DIR" ]]; then
    add_error "XDG_RUNTIME_DIR does not exist: $XDG_RUNTIME_DIR"
else
    RUNTIME_OWNER=$(stat -c "%U" "$XDG_RUNTIME_DIR" 2>/dev/null)
    if [[ "$RUNTIME_OWNER" != "$USER_NAME" ]]; then
        add_error "XDG_RUNTIME_DIR owned by $RUNTIME_OWNER (expected $USER_NAME)"
    fi
fi

# ------------------------------------------
# 4) Detect all potential IPC socket paths
# ------------------------------------------

EXPECTED_SOCKETS=(
    "$XDG_RUNTIME_DIR/discord-ipc-0"
    "/run/user/$USER_ID/discord-ipc-0"
    "/tmp/discord-ipc-0"
    "$XDG_RUNTIME_DIR/app/com.discordapp.Discord/discord-ipc-0"
    "/run/user/$USER_ID/app/com.discordapp.Discord/discord-ipc-0"
    "$XDG_RUNTIME_DIR/snap.discord/discord-ipc-0"
    "/run/user/$USER_ID/snap.discord/discord-ipc-0"
    "$XDG_RUNTIME_DIR/app/dev.vencord.Vesktop/discord-ipc-0"
    "$XDG_RUNTIME_DIR/app/io.github.spacingbat3.webcord/discord-ipc-0"
    "/var/run/discord-ipc-0"
)

FOUND_SOCKETS=()
for sock in "${EXPECTED_SOCKETS[@]}"; do
    [[ -S "$sock" ]] && FOUND_SOCKETS+=("$sock")
done

if [[ ${#FOUND_SOCKETS[@]} -eq 0 ]]; then
    add_warning "No IPC sockets found in expected locations."
fi

# -----------------------------------------
# 5) Check socket connectivity via netcat
# -----------------------------------------

if command -v nc &>/dev/null; then
    for sock in "${FOUND_SOCKETS[@]}"; do
        if ! timeout 2 bash -c "echo '' | nc -U '$sock' 2>/dev/null" &>/dev/null; then
            add_warning "Socket exists but not responding: $sock"
        fi
    done
else
    add_warning "netcat (nc) not installed – cannot test IPC socket connectivity."
fi

# -----------------------------------------
# 6) Check if Discord is running as root
# -----------------------------------------

ROOT_PIDS=$(ps aux | grep '[D]iscord' | awk '$1=="root"')
if [[ -n "$ROOT_PIDS" ]]; then
    add_error "Discord is running as root – IPC will likely fail."
fi

# -----------------------------------------
# 7) systemd / elogind RuntimePath check
# -----------------------------------------

if command -v loginctl &>/dev/null; then
    SESSION_ID=$(loginctl list-sessions --no-legend | grep "$USER_NAME" | awk '{print $1}' | head -n1)
    if [[ -n "$SESSION_ID" ]]; then
        RUNTIME_PATH=$(loginctl show-session "$SESSION_ID" -p RuntimePath --value)
        if [[ -z "$RUNTIME_PATH" ]]; then
            add_warning "RuntimePath is empty – session may be non-standard."
        fi
    else
        add_warning "loginctl: No active session detected."
    fi
else
    add_warning "loginctl not found – runtime session info unavailable."
fi

# ---------------------------
# 8) Wayland / X11 checks
# ---------------------------

SESSION_TYPE=${XDG_SESSION_TYPE:-unknown}
if [[ "$SESSION_TYPE" == "wayland" ]]; then
    if ! command -v xdg-desktop-portal &>/dev/null; then
        add_warning "xdg-desktop-portal missing – may affect Wayland IPC."
    fi
elif [[ "$SESSION_TYPE" != "x11" ]]; then
    add_warning "Unknown session type: $SESSION_TYPE"
fi

# ---------------------------
# 9) Environment variables
# ---------------------------

ENV_VARS=("XDG_RUNTIME_DIR" "XDG_SESSION_TYPE" "DISPLAY" "WAYLAND_DISPLAY")
for var in "${ENV_VARS[@]}"; do
    value="${!var}"
    [[ -z "$value" ]] && add_warning "$var is not set."
done

# Security modules may block IPC
if command -v aa-status &>/dev/null; then
    if aa-status --enabled 2>/dev/null; then
        add_warning "AppArmor is active – may restrict IPC access"
    fi
fi

if command -v getenforce &>/dev/null; then
    SELINUX_STATUS=$(getenforce 2>/dev/null)
    if [[ "$SELINUX_STATUS" == "Enforcing" ]]; then
        add_warning "SELinux is enforcing – may block IPC"
    fi
fi

# ---------------------------
# 10) Summary
# ---------------------------

if (( ${#ERROR_LIST[@]} == 0 && ${#WARNING_LIST[@]} == 0 )); then
    echo "SUCCESS: No issues detected. Everything looks good!"
else
    if (( ${#ERROR_LIST[@]} > 0 )); then
        echo
        echo "Errors:"
        for msg in "${ERROR_LIST[@]}"; do
            echo "  - $msg"
        done
    fi

    if (( ${#WARNING_LIST[@]} > 0 )); then
        echo
        echo "Warnings:"
        for msg in "${WARNING_LIST[@]}"; do
            echo "  - $msg"
        done
    fi
fi

echo
echo "==============================================="

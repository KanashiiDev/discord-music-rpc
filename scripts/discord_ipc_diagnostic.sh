#!/usr/bin/env bash

# ===============================================
# Discord MUSIC RPC - IPC Diagnostic Tool (Linux)
# ===============================================

# --- Message storage ---
ERROR_LIST=()
WARNING_LIST=()
INFO_LIST=()

add_error() {
    ERROR_LIST+=("$1")
}

add_warning() {
    WARNING_LIST+=("$1")
}

add_info() {
    INFO_LIST+=("$1")
}

echo "==============================================="
echo "  Discord RPC IPC Diagnostic Results"
echo "==============================================="

USER_ID=$(id -u)
XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$USER_ID}
USER_NAME=$(whoami)

# ---------------------------------
# 1) Check if Discord is running
# ---------------------------------

DISCORD_PIDS=$(pgrep -f "[D]iscord" 2>/dev/null)
if [[ -z "$DISCORD_PIDS" ]]; then
    add_error "Discord is NOT running - Please start Discord first"
else
    add_info "Discord is running"
fi

# ----------------------------------
# 2) Check Discord installation type
# -----------------------------------

DISCORD_PATH=$(which discord 2>/dev/null)
DISCORD_TYPE="unknown"

if [[ -z "$DISCORD_PATH" ]]; then
    add_error "Discord not found in PATH - Please install Discord"
else
    if [[ "$DISCORD_PATH" == *"flatpak"* ]]; then
        DISCORD_TYPE="flatpak"
        add_warning "Flatpak Discord detected"
        
        # Check if flatpak override is set
        if command -v flatpak &>/dev/null; then
            FLATPAK_OVERRIDES=$(flatpak override --user --show com.discordapp.Discord 2>/dev/null)
            if echo "$FLATPAK_OVERRIDES" | grep -q "filesystems=.*xdg-run/discord-ipc"; then
                add_info "Flatpak IPC filesystem override is set"
            else
                add_error "Flatpak IPC filesystem override NOT set"
                add_error "→ MUST RUN: flatpak override --user --filesystem=xdg-run/discord-ipc-0 com.discordapp.Discord"
                add_error "→ Then restart Discord"
            fi
        fi
        add_warning "→ Or install native Discord for better compatibility"
        
    elif [[ "$DISCORD_PATH" == *"/snap/"* ]]; then
        DISCORD_TYPE="snap"
        add_info "Snap Discord detected"
        SNAP_INTERFACE_CHECK_NEEDED=true
        
    else
        DISCORD_TYPE="native"
        add_info "Native Discord installation detected"
    fi
fi

# ---------------------------
# 3) Check XDG_RUNTIME_DIR
# ---------------------------

if [[ ! -d "$XDG_RUNTIME_DIR" ]]; then
    add_error "XDG_RUNTIME_DIR does not exist: $XDG_RUNTIME_DIR"
    add_error "→ Add to ~/.bashrc: export XDG_RUNTIME_DIR=/run/user/\$(id -u)"
    add_error "→ Then restart your terminal and Discord"
else
    RUNTIME_OWNER=$(stat -c "%U" "$XDG_RUNTIME_DIR" 2>/dev/null)
    if [[ "$RUNTIME_OWNER" != "$USER_NAME" ]]; then
        add_error "XDG_RUNTIME_DIR has wrong owner: $RUNTIME_OWNER (should be $USER_NAME)"
        add_error "→ Fix: sudo chown -R $USER_NAME:$USER_NAME $XDG_RUNTIME_DIR"
    else
        add_info "XDG_RUNTIME_DIR is valid: $XDG_RUNTIME_DIR"
    fi
fi

# -----------------------------------------------
# 3.5) Check Discord process environment
# -----------------------------------------------

if [[ -n "$DISCORD_PIDS" ]]; then
    FIRST_PID=$(echo "$DISCORD_PIDS" | awk '{print $1}')
    if [[ -f "/proc/$FIRST_PID/environ" ]]; then
        DISCORD_ENV=$(cat /proc/$FIRST_PID/environ 2>/dev/null | tr '\0' '\n' | grep "^XDG_RUNTIME_DIR=")
        DISCORD_RUNTIME=$(echo "$DISCORD_ENV" | cut -d= -f2)
        
        if [[ -n "$DISCORD_RUNTIME" && "$DISCORD_RUNTIME" != "$XDG_RUNTIME_DIR" ]]; then
            add_error "Discord is using different XDG_RUNTIME_DIR"
            add_error "  Discord sees: $DISCORD_RUNTIME"
            add_error "  Your app sees: $XDG_RUNTIME_DIR"
            add_error "→ Restart Discord after setting correct XDG_RUNTIME_DIR"
        else
            add_info "Discord process environment matches system"
        fi
    fi
fi

# ------------------------------------------
# 4) Detect all potential IPC socket paths
# ------------------------------------------

EXPECTED_SOCKETS=(
    "$XDG_RUNTIME_DIR/discord-ipc-0"
    "/run/user/$USER_ID/discord-ipc-0"
    "/tmp/discord-ipc-0"
    "$HOME/.config/discord/discord-ipc-0"
    "$XDG_RUNTIME_DIR/app/com.discordapp.Discord/discord-ipc-0"
    "/run/user/$USER_ID/app/com.discordapp.Discord/discord-ipc-0"
    "$HOME/.var/app/com.discordapp.Discord/discord-ipc-0"
    "$XDG_RUNTIME_DIR/snap.discord/discord-ipc-0"
    "/run/user/$USER_ID/snap.discord/discord-ipc-0"
    "$XDG_RUNTIME_DIR/app/dev.vencord.Vesktop/discord-ipc-0"
    "$XDG_RUNTIME_DIR/app/io.github.spacingbat3.webcord/discord-ipc-0"
    "/var/run/discord-ipc-0"
)

# Use associative array to prevent duplicates
declare -A UNIQUE_SOCKETS
FOUND_SOCKETS=()

for sock in "${EXPECTED_SOCKETS[@]}"; do
    # Resolve to real path to catch duplicates
    if [[ -S "$sock" ]]; then
        REAL_PATH=$(realpath "$sock" 2>/dev/null || echo "$sock")
        if [[ -z "${UNIQUE_SOCKETS[$REAL_PATH]}" ]]; then
            UNIQUE_SOCKETS[$REAL_PATH]=1
            FOUND_SOCKETS+=("$sock")
        fi
    fi
done

if [[ ${#FOUND_SOCKETS[@]} -eq 0 ]]; then
    add_error "No IPC sockets found"
    add_error "→ Make sure Discord is running"
    add_error "→ Try restarting Discord completely"
else
    add_info "Found ${#FOUND_SOCKETS[@]} IPC socket(s):"
    for sock in "${FOUND_SOCKETS[@]}"; do
        add_info "  • $sock"
    done
fi

# -----------------------------------------------
# 4.5) Check socket permissions and ownership
# -----------------------------------------------

for sock in "${FOUND_SOCKETS[@]}"; do
    SOCK_PERMS=$(stat -c "%a" "$sock" 2>/dev/null)
    SOCK_OWNER=$(stat -c "%U" "$sock" 2>/dev/null)
    SOCK_GROUP=$(stat -c "%G" "$sock" 2>/dev/null)
    
    # Check permissions (700, 755, 775, 777 are all acceptable)
    if [[ "$SOCK_PERMS" != "700" && "$SOCK_PERMS" != "755" && "$SOCK_PERMS" != "775" && "$SOCK_PERMS" != "777" ]]; then
        add_warning "Socket has unusual permissions: $sock ($SOCK_PERMS)"
        add_warning "→ If RPC fails, try: chmod 755 $sock"
    else
        add_info "Socket permissions OK: $sock ($SOCK_PERMS)"
    fi
    
    # Check ownership
    if [[ "$SOCK_OWNER" != "$USER_NAME" ]]; then
        add_error "Socket owned by different user: $sock"
        add_error "  Owner: $SOCK_OWNER:$SOCK_GROUP (should be $USER_NAME)"
        add_error "→ Fix: sudo chown $USER_NAME:$USER_NAME $sock"
    fi
    
    # Check socket age (if older than 24 hours, might be stale)
    SOCK_AGE=$(stat -c %Y "$sock" 2>/dev/null)
    NOW=$(date +%s)
    AGE_HOURS=$(( (NOW - SOCK_AGE) / 3600 ))
    
    if [[ $AGE_HOURS -gt 24 ]]; then
        add_warning "Socket is old (${AGE_HOURS}h): $sock"
        add_warning "→ May be stale, restart Discord to recreate"
    fi
done

# -----------------------------------------
# 5) Check socket connectivity
# -----------------------------------------

if [[ ${#FOUND_SOCKETS[@]} -gt 0 ]]; then
    RESPONSIVE_SOCKETS=0
    UNRESPONSIVE_SOCKETS=()
    
    for sock in "${FOUND_SOCKETS[@]}"; do
        # Method 1: Try socat if available (works better with snap sockets)
        if command -v socat &>/dev/null; then
            if timeout 2 socat -u OPEN:/dev/null "UNIX-CONNECT:$sock" 2>/dev/null; then
                ((RESPONSIVE_SOCKETS++))
                continue
            fi
        fi
        
        # Method 2: Try Python socket test (most reliable)
        if command -v python3 &>/dev/null; then
            if timeout 2 python3 -c "
            import socket
            import sys
            try:
                s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                s.settimeout(1)
                s.connect('$sock')
                s.close()
                sys.exit(0)
            except:
                sys.exit(1)
            " 2>/dev/null; then
                ((RESPONSIVE_SOCKETS++))
                continue
            fi
        fi
        
        # Method 3: Check if socket has active connections (lsof)
        if command -v lsof &>/dev/null; then
            if lsof "$sock" &>/dev/null; then
                ((RESPONSIVE_SOCKETS++))
                add_info "Socket has active connections: $sock"
                continue
            fi
        fi
        
        # Method 4: For snap sockets, check if Discord process has it open
        if [[ "$sock" == *"snap.discord"* ]] && [[ -n "$DISCORD_PIDS" ]]; then
            FIRST_PID=$(echo "$DISCORD_PIDS" | awk '{print $1}')
            if ls -la "/proc/$FIRST_PID/fd" 2>/dev/null | grep -q "$(basename "$sock")"; then
                ((RESPONSIVE_SOCKETS++))
                add_info "Socket is open by Discord process: $sock"
                continue
            fi
        fi
        
        # Method 5: Final fallback - netcat
        if command -v nc &>/dev/null; then
            if timeout 2 bash -c "echo '' | nc -U '$sock' 2>/dev/null" &>/dev/null; then
                ((RESPONSIVE_SOCKETS++))
                continue
            fi
        fi
        
        # If we got here, socket might not be responding
        UNRESPONSIVE_SOCKETS+=("$sock")
    done
    
    if [[ $RESPONSIVE_SOCKETS -eq 0 ]]; then
        # Only warn if we have tools to test AND sockets truly aren't responding
        if command -v python3 &>/dev/null || command -v socat &>/dev/null; then
            add_warning "Cannot verify socket connectivity"
            add_warning "→ If RPC fails, try restarting Discord"
        else
            add_info "Socket connectivity check skipped (install python3 or socat for better diagnostics)"
        fi
    else
        add_info "$RESPONSIVE_SOCKETS socket(s) verified functional"
    fi
fi

# -----------------------------------------
# 6) Check if Discord is running as root
# -----------------------------------------

ROOT_PIDS=$(ps aux | grep '[D]iscord' | awk '$1=="root"' 2>/dev/null)
if [[ -n "$ROOT_PIDS" ]]; then
    add_error "Discord is running as ROOT - This will NOT work!"
    add_error "→ Kill Discord: killall Discord discord"
    add_error "→ Start Discord as normal user (NEVER use sudo)"
fi

# -----------------------------------------
# 7) Check Wayland
# -----------------------------------------

SESSION_TYPE=${XDG_SESSION_TYPE:-unknown}
if [[ "$SESSION_TYPE" == "wayland" ]]; then
    if ! command -v xdg-desktop-portal &>/dev/null; then
        add_warning "Wayland detected but xdg-desktop-portal is missing"
        add_warning "→ Install: sudo apt install xdg-desktop-portal xdg-desktop-portal-gtk"
    else
        add_info "Wayland session with xdg-desktop-portal"
    fi
elif [[ "$SESSION_TYPE" == "x11" ]]; then
    add_info "X11 session detected"
fi

# ---------------------------
# 8) Check environment variables
# ---------------------------

if [[ -z "$XDG_RUNTIME_DIR" ]]; then
    add_error "XDG_RUNTIME_DIR environment variable not set"
    add_error "→ Add to ~/.bashrc: export XDG_RUNTIME_DIR=/run/user/\$(id -u)"
fi

if [[ -z "$DISPLAY" && -z "$WAYLAND_DISPLAY" ]]; then
    add_warning "Neither DISPLAY nor WAYLAND_DISPLAY is set"
fi

# ---------------------------
# 9) Security modules
# ---------------------------

if command -v aa-status &>/dev/null && aa-status --enabled 2>/dev/null; then
    add_info "AppArmor is active (may restrict IPC in rare cases)"
fi

if command -v getenforce &>/dev/null; then
    SELINUX_STATUS=$(getenforce 2>/dev/null)
    if [[ "$SELINUX_STATUS" == "Enforcing" ]]; then
        add_warning "SELinux is enforcing - may block IPC"
        add_warning "→ If RPC fails: sudo setenforce 0 (temporary)"
        add_warning "→ Or add SELinux policy for Discord"
    fi
fi

# ---------------------------
# 10) Output results
# ---------------------------

# Final snap interface check - only warn if sockets aren't working
if [[ "$DISCORD_TYPE" == "snap" ]] && [[ -n "${SNAP_INTERFACE_CHECK_NEEDED:-}" ]]; then
    if [[ $RESPONSIVE_SOCKETS -eq 0 ]]; then
        # Sockets not responding, check snap interface
        if command -v snap &>/dev/null; then
            SNAP_CONNECTIONS=$(snap connections discord 2>/dev/null)
            
            if ! echo "$SNAP_CONNECTIONS" | grep -q "discord-ipc"; then
                add_warning "Snap IPC interface not found in connections"
                add_warning "→ Try: sudo snap connect discord:discord-ipc"
                add_warning "→ Then restart Discord"
            fi
        fi
    else
        # Sockets are working, snap interface is fine
        add_info "Snap IPC configuration is working correctly"
    fi
fi

echo ""

if (( ${#INFO_LIST[@]} > 0 )); then
    echo "System Information:"
    for msg in "${INFO_LIST[@]}"; do
        echo "  $msg"
    done
    echo ""
fi

if (( ${#WARNING_LIST[@]} > 0 )); then
    echo "Warnings:"
    for msg in "${WARNING_LIST[@]}"; do
        echo "  $msg"
    done
    echo ""
fi

if (( ${#ERROR_LIST[@]} > 0 )); then
    echo "Errors (MUST FIX):"
    for msg in "${ERROR_LIST[@]}"; do
        echo "  $msg"
    done
    echo ""
fi

echo "==============================================="

# Exit with error code if there are errors
if (( ${#ERROR_LIST[@]} > 0 )); then
    echo "Status: RPC will NOT work - fix errors above"
    exit 1
elif (( ${#WARNING_LIST[@]} > 0 )); then
    echo "Status: RPC may work with issues - check warnings"
    exit 2
else
    echo "Status: System ready for Discord RPC"
    exit 0
fi
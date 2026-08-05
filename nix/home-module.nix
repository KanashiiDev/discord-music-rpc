# nix/home-module.nix
#
# home-manager module for per-user Web Presence setup.
# Add to home.nix:
#
# inputs.web-presence.url = "github:KanashiiDev/web-presence";
#
# { inputs, ... }: {
# imports = [ inputs.web-presence.homeManagerModules.default ];
# programs.web-presence = {
# enable = true;
# autoStart = true;
# };
# }
#
{ config, lib, pkgs, ... }:

let
  cfg = config.programs.web-presence;
in
{
  options.programs.web-presence = {
    enable = lib.mkEnableOption "Web Presence";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ./package.nix { };
      defaultText = lib.literalExpression "web-presence from flake";
      description = "The web-presence package to use.";
    };

    autoStart = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = ''
        Whether to create an XDG autostart entry so Web Presence
        launches automatically when you log into your desktop session.
      '';
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3000;
      description = "Port the Web Presence server listens on.";
    };

    extraArgs = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      example = [ "--no-sandbox" ];
      description = "Extra command-line arguments passed to the application.";
    };
  };

  config = lib.mkIf cfg.enable {
    # Install the package for this user 
    home.packages = [ cfg.package ];

    # XDG autostart entry 
    xdg.configFile."autostart/web-presence.desktop" = lib.mkIf cfg.autoStart {
      text = ''
        [Desktop Entry]
        Type=Application
        Name=Web Presence
        Comment=Web Presence Bridge for Discord
        Exec=web-presence${lib.optionalString (cfg.extraArgs != []) (" " + lib.escapeShellArgs cfg.extraArgs)}
        Icon=web-presence
        Terminal=false
        Hidden=false
        NoDisplay=false
        X-GNOME-Autostart-enabled=true
        X-GNOME-Autostart-Delay=5
        Categories=Audio;Music;Utility;
        StartupNotify=false
      '';
    };

    # Environment variables for this user's session 
    home.sessionVariables = {
      WEB_PRESENCE_NIX = "true";
      # Ensure XDG_RUNTIME_DIR is set (usually done by PAM/logind, but be explicit)
      XDG_RUNTIME_DIR = lib.mkDefault "/run/user/\${UID}";
    };

    # Systemd user service
    # Disabled by default; XDG autostart is more compatible across DEs.
    # To enable: set systemd.user.services.web-presence.enable = true;
    systemd.user.services.web-presence = lib.mkIf cfg.autoStart {
      Unit = {
        Description = "Web Presence";
        After = [ "graphical-session.target" "tray.target" ];
        PartOf = [ "graphical-session.target" ];
        # Wait for Discord's IPC socket to potentially exist
        Wants = [ "graphical-session.target" ];
      };
      Service = {
        Type = "simple";
        ExecStart = "${cfg.package}/bin/web-presence ${lib.escapeShellArgs cfg.extraArgs}";
        Restart = "on-failure";
        RestartSec = "5s";
        Environment = [
          "WEB_PRESENCE_NIX=true"
        ];
      };
      # If you want the systemd service instead of XDG autostart, add:
      # Install.WantedBy = [ "graphical-session.target" ];
    };
  };
}

# nix/home-module.nix
#
# home-manager module for per-user Discord Music RPC setup.
# Add to home.nix:
#
# inputs.discord-music-rpc.url = "github:KanashiiDev/discord-music-rpc";
#
# { inputs, ... }: {
# imports = [ inputs.discord-music-rpc.homeManagerModules.default ];
# programs.discord-music-rpc = {
# enable = true;
# autoStart = true;
# };
# }
#
{ config, lib, pkgs, ... }:

let
  cfg = config.programs.discord-music-rpc;
in
{
  options.programs.discord-music-rpc = {
    enable = lib.mkEnableOption "Discord Music RPC";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ./package.nix { };
      defaultText = lib.literalExpression "discord-music-rpc from flake";
      description = "The discord-music-rpc package to use.";
    };

    autoStart = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = ''
        Whether to create an XDG autostart entry so Discord Music RPC
        launches automatically when you log into your desktop session.
      '';
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3000;
      description = "Port the Discord Music RPC server listens on.";
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
    xdg.configFile."autostart/discord-music-rpc.desktop" = lib.mkIf cfg.autoStart {
      text = ''
        [Desktop Entry]
        Type=Application
        Name=Discord Music RPC
        Comment=Show music from ANY website on your Discord
        Exec=discord-music-rpc${lib.optionalString (cfg.extraArgs != []) (" " + lib.escapeShellArgs cfg.extraArgs)}
        Icon=discord-music-rpc
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
      DISCORD_MUSIC_RPC_NIX = "true";
      # Ensure XDG_RUNTIME_DIR is set (usually done by PAM/logind, but be explicit)
      XDG_RUNTIME_DIR = lib.mkDefault "/run/user/\${UID}";
    };

    # Systemd user service
    # Disabled by default; XDG autostart is more compatible across DEs.
    # To enable: set systemd.user.services.discord-music-rpc.enable = true;
    systemd.user.services.discord-music-rpc = lib.mkIf cfg.autoStart {
      Unit = {
        Description = "Discord Music RPC";
        After = [ "graphical-session.target" "tray.target" ];
        PartOf = [ "graphical-session.target" ];
        # Wait for Discord's IPC socket to potentially exist
        Wants = [ "graphical-session.target" ];
      };
      Service = {
        Type = "simple";
        ExecStart = "${cfg.package}/bin/discord-music-rpc ${lib.escapeShellArgs cfg.extraArgs}";
        Restart = "on-failure";
        RestartSec = "5s";
        Environment = [
          "DISCORD_MUSIC_RPC_NIX=true"
        ];
      };
      # If you want the systemd service instead of XDG autostart, add:
      # Install.WantedBy = [ "graphical-session.target" ];
    };
  };
}

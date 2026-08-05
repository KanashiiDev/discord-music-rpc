# nix/module.nix
#
# NixOS system-level module.
# Add to configuration.nix:
#
#  inputs.web-presence.url = "github:KanashiiDev/web-presence";
#
#  { inputs, ... }: {
#    imports = [ inputs.web-presence-bridge.nixosModules.default ];
#    programs.web-presence-bridge.enable = true;
#  }
#
{ config, lib, pkgs, ... }:

let
  cfg = config.programs.web-presence-bridge;
in
{
  options.programs.web-presence-bridge = {
    enable = lib.mkEnableOption "Web Presence Bridge";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ./package.nix { };
      defaultText = lib.literalExpression "web-presence-bridge from flake";
      description = "The web-presence-bridge package to use.";
    };

    autoStart = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = ''
        Whether to start Web Presence Bridge automatically on login
        for all users who have it enabled.
        Note: per-user autostart is handled by home-manager module.
      '';
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = ''
        Whether to open the default server port (3000) in the firewall.
        Only needed if you want to access the dashboard from another machine.
      '';
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3000;
      description = "Port the Web Presence Bridge Bridge server listens on.";
    };
  };

  config = lib.mkIf cfg.enable {
    # Install the package system-wide 
    environment.systemPackages = [ cfg.package ];

    # Optional firewall rule 
    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ cfg.port ];

    # XDG runtime dir: ensure it's set for graphical sessions 
    # This is usually handled by systemd-logind, but we make it explicit.
    services.logind.extraConfig = ''
      RuntimeDirectorySize=256M
    '';

    # Environment variables for all users 
    environment.sessionVariables = {
      # Signal to the app that it's running under Nix
      WEB_PRESENCE_NIX = "true";
    };
  };
}

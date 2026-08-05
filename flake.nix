{
  description = "Web Presence Bridge for Discord";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };
  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" ];
      forEachSystem = f: nixpkgs.lib.genAttrs systems (system: f {
        pkgs = import nixpkgs { inherit system; };
        inherit system;
      });
    in
    {
      # nix profile install github:KanashiiDev/web-presence 
      packages = forEachSystem ({ pkgs, system, ... }: {
        web-presence = pkgs.callPackage ./nix/package.nix { };
        default           = self.packages.${system}.web-presence;
      });
      # nix develop 
      devShells = forEachSystem ({ pkgs, ... }: {
        default = pkgs.mkShell {
          buildInputs = with pkgs; [ nodejs_24 nodePackages.npm ];
          shellHook = ''
            echo "Web Presence dev shell"
            echo "Node: $(node --version) | npm: $(npm --version)"
          '';
        };
      });
      # NixOS module (configuration.nix) 
      # inputs.web-presence.nixosModules.default
      nixosModules = {
        web-presence = import ./nix/module.nix;
        default           = self.nixosModules.web-presence;
      };
      # home-manager module 
      # inputs.web-presence.homeManagerModules.default
      homeManagerModules = {
        web-presence = import ./nix/home-module.nix;
        default           = self.homeManagerModules.web-presence;
      };
    };
}

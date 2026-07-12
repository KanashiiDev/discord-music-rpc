{
  description = "Discord Music RPC - Show music from ANY website on your Discord";
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
      # nix profile install github:KanashiiDev/discord-music-rpc 
      packages = forEachSystem ({ pkgs, system, ... }: {
        discord-music-rpc = pkgs.callPackage ./nix/package.nix { };
        default           = self.packages.${system}.discord-music-rpc;
      });
      # nix develop 
      devShells = forEachSystem ({ pkgs, ... }: {
        default = pkgs.mkShell {
          buildInputs = with pkgs; [ nodejs_24 nodePackages.npm ];
          shellHook = ''
            echo "Discord Music RPC dev shell"
            echo "Node: $(node --version) | npm: $(npm --version)"
          '';
        };
      });
      # NixOS module (configuration.nix) 
      # inputs.discord-music-rpc.nixosModules.default
      nixosModules = {
        discord-music-rpc = import ./nix/module.nix;
        default           = self.nixosModules.discord-music-rpc;
      };
      # home-manager module 
      # inputs.discord-music-rpc.homeManagerModules.default
      homeManagerModules = {
        discord-music-rpc = import ./nix/home-module.nix;
        default           = self.homeManagerModules.discord-music-rpc;
      };
    };
}

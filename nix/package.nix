# nix/package.nix
#
# Packages discord-music-rpc by unpacking the upstream AppImage.
# This is the standard NixOS approach for Electron apps distributed
# as AppImages — avoids rebuilding from source (which requires
# matching the exact electron version and all node_modules).
#
# To update: change `version` and update the sha256 hashes below.
# Run: nix-prefetch-url <url> to get the new hash.
#
{ lib
, systemd
, stdenv
, fetchurl
, appimageTools
, makeWrapper
, electron
, libnotify
, xdg-utils
, libappindicator-gtk3
, nss
, nspr
, dbus
, glib
, gtk3
, cairo
, pango
, gdk-pixbuf
, libx11
, libxcb
, libxcomposite
, libxdamage
, libxext
, libxfixes
, libxrandr
, autoPatchelfHook
}:

let
  version = "2.2.0";
  # Source URLs & hashes 
  # Update these when releasing a new version.
  # Get hash with: nix-prefetch-url <url>
  sources = {
    x86_64-linux = fetchurl {
      url = "https://github.com/KanashiiDev/discord-music-rpc/releases/download/${version}/discord-music-rpc-${version}-x86_64.AppImage";
      sha256 = "sha256-C3PDLetQGmPhUc+u4SGFXduk0+iAtUYy7aV+AroWGno=";
    };
  };

  src = sources.${stdenv.hostPlatform.system} or (throw "Unsupported system: ${stdenv.hostPlatform.system}");
  # Unpack the AppImage 
  appimageContents = appimageTools.extractType2 { pname = "discord-music-rpc"; inherit version src; };
in
stdenv.mkDerivation rec {
  pname = "discord-music-rpc";
  inherit version;

  # We're packaging a pre-built binary, not building from source
  dontUnpack = true;
  dontBuild = true;
  dontConfigure = true;

  nativeBuildInputs = [ makeWrapper ];
  buildInputs = [
    stdenv.cc.cc.lib
    nss
    nspr
    glib
    gtk3
    cairo
    pango
    gdk-pixbuf
    libx11
    libxcb
    libxcomposite
    libxdamage
    libxext
    libxfixes
    libxrandr
    libnotify
    libappindicator-gtk3
    dbus
    systemd
  ];
  installPhase = ''
    runHook preInstall

    # Directories 
    mkdir -p $out/bin
    mkdir -p $out/share/discord-music-rpc
    mkdir -p $out/share/applications
    mkdir -p $out/share/icons/hicolor

    # Copy app contents from unpacked AppImage 
    cp -r ${appimageContents}/resources $out/share/discord-music-rpc/
    cp -r ${appimageContents}/locales    $out/share/discord-music-rpc/ 2>/dev/null || true

    # Icons 
    for size in 16 24 32 48 64 128 256 512; do
      iconSrc="${appimageContents}/usr/share/icons/hicolor/''${size}x''${size}/apps/discord-music-rpc.png"
      if [ -f "$iconSrc" ]; then
        mkdir -p $out/share/icons/hicolor/''${size}x''${size}/apps
        cp "$iconSrc" $out/share/icons/hicolor/''${size}x''${size}/apps/discord-music-rpc.png
      fi
    done

    # Wrapper script 
    # We use electron from nixpkgs instead of the bundled one to:
    # 1. Avoid shipping a second copy of electron
    # 2. Get proper NixOS library path patching automatically
    makeWrapper ${electron}/bin/electron $out/bin/discord-music-rpc \
      --add-flags "$out/share/discord-music-rpc/resources/app.asar" \
      --add-flags "--no-sandbox" \
      --set ELECTRON_FORCE_IS_PACKAGED "true" \
      --set DISCORD_MUSIC_RPC_NIX "true" \
      --set DISCORD_MUSIC_RPC_BIN "$out/bin/discord-music-rpc" \
      --prefix PATH : "${lib.makeBinPath [libnotify glib xdg-utils systemd]}"

    # .desktop file 
    cat > $out/share/applications/discord-music-rpc.desktop << EOF
    [Desktop Entry]
    Type=Application
    Name=Discord Music RPC
    Comment=Show music from ANY website on your Discord
    Exec=discord-music-rpc
    Icon=discord-music-rpc
    Terminal=false
    Categories=Audio;Music;Utility;
    Keywords=discord;music;rpc;rich presence;
    StartupNotify=false
    X-AppImage-Version=${version}
    EOF

    runHook postInstall
  '';
  meta = with lib; {
    description = "Show music from ANY website on your Discord";
    longDescription = ''
      Discord Music RPC is an Electron application that tracks music playback
      across streaming websites and displays it as Discord Rich Presence.
      Works with a companion browser extension (Chrome/Firefox).
    '';
    homepage = "https://github.com/KanashiiDev/discord-music-rpc";
    license = licenses.mit;
    maintainers = [ ];
    platforms = [ "x86_64-linux" ];
    mainProgram = "discord-music-rpc";
  };
}

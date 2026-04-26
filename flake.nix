{
  description = "Lattice — desktop Matrix client";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      # Bump these together when cutting a release. The hash is the SRI
      # sha256 of the x86_64 AppImage published to GitHub Releases.
      version = "0.3.0";
      hash = "sha256-0xK2YrK0aj5YWk/PfpMYy7CGuAZ59xt38QdXqOzpeYk=";

      mkLattice = pkgs:
        let
          pname = "lattice";

          src = pkgs.fetchurl {
            url = "https://github.com/Newspicel/lattice/releases/download/v${version}/Lattice-${version}.AppImage";
            inherit hash;
          };

          appimageContents = pkgs.appimageTools.extract {
            inherit pname version src;
          };
        in
        pkgs.appimageTools.wrapType2 {
          inherit pname version src;

          extraInstallCommands = ''
            install -Dm644 ${appimageContents}/${pname}.desktop \
              $out/share/applications/${pname}.desktop
            install -Dm644 ${appimageContents}/${pname}.png \
              $out/share/icons/hicolor/512x512/apps/${pname}.png

            substituteInPlace $out/share/applications/${pname}.desktop \
              --replace 'Exec=AppRun --no-sandbox %U' 'Exec=${pname} %U' \
              --replace 'Exec=AppRun %U' 'Exec=${pname} %U' \
              --replace 'Exec=AppRun' 'Exec=${pname}'

            # Re-wrap the binary so the app sees LATTICE_DISABLE_AUTO_UPDATE=1
            # and skips the in-app electron-updater flow on NixOS.
            mv $out/bin/${pname} $out/bin/.${pname}-unwrapped
            makeWrapper $out/bin/.${pname}-unwrapped $out/bin/${pname} \
              --set LATTICE_DISABLE_AUTO_UPDATE 1
          '';

          meta = {
            description = "Lattice — desktop Matrix client";
            homepage = "https://github.com/Newspicel/lattice";
            changelog = "https://github.com/Newspicel/lattice/releases/tag/v${version}";
            license = pkgs.lib.licenses.mit;
            mainProgram = pname;
            platforms = [ "x86_64-linux" ];
            sourceProvenance = [ pkgs.lib.sourceTypes.binaryNativeCode ];
          };
        };
    in
    {
      packages.x86_64-linux = rec {
        lattice = mkLattice nixpkgs.legacyPackages.x86_64-linux;
        default = lattice;
      };

      apps.x86_64-linux.default = {
        type = "app";
        program = "${self.packages.x86_64-linux.default}/bin/lattice";
      };

      formatter.x86_64-linux = nixpkgs.legacyPackages.x86_64-linux.nixpkgs-fmt;
    };
}

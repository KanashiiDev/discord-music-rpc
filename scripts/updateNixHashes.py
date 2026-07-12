#!/usr/bin/env python3
# scripts/updateNixHashes.py
#
# Patches nix/package.nix with new version and sha256 hashes.
# Called by CI after a release is built.
#
# Usage:
#   python3 scripts/updateNixHashes.py \
#     --file nix/package.nix \
#     --version 2.0.0 \
#     --x64    <sha256>

import re
import sys
import argparse

def replace_hash(text, arch, new_hash):
    if not new_hash:
        return text
    pattern = rf'({re.escape(arch)}-linux = fetchurl \{{.*?sha256 = )(lib\.fakeSha256|"[^"]+")(;)'
    replacement = rf'\g<1>"{new_hash}"\g<3>'
    result = re.sub(pattern, replacement, text, flags=re.DOTALL)
    if result == text:
        print(f"WARNING: could not find {arch}-linux sha256 pattern", file=sys.stderr)
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file",    required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--x64",    default="")
    args = parser.parse_args()

    with open(args.file) as f:
        content = f.read()

    content = re.sub(r'version = "\d+\.\d+\.\d+"', f'version = "{args.version}"', content)
    content = replace_hash(content, "x86_64",  args.x64)

    with open(args.file, "w") as f:
        f.write(content)

    print(f"nix/package.nix updated: version={args.version}")
    if args.x64:   print(f"   x86_64  = {args.x64}")

if __name__ == "__main__":
    main()

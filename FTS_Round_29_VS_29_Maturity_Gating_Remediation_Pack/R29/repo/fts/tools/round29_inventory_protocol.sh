#!/usr/bin/env bash
set -euo pipefail
PKG="${1:?usage: round29_inventory_protocol.sh <fts-package.zip> <workdir>}"
WORKDIR="${2:?usage: round29_inventory_protocol.sh <fts-package.zip> <workdir>}"
mkdir -p "$WORKDIR"
unzip -o "$PKG" -d "$WORKDIR" >/dev/null
find "$WORKDIR" -type f | sort | tee "$WORKDIR/fts_inventory.txt"
if [ -f "$WORKDIR/SHA256SUMS" ]; then (cd "$WORKDIR" && sha256sum -c SHA256SUMS) | tee "$WORKDIR/fts_integrity.log"; else echo "SHA256SUMS missing" | tee "$WORKDIR/fts_integrity.log"; fi
if compgen -G "$WORKDIR/signatures/*.sig" >/dev/null; then echo "signature files present; verify with approved VATM trust store" | tee "$WORKDIR/fts_signatures.log"; else echo "signature files missing" | tee "$WORKDIR/fts_signatures.log"; fi
if [ -f "$WORKDIR/MANIFEST.xml" ]; then echo "MANIFEST present; validate against approved schema"; else echo "MANIFEST missing"; fi

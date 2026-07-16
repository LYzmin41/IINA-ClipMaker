#!/usr/bin/env sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$ROOT/build"
PLUGIN_DIR="$BUILD_DIR/ClipMaker.iinaplugin"
VERSION="$(node -e 'const fs = require("fs"); const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(String(manifest.version));' "$ROOT/Info.json")"
ARCHIVE="$BUILD_DIR/ClipMaker-$VERSION.iinaplgz"

rm -rf "$BUILD_DIR"
mkdir -p "$PLUGIN_DIR"

cp "$ROOT/Info.json" "$PLUGIN_DIR/"
cp "$ROOT/main.js" "$PLUGIN_DIR/"
cp "$ROOT/sidebar.html" "$PLUGIN_DIR/"
cp "$ROOT/sidebar.js" "$PLUGIN_DIR/"
cp "$ROOT/preferences.html" "$PLUGIN_DIR/"
cp -R "$ROOT/assets" "$PLUGIN_DIR/"
cp "$ROOT/README.md" "$PLUGIN_DIR/"
cp "$ROOT/CHANGELOG.md" "$PLUGIN_DIR/"
cp "$ROOT/LICENSE" "$PLUGIN_DIR/"

# Keep the manual bundle and compressed package free of Finder/resource-fork noise.
xattr -cr "$PLUGIN_DIR" 2>/dev/null || true

# Normalize staged timestamps and file ordering so identical sources produce an
# identical release archive across repeated builds.
find "$PLUGIN_DIR" -exec touch -t 200001010000 {} +

# IINA .iinaplgz archives are zip files whose root contains Info.json.
# Do not wrap the files in a top-level .iinaplugin directory inside the archive.
(
  cd "$PLUGIN_DIR"
  find . -type f -print | LC_ALL=C sort | COPYFILE_DISABLE=1 zip -Xq "$ARCHIVE" -@
)
xattr -c "$ARCHIVE" 2>/dev/null || true

echo "Created:"
echo "  $PLUGIN_DIR"
echo "  $ARCHIVE"

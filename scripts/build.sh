#!/usr/bin/env bash
# Packages src/ into dist/nokia-snake-playable.zip with index.html at the zip root,
# which is the layout YouTube Playables expects for upload.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist
# online.js is the web-only online multiplayer; YouTube Playables must not make
# network requests, so it is left out of the upload.
(cd src && zip -r -X ../dist/nokia-snake-playable.zip . -x '.*' -x 'online.js')
ls -lh dist/nokia-snake-playable.zip
unzip -l dist/nokia-snake-playable.zip

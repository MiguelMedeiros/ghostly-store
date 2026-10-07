#!/usr/bin/env bash
# Checks this store with a Ghostly checkout at the commit in GHOSTLY_COMMIT (CI does the same).
#
#   GHOSTLY=~/code/ghostly scripts/check.sh [base dir]
#
# GHOSTLY is a checkout of github.com/MiguelMedeiros/ghostly with `npm ci` run. This script builds the CLI there
# (packages/cli/dist/ghostly.mjs) unless it is already built, bundles the check against that checkout's
# @ghostly/core, and runs it. The optional base dir is this repository before the change.
set -euo pipefail

store="$(cd "$(dirname "$0")/.." && pwd)"
ghostly="${GHOSTLY:?set GHOSTLY to a Ghostly checkout (see GHOSTLY_COMMIT for the commit CI uses)}"
ghostly="$(cd "$ghostly" && pwd)"
base="${1:-}"

pinned="$(tr -d '[:space:]' < "$store/GHOSTLY_COMMIT")"
at="$(git -C "$ghostly" rev-parse HEAD 2>/dev/null || echo unknown)"
if [[ "$at" != "$pinned" ]]; then
  echo "note: $ghostly is at $at; CI checks with $pinned (GHOSTLY_COMMIT)" >&2
fi

cli="$ghostly/packages/cli/dist/ghostly.mjs"
if [[ ! -f "$cli" ]]; then
  (cd "$ghostly" && npm run build -w @ghostlytools/cli >/dev/null)
fi

work="$(mktemp -d)"
trap 'rm -rf "$work" "$ghostly/.store-bundle-check.mjs"' EXIT
cp "$store/scripts/bundle-check.mjs" "$ghostly/.store-bundle-check.mjs"
(cd "$ghostly" && node .store-bundle-check.mjs "$store/scripts/check-store.mjs" "$work" "$ghostly")

node "$work/check.mjs" --store "$store" --cli "$cli" ${base:+--base "$base"}

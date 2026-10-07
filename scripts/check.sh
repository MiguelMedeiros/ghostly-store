#!/usr/bin/env bash
# Checks this store with a Ghostly checkout at the commit in GHOSTLY_COMMIT (CI does the same).
#
#   GHOSTLY=~/code/ghostly scripts/check.sh [base dir]
#
# GHOSTLY is a checkout of github.com/MiguelMedeiros/ghostly with `npm ci` run. This script builds the CLI there
# (packages/cli/dist/ghostly.mjs) unless it is already built, links the checkout as .ghostly (the check imports
# @ghostly/core from its sources, see tsconfig.json), installs this store's own tools (tsx) when they are missing, and
# runs scripts/check-store.ts. The optional base dir is this repository before the change.
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

if [[ -e "$store/.ghostly" && ! -L "$store/.ghostly" ]]; then
  echo "$store/.ghostly is not a link: move it away, this script links the Ghostly checkout there" >&2
  exit 2
fi
ln -sfn "$ghostly" "$store/.ghostly"

tsx="$store/node_modules/.bin/tsx"
if [[ ! -x "$tsx" ]]; then
  (cd "$store" && npm ci --no-audit --no-fund >/dev/null)
fi

"$tsx" --tsconfig "$store/tsconfig.json" "$store/scripts/check-store.ts" --store "$store" --cli "$cli" ${base:+--base "$base"}

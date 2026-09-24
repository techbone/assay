#!/bin/bash
# Exports a fresh snapshot and publishes it to the `data` branch.
#
# Data lives on its own orphan branch, force-pushed as a single commit each time, so:
#   - `main` stays readable for judges instead of filling with snapshot commits
#   - Vercel rebuilds only when code changes, not every 20 minutes
#   - the published site reads JSON straight from raw.githubusercontent
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${ASSAY_DB:-data/assay.db}"
REMOTE="${ASSAY_REMOTE:-$(git remote get-url origin)}"
OUT=web/public/data

npx tsx scripts/export.ts "$DB" "$OUT" >/dev/null

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cp -R "$OUT"/. "$TMP"/

cd "$TMP"
git init -q
git checkout -q -b data
git config user.name "Musa Etudaye"
git config user.email "musaawwaletudaye@gmail.com"
git add -A
git commit -q -m "data: snapshot $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push -q --force "$REMOTE" data:data

SIZE=$(du -sh "$TMP" | cut -f1)
echo "published $SIZE to data branch @ $(date -u +%H:%M:%SZ)"

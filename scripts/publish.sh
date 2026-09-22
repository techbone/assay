#!/bin/bash
# Exports a fresh snapshot, builds the static site around it, and ships it to Vercel.
# Deploys the built directory directly rather than via git, so publishing data does not
# fill the repo history with snapshot commits.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${ASSAY_DB:-data/assay.db}"

npx tsx scripts/export.ts "$DB" web/public/data
VITE_DATA_BASE=/data npx vite build >/dev/null

if ! npx vercel whoami >/dev/null 2>&1; then
  echo "publish: not logged into Vercel - built locally only (run: npx vercel login)"
  exit 0
fi

npx vercel deploy web/dist --prod --yes --archive=tgz 2>&1 | tail -3

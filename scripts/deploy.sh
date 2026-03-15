#!/usr/bin/env bash
set -euo pipefail

# === Easy-pdfSign — Deploy script ===
# Run from the project root on your local machine.
# Usage: DEPLOY_SERVER=user@host ./scripts/deploy.sh
#
# What it does:
#   1. Builds the app locally (npm run build)
#   2. Uploads the dist/ folder to the server via rsync
#   3. Done — nginx serves the new files immediately

SERVER="${DEPLOY_SERVER:?Set DEPLOY_SERVER=user@host}"
REMOTE_DIR="${DEPLOY_DIR:-/var/www/easy-pdfsign}"

echo "==> Building app..."
npm run build

echo "==> Deploying to $SERVER:$REMOTE_DIR..."
rsync -avz --delete dist/ "$SERVER:$REMOTE_DIR/"

echo ""
echo "=== Deploy complete ==="

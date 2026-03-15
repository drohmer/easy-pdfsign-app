#!/usr/bin/env bash
set -euo pipefail

# === Easy-pdfSign — Server install script ===
# Run once on a fresh server (or to update the setup).
# Usage: ssh root@<server> 'bash -s' < scripts/install.sh
#
# What it does:
#   1. Creates /var/www/easy-pdfsign directory
#   2. Adds an nginx site config (static file serving)
#   3. Enables the site and reloads nginx
#
# It does NOT interfere with other nginx sites or services.

DOMAIN="_"  # catch-all for bare IP; replace with a real domain if available
APP_DIR="/var/www/easy-pdfsign"
NGINX_CONF="/etc/nginx/sites-available/easy-pdfsign"
NGINX_LINK="/etc/nginx/sites-enabled/easy-pdfsign"
PORT=8080  # internal listen port to avoid conflicts; nginx proxies to static files

echo "==> Creating app directory..."
mkdir -p "$APP_DIR"

echo "==> Writing nginx config..."
cat > "$NGINX_CONF" <<'NGINX'
server {
    listen 8080;
    listen [::]:8080;
    server_name _;

    root /var/www/easy-pdfsign;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
NGINX

echo "==> Enabling site..."
ln -sf "$NGINX_CONF" "$NGINX_LINK"

echo "==> Testing nginx config..."
nginx -t

echo "==> Reloading nginx..."
systemctl reload nginx

echo ""
echo "=== Install complete ==="
echo "App directory: $APP_DIR"
echo "Listening on:  http://<server-ip>:8080"
echo ""
echo "Next step: run deploy.sh to push the built app."

#!/usr/bin/env bash
# Deploys (or updates) RxLens on one application server (Web01 or Web02).
# Run ON the server:  sudo bash deploy-web.sh <git-repo-url> [branch]
# Idempotent: safe to re-run for updates. Backs up any Nginx site it replaces.
set -euo pipefail

REPO_URL="${1:?Usage: sudo bash deploy-web.sh <git-repo-url> [branch]}"
BRANCH="${2:-main}"
APP_DIR=/opt/rxlens
APP_USER=rxlens

if [[ $EUID -ne 0 ]]; then echo "Run with sudo." >&2; exit 1; fi

echo "==> Installing system packages (git, nginx, curl)"
apt-get update -y
apt-get install -y git nginx curl ca-certificates

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
  echo "==> Installing Node.js 22 LTS from NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "    node $(node -v)"

id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"

echo "==> Fetching code ($BRANCH)"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" checkout --quiet "$BRANCH"
  git -C "$APP_DIR" pull --ff-only --quiet origin "$BRANCH"
else
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

echo "==> Installing production dependencies"
cd "$APP_DIR"
npm ci --omit=dev --no-audit --no-fund

if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "==> Creating .env from template (edit it to add OPENFDA_API_KEY if you have one)"
  cp .env.example .env
  sed -i "s/^NODE_ENV=.*/NODE_ENV=production/; s/^HOST=.*/HOST=127.0.0.1/; s/^SERVER_NAME=.*/SERVER_NAME=$(hostname)/" .env
fi
chmod 600 .env
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> Installing systemd service"
cp deploy/systemd/rxlens.service /etc/systemd/system/rxlens.service
systemctl daemon-reload
systemctl enable rxlens >/dev/null
systemctl restart rxlens

echo "==> Configuring Nginx reverse proxy"
if [[ -e /etc/nginx/sites-enabled/default && ! -e /etc/nginx/sites-available/default.pre-rxlens ]]; then
  cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.pre-rxlens
  echo "    backed up existing default site to /etc/nginx/sites-available/default.pre-rxlens"
fi
cp deploy/nginx/web-server.conf /etc/nginx/sites-available/rxlens
ln -sf /etc/nginx/sites-available/rxlens /etc/nginx/sites-enabled/rxlens
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Health check"
for _ in {1..10}; do
  if curl -fsS http://127.0.0.1/api/health; then echo; echo "Deployed successfully on $(hostname)."; exit 0; fi
  sleep 1
done
echo "Health check failed. Inspect: journalctl -u rxlens -n 50" >&2
exit 1

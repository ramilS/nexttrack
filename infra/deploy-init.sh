#!/usr/bin/env bash
set -euo pipefail

# First-time deployment script for NextTrack
# Usage: DOMAIN=your-domain.com EMAIL=admin@your-domain.com ./deploy-init.sh

: "${DOMAIN:?Set DOMAIN environment variable}"
: "${EMAIL:?Set EMAIL environment variable}"

COMPOSE="docker compose -f docker-compose.prod.yml"
INFRA_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$INFRA_DIR"

echo "==> Checking .env.prod exists..."
if [ ! -f "../.env.prod" ]; then
  echo "ERROR: ../.env.prod not found. Copy .env.prod.example and fill in values."
  exit 1
fi

echo "==> Starting infrastructure services..."
$COMPOSE up -d postgres valkey elasticsearch minio

echo "==> Waiting for services to be healthy..."
$COMPOSE exec postgres sh -c 'until pg_isready -U $POSTGRES_USER; do sleep 1; done'

echo "==> Building and starting API + Web (the one-shot 'migrate' service runs first)..."
$COMPOSE up -d --build api web

echo "==> Generating temporary self-signed certificate..."
./init-ssl.sh
docker compose -f docker-compose.prod.yml cp ssl-dummy/. nginx:/etc/letsencrypt/ 2>/dev/null || \
  docker run --rm -v "$(pwd)/ssl-dummy:/src" -v nexttrack_letsencrypt:/dst alpine sh -c 'cp -r /src/* /dst/'
rm -rf ssl-dummy

echo "==> Starting nginx with temporary cert..."
$COMPOSE up -d nginx

echo "==> Getting real SSL certificate from Let's Encrypt..."

$COMPOSE run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive

echo "==> Reloading nginx with real certificate..."
$COMPOSE exec nginx nginx -s reload

echo ""
echo "==> Deployment complete!"
echo "    https://$DOMAIN"
echo ""
echo "    To check status:  $COMPOSE ps"
echo "    To view logs:     $COMPOSE logs -f api web"
echo "    To renew SSL:     $COMPOSE run --rm certbot renew && $COMPOSE exec nginx nginx -s reload"

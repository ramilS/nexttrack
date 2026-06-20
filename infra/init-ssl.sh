#!/usr/bin/env bash
set -euo pipefail

# Creates a temporary self-signed certificate so nginx can start
# before Let's Encrypt issues the real one.
#
# Usage: DOMAIN=your-domain.com ./init-ssl.sh

: "${DOMAIN:?Set DOMAIN environment variable}"

CERT_DIR="./ssl-dummy"
mkdir -p "$CERT_DIR/live/$DOMAIN"

echo "==> Generating self-signed certificate for $DOMAIN..."
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout "$CERT_DIR/live/$DOMAIN/privkey.pem" \
  -out "$CERT_DIR/live/$DOMAIN/fullchain.pem" \
  -subj "/CN=$DOMAIN" 2>/dev/null

echo "==> Done. Dummy cert at $CERT_DIR/live/$DOMAIN/"
echo "    Start nginx, then run certbot to replace with real cert."

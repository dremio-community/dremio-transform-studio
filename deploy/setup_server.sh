#!/usr/bin/env bash
# ── Dremio Transform Studio — Server Setup Script ────────────────────────────
# Installs Docker, pulls the app, configures nginx + free SSL.
# Run on a fresh Ubuntu/Debian server (AWS EC2, Azure VM, etc.):
#
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/main/deploy/setup_server.sh | bash
#
# Or with your domain pre-set:
#   DOMAIN=transforms.yourcompany.com EMAIL=admin@yourcompany.com bash setup_server.sh

set -euo pipefail

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
DOCKER_IMAGE="mshainman/transform-studio:latest"

# ── Prompt for required values ────────────────────────────────────────────────
if [[ -z "$DOMAIN" ]]; then
  read -rp "Enter your domain (e.g. transforms.yourcompany.com): " DOMAIN
fi
if [[ -z "$EMAIL" ]]; then
  read -rp "Enter your email for SSL cert notifications: " EMAIL
fi

echo ""
echo "━━━ Setting up Transform Studio on: $DOMAIN ━━━"
echo ""

# ── Install Docker if not present ─────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "[1/5] Installing Docker..."
  curl -fsSL https://get.docker.com | bash
  systemctl enable --now docker
else
  echo "[1/5] Docker already installed ✓"
fi

# ── Clone/download deploy configs ─────────────────────────────────────────────
echo "[2/5] Setting up configuration..."
mkdir -p /opt/transform-studio/nginx
cd /opt/transform-studio

# Write nginx config with the real domain
cat > nginx/nginx.conf << NGINX
worker_processes auto;
events { worker_connections 1024; }
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    server {
        listen 80;
        server_name $DOMAIN;
        location /.well-known/acme-challenge/ { root /var/www/certbot; }
        location / { return 301 https://\$host\$request_uri; }
    }

    server {
        listen 443 ssl http2;
        server_name $DOMAIN;
        ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        add_header X-Frame-Options SAMEORIGIN;
        location / {
            proxy_pass http://transform-studio:8000;
            proxy_http_version 1.1;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_read_timeout 120s;
        }
    }
}
NGINX

# Write compose file
cat > docker-compose.yml << COMPOSE
version: '3.9'
services:
  transform-studio:
    image: $DOCKER_IMAGE
    container_name: transform-studio
    restart: unless-stopped
    volumes: [ts-data:/data]
    environment: [DB_PATH=/data/transforms.db]
    expose: ["8000"]
    networks: [internal]

  nginx:
    image: nginx:alpine
    container_name: ts-nginx
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - certbot-www:/var/www/certbot:ro
      - certbot-certs:/etc/letsencrypt:ro
    depends_on: [transform-studio]
    networks: [internal]

  certbot:
    image: certbot/certbot
    container_name: ts-certbot
    volumes: [certbot-www:/var/www/certbot, certbot-certs:/etc/letsencrypt]
    entrypoint: >
      sh -c "trap exit TERM; while :; do certbot renew --webroot -w /var/www/certbot --quiet; sleep 12h & wait \$\${!}; done"

volumes: {ts-data: {}, certbot-www: {}, certbot-certs: {}}
networks: {internal: {}}
COMPOSE

# ── Pull image + start on HTTP first (needed for cert issue) ──────────────────
echo "[3/5] Pulling Docker image..."
docker pull "$DOCKER_IMAGE"

# Start with HTTP-only nginx temporarily (SSL certs don't exist yet)
echo "[4/5] Obtaining SSL certificate..."
docker compose up -d transform-studio

# Start nginx with HTTP only for cert challenge
docker run --rm \
  -v certbot-www:/var/www/certbot \
  -v certbot-certs:/etc/letsencrypt \
  -p 80:80 \
  nginx:alpine \
  nginx -g "daemon off;" &
NGINX_TEMP_PID=$!
sleep 3

docker run --rm \
  -v certbot-www:/var/www/certbot \
  -v certbot-certs:/etc/letsencrypt \
  certbot/certbot certonly \
    --webroot -w /var/www/certbot \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos --non-interactive

kill $NGINX_TEMP_PID 2>/dev/null || true

# ── Start everything ──────────────────────────────────────────────────────────
echo "[5/5] Starting all services..."
docker compose up -d

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅  Transform Studio is live at: https://$DOMAIN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Update app:  docker compose pull && docker compose up -d"
echo "  View logs:   docker compose logs -f transform-studio"
echo "  Stop:        docker compose down"
echo ""

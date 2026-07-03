#!/bin/bash
set -e

# ============================================================
#  Meraki CMS - Deploy Script
#  Ubuntu 22.04+ / Debian 12+ | Ausführen als root oder sudo
#  Verwendung: bash deploy.sh
# ============================================================

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[ OK ]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_step()  { echo -e "\n${BOLD}${GREEN}▶ $1${NC}"; }

APP_DIR="/opt/meraki-cms"
APP_USER="opa-cms"
REPO="https://github.com/stb-srv/OPA-Santorini.git"
SERVICE_NAME="meraki-cms"
PORT=5000

clear
echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║         Meraki CMS - Server Deploy Script v3.0         ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# --- 1. Node.js ---
log_step "[1/8] Node.js 20 prüfen / installieren"
apt-get update -qq
apt-get install -y -qq curl git openssl
if ! command -v node &>/dev/null || [[ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 18 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi
log_ok "Node.js $(node -v) bereit"

# --- 2. App-User ---
log_step "[2/8] App-User '${APP_USER}' erstellen"
if ! id "$APP_USER" &>/dev/null; then
    useradd --system --shell /bin/bash --create-home "$APP_USER"
    log_ok "User erstellt"
else
    log_ok "User existiert bereits"
fi

# --- 3. Repo klonen / updaten ---
log_step "[3/8] Repository klonen / updaten"
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
if [ -d "$APP_DIR/.git" ]; then
    chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
    cd "$APP_DIR" && sudo -u "$APP_USER" git pull origin main
    log_ok "Repository aktualisiert"
else
    git clone "$REPO" "$APP_DIR"
    chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
    log_ok "Repository geklont nach ${APP_DIR}"
fi

# --- 4. .env erstellen ---
log_step "[4/8] .env konfigurieren"
if [ ! -f "$APP_DIR/.env" ]; then
    SECRET=$(openssl rand -hex 32)
    read -rp "  Domain/IP (z.B. meinrestaurant.de oder 1.2.3.4): " APP_DOMAIN
    APP_DOMAIN=${APP_DOMAIN:-localhost}
    # SEC: Domain/IP strikt validieren – verhindert Injection in nginx-Config & .env
    if ! [[ "$APP_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
        log_warn "Ungültige Domain/IP '${APP_DOMAIN}' – Fallback auf localhost"
        APP_DOMAIN="localhost"
    fi

    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    sed -i "s|^PORT=.*|PORT=${PORT}|" "$APP_DIR/.env"
    sed -i "s|^ADMIN_SECRET=.*|ADMIN_SECRET=${SECRET}|" "$APP_DIR/.env"
    sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=http://${APP_DOMAIN}|" "$APP_DIR/.env"

    chown "$APP_USER":"$APP_USER" "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
    log_ok ".env erstellt (ADMIN_SECRET auto-generiert, CORS=${APP_DOMAIN})"
else
    log_warn ".env existiert bereits – wird nicht überschrieben"
    APP_DOMAIN=$(grep '^CORS_ORIGINS=' "$APP_DIR/.env" | sed 's|.*://||' | sed 's|,.*||')
fi

# --- 5. npm install ---
log_step "[5/8] Dependencies installieren"
cd "$APP_DIR" && sudo -u "$APP_USER" npm install --omit=dev --silent
log_ok "Dependencies installiert"

# --- 6. Verzeichnisse ---
log_step "[6/8] Verzeichnisse & Berechtigungen"
mkdir -p "${APP_DIR}/uploads" "${APP_DIR}/tmp"
chmod -R 775 "${APP_DIR}/uploads" "${APP_DIR}/tmp"
chown -R "$APP_USER":"$APP_USER" "${APP_DIR}"
log_ok "Berechtigungen gesetzt"

# --- 7. Systemd Service ---
log_step "[7/8] Systemd Service einrichten"
cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=Meraki Restaurant CMS
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
sleep 2
log_ok "Systemd Service gestartet & Autostart aktiviert"

# --- 8. Nginx ---
read -rp "  Nginx als Reverse Proxy installieren? [J/n]: " INSTALL_NGINX
INSTALL_NGINX=${INSTALL_NGINX:-J}

if [[ "${INSTALL_NGINX,,}" == "j" || "${INSTALL_NGINX,,}" == "y" ]]; then
    log_step "[8/8] Nginx konfigurieren"
    apt-get install -yq nginx
    NGINX_CONF="/etc/nginx/sites-available/${SERVICE_NAME}"
    cat > "${NGINX_CONF}" <<EOF
server {
    listen 80;
    server_name ${APP_DOMAIN};
    client_max_body_size 20M;

    location / {
        proxy_pass         http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
    ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/${SERVICE_NAME}
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx
    log_ok "Nginx konfiguriert für: ${APP_DOMAIN}"

    if command -v ufw &>/dev/null; then
        ufw allow 'Nginx Full' --force >>/dev/null 2>&1 || true
        log_ok "Firewall: Port 80/443 freigegeben"
    fi

    # --- HTTPS via Certbot (optional) ---
    read -rp "  SSL/HTTPS via Certbot einrichten? (Domain muss auf diesen Server zeigen) [J/n]: " INSTALL_SSL
    INSTALL_SSL=${INSTALL_SSL:-J}
    if [[ "${INSTALL_SSL,,}" == "j" || "${INSTALL_SSL,,}" == "y" ]]; then
        read -rp "  E-Mail für Let's Encrypt Benachrichtigungen: " LE_EMAIL
        # SEC: E-Mail validieren, bevor sie an certbot übergeben wird
        if [ -n "${LE_EMAIL}" ] && ! [[ "${LE_EMAIL}" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
            log_warn "Ungültige E-Mail-Adresse – Certbot übersprungen"
            LE_EMAIL=""
        fi
        if [ -n "${LE_EMAIL}" ]; then
            apt-get install -yq certbot python3-certbot-nginx
            certbot --nginx -d "${APP_DOMAIN}" --non-interactive --agree-tos -m "${LE_EMAIL}" || \
                log_warn "Certbot fehlgeschlagen – bitte manuell ausführen: certbot --nginx -d ${APP_DOMAIN}"
            # CORS_ORIGINS auf https aktualisieren
            sed -i "s|^CORS_ORIGINS=http://|CORS_ORIGINS=https://|" "$APP_DIR/.env"
            systemctl restart "$SERVICE_NAME"
            log_ok "HTTPS aktiviert, CORS_ORIGINS auf https aktualisiert"
        else
            log_warn "Keine E-Mail angegeben – Certbot übersprungen"
        fi
    fi
else
    log_step "[8/8] Nginx übersprungen"
fi

# --- Zusammenfassung ---
echo
echo -e "${BOLD}${GREEN}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║            ✓ DEPLOY ABGESCHLOSSEN                    ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo
echo "  CMS URL:     http://${APP_DOMAIN}"
echo "  Admin Panel: http://${APP_DOMAIN}/admin"
echo
echo "  ┌─────────────────────────────────────────────────────┐"
echo "  │  Nützliche Befehle:                                  │"
echo "  │    systemctl status ${SERVICE_NAME}                  │"
echo "  │    journalctl -fu ${SERVICE_NAME}                    │"
echo "  │    systemctl restart ${SERVICE_NAME}                 │"
echo "  │    cd ${APP_DIR} && git pull && systemctl restart ${SERVICE_NAME} │"
echo "  └─────────────────────────────────────────────────────┘"
echo
echo -e "  ${GREEN}✅ Beim ersten Aufruf von http://${APP_DOMAIN}/admin${NC}"
echo -e "  ${GREEN}   startet automatisch der Setup-Wizard.${NC}"
echo -e "  ${GREEN}   Dort werden Admin-Zugangsdaten, SMTP und Lizenz eingerichtet –${NC}"
echo -e "  ${GREEN}   alles im Browser, kein Konsolenzugriff mehr nötig.${NC}"
echo

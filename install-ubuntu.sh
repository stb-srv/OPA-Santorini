#!/bin/bash
# ==============================================================================
#  OPA-CMS - Linux Installations-Skript
#  Getestet auf: Ubuntu 22.04 / 24.04, Debian 12, Rocky Linux 9
# ==============================================================================
#  Nutzung:
#    chmod +x install-ubuntu.sh
#    sudo ./install-ubuntu.sh
# ==============================================================================

set -euo pipefail

# --- Farben ---
RED='\033[0;31m';  GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m';  BOLD='\033[1m'; NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[ OK ]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[FAIL]${NC}  $1"; }
log_step()  { echo -e "\n${BOLD}${CYAN}▶ $1${NC}"; }

# --- Root-Check ---
if [[ $EUID -ne 0 ]]; then
    log_error "Dieses Skript muss als root ausgeführt werden."
    echo "  Starte neu mit: sudo ./install-ubuntu.sh"
    exit 1
fi

# --- Installationsverzeichnis ermitteln ---
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_USER="${SUDO_USER:-$(whoami)}"

clear
echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║         OPA-CMS - Linux Installer v3.0              ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
log_info "Installationsverzeichnis: ${INSTALL_DIR}"
log_info "Benutzer: ${SCRIPT_USER}"
echo

# --- Optionen abfragen ---
read -rp "  Nginx als Reverse Proxy installieren? [J/n]: " INSTALL_NGINX
INSTALL_NGINX=${INSTALL_NGINX:-J}

read -rp "  Lizenzserver mitinstallieren? [J/n]: " INSTALL_LICENSE
INSTALL_LICENSE=${INSTALL_LICENSE:-J}

read -rp "  CMS Port [5000]: " CMS_PORT
CMS_PORT=${CMS_PORT:-5000}

read -rp "  Domain/IP für Nginx (z.B. meinrestaurant.de oder 1.2.3.4): " SERVER_DOMAIN
SERVER_DOMAIN=${SERVER_DOMAIN:-localhost}

# --- .env automatisch anlegen wenn nicht vorhanden ---
log_step ".env Konfiguration"
if [ ! -f "${INSTALL_DIR}/.env" ]; then
    log_info "Keine .env gefunden – wird aus .env.example erstellt..."
    cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"

    sed -i "s|^PORT=.*|PORT=${CMS_PORT}|" "${INSTALL_DIR}/.env"
    sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=http://${SERVER_DOMAIN}|" "${INSTALL_DIR}/.env"

    GENERATED_SECRET=$(openssl rand -hex 32 2>/dev/null || cat /proc/sys/kernel/random/uuid | tr -d '-')
    sed -i "s|^ADMIN_SECRET=.*|ADMIN_SECRET=${GENERATED_SECRET}|" "${INSTALL_DIR}/.env"

    log_ok ".env erstellt (PORT=${CMS_PORT}, CORS=${SERVER_DOMAIN}, ADMIN_SECRET=auto-generated)"
else
    log_warn ".env bereits vorhanden – wird nicht überschrieben."
fi

echo
log_step "Schritt 1/7: System aktualisieren"
apt-get update -q && apt-get upgrade -yq
log_ok "System aktualisiert"

log_step "Schritt 2/7: Basis-Pakete installieren"
apt-get install -yq curl git build-essential python3 ufw openssl
log_ok "Basis-Pakete installiert"

log_step "Schritt 3/7: Node.js 20 LTS installieren"
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -yq nodejs
    log_ok "Node.js $(node -v) installiert"
else
    log_warn "Node.js bereits installiert: $(node -v)"
fi

log_step "Schritt 4/7: PM2 installieren"
if ! command -v pm2 &>/dev/null; then
    npm install -g pm2 --silent
    log_ok "PM2 installiert"
else
    log_warn "PM2 bereits installiert: $(pm2 -v)"
fi

log_step "Schritt 5/7: Projektabhängigkeiten installieren"
cd "${INSTALL_DIR}"

log_info "Installiere CMS-Abhängigkeiten..."
npm install --silent
log_ok "CMS npm-Pakete installiert"

if [[ "${INSTALL_LICENSE,,}" == "j" || "${INSTALL_LICENSE,,}" == "y" ]] && [ -d "${INSTALL_DIR}/license-server" ]; then
    log_info "Installiere Lizenzserver-Abhängigkeiten..."
    cd "${INSTALL_DIR}/license-server" && npm install --silent && cd "${INSTALL_DIR}"
    log_ok "Lizenzserver npm-Pakete installiert"
fi

log_step "Schritt 6/7: Verzeichnisse & Berechtigungen"
mkdir -p "${INSTALL_DIR}/uploads" "${INSTALL_DIR}/tmp"

# Das App-Verzeichnis selbst muss für den Service-User beschreibbar sein,
# damit der Setup-Wizard config.json anlegen kann (EACCES-Fix).
chmod 775 "${INSTALL_DIR}"
chmod -R 775 "${INSTALL_DIR}/uploads" "${INSTALL_DIR}/tmp"

# config.json vorab anlegen (leer), damit Berechtigungen klar gesetzt sind,
# bevor der Node-Prozess das erste Mal versucht, hineinzuschreiben.
if [ ! -f "${INSTALL_DIR}/config.json" ]; then
    touch "${INSTALL_DIR}/config.json"
    chmod 664 "${INSTALL_DIR}/config.json"
    log_ok "config.json vorab angelegt (leer)"
fi

# Jetzt erst chown – nach touch, damit der Service-User Eigentümer wird.
chown -R "${SCRIPT_USER}:${SCRIPT_USER}" "${INSTALL_DIR}"
log_ok "Berechtigungen gesetzt (${SCRIPT_USER} ist Eigentümer)"

log_step "Schritt 7/7: PM2 Services starten"

# PM2 als Service-User starten, damit der Prozess Schreibrechte auf
# config.json und das App-Verzeichnis hat (kein root-Prozess).
PM2_BIN="$(command -v pm2)"

su -s /bin/bash "${SCRIPT_USER}" -c "${PM2_BIN} delete opa-cms 2>/dev/null || true"
su -s /bin/bash "${SCRIPT_USER}" -c "${PM2_BIN} delete opa-license 2>/dev/null || true"

su -s /bin/bash "${SCRIPT_USER}" -c \
    "${PM2_BIN} start '${INSTALL_DIR}/server.js' \
        --name 'opa-cms' \
        --env production \
        -- --port '${CMS_PORT}'"

if [[ "${INSTALL_LICENSE,,}" == "j" || "${INSTALL_LICENSE,,}" == "y" ]] && [ -d "${INSTALL_DIR}/license-server" ]; then
    su -s /bin/bash "${SCRIPT_USER}" -c \
        "${PM2_BIN} start '${INSTALL_DIR}/license-server/server.js' \
            --name 'opa-license' \
            --interpreter node"
    log_ok "Lizenzserver gestartet (Port 4000)"
fi

su -s /bin/bash "${SCRIPT_USER}" -c "${PM2_BIN} save"

PM2_STARTUP=$(su -s /bin/bash "${SCRIPT_USER}" -c \
    "${PM2_BIN} startup systemd -u '${SCRIPT_USER}' --hp '/home/${SCRIPT_USER}'" 2>&1 \
    | grep 'sudo' | tail -1)
if [ -n "${PM2_STARTUP}" ]; then
    eval "${PM2_STARTUP}" || true
fi
log_ok "PM2 Autostart konfiguriert"

# --- Nginx ---
if [[ "${INSTALL_NGINX,,}" == "j" || "${INSTALL_NGINX,,}" == "y" ]]; then
    log_step "Nginx konfigurieren"
    apt-get install -yq nginx

    NGINX_CONF="/etc/nginx/sites-available/opa-santorini"
    cat > "${NGINX_CONF}" <<EOF
server {
    listen 80;
    server_name ${SERVER_DOMAIN};

    client_max_body_size 20M;

    location / {
        proxy_pass         http://127.0.0.1:${CMS_PORT};
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

    ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/opa-santorini
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx
    log_ok "Nginx konfiguriert für: ${SERVER_DOMAIN}"

    if command -v ufw &>/dev/null; then
        ufw allow 'Nginx Full' --force >>/dev/null 2>&1 || true
        log_ok "Firewall: Port 80/443 freigegeben"
    fi

    # --- HTTPS via Certbot (optional) ---
    read -rp "  SSL/HTTPS via Let's Encrypt einrichten? (Domain muss auf diesen Server zeigen) [J/n]: " INSTALL_SSL
    INSTALL_SSL=${INSTALL_SSL:-n}
    if [[ "${INSTALL_SSL,,}" == "j" || "${INSTALL_SSL,,}" == "y" ]]; then
        read -rp "  E-Mail für Let's Encrypt Benachrichtigungen: " LE_EMAIL
        if [ -n "${LE_EMAIL}" ]; then
            apt-get install -yq certbot python3-certbot-nginx
            certbot --nginx -d "${SERVER_DOMAIN}" --non-interactive --agree-tos -m "${LE_EMAIL}" || \
                log_warn "Certbot fehlgeschlagen – bitte manuell ausführen: certbot --nginx -d ${SERVER_DOMAIN}"
            # CORS auf https umstellen
            sed -i "s|^CORS_ORIGINS=http://|CORS_ORIGINS=https://|" "${INSTALL_DIR}/.env"
            su -s /bin/bash "${SCRIPT_USER}" -c "${PM2_BIN} restart opa-cms"
            log_ok "HTTPS aktiviert, CORS_ORIGINS automatisch auf https umgestellt"
        else
            log_warn "Keine E-Mail angegeben – SSL übersprungen."
        fi
    fi
fi

# --- Zusammenfassung ---
echo
echo -e "${BOLD}${GREEN}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║            ✓ INSTALLATION ABGESCHLOSSEN              ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo
echo "  CMS URL:      http://${SERVER_DOMAIN}"
echo "  Admin Panel:  http://${SERVER_DOMAIN}/admin"
if [[ "${INSTALL_LICENSE,,}" == "j" || "${INSTALL_LICENSE,,}" == "y" ]]; then
echo "  Lizenzserver: http://${SERVER_DOMAIN}:4000"
fi
echo
echo "  ┌─────────────────────────────────────────────────────┐"
echo "  │  Nützliche Befehle:                                  │"
echo "  │    pm2 status          - Prozesse anzeigen           │"
echo "  │    pm2 logs opa-cms    - CMS Logs                    │"
echo "  │    pm2 restart opa-cms - CMS neustarten              │"
echo "  │    pm2 monit           - Live Monitoring             │"
echo "  └─────────────────────────────────────────────────────┘"
echo
echo -e "  ${GREEN}✅ Setup-Wizard öffnen:${NC}  http://${SERVER_DOMAIN}/admin"
echo -e "  ${GREEN}   Dort Admin-Zugangsdaten, SMTP & Lizenz einrichten –${NC}"
echo -e "  ${GREEN}   alles im Browser, kein Konsolenzugriff mehr nötig.${NC}"
echo

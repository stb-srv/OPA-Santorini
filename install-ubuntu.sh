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

# --- Service-User bestimmen ---
if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
    SCRIPT_USER="${SUDO_USER}"
else
    SCRIPT_USER="opa"
    if ! id -u opa &>/dev/null; then
        useradd --system --create-home --shell /bin/bash --comment "OPA-CMS Service" opa
        log_ok "System-User 'opa' angelegt"
    else
        log_warn "System-User 'opa' bereits vorhanden"
    fi
fi

clear
echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║         OPA-CMS - Linux Installer v3.2              ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
log_info "Installationsverzeichnis: ${INSTALL_DIR}"
log_info "Service-User: ${SCRIPT_USER}"
echo

# --- Optionen abfragen ---
read -rp "  Nginx als Reverse Proxy installieren? [J/n]: " INSTALL_NGINX
INSTALL_NGINX=${INSTALL_NGINX:-J}

read -rp "  CMS Port [5000]: " CMS_PORT
CMS_PORT=${CMS_PORT:-5000}

read -rp "  Domain/IP (z.B. meinrestaurant.de oder 1.2.3.4): " SERVER_DOMAIN
SERVER_DOMAIN=${SERVER_DOMAIN:-localhost}

# --- SSL vorab fragen (WICHTIG: bestimmt CORS_ORIGINS http vs https) ---
echo
echo -e "  ${YELLOW}WICHTIG: CORS-Konfiguration${NC}"
echo -e "  Das CMS muss wissen ob es per HTTP oder HTTPS erreichbar sein wird."
echo -e "  Wenn du SSL/HTTPS aktivierst aber hier 'n' wählst, erhältst du"
echo -e "  beim Login einen CORS-Fehler!"
echo
read -rp "  Wird SSL/HTTPS (Let's Encrypt) eingerichtet? [J/n]: " WILL_USE_SSL
WILL_USE_SSL=${WILL_USE_SSL:-n}

# CORS-Protokoll anhand SSL-Antwort bestimmen
if [[ "${WILL_USE_SSL,,}" == "j" || "${WILL_USE_SSL,,}" == "y" ]]; then
    CORS_PROTOCOL="https"
    log_info "CORS_ORIGINS wird auf https://${SERVER_DOMAIN} gesetzt."
else
    CORS_PROTOCOL="http"
    log_info "CORS_ORIGINS wird auf http://${SERVER_DOMAIN} gesetzt."
    if [[ "${SERVER_DOMAIN}" != "localhost" && "${SERVER_DOMAIN}" != "127.0.0.1" ]]; then
        echo
        log_warn "Du hast eine Domain angegeben aber kein SSL gewählt."
        log_warn "Falls du später manuell SSL einrichtest, musst du in /opt/opa-santorini/.env"
        log_warn "die Zeile \"CORS_ORIGINS=http://\" auf \"CORS_ORIGINS=https://\" ändern"
        log_warn "und danach \"pm2 restart opa-cms\" ausführen."
        echo
    fi
fi

# --- .env automatisch anlegen wenn nicht vorhanden ---
log_step ".env Konfiguration"
if [ ! -f "${INSTALL_DIR}/.env" ]; then
    log_info "Keine .env gefunden – wird aus .env.example erstellt..."
    cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"

    sed -i "s|^PORT=.*|PORT=${CMS_PORT}|" "${INSTALL_DIR}/.env"
    sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=${CORS_PROTOCOL}://${SERVER_DOMAIN}|" "${INSTALL_DIR}/.env"

    GENERATED_SECRET=$(openssl rand -hex 32 2>/dev/null || cat /proc/sys/kernel/random/uuid | tr -d '-')
    sed -i "s|^ADMIN_SECRET=.*|ADMIN_SECRET=${GENERATED_SECRET}|" "${INSTALL_DIR}/.env"

    log_ok ".env erstellt (PORT=${CMS_PORT}, CORS=${CORS_PROTOCOL}://${SERVER_DOMAIN}, ADMIN_SECRET=auto-generated)"
else
    log_warn ".env bereits vorhanden – wird nicht überschrieben."
    # Trotzdem prüfen ob CORS zur SSL-Wahl passt
    CURRENT_CORS=$(grep '^CORS_ORIGINS=' "${INSTALL_DIR}/.env" | head -1 || echo "")
    if [[ "${WILL_USE_SSL,,}" == "j" || "${WILL_USE_SSL,,}" == "y" ]] && echo "${CURRENT_CORS}" | grep -q 'http://'; then
        log_warn "Deine .env enthält noch http:// in CORS_ORIGINS, aber SSL wird aktiviert!"
        log_warn "Korrigiere automatisch auf https://..."
        sed -i "s|^CORS_ORIGINS=http://|CORS_ORIGINS=https://|" "${INSTALL_DIR}/.env"
        log_ok "CORS_ORIGINS auf https:// aktualisiert."
    fi
fi

echo
log_step "Schritt 1/7: System aktualisieren"
apt-get update -q && apt-get upgrade -yq
log_ok "System aktualisiert"

log_step "Schritt 2/7: Basis-Pakete installieren"
apt-get install -yq curl git build-essential python3 ufw openssl
log_ok "Basis-Pakete installiert (inkl. build-essential & python3 für better-sqlite3)"

log_step "Schritt 3/7: Node.js 20 LTS installieren"
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -yq nodejs
    log_ok "Node.js $(node -v) installiert"
else
    NODE_MAJOR=$(node -e "console.log(parseInt(process.versions.node))")
    if [ "${NODE_MAJOR}" -lt 18 ]; then
        log_warn "Node.js $(node -v) ist zu alt (min. 18 erforderlich) – aktualisiere auf LTS 20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -yq nodejs
        log_ok "Node.js $(node -v) aktualisiert"
    else
        log_warn "Node.js bereits installiert: $(node -v)"
    fi
fi

log_step "Schritt 4/7: PM2 installieren"
if ! command -v pm2 &>/dev/null; then
    npm install -g pm2 --silent
    log_ok "PM2 installiert"
else
    log_warn "PM2 bereits installiert: $(pm2 -v)"
fi
PM2_BIN=$(command -v pm2)

log_step "Schritt 5/7: Projektabhängigkeiten installieren"
cd "${INSTALL_DIR}"

log_info "Installiere CMS-Abhängigkeiten (inkl. better-sqlite3 native build)..."
npm install --silent
if [ $? -ne 0 ]; then
    log_error "npm install fehlgeschlagen!"
    log_error "Stelle sicher dass build-essential und python3 installiert sind."
    exit 1
fi
log_ok "CMS npm-Pakete installiert"

log_step "Schritt 6/7: Verzeichnisse & Berechtigungen"
mkdir -p "${INSTALL_DIR}/uploads" \
         "${INSTALL_DIR}/tmp" \
         "${INSTALL_DIR}/server" \
         "${INSTALL_DIR}/cms/assets/css" \
         "${INSTALL_DIR}/plugins"
chmod -R 775 "${INSTALL_DIR}/uploads" \
              "${INSTALL_DIR}/tmp" \
              "${INSTALL_DIR}/server" \
              "${INSTALL_DIR}/cms" \
              "${INSTALL_DIR}/plugins"
chown -R "${SCRIPT_USER}:${SCRIPT_USER}" "${INSTALL_DIR}"
log_ok "Berechtigungen gesetzt (${SCRIPT_USER} ist Eigentümer)"

log_step "Schritt 7/7: PM2 Services starten"

"${PM2_BIN}" delete opa-cms 2>/dev/null || true

"${PM2_BIN}" start "${INSTALL_DIR}/server.js" \
    --name "opa-cms" \
    --env production

"${PM2_BIN}" save
PM2_STARTUP=$("${PM2_BIN}" startup systemd -u "${SCRIPT_USER}" --hp "/home/${SCRIPT_USER}" 2>&1 | grep 'sudo' | tail -1)
if [ -n "${PM2_STARTUP}" ]; then
    eval "${PM2_STARTUP}" || true
fi
log_ok "PM2 gestartet & Autostart konfiguriert"

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

    # --- HTTPS via Certbot ---
    if [[ "${WILL_USE_SSL,,}" == "j" || "${WILL_USE_SSL,,}" == "y" ]]; then
        log_step "SSL/HTTPS via Let's Encrypt einrichten"
        read -rp "  E-Mail für Let's Encrypt Benachrichtigungen: " LE_EMAIL
        if [ -n "${LE_EMAIL}" ]; then
            apt-get install -yq certbot python3-certbot-nginx
            certbot --nginx -d "${SERVER_DOMAIN}" --non-interactive --agree-tos -m "${LE_EMAIL}" || \
                log_warn "Certbot fehlgeschlagen – bitte manuell ausführen: certbot --nginx -d ${SERVER_DOMAIN}"
            # Sicherheitshalber nochmal CORS auf https sicherstellen & neu starten
            sed -i "s|^CORS_ORIGINS=http://|CORS_ORIGINS=https://|" "${INSTALL_DIR}/.env"
            "${PM2_BIN}" restart opa-cms
            log_ok "HTTPS aktiviert, CORS_ORIGINS = https://${SERVER_DOMAIN}"
        else
            log_warn "Keine E-Mail angegeben – SSL übersprungen."
            log_warn "CORS_ORIGINS bleibt auf https:// – falls SSL später manuell eingerichtet wird passt es."
        fi
    fi
fi

# --- Zusammenfassung ---
FINAL_URL="${CORS_PROTOCOL}://${SERVER_DOMAIN}"
echo
echo -e "${BOLD}${GREEN}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║            ✓ INSTALLATION ABGESCHLOSSEN              ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo
echo "  CMS URL:      ${FINAL_URL}"
echo "  Admin Panel:  ${FINAL_URL}/admin"
echo
echo "  ┌─────────────────────────────────────────────────────┐"
echo "  │  Nützliche Befehle:                                  │"
echo "  │    pm2 status          - Prozesse anzeigen           │"
echo "  │    pm2 logs opa-cms    - CMS Logs                    │"
echo "  │    pm2 restart opa-cms - CMS neustarten              │"
echo "  │    pm2 monit           - Live Monitoring             │"
echo "  │    ./update-upgrade.sh - Update auf neueste Version  │"
echo "  └─────────────────────────────────────────────────────┘"
echo
if [[ "${WILL_USE_SSL,,}" != "j" && "${WILL_USE_SSL,,}" != "y" ]] && \
   [[ "${SERVER_DOMAIN}" != "localhost" && "${SERVER_DOMAIN}" != "127.0.0.1" ]]; then
    echo -e "  ${YELLOW}⚠️  Kein SSL aktiv. CORS_ORIGINS = http://${SERVER_DOMAIN}${NC}"
    echo -e "  ${YELLOW}   Falls du später HTTPS einrichtest, bitte in .env anpassen:${NC}"
    echo -e "  ${YELLOW}   CORS_ORIGINS=https://${SERVER_DOMAIN}${NC}"
    echo -e "  ${YELLOW}   Danach: pm2 restart opa-cms${NC}"
    echo
fi
echo -e "  ${GREEN}✅ Setup-Wizard öffnen:${NC}  ${FINAL_URL}/admin"
echo -e "  ${GREEN}   Dort Admin-Zugangsdaten, SMTP & Lizenz einrichten –${NC}"
echo -e "  ${GREEN}   alles im Browser, kein Konsolenzugriff mehr nötig.${NC}"
echo
if [[ "${SCRIPT_USER}" == "opa" ]]; then
    echo -e "  ${YELLOW}ℹ️  Service läuft als System-User 'opa'.${NC}"
    echo -e "  ${YELLOW}   PM2-Logs: sudo -u opa pm2 logs opa-cms${NC}"
    echo
fi

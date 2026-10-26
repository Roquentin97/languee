#!/bin/sh
# Idempotent bootstrap for a fresh Ubuntu 24.04 host (Hetzner x86 or Oracle
# ARM). Run once as root: sh provision.sh
# Afterwards follow deploy/README.md for GHCR login, env files, and DNS.
set -eu

DEPLOY_USER=deploy
APP_DIR=/opt/languee

echo "==> Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg rclone fail2ban unattended-upgrades ufw

echo "==> Docker Engine"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

echo "==> Deploy user"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
# Reuse root's authorized_keys so the deploy workflow can SSH in as the deploy user.
if [ -f /root/.ssh/authorized_keys ] && [ ! -f "/home/$DEPLOY_USER/.ssh/authorized_keys" ]; then
  mkdir -p "/home/$DEPLOY_USER/.ssh"
  cp /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
  chmod 700 "/home/$DEPLOY_USER/.ssh"
  chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi

echo "==> App directory"
mkdir -p "$APP_DIR/backups" "$APP_DIR/scripts" "$APP_DIR/caddy"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

echo "==> SSH hardening"
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh || systemctl reload sshd

echo "==> Firewall (ufw)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Oracle Cloud images ship a restrictive iptables ruleset (REJECT-all) loaded
# from /etc/iptables/rules.v4 that sits alongside ufw. Open 80/443 there too,
# otherwise traffic never reaches Caddy even with the Security List open.
if [ -f /etc/iptables/rules.v4 ] && grep -q "REJECT" /etc/iptables/rules.v4; then
  echo "==> Oracle iptables rules detected — inserting 80/443 accept rules"
  for port in 80 443; do
    if ! iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
      iptables -I INPUT -p tcp --dport "$port" -j ACCEPT
    fi
  done
  netfilter-persistent save || true
fi

echo "==> Done. Remaining manual steps (see deploy/README.md):"
echo "  1. docker login ghcr.io as the deploy user (read:packages PAT)"
echo "  2. Copy stack files + env files into $APP_DIR"
echo "  3. Configure rclone R2 remote for backups + install the backup cron"
echo "  4. Point DNS at this host, then run the Deploy workflow"

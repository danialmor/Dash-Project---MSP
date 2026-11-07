#!/usr/bin/env bash
# راه‌اندازی یک‌باره‌ی سرور (Ubuntu 24.04) — با کاربر root اجرا شود.  استفاده:
#   bash setup.sh danimor.com "ssh-ed25519 AAAA... deploy-key"
# توجه: این اسکریپت روی سرور واقعی شما برای اولین بار اجرا می‌شود؛ بعد از اجرا خروجی هر مرحله را بخوانید.
set -euo pipefail
DOMAIN="${1:?دامنه را بدهید}"; DEPLOY_PUB="${2:?کلید عمومی SSH دیپلوی را بدهید}"
apt-get update && apt-get install -y python3 rsync ufw debian-keyring debian-archive-keyring apt-transport-https curl gpg
# Caddy از مخزن رسمی
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
id danimor >/dev/null 2>&1 || useradd --system --home /opt/danimor --shell /usr/sbin/nologin danimor
id deploy  >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
mkdir -p /opt/danimor/hub /var/www/danimor /var/lib/danimor /etc/danimor /home/deploy/.ssh
chown -R deploy:deploy /opt/danimor /var/www/danimor; chown danimor:danimor /var/lib/danimor; chmod 700 /var/lib/danimor
echo "$DEPLOY_PUB" > /home/deploy/.ssh/authorized_keys; chown -R deploy:deploy /home/deploy/.ssh; chmod 700 /home/deploy/.ssh; chmod 600 /home/deploy/.ssh/authorized_keys
# deploy فقط اجازه‌ی ری‌استارت همین سرویس را دارد
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart danimor-hub' > /etc/sudoers.d/danimor-deploy; chmod 440 /etc/sudoers.d/danimor-deploy
[ -f /etc/danimor/config.json ] || cat > /etc/danimor/config.json <<CFG
{"host":"127.0.0.1","port":8787,"data_dir":"/var/lib/danimor","allowed_origins":["https://$DOMAIN"],"ai_url":""}
CFG
chown root:danimor /etc/danimor/config.json; chmod 640 /etc/danimor/config.json
echo "حالا یک‌بار deploy را از گیت‌هاب اجرا کنید (فایل‌ها به سرور می‌آیند) و سپس این اسکریپت را دوباره با --finish اجرا کنید." >&2
if [ "${3:-}" = "--finish" ]; then
  cp /opt/danimor/hub/deploy/danimor-hub.service /opt/danimor/hub/deploy/danimor-backup.service /opt/danimor/hub/deploy/danimor-backup.timer /etc/systemd/system/
  sed "s/danimor.com/$DOMAIN/g" /opt/danimor/hub/deploy/Caddyfile > /etc/caddy/Caddyfile
  sudo -u danimor HUB_CONFIG=/etc/danimor/config.json python3 /opt/danimor/hub/server.py init
  systemctl daemon-reload; systemctl enable --now danimor-hub danimor-backup.timer; systemctl reload caddy || systemctl restart caddy
  ufw allow OpenSSH; ufw allow 80/tcp; ufw allow 443/tcp; ufw --force enable
  echo "آماده است: https://$DOMAIN/admin/"
fi

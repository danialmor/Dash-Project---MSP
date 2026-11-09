#!/usr/bin/env bash
# نصب یک‌مرحله‌ای Danimor روی سرور Ubuntu 24.04 (با کاربر root اجرا شود)
#   از گیت‌هاب:  bash install.sh danimor.com
#   از فایل zip: bash install.sh danimor.com --zip /root/danimor-platform.zip
#   فقط با IP (بدون دامنه، بدون HTTPS): bash install.sh 203.0.113.10
# همه‌ی داده‌ها روی همین سرور در /var/lib/danimor ذخیره و هر شب پشتیبان‌گیری می‌شوند.
set -euo pipefail
sync_dir(){ # sync_dir SRC DST exclude...
  local s="$1" d="$2"; shift 2; mkdir -p "$d"
  if command -v rsync >/dev/null 2>&1; then local a=(); for x in "$@"; do a+=(--exclude "$x"); done; rsync -a --delete "${a[@]}" "$s/" "$d/"
  else local a=(); for x in "$@"; do a+=(--exclude="./$x" --exclude="$x"); done; find "$d" -mindepth 1 -maxdepth 1 ! -name data ! -name vendor -exec rm -rf {} +; (cd "$s" && tar cf - "${a[@]}" .) | (cd "$d" && tar xf -); fi; }
SITE="${1:?دامنه یا IP سرور را بدهید}"; shift || true
ZIP=""; REPO="${DANIMOR_REPO:-https://github.com/danialmor/Dash-Project---MSP.git}"; BRANCH="${DANIMOR_BRANCH:-main}"
while [ $# -gt 0 ]; do case "$1" in --zip) ZIP="$2"; shift 2;; --repo) REPO="$2"; shift 2;; *) shift;; esac; done
ROOT="${DANIMOR_ROOT:-}"            # فقط برای آزمون: همه‌ی مسیرها زیر این پوشه
DRY="${DANIMOR_DRY:-0}"             # 1 = بدون apt و systemctl (آزمون)
SRC="$ROOT/opt/danimor/src"; WEB="$ROOT/var/www/danimor"; HUB="$ROOT/opt/danimor/hub"; DATA="$ROOT/var/lib/danimor"; ETC="$ROOT/etc/danimor"

TABLER_VER=1.0.0-beta20
fetch_tabler(){ # ظاهر کنترل پنل (Tabler، مجوز MIT) یک بار روی همین سرور دانلود می‌شود
  local d="$1/vendor/tabler"; [ -f "$d/tabler.rtl.min.css" ] && return 0; mkdir -p "$d"; local t; t=$(mktemp -d)
  if curl -fsSL "https://registry.npmjs.org/@tabler/core/-/core-$TABLER_VER.tgz" -o "$t/t.tgz" && tar -xzf "$t/t.tgz" -C "$t" package/dist/css/tabler.rtl.min.css package/dist/css/tabler.min.css; then
    cp "$t"/package/dist/css/tabler.rtl.min.css "$t"/package/dist/css/tabler.min.css "$d/"; echo "✔ Tabler $TABLER_VER روی سرور ذخیره شد"
  else echo "⚠ دانلود Tabler نشد؛ کنترل پنل تا دانلود بعدی از CDN استفاده می‌کند"; fi; rm -rf "$t"; }
say(){ printf '\n▶ %s\n' "$*"; }
if [ "$DRY" != 1 ]; then
  say "نصب پیش‌نیازها (python3، git، caddy، rsync، unzip)"
  apt-get update -y && apt-get install -y python3 git rsync unzip caddy ufw curl
  id danimor >/dev/null 2>&1 || useradd --system --home /opt/danimor --shell /usr/sbin/nologin danimor
fi
mkdir -p "$SRC" "$WEB" "$HUB" "$DATA" "$ETC"
say "دریافت کد"
if [ -n "$ZIP" ]; then rm -rf "$SRC"; mkdir -p "$SRC"; unzip -q -o "$ZIP" -d "$SRC"
elif [ -d "$SRC/.git" ]; then git -C "$SRC" fetch --depth 1 origin "$BRANCH" && git -C "$SRC" reset --hard "origin/$BRANCH"
else rm -rf "$SRC"; git clone --depth 1 -b "$BRANCH" "$REPO" "$SRC"; fi
# اگر zip یک پوشه‌ی بالایی داشت، آن را ریشه بگیر
[ -f "$SRC/hub/server.py" ] || { d=$(find "$SRC" -maxdepth 2 -name server.py -path '*/hub/*' | head -1); [ -n "$d" ] && SRC="$(dirname "$(dirname "$d")")"; }
say "قرار دادن فایل‌ها"
sync_dir "$SRC/hub" "$HUB" data
sync_dir "$SRC" "$WEB" .git hub .github docs "*.zip" README.md AGENTS.md CLAUDE.md vendor
if [ ! -f "$ETC/config.json" ]; then
  if [[ "$SITE" =~ ^[0-9.]+$ ]]; then ORIG="http://$SITE"; else ORIG="https://$SITE"; fi
  cat > "$ETC/config.json" <<CFG
{"host":"127.0.0.1","port":8787,"data_dir":"/var/lib/danimor","allowed_origins":["$ORIG"],"ai_url":"","test_mode":true}
CFG
fi
say "پیکربندی وب‌سرور"
if [[ "$SITE" =~ ^[0-9.]+$ ]]; then HOSTLINE=":80"; else HOSTLINE="$SITE, www.$SITE"; fi
sed "1,3s/^danimor.com, www.danimor.com {/$HOSTLINE {/" "$HUB/deploy/Caddyfile" > "$ROOT/tmp.caddy" 2>/dev/null || sed "s/^danimor.com, www.danimor.com {/$HOSTLINE {/" "$HUB/deploy/Caddyfile" > "$ROOT/tmp.caddy"
if [ "$DRY" = 1 ]; then mv "$ROOT/tmp.caddy" "$ETC/Caddyfile.test"; else mv "$ROOT/tmp.caddy" /etc/caddy/Caddyfile; fi
if [ "$DRY" != 1 ]; then
  say "دریافت ظاهر کنترل پنل (Tabler)"; fetch_tabler "$WEB"
  chown -R root:root "$HUB" "$WEB"; chown -R danimor:danimor "$DATA"; chmod 700 "$DATA"; chown root:danimor "$ETC/config.json"; chmod 640 "$ETC/config.json"
  cp "$HUB/deploy/danimor-hub.service" "$HUB/deploy/danimor-backup.service" "$HUB/deploy/danimor-backup.timer" "$HUB/deploy/danimor-update.service" "$HUB/deploy/danimor-update.timer" /etc/systemd/system/
  install -m 755 "$HUB/deploy/update.sh" /usr/local/bin/danimor-update
  printf '%s\n%s\n' "$SITE" "$REPO" > "$ETC/site"
  sudo -u danimor HUB_CONFIG="$ETC/config.json" python3 "$HUB/server.py" init || true
  systemctl daemon-reload; systemctl enable --now danimor-hub danimor-backup.timer
  [ -n "$ZIP" ] || systemctl enable --now danimor-update.timer
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null
  sleep 1; curl -fsS http://127.0.0.1:8787/api/v1/health >/dev/null && echo "✔ هاب روشن است" || echo "✖ هاب جواب نداد: journalctl -u danimor-hub -n 50"
fi
P=$([[ "$SITE" =~ ^[0-9.]+$ ]] && echo "http" || echo "https")
echo; echo "آماده است:"; echo "  داشبورد:     $P://$SITE/msp-bi/"; echo "  مرکز کنترل: $P://$SITE/admin/"; echo "  ورود آزمایشی: Admin / Admin123  (قبل از داده‌ی واقعی test_mode را در $ETC/config.json خاموش کنید)"

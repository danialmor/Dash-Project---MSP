#!/usr/bin/env bash
# به‌روزرسانی خودکار از گیت‌هاب: هر ۱۰ دقیقه با danimor-update.timer اجرا می‌شود؛ فقط وقتی کد عوض شده باشد کاری می‌کند.
set -euo pipefail
sync_dir(){ # sync_dir SRC DST exclude...
  local s="$1" d="$2"; shift 2; mkdir -p "$d"
  if command -v rsync >/dev/null 2>&1; then local a=(); for x in "$@"; do a+=(--exclude "$x"); done; rsync -a --delete "${a[@]}" "$s/" "$d/"
  else local a=(); for x in "$@"; do a+=(--exclude="./$x" --exclude="$x"); done; find "$d" -mindepth 1 -maxdepth 1 ! -name data ! -name vendor -exec rm -rf {} +; (cd "$s" && tar cf - "${a[@]}" .) | (cd "$d" && tar xf -); fi; }

TABLER_VER=1.0.0-beta20
fetch_tabler(){ # ظاهر کنترل پنل (Tabler، مجوز MIT) یک بار روی همین سرور دانلود می‌شود
  local d="$1/vendor/tabler"; [ -f "$d/tabler.rtl.min.css" ] && return 0; mkdir -p "$d"; local t; t=$(mktemp -d)
  if curl -fsSL "https://registry.npmjs.org/@tabler/core/-/core-$TABLER_VER.tgz" -o "$t/t.tgz" && tar -xzf "$t/t.tgz" -C "$t" package/dist/css/tabler.rtl.min.css package/dist/css/tabler.min.css; then
    cp "$t"/package/dist/css/tabler.rtl.min.css "$t"/package/dist/css/tabler.min.css "$d/"; echo "✔ Tabler $TABLER_VER روی سرور ذخیره شد"
  else echo "⚠ دانلود Tabler نشد؛ کنترل پنل تا دانلود بعدی از CDN استفاده می‌کند"; fi; rm -rf "$t"; }
SRC=/opt/danimor/src; WEB=/var/www/danimor; HUB=/opt/danimor/hub
[ -d "$SRC/.git" ] || { echo "مخزن گیت در $SRC نیست (نصب با zip بوده)؛ به‌روزرسانی خودکار غیرفعال است."; exit 0; }
OLD=$(git -C "$SRC" rev-parse HEAD); git -C "$SRC" fetch --depth 1 origin main -q && git -C "$SRC" reset --hard origin/main -q; NEW=$(git -C "$SRC" rev-parse HEAD)
[ "$OLD" = "$NEW" ] && { fetch_tabler "$WEB"; exit 0; }
python3 -m py_compile "$SRC/hub/server.py" || { echo "server.py جدید خطای نحوی دارد؛ به‌روزرسانی انجام نشد"; git -C "$SRC" reset --hard "$OLD" -q; exit 1; }
sync_dir "$SRC/hub" "$HUB" data
sync_dir "$SRC" "$WEB" .git hub .github docs "*.zip" README.md AGENTS.md CLAUDE.md vendor
fetch_tabler "$WEB"
if git -C "$SRC" diff --name-only "$OLD" "$NEW" | grep -q '^hub/'; then systemctl restart danimor-hub; fi
echo "به‌روز شد: ${OLD:0:7} → ${NEW:0:7}"

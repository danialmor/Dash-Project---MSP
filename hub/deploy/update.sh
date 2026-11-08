#!/usr/bin/env bash
# به‌روزرسانی خودکار از گیت‌هاب: هر ۱۰ دقیقه با danimor-update.timer اجرا می‌شود؛ فقط وقتی کد عوض شده باشد کاری می‌کند.
set -euo pipefail
sync_dir(){ # sync_dir SRC DST exclude...
  local s="$1" d="$2"; shift 2; mkdir -p "$d"
  if command -v rsync >/dev/null 2>&1; then local a=(); for x in "$@"; do a+=(--exclude "$x"); done; rsync -a --delete "${a[@]}" "$s/" "$d/"
  else local a=(); for x in "$@"; do a+=(--exclude="./$x" --exclude="$x"); done; find "$d" -mindepth 1 -maxdepth 1 ! -name data -exec rm -rf {} +; (cd "$s" && tar cf - "${a[@]}" .) | (cd "$d" && tar xf -); fi; }
SRC=/opt/danimor/src; WEB=/var/www/danimor; HUB=/opt/danimor/hub
[ -d "$SRC/.git" ] || { echo "مخزن گیت در $SRC نیست (نصب با zip بوده)؛ به‌روزرسانی خودکار غیرفعال است."; exit 0; }
OLD=$(git -C "$SRC" rev-parse HEAD); git -C "$SRC" fetch --depth 1 origin main -q && git -C "$SRC" reset --hard origin/main -q; NEW=$(git -C "$SRC" rev-parse HEAD)
[ "$OLD" = "$NEW" ] && exit 0
python3 -m py_compile "$SRC/hub/server.py" || { echo "server.py جدید خطای نحوی دارد؛ به‌روزرسانی انجام نشد"; git -C "$SRC" reset --hard "$OLD" -q; exit 1; }
sync_dir "$SRC/hub" "$HUB" data
sync_dir "$SRC" "$WEB" .git hub .github docs "*.zip" README.md
if git -C "$SRC" diff --name-only "$OLD" "$NEW" | grep -q '^hub/'; then systemctl restart danimor-hub; fi
echo "به‌روز شد: ${OLD:0:7} → ${NEW:0:7}"

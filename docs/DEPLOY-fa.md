# راه‌اندازی روی سرور خودتان (همه‌چیز روی سرور ذخیره می‌شود)

## چه چیزی کجا ذخیره می‌شود
- همه‌ی داده‌ها (پروژه‌ها، نامه‌ها، تأخیرها و پاسخ‌ها، گزارش‌های روزانه، گفتگوها، فایل‌های پیوست، تنظیمات هر کاربر) در پایگاه‌داده‌ی هاب روی سرور: `/var/lib/danimor/hub.sqlite3`.
- پشتیبان خودکار هر شب در `/var/lib/danimor/backups` (۳۰ نسخه‌ی آخر می‌ماند).
- مرورگر فقط در طول جلسه یک نسخه‌ی کاری نگه می‌دارد که هنگام ورود از سرور پر و هنگام «خروج» پاک می‌شود. هر تغییر کمتر از یک ثانیه بعد به سرور می‌رود؛ نشانگر پایین صفحه وضعیت را نشان می‌دهد.

## سرور لازم
یک سرور مجازی (VPS) با **Ubuntu 24.04** و دسترسی root؛ ۲ هسته، ۲ تا ۴ گیگ رم و ۴۰ گیگ دیسک برای ۴۰ کاربر کافی است.
هاست اشتراکی (فقط PHP، بدون root) این سیستم را اجرا نمی‌کند.

## نصب (یک دستور)
۱. در پنل سرور، «کنسول وب» (Web Console) را باز کنید و با root وارد شوید.
۲. اگر دامنه دارید، رکورد A آن را روی IP سرور بگذارید.
۳. این دستور را بزنید (به‌جای `example.com` دامنه‌ی خودتان؛ بدون دامنه، IP سرور):

```
curl -fsSL https://raw.githubusercontent.com/danialmor/Dash-Project---MSP/main/hub/deploy/install.sh -o install.sh && bash install.sh example.com
```

اگر سرور به گیت‌هاب دسترسی ندارد: فایل `danimor-platform.zip` را با «مدیریت فایل» پنل در `/root` بگذارید و بزنید:
```
unzip -o danimor-platform.zip hub/deploy/install.sh -d /root/x && bash /root/x/hub/deploy/install.sh example.com --zip /root/danimor-platform.zip
```

۴. در پایان نشانی‌ها چاپ می‌شود:
- داشبورد: `https://example.com/msp-bi/`
- مرکز کنترل (کاربران و دسترسی‌ها): `https://example.com/admin/`
- ورود آزمایشی: `Admin` / `Admin123`

## بعد از نصب
1. در مرکز کنترل کاربران را بسازید و به هر کدام دسترسی سایت `msp-bi` بدهید.
2. **قبل از ورود داده‌ی واقعی**، حالت آزمایشی را خاموش کنید: در `/etc/danimor/config.json` مقدار `"test_mode":false` بگذارید و `systemctl restart danimor-hub` بزنید. از آن به بعد رمز اولیه‌ی هر کاربر باید با اولین ورود عوض شود.
3. داده‌های قبلی: در «کنترل پروژه ← تأخیرات ← درخواست‌ها و پاسخ» دکمه‌ی «ورود از اکسل فرم مایکروسافت»؛ فایل‌های MSP از «بارگذاری».

## به‌روزرسانی
- نصب از گیت‌هاب: هر ۱۰ دقیقه سرور خودش تغییرات مخزن را می‌گیرد (`danimor-update.timer`). کاری لازم نیست.
- نصب از zip: zip تازه را بگذارید و همان دستور نصب را دوباره بزنید؛ داده‌ها دست نمی‌خورند.

## بررسی و عیب‌یابی
```
systemctl status danimor-hub        # هاب روشن است؟
journalctl -u danimor-hub -n 50     # آخرین خطاها
curl -s http://127.0.0.1:8787/api/v1/health
ls -la /var/lib/danimor/backups     # پشتیبان‌ها
```

## آزمون‌ها (روی هر کامپیوتر با Python و Node)
```
python3 hub/tests/test_hub.py && python3 hub/tests/test_perf.py && node hub/tests/sdk_test.js
node hub/tests/e2e_bridge.js        # سرتاسری، نیاز به Playwright
```

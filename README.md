# Danimor Platform

یک دامین، چند سایت: `/` (لوگو) · `/msp-bi/` (کنترل پروژه) · `/aide/` (تقویم منشی) · `/admin/` (مرکز کنترل) · `/api/` (هاب).

- برنامه‌ی کامل: [docs/PLAN-fa.md](docs/PLAN-fa.md)
- هاست و راه‌اندازی: [docs/HOSTING-fa.md](docs/HOSTING-fa.md)
- اتصال Aide: [docs/AIDE-CONTRACT-fa.md](docs/AIDE-CONTRACT-fa.md)

https://danialmor.github.io/TSUBA- 
https://danialmor.github.io/TSUBA/admin -
https://danialmor.github.io/TSUBA/msp-bi -
https://danialmor.github.io/TSUBA/aide -
/
## ساختار
```
index.html            صفحه‌ی اول (لوگوی متحرک، بدون لینک)
msp-bi/               سایت کنترل پروژه و داشبورد
aide/                 نقطه‌ی اتصال Aide
admin/                مرکز کنترل
shared/sdk.js         SDK مشترک (ورود، صف آفلاین، همگام‌سازی)
hub/server.py         بک‌اند (فقط کتابخانه‌ی استاندارد پایتون)
hub/deploy/           Caddy، systemd، پشتیبان، راه‌اندازی سرور
hub/tests/            آزمون‌ها
.github/workflows/    deploy (آزمون ← استقرار)، unpack-bundle
```

## اجرای محلی برای آزمون
```
cd hub && HUB_DATA_DIR=/tmp/hubdata HUB_STATIC_DIR=.. python3 server.py init   # رمز اولیه‌ی admin
HUB_DATA_DIR=/tmp/hubdata HUB_STATIC_DIR=.. python3 server.py                  # http://127.0.0.1:8787
python3 hub/tests/test_hub.py && node hub/tests/sdk_test.js
```

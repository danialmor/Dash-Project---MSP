# Architecture

## 1. Overview
```
                 https://<domain>/            (Caddy: TLS, static files, reverse proxy)
   ┌──────────────┬───────────────┬──────────────┬──────────────┐
   /  (landing)   /msp-bi/         /admin/        /aide/          ← static sites (HTML/JS)
                      │ hub-bridge.js    │ login+panel   │ sdk.js
                      └──────────────────┴───────┬───────┘
                                       /api/v1/*  (same origin)
                                   ┌─────────────▼─────────────┐
                                   │  Danimor Hub (core)        │  hub/server.py, 127.0.0.1:8787
                                   │  Identity · Permissions    │
                                   │  Subscriptions (tenants)   │
                                   │  Records (CAS, versioned)  │
                                   │  Module registry           │
                                   │  Event bus + relations     │  ← Smart Integration Layer
                                   │  AI gateway (Ollama)       │
                                   └─────────────┬─────────────┘
                                         SQLite (WAL) /var/lib/danimor/hub.sqlite3
                                         nightly backups /var/lib/danimor/backups (30 kept)
```
One VPS (Ubuntu 24.04), one domain, path-based sites. Shared hosting is not supported (needs a running Python process).

## 2. Ecosystem modules (registry seeded in `hub/server.py` → `MODULES`)
| slug | Persian name | status | path | access via site grant |
|---|---|---|---|---|
| project-control | کنترل پروژه | live | /msp-bi/ | msp-bi |
| training | آموزش | planned | – | – |
| messenger | مسنجر مستقل | live (inside msp-bi) | /msp-bi/ | msp-bi |
| users-panel | کنترل پنل کاربران | live | /admin/ | admin |
| executive-desk | مدیرعامل و منشی | live (separate app, see Aide) | /aide/ | aide |
| mail | نامه‌نگاری و ایمیل | live (inside msp-bi) | /msp-bi/ | msp-bi |
| file-manager | فایل منیجر | live (inside msp-bi) | /msp-bi/ | msp-bi |
| portfolio | پرتفولیو | planned | – | – |
| shared-cursor | موس مشترک | planned | – | – |
| designer | صفحه طراح | planned | – | – |
| crm | مشتریان | planned | – | – |
| company-space | فضای اختصاصی شرکت | planned | – | – |

A head-office user can use a module when they are `admin` or hold a grant for the module's `site`. A subscription user can use a module when it is in the subscription and in the user's own module list (section 6). Planned modules have no site yet.
To add/activate a module: `POST /api/v1/admin/modules` or the "ماژول‌ها" tab of the control panel. The landing page currently has its own static copy of this list (`index.html`, array `M`); switching it to `GET /api/v1/modules` is a listed next step.

## 3. Data model (SQLite)
| table | purpose |
|---|---|
| users | id, code (login, case-insensitive), name, role (admin/owner/manager/member/viewer/service), scrypt PIN hash+salt, active, tv (token version for revocation), meta.mc (must change PIN) |
| users (tenancy columns) | tenant_id, level (1 = highest), parent_id, ucode (personal code `T001-0002`), home (module to open after login), mods[], profile{phone,email,title} |
| sites | slug, title, path, active, kind |
| grants | (user_id, site) → role (head-office users only; subscription users get grants from their subscription) |
| records | (site, coll, id) → JSON data, rev (optimistic concurrency), deleted, updated, updated_by |
| changes | append-only change feed (seq) per site/coll — used for live updates |
| ops | idempotency: op_id → stored result (30-day retention) |
| audit | login, writes, admin actions (1-year retention) |
| clients | device health: last seen, pending, conflicts |
| fails | login lockout (5 failures / 10 min per IP+code) |
| **modules** | ecosystem module registry |
| **events** | integration event bus: module, type (e.g. `delay.requested`, `data.updated`), entity, entity_id, project, actor, payload JSON, tenant |
| **relations** | cross-module links: (a_module, a_type, a_id) —rel→ (b_module, b_type, b_id), unique (ids prefixed with the tenant code for subscription users) |
| **tenants** | subscriptions' companies: code `T001…`, name, status active/suspended, level names (max 10), contact |
| **subscriptions** | history per tenant (latest row is current): plan, modules[], seats, max_levels (1–10), starts, ends, status, price |
| **signups** | public subscription requests from the login page |

## 4. API reference (`/api/v1`, JSON, `Authorization: Bearer <token>`)
Auth & identity
- `GET /health` (public) → version, test_mode
- `POST /auth/login {code, pin, device, remember}` → token (30 days, or 1 day when `remember:false`) + session (see section 6)
- `POST /auth/change-pin {old, new}` · `GET /me` · `PATCH /me/profile`
Records (per site, versioned)
- `GET /data/{site}/{coll}` snapshot; `?limit=&after=` paging; `?since=seq` change feed. ETag/304 supported.
- `GET /data/{site}/{coll}/{id}` single record
- `PUT|DELETE /data/{site}/{coll}/{id} {data, base_rev, op_id}` → 409 with current value on conflict
- `POST /sync/batch {ops:[…]}` up to 200 ops
- `GET /stream?site=&coll=` server-sent change notifications
Ecosystem core
- `GET /modules` (public; with token adds `access` per module)
- `POST /events {module, type, entity, entity_id, project, payload}` (write access to the module required)
- `GET /events?since=&module=&project=&type=prefix.*&limit=` (only modules the user can read, only own subscription)
- `POST /relations {a:{module,type,id}, b:{module,type,id}, rel}` · `GET /relations?module=&type=&id=`
Directory & AI
- `GET /sites` · `GET /directory?site=` · `POST /ai` · `POST /ai/stream` (SSE; Ollama on the same server, optional)
Admin (ecosystem admin: role admin without tenant)
- `GET /admin/stats|audit|clients|users|sites|export` · `POST /admin/users|sites|modules|backup|service-keys` · `PATCH /admin/users/{id}` · `POST /admin/users/{id}/reset-pin`
- Subscriptions: see section 6.

## 5. How the Project Control dashboard (msp-bi) talks to the hub
`msp-bi/index.html` is one large single-file app (historically built as a standalone/offline dashboard).
- A small **startup loader** at the top decides the mode:
  - **local mode** (file://, claude.ai preview, GitHub Pages, or `/api/v1/health` returns 404): the app runs as before with browser storage and an optional built-in **simulation** dataset.
  - **hub mode** (the host answers `/api/v1/health`): loads `hub-bridge.js`.
- `hub-bridge.js` (≈20 KB, can be updated independently):
  1. shows the login screen (skipped when a valid `hub.token` exists, e.g. after login at `/admin/`); 2. wipes the browser working copy; 3. downloads collection `kv` (shared) and `u-<userId>` (per-user UI settings) from site `msp-bi`; 4. fills IndexedDB `dashdb/kv` and selected localStorage keys; 5. starts the app (the main script is stored as `<script type="text/plain" id="appMain">`).
  - It intercepts `IDBObjectStore.put/delete` (store `kv`) and `localStorage.setItem/removeItem` for known keys and sends every change to the hub within ~0.7 s.
  - Conflicts (HTTP 409): fetch server value, merge arrays by `id` (local wins on the same id), retry. Values > 380 000 chars are split into chunk records `<id>__c<n>`. Blobs/Files are base64-encoded.
  - After each save it publishes `data.updated` to the event bus (module derived from the key).
  - Polls the change feed every 10 s and offers "show latest" when colleagues changed data. Logout wipes the working copy.
- Storage keys in the dashboard: IndexedDB `mobdata` (main object `MD`: delays `dl`, daily reports `dr`, pours, meetings, project pages `pj`, plan…), `letters` (formal letters), `files`/`dim`/`plf:*` (uploaded MS Project data), `att:*` (letter attachments), `dclog`; localStorage shared: `tlPins`, `wbsCols`, `wbsSnap`; per-user: `dashTiles2`, `dsTheme`, `simOn`, ….

## 6. Multi-tenancy (subscriptions) and the User Control Panel
Three kinds of people:
| who | how to recognise | where they land after login | what they manage |
|---|---|---|---|
| Ecosystem admin (Danial) | role `admin`, `tenant_id` NULL | `/admin/` console | all subscriptions, signup requests, module registry, head-office staff, system (backups, audit, devices) |
| Subscription admin | role `owner`, has `tenant_id` | `/admin/` panel | own users only: create/edit, up to `max_levels` (≤10) named levels, modules per user, home module, seats limit, reset passwords |
| Subscription user | role `member`/`viewer`, has `tenant_id` | their home module (e.g. `/msp-bi/`); **never the panel** | own profile only |

Rules enforced by the hub:
- **Data isolation:** every site's records of a subscription are stored under `site~<tenantCode>` (e.g. `msp-bi~T001`); events and relations carry the tenant too. Clients keep using the plain site name.
- A subscription user's access = subscription modules ∩ user's `mods`, only while the tenant is `active` and the subscription is `active` and not expired. Otherwise login returns `403 subscription-inactive` (the owner can still sign in to see the status).
- Seats count active users of the tenant including the owner. Levels must be within `1..max_levels`.
- Personal code `ucode` = `<tenantCode>-<NNNN>`; login accepts the username or the personal code.
- `remember: false` at login issues a 1-day token, otherwise 30 days. The token is stored as `hub.token` in localStorage and shared by every site on the domain, so after login at `/admin/` the user opens their module without a second login.

API:
- Public: `POST /signup {name, company, phone, email, note}` (5 per IP per hour).
- Session: `POST /auth/login` and `GET /me` return `{token, user, grants, tenant, ucode, level, modules, home, panel, profile}`; `PATCH /me/profile {name, phone, email, title}`.
- Ecosystem admin: `GET|POST /admin/tenants`, `GET|PATCH /admin/tenants/{id}`, `POST /admin/tenants/{id}/subscription`, `GET /admin/signups`, `PATCH /admin/signups/{id}`.
- Subscription admin: `GET /panel/overview`, `PUT /panel/levels {names}`, `GET|POST /panel/users`, `PATCH /panel/users/{id}`, `POST /panel/users/{id}/reset`.

UI: `admin/index.html` (single file, no dependencies) = unified login page (username or personal code, show password, remember 30 days, subscription request) + console/panel. The landing page has a "ورود" button to `/admin/`.

## 7. Security notes
- PINs: scrypt; lockout after 5 failures; tokens revocable by bumping `users.tv`; HTTPS by Caddy; hub listens on 127.0.0.1 only.
- **Test mode** (`test_mode:true` in `/etc/danimor/config.json`): default credentials `Admin`/`Admin123` without forced PIN change. Must be turned off before real data.
- The repository is public — no data, keys or user lists in git. Data and secrets live only in `/var/lib/danimor` on the server.

## 8. Deployment & updates
`hub/deploy/install.sh <domain|IP> [--zip file]` installs Python, Caddy, the hub service, nightly backups and the **auto-update timer** (`git pull` of `main` every 10 minutes, syntax check, restart hub only if `hub/` changed). Owner guide: `docs/DEPLOY-fa.md`.

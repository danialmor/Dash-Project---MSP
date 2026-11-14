# Status (last updated: 2026-11-14)

## Done and tested
| Area | State | Notes |
|---|---|---|
| Hub core (`hub/server.py`) | ✅ | Identity, permissions, versioned records, sync, change feed, admin, backups, AI gateway, ETag, paging. |
| Ecosystem core | ✅ | Module registry (12 modules), event bus, cross-module relations (`test_core.py`). |
| Dashboard ↔ hub (`msp-bi/hub-bridge.js`) | ✅ | Login, server-only persistence, merge on conflict, binary files, chunking, colleague notice, logout wipe (`e2e_bridge.js`). |
| Project Control dashboard (`msp-bi/index.html`, v3.51.0) | ✅ | 3.45–3.51: 15-project simulation on every page, theme contract (`docs/THEME-RULES.md`), efficiency and info tabs moved into the dashboard, new projects list, compact project page and headers, fixed "needs action" list. Home, dashboard (EVM tiles), project control (Gantt, WBS tree with gear menu, timeline with pinned/auto/changed rows, delays), projects page (portfolio + 13 detail tabs), letters with approval routes, messenger, planning, files, mobile role views, simulation center. |
| Delay reporting | ✅ | In-app form identical to the owner's Microsoft Form; requests-and-response view; Excel import of the Forms export (deduplicated). |
| Brand root (`shared/brand.js`) | ✅ | **TSUBA** name, logo (`assets/tsuba-emblem.svg`), taglines and the 12 platforms (Roman numeral, name, short description, colour, icon, link). Every page reads it; change the brand in this one file. Platforms are always shown as `I — Project Control` with the description in smaller text below. |
| Landing page (`index.html`) | ✅ | TSUBA ring of 12 platforms around the emblem, list of platforms, Sign in → `admin/`. All names/links come from the brand root. |
| GitHub Pages demo (`shared/demo.js`) | ✅ | On `*.github.io` (or `?demo=1`) the control panel runs against an in-browser simulated hub so it can be tried without a server: `Admin`, `owner`, `T001-0002`, all `Admin123`. Never active on a real server. |
| Subscriptions / multi-tenancy | ✅ | Tenants, subscription history, seats, up to 10 named levels, personal user codes, per-tenant data isolation, suspension/expiry, signup requests (`test_tenants.py`). |
| User Control Panel (`admin/index.html`) | ✅ | Blue design, TSUBA brand from the root. Unified login; ecosystem-admin console (overview, subscriptions, requests, modules, head-office staff, system, profile); subscription-admin panel (overview, users, levels, profile); users are redirected to their module (`e2e_panel.js`). |
| Panel 1.1 (`admin/extras.js`) | ✅ | Light violet / dark lime themes with a toggle; "needs your decision" card and notification bell; quick search (⌘K); permissions matrix (level × module: view / edit / approve); bulk user import from CSV; activity pages; account security (password strength, sign out everywhere, sign-in history); sales and payments for the ecosystem admin (price list, manual payments, printable invoice, renewal reminders) and "my subscription" with an upgrade request for owners. Hub endpoints: `POST /auth/logout-all`, `GET /me/activity`, `GET /panel/activity`. Plans and payments are stored in site `admin`, collections `plans` and `payments`. |
| Panel template 3.0 (`admin/panel.css`, `admin/fx.js`) | ✅ | One stylesheet replaces the three stacked style layers. Light: warm grey, white cards, black pill buttons, lime marks. Dark: the landing page's violet-black with lime. Motion: staggered page entrance, count-up tiles, button press and shine, dialog pop, toast, progress growth, animated checkbox; all off under `prefers-reduced-motion`. Menu icons. Phones get a bottom tab bar. All colours come from the tokens at the top of `panel.css`; extensions read the same tokens. |
| Site map (`admin/sitemap.js`) | ✅ | Ecosystem-admin only. Node map of the core, the 12 platforms, pages and data, built on Drawflow (MIT, vendored in `admin/lib/`). The owner writes a note per node and per relation, connects nodes, sets relation types (auth, data, event, file, link, planned); "خروجی متنی" exports everything as text. Stored in site `admin`, collection `sitemap`, record `main`. Admin-only tabs carry a ▲ mark in the menu. |
| Deployment | ✅ (dry-run only) | `install.sh` verified in a dry run; **never run on a real server yet**. |

## Not done / known limitations
1. **Not deployed.** The owner has no VPS yet. The repository was renamed to **`danialmor/TSUBA`**; GitHub Pages (`danialmor.github.io/TSUBA/`) shows the landing page, the control panel in demo mode and the dashboard in local mode.
2. **`msp-bi/index.html` is ~800 KB**, too large for the AI's GitHub connector. The owner uploads it manually (v3.51.0 is on GitHub since 2026-11-14). Sessions whose repository access includes push (`git push`) can commit it directly; the file connector cannot. Planned fix: split into modules (see next steps). The dashboard's own title/manifest still say "داشبورد پروژه‌ها"; only its login screen (in `hub-bridge.js`) reads the brand root.
3. Some dashboard parts still render **built-in sample data** regardless of the server: the WBS tree (`RAW`), legacy delay list (`DL`), project list fallback (`PJ`). They must be moved to server data.
4. Delay responses: anyone can respond during design phase (`DLR_ENFORCE=false`). Target: only CEO and deputies (open question: should the project manager keep this right?).
5. The mobile supervisor delay form still uses the old short form (not the full Microsoft-Form fields).
6. Projects page: files (renders/catalogs/plans) are stored as links only; no direct upload yet.
7. Aide (executive desk) still runs on Cloudflare Worker + D1 in repo `danialmor/aide`; it is not yet on the hub.
8. Subscriptions exist, but there is **no online payment** yet: the ecosystem admin creates/renews subscriptions manually. Users of a subscription cannot use Aide yet (Aide is a separate app).
9. When a module is used by a subscription user, the dashboard still shows its built-in sample data (see 3).
10. Tabler (MIT) is still downloaded by `install.sh` into `/vendor/tabler/` but the panel no longer uses it (owner preferred the blue design). Can be removed.
11. `msp-bi/index 2.html` on GitHub is a stray copy uploaded by hand; delete when convenient.
12. `.github/workflows/*` cannot be written by the AI connector (missing workflow permission); deployment does not depend on GitHub Actions.

## Next steps (priority order — continue from the top)
1. **Owner action:** buy a VPS (Ubuntu 24.04, root), run `install.sh`, create users, turn off `test_mode`.
2. **Split `msp-bi/index.html`** into small files (CSS + JS modules, build script producing the single-file preview) so changes can be committed directly.
3. **Replace built-in sample data** (RAW tree, DL, PJ) with server collections; import real MS Project files through the hub.
4. **One platform list:** the landing page and panel read `shared/brand.js`; the hub seeds its own copy (`MODULES` in `hub/server.py`). Keep both in sync, or let the hub read the brand root.
5. **Delay permissions:** enforce responders (CEO, deputies) via hub roles; decide on project manager.
6. **Emit domain events** from the dashboard (e.g. `delay.requested`, `delay.answered`, `letter.sent`) in addition to `data.updated`, and show cross-module relations (letter ↔ delay ↔ project).
7. **Aide migration** to the hub: A1 bridge (events only), then A2 full migration.
8. **Sales side of subscriptions:** price list per plan/seat, wallet + manual top-up, online payment gateway paying to the owner's account (country/currency still unknown), automatic renewal reminders before `ends`.
9. Build the planned modules: training, portfolio, shared cursor, designer workspace, CRM, company space.

/* حالت نمایشی برای گیت‌هاب (GitHub Pages)
   گیت‌هاب فقط فایل نمایش می‌دهد و سرور (هاب) ندارد. این فایل در همان حالت، پاسخ‌های هاب را داخل مرورگر شبیه‌سازی می‌کند
   تا بتوانید وارد شوید و کنترل پنل را ببینید. داده‌ها فقط در همین مرورگر می‌مانند.
   روی سرور واقعی هیچ کاری نمی‌کند (فقط روی *.github.io یا با ?demo=1 روشن می‌شود).
   ورود: Admin / Admin123 (مدیر اکوسیستم) · owner / Admin123 (مدیر اشتراک نمونه) · T001-0002 / Admin123 (کاربر) */
(function () {
  'use strict';
  var on = /\.github\.io$/.test(location.hostname) || /[?&]demo=1/.test(location.search);
  try { if (/[?&]demo=1/.test(location.search)) sessionStorage.setItem('tsuba.demo', '1'); if (sessionStorage.getItem('tsuba.demo') === '1') on = true } catch (e) { }
  if (!on) return;
  var KEY = 'tsuba.demo.v1', PIN = 'Admin123', B = window.BRAND, now = function () { return Date.now() / 1000 };
  function seed() {
    var t = now(), mods = B.platforms.map(function (p, i) { return { slug: p.slug, name_fa: p.fa, name_en: p.en, status: p.href ? 'live' : 'planned', path: p.href ? '/' + p.href.replace(B.base, '') : '', site: p.slug === 'executive-desk' ? 'aide' : (p.href ? 'msp-bi' : ''), color: p.color, icon: p.icon, ord: i, summary_en: p.desc_en } });
    return {
      seq: 10, modules: mods,
      tenants: [{ id: 1, code: 'T001', name: 'شرکت نمونه', status: 'active', levels: ['مدیرعامل', 'مدیر پروژه', 'سرپرست کارگاه'], contact: {} }],
      subs: [{ id: 1, tenant_id: 1, plan: 'حرفه‌ای', modules: ['project-control', 'messenger', 'mail', 'file-manager'], seats: 10, max_levels: 3, starts: t, ends: t + 300 * 86400, price: '', note: 'نمونه', created: t }],
      users: [
        { id: 1, code: 'Admin', name: 'مدیر اکوسیستم', role: 'admin', tenant_id: null, grants: { 'msp-bi': 'admin', aide: 'admin' }, pin: PIN, must_change: false, active: true, profile: {} },
        { id: 2, code: 'owner', name: 'مدیر شرکت نمونه', role: 'owner', tenant_id: 1, ucode: 'T001-0001', level: 1, mods: [], home: '', pin: PIN, must_change: false, active: true, profile: {} },
        { id: 3, code: 'site1', name: 'سرپرست نمونه', role: 'member', tenant_id: 1, ucode: 'T001-0002', level: 3, parent_id: 2, mods: ['project-control', 'mail'], home: 'project-control', pin: PIN, must_change: false, active: true, profile: {} }
      ],
      signups: [{ id: 1, ts: t - 3600, name: 'نمونه‌ی درخواست', company: 'شرکت آزمایشی', phone: '0912', email: '', note: 'کنترل پروژه برای ۵ نفر', status: 'new' }],
      audit: [{ ts: t, user: 'system', action: 'demo.seed', target: 'حالت نمایشی' }]
    };
  }
  var D; try { D = JSON.parse(localStorage.getItem(KEY)) } catch (e) { } if (!D) D = seed();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(D)) } catch (e) { } }
  function log(u, a, t) { D.audit.unshift({ ts: now(), user: u ? u.code : '-', action: a, target: t || '' }); D.audit = D.audit.slice(0, 200) }
  function E(st, err) { var e = { status: st, body: { error: err } }; throw e }
  var tn = function (id) { return D.tenants.filter(function (x) { return x.id === id })[0] };
  var sub = function (id) { return D.subs.filter(function (s) { return s.tenant_id === id }).sort(function (a, b) { return b.created - a.created })[0] || null };
  var active = function (t) { var s = sub(t.id); return t.status === 'active' && !!s && (!s.ends || s.ends > now()) };
  var usr = function (id) { return D.users.filter(function (u) { return u.id === id })[0] };
  var nextId = function (a) { return a.reduce(function (m, x) { return Math.max(m, x.id) }, 0) + 1 };
  function home(u) { if (u.role === 'admin' && !u.tenant_id || u.role === 'owner') return B.base + 'admin/'; var p = B.platform(u.home); return p && p.href ? p.href : B.base }
  function sess(u, tok) {
    var t = u.tenant_id ? tn(u.tenant_id) : null, s = t ? sub(t.id) : null;
    var r = { user: { id: u.id, code: u.code, name: u.name, role: u.role }, tenant: t ? { id: t.id, code: t.code, name: t.name } : null, ucode: u.ucode || '', home: home(u), panel: (u.role === 'admin' && !t) || u.role === 'owner', must_change: !!u.must_change, profile: u.profile || {}, modules: t ? (u.role === 'owner' ? (s ? s.modules : []) : u.mods) : null, grants: u.grants || (t ? { 'msp-bi': 'member' } : {}) };
    if (tok) r.token = tok; return r;
  }
  function me(h) { var m = /demo-(\d+)/.exec(h || ''); var u = m && usr(+m[1]); if (!u || !u.active) E(401, 'unauthorized'); return u }
  function tenantRow(t) { var o = D.users.filter(function (u) { return u.tenant_id === t.id && u.role === 'owner' })[0]; return { id: t.id, code: t.code, name: t.name, status: t.status, active: active(t), sub: sub(t.id), owner: o ? { name: o.name, code: o.code } : null, users: D.users.filter(function (u) { return u.tenant_id === t.id && u.active }).length } }
  function pub(u) { return { id: u.id, ucode: u.ucode, name: u.name, code: u.code, role: u.role, level: u.level, mods: u.mods || [], home: u.home, parent_id: u.parent_id || null, last_login: u.last_login || 0, active: u.active } }
  function newSub(tid, b) { var t = now(); D.subs.push({ id: nextId(D.subs), tenant_id: tid, plan: b.plan || '', modules: b.modules && b.modules.length ? b.modules : ['project-control'], seats: Math.max(1, +b.seats || 1), max_levels: Math.min(10, Math.max(1, +b.max_levels || 1)), starts: t, ends: +b.months ? t + b.months * 30 * 86400 : 0, price: b.price || '', note: b.note || '', created: t }) }
  function codeTaken(c) { c = String(c || '').toLowerCase(); return D.users.some(function (u) { return u.code.toLowerCase() === c || (u.ucode || '').toLowerCase() === c }) }
  function nextU(t) { var n = D.users.filter(function (u) { return u.tenant_id === t.id }).length + 1; return t.code + '-' + ('000' + n).slice(-4) }

  function route(m, p, b, h) {
    var x;
    if (p === '/health') return { ok: true, version: 'demo', test_mode: false, demo: true };
    if (p === '/modules') return { modules: D.modules };
    if (p === '/signup' && m === 'POST') { D.signups.unshift({ id: nextId(D.signups), ts: now(), name: b.name, company: b.company, phone: b.phone, email: b.email, note: b.note, status: 'new' }); return { ok: true } }
    if (p === '/auth/login') {
      var c = String(b.code || '').toLowerCase(), u = D.users.filter(function (u) { return u.code.toLowerCase() === c || (u.ucode || '').toLowerCase() === c })[0];
      if (!u || !u.active || u.pin !== b.pin) E(401, 'bad-credentials');
      if (u.tenant_id && u.role !== 'owner' && !active(tn(u.tenant_id))) E(403, 'subscription-inactive');
      u.last_login = now(); log(u, 'auth.login'); return sess(u, 'demo-' + u.id);
    }
    var U = me(h);
    if (p === '/me') return sess(U);
    if (p === '/me/profile') { if (b.name) U.name = b.name; U.profile = { title: b.title || '', phone: b.phone || '', email: b.email || '' }; return sess(U) }
    if (p === '/auth/change-pin') { if (b.old !== U.pin) E(401, 'bad-credentials'); if (String(b.new || '').length < 8 || b.new === b.old) E(400, 'weak-pin'); U.pin = b.new; U.must_change = false; return { token: 'demo-' + U.id } }
    if (p.indexOf('/admin/') === 0) {
      if (!(U.role === 'admin' && !U.tenant_id)) E(403, 'forbidden');
      if (p === '/admin/tenants' && m === 'GET') return { tenants: D.tenants.map(tenantRow) };
      if (p === '/admin/tenants' && m === 'POST') {
        if (!b.name || !b.owner || !b.owner.username) E(400, 'invalid'); if (codeTaken(b.owner.username)) E(409, 'code-exists');
        var t = { id: nextId(D.tenants), code: 'T' + ('00' + (D.tenants.length + 1)).slice(-3), name: b.name, status: 'active', levels: [], contact: b.contact || {} }; D.tenants.push(t); newSub(t.id, b);
        var pw = b.owner.password || PIN, o = { id: nextId(D.users), code: b.owner.username, name: b.owner.name, role: 'owner', tenant_id: t.id, ucode: t.code + '-0001', level: 1, mods: [], home: '', pin: pw, must_change: true, active: true, profile: {} }; D.users.push(o);
        log(U, 'tenant.create', t.code); return { code: t.code, owner: { username: o.code, ucode: o.ucode, password: pw } };
      }
      if ((x = /^\/admin\/tenants\/(\d+)(\/subscription)?$/.exec(p))) {
        var T = tn(+x[1]); if (!T) E(404, 'not-found');
        if (x[2]) { newSub(T.id, b); log(U, 'tenant.subscription', T.code); return { ok: true } }
        if (m === 'PATCH') { T.status = b.status === 'suspended' ? 'suspended' : 'active'; log(U, 'tenant.status', T.code); return { ok: true } }
        return { tenant: T, active: active(T), subs: D.subs.filter(function (s) { return s.tenant_id === T.id }).sort(function (a, b) { return b.created - a.created }), users: D.users.filter(function (u) { return u.tenant_id === T.id }).map(pub) };
      }
      if (p === '/admin/stats') return { users: D.users.filter(function (u) { return !u.tenant_id }).length, db_kb: Math.round(JSON.stringify(D).length / 1024), logins24h: D.audit.filter(function (a) { return a.action === 'auth.login' && a.ts > now() - 86400 }).length, failed24h: 0, changes24h: 0, last_backup: 0, version: 'demo', ai: false };
      if (p === '/admin/signups') return { items: D.signups };
      if ((x = /^\/admin\/signups\/(\d+)$/.exec(p))) { D.signups.forEach(function (s) { if (s.id === +x[1]) s.status = b.status }); return { ok: true } }
      if (p === '/admin/modules') { D.modules.forEach(function (md) { if (md.slug === b.slug) { md.status = b.status; md.path = b.path; md.site = b.site } }); return { ok: true } }
      if (p === '/admin/users' && m === 'GET') return { users: D.users.filter(function (u) { return !u.tenant_id }).map(function (u) { return { id: u.id, name: u.name, code: u.code, role: u.role, grants: u.grants || {}, last_login: u.last_login || 0, active: u.active } }) };
      if (p === '/admin/users' && m === 'POST') { if (!b.code || !b.name) E(400, 'invalid'); if (codeTaken(b.code)) E(409, 'code-exists'); D.users.push({ id: nextId(D.users), code: b.code, name: b.name, role: b.role || 'member', tenant_id: null, grants: b.grants || {}, pin: PIN, must_change: true, active: true, profile: {} }); return { code: b.code, pin: PIN } }
      if ((x = /^\/admin\/users\/(\d+)(\/reset-pin)?$/.exec(p))) { var V = usr(+x[1]); if (!V) E(404, 'not-found'); if (x[2]) { V.pin = PIN; V.must_change = true; return { pin: PIN } } if ('active' in b) V.active = !!b.active; return { ok: true } }
      if (p.indexOf('/admin/audit') === 0) return { items: D.audit.slice(0, 40) };
      if (p === '/admin/clients') return { items: [] };
      if (p === '/admin/backup') return { file: 'در حالت نمایشی پشتیبان ساخته نمی‌شود' };
      if (p === '/admin/export') return D;
    }
    if (p.indexOf('/panel/') === 0) {
      if (U.role !== 'owner') E(403, 'forbidden'); var t2 = tn(U.tenant_id), s2 = sub(t2.id) || { modules: [], seats: 0, max_levels: 1 };
      var inT = function (u) { return u.tenant_id === t2.id };
      if (p === '/panel/overview') return { tenant: { name: t2.name, code: t2.code, levels: t2.levels }, sub: s2, used: D.users.filter(function (u) { return inT(u) && u.active }).length, active: active(t2), modules: D.modules.filter(function (md) { return s2.modules.indexOf(md.slug) >= 0 }) };
      if (p === '/panel/users' && m === 'GET') return { users: D.users.filter(inT).map(pub) };
      if (p === '/panel/levels') { t2.levels = (b.names || []).slice(0, s2.max_levels); return { ok: true } }
      var chk = function () { if (!b.mods || !b.mods.length) E(400, 'no-modules'); if (b.level < 1 || b.level > s2.max_levels) E(400, 'level-out-of-range'); b.mods = b.mods.filter(function (s) { return s2.modules.indexOf(s) >= 0 }) };
      if (p === '/panel/users' && m === 'POST') {
        chk(); if (D.users.filter(function (u) { return inT(u) && u.active }).length >= s2.seats) E(409, 'no-seats'); if (!b.username) E(400, 'invalid'); if (codeTaken(b.username)) E(409, 'code-exists');
        var pw2 = b.password || PIN, n = { id: nextId(D.users), code: b.username, name: b.name, role: b.readonly ? 'viewer' : 'member', tenant_id: t2.id, ucode: nextU(t2), level: b.level, parent_id: b.parent_id, mods: b.mods, home: b.home || b.mods[0], pin: pw2, must_change: true, active: true, profile: {} }; D.users.push(n);
        log(U, 'panel.user.create', n.ucode); return { ucode: n.ucode, username: n.code, password: pw2 };
      }
      if ((x = /^\/panel\/users\/(\d+)(\/reset)?$/.exec(p))) {
        var W = usr(+x[1]); if (!W || W.tenant_id !== t2.id) E(404, 'not-found'); if (W.role === 'owner') E(403, 'owner-locked');
        if (x[2]) { W.pin = PIN; W.must_change = true; return { password: PIN } }
        chk(); W.name = b.name; W.level = b.level; W.mods = b.mods; W.home = b.home; W.parent_id = b.parent_id; W.role = b.readonly ? 'viewer' : 'member'; if ('active' in b) W.active = !!b.active; return { ok: true };
      }
    }
    E(404, 'not-found');
  }
  var of = window.fetch.bind(window);
  window.fetch = function (url, o) {
    var s = String(url && url.url || url), i = s.indexOf('/api/v1/');
    if (i < 0) return of(url, o);
    o = o || {}; var m = (o.method || 'GET').toUpperCase(), path = s.slice(i + 7).split('?')[0], body = {}, h = (o.headers && (o.headers.Authorization || o.headers.authorization)) || '';
    try { if (o.body) body = JSON.parse(o.body) } catch (e) { }
    var st = 200, out;
    try { out = route(m, path, body, h); save() } catch (e) { st = e.status || 500; out = e.body || { error: String(e && e.message || e) } }
    return new Promise(function (res) { setTimeout(function () { res(new Response(JSON.stringify(out), { status: st, headers: { 'Content-Type': 'application/json' } })) }, 120) });
  };
  /* نوار «حالت نمایشی» با دکمه‌ی پاک کردن داده‌ها */
  function bar() {
    if (document.getElementById('demoBar')) return; var d = document.createElement('div'); d.id = 'demoBar'; d.setAttribute('role', 'note');
    d.style.cssText = 'position:fixed;top:calc(8px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:100000;background:#f2b640;color:#1a1408;font:600 12px Vazirmatn,Tahoma,sans-serif;direction:rtl;border-radius:99px;padding:5px 8px 5px 14px;display:flex;gap:10px;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.35)';
    d.innerHTML = '<span>حالت نمایشی گیت‌هاب: داده‌ها فقط در همین مرورگر</span><button type="button" style="border:0;border-radius:99px;background:#1a1408;color:#fff;font:inherit;padding:3px 10px;cursor:pointer">شروع دوباره</button>';
    d.querySelector('button').onclick = function () { if (!confirm('داده‌های نمایشی پاک و از نو ساخته شوند؟')) return; try { localStorage.removeItem(KEY); localStorage.removeItem('hub.token') } catch (e) { } location.reload() };
    document.body.appendChild(d);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bar); else bar();
})();

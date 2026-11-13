/* TSUBA · IV — کنترل پنل کاربران · افزونه‌ی 1.1
   دسترسی‌ها، «نیاز به تصمیم شما» و اعلان‌ها، جست‌وجوی سریع، ورود گروهی کاربران، فعالیت‌ها،
   امنیت حساب، فروش اشتراک و پرداخت‌ها. فقط از توابع پنل اصلی (api, head, openDlg, …) استفاده می‌کند. */
(function () {
  'use strict';
  var P = window.TSP; if (!P) return;
  var api = P.api, head = P.head, openDlg = P.openDlg, closeDlg = P.closeDlg, go = P.go, esc = P.esc, emsg = P.emsg, toast = P.toast, isAdmin = P.isAdmin, modName = P.modName, lvName = P.lvName, logout = P.logout, fa = P.fa, fmtD = P.fmtD, $ = P.$, $$ = P.$$, NAV_ADMIN = P.NAV_ADMIN, NAV_OWNER = P.NAV_OWNER, A = P.A, O = P.O;
  var N = function (n) { return typeof fa === 'function' ? fa(n) : String(n) };
  var D = function (ts) { return typeof fmtD === 'function' ? fmtD(ts) : new Date(ts * 1000).toLocaleDateString('fa-IR') };
  var DL = function (ends) { if (!ends) return null; return Math.ceil((ends - Date.now() / 1000) / 86400) };
  var ACT = { 'login': 'ورود', 'auth.login': 'ورود', 'login-fail': 'ورود ناموفق', 'logout-all': 'خروج از همه‌ی دستگاه‌ها', 'panel.perms': 'تغییر دسترسی‌ها', 'panel-user-create': 'ساخت کاربر', 'panel-user-update': 'ویرایش کاربر', 'panel-user-reset': 'بازنشانی رمز', 'tenant.create': 'ساخت اشتراک', 'change-pin': 'تغییر رمز' };
  var actName = function (a) { return ACT[a] || a };
  // ذخیره‌ی عمومی روی هاب (سایت admin): روی سرور واقعی با base_rev، در حالت نمایشی در مرورگر
  var store = {
    list: function (coll) { return api('GET', '/data/admin/' + coll).then(function (r) { return (r.items || []).filter(function (x) { return !x.deleted }) }) },
    put: function (coll, id, data) { return api('GET', '/data/admin/' + coll + '/' + id).then(function (r) { return r.rev || 0 }, function () { return 0 }).then(function (rev) { return api('PUT', '/data/admin/' + coll + '/' + id, { data: data, base_rev: rev, op_id: 'p' + Date.now() + Math.random().toString(36).slice(2, 7) }) }) },
    del: function (coll, id) { return api('GET', '/data/admin/' + coll + '/' + id).then(function (r) { return api('DELETE', '/data/admin/' + coll + '/' + id, { base_rev: r.rev || 0 }) }) }
  };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) };
  var money = function (v) { return Math.round(+v || 0).toLocaleString('fa-IR') + ' تومان' };

  /* ═════════ ۱. نیاز به تصمیم شما + اعلان‌ها ═════════ */
  function decisions() {
    if (isAdmin()) return Promise.all([api('GET', '/admin/signups'), api('GET', '/admin/tenants'), api('GET', '/admin/audit?limit=200').catch(function () { return { items: [] } })]).then(function (r) {
      var L = [], day = Date.now() / 1000 - 86400;
      (r[0].items || []).filter(function (s) { return s.status === 'new' }).forEach(function (s) { L.push({ k: 'su' + s.id, ic: '📝', t: 'درخواست اشتراک: ' + (s.company || s.name), d: (s.name || '') + (s.phone ? ' · ' + s.phone : '') + ' · ' + D(s.ts), go: 'signups', lv: 'warn' }) });
      (r[1].tenants || []).forEach(function (t) {
        var s = t.sub || t, d = DL(s.ends);
        if (t.status === 'suspended') L.push({ k: 'ts' + t.id, ic: '⏸', t: 'اشتراک معلق: ' + t.name, d: 'کد ' + t.code, go: 'tenants', lv: 'bad' });
        else if (d !== null && d < 0) L.push({ k: 'te' + t.id, ic: '⛔', t: 'اشتراک تمام شده: ' + t.name, d: N(-d) + ' روز پیش', go: 'billing', lv: 'bad' });
        else if (d !== null && d <= 30) L.push({ k: 'tn' + t.id, ic: '⏳', t: 'تمدید نزدیک: ' + t.name, d: N(d) + ' روز مانده', go: 'billing', lv: 'warn' });
        var used = t.used != null ? t.used : t.users, seats = s.seats; if (seats && used >= seats) L.push({ k: 'tf' + t.id, ic: '👥', t: 'ظرفیت کاربران پر: ' + t.name, d: N(used) + ' از ' + N(seats), go: 'tenants', lv: 'warn' });
      });
      var fails = (r[2].items || []).filter(function (a) { return a.action === 'login-fail' && a.ts > day });
      if (fails.length >= 3) L.push({ k: 'lf' + Math.floor(day / 86400), ic: '🔐', t: N(fails.length) + ' ورود ناموفق در ۲۴ ساعت گذشته', d: 'بیشترین: ' + topOf(fails.map(function (a) { return a.user })), go: 'security', lv: 'bad' });
      return L;
    });
    return Promise.all([api('GET', '/panel/overview'), api('GET', '/panel/users')]).then(function (r) {
      var o = r[0], L = [], d = DL(o.sub.ends);
      if (!o.active) L.push({ k: 'in', ic: '⛔', t: 'اشتراک فعال نیست', d: 'کاربران نمی‌توانند وارد شوند؛ برای تمدید درخواست بدهید.', go: 'plan', lv: 'bad' });
      else if (d !== null && d <= 30) L.push({ k: 'ex' + o.sub.ends, ic: '⏳', t: 'اشتراک ' + N(d) + ' روز دیگر تمام می‌شود', d: 'برای تمدید درخواست بدهید.', go: 'plan', lv: 'warn' });
      if (o.sub.seats && o.used >= o.sub.seats) L.push({ k: 'full', ic: '👥', t: 'ظرفیت کاربران پر شده', d: N(o.used) + ' از ' + N(o.sub.seats) + '؛ برای کاربر بیشتر ارتقا بدهید.', go: 'plan', lv: 'warn' });
      var never = r[1].users.filter(function (u) { return u.active && !u.last_login && u.role !== 'owner' });
      if (never.length) L.push({ k: 'nv' + never.length, ic: '👤', t: N(never.length) + ' کاربر هنوز وارد نشده‌اند', d: never.slice(0, 3).map(function (u) { return u.name }).join('، '), go: 'users', lv: 'warn' });
      var lv = (o.tenant.levels || []).filter(Boolean).length; if (!lv) L.push({ k: 'lv', ic: '🏷', t: 'نام سطح‌ها تعیین نشده', d: 'سطح‌ها را نام‌گذاری کنید تا دسترسی‌ها روشن باشد.', go: 'levels', lv: 'warn' });
      return L;
    });
  }
  function topOf(a) { var c = {}, b = '', n = 0; a.forEach(function (x) { c[x] = (c[x] || 0) + 1; if (c[x] > n) { n = c[x]; b = x } }); return b + ' (' + N(n) + ')' }
  var seenK = 'tsuba.seen'; function seen() { try { return JSON.parse(localStorage.getItem(seenK) || '{}') } catch (e) { return {} } }
  function markSeen(k) { var s = seen(); s[k] = 1; try { localStorage.setItem(seenK, JSON.stringify(s)) } catch (e) { } }
  function decHtml(L, all) {
    var s = seen(), V = all ? L : L.filter(function (x) { return !s[x.k] });
    if (!V.length) return '<p class="empty">موردی نیست؛ همه‌چیز مرتب است.</p>';
    return '<div class="xdec">' + V.map(function (x) { return '<div class="xd ' + x.lv + (s[x.k] ? ' seen' : '') + '" data-k="' + esc(x.k) + '"><span class="xi">' + x.ic + '</span><div class="xt"><b>' + esc(x.t) + '</b><small>' + esc(x.d) + '</small></div><button class="btn s" type="button" data-xgo="' + x.go + '">بازبینی</button><button class="btn s" type="button" data-xok>دیدم</button></div>' }).join('') + '</div>';
  }
  function bindDec(root, L, rerender) {
    root.onclick = function (e) {
      var g = e.target.closest('[data-xgo]'), ok = e.target.closest('[data-xok]'); if (!g && !ok) return; var row = e.target.closest('.xd');
      markSeen(row.dataset.k); if (g) { closeDlg(); go(g.dataset.xgo) } else { rerender(); refreshBell() }
    };
  }
  function decCard() {
    return decisions().then(function (L) {
      var host = document.createElement('div'); host.className = 'card mb xdc'; var draw = function () { var s = seen(), n = L.filter(function (x) { return !s[x.k] }).length; host.innerHTML = '<h2>نیاز به تصمیم شما <span class="chip ' + (n ? 'warn' : 'ok') + '">' + N(n) + '</span></h2>' + decHtml(L); bindDec(host, L, draw) }; draw(); return host;
    });
  }
  function refreshBell() {
    var b = $('#xBell'); if (!b) return; decisions().then(function (L) { var s = seen(), n = L.filter(function (x) { return !s[x.k] }).length; b.querySelector('em').textContent = n ? N(n) : ''; b.classList.toggle('on', !!n) }).catch(function () { });
  }
  function openBell() {
    decisions().then(function (L) {
      openDlg('<div class="dl"><h2>اعلان‌ها</h2><div id="xbl"></div><div class="row" style="margin-top:12px"><button class="btn s" type="button" id="xall">همه را دیدم</button><span style="flex:1"></span><button class="btn" type="button" data-close>بستن</button></div></div>', function (d) {
        var draw = function () { $('#xbl').innerHTML = decHtml(L, true); bindDec($('#xbl'), L, draw) }; draw();
        $('#xall').onclick = function () { L.forEach(function (x) { markSeen(x.k) }); draw(); refreshBell() };
      });
    });
  }

  /* ═════════ ۲. جست‌وجوی سریع (⌘K) ═════════ */
  function palette() {
    var list = (isAdmin() ? NAV_ADMIN : NAV_OWNER).map(function (x) { return { ic: '↪', t: x[1], s: 'رفتن به صفحه', run: function () { go(x[0]) } } });
    if (isAdmin()) list.push({ ic: '＋', t: 'اشتراک تازه', s: 'کار سریع', run: function () { go('tenants'); setTimeout(function () { var b = document.querySelector('#pg [data-new],#pg #nt,#pg .head .btn.p'); b && b.click() }, 400) } });
    else list.push({ ic: '＋', t: 'کاربر تازه', s: 'کار سریع', run: function () { go('users'); setTimeout(function () { var b = document.querySelector('#pg .head .btn.p'); b && b.click() }, 400) } }, { ic: '⬆', t: 'ورود گروهی کاربران', s: 'کار سریع', run: function () { go('users'); setTimeout(importDlg, 400) } });
    var src = isAdmin() ? Promise.all([api('GET', '/admin/tenants'), api('GET', '/admin/users')]).then(function (r) {
      return (r[0].tenants || []).map(function (t) { return { ic: '🏢', t: t.name, s: t.code + ' · اشتراک', q: t.code, run: function () { go('tenants'); setTimeout(function () { var x = document.querySelector('#pg [data-id="' + t.id + '"]'); x && x.click() }, 450) } } }).concat((r[1].users || []).map(function (u) { return { ic: '👤', t: u.name, s: u.code + ' · دفتر مرکزی', q: u.code, run: function () { go('staff') } } }))
    }) : api('GET', '/panel/users').then(function (r) { return r.users.map(function (u) { return { ic: '👤', t: u.name, s: (u.ucode || '') + ' · ' + u.code, q: u.code + ' ' + u.ucode, run: function () { go('users') } } }) });
    openDlg('<div class="dl xpal"><input type="search" id="xq" placeholder="جست‌وجوی شرکت، کاربر، کد یا کار…" autocomplete="off" aria-label="جست‌وجو"><div id="xr" role="listbox"></div><small class="xh">↑ ↓ برای حرکت · Enter برای باز کردن · Esc برای بستن</small></div>', function () {
      var all = list, sel = 0, q = $('#xq'), out = $('#xr'), V = [];
      var draw = function () {
        var s = q.value.trim().toLowerCase(); V = all.filter(function (x) { return !s || (x.t + ' ' + x.s + ' ' + (x.q || '')).toLowerCase().indexOf(s) >= 0 }).slice(0, 12); if (sel >= V.length) sel = 0;
        out.innerHTML = V.length ? V.map(function (x, i) { return '<button type="button" role="option" class="xo' + (i === sel ? ' on' : '') + '" data-i="' + i + '" aria-selected="' + (i === sel) + '"><span>' + x.ic + '</span><b>' + esc(x.t) + '</b><small>' + esc(x.s) + '</small></button>' }).join('') : '<p class="empty">چیزی پیدا نشد.</p>';
      };
      var run = function (i) { var x = V[i]; if (!x) return; closeDlg(); x.run() };
      q.oninput = function () { sel = 0; draw() };
      q.onkeydown = function (e) { if (e.key === 'ArrowDown') { sel = Math.min(V.length - 1, sel + 1); draw(); e.preventDefault() } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault() } else if (e.key === 'Enter') { run(sel); e.preventDefault() } };
      out.onclick = function (e) { var b = e.target.closest('[data-i]'); if (b) run(+b.dataset.i) };
      draw(); setTimeout(function () { q.focus() }, 30);
      src.then(function (more) { all = list.concat(more); draw() }).catch(function () { });
    });
  }
  addEventListener('keydown', function (e) { if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K') && P.S && !$('#app').hidden) { e.preventDefault(); palette() } });

  /* ═════════ ۳. دسترسی‌ها (سطح × ماژول) ═════════ */
  function permsPage() {
    return api('GET', '/panel/perms').then(function (r) {
      var mx = r.max_levels, lv = function (n) { return (r.levels[n - 1] || ('سطح ' + N(n))) }, opt = function (cur, min) { var h = ''; for (var i = min || 1; i <= mx; i++)h += '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + (i === 1 ? 'فقط ' + esc(lv(1)) : 'سطح ۱ تا ' + esc(lv(i))) + '</option>'; return h };
      var R = [['view', 'دیدن'], ['edit', 'ویرایش'], ['approve', 'تأیید / پاسخ']];
      $('#pg').innerHTML = head('دسترسی‌ها', 'برای هر بخش بگویید تا کدام سطح می‌تواند ببیند، ویرایش کند و تأیید یا پاسخ بدهد. سطح ۱ بالاترین است؛ مدیر اشتراک همیشه همه‌ی حق‌ها را دارد.', '<button class="btn p" type="button" id="xps">ذخیره</button>')
        + '<div class="card"><div class="tw"><table class="tbl xperm"><thead><tr><th>بخش</th>' + R.map(function (x) { return '<th>' + x[1] + '</th>' }).join('') + '</tr></thead><tbody>'
        + r.modules.map(function (m) { var p = r.perms[m.slug] || {}; return '<tr data-m="' + m.slug + '"><td><b>' + esc(modName(m.slug)) + '</b></td>' + R.map(function (x) { return '<td><select data-r="' + x[0] + '" aria-label="' + x[1] + ' — ' + esc(modName(m.slug)) + '">' + opt(p[x[0]]) + '</select></td>' }).join('') + '</tr>' }).join('')
        + '</tbody></table></div><p class="xnote">نمونه: برای «I — کنترل پروژه» اگر «تأیید / پاسخ» را «فقط ' + esc(lv(1)) + '» بگذارید، فقط همان سطح به درخواست‌های تأخیر پاسخ می‌دهد. ویرایش هیچ‌وقت از دیدن بازتر نمی‌شود.</p></div>'
        + '<div class="card mb"><h2>نمای کلی سطح‌ها</h2><div class="xlv">' + Array.apply(null, Array(mx)).map(function (_, i) { var n = i + 1; return '<div><b>' + esc(lv(n)) + '</b>' + r.modules.map(function (m) { var p = r.perms[m.slug] || {}, t = []; if (n <= p.view) t.push('دیدن'); if (n <= p.edit) t.push('ویرایش'); if (n <= p.approve) t.push('تأیید'); return '<small>' + esc(modName(m.slug)) + ': ' + (t.length ? t.join('، ') : '—') + '</small>' }).join('') + '</div>' }).join('') + '</div></div>';
      $('#xps').onclick = function () {
        var out = {}; $$('#pg tr[data-m]').forEach(function (tr) { var o = {}; $$('select', tr).forEach(function (s) { o[s.dataset.r] = +s.value }); out[tr.dataset.m] = o });
        api('PUT', '/panel/perms', { perms: out }).then(function () { toast('دسترسی‌ها ذخیره شد.'); go('perms') }).catch(function (x) { toast(emsg(x)) });
      };
    });
  }

  /* ═════════ ۴. ورود گروهی کاربران و فعالیت‌ها ═════════ */
  function parseCSV(t) { return t.replace(/\r/g, '').split('\n').map(function (l) { return l.split(/[,;\t،]/).map(function (c) { return c.trim().replace(/^"|"$/g, '') }) }).filter(function (r) { return r.join('') }) }
  function importDlg() {
    Promise.all([api('GET', '/panel/overview')]).then(function (r) {
      var o = r[0], mods = o.modules.map(function (m) { return m.slug }), free = Math.max(0, o.sub.seats - o.used);
      openDlg('<div class="dl"><h2>ورود گروهی کاربران</h2><p class="xnote">در اکسل چهار ستون بسازید: <b>نام</b>، <b>نام کاربری</b> (لاتین)، <b>سطح</b> (عدد)، <b>رمز اولیه</b> (اختیاری). سپس «ذخیره به‌صورت CSV» کنید و فایل را این‌جا بدهید، یا ردیف‌ها را مستقیم بچسبانید. ظرفیت خالی: <b>' + N(free) + '</b> کاربر.</p>'
        + '<input type="file" id="xf" accept=".csv,.txt,text/csv"><textarea id="xt" rows="7" class="ltr" placeholder="Ali Ahmadi,ali_a,3,&#10;Sara Karimi,sara_k,2,Pass-1234"></textarea><div id="xpv"></div><p class="err" id="xer"></p>'
        + '<div class="row"><button class="btn p" type="button" id="xgo" disabled>ساخت کاربران</button><button class="btn" type="button" data-close>انصراف</button></div></div>', function () {
        var rows = [];
        var prev = function () {
          rows = parseCSV($('#xt').value).filter(function (r) { return !/^(نام|name)$/i.test(r[0]) }).map(function (r) { return { name: r[0], username: (r[1] || '').toLowerCase(), level: +r[2] || o.sub.max_levels, password: r[3] || undefined } });
          var bad = rows.filter(function (r) { return !r.name || !/^[a-z0-9_.-]{3,32}$/.test(r.username) || r.level < 1 || r.level > o.sub.max_levels });
          $('#xpv').innerHTML = rows.length ? '<div class="tw"><table class="tbl"><thead><tr><th>نام</th><th>نام کاربری</th><th>سطح</th><th></th></tr></thead><tbody>' + rows.slice(0, 50).map(function (r) { var ok = bad.indexOf(r) < 0; return '<tr><td>' + esc(r.name) + '</td><td class="mono">' + esc(r.username) + '</td><td>' + esc(lvName(r.level)) + '</td><td>' + (ok ? '<span class="chip ok">آماده</span>' : '<span class="chip bad">نادرست</span>') + '</td></tr>' }).join('') + '</tbody></table></div>' : '';
          $('#xer').textContent = rows.length > free ? 'تعداد ردیف‌ها (' + N(rows.length) + ') از ظرفیت خالی بیشتر است.' : (bad.length ? N(bad.length) + ' ردیف نادرست است (نام کاربری لاتین ۳ تا ۳۲ نویسه، سطح ۱ تا ' + N(o.sub.max_levels) + ').' : '');
          $('#xgo').disabled = !rows.length || !!bad.length || rows.length > free;
        };
        $('#xt').oninput = prev;
        $('#xf').onchange = function () { var f = this.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { $('#xt').value = rd.result; prev() }; rd.readAsText(f, 'utf-8') };
        $('#xgo').onclick = function () {
          var done = [], fail = [], i = 0; $('#xgo').disabled = true;
          var next = function () {
            if (i >= rows.length) { $('#dlg').innerHTML = '<div class="dl"><h2>نتیجه</h2><p>' + N(done.length) + ' کاربر ساخته شد' + (fail.length ? '، ' + N(fail.length) + ' ناموفق' : '') + '.</p>' + (done.length ? '<div class="tw"><table class="tbl"><thead><tr><th>نام</th><th>کد اختصاصی</th><th>رمز اولیه</th></tr></thead><tbody>' + done.map(function (d) { return '<tr><td>' + esc(d.name) + '</td><td class="mono">' + esc(d.ucode) + '</td><td class="mono">' + esc(d.password) + '</td></tr>' }).join('') + '</tbody></table></div><p class="xnote">این رمزها فقط همین یک بار نشان داده می‌شوند؛ هر کاربر در اولین ورود رمز خودش را می‌گذارد.</p>' : '') + (fail.length ? '<p class="err">' + fail.map(function (f) { return esc(f.username + ': ' + f.err) }).join('<br>') + '</p>' : '') + '<button class="btn" type="button" data-close>بستن</button></div>'; $$('#dlg [data-close]').forEach(function (b) { b.onclick = function () { closeDlg(); go('users') } }); return }
            var r = rows[i++]; api('POST', '/panel/users', { name: r.name, username: r.username, level: r.level, mods: mods, home: mods[0], password: r.password }).then(function (x) { done.push({ name: r.name, ucode: x.ucode, password: x.password }); next() }).catch(function (x) { fail.push({ username: r.username, err: emsg(x) }); next() });
          }; next();
        };
      });
    });
  }
  function activityPage() {
    var src = isAdmin() ? api('GET', '/admin/audit?limit=200') : api('GET', '/panel/activity');
    return src.then(function (r) {
      var it = r.items || [], who = {}; it.forEach(function (a) { who[a.user] = 1 });
      $('#pg').innerHTML = head('فعالیت‌ها', isAdmin() ? 'ورودها و کارهای همه‌ی کاربران اکوسیستم.' : 'ورودها و کارهای کاربران این اشتراک.', '<select id="xwho" aria-label="کاربر"><option value="">همه‌ی کاربران</option>' + Object.keys(who).map(function (u) { return '<option>' + esc(u) + '</option>' }).join('') + '</select>')
        + '<div class="card"><div class="tw"><table class="tbl"><thead><tr><th>زمان</th><th>کاربر</th><th>کار</th><th>مورد</th></tr></thead><tbody id="xab"></tbody></table></div></div>';
      var draw = function () { var w = $('#xwho').value, V = it.filter(function (a) { return !w || a.user === w }); $('#xab').innerHTML = V.length ? V.map(function (a) { return '<tr><td>' + esc(D(a.ts)) + '</td><td class="mono">' + esc(a.user) + '</td><td>' + (a.action === 'login-fail' ? '<span class="chip bad">' + esc(actName(a.action)) + '</span>' : esc(actName(a.action))) + '</td><td class="mono">' + esc(a.target || '') + '</td></tr>' }).join('') : '<tr><td colspan="4" class="empty">فعالیتی ثبت نشده.</td></tr>' };
      $('#xwho').onchange = draw; draw();
    });
  }

  /* ═════════ ۵. امنیت حساب ═════════ */
  function strength(p) { var s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++; return Math.min(4, s) }
  function securityPage() {
    return Promise.all([api('GET', '/me/activity').catch(function () { return { items: [] } }), isAdmin() ? api('GET', '/admin/clients').catch(function () { return { items: [] } }) : Promise.resolve({ items: [] })]).then(function (r) {
      var mine = r[0].items || [], ins = mine.filter(function (a) { return /login/.test(a.action) }).slice(0, 15), fails = mine.filter(function (a) { return a.action === 'login-fail' }).length;
      $('#pg').innerHTML = head('امنیت حساب', 'رمز، دستگاه‌ها و تاریخچه‌ی ورود شما.')
        + '<div class="g2"><div class="card"><h2>تغییر رمز</h2><form id="xpw" class="xg"><label class="f">رمز فعلی<input type="password" name="old" required autocomplete="current-password"></label><label class="f">رمز تازه<input type="password" name="new" required minlength="8" autocomplete="new-password"></label><div class="xbar" aria-hidden="true"><i></i><i></i><i></i><i></i></div><small id="xsl" class="xnote">دست‌کم ۸ نویسه؛ ترکیب حرف بزرگ و کوچک، عدد و نشانه امن‌تر است.</small><label class="f">تکرار رمز تازه<input type="password" name="rep" required autocomplete="new-password"></label><p class="err"></p><button class="btn p" type="submit">تغییر رمز</button></form></div>'
        + '<div class="card"><h2>دستگاه‌ها</h2><p class="xnote">اگر گوشی یا رایانه‌ای گم شده یا روی دستگاه دیگری وارد شده‌اید، از همه‌ی دستگاه‌ها خارج شوید. پس از آن باید دوباره وارد شوید.</p><button class="btn d" type="button" id="xlo">خروج از همه‌ی دستگاه‌ها</button>'
        + (isAdmin() && r[1].items.length ? '<h3 class="xh3">دستگاه‌های فعال اکوسیستم</h3><div class="tw"><table class="tbl"><thead><tr><th>کاربر</th><th>آخرین فعالیت</th><th>IP</th></tr></thead><tbody>' + r[1].items.slice(0, 15).map(function (c) { return '<tr><td class="mono">' + esc(c.user) + '</td><td>' + esc(D(c.last_seen)) + '</td><td class="mono">' + esc(c.ip || '') + '</td></tr>' }).join('') + '</tbody></table></div>' : '')
        + '<h3 class="xh3">قوانین رمز</h3><ul class="xul"><li>دست‌کم ۸ نویسه، متفاوت با نام کاربری و رمز قبلی</li><li>رمزهای ساده و رایج پذیرفته نمی‌شوند</li><li>پس از ۵ تلاش ناموفق، ۱۰ دقیقه قفل</li><li>کاربر تازه در اولین ورود باید رمز خودش را بگذارد</li></ul></div></div>'
        + '<div class="card mb"><h2>تاریخچه‌ی ورود ' + (fails ? '<span class="chip bad">' + N(fails) + ' ناموفق</span>' : '') + '</h2>' + (ins.length ? '<div class="tw"><table class="tbl"><thead><tr><th>زمان</th><th>نتیجه</th><th>دستگاه / IP</th></tr></thead><tbody>' + ins.map(function (a) { return '<tr><td>' + esc(D(a.ts)) + '</td><td>' + (a.action === 'login-fail' ? '<span class="chip bad">ناموفق</span>' : '<span class="chip ok">موفق</span>') + '</td><td class="mono">' + esc((a.target || '') + (a.ip ? ' · ' + a.ip : '')) + '</td></tr>' }).join('') + '</tbody></table></div>' : '<p class="empty">ورودی ثبت نشده.</p>') + '</div>';
      var f = $('#xpw'), bars = $$('.xbar i'), lab = ['خیلی ضعیف', 'ضعیف', 'متوسط', 'خوب', 'قوی'];
      f.new.oninput = function () { var s = strength(f.new.value); bars.forEach(function (b, i) { b.className = i < s ? 'on s' + s : '' }); $('#xsl').textContent = f.new.value ? 'قدرت رمز: ' + lab[s] : 'دست‌کم ۸ نویسه.' };
      f.onsubmit = function (e) {
        e.preventDefault(); var er = f.querySelector('.err'); if (f.new.value !== f.rep.value) { er.textContent = 'تکرار رمز یکسان نیست.'; return }
        api('POST', '/auth/change-pin', { old: f.old.value, new: f.new.value }).then(function (x) { if (x.token) { try { P.T = x.token; localStorage.setItem('hub.token', x.token) } catch (e) { } } toast('رمز تغییر کرد.'); f.reset() }).catch(function (x) { er.textContent = emsg(x) });
      };
      $('#xlo').onclick = function () { if (!confirm('از همه‌ی دستگاه‌ها خارج شوید؟ همین دستگاه هم خارج می‌شود.')) return; api('POST', '/auth/logout-all', {}).then(function () { toast('از همه‌ی دستگاه‌ها خارج شدید.'); setTimeout(logout, 600) }).catch(function (x) { toast(emsg(x)) }) };
    });
  }

  /* ═════════ ۶. فروش اشتراک و پرداخت (مدیر اکوسیستم) + اشتراک من (مدیر اشتراک) ═════════ */
  function billingPage() {
    return Promise.all([api('GET', '/admin/tenants'), store.list('plans').catch(function () { return [] }), store.list('payments').catch(function () { return [] })]).then(function (r) {
      var T = r[0].tenants || [], PL = r[1].map(function (x) { return Object.assign({ id: x.id }, x.data) }), Y = r[2].map(function (x) { return Object.assign({ id: x.id }, x.data) }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0) });
      var tName = function (id) { var t = T.filter(function (x) { return String(x.id) === String(id) })[0]; return t ? t.name + ' (' + t.code + ')' : '—' };
      var rem = T.map(function (t) { var s = t.sub || t; return { t: t, d: DL(s.ends), ends: s.ends } }).filter(function (x) { return x.d !== null && x.d <= 30 }).sort(function (a, b) { return a.d - b.d });
      var sum = Y.reduce(function (a, y) { return a + (+y.amount || 0) }, 0), m30 = Y.filter(function (y) { return y.ts > Date.now() / 1000 - 30 * 86400 }).reduce(function (a, y) { return a + (+y.amount || 0) }, 0);
      $('#pg').innerHTML = head('فروش و پرداخت', 'فهرست قیمت بسته‌ها، پرداخت‌های ثبت‌شده و یادآوری تمدید.', '<button class="btn" type="button" id="xnp">بسته‌ی تازه</button><button class="btn p" type="button" id="xny">ثبت پرداخت</button>')
        + '<div class="grid g4 mb"><div class="card kpi"><b>' + money(m30) + '</b><span>دریافتی ۳۰ روز اخیر</span></div><div class="card kpi"><b>' + money(sum) + '</b><span>کل دریافتی ثبت‌شده</span></div><div class="card kpi"><b>' + N(rem.length) + '</b><span>تمدید در ۳۰ روز آینده</span></div><div class="card kpi"><b>' + N(PL.length) + '</b><span>بسته در فهرست قیمت</span></div></div>'
        + '<div class="card mb"><h2>یادآوری تمدید</h2>' + (rem.length ? '<div class="tw"><table class="tbl"><thead><tr><th>اشتراک</th><th>پایان</th><th>مانده</th><th></th></tr></thead><tbody>' + rem.map(function (x) { return '<tr><td><b>' + esc(x.t.name) + '</b> <span class="mono">' + esc(x.t.code) + '</span></td><td>' + esc(D(x.ends)) + '</td><td>' + (x.d < 0 ? '<span class="chip bad">' + N(-x.d) + ' روز گذشته</span>' : '<span class="chip warn">' + N(x.d) + ' روز</span>') + '</td><td><button class="btn s" type="button" data-msg="' + x.t.id + '">پیام یادآوری</button></td></tr>' }).join('') + '</tbody></table></div>' : '<p class="empty">هیچ اشتراکی در ۳۰ روز آینده تمام نمی‌شود.</p>') + '</div>'
        + '<div class="card mb"><h2>فهرست قیمت بسته‌ها</h2>' + (PL.length ? '<div class="xplans">' + PL.map(function (p) { return '<div class="xplan"><b>' + esc(p.name) + '</b><strong>' + money(p.price) + '</strong><small>برای ' + N(p.months || 12) + ' ماه · ' + N(p.seats || 0) + ' کاربر · ' + N(p.levels || 1) + ' سطح</small><small>' + esc((p.mods || []).map(modName).join('، ')) + '</small><div class="row"><button class="btn s" type="button" data-ep="' + esc(p.id) + '">ویرایش</button><button class="btn s d" type="button" data-dp="' + esc(p.id) + '">حذف</button></div></div>' }).join('') + '</div>' : '<p class="empty">هنوز بسته‌ای تعریف نشده؛ «بسته‌ی تازه» را بزنید.</p>') + '</div>'
        + '<div class="card mb"><h2>پرداخت‌ها</h2>' + (Y.length ? '<div class="tw"><table class="tbl"><thead><tr><th>تاریخ</th><th>اشتراک</th><th>مبلغ</th><th>روش / شماره پیگیری</th><th>شرح</th><th></th></tr></thead><tbody>' + Y.map(function (y) { return '<tr><td>' + esc(D(y.ts)) + '</td><td>' + esc(tName(y.tenant)) + '</td><td><b>' + money(y.amount) + '</b></td><td>' + esc((y.method || '') + (y.ref ? ' · ' + y.ref : '')) + '</td><td>' + esc(y.note || '') + '</td><td><button class="btn s" type="button" data-inv="' + esc(y.id) + '">صورت‌حساب</button></td></tr>' }).join('') + '</tbody></table></div>' : '<p class="empty">پرداختی ثبت نشده.</p>') + '<p class="xnote">پرداخت آنلاین هنوز وصل نیست؛ پرداخت‌های کارت‌به‌کارت یا حضوری را این‌جا ثبت کنید تا سابقه و صورت‌حساب داشته باشید.</p></div>';
            var planDlg = function (p) {
        p = p || {}; api('GET', '/modules').then(function (mr) {
          var all = (mr.modules || []).filter(function (m) { return m.status !== 'planned' }).map(function (m) { return m.slug });
          openDlg('<div class="dl"><h2>' + (p.id ? 'ویرایش بسته' : 'بسته‌ی تازه') + '</h2><form class="xg"><label class="f">نام بسته<input name="name" required value="' + esc(p.name || '') + '" placeholder="مثلاً حرفه‌ای"></label><div class="g2"><label class="f">قیمت (تومان)<input name="price" type="number" min="0" required value="' + esc(p.price || '') + '"></label><label class="f">مدت (ماه)<input name="months" type="number" min="1" max="36" value="' + esc(p.months || 12) + '"></label><label class="f">تعداد کاربر<input name="seats" type="number" min="1" value="' + esc(p.seats || 10) + '"></label><label class="f">تعداد سطح<input name="levels" type="number" min="1" max="10" value="' + esc(p.levels || 3) + '"></label></div><fieldset class="xmods"><legend>بخش‌ها</legend>' + all.map(function (s) { return '<label><input type="checkbox" name="mods" value="' + s + '"' + ((p.mods || []).indexOf(s) >= 0 ? ' checked' : '') + '> ' + esc(modName(s)) + '</label>' }).join('') + '</fieldset><p class="err"></p><div class="row"><button class="btn p" type="submit">ذخیره</button><button class="btn" type="button" data-close>انصراف</button></div></form></div>', function (f) {
            f.onsubmit = function (e) { e.preventDefault(); var d = { name: f.name.value.trim(), price: +f.price.value, months: +f.months.value, seats: +f.seats.value, levels: +f.levels.value, mods: $$('input[name=mods]:checked', f).map(function (i) { return i.value }) }; store.put('plans', p.id || uid(), d).then(function () { closeDlg(); toast('بسته ذخیره شد.'); go('billing') }).catch(function (x) { f.querySelector('.err').textContent = emsg(x) }) };
          });
        });
      };
      $('#xnp').onclick = function () { planDlg() };
      $('#xny').onclick = function () {
        openDlg('<div class="dl"><h2>ثبت پرداخت</h2><form class="xg"><label class="f">اشتراک<select name="tenant" required>' + T.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name + ' (' + t.code + ')') + '</option>' }).join('') + '</select></label><div class="g2"><label class="f">مبلغ (تومان)<input name="amount" type="number" min="1" required></label><label class="f">روش<select name="method"><option>کارت‌به‌کارت</option><option>واریز بانکی</option><option>حضوری</option><option>درگاه آنلاین</option></select></label></div><label class="f">شماره پیگیری<input name="ref" class="ltr"></label><label class="f">شرح<input name="note" placeholder="مثلاً تمدید ۱۲ ماهه"></label>' + (PL.length ? '<label class="f">بسته (اختیاری)<select name="plan"><option value="">—</option>' + PL.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name + ' — ' + money(p.price)) + '</option>' }).join('') + '</select></label>' : '') + '<p class="err"></p><div class="row"><button class="btn p" type="submit">ثبت</button><button class="btn" type="button" data-close>انصراف</button></div></form></div>', function (f) {
          if (f.plan) f.plan.onchange = function () { var p = PL.filter(function (x) { return x.id === f.plan.value })[0]; if (p) { f.amount.value = p.price; f.note.value = 'بسته‌ی ' + p.name + ' — ' + N(p.months || 12) + ' ماه' } };
          f.onsubmit = function (e) { e.preventDefault(); var d = { tenant: f.tenant.value, amount: +f.amount.value, method: f.method.value, ref: f.ref.value.trim(), note: f.note.value.trim(), plan: f.plan ? f.plan.value : '', ts: Math.floor(Date.now() / 1000), by: P.S.user.code, no: Y.length + 1 }; store.put('payments', uid(), d).then(function () { closeDlg(); toast('پرداخت ثبت شد.'); go('billing') }).catch(function (x) { f.querySelector('.err').textContent = emsg(x) }) };
        });
      };
      $('#pg').onclick = function (e) {
        var b;
        if ((b = e.target.closest('[data-ep]'))) planDlg(PL.filter(function (p) { return p.id === b.dataset.ep })[0]);
        else if ((b = e.target.closest('[data-dp]'))) { if (confirm('این بسته حذف شود؟')) store.del('plans', b.dataset.dp).then(function () { go('billing') }) }
        else if ((b = e.target.closest('[data-msg]'))) { var t = T.filter(function (x) { return String(x.id) === b.dataset.msg })[0], s = t.sub || t, d = DL(s.ends), msg = 'سلام، اشتراک «' + t.name + '» در ' + BRAND.name + ' ' + (d < 0 ? N(-d) + ' روز است تمام شده' : N(d) + ' روز دیگر (' + D(s.ends) + ') تمام می‌شود') + '. برای تمدید با ما در تماس باشید.'; openDlg('<div class="dl"><h2>پیام یادآوری</h2><textarea rows="5" id="xmsg">' + esc(msg) + '</textarea><div class="row"><button class="btn p" type="button" id="xcp">رونوشت</button><button class="btn" type="button" data-close>بستن</button></div></div>', function () { $('#xcp').onclick = function () { var t2 = $('#xmsg'); t2.select(); try { navigator.clipboard.writeText(t2.value).then(function () { toast('رونوشت شد.') }) } catch (er) { document.execCommand('copy'); toast('رونوشت شد.') } } }) }
        else if ((b = e.target.closest('[data-inv]'))) invoice(Y.filter(function (y) { return y.id === b.dataset.inv })[0], tName);
      };
    });
  }
  function invoice(y, tName) {
    var w = window.open('', '_blank'); if (!w) { toast('اجازه‌ی باز شدن پنجره را بدهید.'); return }
    w.document.write('<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>صورت‌حساب ' + N(y.no || '') + '</title><style>body{font-family:Vazirmatn,Tahoma,sans-serif;padding:40px;color:#1d1640}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{border:1px solid #ddd;padding:10px;text-align:right}.t{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #6c3cf0;padding-bottom:12px}.m{color:#7a7396}</style></head><body><div class="t"><div><h1>' + esc(BRAND.name) + '</h1><span class="m">' + esc(BRAND.tagline_fa || '') + '</span></div><div><b>صورت‌حساب شماره ' + N(y.no || 1) + '</b><br><span class="m">' + esc(D(y.ts)) + '</span></div></div>'
      + '<p>مشتری: <b>' + esc(tName(y.tenant)) + '</b></p><table><tr><th>شرح</th><th>روش پرداخت</th><th>شماره پیگیری</th><th>مبلغ</th></tr><tr><td>' + esc(y.note || 'اشتراک') + '</td><td>' + esc(y.method || '') + '</td><td>' + esc(y.ref || '') + '</td><td><b>' + money(y.amount) + '</b></td></tr></table><p class="m">این صورت‌حساب پرداخت انجام‌شده را تأیید می‌کند.</p><script>print()<\/script></body></html>'); w.document.close();
  }
  function planPage() {
    return api('GET', '/panel/overview').then(function (o) {
      var s = o.sub, d = DL(s.ends);
      $('#pg').innerHTML = head('اشتراک من', 'بسته، ظرفیت و زمان پایان اشتراک شرکت شما.')
        + '<div class="grid g4 mb"><div class="card kpi"><b>' + esc(s.plan || '—') + '</b><span>بسته</span></div><div class="card kpi"><b>' + (d === null ? 'نامحدود' : (d < 0 ? 'تمام شده' : N(d) + ' روز')) + '</b><span>مانده تا پایان</span></div><div class="card kpi"><b>' + N(o.used) + ' از ' + N(s.seats) + '</b><span>کاربران</span></div><div class="card kpi"><b>' + N(s.max_levels) + '</b><span>سطح</span></div></div>'
        + '<div class="card mb"><h2>بخش‌های این اشتراک</h2><p>' + o.modules.map(function (m) { return '<span class="chip">' + esc(modName(m.slug)) + '</span>' }).join(' ') + '</p></div>'
        + '<div class="card mb"><h2>درخواست تمدید یا ارتقا</h2><form id="xup" class="xg"><label class="f">چه می‌خواهید؟<select name="kind"><option>تمدید با همین بسته</option><option>کاربر بیشتر</option><option>سطح بیشتر</option><option>بخش (ماژول) بیشتر</option><option>بسته‌ی بالاتر</option></select></label><label class="f">توضیح<textarea name="note" rows="3" placeholder="مثلاً ۱۰ کاربر بیشتر و بخش فایل منیجر"></textarea></label><label class="f">تلفن تماس<input name="phone" class="ltr" value="' + esc((P.S.profile && P.S.profile.phone) || '') + '"></label><p class="err"></p><button class="btn p" type="submit">ارسال درخواست</button></form></div>';
      var f = $('#xup');
      f.onsubmit = function (e) { e.preventDefault(); api('POST', '/signup', { name: P.S.user.name, company: o.tenant.name + ' (' + o.tenant.code + ')', phone: f.phone.value, email: (P.S.profile && P.S.profile.email) || '', note: '[' + f.kind.value + '] ' + f.note.value }).then(function () { toast('درخواست شما برای مدیر اکوسیستم فرستاده شد.'); f.reset() }).catch(function (x) { f.querySelector('.err').textContent = emsg(x) }) };
    });
  }

  /* ═════════ اتصال به پنل ═════════ */
  NAV_ADMIN.splice(NAV_ADMIN.length - 1, 0, ['billing', 'فروش و پرداخت'], ['activity', 'فعالیت‌ها'], ['security', 'امنیت حساب']);
  NAV_OWNER.splice(NAV_OWNER.length - 1, 0, ['perms', 'دسترسی‌ها'], ['activity', 'فعالیت‌ها'], ['plan', 'اشتراک من'], ['security', 'امنیت حساب']);
  A.billing = billingPage; A.activity = activityPage; A.security = securityPage;
  O.perms = permsPage; O.activity = activityPage; O.plan = planPage; O.security = securityPage;
  var wrapOv = function (M) { var f = M.overview; M.overview = function () { return f.apply(this, arguments).then(function (x) { return decCard().then(function (card) { var h = $('#pg .head'); if (h && h.parentNode) h.parentNode.insertBefore(card, h.nextSibling); refreshBell(); return x }).catch(function () { return x }) }) } };
  wrapOv(A); wrapOv(O);
  var u0 = O.users; O.users = function () { return u0.apply(this, arguments).then(function (x) { var r = $('#pg .head .row'); if (r && !$('#xim')) { var b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.id = 'xim'; b.textContent = 'ورود گروهی (اکسل / CSV)'; b.onclick = importDlg; r.insertBefore(b, r.firstChild) } return x }) };
  P.onNav = function () {
    var br = $('#nav .brand');
    if (br && !$('#xtools')) { var t = document.createElement('div'); t.id = 'xtools'; t.innerHTML = '<button type="button" class="xs" id="xSrch"><span>⌕ جست‌وجو</span><kbd>⌘K</kbd></button><button type="button" class="xb" id="xBell" aria-label="اعلان‌ها">🔔<em></em></button>'; br.parentNode.insertBefore(t, br.nextSibling); $('#xSrch').onclick = palette; $('#xBell').onclick = openBell; refreshBell() }
  };
  if (P.S && $('#nav .brand')) P.onNav();

  var css = document.createElement('style'); css.textContent = [
    '#xtools{display:flex;gap:6px;margin:0 0 8px}#xtools button{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;border-radius:11px;min-height:38px;cursor:pointer;font:inherit;font-size:13px}',
    '#xtools .xs{flex:1;display:flex;align-items:center;justify-content:space-between;padding:0 10px}#xtools kbd{font:11px ui-monospace,monospace;opacity:.7;border:1px solid rgba(255,255,255,.25);border-radius:6px;padding:0 5px}',
    '#xtools .xb{width:42px;position:relative}#xtools .xb em{position:absolute;top:-5px;left:-5px;min-width:18px;height:18px;border-radius:9px;background:var(--lime,#c6f432);color:#141a05;font:700 11px/18px Vazirmatn,sans-serif;font-style:normal;display:none}#xtools .xb.on em{display:block}',
    '.xdec{display:grid;gap:8px}.xd{display:grid;grid-template-columns:36px minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:14px;background:var(--card2)}.xd.seen{opacity:.55}',
    '.xd .xi{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:var(--card);font-size:17px}.xd.bad{border-inline-start:3px solid var(--bad)}.xd.warn{border-inline-start:3px solid var(--warn)}.xt b{display:block;font-size:14px}.xt small{color:var(--muted);font-size:12px}',
    '.xdc h2,.card h2{display:flex;align-items:center;gap:8px}',
    '.xpal{width:min(620px,92vw)}.xpal input{font-size:16px;min-height:48px}#xr{display:grid;gap:4px;margin:10px 0;max-height:52vh;overflow:auto}.xo{display:grid;grid-template-columns:28px 1fr auto;gap:8px;align-items:center;text-align:right;border:0;background:transparent;border-radius:10px;padding:9px 10px;cursor:pointer;font:inherit;color:var(--ink)}.xo.on,.xo:hover{background:var(--card2)}.xo small{color:var(--muted)}.xh{color:var(--muted);font-size:11px}',
    '.xperm select{min-height:36px;font-size:13px}.xnote{color:var(--muted);font-size:12.5px}.xlv{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}.xlv>div{border:1px solid var(--line);border-radius:12px;padding:10px;background:var(--card2)}.xlv small{display:block;color:var(--muted);font-size:12px}',
    '.g2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:14px}.xg{display:grid;gap:10px}.xh3{font-size:14px;margin:16px 0 8px}.xul{margin:0;padding-inline-start:18px;color:var(--muted);font-size:13px}',
    '.xbar{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.xbar i{height:5px;border-radius:3px;background:var(--line2)}.xbar i.on.s1{background:var(--bad)}.xbar i.on.s2{background:var(--warn)}.xbar i.on.s3,.xbar i.on.s4{background:var(--ok)}',
    '.xplans{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}.xplan{border:1px solid var(--line);border-radius:16px;padding:14px;background:var(--card2);display:grid;gap:4px}.xplan strong{font-size:20px}.xplan small{color:var(--muted);font-size:12px}',
    '.xmods{border:1px solid var(--line);border-radius:12px;display:flex;flex-wrap:wrap;gap:8px 14px;padding:10px}.xmods label{display:flex;gap:6px;align-items:center;font-size:13px}#xt{margin-top:8px;font-family:ui-monospace,monospace;font-size:13px}'
  ].join('\n'); document.head.appendChild(css);
})();

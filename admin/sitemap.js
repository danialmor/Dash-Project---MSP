/* IV — کنترل پنل کاربران · نقشه‌ی سایت (فقط مدیر اکوسیستم)
   نقشه‌ی زنده‌ی اکوسیستم: هسته، دوازده پلتفرم، صفحه‌ها و رابطه‌ی بین آن‌ها.
   بوم نقشه با کتابخانه‌ی متن‌باز Drawflow (MIT) ساخته می‌شود: admin/lib/drawflow.min.js
   ذخیره روی هاب: سایت admin، مجموعه‌ی sitemap، رکورد main. */
(function () {
  'use strict';
  var P = window.TSP; if (!P) return;
  var api = P.api, head = P.head, openDlg = P.openDlg, closeDlg = P.closeDlg, esc = P.esc, emsg = P.emsg, toast = P.toast, isAdmin = P.isAdmin, $ = P.$, $$ = P.$$, fa = P.fa;
  var HERE = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/[^\/]*$/, '') : '';
  var ed = null, MAP = null, sel = null, dirty = false, saveT = 0, loading = false;

  /* انواع رابطه و انواع گره */
  var REL = { auth: ['ورود و دسترسی', '#6c3cf0'], data: ['داده', '#0e9f6e'], event: ['رویداد و اعلان', '#f59e0b'], file: ['فایل', '#0ea5e9'], link: ['پیوند صفحه', '#94a3b8'], plan: ['برنامه‌ی آینده', '#e11d48'] };
  var KIND = { core: 'هسته', plat: 'پلتفرم', page: 'صفحه', data: 'داده', ext: 'سرویس بیرونی', role: 'نقش کاربر', note: 'یادداشت' };
  var STAT = { live: ['فعال', '#0e9f6e'], build: ['در دست ساخت', '#f59e0b'], planned: ['برنامه‌ریزی‌شده', '#94a3b8'] };
  var ICON = { core: '◆', page: '▭', data: '▤', ext: '☁', role: '☺', note: '✎' };

  function loadLib() {
    if (window.Drawflow) return Promise.resolve();
    return new Promise(function (res, rej) {
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = HERE + 'lib/drawflow.min.css'; document.head.appendChild(l);
      var s = document.createElement('script'); s.src = HERE + 'lib/drawflow.min.js'; s.onload = function () { res() }; s.onerror = function () { rej(new Error('lib')) }; document.head.appendChild(s);
    });
  }
  var store = {
    get: function () { return api('GET', '/data/admin/sitemap/main').then(function (r) { return r }, function () { return null }) },
    put: function (data) { return api('GET', '/data/admin/sitemap/main').then(function (r) { return r.rev || 0 }, function () { return 0 }).then(function (rev) { return api('PUT', '/data/admin/sitemap/main', { data: data, base_rev: rev, op_id: 'sm' + Date.now() }) }) }
  };

  /* ───── ظاهر یک گره ───── */
  function nodeHtml(d) {
    var st = STAT[d.status] || null, c = d.color || '#6c3cf0';
    return '<div class="smn k-' + d.kind + '" style="--c:' + esc(c) + '"><span class="smn-n">' + esc(d.n || ICON[d.kind] || '•') + '</span><div class="smn-t"><b>' + esc(d.title || '') + '</b><small>' + esc(d.sub || '') + '</small></div>'
      + (st ? '<i class="smn-s" style="background:' + st[1] + '" title="' + st[0] + '"></i>' : '') + (d.note ? '<em class="smn-m" title="توضیح دارد">✎</em>' : '') + '</div>';
  }
  function addNode(d, x, y) { var io = d.kind === 'note' ? 0 : 1; return ed.addNode(d.kind, io, io, x, y, 'k-' + d.kind, d, nodeHtml(d)) }
  function nodes() { return ed.drawflow.drawflow.Home.data }
  function redraw(id) { var n = nodes()[id]; if (!n) return; n.html = nodeHtml(n.data); var el = $('#node-' + id + ' .drawflow_content_node'); if (el) el.innerHTML = n.html }
  function relKey(o, i) { return o + '>' + i }
  function paint() {
    $$('#smCanvas .connection').forEach(function (el) {
      var m = /node_in_node-(\d+)/.exec(el.getAttribute('class')), o = /node_out_node-(\d+)/.exec(el.getAttribute('class')); if (!m || !o) return;
      var r = MAP.rel[relKey(o[1], m[1])] || { type: 'data' }, p = el.querySelector('.main-path'); if (p) p.style.stroke = (REL[r.type] || REL.data)[1];
      if (p) p.style.strokeDasharray = r.type === 'plan' ? '7 6' : '';
    });
  }
  function eachRel(fn) { var N = nodes(); Object.keys(N).forEach(function (id) { var o = N[id].outputs.output_1; if (o) o.connections.forEach(function (c) { fn(String(id), String(c.node)) }) }) }

  /* ───── نقشه‌ی پیش‌فرض از ریشه‌ی برند ───── */
  function seed(mods) {
    var st = {}; (mods || []).forEach(function (m) { st[m.slug] = m.status === 'live' ? 'live' : 'planned' });
    var ids = {}, B = window.BRAND, PL = B.platforms, live = PL.filter(function (p) { return st[p.slug] === 'live' }), rest = PL.filter(function (p) { return st[p.slug] !== 'live' });
    ids.land = addNode({ kind: 'page', title: 'صفحه‌ی اصلی', sub: 'معرفی و ورود', status: 'live', color: '#94a3b8' }, 0, 120);
    ids.sign = addNode({ kind: 'page', title: 'ورود یکپارچه', sub: 'نام کاربری یا کد اختصاصی', status: 'live', color: '#94a3b8' }, 0, 300);
    ids.core = addNode({ kind: 'core', title: 'هسته‌ی مرکزی', sub: 'هویت · API · پایگاه‌داده · AI · دسترسی‌ها', status: 'live', color: '#6c3cf0' }, 300, 300);
    ids.bus = addNode({ kind: 'core', n: '⇄', title: 'لایه‌ی یکپارچه‌سازی', sub: 'رویدادها و رابطه‌ی بین بخش‌ها', status: 'live', color: '#f59e0b' }, 300, 500);
    ids.sub = addNode({ kind: 'data', title: 'اشتراک‌ها', sub: 'شرکت‌ها، بسته‌ها، سطح‌ها', status: 'live', color: '#0e9f6e' }, 300, 110);
    var put = function (list, x, y0) { list.forEach(function (p, i) { ids[p.slug] = addNode({ kind: 'plat', slug: p.slug, n: p.n, title: p.fa, sub: p.desc_fa, color: p.color, status: st[p.slug] || 'planned' }, x, y0 + i * 104) }) };
    put(live, 620, 0); put(rest, 920, 52);
    MAP.rel = {};
    var con = function (a, b, t, note) { if (!ids[a] || !ids[b]) return; ed.addConnection(ids[a], ids[b], 'output_1', 'input_1'); MAP.rel[relKey(ids[a], ids[b])] = { type: t, note: note || '' } };
    con('land', 'sign', 'link', 'دکمه‌ی Sign in'); con('sign', 'core', 'auth', 'بررسی رمز و ساخت نشست'); con('sub', 'core', 'data', 'ظرفیت، سطح‌ها و بخش‌های هر شرکت'); con('core', 'bus', 'event', 'هر ذخیره یک رویداد می‌سازد');
    PL.forEach(function (p) { con('core', p.slug, st[p.slug] === 'live' ? 'auth' : 'plan', st[p.slug] === 'live' ? 'یک ورود برای همه' : 'هنوز ساخته نشده') });
    con('project-control', 'mail', 'data', 'نامه‌ی هر پروژه'); con('project-control', 'file-manager', 'file', 'نقشه‌ها و پیوست‌ها'); con('project-control', 'messenger', 'event', 'گفت‌وگوی هر پروژه'); con('executive-desk', 'project-control', 'data', 'نمای مدیرعامل از پروژه‌ها');
  }

  /* ───── بازرس (ستون کناری) ───── */
  function relsOf(id) { var out = [], inn = []; eachRel(function (o, i) { if (o === String(id)) out.push(i); if (i === String(id)) inn.push(o) }); return { out: out, inn: inn } }
  function title(id) { var n = nodes()[id]; return n ? (n.data.n ? n.data.n + ' — ' : '') + n.data.title : '—' }
  function inspect() {
    var box = $('#smIns'); if (!box) return;
    box.onclick = function (e) { var b = e.target.closest('[data-ro]'); if (b) { sel = { t: 'rel', o: b.dataset.ro, i: b.dataset.ri }; inspect() } };
    if (!sel) {
      var N = nodes(), c = 0, withNote = 0, r = 0; Object.keys(N).forEach(function (k) { c++; if (N[k].data.note) withNote++ }); eachRel(function () { r++ });
      box.innerHTML = '<h3>نقشه‌ی اکوسیستم</h3><p class="sm-p">روی هر بخش بزنید تا توضیحش را بنویسید. برای وصل کردن، نقطه‌ی سمت راست یک بخش را بکشید و روی نقطه‌ی سمت چپ بخش دیگر رها کنید.</p>'
        + '<div class="sm-k"><div><b>' + fa(c) + '</b><span>بخش</span></div><div><b>' + fa(r) + '</b><span>رابطه</span></div><div><b>' + fa(withNote) + '</b><span>توضیح‌دار</span></div></div>'
        + '<h4>راهنمای رنگ رابطه‌ها</h4><ul class="sm-lg">' + Object.keys(REL).map(function (k) { return '<li><i style="background:' + REL[k][1] + '"></i>' + REL[k][0] + '</li>' }).join('') + '</ul>'
        + '<h4>وضعیت بخش‌ها</h4><ul class="sm-lg">' + Object.keys(STAT).map(function (k) { return '<li><i class="dot" style="background:' + STAT[k][1] + '"></i>' + STAT[k][0] + '</li>' }).join('') + '</ul>';
      return;
    }
    if (sel.t === 'node') {
      var n = nodes()[sel.id]; if (!n) { sel = null; return inspect() } var d = n.data, R = relsOf(sel.id), fixed = d.kind === 'plat';
      var li = function (o, i) { var r = MAP.rel[relKey(o, i)] || { type: 'data' }; return '<li><button type="button" class="sm-rl" data-ro="' + o + '" data-ri="' + i + '"><i style="background:' + (REL[r.type] || REL.data)[1] + '"></i><span>' + esc(title(o === String(sel.id) ? i : o)) + '</span><small>' + (REL[r.type] || REL.data)[0] + '</small></button></li>' };
      box.innerHTML = '<div class="sm-hd"><span class="sm-bd" style="background:' + esc(d.color || '#6c3cf0') + '">' + esc(d.n || ICON[d.kind] || '•') + '</span><div><small>' + KIND[d.kind] + '</small><h3>' + esc(d.title) + '</h3></div></div>'
        + '<label class="f">نام' + (fixed ? ' <small>(از ریشه‌ی برند)</small>' : '') + '<input id="smT" value="' + esc(d.title) + '"' + (fixed ? ' readonly' : '') + '></label>'
        + '<label class="f">توضیح کوتاه<input id="smS" value="' + esc(d.sub || '') + '"></label>'
        + (d.kind === 'note' ? '' : '<label class="f">وضعیت<select id="smSt">' + Object.keys(STAT).map(function (k) { return '<option value="' + k + '"' + (d.status === k ? ' selected' : '') + '>' + STAT[k][0] + '</option>' }).join('') + '</select></label>')
        + '<label class="f">توضیح شما برای این بخش<textarea id="smN" rows="6" placeholder="این بخش چه کاری می‌کند؟ چه کسی از آن استفاده می‌کند؟ چه داده‌ای می‌گیرد و چه چیزی تحویل می‌دهد؟">' + esc(d.note || '') + '</textarea></label>'
        + '<h4>می‌فرستد به <em>' + fa(R.out.length) + '</em></h4><ul class="sm-rs">' + (R.out.map(function (i) { return li(String(sel.id), i) }).join('') || '<li class="sm-e">هنوز رابطه‌ای نیست.</li>') + '</ul>'
        + '<h4>می‌گیرد از <em>' + fa(R.inn.length) + '</em></h4><ul class="sm-rs">' + (R.inn.map(function (o) { return li(o, String(sel.id)) }).join('') || '<li class="sm-e">هنوز رابطه‌ای نیست.</li>') + '</ul>'
        + '<div class="row">' + (d.slug && window.BRAND.platform(d.slug) && window.BRAND.platform(d.slug).href ? '<a class="btn s" target="_blank" rel="noopener" href="' + esc(window.BRAND.platform(d.slug).href) + '">باز کردن این بخش</a>' : '') + (fixed || d.kind === 'core' ? '' : '<button class="btn s d" type="button" id="smDel">حذف از نقشه</button>') + '</div>';
      var up = function () { d.sub = $('#smS').value; d.note = $('#smN').value; if (!fixed) d.title = $('#smT').value; if ($('#smSt')) d.status = $('#smSt').value; redraw(sel.id); touch() };
      ['#smT', '#smS', '#smN'].forEach(function (q) { $(q).oninput = up }); if ($('#smSt')) $('#smSt').onchange = up;
      if ($('#smDel')) $('#smDel').onclick = function () { if (confirm('این بخش و رابطه‌هایش از نقشه حذف شود؟')) { var id = sel.id; sel = null; ed.removeNodeId('node-' + id); inspect() } };
      return;
    }
    var k = relKey(sel.o, sel.i), r = MAP.rel[k] = MAP.rel[k] || { type: 'data', note: '' };
    box.innerHTML = '<div class="sm-hd"><span class="sm-bd" style="background:' + (REL[r.type] || REL.data)[1] + '">→</span><div><small>رابطه</small><h3>' + esc(title(sel.o)) + '</h3><p class="sm-to">به ' + esc(title(sel.i)) + '</p></div></div>'
      + '<label class="f">نوع رابطه<select id="smRt">' + Object.keys(REL).map(function (x) { return '<option value="' + x + '"' + (r.type === x ? ' selected' : '') + '>' + REL[x][0] + '</option>' }).join('') + '</select></label>'
      + '<label class="f">چه چیزی جابه‌جا می‌شود؟<textarea id="smRn" rows="5" placeholder="مثلاً: با ثبت تأخیر در کنترل پروژه، یک نامه در نامه‌نگاری ساخته شود.">' + esc(r.note || '') + '</textarea></label>'
      + '<div class="row"><button class="btn s" type="button" id="smRv">برعکس کردن جهت</button><button class="btn s d" type="button" id="smRd">حذف رابطه</button></div>';
    $('#smRt').onchange = function () { r.type = this.value; paint(); touch(); inspect() };
    $('#smRn').oninput = function () { r.note = this.value; touch() };
    $('#smRd').onclick = function () { var s = sel; sel = null; ed.removeSingleConnection(s.o, s.i, 'output_1', 'input_1'); inspect() };
    $('#smRv').onclick = function () { var s = sel, keep = MAP.rel[relKey(s.o, s.i)]; ed.removeSingleConnection(s.o, s.i, 'output_1', 'input_1'); ed.addConnection(s.i, s.o, 'output_1', 'input_1'); MAP.rel[relKey(s.i, s.o)] = keep; sel = { t: 'rel', o: s.i, i: s.o }; paint(); touch(); inspect() };
  }

  /* ───── ذخیره ───── */
  function touch() { if (loading) return; dirty = true; var s = $('#smSave'); if (s) { s.textContent = 'ذخیره نشده…'; s.className = 'sm-sv warn' } clearTimeout(saveT); saveT = setTimeout(save, 1400) }
  function clean() { var live = {}; eachRel(function (o, i) { live[relKey(o, i)] = 1 }); Object.keys(MAP.rel).forEach(function (k) { if (!live[k]) delete MAP.rel[k] }) }
  function save() {
    if (!ed || !dirty) return Promise.resolve(); clean(); dirty = false;
    return store.put({ v: 1, df: ed.export(), rel: MAP.rel, at: Math.floor(Date.now() / 1000) }).then(function () { var s = $('#smSave'); if (s) { s.textContent = 'ذخیره شد'; s.className = 'sm-sv ok' } }).catch(function (x) { dirty = true; var s = $('#smSave'); if (s) { s.textContent = 'ذخیره نشد: ' + emsg(x); s.className = 'sm-sv bad' } });
  }

  /* ───── نما: اندازه و جابه‌جایی ───── */
  function setView(z, x, y) { ed.zoom = z; ed.zoom_last_value = z; ed.canvas_x = x; ed.canvas_y = y; ed.precanvas.style.transform = 'translate(' + x + 'px, ' + y + 'px) scale(' + z + ')'; var l = $('#smZ'); if (l) l.textContent = fa(Math.round(z * 100)) + '%' }
  function fit() {
    var N = nodes(), ks = Object.keys(N); if (!ks.length) return; var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    ks.forEach(function (k) { var n = N[k], el = $('#node-' + k), w = el ? el.offsetWidth : 220, h = el ? el.offsetHeight : 70; x0 = Math.min(x0, n.pos_x); y0 = Math.min(y0, n.pos_y); x1 = Math.max(x1, n.pos_x + w); y1 = Math.max(y1, n.pos_y + h) });
    var c = $('#smCanvas'), W = c.clientWidth, H = c.clientHeight, z = Math.max(.25, Math.min(1.1, Math.min((W - 60) / (x1 - x0), (H - 60) / (y1 - y0))));
    /* Drawflow دور مرکز بوم بزرگ‌نمایی می‌کند */
    setView(z, W / 2 - (x0 + x1) / 2 * z - (W / 2) * (1 - z), H / 2 - (y0 + y1) / 2 * z - (H / 2) * (1 - z));
  }
  function center() { var c = $('#smCanvas'), z = ed.zoom; return { x: (c.clientWidth / 2 - ed.canvas_x - (c.clientWidth / 2) * (1 - z)) / z - 100, y: (c.clientHeight / 2 - ed.canvas_y - (c.clientHeight / 2) * (1 - z)) / z - 30 } }
  function size() { var w = $('#smWrap'); if (!w || w.classList.contains('full')) return; var t = w.getBoundingClientRect().top + window.scrollY; w.style.height = Math.max(440, window.innerHeight - t - 18) + 'px' }

  /* ───── خروجی متنی برای توضیح دادن به Claude ───── */
  function asText() {
    var N = nodes(), L = ['نقشه‌ی اکوسیستم ' + window.BRAND.name, ''];
    Object.keys(N).forEach(function (k) { var d = N[k].data; L.push('■ ' + title(k) + ' [' + KIND[d.kind] + (d.status && STAT[d.status] ? ' · ' + STAT[d.status][0] : '') + ']'); if (d.sub) L.push('  ' + d.sub); if (d.note) L.push('  توضیح: ' + d.note.replace(/\n/g, '\n  ')); var R = relsOf(k); R.out.forEach(function (i) { var r = MAP.rel[relKey(k, i)] || { type: 'data' }; L.push('  → ' + title(i) + ' (' + (REL[r.type] || REL.data)[0] + ')' + (r.note ? ': ' + r.note : '')) }); L.push('') });
    return L.join('\n');
  }

  /* ───── صفحه ───── */
  function page() {
    return Promise.all([loadLib(), store.get(), api('GET', '/modules').catch(function () { return { modules: [] } })]).then(function (r) {
      var saved = r[1] && r[1].data, mods = r[2].modules || [];
      $('#pg').innerHTML = head('نقشه‌ی سایت', 'همه‌ی بخش‌های اکوسیستم و رابطه‌ی بین آن‌ها. هر بخش را توضیح بدهید و به هم وصل کنید.', '<span id="smSave" class="sm-sv ok">ذخیره شد</span><button class="btn" type="button" id="smTxt">خروجی متنی</button><button class="btn" type="button" id="smRst">نقشه‌ی پیش‌فرض</button>')
        + '<div class="sm" id="smWrap"><div class="sm-cv"><div id="smCanvas" dir="ltr"></div>'
        + '<div class="sm-tb" role="toolbar" aria-label="افزودن بخش"><span>افزودن:</span>' + [['page', 'صفحه'], ['data', 'داده'], ['ext', 'سرویس بیرونی'], ['role', 'نقش کاربر'], ['note', 'یادداشت']].map(function (x) { return '<button type="button" class="sm-add" data-add="' + x[0] + '"><i>' + ICON[x[0]] + '</i>' + x[1] + '</button>' }).join('') + '</div>'
        + '<div class="sm-zb"><button type="button" id="smOut" aria-label="کوچک‌تر">－</button><span id="smZ">۱۰۰%</span><button type="button" id="smIn" aria-label="بزرگ‌تر">＋</button><button type="button" id="smFit">دیدن همه</button><button type="button" id="smFull">تمام‌صفحه</button></div></div>'
        + '<aside class="sm-ins" id="smIns" aria-live="polite"></aside></div>';
      $('#pg .head').classList.add('slim');
      size();
      MAP = { rel: (saved && saved.rel) || {} }; sel = null; dirty = false; loading = true;
      ed = new window.Drawflow($('#smCanvas')); ed.reroute = false; ed.zoom_min = .25; ed.zoom_max = 1.6; ed.zoom_value = .08; ed.start();
      if (saved && saved.df) { try { ed.import(saved.df) } catch (e) { saved = null } }
      if (!saved || !saved.df) seed(mods);
      Object.keys(nodes()).forEach(redraw); paint(); loading = false;
      setTimeout(function () { fit(); inspect() }, 60);
      ed.on('nodeSelected', function (id) { sel = { t: 'node', id: String(id) }; inspect() });
      ed.on('nodeUnselected', function () { sel = null; inspect() });
      ed.on('connectionSelected', function (c) { sel = { t: 'rel', o: String(c.output_id), i: String(c.input_id) }; inspect() });
      ed.on('connectionUnselected', function () { sel = null; inspect() });
      ed.on('connectionCreated', function (c) { var k = relKey(c.output_id, c.input_id); if (!MAP.rel[k]) MAP.rel[k] = { type: 'data', note: '' }; paint(); touch(); if (!loading) { sel = { t: 'rel', o: String(c.output_id), i: String(c.input_id) }; inspect() } });
      ed.on('connectionRemoved', function () { touch(); if (!sel) inspect() });
      ed.on('nodeRemoved', function () { touch() }); ed.on('nodeMoved', function () { touch() });
      ed.on('zoom', function (z) { var l = $('#smZ'); if (l) l.textContent = fa(Math.round(z * 100)) + '%' });
      $('#smIn').onclick = function () { ed.zoom_in() }; $('#smOut').onclick = function () { ed.zoom_out() }; $('#smFit').onclick = fit;
      $('#smFull').onclick = function () { var w = $('#smWrap'), on = w.classList.toggle('full'); this.textContent = on ? 'بستن تمام‌صفحه' : 'تمام‌صفحه'; if (!on) size(); setTimeout(fit, 80) };
      $$('.sm-add').forEach(function (b) { b.onclick = function () { var k = b.dataset.add, c = center(), id = addNode({ kind: k, title: KIND[k] + ' تازه', sub: '', status: k === 'note' ? '' : 'planned', color: { page: '#94a3b8', data: '#0e9f6e', ext: '#0ea5e9', role: '#e11d48', note: '#f59e0b' }[k] }, c.x, c.y); touch(); var el = $('#node-' + id); if (el) el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); sel = { t: 'node', id: String(id) }; inspect(); var t = $('#smT'); if (t) { t.focus(); t.select() } } });
      $('#smTxt').onclick = function () { openDlg('<div class="dl"><h2>خروجی متنی نقشه</h2><p class="xnote">این متن همه‌ی بخش‌ها، توضیح‌های شما و رابطه‌ها را دارد. آن را رونوشت کنید و هر جا لازم است بفرستید.</p><textarea id="smOutT" rows="14" readonly>' + esc(asText()) + '</textarea><div class="row"><button class="btn p" type="button" id="smCp">رونوشت</button><button class="btn" type="button" data-close>بستن</button></div></div>', function () { $('#smCp').onclick = function () { var t = $('#smOutT'); t.select(); try { navigator.clipboard.writeText(t.value).then(function () { toast('رونوشت شد.') }) } catch (e) { document.execCommand('copy'); toast('رونوشت شد.') } } }) };
      $('#smRst').onclick = function () { if (!confirm('نقشه به حالت پیش‌فرض برگردد؟ توضیح‌ها و رابطه‌هایی که ساخته‌اید پاک می‌شود.')) return; loading = true; ed.clear(); sel = null; seed(mods); Object.keys(nodes()).forEach(redraw); paint(); loading = false; fit(); inspect(); dirty = true; save() };
    });
  }
  window.addEventListener('resize', function () { if ($('#smWrap')) size() });
  window.addEventListener('beforeunload', function () { if (dirty) save() });

  /* ───── اتصال به پنل: تب تازه + نشان «فقط شما» ───── */
  P.NAV_ADMIN.splice(1, 0, ['sitemap', 'نقشه‌ی سایت']); P.A.sitemap = page;
  var prev = P.onNav;
  P.onNav = function () {
    if (prev) prev();
    if (!isAdmin()) return; var shared = {}; P.NAV_OWNER.forEach(function (x) { shared[x[0]] = 1 });
    $$('#nav [data-go]').forEach(function (b) { if (!shared[b.dataset.go] && !b.querySelector('.own')) { var i = document.createElement('i'); i.className = 'own'; i.textContent = '▲'; i.title = 'فقط شما (مدیر اکوسیستم)'; i.setAttribute('aria-label', 'فقط مدیر اکوسیستم'); b.appendChild(i) } });
    if (!$('#ownLg')) { var me = $('#nav .me'); if (me) { var p = document.createElement('p'); p.id = 'ownLg'; p.innerHTML = '<i class="own">▲</i> فقط شما می‌بینید'; me.parentNode.insertBefore(p, me) } }
  };
  if (P.S && $('#nav .brand')) P.onNav();

  var css = document.createElement('style'); css.textContent = [
    '#nav .own{font-style:normal;font-size:9px;color:var(--lime,#c6f432);opacity:.95}#ownLg{margin:auto 6px 6px;font-size:11px;color:var(--sideInk,#cbd5e1);display:flex;gap:6px;align-items:center}#ownLg+.me{margin-top:0}',
    'main.pg .head.slim p{display:none}',
    '.sm{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:12px;min-height:440px}.sm>aside{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:12px;overflow-y:auto;box-shadow:var(--shadow)}',
    '.sm.full{position:fixed;inset:0;z-index:60;height:auto!important;padding:10px;background:var(--bg)}',
    'html.tsuba-demo .sm.full .sm-tb{top:50px}',
    '.sm h4{margin:10px 0 6px;font-size:11px;color:var(--muted);font-weight:700}.sm h4 em{font-style:normal;background:var(--card2);border-radius:99px;padding:0 7px;margin-inline-start:4px}.sm h3{margin:0;font-size:16px}.sm-p{font-size:12px;color:var(--muted);line-height:1.8;margin:8px 0}',
    '.sm-tb,.sm-zb{position:absolute;z-index:5;display:flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:6px;box-shadow:var(--shadow)}.sm-tb{top:10px;inset-inline:10px;flex-wrap:wrap;width:fit-content;max-width:calc(100% - 20px)}.sm-tb>span{font-size:11px;color:var(--muted);padding-inline:6px}.sm-zb{bottom:10px;left:10px;direction:ltr}',
    '.sm-add,.sm-zb button{border:1px solid var(--line);background:var(--card2);border-radius:10px;min-height:34px;padding:0 10px;cursor:pointer;font:inherit;font-size:12.5px;color:var(--ink);display:inline-flex;align-items:center;gap:6px}.sm-add i{font-style:normal;opacity:.8}.sm-add:hover,.sm-add:focus-visible,.sm-zb button:hover{border-color:var(--blue)}.sm-zb span{font-size:12px;color:var(--muted);min-width:42px;text-align:center}',
    '.sm-cv{position:relative;border:1px solid var(--line);border-radius:18px;overflow:hidden;background:var(--card2);box-shadow:var(--shadow)}#smCanvas{position:absolute;inset:0;background-image:radial-gradient(var(--line2) 1.2px,transparent 1.2px);background-size:22px 22px;touch-action:none}',
    '#smCanvas .drawflow-node{background:var(--card);border:1px solid var(--line2);border-radius:14px;padding:0;width:auto;min-width:210px;max-width:250px;min-height:0;color:var(--ink);box-shadow:0 4px 14px rgba(20,10,60,.08)}#smCanvas .drawflow-node.selected{border-color:var(--blue);box-shadow:0 0 0 3px color-mix(in srgb,var(--blue) 25%,transparent)}#smCanvas .drawflow-node:hover{cursor:grab}',
    '#smCanvas .drawflow-node .input,#smCanvas .drawflow-node .output{width:14px;height:14px;background:var(--card);border:2px solid var(--line2)}#smCanvas .drawflow-node .output:hover,#smCanvas .drawflow-node .input:hover{background:var(--blue);border-color:var(--blue)}#smCanvas .drawflow-node .input{left:-8px}#smCanvas .drawflow-node .output{right:-8px}',
    '#smCanvas .connection .main-path{stroke-width:2.6px;stroke:#94a3b8}#smCanvas .connection .main-path:hover,#smCanvas .connection .main-path.selected{stroke-width:4.5px}#smCanvas .drawflow-delete{display:none}',
    '.smn{direction:rtl;display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px 11px;border-inline-start:4px solid var(--c);border-radius:13px;position:relative}.smn-n{width:34px;height:34px;border-radius:10px;background:var(--c);color:#fff;display:grid;place-items:center;font:700 12px Georgia,serif}.smn-t b{display:block;font-size:13px;line-height:1.5}.smn-t small{display:block;font-size:10.5px;color:var(--muted);line-height:1.5}',
    '.smn-s{width:9px;height:9px;border-radius:50%}.smn-m{position:absolute;top:-8px;left:10px;font-style:normal;font-size:11px;background:var(--lime,#c6f432);color:#141a05;border-radius:99px;padding:0 6px}.k-core .smn{background:color-mix(in srgb,var(--c) 10%,transparent)}.k-note .smn{background:color-mix(in srgb,#f59e0b 14%,transparent);border-inline-start-style:dashed}.k-plat .smn-n{font-size:11px}',
    '.sm-hd{display:flex;gap:10px;align-items:center;margin-bottom:10px}.sm-hd small{color:var(--muted);font-size:11px}.sm-bd{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;color:#fff;font:700 13px Georgia,serif;flex:none}.sm-to{margin:2px 0 0;font-size:12px;color:var(--muted)}',
    '.sm-ins .f{display:grid;gap:4px;font-size:12px;color:var(--muted);margin-bottom:8px}.sm-ins .f input,.sm-ins .f select,.sm-ins .f textarea{font-size:13px}.sm-ins .row{margin-top:10px;flex-wrap:wrap}',
    '.sm-k{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0}.sm-k div{background:var(--card2);border-radius:12px;padding:8px;text-align:center}.sm-k b{display:block;font-size:19px}.sm-k span{font-size:10.5px;color:var(--muted)}',
    '.sm-lg,.sm-rs{list-style:none;margin:0;padding:0;display:grid;gap:5px}.sm-lg li{display:flex;gap:8px;align-items:center;font-size:12px}.sm-lg i{width:18px;height:4px;border-radius:3px}.sm-lg i.dot{width:9px;height:9px;border-radius:50%}.sm-e{font-size:12px;color:var(--muted)}',
    '.sm-rl{display:grid;grid-template-columns:8px 1fr auto;gap:8px;align-items:center;width:100%;text-align:right;border:1px solid var(--line);background:var(--card2);border-radius:10px;padding:6px 8px;cursor:pointer;font:inherit;color:var(--ink);font-size:12.5px}.sm-rl i{width:8px;height:8px;border-radius:50%}.sm-rl small{color:var(--muted);font-size:10.5px}',
    '.sm-sv{font-size:12px;border-radius:99px;padding:5px 12px;background:color-mix(in srgb,var(--ok) 13%,transparent);color:var(--ok)}.sm-sv.warn{background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn)}.sm-sv.bad{background:color-mix(in srgb,var(--bad) 13%,transparent);color:var(--bad)}#smOutT{font-size:12.5px;line-height:1.9}',
    '@media (max-width:980px){.sm{grid-template-columns:1fr;height:auto!important}.sm-cv{height:64vh}.sm.full .sm-cv{height:58vh}.sm.full{overflow:auto}}'
  ].join('\n'); document.head.appendChild(css);
})();

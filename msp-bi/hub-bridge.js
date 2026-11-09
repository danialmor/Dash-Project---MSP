/* Danimor · پل داشبورد msp-bi به هاب
   همه‌ی داده‌ها روی سرور (هاب) ذخیره می‌شوند. مرورگر فقط در طول جلسه یک نسخه‌ی کاری نگه می‌دارد
   که هنگام ورود از سرور پر و هنگام خروج پاک می‌شود. هر تغییر چند صدم ثانیه بعد به سرور فرستاده می‌شود. */
(function () {
  'use strict';
  var API = '/api/v1', SITE = 'msp-bi', VER = '1.1.0';
  /* کلیدهای مشترک (داده‌ی سازمان) و کلیدهای هر کاربر (تنظیمات نمایش) */
  var SHARED_LS = ['tlPins', 'wbsCols', 'wbsSnap'];
  var USER_LS = ['dashGhost', 'dashTiles2', 'dsDisp2', 'dsTheme', 'helpOn', 'lvColors5', 'mobForce', 'pgs', 'schedCm', 'simOn', 'simSc', 'splitW', 'themePacks'];
  var CHUNK = 380000, ID_RX = /^[A-Za-z0-9_.:-]{1,80}$/;
  var T = '', USER = null, REV = {}, PEND = {}, BUSY = false, ERR = '', SEQ = {}, MINE = {}, REMOTE = false, ready = false;
  var oSet = Storage.prototype.setItem, oRem = Storage.prototype.removeItem;
  var UCOLL = function () { return 'u-' + USER.id };
  function $(s) { return document.querySelector(s) }
  function api(method, path, body) {
    return fetch(API + path, { method: method, headers: Object.assign({ 'Content-Type': 'application/json' }, T ? { Authorization: 'Bearer ' + T } : {}), body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {} }).then(function (j) { if (!r.ok) { var e = new Error(j.error || ('http-' + r.status)); e.status = r.status; e.body = j; throw e } return j }) });
  }
  /* ── سبک صفحه‌ی ورود و نوار وضعیت ── */
  var css = document.createElement('style');
  css.textContent = '#hbL{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:linear-gradient(135deg,#0f2a24,#1b6f52 55%,#c9a227);font-family:Vazirmatn,Tahoma,sans-serif;direction:rtl}#hbL form{width:min(360px,92vw);background:rgba(255,255,255,.96);border-radius:22px;padding:26px 24px;box-shadow:0 24px 60px rgba(0,0,0,.35);display:grid;gap:12px;color:#14232a}#hbL h1{margin:0 0 4px;font-size:20px}#hbL p{margin:0;color:#5b6b70;font-size:12.5px}#hbL label{display:grid;gap:5px;font-size:13px}#hbL input{min-height:44px;border-radius:12px;border:1px solid #cfd8d6;padding:0 12px;font:inherit;font-size:16px;direction:ltr;text-align:left}#hbL button{min-height:46px;border:0;border-radius:12px;background:#14232a;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer}#hbL button:disabled{opacity:.6}#hbL .e{color:#c0392b;font-size:12.5px;min-height:1em}#hbL .w{color:#8a5a00;font-size:12px}' +
    '#hbS{position:fixed;inset-inline-start:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:9999;display:flex;align-items:center;gap:8px;background:rgba(20,35,42,.92);color:#fff;border-radius:99px;padding:6px 8px 6px 12px;font:12px Vazirmatn,Tahoma,sans-serif;direction:rtl;box-shadow:0 6px 20px rgba(0,0,0,.25)}#hbS b{font-weight:700}#hbS button{border:0;border-radius:99px;background:rgba(255,255,255,.16);color:#fff;font:inherit;padding:4px 10px;cursor:pointer}#hbS .d{width:8px;height:8px;border-radius:50%;background:#3aa36b}#hbS.p .d{background:#f2b640}#hbS.x .d{background:#e05247}' +
    '#hbR{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;background:#14232a;color:#fff;border-radius:14px;padding:8px 12px;font:13px Vazirmatn,Tahoma,sans-serif;direction:rtl;display:flex;gap:10px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.3)}#hbR button{border:0;border-radius:10px;background:#f2b640;color:#14232a;font:inherit;font-weight:700;padding:5px 10px;cursor:pointer}';
  document.head.appendChild(css);
  function loginUI(msg) {
    var d = document.createElement('div'); d.id = 'hbL';
    d.innerHTML = '<form autocomplete="on"><h1>داشبورد پروژه‌ها</h1><p>برای ورود، کد کاربری و رمز خود را وارد کنید.</p><label>کد کاربری<input name="code" autocomplete="username" required autocapitalize="off" spellcheck="false"></label><label>رمز<input name="pin" type="password" autocomplete="current-password" required></label><div class="e" role="alert">' + (msg || '') + '</div><button type="submit">ورود</button><div class="w" id="hbTM" hidden>حالت آزمایشی سرور روشن است.</div></form>';
    document.body.appendChild(d);
    api('GET', '/health').then(function (h) { if (h.test_mode) $('#hbTM').hidden = false }).catch(function () { });
    var f = d.querySelector('form'); setTimeout(function () { f.code.focus() }, 50);
    f.onsubmit = function (e) {
      e.preventDefault(); var b = f.querySelector('button'), er = f.querySelector('.e'); b.disabled = true; er.textContent = '';
      api('POST', '/auth/login', { code: f.code.value.trim(), pin: f.pin.value, device: 'web' }).then(function (r) {
        if (r.must_change) { er.textContent = 'رمز اولیه باید عوض شود؛ از مرکز کنترل (‎/admin/‎) رمز را عوض کنید و دوباره وارد شوید.'; b.disabled = false; return }
        if (!r.grants || !r.grants[SITE]) { er.textContent = 'شما به این سایت دسترسی ندارید.'; b.disabled = false; return }
        T = r.token; USER = r.user; try { oSet.call(localStorage, 'hub.token', T) } catch (x) { } d.remove(); boot();
      }).catch(function (x) { b.disabled = false; er.textContent = x.status === 401 ? 'کد یا رمز درست نیست.' : (x.status === 429 ? 'به‌خاطر تلاش‌های ناموفق، ۱۰ دقیقه صبر کنید.' : 'ارتباط با سرور برقرار نشد.') });
    };
  }
  /* ── تبدیل مقدارهای دودویی (فایل‌های پیوست) برای ذخیره روی سرور ── */
  function enc(v) {
    if (v instanceof Blob) return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res({ __blob: String(r.result).split(',')[1] || '', type: v.type || '', name: v.name || '', lm: v.lastModified || 0 }) }; r.onerror = function () { res(null) }; r.readAsDataURL(v) });
    if (v instanceof ArrayBuffer) { var b = new Uint8Array(v), s = ''; for (var i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return Promise.resolve({ __ab: btoa(s) }) }
    if (Array.isArray(v)) return Promise.all(v.map(enc));
    if (v && typeof v === 'object' && v.constructor === Object) { var ks = Object.keys(v); return Promise.all(ks.map(function (k) { return enc(v[k]) })).then(function (vs) { var o = {}; ks.forEach(function (k, i) { o[k] = vs[i] }); return o }) }
    return Promise.resolve(v);
  }
  function dec(v) {
    if (Array.isArray(v)) return v.map(dec);
    if (v && typeof v === 'object') {
      if (typeof v.__blob === 'string') { var bin = atob(v.__blob), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); try { return new File([u], v.name || 'file', { type: v.type, lastModified: v.lm || Date.now() }) } catch (e) { return new Blob([u], { type: v.type }) } }
      if (typeof v.__ab === 'string') { var b2 = atob(v.__ab), a = new Uint8Array(b2.length); for (var j = 0; j < b2.length; j++) a[j] = b2.charCodeAt(j); return a.buffer }
      var o = {}; for (var k in v) o[k] = dec(v[k]); return o;
    }
    return v;
  }
  function safeId(k) { return ID_RX.test(k) ? k : ('h_' + Array.prototype.map.call(unescape(encodeURIComponent(k)), function (c) { return ('0' + c.charCodeAt(0).toString(16)).slice(-2) }).join('')).slice(0, 80) }
  /* ── خواندن کامل یک مجموعه از سرور (با تکه‌ها) ── */
  function loadColl(coll) {
    var all = [], page = function (after) { return api('GET', '/data/' + SITE + '/' + coll + '?limit=500' + (after ? '&after=' + encodeURIComponent(after) : '')).then(function (r) { all = all.concat(r.items); SEQ[coll] = Math.max(SEQ[coll] || 0, r.seq || 0); return r.next ? page(r.next) : all }) };
    return page('').then(function (items) {
      var byId = {}, out = {}; items.forEach(function (i) { byId[i.id] = i });
      items.forEach(function (i) {
        if (/__c\d+$/.test(i.id)) return; var d = i.data, val;
        if (d && d.__chunks) { var s = ''; for (var n = 0; n < d.__chunks; n++) { var c = byId[i.id + '__c' + n]; s += c ? c.data.s : '' } try { val = JSON.parse(s) } catch (e) { val = undefined } }
        else val = d && d.__v !== undefined ? d.__v : d;
        REV[coll + '/' + i.id] = i.rev; out[d && d.k ? d.k : i.id] = val;
      });
      return out;
    });
  }
  function getDoc(coll, id) {
    return api('GET', '/data/' + SITE + '/' + coll + '/' + id).then(function (r) {
      var d = r.data; if (d && d.__chunks) { var p = []; for (var n = 0; n < d.__chunks; n++) p.push(api('GET', '/data/' + SITE + '/' + coll + '/' + id + '__c' + n).then(function (c) { return c.data.s }).catch(function () { return '' })); return Promise.all(p).then(function (ss) { var v; try { v = JSON.parse(ss.join('')) } catch (e) { } return { rev: r.rev, val: v } }) }
      return { rev: r.rev, val: d && d.__v !== undefined ? d.__v : d };
    }).catch(function (e) { if (e.status === 404) return { rev: (e.body && e.body.rev) || 0, val: undefined }; throw e });
  }
  /* ── ادغام هنگام تعارض: آرایه‌ها بر اساس id ادغام می‌شوند و تغییر این کاربر مقدم است ── */
  function hasIds(a) { return Array.isArray(a) && a.length && a.every(function (x) { return x && typeof x === 'object' && x.id != null }) }
  function mergeArr(S, L) { if (!(hasIds(S) || hasIds(L))) return L; var m = {}, order = []; (S || []).forEach(function (x) { if (x && x.id != null) { m[x.id] = x; order.push(x.id) } }); (L || []).forEach(function (x) { if (x && x.id != null) { if (!(x.id in m)) order.push(x.id); m[x.id] = x } }); var Lids = {}; (L || []).forEach(function (x) { if (x && x.id != null) Lids[x.id] = 1 }); var first = (L || []).map(function (x) { return x.id }).filter(function (id) { return id != null }); return first.concat(order.filter(function (id) { return !Lids[id] })).map(function (id) { return m[id] }) }
  function merge(S, L) {
    if (S === undefined) return L; if (Array.isArray(S) && Array.isArray(L)) return mergeArr(S, L);
    if (S && L && typeof S === 'object' && typeof L === 'object' && !Array.isArray(S) && !Array.isArray(L)) { var o = {}, k; for (k in S) o[k] = S[k]; for (k in L) o[k] = (Array.isArray(S[k]) && Array.isArray(L[k])) ? mergeArr(S[k], L[k]) : L[k]; return o }
    return L;
  }
  /* ── صف ارسال ── */
  function queue(coll, key, val) { if (!ready) return; PEND[coll + '\u0001' + key] = { coll: coll, key: key, val: val }; status(); clearTimeout(queue.t); queue.t = setTimeout(flush, 700) }
  function putDoc(coll, key, val, tries) {
    var id = safeId(key), rk = coll + '/' + id;
    return enc(val).then(function (ev) {
      var s = JSON.stringify(ev === undefined ? null : ev), base = REV[rk] || 0, wrap = { k: key, __v: ev };
      if (s.length <= CHUNK) return api('PUT', '/data/' + SITE + '/' + coll + '/' + id, { data: wrap, base_rev: base, op_id: 'w' + Date.now() + Math.random().toString(36).slice(2, 7) }).then(function (r) { REV[rk] = r.rev; MINE[rk] = r.rev; emit(coll, key) });
      var n = Math.ceil(s.length / CHUNK), jobs = [];
      for (var i = 0; i < n; i++) (function (i) { var cid = id + '__c' + i, crk = coll + '/' + cid; jobs.push(function () { return putRaw(coll, cid, { s: s.slice(i * CHUNK, (i + 1) * CHUNK) }, crk) }) })(i);
      return jobs.reduce(function (p, f) { return p.then(f) }, Promise.resolve()).then(function () { return api('PUT', '/data/' + SITE + '/' + coll + '/' + id, { data: { k: key, __chunks: n }, base_rev: base }) }).then(function (r) { REV[rk] = r.rev; MINE[rk] = r.rev; emit(coll, key) });
    }).catch(function (e) {
      if (e.status === 409 && (tries || 0) < 3) return getDoc(coll, id).then(function (cur) { REV[rk] = cur.rev; var m = dec(merge(cur.val, val)); writeLocal(coll, key, m); return putDoc(coll, key, m, (tries || 0) + 1) });
      throw e;
    });
  }
  /* لایه‌ی یکپارچه‌سازی: هر ذخیره یک رویداد در گذرگاه رویداد هسته ثبت می‌کند (حداکثر هر ۳۰ ثانیه یک بار برای هر کلید) */
  var EVT_T = {};
  function modOf(key) { return /^(letters|att:)/.test(key) ? 'mail' : (/^(files|plf:|dim)/.test(key) ? 'file-manager' : (/^msgr/.test(key) ? 'messenger' : 'project-control')) }
  function emit(coll, key) { if (coll !== 'kv' || key.indexOf('ls:') === 0) return; var t = Date.now(); if (EVT_T[key] && t - EVT_T[key] < 30000) return; EVT_T[key] = t; api('POST', '/events', { module: modOf(key), type: 'data.updated', entity: 'store', entity_id: key }).catch(function () { }) }
  function putRaw(coll, id, data, rk, again) { return api('PUT', '/data/' + SITE + '/' + coll + '/' + id, { data: data, base_rev: REV[rk] || 0 }).then(function (r) { REV[rk] = r.rev; MINE[rk] = r.rev }).catch(function (e) { if (e.status === 409 && !again) { REV[rk] = (e.body && e.body.rev) || 0; return putRaw(coll, id, data, rk, 1) } throw e }) }
  function flush() {
    if (BUSY) return BUSY; var items = Object.keys(PEND).map(function (k) { var x = PEND[k]; delete PEND[k]; return x }); if (!items.length) { status(); return Promise.resolve() }
    status(true);
    BUSY = items.reduce(function (p, it) { return p.then(function () { return putDoc(it.coll, it.key, it.val) }).catch(function (e) { if (!PEND[it.coll + '\u0001' + it.key]) PEND[it.coll + '\u0001' + it.key] = it; ERR = e.status === 403 ? 'اجازه‌ی ویرایش ندارید' : (e.status === 401 ? 'نشست تمام شده' : 'ارسال نشد؛ دوباره تلاش می‌شود'); if (e.status === 401) { setTimeout(function () { location.reload() }, 1500) } }) }, Promise.resolve()).then(function () { BUSY = false; if (!Object.keys(PEND).length) ERR = ''; status(); if (Object.keys(PEND).length) { clearTimeout(flush.t); flush.t = setTimeout(flush, 5000) } });
    return BUSY;
  }
  window.__hubFlush = flush;
  /* ── نوشتن در نسخه‌ی کاری مرورگر ── */
  var IDB = null;
  function idb() { return IDB ? Promise.resolve(IDB) : new Promise(function (res, rej) { var q = indexedDB.open('dashdb', 1); q.onupgradeneeded = function () { q.result.createObjectStore('kv') }; q.onsuccess = function () { IDB = q.result; res(IDB) }; q.onerror = function () { rej(q.error) } }) }
  var putOrig = IDBObjectStore.prototype.put, delOrig = IDBObjectStore.prototype.delete;
  function idbPut(k, v) { return idb().then(function (db) { return new Promise(function (res) { var tx = db.transaction('kv', 'readwrite'); putOrig.call(tx.objectStore('kv'), v, k); tx.oncomplete = function () { res() }; tx.onerror = function () { res() } }) }) }
  function idbClear() { return idb().then(function (db) { return new Promise(function (res) { var tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').clear(); tx.oncomplete = function () { res() }; tx.onerror = function () { res() } }) }).catch(function () { }) }
  function writeLocal(coll, key, val) { if (coll === 'kv') return idbPut(key, val); try { oSet.call(localStorage, key, val == null ? '' : String(val)) } catch (e) { } }
  function clearLocal() { SHARED_LS.concat(USER_LS).forEach(function (k) { try { oRem.call(localStorage, k) } catch (e) { } }); try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('kv_') === 0) oRem.call(localStorage, k) }) } catch (e) { } return idbClear() }
  /* ── رهگیری ذخیره‌های برنامه ── */
  Storage.prototype.setItem = function (k, v) { oSet.call(this, k, v); if (ready && USER && this === window.localStorage) { if (SHARED_LS.indexOf(k) >= 0) queue('kv', 'ls:' + k, String(v)); else if (USER_LS.indexOf(k) >= 0) queue(UCOLL(), k, String(v)) } };
  Storage.prototype.removeItem = function (k) { oRem.call(this, k); if (ready && USER && this === window.localStorage) { if (SHARED_LS.indexOf(k) >= 0) queue('kv', 'ls:' + k, null); else if (USER_LS.indexOf(k) >= 0) queue(UCOLL(), k, null) } };
  IDBObjectStore.prototype.put = function (v, k) { var r = putOrig.apply(this, arguments); try { if (this.name === 'kv' && this.transaction.db.name === 'dashdb' && typeof k === 'string') queue('kv', k, v) } catch (e) { } return r };
  IDBObjectStore.prototype.delete = function (k) { var r = delOrig.apply(this, arguments); try { if (this.name === 'kv' && this.transaction.db.name === 'dashdb' && typeof k === 'string') queue('kv', k, null) } catch (e) { } return r };
  /* ── وضعیت، خروج، تغییرات همکاران ── */
  function status(sending) {
    var el = $('#hbS'); if (!el) { el = document.createElement('div'); el.id = 'hbS'; el.setAttribute('role', 'status'); document.body.appendChild(el); el.addEventListener('click', function (e) { if (e.target.closest('[data-hbo]')) logout() }) }
    var n = Object.keys(PEND).length; el.className = ERR ? 'x' : (n || sending ? 'p' : '');
    el.innerHTML = '<span class="d"></span><span>' + (ERR ? '⚠️ ' + ERR : (n || sending ? 'در حال ذخیره روی سرور…' : 'روی سرور ذخیره شد')) + '</span><b>' + (USER ? USER.name : '') + '</b><button type="button" data-hbo="1">خروج</button>';
  }
  function logout() { var p = Object.keys(PEND).length; (p ? flush() : Promise.resolve()).then(function () { if (Object.keys(PEND).length && !confirm('بعضی تغییرها هنوز به سرور نرسیده‌اند. با خروج از بین می‌روند. خارج شوید؟')) return; clearLocal().then(function () { try { oRem.call(localStorage, 'hub.token') } catch (e) { } location.reload() }) }) }
  window.addEventListener('beforeunload', function (e) { if (Object.keys(PEND).length || BUSY) { flush(); e.preventDefault(); e.returnValue = '' } });
  window.addEventListener('pagehide', function () { if (Object.keys(PEND).length) flush() });
  function poll() {
    if (!T || REMOTE) return; var cs = ['kv'];
    Promise.all(cs.map(function (c) { return api('GET', '/data/' + SITE + '/' + c + '?since=' + (SEQ[c] || 0) + '&limit=500').then(function (r) { SEQ[c] = r.seq; return r.items.filter(function (i) { var rk = c + '/' + i.id; return !(MINE[rk] && MINE[rk] >= i.rev) && !(REV[rk] >= i.rev) }) }) })).then(function (lists) {
      var ch = [].concat.apply([], lists); if (!ch.length) return; REMOTE = true;
      var b = document.createElement('div'); b.id = 'hbR'; b.innerHTML = '<span>همکاران تغییراتی ثبت کرده‌اند.</span><button type="button">نمایش تازه‌ترین</button>'; document.body.appendChild(b);
      b.querySelector('button').onclick = function () { flush().then(function () { location.reload() }) };
    }).catch(function () { });
  }
  /* ── راه‌اندازی ── */
  function boot() {
    var cover = document.createElement('div'); cover.id = 'hbL'; cover.innerHTML = '<form><h1>در حال دریافت داده از سرور…</h1><p>چند لحظه صبر کنید.</p></form>'; document.body.appendChild(cover);
    clearLocal().then(function () { return Promise.all([loadColl('kv'), loadColl(UCOLL())]) }).then(function (r) {
      var kv = r[0], us = r[1], jobs = [];
      Object.keys(kv).forEach(function (k) { var v = dec(kv[k]); if (k.indexOf('ls:') === 0) { if (v != null) try { oSet.call(localStorage, k.slice(3), v) } catch (e) { } } else if (v != null) jobs.push(idbPut(k, v)) });
      Object.keys(us).forEach(function (k) { if (us[k] != null) try { oSet.call(localStorage, k, us[k]) } catch (e) { } });
      if (!('simOn' in us)) try { oSet.call(localStorage, 'simOn', '0') } catch (e) { } /* داده‌ی واقعی: شبیه‌سازی خاموش */
      return Promise.all(jobs);
    }).then(function () { cover.remove(); ready = true; status(); window.__startApp && window.__startApp(); setInterval(poll, 10000) })
      .catch(function (e) { cover.remove(); if (e.status === 401) { try { oRem.call(localStorage, 'hub.token') } catch (x) { } T = ''; loginUI('نشست تمام شده؛ دوباره وارد شوید.') } else loginUI('دریافت داده از سرور ناموفق بود (' + (e.message || e) + ').') });
  }
  try { T = localStorage.getItem('hub.token') || '' } catch (e) { }
  if (!T) loginUI(); else api('GET', '/me').then(function (r) { if (r.must_change || !r.grants[SITE]) throw { status: 401 }; USER = r.user; boot() }).catch(function () { T = ''; try { oRem.call(localStorage, 'hub.token') } catch (e) { } loginUI() });
  window.__hubBridge = { version: VER, flush: flush, user: function () { return USER } };
})();

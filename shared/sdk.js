/* Danimor Hub SDK — اتصال هر سایت به هاب مرکزی.
   اصل: منبع حقیقت فقط سرور است. مرورگر هیچ داده‌ی دائمی نگه نمی‌دارد؛ فقط «صف ارسال» (Outbox) برای زمانی که اینترنت نیست.
   بعد از تأیید سرور، رکورد از صف پاک می‌شود. تعارض‌ها هرگز دور ریخته نمی‌شوند؛ تا تصمیم کاربر در صف می‌مانند. */
(function (g) {
  'use strict';
  var uuid = function () { return (g.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) };
  function MemStore() { var m = {}; return { all: function () { return Promise.resolve(Object.keys(m).map(function (k) { return m[k] })) }, put: function (o) { m[o.op_id] = o; return Promise.resolve() }, del: function (k) { delete m[k]; return Promise.resolve() } } }
  function IdbStore(name) {
    var dbp = new Promise(function (res, rej) { var r = indexedDB.open(name, 1); r.onupgradeneeded = function () { r.result.createObjectStore('ops', { keyPath: 'op_id' }) }; r.onsuccess = function () { res(r.result) }; r.onerror = function () { rej(r.error) } });
    var tx = function (mode, fn) { return dbp.then(function (db) { return new Promise(function (res, rej) { var t = db.transaction('ops', mode), s = t.objectStore('ops'), out = fn(s); t.oncomplete = function () { res(out && out.result) }; t.onerror = function () { rej(t.error) } }) }) };
    return { all: function () { return tx('readonly', function (s) { return s.getAll() }).then(function (x) { return x || [] }) }, put: function (o) { return tx('readwrite', function (s) { s.put(o) }) }, del: function (k) { return tx('readwrite', function (s) { s.delete(k) }) } };
  }
  function Hub(opt) {
    opt = opt || {}; var me = this; me.base = (opt.base || '/api/v1').replace(/\/$/, ''); me.site = opt.site || ''; me.ls = opt.storage || g.localStorage;
    me.device = (function () { try { var d = me.ls.getItem('hub.device'); if (!d) { d = 'd-' + uuid().slice(0, 12); me.ls.setItem('hub.device', d) } return d } catch (e) { return 'd-' + uuid().slice(0, 12) } })();
    me.store = opt.store || (g.indexedDB ? IdbStore('hub-outbox-' + (me.site || 'x')) : MemStore());
    me.token = opt.token || (function () { try { return me.ls.getItem('hub.token') || '' } catch (e) { return '' } })();
    me.user = null; me.cache = {}; me.ops = []; me.h = {}; me.busy = false; me.lastSync = null; me.online = true; me.err = '';
    me.ready = me.store.all().then(function (o) { me.ops = o.sort(function (a, b) { return a.ts - b.ts }); me.emit('status') });
    if (g.addEventListener) { g.addEventListener('online', function () { me.online = true; me.flush() }); g.addEventListener('offline', function () { me.online = false; me.emit('status') }) }
    me.timer = setInterval(function () { if (me.pending()) me.flush() }, opt.interval || 15000); if (me.timer.unref) me.timer.unref();
  }
  var P = Hub.prototype;
  P.on = function (e, f) { (this.h[e] = this.h[e] || []).push(f); return this };
  P.emit = function (e, d) { var me = this; (me.h[e] || []).forEach(function (f) { try { f(d) } catch (x) { } }) };
  P.pending = function () { return this.ops.filter(function (o) { return o.state === 'queued' }).length };
  P.conflicts = function () { return this.ops.filter(function (o) { return o.state === 'conflict' }) };
  P.status = function () { return { online: this.online, pending: this.pending(), conflicts: this.conflicts().length, syncing: this.busy, lastSync: this.lastSync, error: this.err, loggedIn: !!this.token } };
  P.api = function (method, path, body) {
    var me = this, h = { 'Content-Type': 'application/json', 'X-Device': me.device, 'X-Pending': String(me.pending()), 'X-Conflicts': String(me.conflicts().length) }; if (me.token) h.Authorization = 'Bearer ' + me.token;
    return fetch(me.base + path, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }).then(function (r) {
      me.online = true; return r.json().catch(function () { return {} }).then(function (j) { if (r.status === 401 && me.token && path.indexOf('/auth/') < 0) { me.token = ''; me.emit('auth', 'expired') } if (!r.ok) { var e = new Error(j.error || ('http-' + r.status)); e.status = r.status; e.body = j; throw e } return j });
    }, function (e) { me.online = false; var x = new Error('offline'); x.offline = true; me.emit('status'); throw x });
  };
  P.login = function (code, pin) { var me = this; return me.api('POST', '/auth/login', { code: code, pin: pin, device: me.device }).then(function (r) { me.token = r.token; me.user = r.user; me.grants = r.grants; try { me.ls.setItem('hub.token', r.token) } catch (e) { } me.emit('status'); return r }) };
  P.logout = function (force) {
    var me = this; return me.ready.then(function () { if ((me.pending() || me.conflicts().length) && !force) { var e = new Error('pending-changes'); e.pending = me.pending(); throw e } me.token = ''; me.user = null; me.cache = {}; try { me.ls.removeItem('hub.token') } catch (x) { } me.emit('status') });
  };
  P.me = function () { var me = this; return me.api('GET', '/me').then(function (r) { me.user = r.user; me.grants = r.grants; return r }) };
  P.directory = function () { return this.api('GET', '/directory?site=' + encodeURIComponent(this.site)).then(function (r) { return r.users }) };
  P.list = function (coll) {
    var me = this, key = me.site + '/' + coll; return me.ready.then(function () { return me.api('GET', '/data/' + me.site + '/' + coll) }).then(function (r) {
      var c = me.cache[key] = { rev: {}, data: {} }; r.items.forEach(function (i) { c.rev[i.id] = i.rev; c.data[i.id] = i.data }); me.seq = me.seq || {}; me.seq[key] = r.seq; return { items: me.view(coll), stale: false };
    }, function (e) { if (e.offline) return { items: me.view(coll), stale: true }; throw e });
  };
  P.view = function (coll) { // نمای جلسه: آخرین داده‌ی سرور + تغییرات هنوز ارسال‌نشده (فقط در حافظه‌ی همین صفحه)
    var me = this, key = me.site + '/' + coll, c = me.cache[key] || { rev: {}, data: {} }, out = {}; Object.keys(c.data).forEach(function (id) { out[id] = { id: id, rev: c.rev[id], data: c.data[id], pending: false } });
    me.ops.forEach(function (o) { if (o.site === me.site && o.coll === coll && o.state !== 'error') { if (o.type === 'del') delete out[o.id]; else out[o.id] = { id: o.id, rev: o.base_rev, data: o.data, pending: true, conflict: o.state === 'conflict' } } }); return Object.keys(out).map(function (k) { return out[k] });
  };
  P.baseRev = function (coll, id) { var c = this.cache[this.site + '/' + coll]; return (c && c.rev[id]) || 0 };
  P.enqueue = function (type, coll, id, data) {
    var me = this; return me.ready.then(function () {
      var ex = me.ops.filter(function (o) { return o.site === me.site && o.coll === coll && o.id === id && o.state === 'queued' && !o.inflight })[0], op;
      if (ex) { ex.type = type; ex.data = data; ex.ts = Date.now(); op = ex } else { var prev = me.ops.filter(function (o) { return o.site === me.site && o.coll === coll && o.id === id && o.state !== 'error' }).pop(); op = { op_id: uuid(), site: me.site, coll: coll, id: id, type: type, data: data, base_rev: prev && prev.state === 'queued' ? null : me.baseRev(coll, id), after: prev && prev.state === 'queued' ? prev.op_id : null, ts: Date.now(), state: 'queued' }; me.ops.push(op) }
      return me.store.put(op).then(function () { me.emit('status'); return me.flush().then(function () { return { status: me.ops.indexOf(op) < 0 ? 'synced' : (op.state === 'queued' ? 'pending' : op.state), op_id: op.op_id } }) });
    });
  };
  P.put = function (coll, id, data) { return this.enqueue('put', coll, String(id), data) };
  P.remove = function (coll, id) { return this.enqueue('del', coll, String(id), null) };
  P.flush = function () {
    var me = this; if (me.busy) return me.busy; if (!me.token) return Promise.resolve(); 
    var run = function () {
      var batch = me.ops.filter(function (o) { return o.state === 'queued' && o.base_rev !== null }).slice(0, 100); if (!batch.length) return Promise.resolve();
      batch.forEach(function (o) { o.inflight = true });
      return me.api('POST', '/sync/batch', { ops: batch.map(function (o) { return { op_id: o.op_id, site: o.site, coll: o.coll, id: o.id, type: o.type, data: o.data, base_rev: o.base_rev } }) }).then(function (r) {
        var jobs = []; r.results.forEach(function (x) {
          var o = batch.filter(function (b) { return b.op_id === x.op_id })[0]; if (!o) return; o.inflight = false;
          if (x.status === 'ok') { var c = me.cache[o.site + '/' + o.coll] = me.cache[o.site + '/' + o.coll] || { rev: {}, data: {} }; if (c) { if (o.type === 'del') { delete c.data[o.id]; delete c.rev[o.id] } else { c.data[o.id] = o.data; c.rev[o.id] = x.rev } } me.ops = me.ops.filter(function (z) { return z !== o }); jobs.push(me.store.del(o.op_id)); me.ops.forEach(function (n) { if (n.after === o.op_id) { n.base_rev = x.rev; n.after = null; jobs.push(me.store.put(n)) } }); if (x.warnings && x.warnings.length) me.emit('warning', { op: o, warnings: x.warnings }) }
          else if (x.status === 'conflict') { o.state = 'conflict'; o.server = { rev: x.rev, data: x.current, deleted: x.deleted }; jobs.push(me.store.put(o)); me.emit('conflict', o) }
          else { o.state = 'error'; o.error = x.error; jobs.push(me.store.put(o)); me.emit('opError', o) }
        }); me.lastSync = Date.now(); me.err = ''; return Promise.all(jobs);
      }, function (e) { batch.forEach(function (o) { o.inflight = false }); me.err = e.offline ? '' : e.message; if (e.status === 401) me.token = ''; });
    };
    me.busy = run().then(function () { me.busy = false; me.emit('status'); if (me.pending() && me.online && me.token) { var again = me.ops.some(function (o) { return o.state === 'queued' && o.base_rev !== null }); if (again && me.lastSync && Date.now() - me.lastSync < 1000) return me.flush() } }, function () { me.busy = false }); return me.busy;
  };
  P.resolve = function (op_id, how) {
    var me = this, o = me.ops.filter(function (x) { return x.op_id === op_id })[0]; if (!o) return Promise.resolve();
    if (how === 'mine') { o.base_rev = o.server ? o.server.rev : 0; o.state = 'queued'; return me.store.put(o).then(function () { return me.flush() }) }
    var c = me.cache[o.site + '/' + o.coll] = me.cache[o.site + '/' + o.coll] || { rev: {}, data: {} }; if (c && o.server) { if (o.server.deleted) { delete c.data[o.id]; delete c.rev[o.id] } else { c.data[o.id] = o.server.data; c.rev[o.id] = o.server.rev } }
    me.ops = me.ops.filter(function (z) { return z !== o }); return me.store.del(op_id).then(function () { me.emit('status') });
  };
  P.watch = function (coll, cb, ms) { // بروزرسانی زنده: ابتدا SSE، در غیر این صورت نظرسنجی
    var me = this, key = me.site + '/' + coll, stop = false, pull = function () { if (stop || !me.token) return Promise.resolve(); me.seq = me.seq || {}; return me.api('GET', '/data/' + me.site + '/' + coll + '?since=' + (me.seq[key] || 0)).then(function (r) { var c = me.cache[key] = me.cache[key] || { rev: {}, data: {} }; r.items.forEach(function (i) { if (i.deleted) { delete c.data[i.id]; delete c.rev[i.id] } else { c.data[i.id] = i.data; c.rev[i.id] = i.rev } }); me.seq[key] = r.seq; if (r.items.length) cb(me.view(coll)) }, function () { }) };
    var t = setInterval(pull, ms || 8000); if (t.unref) t.unref(); return { pull: pull, stop: function () { stop = true; clearInterval(t) } };
  };
  g.HubSDK = Hub; if (typeof module !== 'undefined') module.exports = Hub;
})(typeof window !== 'undefined' ? window : globalThis);

// آزمون SDK با سرور واقعی: صف بدون‌اینترنت، همگام‌سازی، تعارض، جلوگیری از خروج با تغییر ارسال‌نشده
const { spawn, execFileSync } = require('child_process'), os = require('os'), fs = require('fs'), path = require('path'), assert = require('assert');
const Hub = require('../../shared/sdk.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-')), port = 18000 + Math.floor(Math.random() * 1000);
const env = { ...process.env, HUB_DATA_DIR: dir, HUB_PORT: String(port) }, srv = path.join(__dirname, '..', 'server.py');
const init = execFileSync('python3', [srv, 'init'], { env }).toString(), pin = (init.match(/(\d{8})/) || [])[1]; assert(pin, init);
const child = spawn('python3', [srv], { env, stdio: 'ignore' }); const B = 'http://127.0.0.1:' + port + '/api/v1';
const sleep = ms => new Promise(r => setTimeout(r, ms)); const mem = () => { const m = {}; return { getItem: k => m[k] || null, setItem: (k, v) => { m[k] = v }, removeItem: k => { delete m[k] } } };
(async () => {
  try {
    for (let i = 0; i < 40; i++) { try { await fetch(B + '/health'); break } catch (e) { await sleep(100) } }
    const adm = new Hub({ base: B, site: 'admin', storage: mem(), interval: 1e9 }); await adm.login('admin', pin);
    const mk = async (code, grants) => (await adm.api('POST', '/admin/users', { code, name: code, role: 'member', grants })).pin;
    const p1 = await mk('sec', { aide: 'member' }), p2 = await mk('des', { aide: 'member' });
    const a = new Hub({ base: B, site: 'aide', storage: mem(), interval: 1e9 }); await a.login('sec', p1);
    const out = {};
    // ۱) آنلاین: همگام فوری
    out.online = (await a.put('events', 'e1', { title: 'جلسه ۱' })).status; assert.strictEqual(out.online, 'synced'); assert.strictEqual(a.pending(), 0);
    // ۲) بدون اینترنت: فقط در صف
    const good = a.base; a.base = 'http://127.0.0.1:1/api/v1';
    out.off1 = (await a.put('events', 'e2', { title: 'جلسه ۲' })).status; out.off2 = (await a.put('events', 'e3', { title: 'جلسه ۳' })).status; await a.put('events', 'e3', { title: 'جلسه ۳ (ویرایش)' });
    out.pendingOffline = a.pending(); out.status = a.status(); assert.strictEqual(out.pendingOffline, 2); assert.strictEqual(a.online, false);
    out.viewWhileOffline = a.view('events').map(x => x.id + (x.pending ? '*' : '')).sort().join(',');
    await assert.rejects(a.logout(), /pending-changes/);
    // ۳) اتصال برقرار: انتقال خودکار
    a.base = good; await a.flush(); out.pendingAfter = a.pending(); assert.strictEqual(a.pending(), 0);
    const chk = new Hub({ base: B, site: 'aide', storage: mem(), interval: 1e9 }); await chk.login('des', p2); const l = await chk.list('events'); out.serverHas = l.items.map(x => x.id + ':' + x.data.title).sort().join('|'); assert.strictEqual(l.items.length, 3);
    // ۴) تعارض: دو دستگاه یک رکورد را تغییر می‌دهند
    await chk.put('events', 'e1', { title: 'تغییر توسط طراح' }); const r = await a.put('events', 'e1', { title: 'تغییر توسط منشی' }); out.conflict = r.status; assert.strictEqual(r.status, 'conflict');
    assert.strictEqual(a.conflicts().length, 1); assert.strictEqual(a.conflicts()[0].server.data.title, 'تغییر توسط طراح'); await assert.rejects(a.logout(), /pending-changes/);
    await a.resolve(a.conflicts()[0].op_id, 'mine'); assert.strictEqual(a.conflicts().length, 0); out.afterMine = (await chk.list('events')).items.find(x => x.id === 'e1').data.title; assert.strictEqual(out.afterMine, 'تغییر توسط منشی');
    // ۵) «مال او» : تغییر من دور ریخته می‌شود ولی فقط با تصمیم کاربر
    await chk.put('events', 'e1', { title: 'نسخه‌ی طراح ۲' }); const r2 = await a.put('events', 'e1', { title: 'نسخه‌ی منشی ۲' }); assert.strictEqual(r2.status, 'conflict'); await a.resolve(a.conflicts()[0].op_id, 'theirs');
    out.afterTheirs = a.view('events').find(x => x.id === 'e1').data.title; assert.strictEqual(out.afterTheirs, 'نسخه‌ی طراح ۲');
    // ۶) هشدار هم‌پوشانی
    let warn = null; a.on('warning', w => { warn = w.warnings[0] }); await a.put('events', 'm1', { title: 'الف', start: '2026-11-12T09:00', end: '2026-11-12T10:00', attendees: ['des'] }); await a.put('events', 'm2', { title: 'ب', start: '2026-11-12T09:30', end: '2026-11-12T10:30', attendees: ['des'] });
    out.overlap = warn && warn.codes.join(); assert.strictEqual(out.overlap, 'des');
    // ۷) حذف + خروج مجاز وقتی صف خالی است
    await a.remove('events', 'e2'); assert.strictEqual((await chk.list('events')).items.some(x => x.id === 'e2'), false); await a.logout(); out.logout = 'ok';
    // ۸) نشست منقضی/ابطال‌شده
    await adm.api('POST', '/admin/users/' + (await adm.api('GET', '/admin/users')).users.find(u => u.code === 'des').id + '/reset-pin', {}); await assert.rejects(chk.me(), e => e.status === 401);
    console.log(JSON.stringify(out, null, 1)); console.log('SDK-TESTS-OK');
  } catch (e) { console.error('FAIL', e); process.exitCode = 1 } finally { child.kill(); fs.rmSync(dir, { recursive: true, force: true }) }
})();

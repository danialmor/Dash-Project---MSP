// آزمون سرتاسری داشبورد روی هاب واقعی (نیاز: Node 18+ و Playwright)
//   NODE_PATH=... node hub/tests/e2e_bridge.js
// ورود، ذخیره روی سرور، دیدن از دستگاه دوم، ادغام ثبت هم‌زمان، ماندن پاسخ پس از بارگذاری دوباره،
// اعلان تغییرات همکاران، فایل دودویی و داده‌ی بزرگ (تکه‌تکه)، خروج و پاک شدن نسخه‌ی مرورگر
const { spawn, execFileSync } = require('child_process'), os = require('os'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..'), DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hube2e-')), PORT = 19000 + Math.floor(Math.random() * 800), U = 'http://127.0.0.1:' + PORT + '/msp-bi/';
const env = { ...process.env, HUB_DATA_DIR: DIR, HUB_PORT: String(PORT), HUB_TEST_MODE: '1', HUB_STATIC_DIR: ROOT }, SRV = path.join(ROOT, 'hub', 'server.py');
execFileSync('python3', [SRV, 'init'], { env }); const hub = spawn('python3', [SRV], { env, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const login = async (p) => { await p.goto(U); await p.waitForSelector('#hbL input[name=code]', { timeout: 15000 }); await p.fill('#hbL input[name=code]', 'Admin'); await p.fill('#hbL input[name=pin]', 'Admin123'); await p.click('#hbL button'); await p.waitForSelector('#hbS', { timeout: 20000 }); await p.waitForTimeout(2500) };
const saved = (p) => p.waitForFunction(() => { const s = document.getElementById('hbS'); return s && !s.className && s.textContent.indexOf('ذخیره شد') >= 0 }, null, { timeout: 30000 });
const toReq = async (p) => { await p.click('.tab[data-v="sched"]'); await p.waitForTimeout(400); await p.click('#segS button[data-m="delay"]'); await p.waitForTimeout(400); await p.click('#schedBody [data-dlv="req"]'); await p.waitForTimeout(300) };
const addDelay = async (p, by) => { await toReq(p); await p.click('#schedBody [data-dlx="new"]'); await p.waitForTimeout(400); await p.selectOption('#dfP', { index: 1 }); await p.fill('#dfR', by); await p.click('#dfA [data-v="فونداسیون"]'); await p.click('#dfC [data-v="تامین مصالح"]'); await p.fill('#dfD', 'آزمون'); await p.click('#dfI [data-v="توقف کامل"]'); await p.fill('#dfS', '1405/08/01'); await p.click('#dfU [data-v="اجرایی"]'); await p.click('#dfOk'); await p.waitForTimeout(300) };
const rows = (p) => p.evaluate(() => [...document.querySelectorAll('#schedBody .dlt tbody tr')].map(r => r.innerText));
(async () => { let b; try {
  for (let i = 0; i < 40; i++) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/api/v1/health'); if (r.ok) break } catch (e) { } await sleep(150) }
  b = await chromium.launch(); const errs = []; const pg = async () => { const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); return p };
  const A = await pg(); await login(A); assert.strictEqual(await A.evaluate(() => localStorage.getItem('simOn')), '0');
  await addDelay(A, 'A-1'); await saved(A); console.log('✔ ذخیره روی سرور');
  await A.waitForTimeout(500); const ev = await A.evaluate(() => fetch('/api/v1/events?since=0&module=project-control', { headers: { Authorization: 'Bearer ' + localStorage.getItem('hub.token') } }).then(r => r.json())); assert.ok(ev.items.some(e => e.type === 'data.updated' && e.entity_id === 'mobdata')); console.log('✔ رویداد در گذرگاه هسته');
  const B = await pg(); await login(B); await toReq(B); assert.ok((await rows(B)).some(t => t.includes('A-1'))); console.log('✔ دیدن از دستگاه دوم');
  await addDelay(A, 'A-2'); await saved(A); await addDelay(B, 'B-1'); await saved(B);
  const C = await pg(); await login(C); await toReq(C); const all = (await rows(C)).join('\n'); assert.ok(all.includes('A-1') && all.includes('A-2') && all.includes('B-1')); console.log('✔ ادغام ثبت هم‌زمان');
  await C.click('#schedBody [data-dlr]'); await C.waitForTimeout(300); await C.click('#daS [data-v="ok"]'); await C.fill('#daC', 'ok'); await C.click('#daOk'); await saved(C);
  await C.reload(); await C.waitForSelector('#hbS', { timeout: 20000 }); await C.waitForTimeout(2500); await toReq(C); await C.click('#schedBody [data-dlst="ok"]'); await C.waitForTimeout(300); assert.ok((await rows(C)).some(t => t.includes('پذیرفته شد'))); console.log('✔ پاسخ پس از بارگذاری دوباره');
  await A.waitForTimeout(11500); assert.ok(await A.evaluate(() => !!document.getElementById('hbR'))); console.log('✔ اعلان تغییرات همکاران');
  await A.evaluate(() => new Promise(res => { const q = indexedDB.open('dashdb', 1); q.onsuccess = () => { const tx = q.result.transaction('kv', 'readwrite'), st = tx.objectStore('kv'), big = new Uint8Array(900000); for (let i = 0; i < big.length; i++) big[i] = i % 251; st.put(new File([big], 'نقشه.pdf', { type: 'application/pdf' }), 'att:e2e'); st.put({ s: 'x'.repeat(1200000) }, 'e2e-big'); tx.oncomplete = res } }));
  await A.waitForTimeout(800); await A.evaluate(() => window.__hubFlush()); await saved(A);
  const D = await pg(); await login(D); const r = await D.evaluate(() => new Promise(res => { const q = indexedDB.open('dashdb', 1); q.onsuccess = () => { const st = q.result.transaction('kv').objectStore('kv'), a = st.get('att:e2e'), g = st.get('e2e-big'); g.onsuccess = async () => { const u = new Uint8Array(await a.result.arrayBuffer()); let ok = u.length === 900000; for (let i = 0; ok && i < u.length; i += 997) ok = u[i] === i % 251; res({ ok, name: a.result.name, big: g.result.s.length }) } } }));
  assert.ok(r.ok && r.name === 'نقشه.pdf' && r.big === 1200000); console.log('✔ فایل دودویی و داده‌ی بزرگ');
  await B.click('#hbS [data-hbo]'); await B.waitForSelector('#hbL input[name=code]', { timeout: 15000 });
  const lo = await B.evaluate(() => new Promise(res => { const q = indexedDB.open('dashdb', 1); q.onsuccess = () => { const c = q.result.transaction('kv').objectStore('kv').count(); c.onsuccess = () => res({ n: c.result, t: localStorage.getItem('hub.token') }) } }));
  assert.strictEqual(lo.n, 0); assert.strictEqual(lo.t, null); console.log('✔ خروج و پاک شدن نسخه‌ی مرورگر');
  assert.deepStrictEqual(errs, []); console.log('E2E-OK');
 } catch (e) { console.error('FAIL', e); process.exitCode = 1 } finally { if (b) await b.close(); hub.kill(); fs.rmSync(DIR, { recursive: true, force: true }) } })();

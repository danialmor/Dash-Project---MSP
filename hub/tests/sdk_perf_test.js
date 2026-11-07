// آزمون SDK: درخواست‌های هم‌زمان یکسان فقط یک بار به سرور می‌روند و خواندن صفحه‌به‌صفحه کامل است
const { spawn, execFileSync } = require('child_process'), os = require('os'), fs = require('fs'), path = require('path'), assert = require('assert');
const Hub = require('../../shared/sdk.js'); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hubp-')), port = 18000 + Math.floor(Math.random() * 1000);
const env = { ...process.env, HUB_DATA_DIR: dir, HUB_PORT: String(port), HUB_TEST_MODE: '1' }, srv = path.join(__dirname, '..', 'server.py'); execFileSync('python3', [srv, 'init'], { env });
const child = spawn('python3', [srv], { env, stdio: 'ignore' }); const B = 'http://127.0.0.1:' + port + '/api/v1'; const sleep = ms => new Promise(r => setTimeout(r, ms)); const mem = () => { const m = {}; return { getItem: k => m[k] || null, setItem: (k, v) => { m[k] = v }, removeItem: k => { delete m[k] } } };
(async () => { try { for (let i = 0; i < 40; i++) { try { await fetch(B + '/health'); break } catch (e) { await sleep(100) } }
  const h = new Hub({ base: B, site: 'msp-bi', storage: mem(), interval: 1e9 }); await h.login('Admin', 'Admin123');
  for (let i = 0; i < 1200; i += 100) await h.api('POST', '/sync/batch', { ops: Array.from({ length: 100 }, (_, j) => ({ op_id: 'o' + (i + j), site: 'msp-bi', coll: 'big', id: 'id' + String(i + j).padStart(5, '0'), type: 'put', data: { n: i + j }, base_rev: 0 })) });
  const of = global.fetch; let n = 0; global.fetch = (...a) => { if (String(a[0]).includes('/data/')) n++; return of(...a) };
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => h.list('big'))); assert.strictEqual(rs[0].items.length, 1200); assert.strictEqual(rs[4].items.length, 1200);
  console.log('requests for 5 concurrent list() of 1200 rows:', n, '(3 pages × 1 shared)'); assert.strictEqual(n, 3);
  console.log('SDK-PERF-OK'); } catch (e) { console.error('FAIL', e); process.exitCode = 1 } finally { child.kill(); fs.rmSync(dir, { recursive: true, force: true }) } })();

// End-to-end test of the User Control Panel (/admin/) on a real hub. Needs Node 18+ and Playwright.
const { spawn, execFileSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..'); const { chromium } = require('playwright');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hubp-')), PORT = 19800 + Math.floor(Math.random() * 150), B = 'http://127.0.0.1:' + PORT, env = { ...process.env, HUB_DATA_DIR: DIR, HUB_PORT: String(PORT), HUB_TEST_MODE: '1', HUB_STATIC_DIR: ROOT };
execFileSync('python3', [path.join(ROOT, 'hub', 'server.py'), 'init'], { env }); const hub = spawn('python3', [path.join(ROOT, 'hub', 'server.py')], { env, stdio: 'ignore' }); const errs = [], R = {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => { await sleep(1200); const b = await chromium.launch(); try {
 const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
 const login = async (u, pw = 'Admin123') => { await p.goto(B + '/admin/'); await p.waitForSelector('#lf input[name=code]'); await p.fill('#lf input[name=code]', u); await p.fill('#lf input[name=pin]', pw); await p.click('#lf .btn.p'); await sleep(900) };
 await login('Admin', 'wrong'); R.bad = await p.textContent('#lErr');
 await login('Admin'); R.adminNav = await p.$$eval('#nav [data-go]', x => x.map(e => e.textContent));

 await p.click('[data-go=tenants]'); await sleep(400); await p.click('#nt'); await p.fill('#dlg input[name=name]', 'شرکت آزمون'); await p.fill('#dlg input[name=oname]', 'مدیر آزمون'); await p.fill('#dlg input[name=ouser]', 'test_owner');
 await p.fill('#dlg input[name=plan]', 'حرفه‌ای'); await p.fill('#dlg input[name=seats]', '5'); await p.fill('#dlg input[name=max_levels]', '4'); await p.check('#dlg input[name=mods][value=mail]'); await p.click('#dlg .btn.p'); await sleep(700);
 R.created = await p.textContent('#dlg .secret'); await p.click('#dlg [data-close]'); await sleep(500);
 R.rows = await p.$$eval('tr[data-t]', x => x.length); await p.click('tr[data-t]'); await sleep(600); await p.click('#dlg [data-close]');
 await p.click('#lo'); await sleep(300);
 await login('test_owner'); R.ownerNav = await p.$$eval('#nav [data-go]', x => x.map(e => e.textContent));
 await p.click('[data-go=levels]'); await sleep(400); R.levelInputs = await p.$$eval('#lvf input', x => x.length); await p.fill('#lvf input[name=l1]', 'مدیرعامل'); await p.fill('#lvf input[name=l3]', 'مهندس'); await p.click('#lvf .btn.p'); await sleep(400);
 await p.click('[data-go=users]'); await sleep(500); await p.click('#nu'); await p.fill('#dlg input[name=name]', 'مهندس کارگاه'); await p.fill('#dlg input[name=username]', 'site_eng'); await p.selectOption('#dlg select[name=level]', '3');
 await p.check('#dlg input[name=mods][value=project-control]'); await p.click('#dlg .btn.p'); await sleep(700); R.userCreated = await p.textContent('#dlg .secret'); await p.click('#dlg [data-close]'); await sleep(500);
 R.userRow = await p.$$eval('#pg tbody tr', x => x.map(e => e.innerText.replace(/\s+/g, ' ')).join(' | '));
 await p.click('[data-go=profile]'); await sleep(400); await p.fill('#prf input[name=phone]', '09130000000'); await p.click('#prf .btn.p'); await sleep(400);
 await p.click('#lo'); await sleep(300);
 await login('site_eng'); await p.waitForURL(/msp-bi/, { timeout: 10000 }); await p.waitForSelector('#hbS', { timeout: 20000 }); R.userLanded = p.url(); R.noSecondLogin = !(await p.$('#hbL input[name=code]'));

  assert.ok(R.bad.length > 0); assert.strictEqual(R.adminNav.length, 11); assert.ok(R.created.includes('T001-0001')); assert.strictEqual(R.rows, 1); assert.strictEqual(R.ownerNav.length, 8); assert.strictEqual(R.levelInputs, 4);
  assert.ok(R.userCreated.includes('T001-0002')); assert.ok(R.userRow.includes('site_eng')); assert.ok(/\/msp-bi\/$/.test(R.userLanded)); assert.ok(R.noSecondLogin); assert.deepStrictEqual(errs, []); console.log('PANEL-E2E-OK');
 } catch (e) { console.log('FAIL', e.message, JSON.stringify(R)); process.exitCode = 1 } await b.close(); hub.kill(); fs.rmSync(DIR, { recursive: true, force: true }) })();

import json, os, sys, tempfile, threading, unittest, urllib.request, urllib.error, http.server, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import server as S

def call(base, method, path, body=None, token=None, headers=None):
    h = {'Content-Type': 'application/json'}
    if token: h['Authorization'] = 'Bearer ' + token
    h.update(headers or {})
    r = urllib.request.Request(base + path, json.dumps(body).encode() if body is not None else None, h, method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=10); return resp.status, json.loads(resp.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cfg = dict(S.DEF); cfg.update(port=0, data_dir=cls.tmp.name, allowed_origins=['https://aide.example'])
        cls.srv = S.make_server(cfg); cls.base = 'http://127.0.0.1:%d' % cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        hub = cls.srv.hub
        for slug in ('msp-bi', 'aide', 'admin'): hub.q('INSERT OR IGNORE INTO sites VALUES(?,?,?,1,?,?)', (slug, slug, '/' + slug + '/', 'app', 0))
        c = hub.q("INSERT INTO users(code,name,role,created) VALUES('admin','مدیر','admin',0)"); hub.set_pin(c.lastrowid, '12345678')
        cls.hub = hub
        s, r = call(cls.base, 'POST', '/api/v1/auth/login', {'code': 'admin', 'pin': '12345678'}); assert s == 200, r; cls.adm = r['token']
    @classmethod
    def tearDownClass(cls): cls.srv.shutdown(); cls.tmp.cleanup()

    def mkuser(self, code, grants, role='member'):
        s, r = call(self.base, 'POST', '/api/v1/admin/users', {'code': code, 'name': 'کاربر ' + code, 'role': role, 'grants': grants}, self.adm)
        self.assertEqual(s, 200, r); s, l = call(self.base, 'POST', '/api/v1/auth/login', {'code': code, 'pin': r['pin']}); self.assertEqual(s, 200); return l['token'], r

    def test_01_health_and_auth(self):
        self.assertEqual(call(self.base, 'GET', '/api/v1/health')[1]['ok'], True)
        self.assertEqual(call(self.base, 'GET', '/api/v1/me')[0], 401)
        self.assertEqual(call(self.base, 'GET', '/api/v1/me', token='x.y')[0], 401)
        s, r = call(self.base, 'GET', '/api/v1/me', token=self.adm); self.assertEqual(r['user']['role'], 'admin')

    def test_02_login_lockout(self):
        self.mkuser('lock1', {})
        for i in range(5): self.assertEqual(call(self.base, 'POST', '/api/v1/auth/login', {'code': 'lock1', 'pin': 'bad'})[0], 401)
        self.assertEqual(call(self.base, 'POST', '/api/v1/auth/login', {'code': 'lock1', 'pin': 'bad'})[0], 429)

    def test_03_permissions(self):
        a, _ = self.mkuser('only-aide', {'aide': 'member'}); v, _ = self.mkuser('viewer1', {'aide': 'viewer'}, 'viewer')
        ok = call(self.base, 'PUT', '/api/v1/data/aide/events/e1', {'data': {'title': 'x'}, 'base_rev': 0}, a); self.assertEqual(ok[0], 200)
        self.assertEqual(call(self.base, 'PUT', '/api/v1/data/msp-bi/letters/l1', {'data': {}, 'base_rev': 0}, a)[0], 403)
        self.assertEqual(call(self.base, 'GET', '/api/v1/data/msp-bi/letters', token=a)[0], 403)
        self.assertEqual(call(self.base, 'PUT', '/api/v1/data/aide/events/e2', {'data': {}, 'base_rev': 0}, v)[0], 403)
        self.assertEqual(call(self.base, 'GET', '/api/v1/data/aide/events', token=v)[0], 200)
        self.assertEqual(call(self.base, 'GET', '/api/v1/admin/stats', token=a)[0], 403)

    def test_04_cas_conflict_and_idempotency(self):
        t, _ = self.mkuser('cas1', {'msp-bi': 'member'}); p = '/api/v1/data/msp-bi/notes/n1'
        s, r = call(self.base, 'PUT', p, {'data': {'v': 1}, 'base_rev': 0, 'op_id': 'op-A'}, t); self.assertEqual((s, r['rev']), (200, 1))
        s2, r2 = call(self.base, 'PUT', p, {'data': {'v': 1}, 'base_rev': 0, 'op_id': 'op-A'}, t); self.assertEqual((s2, r2['rev']), (200, 1))
        s, r = call(self.base, 'PUT', p, {'data': {'v': 2}, 'base_rev': 1}, t); self.assertEqual(r['rev'], 2)
        s, r = call(self.base, 'PUT', p, {'data': {'v': 9}, 'base_rev': 1}, t); self.assertEqual(s, 409); self.assertEqual(r['current'], {'v': 2}); self.assertEqual(r['rev'], 2)
        s, r = call(self.base, 'DELETE', p, {'base_rev': 2}, t); self.assertEqual(s, 200)
        s, r = call(self.base, 'PUT', p, {'data': {'v': 3}, 'base_rev': 2}, t); self.assertEqual(s, 409); self.assertTrue(r['deleted'])
        s, r = call(self.base, 'GET', '/api/v1/data/msp-bi/notes', token=t); self.assertEqual([i['id'] for i in r['items']], [])

    def test_05_batch_and_feed(self):
        t, _ = self.mkuser('batch1', {'msp-bi': 'member'})
        ops = [{'op_id': 'b%d' % i, 'site': 'msp-bi', 'coll': 'tasks', 'id': 't%d' % i, 'type': 'put', 'data': {'i': i}, 'base_rev': 0} for i in range(5)]
        ops.append({'op_id': 'bx', 'site': 'aide', 'coll': 'events', 'id': 'z', 'type': 'put', 'data': {}, 'base_rev': 0})
        s, r = call(self.base, 'POST', '/api/v1/sync/batch', {'ops': ops}, t); self.assertEqual([x['status'] for x in r['results']], ['ok'] * 5 + ['error'])
        s, f = call(self.base, 'GET', '/api/v1/data/msp-bi/tasks?since=0', token=t); self.assertEqual(len(f['items']), 5)
        s, f2 = call(self.base, 'GET', '/api/v1/data/msp-bi/tasks?since=%d' % f['seq'], token=t); self.assertEqual(f2['items'], [])
        call(self.base, 'PUT', '/api/v1/data/msp-bi/tasks/t1', {'data': {'i': 'new'}, 'base_rev': 1}, t)
        s, f3 = call(self.base, 'GET', '/api/v1/data/msp-bi/tasks?since=%d' % f['seq'], token=t); self.assertEqual([i['data'] for i in f3['items']], [{'i': 'new'}])

    def test_06_aide_calendar_overlap_and_directory(self):
        a, _ = self.mkuser('sec1', {'aide': 'member'}); self.mkuser('des1', {'aide': 'member'}); self.mkuser('hidden1', {'msp-bi': 'member'})
        s, r = call(self.base, 'PUT', '/api/v1/data/aide/events/m1', {'data': {'title': 'جلسه‌ی طراحی', 'start': '2026-11-10T10:00', 'end': '2026-11-10T11:00', 'attendees': ['des1', 'sec1']}, 'base_rev': 0}, a); self.assertEqual(r['warnings'], [])
        s, r = call(self.base, 'PUT', '/api/v1/data/aide/events/m2', {'data': {'title': 'جلسه‌ی دوم', 'start': '2026-11-10T10:30', 'end': '2026-11-10T11:30', 'attendees': ['des1']}, 'base_rev': 0}, a)
        self.assertEqual(r['warnings'][0]['type'], 'overlap'); self.assertEqual(r['warnings'][0]['codes'], ['des1'])
        s, d = call(self.base, 'GET', '/api/v1/directory?site=aide', token=a); codes = {u['code'] for u in d['users']}
        self.assertIn('des1', codes); self.assertIn('admin', codes); self.assertNotIn('hidden1', codes); self.assertNotIn('pin_hash', json.dumps(d))

    def test_07_service_key_and_admin(self):
        s, k = call(self.base, 'POST', '/api/v1/admin/service-keys', {'site': 'aide', 'label': 'تقویم'}, self.adm); self.assertEqual(s, 200)
        self.assertEqual(call(self.base, 'PUT', '/api/v1/data/aide/events/svc1', {'data': {'title': 's'}, 'base_rev': 0}, k['token'])[0], 200)
        self.assertEqual(call(self.base, 'GET', '/api/v1/data/msp-bi/x', token=k['token'])[0], 403)
        self.assertEqual(call(self.base, 'POST', '/api/v1/auth/login', {'code': k['code'], 'pin': ''})[0], 401)
        s, us = call(self.base, 'GET', '/api/v1/admin/users', token=self.adm); u = [x for x in us['users'] if x['code'] == k['code']][0]
        call(self.base, 'PATCH', '/api/v1/admin/users/%d' % u['id'], {'active': False}, self.adm)
        self.assertEqual(call(self.base, 'GET', '/api/v1/me', token=k['token'])[0], 401)
        me = [x for x in us['users'] if x['code'] == 'admin'][0]; self.assertEqual(call(self.base, 'PATCH', '/api/v1/admin/users/%d' % me['id'], {'active': False}, self.adm)[0], 400)

    def test_08_pin_reset_revokes_old_token(self):
        t, r = self.mkuser('pr1', {}); s, us = call(self.base, 'GET', '/api/v1/admin/users', token=self.adm); u = [x for x in us['users'] if x['code'] == 'pr1'][0]
        s, n = call(self.base, 'POST', '/api/v1/admin/users/%d/reset-pin' % u['id'], {}, self.adm); self.assertEqual(s, 200)
        self.assertEqual(call(self.base, 'GET', '/api/v1/me', token=t)[0], 401); self.assertEqual(call(self.base, 'POST', '/api/v1/auth/login', {'code': 'pr1', 'pin': n['pin']})[0], 200)

    def test_09_sites_stats_audit_backup_export(self):
        self.assertEqual(call(self.base, 'POST', '/api/v1/admin/sites', {'slug': 'Bad Slug', 'title': 'x'}, self.adm)[0], 400)
        self.assertEqual(call(self.base, 'POST', '/api/v1/admin/sites', {'slug': 'tools', 'title': 'ابزارها'}, self.adm)[0], 200)
        s, st = call(self.base, 'GET', '/api/v1/admin/stats', token=self.adm); self.assertGreaterEqual(st['users'], 2); self.assertFalse(st['ai'])
        s, a = call(self.base, 'GET', '/api/v1/admin/audit?action=login', token=self.adm); self.assertTrue(a['items'])
        s, b = call(self.base, 'POST', '/api/v1/admin/backup', {}, self.adm); self.assertTrue(os.path.exists(os.path.join(self.tmp.name, 'backups', b['file'])))
        s, e = call(self.base, 'GET', '/api/v1/admin/export', token=self.adm); self.assertNotIn('pin_hash', json.dumps(e)); self.assertTrue(e['records'])

    def test_10_ai_gateway(self):
        self.assertEqual(call(self.base, 'POST', '/api/v1/ai', {'prompt': 'سلام'}, self.adm)[0], 501)
        class O(http.server.BaseHTTPRequestHandler):
            def do_POST(s):
                b = json.loads(s.rfile.read(int(s.headers['Content-Length']))); out = json.dumps({'message': {'content': 'پاسخ: ' + b['messages'][-1]['content']}}).encode()
                s.send_response(200); s.send_header('Content-Length', str(len(out))); s.end_headers(); s.wfile.write(out)
            def log_message(s, *a): pass
        o = http.server.HTTPServer(('127.0.0.1', 0), O); threading.Thread(target=o.serve_forever, daemon=True).start()
        self.hub.cfg['ai_url'] = 'http://127.0.0.1:%d' % o.server_address[1]; self.hub.cfg['ai_rate_per_min'] = 2; self.hub.ai_hits.clear()
        s, r = call(self.base, 'POST', '/api/v1/ai', {'prompt': 'سلام'}, self.adm); self.assertEqual((s, r['text']), (200, 'پاسخ: سلام'))
        call(self.base, 'POST', '/api/v1/ai', {'prompt': 'x'}, self.adm); self.assertEqual(call(self.base, 'POST', '/api/v1/ai', {'prompt': 'y'}, self.adm)[0], 429)
        self.hub.cfg['ai_url'] = 'http://127.0.0.1:1'; self.hub.ai_hits.clear(); self.assertEqual(call(self.base, 'POST', '/api/v1/ai', {'prompt': 'z'}, self.adm)[0], 502); o.shutdown(); self.hub.cfg['ai_url'] = ''

    def test_11_cors_size_and_sql_safety(self):
        r = urllib.request.Request(self.base + '/api/v1/health', headers={'Origin': 'https://evil.example'}); self.assertIsNone(urllib.request.urlopen(r).headers.get('Access-Control-Allow-Origin'))
        r = urllib.request.Request(self.base + '/api/v1/health', headers={'Origin': 'https://aide.example'}); self.assertEqual(urllib.request.urlopen(r).headers.get('Access-Control-Allow-Origin'), 'https://aide.example')
        t, _ = self.mkuser('sz1', {'msp-bi': 'member'})
        self.assertEqual(call(self.base, 'PUT', '/api/v1/data/msp-bi/notes/big', {'data': {'x': 'a' * 600000}, 'base_rev': 0}, t)[0], 413)
        self.assertEqual(call(self.base, 'PUT', "/api/v1/data/msp-bi/notes/x'%20OR%201=1", {'data': {}, 'base_rev': 0}, t)[0], 400)
        self.assertEqual(call(self.base, 'GET', '/api/v1/data/msp-bi/tasks?since=abc', token=t)[0], 400)

    def test_12_keepalive_unread_body(self):
        import http.client
        c = http.client.HTTPConnection('127.0.0.1', self.srv.server_address[1], timeout=10); h = {'Authorization': 'Bearer ' + self.adm, 'Content-Type': 'application/json'}
        c.request('POST', '/api/v1/admin/backup', b'{}', h); r = c.getresponse(); r.read(); self.assertEqual(r.status, 200)
        c.request('GET', '/api/v1/admin/stats', headers=h); r = c.getresponse(); self.assertEqual(r.status, 200); r.read()
        c.request('POST', '/api/v1/me', b'{"x":1}', h); r = c.getresponse(); r.read(); c.request('GET', '/api/v1/health'); r = c.getresponse(); self.assertEqual(r.status, 200); c.close()

if __name__ == '__main__': unittest.main(verbosity=2)

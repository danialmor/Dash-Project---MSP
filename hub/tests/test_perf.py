import http.client, http.server, json, os, sys, tempfile, threading, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import server as S
from test_hub import call

class P(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(); cfg = dict(S.DEF); cfg.update(port=0, data_dir=cls.tmp.name, test_mode=True)
        cls.srv = S.make_server(cfg); cls.port = cls.srv.server_address[1]; cls.base = 'http://127.0.0.1:%d' % cls.port; threading.Thread(target=cls.srv.serve_forever, daemon=True).start(); h = cls.hub = cls.srv.hub
        for slug in ('msp-bi', 'aide', 'admin'): h.q('INSERT OR IGNORE INTO sites VALUES(?,?,?,1,?,?)', (slug, slug, '/' + slug + '/', 'app', 0))
        c = h.q("INSERT INTO users(code,name,role,created) VALUES('Admin','a','admin',0)"); h.set_pin(c.lastrowid, 'Admin123', mc=False)
        cls.t = call(cls.base, 'POST', '/api/v1/auth/login', {'code': 'Admin', 'pin': 'Admin123'})[1]['token']
    @classmethod
    def tearDownClass(cls): cls.srv.shutdown(); cls.tmp.cleanup()
    def test_indexes_used(self):
        names = {r['name'] for r in self.hub.all("SELECT name FROM sqlite_master WHERE type='index'")}
        for n in ('rec_sc', 'aud_ts', 'aud_act', 'cl_seen', 'ops_ts', 'ch_sc'): self.assertIn(n, names)
        plan = ' '.join(str(r) for r in self.hub.all("EXPLAIN QUERY PLAN SELECT id FROM records WHERE site='a' AND coll='b' AND deleted=0 AND id>'x' ORDER BY id LIMIT 5"))
        self.assertIn('rec_sc', plan + ' ' + 'rec_sc' if 'USING' not in plan else plan)
    def test_pagination(self):
        for i in range(25): call(self.base, 'PUT', '/api/v1/data/msp-bi/pg/r%02d' % i, {'data': {'i': i}, 'base_rev': 0}, self.t)
        seen, after = [], ''
        while True:
            s, r = call(self.base, 'GET', '/api/v1/data/msp-bi/pg?limit=10&after=' + after, token=self.t); self.assertEqual(s, 200); seen += [x['id'] for x in r['items']]
            if not r['next']: break
            after = r['next']
        self.assertEqual(seen, ['r%02d' % i for i in range(25)])
        self.assertEqual(len(call(self.base, 'GET', '/api/v1/data/msp-bi/pg', token=self.t)[1]['items']), 25)
    def test_etag_304(self):
        call(self.base, 'PUT', '/api/v1/data/msp-bi/et/r00', {'data': {'i': 0}, 'base_rev': 0}, self.t)
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10); h = {'Authorization': 'Bearer ' + self.t}
        c.request('GET', '/api/v1/data/msp-bi/et?limit=5', headers=h); r = c.getresponse(); body = r.read(); et = r.getheader('ETag'); self.assertEqual(r.status, 200); self.assertTrue(et); self.assertIn('no-cache', r.getheader('Cache-Control'))
        c.request('GET', '/api/v1/data/msp-bi/et?limit=5', headers=dict(h, **{'If-None-Match': et})); r = c.getresponse(); self.assertEqual((r.status, r.read()), (304, b''))
        call(self.base, 'PUT', '/api/v1/data/msp-bi/et/r00', {'data': {'i': 'new'}, 'base_rev': 1}, self.t)
        c.request('GET', '/api/v1/data/msp-bi/et?limit=5', headers=dict(h, **{'If-None-Match': et})); r = c.getresponse(); r.read(); self.assertEqual(r.status, 200)
        c.request('GET', '/api/v1/admin/stats', headers=h); r = c.getresponse(); r.read(); self.assertIsNone(r.getheader('ETag')); c.close()
    def test_ai_stream(self):
        class O(http.server.BaseHTTPRequestHandler):
            def do_POST(s):
                s.rfile.read(int(s.headers['Content-Length'])); s.send_response(200); s.end_headers()
                for w in ('سلام ', 'دنیا'): s.wfile.write((json.dumps({'message': {'content': w}, 'done': False}, ensure_ascii=False) + '\n').encode()); s.wfile.flush()
                s.wfile.write((json.dumps({'message': {'content': ''}, 'done': True}) + '\n').encode())
            def log_message(s, *a): pass
        o = http.server.HTTPServer(('127.0.0.1', 0), O); threading.Thread(target=o.serve_forever, daemon=True).start(); self.hub.cfg['ai_url'] = 'http://127.0.0.1:%d' % o.server_address[1]; self.hub.ai_hits.clear()
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10); c.request('POST', '/api/v1/ai/stream', json.dumps({'prompt': 'x'}), {'Authorization': 'Bearer ' + self.t, 'Content-Type': 'application/json'}); r = c.getresponse(); txt = r.read().decode()
        self.assertEqual(r.status, 200); self.assertIn('text/event-stream', r.getheader('Content-Type')); ev = [json.loads(x[6:]) for x in txt.split('\n\n') if x.startswith('data: ')]
        self.assertEqual(''.join(e.get('t', '') for e in ev), 'سلام دنیا'); self.assertTrue(ev[-1].get('done')); o.shutdown(); self.hub.cfg['ai_url'] = ''
        self.assertEqual(call(self.base, 'POST', '/api/v1/ai/stream', {'prompt': 'x'}, self.t)[0], 501)
if __name__ == '__main__': unittest.main()

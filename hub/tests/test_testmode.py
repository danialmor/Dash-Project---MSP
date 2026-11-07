import json, os, sys, tempfile, threading, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import server as S
from test_hub import call

class TM(unittest.TestCase):
    def test_test_mode_no_forced_change(self):
        with tempfile.TemporaryDirectory() as d:
            cfg = dict(S.DEF); cfg.update(port=0, data_dir=d, test_mode=True)
            srv = S.make_server(cfg); base = 'http://127.0.0.1:%d' % srv.server_address[1]; threading.Thread(target=srv.serve_forever, daemon=True).start(); h = srv.hub
            for slug in ('msp-bi', 'aide', 'admin'): h.q('INSERT OR IGNORE INTO sites VALUES(?,?,?,1,?,?)', (slug, slug, '/' + slug + '/', 'app', 0))
            c = h.q("INSERT INTO users(code,name,role,created) VALUES('Admin','admin','admin',0)"); h.set_pin(c.lastrowid, S.DEFAULT_PIN, mc=h.mc_default())
            self.assertTrue(call(base, 'GET', '/api/v1/health')[1]['test_mode'])
            s, l = call(base, 'POST', '/api/v1/auth/login', {'code': 'Admin', 'pin': 'Admin123'}); self.assertEqual((s, l['must_change']), (200, False))
            self.assertEqual(call(base, 'GET', '/api/v1/admin/stats', token=l['token'])[0], 200)
            s, r = call(base, 'POST', '/api/v1/admin/users', {'code': 'T1', 'name': 'test', 'role': 'member', 'grants': {'aide': 'member'}}, l['token']); self.assertEqual(r['pin'], 'Admin123')
            s, l2 = call(base, 'POST', '/api/v1/auth/login', {'code': 'T1', 'pin': 'Admin123'}); self.assertFalse(l2['must_change'])
            self.assertEqual(call(base, 'GET', '/api/v1/data/aide/events', token=l2['token'])[0], 200)
            srv.shutdown()

if __name__ == '__main__': unittest.main()

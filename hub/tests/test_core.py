"""Tests for the ecosystem core: module registry, event bus (Smart Integration Layer), cross-module relations."""
import os, sys, tempfile, threading, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import server as S
from test_hub import call

class Core(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(); cfg = dict(S.DEF); cfg.update(port=0, data_dir=cls.tmp.name, test_mode=True)
        cls.srv = S.make_server(cfg); cls.base = 'http://127.0.0.1:%d' % cls.srv.server_address[1]; threading.Thread(target=cls.srv.serve_forever, daemon=True).start(); h = cls.hub = cls.srv.hub
        for slug in ('msp-bi', 'aide', 'admin'): h.q('INSERT OR IGNORE INTO sites VALUES(?,?,?,1,?,?)', (slug, slug, '/' + slug + '/', 'app', 0))
        a = h.q("INSERT INTO users(code,name,role,created) VALUES('Admin','a','admin',0)"); h.set_pin(a.lastrowid, 'Admin123')
        m = h.q("INSERT INTO users(code,name,role,created) VALUES('pm1','PM','member',0)"); h.set_pin(m.lastrowid, 'Admin123'); h.q("INSERT INTO grants VALUES(?,?,?)", (m.lastrowid, 'msp-bi', 'member'))
        s = h.q("INSERT INTO users(code,name,role,created) VALUES('sec1','Sec','member',0)"); h.set_pin(s.lastrowid, 'Admin123'); h.q("INSERT INTO grants VALUES(?,?,?)", (s.lastrowid, 'aide', 'member'))
        tok = lambda c: call(cls.base, 'POST', '/api/v1/auth/login', {'code': c, 'pin': 'Admin123'})[1]['token']
        cls.ta, cls.tp, cls.ts = tok('Admin'), tok('pm1'), tok('sec1')
    @classmethod
    def tearDownClass(cls): cls.srv.shutdown(); cls.tmp.cleanup()
    def test_registry_public_and_access(self):
        s, r = call(self.base, 'GET', '/api/v1/modules'); self.assertEqual(s, 200); self.assertEqual(len(r['modules']), 12)
        self.assertEqual([m['slug'] for m in r['modules']][:3], ['project-control', 'training', 'messenger']); self.assertNotIn('site', r['modules'][0]); self.assertFalse(r['modules'][0]['access'])
        acc = {m['slug']: m['access'] for m in call(self.base, 'GET', '/api/v1/modules', token=self.tp)[1]['modules']}
        self.assertTrue(acc['project-control']); self.assertTrue(acc['mail']); self.assertFalse(acc['executive-desk']); self.assertFalse(acc['training'])
        self.assertTrue(all(m['access'] for m in call(self.base, 'GET', '/api/v1/modules', token=self.ta)[1]['modules']))
    def test_admin_upsert_module(self):
        self.assertEqual(call(self.base, 'POST', '/api/v1/admin/modules', {'slug': 'crm', 'name_fa': 'مشتریان', 'name_en': 'CRM', 'status': 'beta', 'path': '/crm/', 'site': 'msp-bi'}, self.tp)[0], 403)
        self.assertEqual(call(self.base, 'POST', '/api/v1/admin/modules', {'slug': 'crm', 'name_fa': 'مشتریان', 'name_en': 'CRM', 'status': 'beta', 'path': '/crm/', 'site': 'msp-bi'}, self.ta)[0], 200)
        m = [x for x in call(self.base, 'GET', '/api/v1/modules')[1]['modules'] if x['slug'] == 'crm'][0]; self.assertEqual((m['status'], m['path'], m['ord']), ('beta', '/crm/', 10))
        self.assertEqual(call(self.base, 'POST', '/api/v1/admin/modules', {'slug': 'x', 'name_fa': 'a', 'name_en': 'b', 'status': 'weird'}, self.ta)[0], 400)
    def test_event_bus(self):
        s, r = call(self.base, 'POST', '/api/v1/events', {'module': 'project-control', 'type': 'delay.requested', 'entity': 'delay', 'entity_id': 'f1', 'project': '1001', 'payload': {'days': 5}}, self.tp); self.assertEqual(s, 200)
        self.assertEqual(call(self.base, 'POST', '/api/v1/events', {'module': 'executive-desk', 'type': 'meeting.created'}, self.tp)[0], 403)
        self.assertEqual(call(self.base, 'POST', '/api/v1/events', {'module': 'executive-desk', 'type': 'meeting.created', 'project': '1001'}, self.ts)[0], 200)
        self.assertEqual(call(self.base, 'POST', '/api/v1/events', {'module': 'nope', 'type': 'x.y'}, self.ta)[0], 400)
        self.assertEqual(call(self.base, 'POST', '/api/v1/events', {'module': 'mail', 'type': 'Bad Type'}, self.ta)[0], 400)
        pm = call(self.base, 'GET', '/api/v1/events?since=0', token=self.tp)[1]; self.assertTrue(all(e['module'] != 'executive-desk' for e in pm['items'])); self.assertEqual(pm['items'][0]['payload'], {'days': 5})
        ad = call(self.base, 'GET', '/api/v1/events?since=0&project=1001', token=self.ta)[1]; self.assertGreaterEqual(len(ad['items']), 2)
        self.assertEqual(len(call(self.base, 'GET', '/api/v1/events?since=0&type=delay.*', token=self.ta)[1]['items']), 1)
        self.assertEqual(call(self.base, 'GET', '/api/v1/events?since=%d' % ad['seq'], token=self.ta)[1]['items'], [])
    def test_relations(self):
        L = {'a': {'module': 'mail', 'type': 'letter', 'id': 'L-7'}, 'b': {'module': 'project-control', 'type': 'delay', 'id': 'f1'}, 'rel': 'about'}
        self.assertEqual(call(self.base, 'POST', '/api/v1/relations', L, self.tp)[0], 200); self.assertEqual(call(self.base, 'POST', '/api/v1/relations', L, self.tp)[0], 200)
        r = call(self.base, 'GET', '/api/v1/relations?module=project-control&type=delay&id=f1', token=self.tp)[1]['items']; self.assertEqual(len(r), 1); self.assertEqual((r[0]['module'], r[0]['id'], r[0]['rel']), ('mail', 'L-7', 'about'))
        X = {'a': {'module': 'executive-desk', 'type': 'meeting', 'id': 'M1'}, 'b': {'module': 'project-control', 'type': 'delay', 'id': 'f1'}}
        self.assertEqual(call(self.base, 'POST', '/api/v1/relations', X, self.tp)[0], 403); self.assertEqual(call(self.base, 'POST', '/api/v1/relations', X, self.ta)[0], 200)
        self.assertEqual(len(call(self.base, 'GET', '/api/v1/relations?module=project-control&type=delay&id=f1', token=self.tp)[1]['items']), 1)
        self.assertEqual(len(call(self.base, 'GET', '/api/v1/relations?module=project-control&type=delay&id=f1', token=self.ta)[1]['items']), 2)
if __name__ == '__main__': unittest.main()

"""Tests for subscriptions (multi-tenancy): ecosystem admin console, owner panel, levels, seats, per-user codes,
data isolation between subscriptions, home redirect, remember-me, profile, signup requests."""
import json, os, sys, tempfile, threading, time, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import server as S
from test_hub import call

class Tenants(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(); cfg = dict(S.DEF); cfg.update(port=0, data_dir=cls.tmp.name, test_mode=True)
        cls.srv = S.make_server(cfg); cls.base = 'http://127.0.0.1:%d' % cls.srv.server_address[1]; threading.Thread(target=cls.srv.serve_forever, daemon=True).start(); h = cls.srv.hub
        for slug in ('msp-bi', 'aide', 'admin'): h.q('INSERT OR IGNORE INTO sites VALUES(?,?,?,1,?,?)', (slug, slug, '/' + slug + '/', 'app', 0))
        a = h.q("INSERT INTO users(code,name,role,created) VALUES('Admin','Danial','admin',0)"); h.set_pin(a.lastrowid, 'Admin123')
        cls.ta = cls.login('Admin')['token']
    @classmethod
    def tearDownClass(cls): cls.srv.shutdown(); cls.tmp.cleanup()
    @classmethod
    def login(cls, code, pin='Admin123', remember=True):
        s, r = call(cls.base, 'POST', '/api/v1/auth/login', {'code': code, 'pin': pin, 'remember': remember}); r['_s'] = s; return r
    def mk(self, name, owner, mods=('project-control', 'mail'), seats=4, lv=3, months=12):
        s, r = call(self.base, 'POST', '/api/v1/admin/tenants', {'name': name, 'owner': {'name': owner + ' boss', 'username': owner}, 'plan': 'pro', 'modules': list(mods), 'seats': seats, 'max_levels': lv, 'months': months}, self.ta)
        self.assertEqual(s, 200, r); return r
    def test_1_full_flow(self):
        t = self.mk('Acme Build', 'acme_admin'); self.assertRegex(t['code'], r'^T\d{3}$'); self.assertEqual(t['owner']['ucode'], t['code'] + '-0001')
        o = self.login('acme_admin'); self.assertTrue(o['panel']); self.assertEqual(o['home'], '/admin/'); self.assertEqual(o['tenant']['code'], t['code']); self.assertEqual(set(o['modules']), {'project-control', 'mail'})
        to = o['token']; ov = call(self.base, 'GET', '/api/v1/panel/overview', token=to)[1]; self.assertEqual((ov['sub']['seats'], ov['sub']['max_levels'], ov['used']), (4, 3, 1))
        self.assertEqual(call(self.base, 'PUT', '/api/v1/panel/levels', {'names': ['CEO', 'Manager', 'Engineer', 'Extra']}, to)[1]['levels'], ['CEO', 'Manager', 'Engineer'])
        s, u = call(self.base, 'POST', '/api/v1/panel/users', {'name': 'Site eng', 'username': 'acme_eng', 'level': 3, 'mods': ['project-control', 'crm']}, to); self.assertEqual(s, 200); self.assertEqual(u['ucode'], t['code'] + '-0002')
        self.assertEqual(call(self.base, 'POST', '/api/v1/panel/users', {'name': 'x', 'username': 'acme_x', 'level': 4}, to)[1]['error'], 'level-out-of-range')
        self.assertEqual(call(self.base, 'POST', '/api/v1/panel/users', {'name': 'x', 'username': 'Admin', 'level': 1}, to)[1]['error'], 'code-exists')
        e = self.login('acme_eng'); self.assertFalse(e['panel']); self.assertEqual(e['home'], '/msp-bi/'); self.assertEqual(e['modules'], ['project-control']); self.assertEqual(e['level'], 3)
        self.assertEqual(self.login(u['ucode'])['_s'], 200)  # login with the personal code works too
        te = e['token']; self.assertEqual(call(self.base, 'GET', '/api/v1/panel/overview', token=te)[0], 403); self.assertEqual(call(self.base, 'GET', '/api/v1/admin/tenants', token=to)[0], 403)
        self.assertEqual(call(self.base, 'GET', '/api/v1/data/aide/x', token=te)[0], 403)
        # isolation: same site/collection/id in two subscriptions and the ecosystem owner's own data
        self.assertEqual(call(self.base, 'PUT', '/api/v1/data/msp-bi/kv/mobdata', {'data': {'v': 'acme'}, 'base_rev': 0}, te)[0], 200)
        t2 = self.mk('Beta Co', 'beta_admin', mods=('project-control',)); tb = self.login('beta_admin')['token']
        self.assertEqual(call(self.base, 'GET', '/api/v1/data/msp-bi/kv', token=tb)[1]['items'], [])
        self.assertEqual(call(self.base, 'PUT', '/api/v1/data/msp-bi/kv/mobdata', {'data': {'v': 'beta'}, 'base_rev': 0}, tb)[0], 200)
        self.assertEqual(call(self.base, 'GET', '/api/v1/data/msp-bi/kv/mobdata', token=te)[1]['data'], {'v': 'acme'})
        self.assertEqual(call(self.base, 'GET', '/api/v1/data/msp-bi/kv', token=self.ta)[1]['items'], [])
        call(self.base, 'POST', '/api/v1/events', {'module': 'project-control', 'type': 'delay.requested'}, te)
        self.assertEqual(call(self.base, 'GET', '/api/v1/events?since=0', token=tb)[1]['items'], [])
        self.assertEqual(len(call(self.base, 'GET', '/api/v1/events?since=0', token=te)[1]['items']), 1)
        # profile
        p = call(self.base, 'PATCH', '/api/v1/me/profile', {'phone': '0913', 'title': 'Engineer'}, te)[1]; self.assertEqual(p['profile']['phone'], '0913'); self.assertEqual(p['ucode'], u['ucode'])
        # seats: 4 seats, used 2 → two more, then full
        for i in (1, 2): self.assertEqual(call(self.base, 'POST', '/api/v1/panel/users', {'name': 'u%d' % i, 'username': 'acme_u%d' % i, 'level': 1}, to)[0], 200)
        self.assertEqual(call(self.base, 'POST', '/api/v1/panel/users', {'name': 'u3', 'username': 'acme_u3', 'level': 1}, to)[1]['error'], 'no-seats')
        lst = call(self.base, 'GET', '/api/v1/panel/users', token=to)[1]['users']; self.assertEqual(len(lst), 4); eid = [x for x in lst if x['code'] == 'acme_eng'][0]['id']
        self.assertEqual(call(self.base, 'PATCH', '/api/v1/panel/users/%d' % eid, {'active': False}, to)[0], 200); self.assertEqual(self.login('acme_eng')['_s'], 401)
        oid = [x for x in lst if x['role'] == 'owner'][0]['id']; self.assertEqual(call(self.base, 'PATCH', '/api/v1/panel/users/%d' % oid, {'active': False}, to)[0], 400)
        # other tenant's owner cannot touch acme users
        self.assertEqual(call(self.base, 'PATCH', '/api/v1/panel/users/%d' % eid, {'active': True}, tb)[0], 404)
        # suspension blocks members, owner can still sign in to see the status
        tid = [x for x in call(self.base, 'GET', '/api/v1/admin/tenants', token=self.ta)[1]['tenants'] if x['code'] == t['code']][0]['id']
        self.assertEqual(call(self.base, 'PATCH', '/api/v1/admin/tenants/%d' % tid, {'status': 'suspended'}, self.ta)[0], 200)
        self.assertEqual(self.login('acme_u1')['error'], 'subscription-inactive'); o2 = self.login('acme_admin'); self.assertEqual(o2['_s'], 200); self.assertFalse(o2['tenant']['active']); self.assertEqual(o2['modules'], [])
        call(self.base, 'PATCH', '/api/v1/admin/tenants/%d' % tid, {'status': 'active'}, self.ta); self.assertEqual(self.login('acme_u1')['_s'], 200)
        # renew/change subscription
        self.assertEqual(call(self.base, 'POST', '/api/v1/admin/tenants/%d/subscription' % tid, {'plan': 'max', 'modules': ['project-control', 'mail', 'crm'], 'seats': 10, 'max_levels': 10, 'months': 24}, self.ta)[0], 200)
        d = call(self.base, 'GET', '/api/v1/admin/tenants/%d' % tid, token=self.ta)[1]; self.assertEqual(len(d['subs']), 2); self.assertEqual(d['subs'][0]['max_levels'], 10); self.assertEqual(len(d['users']), 4)
        self.assertEqual(call(self.base, 'POST', '/api/v1/admin/tenants/%d/subscription' % tid, {'modules': ['project-control'], 'max_levels': 50}, self.ta)[0], 200)
        self.assertEqual(call(self.base, 'GET', '/api/v1/admin/tenants/%d' % tid, token=self.ta)[1]['subs'][0]['max_levels'], 10)
    def test_2_expired_and_remember(self):
        t = self.mk('Old Co', 'old_admin', months=0); tid = [x for x in call(self.base, 'GET', '/api/v1/admin/tenants', token=self.ta)[1]['tenants'] if x['code'] == t['code']][0]['id']
        self.srv.hub.q('UPDATE subscriptions SET ends=? WHERE tenant_id=?', (time.time() - 10, tid))
        o = self.login('old_admin'); self.assertFalse(o['tenant']['active']); self.assertEqual(call(self.base, 'POST', '/api/v1/panel/users', {'name': 'a', 'username': 'old_a', 'level': 1}, o['token'])[0], 200)
        self.assertEqual(self.login('old_a')['error'], 'subscription-inactive')
        def exp(tok): import base64; p = tok.split('.')[0]; return json.loads(base64.urlsafe_b64decode(p + '=' * (-len(p) % 4)))['exp'] - time.time()
        self.assertGreater(exp(self.login('Admin', remember=True)['token']), 29 * 86400); self.assertLess(exp(self.login('Admin', remember=False)['token']), 1.1 * 86400)
    def test_3_signup(self):
        self.assertEqual(call(self.base, 'POST', '/api/v1/signup', {'name': 'Ali', 'company': 'X', 'phone': '0912'})[0], 200)
        self.assertEqual(call(self.base, 'POST', '/api/v1/signup', {'name': ''})[0], 400)
        it = call(self.base, 'GET', '/api/v1/admin/signups', token=self.ta)[1]['items']; self.assertEqual(it[0]['name'], 'Ali')
        self.assertEqual(call(self.base, 'PATCH', '/api/v1/admin/signups/%d' % it[0]['id'], {'status': 'contacted'}, self.ta)[0], 200)
    def test_9_activity_and_logout_all(self):
        tok = self.login('Admin')['token']
        st, r = call(self.base, 'GET', '/api/v1/me/activity', token=tok); self.assertEqual(st, 200); self.assertTrue(any(i['action'] == 'login' for i in r['items']))
        self.mk('Act Co', 'act_admin'); to = self.login('act_admin')['token']
        st, r = call(self.base, 'GET', '/api/v1/panel/activity', token=to); self.assertEqual(st, 200); self.assertTrue(all(i['user'] == 'act_admin' for i in r['items']) and r['items'])
        self.assertEqual(call(self.base, 'POST', '/api/v1/auth/logout-all', {}, tok)[0], 200)
        self.assertEqual(call(self.base, 'GET', '/api/v1/me', token=tok)[0], 401)
        self.__class__.ta = self.login('Admin')['token']
    def test_4_perms(self):
        self.mk('Perm Co', 'perm_admin', mods=('project-control', 'mail'), seats=6, lv=3); to = self.login('perm_admin')['token']
        g = call(self.base, 'GET', '/api/v1/panel/perms', token=to)[1]; self.assertEqual(g['max_levels'], 3)
        self.assertEqual(g['perms']['project-control'], {'view': 3, 'edit': 3, 'approve': 1})  # defaults: everyone sees and edits, only level 1 approves
        for i, lv in ((1, 1), (2, 2), (3, 3)): call(self.base, 'POST', '/api/v1/panel/users', {'name': 'p%d' % i, 'username': 'perm_p%d' % i, 'level': lv, 'mods': ['project-control', 'mail']}, to)
        r = call(self.base, 'PUT', '/api/v1/panel/perms', {'perms': {'project-control': {'view': 3, 'edit': 2, 'approve': 2}, 'mail': {'view': 2, 'edit': 9, 'approve': 1}, 'crm': {'view': 1}}}, to)[1]
        self.assertEqual(r['perms']['project-control'], {'view': 3, 'edit': 2, 'approve': 2}); self.assertEqual(r['perms']['mail'], {'view': 2, 'edit': 2, 'approve': 1}); self.assertNotIn('crm', r['perms'])
        p1, p2, p3 = (self.login('perm_p%d' % i)['perms'] for i in (1, 2, 3))
        self.assertEqual(p1['mail'], {'view': True, 'edit': True, 'approve': True}); self.assertTrue(p2['project-control']['approve']); self.assertFalse(p2['mail']['approve'])
        self.assertEqual(p3['project-control'], {'view': True, 'edit': False, 'approve': False}); self.assertFalse(p3['mail']['view'])
        self.assertTrue(all(all(v.values()) for v in self.login('perm_admin')['perms'].values()))  # the subscription admin has every right
        self.assertIsNone(self.login('Admin')['perms']); self.assertEqual(call(self.base, 'GET', '/api/v1/panel/perms', token=self.login('perm_p1')['token'])[0], 403)
if __name__ == '__main__': unittest.main()

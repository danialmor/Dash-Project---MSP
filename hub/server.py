#!/usr/bin/env python3
"""Danimor Hub — بک‌اند یکپارچه‌ی همه‌ی سایت‌ها (فقط کتابخانه‌ی استاندارد پایتون، بدون وابستگی بیرونی).
ذخیره‌ی آنلاین در SQLite · ورود با کد+PIN · نسخه‌بندی رکوردها (CAS) · همگام‌سازی دسته‌ای · ثبت‌نام سایت‌ها · ممیزی · پشتیبان · دروازه‌ی هوش مصنوعی."""
import base64, hashlib, hmac, json, os, re, secrets, sqlite3, sys, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

VERSION = '1.0.0'
HERE = os.path.dirname(os.path.abspath(__file__))
DEF = dict(host='127.0.0.1', port=8787, data_dir=os.path.join(HERE, 'data'), static_dir='', allowed_origins=[],
           token_ttl_days=30, ai_url='', ai_model='qwen2.5:7b', ai_rate_per_min=6, max_body=2 * 1024 * 1024, test_mode=False)

def load_config():
    c = dict(DEF); p = os.environ.get('HUB_CONFIG', os.path.join(HERE, 'config.json'))
    if os.path.exists(p):
        c.update(json.load(open(p, encoding='utf-8')))
    for k in ('host', 'port', 'data_dir', 'static_dir', 'ai_url', 'ai_model'):
        v = os.environ.get('HUB_' + k.upper())
        if v: c[k] = int(v) if k == 'port' else v
    tm = os.environ.get('HUB_TEST_MODE')
    if tm: c['test_mode'] = tm.lower() in ('1', 'true', 'yes')
    return c

SLUG = re.compile(r'^[a-z0-9][a-z0-9_-]{1,40}$'); CODE = re.compile(r'^[A-Za-z0-9_.-]{2,24}$'); ID = re.compile(r'^[A-Za-z0-9_.:-]{1,80}$')
ROLES = ('admin', 'manager', 'member', 'viewer', 'service')
EVT = re.compile(r'^[a-z][a-z0-9_.-]{1,59}$')
# Ecosystem module registry seed: (slug, name_fa, name_en, status, path, site, color, icon). 'site' = which site grant gives access.
MODULES = (
    ('project-control', 'کنترل پروژه', 'Project Control', 'live', '/msp-bi/', 'msp-bi', '#1f8fff', 'crane'),
    ('training', 'آموزش', 'Training', 'planned', '', '', '#14c79a', 'cap'),
    ('messenger', 'مسنجر مستقل', 'Messenger', 'live', '/msp-bi/', 'msp-bi', '#8b5cf6', 'chat'),
    ('users-panel', 'کنترل پنل کاربران', 'User Control Panel', 'live', '/admin/', 'admin', '#fb923c', 'users'),
    ('executive-desk', 'مدیرعامل و منشی', 'CEO & Secretary Desk', 'live', '/aide/', 'aide', '#22d3ee', 'tie'),
    ('mail', 'نامه‌نگاری و ایمیل', 'Letters & Email', 'live', '/msp-bi/', 'msp-bi', '#f43f5e', 'mail'),
    ('file-manager', 'فایل منیجر', 'File Manager', 'live', '/msp-bi/', 'msp-bi', '#38bdf8', 'folder'),
    ('portfolio', 'پرتفولیو', 'Portfolio', 'planned', '', '', '#a855f7', 'chart'),
    ('shared-cursor', 'موس مشترک', 'Shared Cursor', 'planned', '', '', '#06b6d4', 'cursor'),
    ('designer', 'صفحه طراح', 'Designer Workspace', 'planned', '', '', '#fbbf24', 'pal'),
    ('crm', 'مشتریان', 'CRM', 'planned', '', '', '#10b981', 'hand'),
    ('company-space', 'فضای اختصاصی شرکت', 'Company Space', 'planned', '', '', '#7c3aed', 'bld'),
)
MOD_SUMMARY = {
    'project-control': 'Scheduling, WBS, delays, daily reports, dashboards (msp-bi).', 'messenger': 'Internal chat; currently inside msp-bi.',
    'users-panel': 'Accounts, roles, site grants (admin control center).', 'executive-desk': 'CEO and secretary desk: calendars, meetings, notes (aide).',
    'mail': 'Formal letters with approval routes; currently inside msp-bi.', 'file-manager': 'Project documents and MSP files; currently inside msp-bi.',
}
DEFAULT_PIN = 'Admin123'   # رمز اولیه‌ی همه‌ی کاربران؛ با اولین ورود اجباراً عوض می‌شود
WEAK = {'admin123', '12345678', 'password', '123456789', '00000000', 'qwerty123', 'admin1234', 'admin@123'}

def now(): return time.time()
def b64(b): return base64.urlsafe_b64encode(b).decode().rstrip('=')
def unb64(s): return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))

class Hub:
    def __init__(self, cfg):
        self.cfg = cfg; os.makedirs(cfg['data_dir'], exist_ok=True)
        self.db = sqlite3.connect(os.path.join(cfg['data_dir'], 'hub.sqlite3'), check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row; self.lock = threading.RLock()
        self.db.execute('PRAGMA journal_mode=WAL'); self.db.execute('PRAGMA foreign_keys=ON'); self.db.execute('PRAGMA busy_timeout=5000')
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member',
          pin_hash TEXT, salt TEXT, active INTEGER NOT NULL DEFAULT 1, tv INTEGER NOT NULL DEFAULT 1, created REAL, last_login REAL, meta TEXT DEFAULT '{}');
        CREATE TABLE IF NOT EXISTS sites(slug TEXT PRIMARY KEY, title TEXT NOT NULL, path TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, kind TEXT DEFAULT 'app', created REAL);
        CREATE TABLE IF NOT EXISTS grants(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, site TEXT NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'member', PRIMARY KEY(user_id, site));
        CREATE TABLE IF NOT EXISTS records(site TEXT NOT NULL, coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, rev INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
          updated REAL, updated_by TEXT, PRIMARY KEY(site, coll, id));
        CREATE TABLE IF NOT EXISTS changes(seq INTEGER PRIMARY KEY AUTOINCREMENT, site TEXT, coll TEXT, id TEXT, rev INTEGER, op TEXT, ts REAL, by TEXT);
        CREATE INDEX IF NOT EXISTS ch_sc ON changes(site, coll, seq);
        CREATE TABLE IF NOT EXISTS ops(op_id TEXT PRIMARY KEY, result TEXT, ts REAL);
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, user TEXT, action TEXT, target TEXT, detail TEXT, ip TEXT);
        CREATE TABLE IF NOT EXISTS clients(device TEXT PRIMARY KEY, user TEXT, last_seen REAL, pending INTEGER DEFAULT 0, conflicts INTEGER DEFAULT 0, ua TEXT, ip TEXT, site TEXT);
        CREATE TABLE IF NOT EXISTS fails(k TEXT PRIMARY KEY, n INTEGER, first REAL);
        CREATE INDEX IF NOT EXISTS rec_sc ON records(site, coll, deleted, id);
        CREATE INDEX IF NOT EXISTS aud_ts ON audit(ts);
        CREATE INDEX IF NOT EXISTS aud_act ON audit(action, ts);
        CREATE INDEX IF NOT EXISTS aud_usr ON audit(user, ts);
        CREATE INDEX IF NOT EXISTS cl_seen ON clients(last_seen);
        CREATE INDEX IF NOT EXISTS ops_ts ON ops(ts);
        CREATE INDEX IF NOT EXISTS gr_site ON grants(site);
        CREATE TABLE IF NOT EXISTS modules(slug TEXT PRIMARY KEY, name_fa TEXT NOT NULL, name_en TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned',
          path TEXT DEFAULT '', site TEXT DEFAULT '', color TEXT DEFAULT '', icon TEXT DEFAULT '', ord INTEGER DEFAULT 0, summary_en TEXT DEFAULT '', updated REAL);
        CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, module TEXT NOT NULL, type TEXT NOT NULL, entity TEXT DEFAULT '', entity_id TEXT DEFAULT '',
          project TEXT DEFAULT '', actor TEXT DEFAULT '', payload TEXT DEFAULT '{}');
        CREATE INDEX IF NOT EXISTS ev_mod ON events(module, seq);
        CREATE INDEX IF NOT EXISTS ev_prj ON events(project, seq);
        CREATE TABLE IF NOT EXISTS relations(id INTEGER PRIMARY KEY AUTOINCREMENT, a_module TEXT, a_type TEXT, a_id TEXT, b_module TEXT, b_type TEXT, b_id TEXT, rel TEXT, ts REAL, by TEXT,
          UNIQUE(a_module, a_type, a_id, b_module, b_type, b_id, rel));
        CREATE INDEX IF NOT EXISTS rl_a ON relations(a_module, a_type, a_id);
        CREATE INDEX IF NOT EXISTS rl_b ON relations(b_module, b_type, b_id);''')
        sp = os.path.join(cfg['data_dir'], 'secret.key')
        if not os.path.exists(sp):
            fd = os.open(sp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600); os.write(fd, secrets.token_bytes(48)); os.close(fd)
        with open(sp, 'rb') as fh: self.secret = fh.read()
        self.ai_hits = {}

    def q(self, sql, a=()):
        with self.lock: return self.db.execute(sql, a)
    def one(self, sql, a=()):
        with self.lock: return self.db.execute(sql, a).fetchone()
    def all(self, sql, a=()):
        with self.lock: return [dict(r) for r in self.db.execute(sql, a).fetchall()]
    def log(self, user, action, target='', detail='', ip=''):
        self.q('INSERT INTO audit(ts,user,action,target,detail,ip) VALUES(?,?,?,?,?,?)', (now(), user, action, target, str(detail)[:500], ip))
    def hash_pin(self, pin, salt): return hashlib.scrypt(pin.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32).hex()
    def set_pin(self, uid, pin, mc=False):
        salt = secrets.token_bytes(16); self.q('UPDATE users SET pin_hash=?,salt=?,tv=tv+1,meta=? WHERE id=?', (self.hash_pin(pin, salt), salt.hex(), json.dumps({'mc': bool(mc)}), uid))
    def mc_default(self): return not self.cfg.get('test_mode')   # در حالت آزمایشی رمز اولیه اجباراً عوض نمی‌شود
    def mc(self, u):
        try: return bool(json.loads(u.get('meta') or '{}').get('mc'))
        except Exception: return False
    def sign(self, payload):
        body = b64(json.dumps(payload, separators=(',', ':')).encode()); return body + '.' + b64(hmac.new(self.secret, body.encode(), hashlib.sha256).digest())
    def verify(self, tok):
        try:
            body, sig = tok.split('.'); good = b64(hmac.new(self.secret, body.encode(), hashlib.sha256).digest())
            if not hmac.compare_digest(sig, good): return None
            p = json.loads(unb64(body))
            if p['exp'] < now(): return None
            u = self.one('SELECT * FROM users WHERE id=?', (p['u'],))
            if not u or not u['active'] or u['tv'] != p['tv']: return None
            return dict(u)
        except Exception: return None
    def issue(self, u, days=None):
        return self.sign({'u': u['id'], 'tv': u['tv'], 'exp': now() + 86400 * (days or self.cfg['token_ttl_days'])})
    def grants(self, u):
        if u['role'] == 'admin': return {s['slug']: 'admin' for s in self.all('SELECT slug FROM sites WHERE active=1')}
        return {g['site']: g['role'] for g in self.all('SELECT g.site,g.role FROM grants g JOIN sites s ON s.slug=g.site WHERE g.user_id=? AND s.active=1', (u['id'],))}
    def pub(self, u): return {'id': u['id'], 'code': u['code'], 'name': u['name'], 'role': u['role']}
    def can(self, u, site, write):
        g = self.grants(u).get(site)
        if not g: return False
        return g in ('admin', 'manager', 'member', 'service') if write else True

    def login(self, code, pin, device, ip):
        k = (ip + '|' + str(code)).lower()[:80]; f = self.one('SELECT * FROM fails WHERE k=?', (k,))
        if f and f['n'] >= 5 and now() - f['first'] < 600: return None, 'locked'
        u = self.one('SELECT * FROM users WHERE code=? COLLATE NOCASE', (str(code),))
        ok = False
        if u and u['active'] and u['pin_hash'] and u['role'] != 'service':
            ok = hmac.compare_digest(self.hash_pin(str(pin), bytes.fromhex(u['salt'])), u['pin_hash'])
        else: self.hash_pin('x', b'0' * 16)
        if not ok:
            if f and now() - f['first'] < 600: self.q('UPDATE fails SET n=n+1 WHERE k=?', (k,))
            else: self.q('INSERT OR REPLACE INTO fails VALUES(?,?,?)', (k, 1, now()))
            self.log(str(code), 'login-fail', '', '', ip); return None, 'bad'
        self.q('DELETE FROM fails WHERE k=?', (k,)); self.q('UPDATE users SET last_login=? WHERE id=?', (now(), u['id'])); self.log(u['code'], 'login', device, '', ip)
        return dict(u), None

    def put(self, u, site, coll, rid, data, base, op_id=None, delete=False):
        if not (SLUG.match(site) and SLUG.match(coll) and ID.match(rid)): return 400, {'error': 'bad-path'}
        if not self.can(u, site, True): return 403, {'error': 'forbidden'}
        with self.lock:
            if op_id:
                d = self.one('SELECT result FROM ops WHERE op_id=?', (op_id,))
                if d: return 200, json.loads(d['result'])
            cur = self.one('SELECT * FROM records WHERE site=? AND coll=? AND id=?', (site, coll, rid))
            crev = cur['rev'] if cur else 0
            if int(base or 0) != crev:
                return 409, {'error': 'conflict', 'rev': crev, 'current': (json.loads(cur['data']) if cur and not cur['deleted'] else None), 'deleted': bool(cur and cur['deleted'])}
            txt = json.dumps(data if not delete else {}, ensure_ascii=False)
            if len(txt) > 512 * 1024: return 413, {'error': 'too-large'}
            rev = crev + 1; ts = now()
            self.db.execute('BEGIN IMMEDIATE')
            try:
                self.db.execute('INSERT OR REPLACE INTO records VALUES(?,?,?,?,?,?,?,?)', (site, coll, rid, txt, rev, 1 if delete else 0, ts, u['code']))
                c = self.db.execute('INSERT INTO changes(site,coll,id,rev,op,ts,by) VALUES(?,?,?,?,?,?,?)', (site, coll, rid, rev, 'del' if delete else 'put', ts, u['code']))
                res = {'ok': True, 'rev': rev, 'seq': c.lastrowid, 'warnings': self.warnings(site, coll, rid, data) if not delete else []}
                if op_id: self.db.execute('INSERT OR REPLACE INTO ops VALUES(?,?,?)', (op_id, json.dumps(res), ts))
                self.db.execute('COMMIT')
            except Exception:
                self.db.execute('ROLLBACK'); raise
            return 200, res
    def warnings(self, site, coll, rid, data):
        if site == 'aide' and coll == 'events' and isinstance(data, dict) and data.get('start') and data.get('end'):
            w = []; mine = set(data.get('attendees') or [])
            for r in self.all("SELECT id,data FROM records WHERE site='aide' AND coll='events' AND deleted=0 AND id<>?", (rid,)):
                e = json.loads(r['data'])
                if e.get('start') and e.get('end') and e['start'] < data['end'] and data['start'] < e['end']:
                    common = mine & set(e.get('attendees') or [])
                    if common: w.append({'type': 'overlap', 'with': r['id'], 'title': e.get('title', ''), 'codes': sorted(common)})
            return w
        return []
    def feed(self, u, site, coll, since, limit):
        if not self.can(u, site, False): return 403, {'error': 'forbidden'}
        rows = self.all('SELECT c.seq,c.id,c.op,r.data,r.rev,r.deleted,r.updated,r.updated_by FROM changes c JOIN records r ON r.site=c.site AND r.coll=c.coll AND r.id=c.id '
                        'WHERE c.site=? AND c.coll=? AND c.seq>? AND c.rev=r.rev ORDER BY c.seq LIMIT ?', (site, coll, since, min(limit, 1000)))
        items = [{'id': r['id'], 'rev': r['rev'], 'deleted': bool(r['deleted']), 'data': None if r['deleted'] else json.loads(r['data']), 'updated': r['updated'], 'by': r['updated_by']} for r in rows]
        mx = self.one('SELECT COALESCE(MAX(seq),0) m FROM changes WHERE site=? AND coll=?', (site, coll))['m']
        return 200, {'items': items, 'seq': rows[-1]['seq'] if rows else since, 'head': mx}
    def snapshot(self, u, site, coll, limit=None, after=''):
        if not self.can(u, site, False): return 403, {'error': 'forbidden'}
        if limit:
            limit = max(1, min(int(limit), 1000))
            rows = self.all('SELECT id,data,rev,updated,updated_by FROM records WHERE site=? AND coll=? AND deleted=0 AND id>? ORDER BY id LIMIT ?', (site, coll, after, limit))
        else: rows = self.all('SELECT id,data,rev,updated,updated_by FROM records WHERE site=? AND coll=? AND deleted=0 ORDER BY id', (site, coll))
        mx = self.one('SELECT COALESCE(MAX(seq),0) m FROM changes WHERE site=? AND coll=?', (site, coll))['m']
        out = {'items': [{'id': r['id'], 'rev': r['rev'], 'data': json.loads(r['data']), 'updated': r['updated'], 'by': r['updated_by']} for r in rows], 'seq': mx}
        if limit: out['next'] = rows[-1]['id'] if len(rows) == limit else None
        return 200, out

    # ── Ecosystem core: module registry, event bus (Smart Integration Layer), cross-module relations ──
    def seed_modules(self):
        for i, m in enumerate(MODULES):
            self.q('INSERT OR IGNORE INTO modules(slug,name_fa,name_en,status,path,site,color,icon,ord,summary_en,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)', m + (i, MOD_SUMMARY.get(m[0], ''), now()))
    def module(self, slug): return self.one('SELECT * FROM modules WHERE slug=?', (slug,))
    def mod_access(self, u, m, write=False):
        if u['role'] == 'admin': return True
        site = m['site'] if m else ''
        return bool(site) and self.can(u, site, write)
    def publish(self, u, b):
        mod = str(b.get('module', '')); typ = str(b.get('type', ''))[:60]; m = self.module(mod)
        if not m or not EVT.match(typ): return 400, {'error': 'bad-event'}
        if not self.mod_access(u, m, True): return 403, {'error': 'forbidden'}
        pl = json.dumps(b.get('payload') or {}, ensure_ascii=False)
        if len(pl) > 16 * 1024: return 413, {'error': 'too-large'}
        c = self.q('INSERT INTO events(ts,module,type,entity,entity_id,project,actor,payload) VALUES(?,?,?,?,?,?,?,?)', (now(), mod, typ, str(b.get('entity', ''))[:60], str(b.get('entity_id', ''))[:120], str(b.get('project', ''))[:60], u['code'], pl))
        return 200, {'ok': True, 'seq': c.lastrowid}
    def events(self, u, since=0, module='', project='', typ='', limit=200):
        mods = [m['slug'] for m in self.all('SELECT * FROM modules') if self.mod_access(u, m)]
        if not mods: return {'items': [], 'seq': since}
        w = ['seq>?', 'module IN (%s)' % ','.join('?' * len(mods))]; a = [since] + mods
        if module: w.append('module=?'); a.append(module)
        if project: w.append('project=?'); a.append(project)
        if typ: w.append('type LIKE ?'); a.append(typ.rstrip('*') + '%' if typ.endswith('*') else typ)
        rows = self.all('SELECT * FROM events WHERE ' + ' AND '.join(w) + ' ORDER BY seq LIMIT ?', tuple(a) + (max(1, min(int(limit), 1000)),))
        for r in rows: r['payload'] = json.loads(r['payload'] or '{}')
        return {'items': rows, 'seq': rows[-1]['seq'] if rows else since}
    def relate(self, u, b):
        A = b.get('a') or {}; B = b.get('b') or {}; rel = str(b.get('rel', 'related'))[:40]
        ends = []
        for e in (A, B):
            m = self.module(str(e.get('module', '')))
            if not m or not str(e.get('type', '')) or not str(e.get('id', '')): return 400, {'error': 'bad-relation'}
            if not self.mod_access(u, m, True): return 403, {'error': 'forbidden'}
            ends.append((m['slug'], str(e['type'])[:40], str(e['id'])[:120]))
        self.q('INSERT OR IGNORE INTO relations(a_module,a_type,a_id,b_module,b_type,b_id,rel,ts,by) VALUES(?,?,?,?,?,?,?,?,?)', ends[0] + ends[1] + (rel, now(), u['code']))
        return 200, {'ok': True}
    def relations(self, u, module, typ, rid):
        rows = self.all('SELECT * FROM relations WHERE (a_module=? AND a_type=? AND a_id=?) OR (b_module=? AND b_type=? AND b_id=?) ORDER BY id', (module, typ, rid, module, typ, rid))
        ok = {}; out = []
        for r in rows:
            other = (r['b_module'], r['b_type'], r['b_id']) if (r['a_module'], r['a_type'], r['a_id']) == (module, typ, rid) else (r['a_module'], r['a_type'], r['a_id'])
            if other[0] not in ok: ok[other[0]] = self.mod_access(u, self.module(other[0]))
            if ok[other[0]]: out.append({'module': other[0], 'type': other[1], 'id': other[2], 'rel': r['rel'], 'ts': r['ts'], 'by': r['by']})
        return out

    def stats(self):
        c = getattr(self, '_stc', None)
        if c and now() - c[0] < 5: return c[1]
        v = self._stats(); self._stc = (now(), v); return v
    def _stats(self):
        g = lambda s: self.one(s)[0]
        dbp = os.path.join(self.cfg['data_dir'], 'hub.sqlite3')
        bk = os.path.join(self.cfg['data_dir'], 'backups'); last = max([os.path.getmtime(os.path.join(bk, f)) for f in os.listdir(bk)] or [0]) if os.path.isdir(bk) else 0
        return {'version': VERSION, 'users': g('SELECT COUNT(*) FROM users WHERE active=1'), 'sites': g('SELECT COUNT(*) FROM sites WHERE active=1'), 'records': g('SELECT COUNT(*) FROM records WHERE deleted=0'),
                'changes24h': g('SELECT COUNT(*) FROM changes WHERE ts>%f' % (now() - 86400)), 'logins24h': g("SELECT COUNT(*) FROM audit WHERE action='login' AND ts>%f" % (now() - 86400)),
                'failed24h': g("SELECT COUNT(*) FROM audit WHERE action='login-fail' AND ts>%f" % (now() - 86400)), 'pending': g('SELECT COALESCE(SUM(pending),0) FROM clients WHERE last_seen>%f' % (now() - 3600)),
                'conflicts': g('SELECT COALESCE(SUM(conflicts),0) FROM clients WHERE last_seen>%f' % (now() - 86400)), 'db_kb': round(os.path.getsize(dbp) / 1024), 'last_backup': last or None,
                'ai': bool(self.cfg['ai_url'])}
    def backup(self):
        bk = os.path.join(self.cfg['data_dir'], 'backups'); os.makedirs(bk, exist_ok=True)
        fn = os.path.join(bk, 'hub-' + time.strftime('%Y%m%d-%H%M%S') + '.sqlite3'); dst = sqlite3.connect(fn)
        with self.lock: self.db.backup(dst)
        self.q('DELETE FROM ops WHERE ts<?', (now() - 30 * 86400,)); self.q('DELETE FROM audit WHERE ts<?', (now() - 365 * 86400,))
        dst.close(); files = sorted(os.listdir(bk))
        for old in files[:-30]: os.remove(os.path.join(bk, old))
        return os.path.basename(fn)
    def export(self):
        return {'version': VERSION, 'ts': now(), 'users': [{k: v for k, v in u.items() if k not in ('pin_hash', 'salt')} for u in self.all('SELECT * FROM users')], 'sites': self.all('SELECT * FROM sites'),
                'grants': self.all('SELECT * FROM grants'), 'records': self.all('SELECT * FROM records')}

class H(BaseHTTPRequestHandler):
    server_version = 'DanimorHub/' + VERSION; protocol_version = 'HTTP/1.1'
    def log_message(self, *a): pass
    @property
    def hub(self): return self.server.hub
    def ip(self): return (self.headers.get('X-Forwarded-For') or self.client_address[0]).split(',')[0].strip()
    def send(self, code, obj=None, raw=None, ctype='application/json; charset=utf-8', extra=None):
        body = raw if raw is not None else json.dumps(obj, ensure_ascii=False).encode()
        et = None
        if code == 200 and getattr(self, '_etag', False) and ctype.startswith('application/json'):
            et = '"' + hashlib.sha1(body).hexdigest()[:20] + '"'
            if self.headers.get('If-None-Match') == et:
                self.send_response(304); self.send_header('ETag', et); self.send_header('Cache-Control', 'private, no-cache'); self.send_header('Vary', 'Authorization'); self.send_header('Content-Length', '0'); self.end_headers(); return
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body)))
        if et: self.send_header('ETag', et); self.send_header('Vary', 'Authorization')
        self.send_header('X-Content-Type-Options', 'nosniff'); self.send_header('Cache-Control', 'private, no-cache' if et else ('no-store' if ctype.startswith('application/json') else 'no-cache'))
        self.send_header('Referrer-Policy', 'same-origin'); o = self.headers.get('Origin')
        if o and o in self.hub.cfg['allowed_origins']: self.send_header('Access-Control-Allow-Origin', o); self.send_header('Vary', 'Origin')
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(body)
    def body(self):
        n = int(self.headers.get('Content-Length') or 0); self._read = True
        if n > self.hub.cfg['max_body']: self.close_connection = True; raise ValueError('too-large')
        raw = self.rfile.read(n) if n else b'{}'; return json.loads(raw or b'{}')
    def drain(self):  # بدنه‌ی خوانده‌نشده را بخوان تا درخواست بعدی روی همان اتصال خراب نشود
        if getattr(self, '_read', False): return
        n = int(self.headers.get('Content-Length') or 0)
        if n > self.hub.cfg['max_body']: self.close_connection = True
        elif n: self.rfile.read(n)
    def user(self):
        a = self.headers.get('Authorization', ''); t = a[7:] if a.startswith('Bearer ') else parse_qs(urlparse(self.path).query).get('token', [''])[0]
        return self.hub.verify(t) if t else None
    def do_OPTIONS(self):
        o = self.headers.get('Origin'); h = {}
        if o and o in self.hub.cfg['allowed_origins']: h = {'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE', 'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Device,X-Pending,X-Conflicts', 'Access-Control-Max-Age': '600'}
        self.send(204, raw=b'', extra=h)
    def do_GET(self): self.route('GET')
    def do_POST(self): self.route('POST')
    def do_PUT(self): self.route('PUT')
    def do_PATCH(self): self.route('PATCH')
    def do_DELETE(self): self.route('DELETE')
    def route(self, m):
        self._read = False; self._etag = False
        try:
            try: return self.route2(m)
            finally: self.drain()
        except Exception: pass
    def route2(self, m):
        try:
            p = urlparse(self.path).path
            if p.startswith('/api/'): return self.api(m, p)
            if m == 'GET' and self.hub.cfg['static_dir']: return self.static(p)
            self.send(404, {'error': 'not-found'})
        except ValueError as e: self.send(413 if 'large' in str(e) else 400, {'error': str(e)})
        except json.JSONDecodeError: self.send(400, {'error': 'bad-json'})
        except Exception as e:
            sys.stderr.write('ERR %r\n' % (e,)); self.send(500, {'error': 'server'})
    def static(self, p):
        root = os.path.realpath(self.hub.cfg['static_dir']); f = os.path.realpath(os.path.join(root, p.lstrip('/')))
        if os.path.isdir(f): f = os.path.join(f, 'index.html')
        if not (f.startswith(root + os.sep) or f == root) or not os.path.isfile(f): return self.send(404, {'error': 'not-found'})
        ct = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json'}.get(os.path.splitext(f)[1], 'application/octet-stream')
        self.send(200, raw=open(f, 'rb').read(), ctype=ct)
    def touch(self, u):
        d = self.headers.get('X-Device')
        if d: self.hub.q('INSERT OR REPLACE INTO clients VALUES(?,?,?,?,?,?,?,?)', (d[:60], u['code'], now(), int(self.headers.get('X-Pending') or 0), int(self.headers.get('X-Conflicts') or 0), (self.headers.get('User-Agent') or '')[:120], self.ip(), ''))
    def api(self, m, p):
        hub = self.hub; seg = [unquote(s) for s in p[len('/api/v1'):].split('/') if s] if p.startswith('/api/v1') else None
        if seg is None: return self.send(404, {'error': 'not-found'})
        if seg == ['health']: return self.send(200, {'ok': True, 'version': VERSION, 'time': now(), 'test_mode': bool(hub.cfg.get('test_mode'))})
        if seg == ['modules'] and m == 'GET':  # public registry; access flags only when signed in
            uu = self.user(); rows = hub.all('SELECT slug,name_fa,name_en,status,path,color,icon,ord,summary_en,site FROM modules ORDER BY ord')
            for r in rows:
                r['access'] = bool(uu) and hub.mod_access(uu, r)
                if not uu: r.pop('site', None)
            self._etag = True; return self.send(200, {'modules': rows})
        if seg == ['auth', 'login'] and m == 'POST':
            b = self.body(); u, err = hub.login(b.get('code', ''), b.get('pin', ''), str(b.get('device', ''))[:60], self.ip())
            if err == 'locked': return self.send(429, {'error': 'locked', 'retry_after': 600})
            if not u: return self.send(401, {'error': 'bad-credentials'})
            return self.send(200, {'token': hub.issue(u), 'user': hub.pub(u), 'grants': hub.grants(u), 'must_change': hub.mc(u)})
        u = self.user()
        if not u: return self.send(401, {'error': 'unauthorized'})
        self.touch(u)
        if hub.mc(u) and seg not in (['me'], ['auth', 'change-pin']): return self.send(403, {'error': 'must-change-pin'})
        if seg == ['auth', 'change-pin'] and m == 'POST':
            b = self.body(); old = str(b.get('old', '')); new = str(b.get('new', ''))
            if len(new) < 8 or new.lower() in WEAK or new.lower() == u['code'].lower() or new == old: return self.send(400, {'error': 'weak-pin'})
            u2, err = hub.login(u['code'], old, 'change', self.ip())
            if err == 'locked': return self.send(429, {'error': 'locked'})
            if not u2: return self.send(401, {'error': 'bad-credentials'})
            hub.set_pin(u['id'], new, False); hub.log(u['code'], 'pin-change', '', '', self.ip()); return self.send(200, {'token': hub.issue(dict(hub.one('SELECT * FROM users WHERE id=?', (u['id'],))))})
        if seg == ['me']: return self.send(200, {'user': hub.pub(u), 'grants': hub.grants(u), 'must_change': hub.mc(u)})
        if seg == ['sites'] and m == 'GET':
            g = hub.grants(u); self._etag = True; return self.send(200, {'sites': [s for s in hub.all('SELECT slug,title,path,kind FROM sites WHERE active=1') if s['slug'] in g]})
        if seg[0] == 'directory' and m == 'GET':
            site = (parse_qs(urlparse(self.path).query).get('site') or [''])[0]
            if not hub.can(u, site, False): return self.send(403, {'error': 'forbidden'})
            rows = hub.all('SELECT u.id,u.code,u.name,u.role,g.role AS site_role FROM users u JOIN grants g ON g.user_id=u.id WHERE g.site=? AND u.active=1 AND u.role<>"service" ORDER BY u.name', (site,))
            adm = hub.all('SELECT id,code,name,role,"admin" AS site_role FROM users WHERE role="admin" AND active=1')
            self._etag = True; return self.send(200, {'users': rows + [a for a in adm if a['id'] not in {r['id'] for r in rows}]})
        if seg[0] == 'data' and len(seg) in (3, 4):
            site, coll = seg[1], seg[2]
            if len(seg) == 3 and m == 'GET':
                qs = parse_qs(urlparse(self.path).query)
                if 'since' in qs: c, r = hub.feed(u, site, coll, int(qs['since'][0]), int((qs.get('limit') or ['500'])[0]))
                else: c, r = hub.snapshot(u, site, coll, (qs.get('limit') or [None])[0], (qs.get('after') or [''])[0])
                self._etag = True; return self.send(c, r)
            if len(seg) == 4 and m == 'GET':
                if not hub.can(u, site, False): return self.send(403, {'error': 'forbidden'})
                r = hub.one('SELECT id,data,rev,deleted,updated,updated_by FROM records WHERE site=? AND coll=? AND id=?', (site, coll, seg[3]))
                if not r or r['deleted']: return self.send(404, {'error': 'not-found', 'rev': r['rev'] if r else 0})
                self._etag = True; return self.send(200, {'id': r['id'], 'rev': r['rev'], 'data': json.loads(r['data']), 'updated': r['updated'], 'by': r['updated_by']})
            if len(seg) == 4 and m in ('PUT', 'DELETE'):
                b = self.body(); c, r = hub.put(u, site, coll, seg[3], b.get('data'), b.get('base_rev', 0), b.get('op_id'), delete=(m == 'DELETE'))
                if c == 200: hub.log(u['code'], 'put' if m == 'PUT' else 'del', '%s/%s/%s' % (site, coll, seg[3]), '', self.ip())
                return self.send(c, r)
        if seg == ['sync', 'batch'] and m == 'POST':
            b = self.body(); out = []
            for o in (b.get('ops') or [])[:200]:
                c, r = hub.put(u, o.get('site', ''), o.get('coll', ''), str(o.get('id', '')), o.get('data'), o.get('base_rev', 0), o.get('op_id'), delete=(o.get('type') == 'del'))
                out.append({'op_id': o.get('op_id'), 'status': 'ok' if c == 200 else ('conflict' if c == 409 else 'error'), 'code': c, **r})
            return self.send(200, {'results': out})
        if seg == ['events'] and m == 'POST': c, r = hub.publish(u, self.body()); return self.send(c, r)
        if seg == ['events'] and m == 'GET':
            qs = parse_qs(urlparse(self.path).query); g = lambda k, d='': (qs.get(k) or [d])[0]
            return self.send(200, hub.events(u, int(g('since', '0') or 0), g('module'), g('project'), g('type'), int(g('limit', '200') or 200)))
        if seg == ['relations'] and m == 'POST': c, r = hub.relate(u, self.body()); return self.send(c, r)
        if seg == ['relations'] and m == 'GET':
            qs = parse_qs(urlparse(self.path).query); g = lambda k: (qs.get(k) or [''])[0]
            return self.send(200, {'items': hub.relations(u, g('module'), g('type'), g('id'))})
        if seg == ['stream'] and m == 'GET': return self.stream(u)
        if seg == ['ai'] and m == 'POST': return self.ai(u)
        if seg == ['ai', 'stream'] and m == 'POST': return self.ai(u, stream=True)
        if seg[0] == 'admin':
            if u['role'] != 'admin': return self.send(403, {'error': 'forbidden'})
            return self.admin(m, seg[1:], u)
        self.send(404, {'error': 'not-found'})
    def stream(self, u):
        qs = parse_qs(urlparse(self.path).query); site = (qs.get('site') or [''])[0]; coll = (qs.get('coll') or [''])[0]
        if not self.hub.can(u, site, False): return self.send(403, {'error': 'forbidden'})
        self.send_response(200); self.send_header('Content-Type', 'text/event-stream'); self.send_header('Cache-Control', 'no-store'); self.send_header('X-Accel-Buffering', 'no'); self.send_header('Connection', 'close'); self.end_headers()
        self.close_connection = True; last = int((qs.get('since') or [0])[0]); t0 = now()
        try:
            while now() - t0 < 300:
                r = self.hub.one('SELECT COALESCE(MAX(seq),0) m FROM changes WHERE site=? AND coll=?', (site, coll))['m']
                if r > last: last = r; self.wfile.write(('data: {"seq":%d}\n\n' % r).encode()); self.wfile.flush()
                else: self.wfile.write(b': ping\n\n'); self.wfile.flush()
                time.sleep(1.5)
        except Exception: pass
    def ai(self, u, stream=False):
        hub = self.hub; b = self.body(); url = hub.cfg['ai_url']
        if not url: return self.send(501, {'error': 'ai-not-configured'})
        h = [t for t in hub.ai_hits.get(u['code'], []) if now() - t < 60]
        if len(h) >= hub.cfg['ai_rate_per_min']: return self.send(429, {'error': 'rate-limited'})
        h.append(now()); hub.ai_hits[u['code']] = h
        msgs = []
        if b.get('system'): msgs.append({'role': 'system', 'content': str(b['system'])[:4000]})
        msgs.append({'role': 'user', 'content': str(b.get('prompt', ''))[:12000]})
        if stream:  # کلمه‌به‌کلمه: کاربر منتظر پایان کل پاسخ نمی‌ماند
            try:
                req = urllib.request.Request(url.rstrip('/') + '/api/chat', json.dumps({'model': hub.cfg['ai_model'], 'messages': msgs, 'stream': True}).encode(), {'Content-Type': 'application/json'})
                resp = urllib.request.urlopen(req, timeout=120)
            except Exception: return self.send(502, {'error': 'ai-unreachable'})
            self.send_response(200); self.send_header('Content-Type', 'text/event-stream'); self.send_header('Cache-Control', 'no-store'); self.send_header('X-Accel-Buffering', 'no'); self.send_header('Connection', 'close'); self.end_headers(); self.close_connection = True
            try:
                for line in resp:
                    line = line.strip()
                    if not line: continue
                    j = json.loads(line); t = (j.get('message') or {}).get('content', '')
                    if t: self.wfile.write(('data: ' + json.dumps({'t': t}, ensure_ascii=False) + '\n\n').encode()); self.wfile.flush()
                    if j.get('done'): break
                self.wfile.write(b'data: {"done":true}\n\n'); self.wfile.flush(); hub.log(u['code'], 'ai-stream', '', len(str(b.get('prompt', ''))), self.ip())
            except Exception: pass
            return
        try:
            req = urllib.request.Request(url.rstrip('/') + '/api/chat', json.dumps({'model': hub.cfg['ai_model'], 'messages': msgs, 'stream': False}).encode(), {'Content-Type': 'application/json'})
            r = json.loads(urllib.request.urlopen(req, timeout=120).read()); hub.log(u['code'], 'ai', '', len(str(b.get('prompt', ''))), self.ip())
            return self.send(200, {'text': (r.get('message') or {}).get('content', ''), 'model': hub.cfg['ai_model']})
        except Exception: return self.send(502, {'error': 'ai-unreachable'})
    def admin(self, m, seg, adm):
        hub = self.hub
        if seg == ['stats']: return self.send(200, hub.stats())
        if seg == ['audit']:
            qs = parse_qs(urlparse(self.path).query); lim = min(int((qs.get('limit') or ['100'])[0]), 500); a = (qs.get('action') or [''])[0]
            return self.send(200, {'items': hub.all('SELECT id,ts,user,action,target,detail,ip FROM audit ' + ('WHERE action=? ' if a else '') + 'ORDER BY id DESC LIMIT ?', ((a,) if a else ()) + (lim,))})
        if seg == ['modules'] and m == 'POST':
            b = self.body(); slug = str(b.get('slug', '')).strip().lower()
            if not SLUG.match(slug) or not b.get('name_fa') or not b.get('name_en') or b.get('status', 'planned') not in ('live', 'beta', 'planned', 'retired'): return self.send(400, {'error': 'invalid'})
            hub.q('INSERT OR REPLACE INTO modules(slug,name_fa,name_en,status,path,site,color,icon,ord,summary_en,updated) VALUES(?,?,?,?,?,?,?,?,COALESCE(?,(SELECT ord FROM modules WHERE slug=?),99),?,?)',
                  (slug, str(b['name_fa'])[:60], str(b['name_en'])[:60], b.get('status', 'planned'), str(b.get('path', ''))[:80], str(b.get('site', ''))[:40], str(b.get('color', ''))[:20], str(b.get('icon', ''))[:20], b.get('ord'), slug, str(b.get('summary_en', ''))[:300], now()))
            hub.log(adm['code'], 'module-save', slug); return self.send(200, {'ok': True})
        if seg == ['clients']: return self.send(200, {'items': hub.all('SELECT device,user,last_seen,pending,conflicts,ua,ip FROM clients ORDER BY last_seen DESC LIMIT 200')})
        if seg == ['backup'] and m == 'POST': n = hub.backup(); hub.log(adm['code'], 'backup', n); return self.send(200, {'file': n})
        if seg == ['export'] and m == 'GET': hub.log(adm['code'], 'export'); return self.send(200, hub.export())
        if seg == ['users']:
            if m == 'GET':
                us = hub.all('SELECT id,code,name,role,active,created,last_login,meta FROM users ORDER BY id'); gs = hub.all('SELECT * FROM grants')
                for x in us: x['grants'] = {g['site']: g['role'] for g in gs if g['user_id'] == x['id']}; x['must_change'] = hub.mc(x); del x['meta']
                return self.send(200, {'users': us})
            if m == 'POST':
                b = self.body(); code = str(b.get('code', '')).strip(); name = str(b.get('name', '')).strip(); role = b.get('role', 'member')
                if not CODE.match(code) or not name or role not in ROLES: return self.send(400, {'error': 'invalid'})
                if hub.one('SELECT 1 FROM users WHERE code=? COLLATE NOCASE', (code,)): return self.send(409, {'error': 'code-exists'})
                pin = str(b.get('pin') or DEFAULT_PIN)
                if len(pin) < 4: return self.send(400, {'error': 'pin-short'})
                c = hub.q('INSERT INTO users(code,name,role,created) VALUES(?,?,?,?)', (code, name, role, now())); hub.set_pin(c.lastrowid, pin, mc=(pin == DEFAULT_PIN and hub.mc_default()))
                for s, r in (b.get('grants') or {}).items():
                    if hub.one('SELECT 1 FROM sites WHERE slug=?', (s,)): hub.q('INSERT OR REPLACE INTO grants VALUES(?,?,?)', (c.lastrowid, s, r if r in ROLES else 'member'))
                hub.log(adm['code'], 'user-create', code); return self.send(200, {'id': c.lastrowid, 'code': code, 'pin': pin})
        if len(seg) >= 2 and seg[0] == 'users' and seg[1].isdigit():
            uid = int(seg[1]); t = hub.one('SELECT * FROM users WHERE id=?', (uid,))
            if not t: return self.send(404, {'error': 'not-found'})
            if len(seg) == 3 and seg[2] == 'reset-pin' and m == 'POST':
                pin = DEFAULT_PIN; hub.set_pin(uid, pin, mc=hub.mc_default()); hub.log(adm['code'], 'pin-reset', t['code']); return self.send(200, {'pin': pin})
            if len(seg) == 2 and m == 'PATCH':
                b = self.body()
                if t['id'] == adm['id'] and (b.get('active') is False or (b.get('role') and b['role'] != 'admin')): return self.send(400, {'error': 'self-lockout'})
                if 'name' in b: hub.q('UPDATE users SET name=? WHERE id=?', (str(b['name'])[:80], uid))
                if b.get('role') in ROLES: hub.q('UPDATE users SET role=?,tv=tv+1 WHERE id=?', (b['role'], uid))
                if 'active' in b: hub.q('UPDATE users SET active=?,tv=tv+1 WHERE id=?', (1 if b['active'] else 0, uid))
                if isinstance(b.get('grants'), dict):
                    hub.q('DELETE FROM grants WHERE user_id=?', (uid,))
                    for s, r in b['grants'].items():
                        if hub.one('SELECT 1 FROM sites WHERE slug=?', (s,)): hub.q('INSERT OR REPLACE INTO grants VALUES(?,?,?)', (uid, s, r if r in ROLES else 'member'))
                hub.log(adm['code'], 'user-update', t['code']); return self.send(200, {'ok': True})
        if seg == ['sites']:
            if m == 'GET': return self.send(200, {'sites': hub.all('SELECT * FROM sites ORDER BY slug')})
            if m == 'POST':
                b = self.body(); slug = str(b.get('slug', '')).strip().lower()
                if not SLUG.match(slug) or not b.get('title'): return self.send(400, {'error': 'invalid'})
                hub.q('INSERT OR REPLACE INTO sites(slug,title,path,active,kind,created) VALUES(?,?,?,?,?,COALESCE((SELECT created FROM sites WHERE slug=?),?))', (slug, str(b['title'])[:80], str(b.get('path') or '/' + slug + '/')[:80], 0 if b.get('active') is False else 1, str(b.get('kind') or 'app')[:20], slug, now()))
                hub.log(adm['code'], 'site-save', slug); return self.send(200, {'ok': True})
        if seg == ['service-keys'] and m == 'POST':
            b = self.body(); site = str(b.get('site', ''))
            if not hub.one('SELECT 1 FROM sites WHERE slug=?', (site,)): return self.send(400, {'error': 'no-site'})
            code = 'svc-%s-%s' % (site, secrets.token_hex(2)); c = hub.q("INSERT INTO users(code,name,role,created) VALUES(?,?,'service',?)", (code, 'کلید اتصال ' + site + (' · ' + str(b.get('label'))[:30] if b.get('label') else ''), now()))
            hub.q('INSERT INTO grants VALUES(?,?,?)', (c.lastrowid, site, 'service')); u = dict(hub.one('SELECT * FROM users WHERE id=?', (c.lastrowid,)))
            hub.log(adm['code'], 'service-key', code); return self.send(200, {'code': code, 'token': hub.issue(u, 365)})
        self.send(404, {'error': 'not-found'})

def make_server(cfg):
    s = ThreadingHTTPServer((cfg['host'], cfg['port']), H); s.hub = Hub(cfg); s.hub.seed_modules(); s.daemon_threads = True; return s

def main():
    cfg = load_config(); a = sys.argv[1:]
    if a and a[0] == 'init':
        hub = Hub(cfg)
        if hub.one("SELECT 1 FROM users WHERE role='admin'"): print('مدیر از قبل وجود دارد.'); return
        pin = DEFAULT_PIN; c = hub.q("INSERT INTO users(code,name,role,created) VALUES('Admin','مدیر سیستم','admin',?)", (now(),)); hub.set_pin(c.lastrowid, pin, mc=hub.mc_default())
        for slug, title, path, kind in (('msp-bi', 'کنترل پروژه و داشبورد', '/msp-bi/', 'app'), ('aide', 'آید · میز منشی', '/aide/', 'app'), ('admin', 'مرکز کنترل', '/admin/', 'system')): hub.q('INSERT OR IGNORE INTO sites VALUES(?,?,?,1,?,?)', (slug, title, path, kind, now()))
        print('کد ورود: Admin\nرمز: ' + pin + ('\n(حالت آزمایشی: رمز اجباراً عوض نمی‌شود. قبل از کار واقعی test_mode را خاموش کنید.)' if cfg.get('test_mode') else '\n(با اولین ورود، سیستم رمز جدید می‌خواهد؛ همان لحظه عوضش کنید.)')); return
    if a and a[0] == 'backup': print(Hub(cfg).backup()); return
    s = make_server(cfg); print('Danimor Hub %s روی %s:%d' % (VERSION, cfg['host'], cfg['port']), flush=True)
    try: s.serve_forever()
    except KeyboardInterrupt: pass

if __name__ == '__main__': main()

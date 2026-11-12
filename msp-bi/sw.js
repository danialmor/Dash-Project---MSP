// Service Worker داشبورد پروژه‌ها — نسخه‌ی 3.46.0
const V='dash-v3.46.0',SHELL=['./','index.html','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png','icon-maskable-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('dash-')&&x!==V&&x!==V+'-fonts').map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  if(u.pathname.indexOf('/api/')>=0)return; // API هاب: هرگز روی دستگاه ذخیره نشود (منبع حقیقت فقط سرور است)
  if(u.origin===location.origin){
    if(u.pathname.indexOf('/data/')>=0){e.respondWith(fetch(r,{cache:'no-store'}));return} // داده: فقط شبکه، بدون ذخیره‌ی محلی
    if(/hub-bridge\.js$/.test(u.pathname)){e.respondWith(fetch(r,{cache:'no-store'}));return} // پل هاب: همیشه تازه‌ترین نسخه از سرور
    if(r.mode==='navigate'){ // اول شبکه (برای به‌روزرسانی)، بدون اینترنت همان نسخه‌ی ذخیره‌شده
      e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(V).then(c=>c.put('index.html',cp));return res}).catch(()=>caches.match('index.html')));return}
    e.respondWith(caches.match(r).then(h=>h||fetch(r).then(res=>{const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));return res})));return}
  if(/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)){ // فونت: ذخیره و هم‌زمان به‌روز
    e.respondWith(caches.open(V+'-fonts').then(c=>c.match(r).then(h=>{const n=fetch(r).then(res=>{c.put(r,res.clone());return res}).catch(()=>h);return h||n})))}
});

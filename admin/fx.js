/* IV — کنترل پنل کاربران · حرکت‌ها و آیکون‌های منو (قالب 3.0) */
(function () {
  'use strict';
  var P = window.TSP; if (!P) return; var $ = P.$, $$ = P.$$;
  var IC = {
    overview: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    sitemap: 'M10 3h4v4h-4zM12 7v5M6 15v-3h12v3M4 15h4v5H4zM10 15h4v5h-4zM16 15h4v5h-4z',
    tenants: 'M3 21h18M5 21V5l7-2v18M12 9l7 2v10M8.5 8v.01M8.5 12v.01M8.5 16v.01M15.5 14v.01M15.5 18v.01',
    signups: 'M4 13l2-8h12l2 8v6H4zM4 13h5l1 3h4l1-3h5',
    modules: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12L4 7.5M12 12v9',
    staff: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.4a6 6 0 0 1 3.5 5.6',
    users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.4a6 6 0 0 1 3.5 5.6',
    system: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
    billing: 'M3 6h18v12H3zM3 10h18M7 15h4',
    activity: 'M3 12h4l3-8 4 16 3-8h4',
    security: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6zM9 12l2 2 4-4',
    profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    levels: 'M4 18h16M7 13h10M10 8h4',
    perms: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 14.5v2',
    plan: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'
  };
  var prev = P.onNav;
  P.onNav = function () {
    if (prev) prev();
    $$('#nav button[data-go]').forEach(function (b) { if (b.querySelector('svg')) return; var d = IC[b.dataset.go]; if (d) b.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>') });
  };
  if (P.S && $('#nav .brand')) P.onNav();

  /* شمارش عددهای کاشی‌ها هنگام باز شدن صفحه */
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FA = '۰۱۲۳۴۵۶۷۸۹';
  function count(el) {
    var t = el.textContent.trim(); if (!/^[۰-۹0-9]{1,6}$/.test(t)) return; var fa = /[۰-۹]/.test(t), n = +t.replace(/[۰-۹]/g, function (c) { return FA.indexOf(c) }); if (!(n > 0)) return;
    var t0 = performance.now(), dur = 650, fmt = function (v) { var s = String(v); return fa ? s.replace(/\d/g, function (d) { return FA[d] }) : s };
    (function step(now) { var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(n * e)); if (k < 1) requestAnimationFrame(step) })(t0);
  }
  var pg = $('#pg');
  if (pg && !still && window.MutationObserver) new MutationObserver(function () { $$('#pg .kpi b').forEach(function (b) { if (!b._c) { b._c = 1; count(b) } }) }).observe(pg, { childList: true, subtree: true });
})();

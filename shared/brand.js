/* ریشه‌ی برند اکوسیستم — نام، لوگو، شعارها و دوازده پلتفرم.
   برای تغییر برند در همه‌ی صفحه‌ها فقط همین فایل (و در صورت نیاز تصویر لوگو) را عوض کنید.
   هر صفحه این فایل را در <head> بارگذاری می‌کند و جاهایی که data-brand دارند خودکار پر می‌شوند:
     data-brand="name"        نام برند            data-brand="logo"     تصویر لوگو (src و alt)
     data-brand="tagline-en"  شعار انگلیسی        data-brand="tagline-fa" شعار فارسی
     data-brand="motto"       شعار پایین صفحه     data-brand="favicon"  آیکون تب مرورگر
   در عنوان صفحه، {brand} با نام برند جایگزین می‌شود. */
(function () {
  'use strict';
  var me = document.currentScript, base = me ? new URL('../', me.src).href : '/';
  var B = {
    name: 'TSUBA',
    kanji: '鍔',
    tagline_en: 'Twelve Platforms · One Ecosystem',
    tagline_fa: 'اکوسیستم دوازده پلتفرم',
    motto: 'Balance · Purpose · Identity',
    logo: base + 'assets/tsuba-emblem.webp',
    logo_alt: 'TSUBA emblem: a gold sword guard framed by a green-leaf crest',
    base: base,
    /* شماره‌ی رومی، شناسه (همان شناسه‌ی هاب)، نام و توضیح انگلیسی و فارسی، رنگ، آیکون، نشانی */
    platforms: [
      ['I', 'project-control', 'Project Control', 'کنترل پروژه', 'Scheduling and project management', 'زمان‌بندی و مدیریت پروژه', '#e0262f', 'crane', 'msp-bi/'],
      ['II', 'training', 'Training', 'آموزش', 'Learning and development', 'یادگیری و توسعه‌ی مهارت', '#f25a22', 'cap', ''],
      ['III', 'messenger', 'Messenger', 'مسنجر', 'Company communication', 'گفت‌وگوی درون‌سازمانی', '#f7941d', 'chat', 'msp-bi/'],
      ['IV', 'users-panel', 'User Control Panel', 'کنترل پنل کاربران', 'Accounts and permissions', 'حساب‌ها و دسترسی‌ها', '#fbb817', 'users', 'admin/'],
      ['V', 'executive-desk', 'CEO & Secretary Desk', 'میز مدیرعامل و منشی', 'Management and decisions', 'مدیریت و تصمیم‌گیری', '#e8d200', 'tie', 'aide/'],
      ['VI', 'mail', 'Letters & Email', 'نامه‌نگاری و ایمیل', 'Smart correspondence', 'مکاتبات هوشمند', '#8dc63f', 'mail', 'msp-bi/'],
      ['VII', 'file-manager', 'File Manager', 'فایل منیجر', 'Documents and files', 'اسناد و فایل‌ها', '#00a650', 'folder', 'msp-bi/'],
      ['VIII', 'portfolio', 'Portfolio', 'پرتفولیو', 'Activity and profile analysis', 'تحلیل فعالیت و سوابق', '#00a99d', 'chart', ''],
      ['IX', 'shared-cursor', 'Shared Cursor', 'موس مشترک', 'Real-time collaboration', 'همکاری هم‌زمان', '#0072bc', 'cursor', ''],
      ['X', 'designer', 'Designer Workspace', 'فضای طراح', 'Design and creativity', 'طراحی و خلاقیت', '#2e3192', 'pal', ''],
      ['XI', 'crm', 'CRM', 'مشتریان', 'Clients and relationships', 'مشتریان و ارتباطات', '#662d91', 'hand', ''],
      ['XII', 'company-space', 'Company Space', 'فضای اختصاصی شرکت', 'Private company environment', 'محیط اختصاصی شرکت', '#c2185b', 'bld', '']
    ].map(function (p) { return { n: p[0], slug: p[1], en: p[2], fa: p[3], desc_en: p[4], desc_fa: p[5], color: p[6], icon: p[7], href: p[8] ? base + p[8] : '' } })
  };
  /* پلتفرم با شناسه */
  B.platform = function (slug) { for (var i = 0; i < B.platforms.length; i++) if (B.platforms[i].slug === slug) return B.platforms[i]; return null };
  /* «I — Project Control» یا «I — کنترل پروژه» */
  B.label = function (slug, lang) { var p = typeof slug === 'object' ? slug : B.platform(slug); return p ? p.n + ' \u2014 ' + (lang === 'fa' ? p.fa : p.en) : String(slug || '') };
  B.desc = function (slug, lang) { var p = typeof slug === 'object' ? slug : B.platform(slug); return p ? (lang === 'fa' ? p.desc_fa : p.desc_en) : '' };
  /* پر کردن جاهای data-brand در صفحه */
  B.apply = function (root) {
    root = root || document;
    [].forEach.call(root.querySelectorAll('[data-brand]'), function (el) {
      var k = el.getAttribute('data-brand');
      if (k === 'logo') { el.src = B.logo; if (el.hasAttribute('data-brand-alt')) el.alt = B.logo_alt }
      else if (k === 'favicon') el.href = B.logo;
      else if (k === 'name') el.textContent = B.name;
      else if (k === 'tagline-en') el.textContent = B.tagline_en;
      else if (k === 'tagline-fa') el.textContent = B.tagline_fa;
      else if (k === 'motto') el.textContent = B.motto;
    });
    if (document.title.indexOf('{brand}') >= 0) document.title = document.title.replace(/\{brand\}/g, B.name);
  };
  window.BRAND = B;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { B.apply() }); else B.apply();
})();

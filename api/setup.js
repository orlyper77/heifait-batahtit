// דף הגדרה ובדיקה להתראות — רק עם הקוד הסודי:  /api/setup?key=<NOTIFY_SECRET>
const { env, tg, tgAdmin, tgChannel, pushAll, pushAdmins, emailAdmin, sendDaily, SITE } = require('./_notify');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

module.exports = async (req, res) => {
  const key = String(req.query.key || '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!env('NOTIFY_SECRET')) return res.end(page('<p class="bad">עדיין לא הוגדר NOTIFY_SECRET ב-Vercel. מוסיפים אותו (מהתוצאה של notifications.sql), עושים Redeploy, ואז חוזרים לדף הזה.</p>'));
  if (key !== env('NOTIFY_SECRET')) { res.statusCode = 403; return res.end(page('<p class="bad">קוד שגוי. הכתובת צריכה להיות: /api/setup?key=הקוד הסודי</p>')); }

  const k = encodeURIComponent(key);
  let html = '';
  const row = (ok, name, note) => `<li class="${ok ? 'ok' : 'bad'}">${ok ? '✅' : '⬜'} <b>${name}</b> ${note || ''}</li>`;

  // בדיקה
  const test = String(req.query.test || '');
  if (test) {
    const demo = { id: 0, title: 'בדיקה — אירוע לדוגמה', date_raw: new Date().toISOString().slice(0, 10), time: '20:00', location: 'חיפה', price: 'כניסה חופשית', description: 'זו הודעת בדיקה מחיפאית בתחתית.', has_image: false, by_name: 'בדיקה' };
    let r;
    if (test === 'admin') r = await tgAdmin(demo, 'pending');
    if (test === 'unhook') r = await tg('deleteWebhook', {});
    if (test === 'email') r = await emailAdmin(demo, 'pending').catch(err => ({ ok: false, description: String(err) }));
    if (test === 'channel') r = await tgChannel(demo);
    if (test === 'daily') r = await sendDaily(env('TELEGRAM_ADMIN_CHAT_ID') || env('TELEGRAM_CHANNEL'), req.query.day && /^\d{4}-\d{2}-\d{2}$/.test(req.query.day) ? req.query.day : undefined).catch(err => ({ error: String(err) }));
    if (test === 'adminpush') r = await pushAdmins(demo).catch(err => ({ error: String(err) }));
    if (test === 'push') r = await pushAll(demo, { all: true, title: 'בדיקה מחיפאית בתחתית 🔔', body: 'ההתראות עובדות!', url: '/' }).catch(err => ({ error: String(err) }));
    html += `<div class="box"><b>תוצאת הבדיקה:</b><pre>${esc(JSON.stringify(r, null, 2))}</pre></div>`;
  }

  // 2. התראות לטלפון
  html += '<h2>התראות לטלפון</h2><ul>';
  const b64len = v => { try { return Buffer.from(String(v).replace(/-/g, '+').replace(/_/g, '/'), 'base64').length; } catch (_) { return 0; } };
  const pubV = env('VAPID_PUBLIC_KEY'), privV = env('VAPID_PRIVATE_KEY');
  const pubOk = b64len(pubV) === 65, privOk = b64len(privV) === 32;
  const hasV = pubOk && privOk;
  html += row(pubOk, 'VAPID_PUBLIC_KEY', !pubV ? '— חסר' : pubOk ? '' : `— לא תקין (אורך ${pubV.length} תווים, צריך 87)`);
  html += row(privOk, 'VAPID_PRIVATE_KEY', !privV ? '— חסר' : privOk ? '' : `— לא תקין (אורך ${privV.length} תווים, צריך 43)`);
  html += '</ul>';
  if (!hasV) {
    const keys = require('web-push').generateVAPIDKeys();
    const copyBtn = (id) => `<button class="btn" style="border:none;cursor:pointer;font-family:inherit" onclick="navigator.clipboard.writeText(document.getElementById('${id}').value);this.textContent='✓ הועתק'">העתקה</button>`;
    html += `<p>${pubV || privV ? '<b class="bad">אחד המפתחות לא הועתק נכון.</b> מוחקים ב-Vercel את שני המשתנים (VAPID_PUBLIC_KEY ו-VAPID_PRIVATE_KEY) ומוסיפים אותם מחדש עם הערכים האלה:' : 'הנה שני מפתחות חדשים שנוצרו עכשיו בשבילך (רק את רואה אותם). מעתיקים כל אחד ל-Vercel בשם שמופיע לידו:'}</p>
      <p><b>VAPID_PUBLIC_KEY</b> (${keys.publicKey.length} תווים)<br><input id="k1" readonly value="${keys.publicKey}" style="width:100%;direction:ltr;font-family:monospace;padding:6px" onclick="this.select()"> ${copyBtn('k1')}</p>
      <p><b>VAPID_PRIVATE_KEY</b> (${keys.privateKey.length} תווים)<br><input id="k2" readonly value="${keys.privateKey}" style="width:100%;direction:ltr;font-family:monospace;padding:6px" onclick="this.select()"> ${copyBtn('k2')}</p>
      <p class="muted">חשוב ששני המפתחות יהיו מאותה פתיחה של הדף (ריענון יוצר זוג חדש). אחרי השמירה — Redeploy, ואז ב-🔔 באתר: "ביטול התראות" ו"הפעלת התראות" מחדש.</p>`;
  } else {
    html += `<p>כדי לבדוק: הפעילי התראות באתר (כפתור 🔔) כשאת מחוברת כמנהלת, ואז:</p>
      <p><a class="btn" href="?key=${k}&test=adminpush">התראת "ממתין לאישור" — רק למנהלות</a> <a class="btn" href="?key=${k}&test=push">התראת בדיקה לכל המנויים</a></p>`;
  }
  // 1. טלגרם
  let me = null, chats = [];
  if (env('TELEGRAM_BOT_TOKEN')) {
    me = await tg('getMe', {});
    const up = await tg('getUpdates', { limit: 100 });
    const seen = new Map();
    (up.result || []).forEach(u => {
      const m = u.message || u.channel_post || u.my_chat_member || u.edited_message || {};
      const c = m.chat; if (c && !seen.has(c.id)) seen.set(c.id, c);
    });
    chats = [...seen.values()];
  }
  html += '<h2>טלגרם (לא חובה)</h2><ul>';
  html += row(!!(me && me.ok), 'TELEGRAM_BOT_TOKEN', me ? (me.ok ? `— הבוט: @${esc(me.result.username)}` : '— הטוקן לא תקין') : '— חסר');
  html += row(!!env('TELEGRAM_ADMIN_CHAT_ID'), 'TELEGRAM_ADMIN_CHAT_ID', env('TELEGRAM_ADMIN_CHAT_ID') ? '= ' + esc(env('TELEGRAM_ADMIN_CHAT_ID')) : '— חסר');
  html += row(!!env('TELEGRAM_CHANNEL'), 'TELEGRAM_CHANNEL', env('TELEGRAM_CHANNEL') ? '= ' + esc(env('TELEGRAM_CHANNEL')) : '— חסר');
  html += '</ul>';
  if (me && me.ok) {
    html += `<p>שיחות שהבוט רואה (שלחי לבוט הודעה כלשהי בטלגרם ורענני את הדף כדי שתופיעי כאן):</p>`;
    html += chats.length ? '<table><tr><th>שם</th><th>סוג</th><th>מספר (להעתקה)</th></tr>' + chats.map(c =>
      `<tr><td>${esc(c.title || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username)}</td><td>${c.type === 'private' ? 'פרטי (זו את)' : c.type === 'channel' ? 'ערוץ' : esc(c.type)}</td><td><code dir="ltr">${c.id}</code></td></tr>`).join('') + '</table>'
      : '<p class="muted">עדיין אין שיחות. פתחי את הבוט בטלגרם, לחצי Start, ורענני.</p>';
    html += `<p><a class="btn" href="?key=${k}&test=admin">שליחת הודעת בדיקה אליי</a> <a class="btn" href="?key=${k}&test=channel">פוסט בדיקה בערוץ</a></p>`;
    html += '<h3>סיכום יומי בערוץ (כל בוקר)</h3><ul>' + row(!!env('CRON_SECRET'), 'CRON_SECRET', env('CRON_SECRET') ? '' : '— חסר (להכניס את אותו קוד סודי כמו NOTIFY_SECRET)') + '</ul>';
    html += `<p><a class="btn" href="?key=${k}&test=daily">תצוגה מקדימה של סיכום היום — נשלח אלייך${env('TELEGRAM_ADMIN_CHAT_ID') ? '' : ' (או לערוץ, אם עוד לא הוגדר המספר שלך)'}</a></p>`;
  }

  // מייל למנהלת
  html += '<h2>מייל (לא חובה)</h2><ul>';
  html += row(!!env('RESEND_API_KEY'), 'RESEND_API_KEY', env('RESEND_API_KEY') ? '' : '— חסר');
  html += row(!!env('ADMIN_EMAIL'), 'ADMIN_EMAIL', env('ADMIN_EMAIL') ? '= ' + esc(env('ADMIN_EMAIL')) : '— חסר');
  html += '</ul>';
  if (env('RESEND_API_KEY') && env('ADMIN_EMAIL')) html += `<p><a class="btn" href="?key=${k}&test=email">שליחת מייל בדיקה</a></p>`;

  html += `<p class="muted">אחרי כל שינוי ב-Environment Variables צריך Redeploy ב-Vercel כדי שייכנס לתוקף.</p>`;
  res.end(page(html));
};

function page(body) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>הגדרת התראות</title><style>
body{font-family:system-ui,Arial,sans-serif;background:#160c0c;color:#f5ede8;max-width:760px;margin:0 auto;padding:20px;line-height:1.6}
h1{color:#d4e034;font-size:1.4rem}h2{margin-top:28px;font-size:1.15rem;border-bottom:1px solid #444;padding-bottom:4px}
ul{list-style:none;padding:0}li{margin:6px 0}code{background:#2b2222;padding:2px 6px;border-radius:4px;word-break:break-all;user-select:all}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #444;padding:6px 8px;text-align:right;vertical-align:top}
.btn{display:inline-block;background:#d4e034;color:#1a0505;padding:7px 14px;border-radius:6px;text-decoration:none;font-weight:700;margin:4px 0}
.bad{color:#ffb4a8}.muted{color:#aaa;font-size:.9em}.box{background:#2b2222;padding:10px;border-radius:8px}pre{white-space:pre-wrap;direction:ltr;text-align:left}
</style></head><body><h1>🔔 הגדרת התראות — חיפאית בתחתית</h1>${body}</body></html>`;
}

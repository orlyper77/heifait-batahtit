// רץ פעם ביום בערב (ראו vercel.json):
// 1) סיכום יומי למפרסמים — התראה לטלפון: כמה צפו / סימנו לב / לחצו על כרטיסים באירועים שלהם היום
// 2) (אם מוגדר ערוץ טלגרם) — הסיכום הישן לערוץ
const { env, sendDaily } = require('./_notify');
const { rpc } = require('./_db');

const n = (v, one, many) => v === 1 ? one : `${v} ${many}`;
function line(t) {
  const parts = [];
  if (t.d_views) parts.push(n(t.d_views, 'צפייה אחת', 'צפיות'));
  if (t.d_likes) parts.push(`${t.d_likes} ❤️`);
  if (t.d_tickets) parts.push(n(t.d_tickets, 'לחיצה אחת על כרטיסים', 'לחצו על כרטיסים'));
  if (t.d_calendar) parts.push(n(t.d_calendar, 'הוספה אחת ליומן', 'הוסיפו ליומן'));
  if (t.d_links) parts.push(n(t.d_links, 'לחיצה אחת על קישור', 'לחיצות על קישורים'));
  if (t.d_shares) parts.push(n(t.d_shares, 'שיתוף אחד', 'שיתופים'));
  return parts.join(' · ');
}

async function publisherDigest() {
  const secret = env('NOTIFY_SECRET');
  const pub = env('VAPID_PUBLIC_KEY'), priv = env('VAPID_PRIVATE_KEY');
  if (!secret || !pub || !priv) return { skipped: 'missing keys' };
  const rows = await rpc('publisher_digest', { p_secret: secret });
  if (!rows || !rows.length) return { users: 0 };

  // קיבוץ לפי מפרסם
  const byUser = new Map();
  rows.forEach(r => { const k = String(r.user_id); if (!byUser.has(k)) byUser.set(k, []); byUser.get(k).push(r); });

  const msgs = new Map();
  byUser.forEach((list, uid) => {
    list.sort((a, b) => (b.d_views + b.d_tickets * 5) - (a.d_views + a.d_tickets * 5));
    if (list.length === 1) {
      msgs.set(uid, { title: `📊 "${list[0].title}" היום`, body: line(list[0]) });
    } else {
      const sum = { d_views: 0, d_likes: 0, d_tickets: 0, d_calendar: 0, d_links: 0, d_shares: 0 };
      list.forEach(r => Object.keys(sum).forEach(k => sum[k] += r[k] || 0));
      msgs.set(uid, { title: `📊 הסיכום היומי שלך — ${list.length} אירועים`, body: line(sum) + `\nהכי פופולרי: ${list[0].title}` });
    }
  });

  const wp = require('web-push');
  wp.setVapidDetails('mailto:heifait.batahtit@gmail.com', pub, priv);
  const subs = await rpc('push_list', { p_secret: secret });
  let sent = 0, failed = 0;
  await Promise.all((subs || []).map(async s => {
    const m = s.user_id && msgs.get(String(s.user_id));
    if (!m) return;
    const payload = JSON.stringify({ title: m.title, body: m.body, url: '/?my=stats', tag: 'daily-digest' });
    try { await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12, urgency: 'low' }); sent++; }
    catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) await rpc('push_remove', { p_secret: secret, p_endpoint: s.endpoint }).catch(() => {});
      else failed++;
    }
  }));
  return { users: byUser.size, sent, failed };
}

module.exports = async (req, res) => {
  const auth = String(req.headers.authorization || '');
  const ok = [env('CRON_SECRET'), env('NOTIFY_SECRET')].some(s => s && auth === 'Bearer ' + s);
  if (!ok) { res.statusCode = 401; return res.end('unauthorized'); }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const out = {};
  try { out.digest = await publisherDigest(); } catch (err) { out.digestError = String(err); }
  const channel = env('TELEGRAM_CHANNEL');
  if (channel && env('DAILY_SUMMARY') !== 'off') {
    try { out.telegram = await sendDaily(channel); } catch (err) { out.telegramError = String(err); }
  }
  res.end(JSON.stringify(out));
};

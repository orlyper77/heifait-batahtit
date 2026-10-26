// נקרא אוטומטית מ-Supabase כשנוסף אירוע או כשאירוע מאושר (ראו notifications.sql)
const { env, tgAdmin, tgChannel, pushAll, pushAdmins, pushPublisherApproved, pushUserTrusted, emailAdmin } = require('./_notify');
const crypto = require('crypto');

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = []; for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' || !safeEqual(req.headers['x-notify-secret'], env('NOTIFY_SECRET'))) {
    res.statusCode = 403; return res.end('forbidden');
  }
  let body;
  try { body = await readBody(req); } catch (_) { res.statusCode = 400; return res.end('bad json'); }
  const e = body.event || {}, kind = body.kind;
  const out = {};
  try {
    if (kind === 'pending') {
      // למנהלת: טלגרם ו/או מייל — מה שמוגדר
      const [p, t, m] = await Promise.all([
        pushAdmins(e).catch(err => ({ error: String(err) })),
        env('TELEGRAM_ADMIN_CHAT_ID') ? tgAdmin(e, 'pending').catch(err => ({ ok: false, description: String(err) })) : null,
        env('RESEND_API_KEY') ? emailAdmin(e, 'pending').catch(err => ({ ok: false, description: String(err) })) : null
      ]);
      out.adminPush = p; out.admin = t; out.email = m;
    }
    if (kind === 'trusted') out.trusted = await pushUserTrusted(body.user_id).catch(err => ({ error: String(err) }));
    if (kind === 'approved') out.publisher = await pushPublisherApproved(e).catch(err => ({ error: String(err) }));
    if (kind === 'approved' || kind === 'published') {
      const [ch, push] = await Promise.all([
        env('TELEGRAM_CHANNEL') ? tgChannel(e).catch(err => ({ ok: false, description: String(err) })) : null,
        pushAll(e).catch(err => ({ error: String(err) }))
      ]);
      out.channel = ch; out.push = push;
    }
  } catch (err) { out.error = String(err); }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(out));
};

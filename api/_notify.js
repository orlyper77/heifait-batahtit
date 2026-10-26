// כלים משותפים להתראות: טלגרם + התראות לטלפון (Web Push)
// ההגדרות נשמרות ב-Vercel → Settings → Environment Variables (לא בקוד)
const { rpc } = require('./_db');

const SITE = 'https://heifait-batahtit.co.il';
const CAT_LABEL = { music: 'מוזיקה', theater: 'תאטרון', cinema: 'קולנוע', lectures: 'הרצאות', kids: 'ילדים', spirit: 'רוח', workshops: 'סדנאות', literature: 'ספרות', art: 'אמנות', parties: 'מסיבות', games: 'משחקים', fairs: 'ירידים', community: 'קהילתי', standup: 'סטנדאפ', tours: 'סיורים', performance: 'פרפורמנס', fringe: "פרינג'", festivals: 'פסטיבלים', laughs: 'צחוקים', jazz: "ג'אז", dance: 'מחול', classic: 'קלאסי', poetry: 'שירה', openstage: 'במה פתוחה', pubquiz: 'פאב קוויז', karaoke: 'קריוקי', secondhand: 'יד 2', pride: 'גאווה', other: 'אחר', general: 'אחר' };

const env = k => (process.env[k] || '').trim();
const escHtml = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function eventCats(e) {
  let c = e.cats;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch (_) { c = null; } }
  if (!Array.isArray(c) || !c.length) c = e.cat ? [e.cat] : [];
  return c;
}
function heDate(raw) {
  if (!raw) return '';
  const d = new Date(raw + 'T12:00:00Z');
  return isNaN(d) ? '' : d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' });
}
function whenText(e) {
  const date = heDate(e.date_raw) + (e.date_end_raw && e.date_end_raw > e.date_raw ? ' – ' + heDate(e.date_end_raw) : '');
  return [date, e.time && e.time !== '-' ? e.time : ''].filter(Boolean).join(' | ');
}
const eventLink = e => `${SITE}/e/${encodeURIComponent(e.id)}`;
const imageLink = e => `${SITE}/api/img?id=${encodeURIComponent(e.id)}&v=${Date.now()}`;

// ── טלגרם ──
async function tg(method, payload) {
  const token = env('TELEGRAM_BOT_TOKEN');
  if (!token) return { ok: false, description: 'TELEGRAM_BOT_TOKEN חסר' };
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return r.json().catch(() => ({ ok: false, description: 'bad response' }));
}

// כפתור בהודעה למנהלת: פותח באתר את רשימת האירועים שממתינים לאישור
function adminButtons() {
  return { inline_keyboard: [[{ text: '👁 לצפייה ואישור באתר', url: `${SITE}/?approvals` }]] };
}
// הודעה למנהלת: אירוע חדש ממתין לאישור
async function tgAdmin(e, kind) {
  const chat = env('TELEGRAM_ADMIN_CHAT_ID');
  if (!chat) return { ok: false, description: 'TELEGRAM_ADMIN_CHAT_ID חסר' };
  const head = kind === 'pending' ? '🆕 <b>אירוע חדש ממתין לאישור</b>' : '✅ <b>פורסם אירוע חדש</b>';
  const by = [e.by_name, e.by_email].filter(Boolean).join(' · ');
  const desc = e.description ? escHtml(String(e.description).slice(0, 300)) + (String(e.description).length > 300 ? '…' : '') : '';
  const text = [head, '', `<b>${escHtml(e.title)}</b>`, '📅 ' + escHtml(whenText(e)), e.location && '📍 ' + escHtml(e.location),
    e.price && '🎟 ' + escHtml(e.price), by && '👤 ' + escHtml(by), desc && '\n' + desc]
    .filter(x => x || x === '').join('\n');
  const reply_markup = kind === 'pending' ? adminButtons() : undefined;
  const chats = chat.split(',').map(s => s.trim()).filter(Boolean);
  const results = [];
  for (const c of chats) results.push(await tg('sendMessage', { chat_id: c, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup }));
  return results.find(r => !r.ok) || results[0];
}

// פוסט בערוץ: אירוע שאושר
async function tgChannel(e) {
  const channel = env('TELEGRAM_CHANNEL');
  if (!channel) return { ok: false, description: 'TELEGRAM_CHANNEL חסר' };
  const cats = eventCats(e).map(c => '#' + (CAT_LABEL[c] || c).replace(/[\s']/g, '_')).join(' ');
  const desc = e.description ? escHtml(String(e.description).slice(0, 350)) + (String(e.description).length > 350 ? '…' : '') : '';
  const caption = [`<b>${escHtml(e.title)}</b>`, '', '📅 ' + escHtml(whenText(e)), e.location ? '📍 ' + escHtml(e.location) : '',
    e.price ? '🎟 ' + escHtml(e.price) : '', desc ? '\n' + desc : '', '', `<a href="${eventLink(e)}">לפרטים ←</a>`, cats]
    .filter(x => x !== '').join('\n').slice(0, 1020);
  if (e.has_image) {
    const r = await tg('sendPhoto', { chat_id: channel, photo: imageLink(e), caption, parse_mode: 'HTML' });
    if (r.ok) return r;
  }
  return tg('sendMessage', { chat_id: channel, text: caption, parse_mode: 'HTML' });
}

// שם המקום בצורה אחידה (כמו באתר): החלק הראשון בכתובת, בלי גרשיים, תיאטרון=תאטרון
const venueKey = s => String(s || '').split(',')[0].replace(/["'״׳]/g, '').replace(/תיאטרון/g, 'תאטרון').replace(/\s+/g, ' ').trim().toLowerCase();

// ── התראות לטלפון (Web Push) ──
function webpush() {
  const pub = env('VAPID_PUBLIC_KEY'), priv = env('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return null;
  const wp = require('web-push');
  wp.setVapidDetails('mailto:heifait.batahtit@gmail.com', pub, priv);
  return wp;
}
async function pushAll(e, opts = {}) {
  const wp = webpush();
  if (!wp) return { sent: 0, error: 'מפתחות VAPID חסרים' };
  const secret = env('NOTIFY_SECRET');
  const subs = await rpc('push_list', { p_secret: secret });
  const cats = eventCats(e).map(c => c === 'general' ? 'other' : c);
  const evVenue = venueKey(e.location);
  const payload = JSON.stringify({
    title: opts.title || 'אירוע חדש: ' + e.title,
    body: opts.body || [whenText(e), e.location].filter(Boolean).join('\n'),
    url: opts.url || `/?event=${encodeURIComponent(e.id)}`,
    image: e.has_image && !opts.admins ? imageLink(e) : undefined,
    tag: 'event-' + e.id
  });
  let sent = 0, removed = 0, failed = 0;
  await Promise.all((subs || []).map(async s => {
    if (opts.userId) { if (String(s.user_id || '') !== String(opts.userId)) return; }        // התראה אישית למשתמש אחד
    else if (opts.admins ? !s.is_admin : (!opts.all && s.is_admin)) return;   // למנהלות — רק התראות אישור
    if (!opts.userId && !opts.admins && !opts.all && e.user_id && String(s.user_id || '') === String(e.user_id)) return;   // המפרסם מקבל התראה אישית במקום הכללית
    if (!opts.all && !opts.admins && !opts.userId) {
      // בחירה לפי קטגוריות ו/או מקומות: מספיק שאחד מהם מתאים. בלי בחירה בכלל = הכול
      const sc = s.cats || [], sv = s.venues || [];
      if (sc.length || sv.length) {
        const catOk = sc.length && cats.some(c => sc.includes(c));
        const venueOk = sv.length && evVenue && sv.some(v => venueKey(v) === evVenue);
        if (!catOk && !venueOk) return;
      }
    }
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: 'normal' });
      sent++;
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        removed++;
        await rpc('push_remove', { p_secret: secret, p_endpoint: s.endpoint }).catch(() => {});
      } else failed++;
    }
  }));
  return { sent, removed, failed, total: (subs || []).length };
}
// התראה אישית למפרסם
function pushPublisherApproved(e) {
  if (!e.user_id) return Promise.resolve({ sent: 0 });
  return pushAll(e, { userId: e.user_id, title: '🎉 האירוע שלך אושר ופורסם!', body: e.title, url: `/?event=${encodeURIComponent(e.id)}` });
}
function pushUserTrusted(userId) {
  return pushAll({ id: 'trusted', has_image: false }, { userId, title: '⭐ את/ה מאושר/ת מראש!', body: 'מעכשיו האירועים שלך בחיפאית בתחתית מתפרסמים מיד, בלי לחכות לאישור.', url: '/' });
}
// התראה למנהלות: אירוע חדש ממתין לאישור
function pushAdmins(e) {
  const by = e.by_name ? ' · ' + e.by_name : '';
  return pushAll(e, { admins: true, title: '🆕 ממתין לאישור: ' + e.title, body: [whenText(e), (e.location || '') + by].filter(Boolean).join('\n'), url: '/?approvals' });
}

// ── מייל למנהלת (דרך Resend) ──
async function emailAdmin(e, kind) {
  const key = env('RESEND_API_KEY'), to = env('ADMIN_EMAIL');
  if (!key || !to) return { ok: false, description: 'RESEND_API_KEY או ADMIN_EMAIL חסר' };
  const by = [e.by_name, e.by_email].filter(Boolean).join(' · ');
  const link = kind === 'pending' ? SITE + '/?approvals' : eventLink(e);
  const row = (icon, v) => v ? `<p style="margin:4px 0">${icon} ${escHtml(v)}</p>` : '';
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222">
    <p style="margin:0 0 10px;color:#666">${kind === 'pending' ? '🆕 אירוע חדש ממתין לאישור' : '✅ פורסם אירוע חדש'}</p>
    <h2 style="margin:0 0 8px">${escHtml(e.title)}</h2>
    ${row('📅', whenText(e))}${row('📍', e.location)}${row('🎟', e.price)}${row('👤', by)}
    ${e.description ? `<p style="margin:10px 0;color:#555;white-space:pre-wrap">${escHtml(String(e.description).slice(0, 400))}</p>` : ''}
    <p style="margin-top:18px"><a href="${link}" style="background:#d4e034;color:#1a0505;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">${kind === 'pending' ? 'לצפייה ואישור באתר' : 'לאירוע באתר'}</a></p>
  </div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env('EMAIL_FROM') || 'חיפאית בתחתית <onboarding@resend.dev>',
      to: to.split(',').map(x => x.trim()).filter(Boolean),
      subject: (kind === 'pending' ? 'ממתין לאישור: ' : 'פורסם: ') + e.title,
      html
    })
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, id: j.id } : { ok: false, description: j.message || ('status ' + r.status) };
}

// ── סיכום יומי: כל אירועי היום ברשימה אחת ──
function israelToday() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
async function todaysEvents(day) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('./_db');
  const q = `select=id,title,time,location,price,cat,cats,date_raw,date_end_raw,status&date_raw=lte.${day}&or=(date_raw.eq.${day},date_end_raw.gte.${day})`;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/events?${q}`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } });
  if (!r.ok) throw new Error('supabase ' + r.status);
  const rows = (await r.json()).filter(e => !e.status || e.status === 'approved');
  const mins = e => { const m = String(e.time || '').match(/(\d{1,2})[:.](\d{2})/); return m ? (+m[1] < 5 ? +m[1] + 24 : +m[1]) * 60 + +m[2] : 9999; };
  return rows.sort((a, b) => mins(a) - mins(b) || String(a.title).localeCompare(String(b.title), 'he'));
}
function dailyMessages(events, day) {
  const d = new Date(day + 'T12:00:00Z').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' });
  const today = events.filter(e => !(e.date_end_raw && e.date_end_raw > e.date_raw));
  const ongoing = events.filter(e => e.date_end_raw && e.date_end_raw > e.date_raw);
  const item = e => {
    const emoji = { music: '🎵', theater: '🎭', cinema: '🎬', lectures: '🎤', kids: '🧒', spirit: '✨', workshops: '🛠', literature: '📚', art: '🎨', parties: '🎉', games: '🎮', fairs: '🏪', community: '🤝', standup: '🎙', tours: '🗺', performance: '💃', fringe: '🌀', festivals: '🎪', laughs: '😂', jazz: '🎷', dance: '💃', classic: '🎻', poetry: '✒️', openstage: '🗣', pubquiz: '🧠', karaoke: '🎶', secondhand: '♻️', pride: '🏳️‍🌈', other: '📌' }[eventCats(e)[0]] || '📌';
    const time = e.time && e.time !== '-' ? `<b>${escHtml(e.time)}</b> · ` : '';
    return `${emoji} ${time}<a href="${eventLink(e)}">${escHtml(e.title)}</a>` + (e.location ? `\n      📍 ${escHtml(String(e.location).replace(/,\s*חיפה\s*$/, ''))}` : '');
  };
  const parts = [`☀️ <b>מה קורה היום בחיפה</b>\n${escHtml(d)} · ${events.length} אירועים`];
  if (today.length) parts.push(today.map(item).join('\n\n'));
  if (ongoing.length) parts.push('<b>ממשיכים גם היום:</b>\n' + ongoing.map(item).join('\n\n'));
  parts.push(`<a href="${SITE}/">כל האירועים באתר ←</a>`);
  // טלגרם מגביל הודעה ל-4096 תווים — מפצלים אם צריך
  const msgs = []; let cur = '';
  for (const block of parts.join('\n\n').split('\n\n')) {
    if ((cur + '\n\n' + block).length > 3900 && cur) { msgs.push(cur); cur = block; }
    else cur = cur ? cur + '\n\n' + block : block;
  }
  if (cur) msgs.push(cur);
  return msgs;
}
async function sendDaily(chatId, day) {
  day = day || israelToday();
  const events = await todaysEvents(day);
  if (!events.length) return { ok: true, skipped: 'אין אירועים היום' };
  const msgs = dailyMessages(events, day);
  const results = [];
  for (const text of msgs) results.push(await tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }));
  return { ok: results.every(r => r.ok), events: events.length, messages: msgs.length, errors: results.filter(r => !r.ok).map(r => r.description) };
}

module.exports = { SITE, env, tg, tgAdmin, tgChannel, pushAll, pushAdmins, pushPublisherApproved, pushUserTrusted, whenText, emailAdmin, sendDaily, israelToday };

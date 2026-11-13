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

// אמן שנבחר בהתראות: השם שלו מופיע בשם האירוע (או בתיאור, לשמות ארוכים) — אותו כלל של "דף אמן" באתר
const artistNorm = s => String(s || '').toLowerCase().replace(/["'״׳.,!?־\-–—:;()]/g, ' ').replace(/\s+/g, ' ').trim();
function artistNameInEvent(name, e) {
  const n = artistNorm(name);
  if (n.length < 2) return false;
  const has = t => (' ' + artistNorm(t) + ' ').includes(' ' + n + ' ');
  return has(e.title) || (n.length >= 5 && has(e.description));
}

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
  const base = {
    title: opts.title || 'אירוע חדש: ' + e.title,
    body: opts.body || [whenText(e), e.location].filter(Boolean).join('\n'),
    url: opts.url || `/?event=${encodeURIComponent(e.id)}`,
    image: e.has_image && !opts.admins ? imageLink(e) : undefined,
    tag: 'event-' + e.id
  };
  const payload = JSON.stringify(base);
  // ניסוח אישי: כשההתראה נשלחת בגלל אמן או מקום שהמנוי בחר — הכותרת אומרת את זה
  const personal = why => JSON.stringify({ ...base,
    title: why.artist ? `🎨 ${why.artist}: אירוע חדש` : `📍 ${why.venue}: אירוע חדש`,
    body: [e.title, whenText(e), why.artist ? e.location : ''].filter(Boolean).join('\n') });
  let sent = 0, removed = 0, failed = 0;
  await Promise.all((subs || []).map(async s => {
    if (opts.userId) { if (String(s.user_id || '') !== String(opts.userId)) return; }        // התראה אישית למשתמש אחד
    else if (opts.admins ? !s.is_admin : (!opts.all && s.is_admin)) return;   // למנהלות — רק התראות אישור
    if (!opts.userId && !opts.admins && !opts.all && e.user_id && String(s.user_id || '') === String(e.user_id)) return;   // המפרסם מקבל התראה אישית במקום הכללית
    let why = null;
    if (!opts.all && !opts.admins && !opts.userId) {
      // בחירה לפי קטגוריות, מקומות ו/או אמנים: מספיק שאחד מהם מתאים. בלי בחירה בכלל = הכול
      const sc = s.cats || [], sv = s.venues || [], sa = s.artists || [];
      if (sc.length || sv.length || sa.length) {
        const catOk = sc.length && cats.some(c => sc.includes(c));
        const venueHit = sv.length && evVenue ? sv.find(v => venueKey(v) === evVenue) : null;
        const artistHit = sa.length ? sa.find(a => artistNameInEvent(a, e)) : null;
        if (!catOk && !venueHit && !artistHit) return;
        why = artistHit ? { artist: String(artistHit) } : venueHit ? { venue: String(venueHit).split(',')[0].trim() } : null;
      }
    }
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, why && !opts.title ? personal(why) : payload, { TTL: 60 * 60 * 24, urgency: 'normal' });
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
  const q = `select=id,title,description,time,location,price,cat,cats,date_raw,date_end_raw,status&date_raw=lte.${day}&or=(date_raw.eq.${day},date_end_raw.gte.${day})`;
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

// ── סיכום אירועים בהתראה לטלפון ──
// רק למי שבחר (העמודה digest בטבלת ההתראות — notifications_update.sql), ולפי הקטגוריות, המקומות והאמנים שבחר.
// מי שאין אירוע שמתאים לו היום — לא מקבל הודעה.
function israelNowMinutes() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return (+p.hour % 24) * 60 + +p.minute;
}
// האם האירוע עוד לפנינו (או עדיין נמשך) בשעת השליחה. בלי שעה = כן. בלי שעת סיום = מניחים שעתיים.
function stillAhead(e, nowMin) {
  const t = [...String(e.time || '').matchAll(/(\d{1,2})[:.](\d{2})/g)].map(m => [+m[1], +m[2]]).filter(([h, m]) => h < 24 && m < 60);
  if (!t.length) return true;
  let start = t[0][0] * 60 + t[0][1];
  if (t[0][0] < 5) start += 1440;                       // 01:00 = אחרי חצות הלילה
  let end = t[1] ? t[1][0] * 60 + t[1][1] : start + 120;
  if (end <= start) end += 1440;
  return end > nowMin;
}
// האירועים שמתאימים למנוי: קטגוריה, מקום או אמן שבחר. בלי בחירה בכלל = הכול (כמו בהתראות הרגילות)
// כמו באתר: אירוע בלי מחיר מוצג כ"כניסה חופשית"
const isFree = e => { const p = String(e.price || '').trim(); return !p || p === '-' || /חופשי|חופשית|חינם|ללא תשלום|ללא עלות/.test(p); };
function eventsFor(s, events) {
  if (s.free_only) events = events.filter(isFree);
  const sc = s.cats || [], sv = s.venues || [], sa = s.artists || [];
  if (!sc.length && !sv.length && !sa.length) return events;
  return events.filter(e => {
    const cats = eventCats(e).map(c => c === 'general' ? 'other' : c);
    const v = venueKey(e.location);
    return (sc.length && cats.some(c => sc.includes(c))) || (sv.length && v && sv.some(x => venueKey(x) === v)) || (sa.length && sa.some(a => artistNameInEvent(a, e)));
  });
}
// ── סיכום אירועים בהתראה אחת, לפי התדירות שהמנוי בחר (העמודה digest) ──
//   daily   — כל יום: אירועי היום
//   3days   — כל שלושה ימים: אירועי שלושת הימים הקרובים
//   weekend — ביום חמישי: חמישי–שבת
//   weekly  — ביום ראשון: שבעת הימים הקרובים
const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayNumber = day => Math.floor(Date.parse(day + 'T00:00:00Z') / 864e5);
const weekdayOf = day => new Date(day + 'T12:00:00Z').getUTCDay();   // 0 = ראשון ... 4 = חמישי ... 6 = שבת
function digestsDue(day) {
  const due = { daily: [day, day] };
  if (dayNumber(day) % 3 === 0) due['3days'] = [day, addDays(day, 2)];
  if (weekdayOf(day) === 4) due.weekend = [day, addDays(day, 2)];
  if (weekdayOf(day) === 0) due.weekly = [day, addDays(day, 6)];
  return due;
}
const showDay = (e, from) => (e.date_raw && e.date_raw > from ? e.date_raw : from);   // היום שבו האירוע מופיע בסיכום
async function eventsBetween(from, to) {
  if (from === to) return todaysEvents(from);
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('./_db');
  const q = `select=id,title,description,time,location,price,cat,cats,date_raw,date_end_raw,status&date_raw=lte.${to}&or=(date_raw.gte.${from},date_end_raw.gte.${from})`;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/events?${q}`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } });
  if (!r.ok) throw new Error('supabase ' + r.status);
  const rows = (await r.json()).filter(e => !e.status || e.status === 'approved');
  const mins = e => { const m = String(e.time || '').match(/(\d{1,2})[:.](\d{2})/); return m ? (+m[1] < 5 ? +m[1] + 24 : +m[1]) * 60 + +m[2] : 9999; };
  return rows.sort((x, y) => showDay(x, from).localeCompare(showDay(y, from)) || mins(x) - mins(y) || String(x.title).localeCompare(String(y.title), 'he'));
}
const DIGEST_HEAD = { daily: '☀️ היום בחיפה', '3days': '📅 בימים הקרובים בחיפה', weekend: '🎉 הסופ״ש בחיפה', weekly: '🗓 השבוע בחיפה' };
const DIGEST_URL = { daily: '/?when=today', '3days': '/', weekend: '/?when=weekend', weekly: '/?when=week' };
function digestPayload(mode, list, from) {
  const head = DIGEST_HEAD[mode] || DIGEST_HEAD.daily;
  const start = e => e.time && e.time !== '-' ? String(e.time).split(/[–—-]/)[0].trim() : '';
  const dayName = e => new Date(showDay(e, from) + 'T12:00:00Z').toLocaleDateString('he-IL', { weekday: 'long', timeZone: 'Asia/Jerusalem' }).replace(/^יום /, '');
  const multi = mode !== 'daily';
  if (list.length === 1) {
    const e = list[0];
    return { title: head + ': ' + e.title, body: [[multi ? 'יום ' + dayName(e) : '', e.time && e.time !== '-' ? e.time : ''].filter(Boolean).join(' · '), e.location].filter(Boolean).join('\n'),
      url: `/?event=${encodeURIComponent(e.id)}`, tag: `digest-${mode}-${from}` };
  }
  const max = multi ? 5 : 4;
  const lines = list.slice(0, max).map(e => [multi ? dayName(e) : '', start(e)].filter(Boolean).join(' ') + ([multi ? dayName(e) : '', start(e)].some(Boolean) ? ' · ' : '') + e.title);
  const more = list.length - max;
  if (more > 0) lines.push(more === 1 ? 'ועוד אירוע אחד' : `ועוד ${more} אירועים`);
  return { title: `${head}: ${list.length} אירועים`, body: lines.join('\n'), url: DIGEST_URL[mode] || '/', tag: `digest-${mode}-${from}`,
    actions: [{ action: 'open', title: '📅 לכל האירועים' }, { action: 'close', title: 'סגירה' }] };
}
const dailyPushPayload = (list, day) => digestPayload('daily', list, day);
async function pushDaily(day, nowMin) {
  const wp = webpush();
  if (!wp) return { sent: 0, error: 'מפתחות VAPID חסרים' };
  day = day || israelToday();
  if (nowMin == null) nowMin = israelNowMinutes();
  const secret = env('NOTIFY_SECRET');
  const modeOf = s => s.digest || (s.daily ? 'daily' : '');
  const due = digestsDue(day);
  const subs = ((await rpc('push_list', { p_secret: secret })) || []).filter(s => !s.is_admin && due[modeOf(s)]);
  const out = { day, due: Object.keys(due), subscribers: subs.length, sent: 0, nothing: 0, removed: 0, failed: 0 };
  if (!subs.length) return out;
  // האירועים של כל סוג סיכום נטענים פעם אחת. אירוע של היום שכבר הסתיים — לא נכלל
  const lists = {};
  for (const mode of new Set(subs.map(modeOf))) {
    const [from, to] = due[mode];
    lists[mode] = (await eventsBetween(from, to)).filter(e => showDay(e, from) > from || (to > from && e.date_end_raw && e.date_end_raw > from) || stillAhead(e, nowMin));
  }
  await Promise.all(subs.map(async s => {
    const mode = modeOf(s);
    const mine = eventsFor(s, lists[mode]);
    if (!mine.length) { out.nothing++; return; }
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(digestPayload(mode, mine, day)), { TTL: 60 * 60 * (mode === 'daily' ? 6 : 24), urgency: 'normal' });
      out.sent++;
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) { out.removed++; await rpc('push_remove', { p_secret: secret, p_endpoint: s.endpoint }).catch(() => {}); }
      else out.failed++;
    }
  }));
  return out;
}

// ── תזכורת לאירועים שהמנוי סימן בלב (רק למי שביקש: העמודה remind; הרשימה בעמודה fav_ids) ──
// הודעה אחת לכל אירוע: בצהרי יום האירוע. אירוע שמתחיל לפני הצהריים — יום קודם.
async function pushReminders(day, nowMin) {
  const wp = webpush();
  if (!wp) return { sent: 0, error: 'מפתחות VAPID חסרים' };
  day = day || israelToday();
  if (nowMin == null) nowMin = israelNowMinutes();
  const secret = env('NOTIFY_SECRET');
  const subs = ((await rpc('push_list', { p_secret: secret })) || []).filter(s => s.remind && !s.is_admin && (s.fav_ids || []).length);
  const out = { subscribers: subs.length, sent: 0, nothing: 0, removed: 0, failed: 0 };
  if (!subs.length) return out;
  const tomorrow = addDays(day, 1);
  const startMin = e => { const m = String(e.time || '').match(/(\d{1,2})[:.](\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const early = e => { const m = startMin(e); return m != null && m >= 300 && m < 13 * 60; };   // מתחיל בבוקר (05:00–13:00)
  const evs = (await eventsBetween(day, tomorrow)).filter(e => (e.date_raw === day && !early(e) && stillAhead(e, nowMin)) || (e.date_raw === tomorrow && early(e)));
  const start = e => e.time && e.time !== '-' ? String(e.time).split(/[–—-]/)[0].trim() : '';
  await Promise.all(subs.map(async s => {
    const ids = new Set((s.fav_ids || []).map(String));
    const mine = evs.filter(e => ids.has(String(e.id)));
    if (!mine.length) { out.nothing++; return; }
    const when = e => [e.date_raw === day ? 'היום' : 'מחר', start(e) && 'ב־' + start(e)].filter(Boolean).join(' ');
    const payload = mine.length === 1
      ? { title: `❤️ ${when(mine[0])}: ${mine[0].title}`, body: [mine[0].location, 'אירוע שסימנת בלב'].filter(Boolean).join('\n'), url: `/?event=${encodeURIComponent(mine[0].id)}`, tag: 'remind-' + day }
      : { title: `❤️ ${mine.length} אירועים שסימנת בלב`, body: mine.slice(0, 5).map(e => `${when(e)} · ${e.title}`).join('\n'), url: '/?when=favs', tag: 'remind-' + day };
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 8, urgency: 'normal' });
      out.sent++;
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) { out.removed++; await rpc('push_remove', { p_secret: secret, p_endpoint: s.endpoint }).catch(() => {}); }
      else out.failed++;
    }
  }));
  return out;
}

// ── סיכום יומי במייל למנהלת בלבד: כל אירועי היום, עם קישור לכל אירוע ──
// נשלח לכתובת שב-ADMIN_EMAIL (אותה כתובת שמקבלת "ממתין לאישור"), דרך Resend. לכיבוי: DAILY_EMAIL=off ב-Vercel.
function dailyEmailHtml(events, day) {
  const d = new Date(day + 'T12:00:00Z').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' });
  const today = events.filter(e => !(e.date_end_raw && e.date_end_raw > e.date_raw));
  const ongoing = events.filter(e => e.date_end_raw && e.date_end_raw > e.date_raw);
  const item = e => {
    const cats = eventCats(e).map(c => CAT_LABEL[c] || c).join(', ');
    const meta = [e.location && '📍 ' + escHtml(e.location), e.price && e.price !== '-' && '🎟 ' + escHtml(e.price), cats && '🏷 ' + escHtml(cats)].filter(Boolean).join(' &nbsp;·&nbsp; ');
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;vertical-align:top;white-space:nowrap;font-weight:bold;color:#7a1020;width:1%">${e.time && e.time !== '-' ? escHtml(e.time) : '—'}</td>
      <td style="padding:10px 12px 10px 0;border-bottom:1px solid #eee"><a href="${eventLink(e)}" style="color:#1a0505;font-weight:bold;font-size:16px;text-decoration:underline">${escHtml(e.title)}</a>${meta ? `<div style="color:#666;font-size:13px;margin-top:3px">${meta}</div>` : ''}</td></tr>`;
  };
  const table = list => `<table dir="rtl" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${list.map(item).join('')}</table>`;
  return `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:640px">
    <h2 style="margin:0 0 4px">☀️ מה קורה היום בחיפה</h2>
    <p style="margin:0 0 14px;color:#666">${escHtml(d)} · ${events.length === 1 ? 'אירוע אחד' : events.length + ' אירועים'}</p>
    ${today.length ? table(today) : ''}
    ${ongoing.length ? `<h3 style="margin:22px 0 4px;font-size:15px;color:#444">ממשיכים גם היום</h3>${table(ongoing)}` : ''}
    <p style="margin-top:22px"><a href="${SITE}/?when=today" style="background:#d4e034;color:#1a0505;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">לכל אירועי היום באתר</a></p>
    <p style="margin-top:18px;color:#999;font-size:12px">הסיכום הזה נשלח רק למנהלת האתר.</p>
  </div>`;
}
async function emailDaily(day) {
  if (env('DAILY_EMAIL') === 'off') return { ok: true, skipped: 'DAILY_EMAIL=off' };
  const key = env('RESEND_API_KEY'), to = env('ADMIN_EMAIL');
  if (!key || !to) return { ok: false, description: 'RESEND_API_KEY או ADMIN_EMAIL חסר' };
  day = day || israelToday();
  const events = await todaysEvents(day);
  if (!events.length) return { ok: true, skipped: 'אין אירועים היום' };
  const d = new Date(day + 'T12:00:00Z').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'Asia/Jerusalem' });
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env('EMAIL_FROM') || 'חיפאית בתחתית <onboarding@resend.dev>',
      to: to.split(',').map(x => x.trim()).filter(Boolean),
      subject: `היום בחיפה · ${d} · ${events.length === 1 ? 'אירוע אחד' : events.length + ' אירועים'}`,
      html: dailyEmailHtml(events, day)
    })
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, id: j.id, events: events.length } : { ok: false, description: j.message || ('status ' + r.status) };
}

module.exports = { SITE, env, tg, tgAdmin, tgChannel, pushAll, pushAdmins, pushPublisherApproved, pushUserTrusted, whenText, emailAdmin, sendDaily, israelToday,
  pushDaily, pushReminders, stillAhead, eventsFor, dailyPushPayload, digestPayload, digestsDue, emailDaily, dailyEmailHtml, artistNameInEvent };

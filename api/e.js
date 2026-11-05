// דף אירוע: /e/adde252b  (או /e/123 לאירועים ישנים)
// • אנשים — מועברים מיד לאתר, והאירוע נפתח בחלון.
// • וואטסאפ / פייסבוק וכו' — מקבלים כותרת ותמונה לתצוגה המקדימה.
// • גוגל ומנועי חיפוש — מקבלים דף מלא של האירוע (שם, תאריך, מקום, תיאור) + "נתוני אירוע" (schema.org/Event),
//   כדי שהאירוע יופיע בחיפוש. זה אותו תוכן שמופיע בחלון האירוע באתר.
const { getEvent, SUPABASE_URL, SUPABASE_ANON_KEY } = require('./_db');
const SITE = 'https://heifait-batahtit.co.il';
const BOTS = /facebookexternalhit|facebot|whatsapp|twitterbot|telegrambot|slackbot|linkedinbot|discordbot|skypeuripreview|pinterest|vkshare|redditbot|applebot|googlebot|google-inspectiontool|googleother|bingbot|duckduckbot|yandex|embedly|iframely|viber|snapchat|instagram|threads|bot|crawler|spider|preview/i;

const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(id)) ? String(id).slice(0, 8).toLowerCase() : String(id);
function heDate(raw) {
  if (!raw) return '';
  const d = new Date(raw + 'T12:00:00Z');
  return isNaN(d) ? '' : d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' });
}
// הפרש השעות של ישראל באותו יום (+02:00 בחורף, +03:00 בקיץ)
function ilOffset(raw) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', timeZoneName: 'longOffset' }).formatToParts(new Date(raw + 'T12:00:00Z'));
    const m = /GMT([+-]\d{2}:\d{2})/.exec((p.find(x => x.type === 'timeZoneName') || {}).value || '');
    return m ? m[1] : '+02:00';
  } catch (_) { return '+02:00'; }
}
function times(t) {
  return [...String(t || '').matchAll(/(\d{1,2})[:.](\d{2})/g)].map(m => [+m[1], +m[2]]).filter(([a, b]) => a < 24 && b < 60);
}
const hhmm = t => String(t[0]).padStart(2, '0') + ':' + String(t[1]).padStart(2, '0');
function addDays(raw, n) { const d = new Date(raw + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function todayIL() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); }

module.exports = async (req, res) => {
  const id = String(req.query.id || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
  const target = id ? `${SITE}/?event=${encodeURIComponent(id)}` : SITE + '/';
  const ua = req.headers['user-agent'] || '';
  // חשוב: לא לשמור במטמון של Vercel — אחרת אנשים מקבלים את הדף של הרובוטים
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'User-Agent');
  if (!BOTS.test(ua)) { res.statusCode = 302; res.setHeader('Location', target); return res.end(); }

  let e = null;
  try { e = await getEvent(id, 'id,title,description,date_raw,date_end_raw,time,location,price,tickets,status,image'); } catch (_) {}
  if (!e) { res.statusCode = 404; res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>האירוע לא נמצא</title></head><body><p>האירוע לא נמצא. <a href="${SITE}/">לכל האירועים בחיפה</a></p></body></html>`); }

  const sid = shortId(e.id);
  const url = `${SITE}/e/${encodeURIComponent(sid)}`;
  const title = String(e.title || '');   // רק שם האירוע, בלי שם האתר
  const tt = times(e.time);
  const dateTxt = heDate(e.date_raw) + (e.date_end_raw && e.date_end_raw > e.date_raw ? ' – ' + heDate(e.date_end_raw) : '');
  const timeTxt = e.time && e.time !== '-' ? e.time : '';
  const when = [dateTxt, timeTxt, e.location].filter(Boolean).join(' | ');
  const descFull = String(e.description || '').trim();
  const desc = when + (descFull ? ' — ' + descFull.replace(/\s+/g, ' ').slice(0, 160) : '');
  const img = e.image ? `${SITE}/api/img?id=${encodeURIComponent(e.id)}&v=${String(e.image).length}` : `${SITE}/og-image-2.jpg`;
  const tickets = /^https?:\/\//i.test(String(e.tickets || '')) ? String(e.tickets) : '';
  const price = e.price && e.price !== '-' ? String(e.price) : '';
  const free = /חופשי|חינם|ללא תשלום/.test(price);

  // נתוני אירוע לגוגל
  const ld = { '@context': 'https://schema.org', '@type': 'Event', name: title, url,
    eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', inLanguage: 'he' };
  if (e.date_raw) {
    const off = ilOffset(e.date_raw);
    ld.startDate = tt[0] ? `${e.date_raw}T${hhmm(tt[0])}:00${off}` : e.date_raw;
    const endDay = e.date_end_raw && e.date_end_raw > e.date_raw ? e.date_end_raw : e.date_raw;
    if (tt[1]) {
      const crosses = !e.date_end_raw && tt[1][0] * 60 + tt[1][1] <= tt[0][0] * 60 + tt[0][1];   // מסתיים אחרי חצות
      const d2 = crosses ? addDays(endDay, 1) : endDay;
      ld.endDate = `${d2}T${hhmm(tt[1])}:00${ilOffset(d2)}`;
    } else ld.endDate = endDay;   // בלי שעת סיום — מסתיים באותו יום (או ביום הסיום)
  }
  if (e.location) {
    const parts = String(e.location).split(',').map(s => s.trim()).filter(Boolean);
    ld.location = { '@type': 'Place', name: parts[0] || e.location,
      address: { '@type': 'PostalAddress', streetAddress: parts.slice(1).join(', ') || parts[0], addressLocality: /חיפה/.test(e.location) || parts.length < 2 ? 'חיפה' : parts[parts.length - 1], addressCountry: 'IL' } };
  }
  if (descFull) ld.description = descFull.slice(0, 5000);
  ld.image = [img];
  // מחיר: "כניסה חופשית" → 0, "₪50" / "50 ש״ח" / "40-60" → המספר הראשון
  const num = (price.replace(/,/g, '').match(/\d+(?:\.\d+)?/) || [])[0];
  if (free || num) ld.offers = { '@type': 'Offer', url: tickets || url, availability: 'https://schema.org/InStock',
    price: free ? 0 : Number(num), priceCurrency: 'ILS', validFrom: (e.date_raw || todayIL()) < todayIL() ? e.date_raw : todayIL() };
  // מארגן: המקום שבו מתקיים האירוע
  if (e.location) ld.organizer = { '@type': 'Organization', name: String(e.location).split(',')[0].trim() };
  // אמנים: דפי אמן מאושרים שהשם שלהם מופיע בשם האירוע; אחרת — שם האירוע עצמו
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/artists?status=eq.approved&select=id,name&limit=500`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } });
    const arts = r.ok ? await r.json() : [];
    const norm = s => String(s || '').toLowerCase().replace(/["'״׳.,!?־\-–—:;()]/g, ' ').replace(/\s+/g, ' ').trim();
    const t = ' ' + norm(title) + ' ';
    const hit = (arts || []).filter(a => norm(a.name).length >= 2 && t.includes(' ' + norm(a.name) + ' ')).slice(0, 5);
    if (hit.length) ld.performer = hit.map(a => ({ '@type': 'PerformingGroup', name: a.name }));
  } catch (_) {}
  if (!ld.performer) ld.performer = { '@type': 'PerformingGroup', name: title };

  // אירוע שעבר לפני יותר משבוע — לא להציג בחיפוש
  const last = e.date_end_raw || e.date_raw || '';
  const stale = last && last < addDays(todayIL(), -7);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}${dateTxt ? ' · ' + esc(dateTxt) : ''} · אירועים בחיפה</title>
<meta name="description" content="${esc(desc)}">
${stale ? '<meta name="robots" content="noindex">' : ''}
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="חיפאית בתחתית">
<meta property="og:locale" content="he_IL">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<style>body{font-family:Arial,sans-serif;background:#1a0505;color:#f5ede8;max-width:720px;margin:0 auto;padding:20px;line-height:1.7}img{max-width:100%;border-radius:12px}a{color:#d4e034}</style>
</head><body>
<nav><a href="${SITE}/">חיפאית בתחתית — כל האירועים בחיפה</a></nav>
<article>
<h1>${esc(title)}</h1>
${e.image ? `<img src="${esc(img)}" alt="${esc(title)}">` : ''}
<p>📅 ${esc(dateTxt)}${timeTxt ? ' · 🕗 ' + esc(timeTxt) : ''}</p>
${e.location ? `<p>📍 ${esc(e.location)}</p>` : ''}
${price ? `<p>💰 ${esc(price)}</p>` : ''}
${descFull ? `<div>${esc(descFull).replace(/\n/g, '<br>')}</div>` : ''}
${tickets ? `<p><a href="${esc(tickets)}" rel="nofollow noopener">🎟 כרטיסים והרשמה</a></p>` : ''}
<p><a href="${esc(target)}">לפרטים, ניווט והוספה ליומן באתר חיפאית בתחתית</a></p>
</article>
</body></html>`);
};

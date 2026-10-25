// קישור שיתוף לאירוע: /e/123
// רובוטים של וואטסאפ/פייסבוק וכו' מקבלים דף עם הכותרת והתמונה של האירוע;
// אנשים מועברים מיד לאתר, והאירוע נפתח.
const { getEvent } = require('./_db');
const SITE = 'https://heifait-batahtit.co.il';
const BOTS = /facebookexternalhit|facebot|whatsapp|twitterbot|telegrambot|slackbot|linkedinbot|discordbot|skypeuripreview|pinterest|vkshare|redditbot|applebot|googlebot|bingbot|embedly|iframely|viber|snapchat|instagram|threads|bot|crawler|spider|preview/i;

const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function heDate(raw) {
  if (!raw) return '';
  const d = new Date(raw + 'T12:00:00Z');
  return isNaN(d) ? '' : d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' });
}

module.exports = async (req, res) => {
  const id = String(req.query.id || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
  const target = id ? `${SITE}/?event=${encodeURIComponent(id)}` : SITE + '/';
  const ua = req.headers['user-agent'] || '';
  // חשוב: לא לשמור במטמון של Vercel — אחרת אנשים מקבלים את הדף של הרובוטים
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'User-Agent');
  if (!BOTS.test(ua)) { res.statusCode = 302; res.setHeader('Location', target); return res.end(); }

  let e = null;
  try { e = await getEvent(id, 'id,title,description,date_raw,date_end_raw,time,location,status,image'); } catch (_) {}
  if (!e) { res.statusCode = 302; res.setHeader('Location', SITE + '/'); return res.end(); }

  const when = [heDate(e.date_raw) + (e.date_end_raw && e.date_end_raw > e.date_raw ? ' – ' + heDate(e.date_end_raw) : ''), e.time && e.time !== '-' ? e.time : '', e.location].filter(Boolean).join(' | ');
  const desc = when + (e.description ? ' — ' + String(e.description).replace(/\s+/g, ' ').slice(0, 160) : '');
  const img = e.image ? `${SITE}/api/img?id=${encodeURIComponent(e.id)}&v=${String(e.image).length}` : `${SITE}/og-image-2.jpg`;
  const url = `${SITE}/e/${encodeURIComponent(e.id)}`;
  const title = `${e.title} | חיפאית בתחתית`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="חיפאית בתחתית">
<meta property="og:locale" content="he_IL">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:alt" content="${esc(e.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<script>location.replace(${JSON.stringify(target)});</script>
</head><body><h1>${esc(e.title)}</h1><p>${esc(desc)}</p><p><a href="${esc(target)}">לפרטים באתר</a></p></body></html>`);
};

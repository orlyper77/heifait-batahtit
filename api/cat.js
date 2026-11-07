// דפי נושא לגוגל: /c/jazz → "ג'אז בחיפה",  /week → "מה עושים בחיפה השבוע"
// • אנשים — מועברים לאתר, עם הסינון המתאים.
// • גוגל — מקבל דף מלא עם רשימת האירועים הקרובים בנושא, וקישורים לדף של כל אירוע.
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('./_db');
const { CATS, eventCatsOf } = require('./_cats');
const SITE = 'https://heifait-batahtit.co.il';
const BOTS = /googlebot|google-inspectiontool|googleother|bingbot|duckduckbot|yandex|applebot|facebookexternalhit|facebot|whatsapp|twitterbot|telegrambot|slackbot|linkedinbot|discordbot|bot|crawler|spider|preview/i;
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(id)) ? String(id).slice(0, 8).toLowerCase() : String(id);
const dayIL = (offset = 0) => new Date(Date.now() + offset * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const heDate = raw => new Date(raw + 'T12:00:00Z').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' });

module.exports = async (req, res) => {
  const slug = String(req.query.c || '').toLowerCase().replace(/[^a-z]/g, '');
  const isWeek = slug === 'week';
  if (!isWeek && !CATS[slug]) { res.statusCode = 302; res.setHeader('Location', SITE + '/'); return res.end(); }
  const ua = req.headers['user-agent'] || '';
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'User-Agent');
  if (!BOTS.test(ua)) { res.statusCode = 302; res.setHeader('Location', isWeek ? SITE + '/' : `${SITE}/?cat=${slug}`); return res.end(); }

  const today = dayIL(), weekEnd = dayIL(7);
  let rows = [];
  try {
    const q = `status=eq.approved&or=(date_raw.gte.${today},date_end_raw.gte.${today})&select=id,title,date_raw,date_end_raw,time,location,cat,cats,price&order=date_raw.asc&limit=600`;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/events?${q}`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } });
    if (r.ok) rows = await r.json();
  } catch (_) {}
  const list = (rows || []).filter(e => isWeek ? (e.date_raw || '') <= weekEnd : eventCatsOf(e).includes(slug)).slice(0, 60);

  const [emoji, , h1, intro] = isWeek ? ['📅', '', 'מה עושים בחיפה השבוע', 'כל האירועים בחיפה בשבוע הקרוב — הופעות, מסיבות, תאטרון, הרצאות, סדנאות וירידים, יום אחרי יום.'] : CATS[slug];
  const url = isWeek ? `${SITE}/week` : `${SITE}/c/${slug}`;
  const title = `${h1} — אירועים קרובים | חיפאית בתחתית`;
  const desc = `${intro} ${list.length ? `${list.length} אירועים קרובים, ` : ''}עם תאריכים, שעות, מקומות וכרטיסים.`;
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: h1, url, inLanguage: 'he', description: intro,
    mainEntity: { '@type': 'ItemList', itemListElement: list.map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/e/${encodeURIComponent(shortId(e.id))}`, name: e.title })) } };
  const others = Object.entries(CATS).filter(([k]) => k !== slug).map(([k, v]) => `<a href="${SITE}/c/${k}">${esc(v[2])}</a>`).join(' · ');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${list.length ? '' : '<meta name="robots" content="noindex">'}
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="חיפאית בתחתית"><meta property="og:locale" content="he_IL">
<meta property="og:url" content="${esc(url)}"><meta property="og:title" content="${esc(h1)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITE}/og-image-2.jpg">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<style>body{font-family:Arial,sans-serif;background:#1a0505;color:#f5ede8;max-width:760px;margin:0 auto;padding:20px;line-height:1.7}a{color:#d4e034}li{margin-bottom:10px}</style>
</head><body>
<nav><a href="${SITE}/">חיפאית בתחתית — כל האירועים בחיפה</a></nav>
<h1>${emoji} ${esc(h1)}</h1>
<p>${esc(intro)}</p>
${list.length ? `<ul>${list.map(e => `<li><a href="${SITE}/e/${encodeURIComponent(shortId(e.id))}">${esc(e.title)}</a><br>📅 ${esc(heDate(e.date_raw))}${e.time && e.time !== '-' ? ' · ' + esc(e.time) : ''}${e.location ? ' · 📍 ' + esc(e.location) : ''}${e.price && e.price !== '-' ? ' · ' + esc(e.price) : ''}</li>`).join('')}</ul>` : '<p>אין כרגע אירועים קרובים בנושא הזה. <a href="' + SITE + '/">לכל האירועים בחיפה</a></p>'}
<p><a href="${SITE}/${isWeek ? '' : '?cat=' + slug}">לכל הפרטים, סינון לפי תאריך והוספה ליומן — באתר חיפאית בתחתית</a></p>
<h2>עוד אירועים בחיפה</h2>
<p>${isWeek ? '' : `<a href="${SITE}/week">מה עושים בחיפה השבוע</a> · `}${others}</p>
</body></html>`);
};

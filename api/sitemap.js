// מפת אתר לגוגל: דף הבית + דף לכל אירוע שעוד לא עבר.  /sitemap.xml → כאן
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('./_db');
const { CATS, eventCatsOf } = require('./_cats');
const SITE = 'https://heifait-batahtit.co.il';
const shortId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(id)) ? String(id).slice(0, 8).toLowerCase() : String(id);
const xesc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

module.exports = async (req, res) => {
  const y = new Date(Date.now() - 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  let rows = [];
  try {
    const q = `status=eq.approved&or=(date_raw.gte.${y},date_end_raw.gte.${y})&select=id,date_raw,cat,cats&order=date_raw.asc&limit=2000`;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/events?${q}`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } });
    if (r.ok) rows = await r.json();
  } catch (_) {}
  // דפי נושא — רק לנושאים שיש בהם אירועים קרובים
  const catSet = new Set(); (rows || []).forEach(e => eventCatsOf(e).forEach(c => { if (CATS[c]) catSet.add(c); }));
  const catUrls = [`  <url><loc>${SITE}/week</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`]
    .concat([...catSet].map(c => `  <url><loc>${SITE}/c/${c}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`));
  const urls = [`  <url><loc>${SITE}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`].concat(catUrls)
    .concat((rows || []).map(e => `  <url><loc>${xesc(`${SITE}/e/${encodeURIComponent(shortId(e.id))}`)}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`));
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
};

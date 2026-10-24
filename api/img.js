// תמונת האירוע ככתובת רגילה (התמונות שמורות בתוך האירוע עצמו), לתצוגה מקדימה בשיתוף
const { getEvent } = require('./_db');

module.exports = async (req, res) => {
  let e = null;
  try { e = await getEvent(String(req.query.id || ''), 'id,status,image'); } catch (_) {}
  const img = e && e.image ? String(e.image) : '';
  const m = img.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
  if (m) {
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    return res.end(Buffer.from(m[2], 'base64'));
  }
  res.statusCode = 302;
  res.setHeader('Location', /^https?:\/\//.test(img) ? img : 'https://heifait-batahtit.co.il/og-image-2.jpg');
  res.end();
};

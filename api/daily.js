// סיכום יומי בערוץ הטלגרם — Vercel מפעיל את זה כל בוקר (ראו vercel.json)
const { env, sendDaily } = require('./_notify');

module.exports = async (req, res) => {
  const auth = String(req.headers.authorization || '');
  const ok = [env('CRON_SECRET'), env('NOTIFY_SECRET')].some(s => s && auth === 'Bearer ' + s);
  if (!ok) { res.statusCode = 401; return res.end('unauthorized'); }
  const channel = env('TELEGRAM_CHANNEL');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!channel || env('DAILY_SUMMARY') === 'off') return res.end(JSON.stringify({ skipped: true }));
  try { res.end(JSON.stringify(await sendDaily(channel))); }
  catch (err) { res.statusCode = 500; res.end(JSON.stringify({ error: String(err) })); }
};

// רץ פעם ביום בצהריים (ראו vercel.json): סיכום אירועים בהתראה לטלפון, למי שבחר בכך בחלון ההתראות —
// כל יום ("היום בחיפה"), כל שלושה ימים, ביום חמישי לקראת הסופ"ש, או ביום ראשון לשבוע כולו.
// וגם: תזכורת לאירועים שהמנוי סימן בלב (למי שביקש).
// כל אחד מקבל רק אירועים בקטגוריות, במקומות ובאמנים שבחר. הסיכום למפרסמים (api/daily) לא קשור לקובץ הזה.
// בנוסף: מייל למנהלת בלבד (ADMIN_EMAIL) עם כל אירועי היום וקישור לכל אחד.
const { env, pushDaily, pushReminders, emailDaily } = require('./_notify');

module.exports = async (req, res) => {
  const auth = String(req.headers.authorization || '');
  const ok = [env('CRON_SECRET'), env('NOTIFY_SECRET')].some(s => s && auth === 'Bearer ' + s);
  if (!ok) { res.statusCode = 401; return res.end('unauthorized'); }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const out = {};
  try { out.today = await pushDaily(); } catch (err) { out.todayError = String(err); }
  try { out.reminders = await pushReminders(); } catch (err) { out.remindersError = String(err); }
  try { out.email = await emailDaily(); } catch (err) { out.emailError = String(err); }
  res.end(JSON.stringify(out));
};

// הגדרות ציבוריות לדפדפן: המפתח הציבורי להתראות וכתובת ערוץ הטלגרם
module.exports = (req, res) => {
  const ch = (process.env.TELEGRAM_CHANNEL || '').trim();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.end(JSON.stringify({
    publicKey: (process.env.VAPID_PUBLIC_KEY || '').trim(),
    telegram: ch.startsWith('@') ? 'https://t.me/' + ch.slice(1) : ((process.env.TELEGRAM_CHANNEL_LINK || '').trim())
  }));
};

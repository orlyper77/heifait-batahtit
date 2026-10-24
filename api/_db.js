// גישה לקריאה בלבד לאירועים מאושרים (אותו מפתח ציבורי שכבר נמצא באתר; כללי האבטחה ב-Supabase חלים עליו)
const SUPABASE_URL = 'https://sgeuvghemmscvwtpbgdo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnZXV2Z2hlbW1zY3Z3dHBiZ2RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTY2ODAsImV4cCI6MjA4OTY3MjY4MH0.yKPpUuZgyZKug9NDiuSugXswS2SUvN2IKr2x0hJ3Fz4';

async function getEvent(id, columns) {
  if (!/^\d+$/.test(String(id || ''))) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${id}&select=${columns}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
  });
  if (!r.ok) return null;
  const rows = await r.json();
  const e = rows && rows[0];
  if (!e || (e.status && e.status !== 'approved')) return null;
  return e;
}
module.exports = { getEvent };

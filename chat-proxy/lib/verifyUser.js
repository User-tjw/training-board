// Zugriffsschutz: CORS hält nur fremde Webseiten im Browser ab, nicht direkte Aufrufe
// (curl/Skripte). Deshalb muss jeder Request den GitHub-Token des Nutzers mitschicken;
// wir prüfen per GitHub-API, dass er zu einem erlaubten Account gehört.
const ALLOWED_USERS = (process.env.ALLOWED_GH_USERS || 'user-tjw')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// Kurzer In-Memory-Cache (bleibt nur solange die Serverless-Instanz warm ist),
// damit nicht jede Chat-Nachricht einen zusätzlichen GitHub-Call kostet.
const cache = new Map();
const CACHE_MS = 10 * 60 * 1000;

async function verifyUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw Object.assign(new Error('Nicht autorisiert: GitHub-Token fehlt (Einstellungen).'), { status: 401 });

  const hit = cache.get(token);
  if (hit && hit > Date.now()) return;

  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'trainiq-chat-proxy' },
  });
  if (!res.ok) throw Object.assign(new Error('Nicht autorisiert: GitHub-Token ungültig.'), { status: 401 });
  const user = await res.json();
  if (!ALLOWED_USERS.includes(String(user.login).toLowerCase())) {
    throw Object.assign(new Error('Nicht autorisiert.'), { status: 403 });
  }
  cache.set(token, Date.now() + CACHE_MS);
}

module.exports = { verifyUser };

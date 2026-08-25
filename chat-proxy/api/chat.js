const { chatWithTrainer } = require('../lib/chatWithTrainer');

// GitHub Pages (TrainIQ-Frontend) und dieser Vercel-Proxy laufen auf unterschiedlichen
// Domains — anders als beim Belege-Scanner (Frontend+API auf derselben Vercel-Domain)
// braucht es hier explizites CORS-Handling.
const ALLOWED_ORIGIN = 'https://user-tjw.github.io';

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  // Lokale Entwicklung (Start-Dashboard.bat auf localhost) zusätzlich erlauben.
  if (origin === ALLOWED_ORIGIN || (origin && origin.startsWith('http://localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { persona, context, history, message } = req.body || {};
    const result = await chatWithTrainer({
      persona, context, history, message,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Unbekannter Fehler' });
  }
};

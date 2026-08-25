require('dotenv').config();
const express = require('express');
const { chatWithTrainer } = require('./lib/chatWithTrainer');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '1mb' }));

app.post('/api/chat', async (req, res) => {
  try {
    const { persona, context, history, message } = req.body || {};
    const result = await chatWithTrainer({
      persona, context, history, message,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Unbekannter Fehler' });
  }
});

app.listen(PORT, () => {
  console.log(`TrainIQ-Chat-Proxy läuft lokal auf http://localhost:${PORT}`);
});

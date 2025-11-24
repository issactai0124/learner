const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (the existing index.html)
app.use(express.static(path.join(__dirname)));

app.use(express.json({ limit: '1mb' }));

// Basic health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Proxy endpoint: forwards the client's payload to the Generative Language API
app.post('/api/generate', async (req, res) => {
  try {
    const apiKey = process.env.GENERATIVE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server misconfiguration: GENERATIVE_API_KEY missing' });
    }

    const upstreamUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const response = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    // Try to parse JSON when applicable
    if (contentType.includes('application/json')) {
      return res.status(response.status).json(JSON.parse(text));
    }

    // Otherwise return raw text
    res.status(response.status).send(text);

  } catch (err) {
    console.error('Proxy error:', err);
    res.status(502).json({ error: 'Proxy failed to fetch upstream API', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server listening on http://localhost:${PORT}`);
});

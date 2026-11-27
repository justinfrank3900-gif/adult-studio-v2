export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { prompt, seed } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  const key = process.env.SPICY_KEY || process.env.SPICYAPI_KEY || process.env.FAL_KEY;
  if (!key) return res.status(500).json({ error: 'No API key set (SPICY_KEY, SPICYAPI_KEY, or FAL_KEY)' });

  try {
    const r = await fetch('https://api.spicyapi.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'spicy-image-1',
        prompt,
        size: '832*1216',
        n: 1,
        seed: seed || undefined,
        enhance_prompt: true
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.error || data.detail || 'SpicyAPI error', data });
    const url = data.data?.[0]?.url || data.images?.[0]?.url;
    if (!url) return res.status(500).json({ error: 'No image URL', data });
    return res.status(200).json({ url, seed: data.seed || seed });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { prompt, seed } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  const key = process.env.FAL_KEY;
  if (!key) return res.status(500).json({ error: 'FAL_KEY missing in environment' });

  try {
    const r = await fetch('https://fal.run/fal-ai/flux/dev', {
      method: 'POST',
      headers: { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_size: 'portrait_4_3', num_images: 1, enable_safety_checker: false, seed })
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { return res.status(500).json({ error: 'Bad response from fal', raw: text.slice(0, 300) }); }
    if (!r.ok) return res.status(r.status).json({ error: data.detail || data.error || 'fal error', status: r.status });
    const url = data.images?.[0]?.url || data.image?.url;
    if (!url) return res.status(500).json({ error: 'No image URL in response', data });
    return res.status(200).json({ url, seed: data.seed || seed });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

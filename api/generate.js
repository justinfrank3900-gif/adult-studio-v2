export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { prompt, seed, image_url } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  const key = process.env.FAL_KEY;
  if (!key) return res.status(500).json({ error: 'FAL_KEY not set' });

  const body = {
    prompt,
    image_size: 'portrait_4_3',
    num_images: 1,
    enable_safety_checker: false
  };
  if (seed) body.seed = seed;
  if (image_url) body.image_url = image_url;

  try {
    const r = await fetch('https://fal.run/fal-ai/flux/dev', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    const url = data.images?.[0]?.url || data.image?.url;
    return res.status(200).json({ url, seed: data.seed || seed });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

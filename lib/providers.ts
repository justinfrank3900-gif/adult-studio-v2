/**
 * lib/adult-avatar/providers.ts
 *
 * Unrestricted generation layer for Adult Studio via SpicyAPI.
 * Marketing Avatar Studio continues to use lib/avatar/providers.ts (fal + HeyGen).
 *
 * Env vars. The only one that MUST be set is the key, and it is read under
 * whichever of these names this deployment already has, because the project
 * was first set up by hand with SPICYAPI_KEY and asking for the same secret
 * to be pasted a second time under a second name is how two copies of a key
 * end up rotated apart:
 *
 *   SPICYAPI_KEY  (or ADULT_IMAGE_API_KEY / ADULT_VIDEO_API_KEY)
 *
 * The endpoint defaults to https://api.spicyapi.com/v1 and only needs
 * setting to point somewhere else.
 */

const SPICY = 'https://api.spicyapi.com/v1';

/** The key, under whichever name this deployment holds it. */
function keyOf(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  throw new Error(
    `The provider key is missing from this deployment. Add SPICYAPI_KEY in Vercel - Project - Settings - Environment Variables, and redeploy.`
  );
}

function imageKey(): string { return keyOf('ADULT_IMAGE_API_KEY', 'SPICYAPI_KEY'); }
function videoKey(): string { return keyOf('ADULT_VIDEO_API_KEY', 'SPICYAPI_KEY'); }
function imageBase(): string { return (process.env.ADULT_IMAGE_API_URL || SPICY).replace(/\/$/, ''); }
function videoBase(): string { return (process.env.ADULT_VIDEO_API_URL || SPICY).replace(/\/$/, ''); }

export function adultImageConfigured(): boolean {
  return Boolean(process.env.ADULT_IMAGE_API_KEY || process.env.SPICYAPI_KEY);
}

export function adultVideoConfigured(): boolean {
  return Boolean(process.env.ADULT_VIDEO_API_KEY || process.env.SPICYAPI_KEY);
}

function extractUrl(json: any): string | null {
  const url =
    json.data?.[0]?.url ||
    json.url ||
    json.image_url ||
    json.images?.[0]?.url ||
    json.output?.[0];
  return typeof url === 'string' ? url : null;
}

/**
 * Generate or edit a still.
 *
 * Text-to-image: POST /v1/images/generations
 * Edit (same-account Spicy CDN URL only): POST /v1/images/edits
 *
 * Returns the SpicyAPI CDN URL. Callers should re-host it in portal storage
 * AND keep this URL as the identity seed for the next edit.
 */
export async function adultGenerateStill(opts: {
  prompt: string;
  spicyReferenceUrl?: string | null;
  aspectRatio?: string;
  numImages?: number;
}): Promise<{ url: string }> {
  if (!adultImageConfigured()) {
    throw new Error(
      'The image provider has no key on this deployment, so nothing was generated. Add SPICYAPI_KEY in Vercel and redeploy.'
    );
  }

  const base = imageBase();
  const key = imageKey();
  const size = opts.aspectRatio === '16:9' ? '1216*832' : '832*1216';

  const useEdit = Boolean(opts.spicyReferenceUrl && opts.spicyReferenceUrl.includes('spicyapi.com'));
  const path = useEdit ? `${base}/images/edits` : `${base}/images/generations`;
  const body: Record<string, unknown> = useEdit
    ? {
        model: process.env.ADULT_IMAGE_EDIT_MODEL || 'spicy-image-edit-1',
        prompt: opts.prompt,
        image_urls: [opts.spicyReferenceUrl],
        n: opts.numImages ?? 1,
      }
    : {
        model: process.env.ADULT_IMAGE_MODEL || 'spicy-image-1',
        prompt: opts.prompt,
        size,
        n: opts.numImages ?? 1,
      };

  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Adult image provider failed (${res.status}): ${text.slice(0, 500)}`);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Adult image provider returned non-JSON.');
  }

  const url = extractUrl(json);
  if (!url) {
    throw new Error('Adult image provider response did not contain an image URL.');
  }
  return { url };
}

export async function adultGenerateVideo(opts: {
  prompt: string;
  referenceImageUrl?: string | null;
  durationSeconds?: number;
  action?: string | null;
}): Promise<{ url: string; jobId?: string }> {
  if (!adultVideoConfigured()) {
    throw new Error(
      'The video provider has no key on this deployment, so nothing was generated. Add SPICYAPI_KEY in Vercel and redeploy.'
    );
  }

  const base = videoBase();
  const key = videoKey();
  const model = process.env.ADULT_VIDEO_MODEL || 'spicy-motion-3';
  const target = Math.min(30, Math.max(2, opts.durationSeconds ?? 12));

  const run = async (body: Record<string, unknown>): Promise<{ url: string; jobId?: string }> => {
    const res = await fetch(`${base}/videos/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Adult video provider failed (${res.status}): ${text.slice(0, 500)}`);
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error('Adult video provider returned non-JSON.'); }
    const immediate = json.output?.video_url || json.video_url || json.url || json.data?.[0]?.url;
    if (immediate && typeof immediate === 'string') return { url: immediate };
    const jobId = String(json.id || json.task_id || json.job_id || json.data?.id || '');
    if (!jobId) throw new Error('Adult video provider did not return a video or a task id.');
    for (let i = 0; i < 36; i++) {
      await new Promise((r) => setTimeout(r, 8000));
      const poll = await fetch(`${base}/videos/tasks/${jobId}`, {
        headers: { 'Authorization': `Bearer ${key}` },
        cache: 'no-store',
      });
      const pText = await poll.text();
      let pJson: any = {};
      try { pJson = JSON.parse(pText); } catch { continue; }
      const status = String(pJson.status || pJson.state || pJson.data?.status || '');
      const url = pJson.output?.video_url || pJson.video_url || pJson.data?.output?.video_url || pJson.data?.video_url;
      if (url && (status === 'succeeded' || status === 'completed' || status === 'ready')) {
        return { url, jobId };
      }
      if (status === 'failed' || status === 'error') {
        throw new Error(pJson.error || pJson.message || 'Adult video task failed.');
      }
    }
    throw new Error('Adult video timed out waiting for the clip.');
  };

  // First take stays at 5s. Longer asks glitch after five seconds on one render.
  const firstBody: Record<string, unknown> = {
    model,
    prompt: opts.prompt,
    resolution: '720P',
    duration: Math.min(5, target),
    aspect_ratio: '9:16',
  };
  if (opts.action) firstBody.action = opts.action;
  if (opts.referenceImageUrl && opts.referenceImageUrl.includes('spicyapi.com')) {
    firstBody.image_url = opts.referenceImageUrl;
  }
  let current = await run(firstBody);
  let made = Math.min(5, target);

  while (made < target && current.url) {
    const chunk = Math.min(5, target - made);
    const extendBody: Record<string, unknown> = {
      model,
      prompt: opts.prompt,
      resolution: '720P',
      duration: made + chunk,
      video_url: current.url,
      aspect_ratio: '9:16',
    };
    current = await run(extendBody);
    made += chunk;
  }

  return current;
}

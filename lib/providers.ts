/**
 * lib/providers.ts
 *
 * Everything the studio asks SpicyAPI for.
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
 *
 * THE THREE WAYS A FACE IS HELD STILL, IN ORDER OF HOW WELL THEY WORK.
 *
 * 1. A CHARACTER. One to three of her generated pictures are registered
 *    with the provider and come back as a chr_ id. That id goes on every
 *    image, every edit and every video, and it is the only one of the three
 *    that works on video at all.
 *
 * 2. AN EDIT. A new picture made as an edit of an existing one. The source
 *    must be a url THEIR OWN CDN minted for this account - their docs are
 *    explicit that an external url, including a re-hosted copy of their own
 *    file, is rejected with a 400 before anything is charged. That is why
 *    every still keeps two addresses: theirs, for this, and ours, for the
 *    page and for when their link stops answering.
 *
 * 3. A REFERENCE. A photograph from outside, sent once, and REDRAWN as a
 *    new picture rather than edited. This is the only way somebody's own
 *    photographs get in, because uploading a picture as an input is
 *    something they refuse by design. The output is theirs, so it can then
 *    be used for 1 and 2.
 */

const SPICY = 'https://api.spicyapi.com/v1';

function keyOf(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  throw new Error(
    'The provider key is missing from this deployment. Add SPICYAPI_KEY in Vercel - Project - Settings - Environment Variables, and redeploy.'
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

/** Their refusal, in their words, with the two that need translating
 *  translated - a code nobody can act on is not an error message. */
function refusal(status: number, text: string): Error {
  let said = '';
  let code = '';
  try {
    const j = JSON.parse(text) as { error?: { message?: string; code?: string }; message?: string; detail?: string };
    said = j?.error?.message || j?.message || j?.detail || '';
    code = j?.error?.code || '';
  } catch { /* not json */ }

  if (/reference_terms_required/.test(code + text)) {
    return new Error(
      'The provider will not take an outside photograph until the newer terms are accepted on the account. Sign in at spicyapi.com, accept them, and try again. Nothing was spent.',
    );
  }
  if (status === 400 && /external|not minted|own account|re-hosted/i.test(said + text)) {
    return new Error(
      'The provider only edits pictures it made itself, and this one came from somewhere else. Shoot her a new anchor picture in Cast and work from that. Nothing was spent.',
    );
  }
  if (status === 401 || status === 403) {
    return new Error(`The provider refused the key on this deployment (${status}). Check SPICYAPI_KEY in Vercel.`);
  }
  return new Error(said ? `The provider refused that: ${said}` : `The provider refused that (${status}). ${text.slice(0, 300)}`);
}

async function call(base: string, key: string, path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw refusal(res.status, text);
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { throw new Error('The provider answered with something that was not JSON.'); }
}

function urlOf(json: Record<string, unknown>): string | null {
  const data = json.data as { url?: string }[] | undefined;
  const url = data?.[0]?.url
    || (json.url as string | undefined)
    || (json.image_url as string | undefined)
    || ((json.images as { url?: string }[] | undefined)?.[0]?.url)
    || ((json.output as string[] | undefined)?.[0]);
  return typeof url === 'string' ? url : null;
}

/** Their eleven sizes, as the two shapes this studio shoots in. */
function sizeOf(aspect?: string): string {
  return aspect === '16:9' ? '1216*832' : '832*1216';
}

/**
 * A still.
 *
 * Which of the three routes it takes is decided here rather than by the
 * caller, because the rules about what each one accepts are the provider's
 * and belong next to the call that has to obey them.
 */
export async function adultGenerateStill(opts: {
  prompt: string;
  /** Her chr_ id. The strongest hold on a face, and the only one that
   *  video understands. */
  character?: string | null;
  /** A url THEY minted for this account. Edited, not redrawn. */
  spicyReferenceUrl?: string | null;
  /** A photograph from outside: a public https url, or a data: url.
   *  Redrawn, never edited. */
  referenceImage?: string | null;
  aspectRatio?: string;
  numImages?: number;
}): Promise<{ url: string; description?: string }> {
  if (!adultImageConfigured()) {
    throw new Error('The image provider has no key on this deployment, so nothing was generated. Add SPICYAPI_KEY in Vercel and redeploy.');
  }

  const base = imageBase();
  const key = imageKey();
  const n = opts.numImages ?? 1;

  /* 3. SOMEBODY ELSE'S PHOTOGRAPH.
   * Their reference model is the only door an outside picture fits
   * through, and what comes back is a NEW picture of that person rather
   * than a touched-up copy of the original. */
  if (opts.referenceImage) {
    /* NOTHING ELSE GOES IN THIS REQUEST.
     *
     * Their reference model takes the picture and nothing but: a prompt,
     * a size, a character or n above one are each a 400 beside it. The
     * first version of this sent a prompt and a size out of habit, which
     * would have failed every single time it was pressed.
     *
     * What comes back instead is better than a prompt would have been -
     * a `description` field, the picture written out as a prompt with the
     * colours measured and the face deliberately left out. That is the
     * only way anything in this studio ever reads a photograph, and it is
     * what the wardrobe is built from. */
    const json = await call(base, key, '/images/generations', {
      model: process.env.ADULT_IMAGE_REFERENCE_MODEL || 'spicy-image-reference-1',
      reference_image: opts.referenceImage,
    });
    const url = urlOf(json);
    if (!url) throw new Error('The provider redrew the picture but did not say where it is.');
    const description = typeof json.description === 'string' ? json.description : '';

    /* HE ASKED FOR A PARTICULAR SHOT, WHICH TAKES A SECOND PICTURE.
     *
     * The reference call will not take a prompt - that is a 400 - so the
     * only way to say "like this photograph, but standing square to the
     * camera" is their documented two-step: take the description it just
     * handed back and send it, with his direction after it, to the
     * photographic model. Two pictures, and worth saying so on screen.
     *
     * With no direction there is nothing to re-shoot, so it stops here
     * and the first picture is hers. */
    if (opts.prompt.trim() && description) {
      try {
        const again = await adultDrawFrom(`${description}\n\n${opts.prompt.trim()}`, opts.aspectRatio);
        return { url: again.url, description };
      } catch {
        /* The redraw is the improvement, not the point. A refusal on the
         * second picture leaves him with the first rather than nothing. */
        return { url, description };
      }
    }

    return { url, description };
  }

  /* 2. AN EDIT OF ONE OF OURS. Only ever with one of their own urls -
   * anything else is a 400 and a confusing one. */
  const canEdit = Boolean(opts.spicyReferenceUrl && opts.spicyReferenceUrl.includes('spicyapi.com'));

  if (canEdit) {
    const body: Record<string, unknown> = {
      model: process.env.ADULT_IMAGE_EDIT_MODEL || 'spicy-image-edit-1',
      prompt: opts.prompt,
      image_urls: [opts.spicyReferenceUrl],
      n,
    };
    /* Their sheet counts as one of the three source slots, so both can go
     * together - and together is stronger than either. */
    if (opts.character) body.character = opts.character;
    const json = await call(base, key, '/images/edits', body);
    const url = urlOf(json);
    if (!url) throw new Error('The provider made the picture but did not say where it is.');
    return { url };
  }

  /* 1. FROM NOTHING, OR FROM A CHARACTER ALONE. */
  const body: Record<string, unknown> = {
    model: process.env.ADULT_IMAGE_MODEL || 'spicy-image-1',
    prompt: opts.prompt,
    size: sizeOf(opts.aspectRatio),
    n,
  };
  if (opts.character) body.character = opts.character;

  const json = await call(base, key, '/images/generations', body);
  const url = urlOf(json);
  if (!url) throw new Error('The provider made the picture but did not say where it is.');
  return { url };
}

/**
 * Draw from words alone, on their photographic model.
 *
 * The second half of the only documented way to use a reference picture:
 * the reference model hands back a `description`, and that description -
 * edited, or with his own direction added to it - goes to this. It is how
 * "make her from this photograph, but standing square to the camera"
 * happens at all, since the reference call itself refuses a prompt.
 */
export async function adultDrawFrom(prompt: string, aspect?: string): Promise<{ url: string }> {
  if (!adultImageConfigured()) {
    throw new Error('The image provider has no key on this deployment. Add SPICYAPI_KEY in Vercel and redeploy.');
  }
  const json = await call(imageBase(), imageKey(), '/images/generations', {
    model: process.env.ADULT_IMAGE_PHOTO_MODEL || 'spicy-image-photo-1',
    prompt: prompt.slice(0, 1900),
    size: sizeOf(aspect),
    n: 1,
  });
  const url = urlOf(json);
  if (!url) throw new Error('The provider made the picture but did not say where it is.');
  return { url };
}

/**
 * Register her with the provider, so every later picture can simply name
 * her instead of resembling her.
 *
 * One to three of HER OWN generated stills, all minted for this account.
 * Costs one edit. The id that comes back goes on her row.
 */
export async function adultMakeCharacter(name: string, spicyUrls: string[]): Promise<{ id: string; sheet: string | null }> {
  if (!adultImageConfigured()) {
    throw new Error('The image provider has no key on this deployment. Add SPICYAPI_KEY in Vercel and redeploy.');
  }
  const urls = spicyUrls.filter((u) => u && u.includes('spicyapi.com')).slice(0, 3);
  if (!urls.length) {
    throw new Error('None of her pictures came from the provider, so there is nothing it will accept to build her from. Shoot one in Cast first.');
  }

  const json = await call(imageBase(), imageKey(), '/characters', {
    name: name.slice(0, 60),
    image_urls: urls,
  });
  const id = String(json.id || '');
  if (!id) throw new Error('The provider registered her but did not say under which id.');
  return { id, sheet: typeof json.sheet_url === 'string' ? json.sheet_url : null };
}

/** Another angle on a registered character. Free, up to eight. */
export async function adultAddCharacterView(characterId: string, spicyUrl: string, label: string): Promise<void> {
  if (!spicyUrl.includes('spicyapi.com')) {
    throw new Error('That picture did not come from the provider, so it cannot be added to her.');
  }
  await call(imageBase(), imageKey(), `/characters/${characterId}/views`, {
    image_url: spicyUrl,
    label: label.slice(0, 60),
  });
}

/**
 * A clip.
 *
 * Built in five second pieces and extended, because longer asks glitch
 * after five seconds on one render - found the hard way. When she is a
 * registered character the character video model is used instead, which is
 * the only way a face survives motion.
 */
export async function adultGenerateVideo(opts: {
  prompt: string;
  character?: string | null;
  referenceImageUrl?: string | null;
  durationSeconds?: number;
  action?: string | null;
}): Promise<{ url: string; jobId?: string }> {
  if (!adultVideoConfigured()) {
    throw new Error('The video provider has no key on this deployment, so nothing was generated. Add SPICYAPI_KEY in Vercel and redeploy.');
  }

  const base = videoBase();
  const key = videoKey();
  const model = opts.character
    ? (process.env.ADULT_VIDEO_CHARACTER_MODEL || 'spicy-character-video-1')
    : (process.env.ADULT_VIDEO_MODEL || 'spicy-motion-3');
  const target = Math.min(30, Math.max(2, opts.durationSeconds ?? 12));

  const run = async (body: Record<string, unknown>): Promise<{ url: string; jobId?: string }> => {
    const json = await call(base, key, '/videos/generations', body);
    const immediate = (json.output as { video_url?: string } | undefined)?.video_url
      || (json.video_url as string | undefined)
      || (json.url as string | undefined)
      || ((json.data as { url?: string }[] | undefined)?.[0]?.url);
    if (immediate && typeof immediate === 'string') return { url: immediate };

    const jobId = String(json.id || json.task_id || json.job_id || (json.data as { id?: string } | undefined)?.id || '');
    if (!jobId) throw new Error('The provider did not return a clip or a task to wait on.');

    for (let i = 0; i < 36; i++) {
      await new Promise((r) => setTimeout(r, 8000));
      const poll = await fetch(`${base}/videos/tasks/${jobId}`, {
        headers: { Authorization: `Bearer ${key}` },
        cache: 'no-store',
      });
      const pText = await poll.text();
      let p: Record<string, unknown> = {};
      try { p = JSON.parse(pText) as Record<string, unknown>; } catch { continue; }
      const status = String(p.status || p.state || (p.data as { status?: string } | undefined)?.status || '');
      const url = (p.output as { video_url?: string } | undefined)?.video_url
        || (p.video_url as string | undefined)
        || ((p.data as { output?: { video_url?: string }; video_url?: string } | undefined)?.output?.video_url)
        || ((p.data as { video_url?: string } | undefined)?.video_url);
      if (url && /succeeded|completed|ready/.test(status)) return { url, jobId };
      if (/failed|error/.test(status)) {
        throw new Error(String(p.error || p.message || 'The clip failed while it was rendering.'));
      }
    }
    throw new Error('The clip timed out waiting for the provider.');
  };

  const first: Record<string, unknown> = {
    model,
    prompt: opts.prompt,
    resolution: '720P',
    duration: Math.min(5, target),
    aspect_ratio: '9:16',
  };
  if (opts.action) first.action = opts.action;
  if (opts.character) first.character = opts.character;
  if (opts.referenceImageUrl && opts.referenceImageUrl.includes('spicyapi.com')) {
    first.image_url = opts.referenceImageUrl;
  }

  let current = await run(first);
  let made = Math.min(5, target);

  while (made < target && current.url) {
    const chunk = Math.min(5, target - made);
    const more: Record<string, unknown> = {
      model,
      prompt: opts.prompt,
      resolution: '720P',
      duration: made + chunk,
      video_url: current.url,
      aspect_ratio: '9:16',
    };
    if (opts.character) more.character = opts.character;
    current = await run(more);
    made += chunk;
  }

  return current;
}

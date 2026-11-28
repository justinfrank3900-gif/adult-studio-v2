// lib/voice.ts
//
// VOICES, ON THE KEY THIS PROJECT ALREADY HAS.
//
// This was written against ElevenLabs first and then thrown away, because
// Justin's answer was four words: "ELEVEN LABS IS NOT SET UP". A feature
// that needs a secret nobody has added is not a feature, and the fix was
// not to ask again - SpicyAPI sells speech on the same key as the pictures
// and the video. One vendor, one key, one bill, nobody who can cut the
// studio off halfway through.
//
// WHAT IS DIFFERENT FROM DESIGNING A VOICE.
//
// ElevenLabs builds a voice from a paragraph describing how somebody
// sounds. SpicyAPI's equivalent is PAUSED - their own docs say a request
// with a description comes back 400 voice_design_unavailable and is not
// charged, because since 10 Oct 2026 their provider only offers it in one
// region. So this works the other way round: they publish a list of ready
// voices, and the studio auditions them. Same question answered - "is that
// her" - and answered faster, because there is nothing to generate before
// you can listen.
//
// Their expressive models take INSTRUCTIONS, which is the part worth
// keeping from the design idea: "slower, lower, like she is standing very
// close" shapes a preset voice without building a new one.

const BASE = (process.env.ADULT_IMAGE_API_URL || 'https://api.spicyapi.com/v1').replace(/\/$/, '');

export function voiceConfigured(): boolean {
  return Boolean(process.env.ADULT_IMAGE_API_KEY || process.env.SPICYAPI_KEY);
}

function key(): string {
  const k = process.env.ADULT_IMAGE_API_KEY || process.env.SPICYAPI_KEY;
  if (!k) {
    throw new Error('This deployment has no provider key, so no voice can be heard. Add SPICYAPI_KEY in Vercel and redeploy. Nothing was spent.');
  }
  return k;
}

/**
 * The models, best first.
 *
 * Voice 3 takes inline tags - [whispers], [sighs] - which is most of what
 * makes a line sound like a person rather than a reader, so it leads. Voice
 * 1 expressive is the one that takes written direction. Voice 1 is the
 * widest list, 45 of them.
 *
 * A voice knows which models can speak it (the list endpoint says so), so
 * nothing here has to guess: the studio picks the best model THAT VOICE
 * supports.
 */
const MODEL_RANK = [
  'spicy-voice-3',
  'spicy-voice-2',
  'spicy-voice-1-expressive',
  'spicy-voice-2-flash',
  'spicy-voice-3-flash',
  'spicy-voice-1',
  'spicy-voice-1-custom',
];

/** Which models accept written direction. Voice 3 rejects it outright. */
const TAKES_INSTRUCTIONS = new Set([
  'spicy-voice-1-expressive', 'spicy-voice-2', 'spicy-voice-2-flash',
]);

/** Their documented ceiling on one line of input, per model family. */
function maxInput(model: string): number {
  return model.startsWith('spicy-voice-1') ? 600 : 5000;
}

export function bestModelFor(models: string[]): string {
  for (const m of MODEL_RANK) if (models.includes(m)) return m;
  return models[0] || 'spicy-voice-1';
}

export function takesInstructions(model: string): boolean {
  return TAKES_INSTRUCTIONS.has(model);
}

async function spicy(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    let said = '';
    try {
      const j = JSON.parse(text) as { error?: { message?: string; code?: string }; message?: string };
      said = j?.error?.message || j?.message || '';
    } catch { /* not json */ }
    throw new Error(said ? `The voice provider refused that: ${said}` : `The voice provider refused that (${res.status}). ${text.slice(0, 200)}`);
  }
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch {
    /* Said plainly rather than as "not JSON". If their speech endpoint
     * ever starts answering with the audio itself instead of a url, this
     * is the sentence that says which of the two happened - and the fix
     * is a different one from a key or a bad voice name. */
    const kind = res.headers.get('content-type') || '';
    if (/^audio\//.test(kind)) {
      throw new Error(`The provider sent the sound itself (${kind}) rather than a link to it, which this build cannot play yet. Nothing is wrong with the voice.`);
    }
    throw new Error(`The voice provider answered with something that could not be read${kind ? ` (${kind})` : ''}.`);
  }
}

export type VoiceChoice = {
  /** What to send as `voice`. A preset name, or a vc_ id for a cloned one. */
  id: string;
  name: string;
  /** preset | cloned | designed */
  kind: string;
  models: string[];
};

/**
 * Every voice this account can use.
 *
 * Read live rather than written down here. Their list grows, the 45 Voice 1
 * names are not published anywhere, and a hardcoded list would be a list of
 * voices that used to exist.
 */
export async function listVoices(): Promise<VoiceChoice[]> {
  const body = await spicy('/voices?limit=200', { method: 'GET' });
  const rows = (body.data || []) as (Record<string, unknown>[]) ;
  return rows.map((v) => {
    const id = String(v.id || '');
    const name = String(v.name || '');
    const kind = String(v.kind || 'preset');
    /* A PRESET IS SPOKEN BY NAME, A CLONE BY ITS ID.
     *
     * This read `v.id || v.name`, which looks harmless and is the whole
     * bug: for a preset their list carries an internal id, the speech
     * endpoint wants "Serena", and the id it was being handed instead
     * came back refused. The refusal was then printed below forty-five
     * rows of voices, off the bottom of the screen, so pressing Hear it
     * did nothing at all as far as anybody could see.
     *
     * Cloned voices are the other way round - those really are spoken by
     * their vc_ id, on the custom model. */
    const cloned = kind === 'cloned' || id.startsWith('vc_');
    return {
      id: (cloned ? id : name) || name || id,
      name: name || id,
      kind,
      models: Array.isArray(v.models) ? (v.models as unknown[]).map(String) : [],
    };
  }).filter((v) => v.id);
}

/**
 * Her, saying something.
 *
 * Comes back as a url on their CDN rather than as bytes, which is what
 * their speech endpoint does by default. Handed straight to an <audio> -
 * a line typed to hear what she sounds like is not an asset, and a bucket
 * full of them is just a bucket full of them.
 */
export async function say(opts: {
  voice: string;
  text: string;
  model?: string;
  instructions?: string | null;
}): Promise<{ url: string; audio?: Buffer; contentType?: string; seconds: number; cost: number }> {
  const model = opts.model || 'spicy-voice-1';
  const limit = maxInput(model);

  const text = opts.text.trim();
  if (!text) throw new Error('There is nothing written for her to say.');
  if (text.length > limit) {
    throw new Error(`That line is ${text.length} characters and this voice takes ${limit}. Shorten it, or split it in two.`);
  }

  const body: Record<string, unknown> = {
    model,
    input: text,
    voice: opts.voice,
    response_format: 'mp3',
  };
  /* Sent only where it is accepted. Voice 3 answers 400 to an instructions
   * field it did not ask for, and a refusal about a field nobody typed is
   * the worst kind of error message. */
  if (opts.instructions && takesInstructions(model)) {
    body.instructions = opts.instructions.slice(0, 1600);
  }

  /* TWO SHAPES OF ANSWER, AND BOTH ARE FINE.
   *
   * Their speech endpoint is OpenAI-shaped, and OpenAI's returns the
   * audio ITSELF rather than a link to it. Theirs documents a url. Which
   * one actually arrives is not worth betting a feature on, so both are
   * handled: a url is passed through, and bytes are handed up for the
   * route to put in our own bucket. Guessing wrong here was a voice
   * button that did nothing. */
  const res = await fetch(`${BASE}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const refused = await res.text();
    let why = '';
    try {
      const j = JSON.parse(refused) as { error?: { message?: string }; message?: string };
      why = j?.error?.message || j?.message || '';
    } catch { /* not json */ }
    throw new Error(
      why
        ? `The voice provider refused that: ${why}`
        : `The voice provider refused that (${res.status}). ${refused.slice(0, 200)}`,
    );
  }

  const kind = res.headers.get('content-type') || '';

  if (/^audio\//.test(kind) || /octet-stream/.test(kind)) {
    const audio = Buffer.from(await res.arrayBuffer());
    if (!audio.length) throw new Error('The voice provider answered with an empty clip.');
    return { url: '', audio, contentType: kind.split(';')[0] || 'audio/mpeg', seconds: 0, cost: 0 };
  }

  const answer = await res.text();
  let said: Record<string, unknown>;
  try { said = JSON.parse(answer) as Record<string, unknown>; }
  catch { throw new Error(`The voice provider answered with something that could not be read${kind ? ` (${kind})` : ''}.`); }

  const url = String(said.url || (said.data as { url?: string }[] | undefined)?.[0]?.url || '');
  if (!url) throw new Error('The voice provider made the clip but did not say where it is.');

  return {
    url,
    seconds: Number(said.duration_s) || 0,
    cost: Number(said.cost_usd) || 0,
  };
}

// lib/voice.ts
//
// ELEVENLABS, THE THREE CALLS THIS STUDIO NEEDS.
//
// Designing a voice from a description rather than cloning one from a
// recording, because there is nobody to record: these performers do not
// exist. ElevenLabs' voice design takes a paragraph about how somebody
// sounds and returns previews; one is chosen and becomes a real voice on
// the account.
//
// WHY FOUR PREVIEWS AND NOT WHATEVER THEY SEND.
// Their create-previews call has no count parameter - it returns its own
// fixed number, three when this was checked - so four means two calls with
// different random seeds, combined. One option to pick from is not a
// choice, and asking the same question twice with no seed risks the same
// three answers back.
//
// WHY guidance_scale IS 3.
// Their own documented range is 3-8 and their own guidance says high
// numbers "can cause voice to sound artificial or robotic". Unset means
// whatever they default to server-side, which their own pages describe
// inconsistently. 3 is the natural end, chosen on purpose.

const ELEVEN = 'https://api.elevenlabs.io/v1';
const DESIGN_MODEL = 'eleven_ttv_v3';
const GUIDANCE = 3;

export function voiceConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

function key(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) {
    throw new Error(
      'This deployment has no ElevenLabs key, so no voice could be made. Add ELEVENLABS_API_KEY in Vercel - Project - Settings - Environment Variables, and redeploy. Nothing was spent.',
    );
  }
  return k;
}

async function elevenJson(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${ELEVEN}${path}`, {
    ...init,
    headers: { 'xi-api-key': key(), 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    /* Their own sentence where they give one. A 401 here means the key, a
     * 402 means the plan ran out of characters, and "ElevenLabs refused
     * (402)" sends somebody hunting the wrong problem. */
    let said = '';
    try {
      const j = JSON.parse(text);
      said = j?.detail?.message || j?.detail?.status || j?.message || '';
    } catch { /* not json */ }
    throw new Error(said
      ? `ElevenLabs refused that: ${said}`
      : `ElevenLabs refused that (${res.status}). ${text.slice(0, 200)}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

export type Preview = { generated_voice_id: string; audio_base_64: string };

async function previewsOnce(description: string, sample: string, seed: number): Promise<Preview[]> {
  const body = await elevenJson('/text-to-voice/create-previews', {
    method: 'POST',
    body: JSON.stringify({
      voice_description: description.slice(0, 1000),
      text: sample.slice(0, 1000),
      model_id: DESIGN_MODEL,
      guidance_scale: GUIDANCE,
      should_enhance: true,
      seed,
    }),
  });
  return (body.previews || []) as Preview[];
}

async function remixOnce(voiceId: string, direction: string, sample: string, seed: number): Promise<Preview[]> {
  const body = await elevenJson(`/text-to-voice/${voiceId}/remix`, {
    method: 'POST',
    body: JSON.stringify({
      voice_description: direction.slice(0, 1000),
      text: sample.slice(0, 1000),
      /* The remix endpoint's own docs list no model_id field, so there is
       * nothing to set there. */
      guidance_scale: GUIDANCE,
      should_enhance: true,
      seed,
    }),
  });
  return (body.previews || []) as Preview[];
}

function fourOf(a: Preview[], b: Preview[]): Preview[] {
  const seen = new Set<string>();
  return [...a, ...b].filter((p) => {
    if (seen.has(p.generated_voice_id)) return false;
    seen.add(p.generated_voice_id);
    return true;
  }).slice(0, 4);
}

const seed = () => Math.floor(Math.random() * 1_000_000);

/** Four voices to choose between, built from a description. */
export async function designFour(description: string, sample: string): Promise<Preview[]> {
  const [a, b] = await Promise.all([
    previewsOnce(description, sample, seed()),
    previewsOnce(description, sample, seed()),
  ]);
  const four = fourOf(a, b);
  if (!four.length) throw new Error('ElevenLabs returned no voices to choose from.');
  return four;
}

/**
 * Four changes to a voice she already has.
 *
 * ElevenLabs only remixes a voice already SAVED on the account, never a
 * preview that was never committed - checked, because the obvious-looking
 * alternative is not an endpoint they expose. Which is the right moment for
 * this to exist anyway: you are not fixing a preview, you are adjusting the
 * voice you already put on her.
 */
export async function remixFour(voiceId: string, direction: string, sample: string): Promise<Preview[]> {
  const [a, b] = await Promise.all([
    remixOnce(voiceId, direction, sample, seed()),
    remixOnce(voiceId, direction, sample, seed()),
  ]);
  const four = fourOf(a, b);
  if (!four.length) throw new Error('ElevenLabs returned no changes to choose from.');
  return four;
}

/** Turn the chosen preview into a real voice on the account. */
export async function keepVoice(name: string, description: string, generatedVoiceId: string): Promise<string> {
  const body = await elevenJson('/text-to-voice/create-voice-from-preview', {
    method: 'POST',
    body: JSON.stringify({
      voice_name: name.slice(0, 100),
      voice_description: description.slice(0, 1000),
      generated_voice_id: generatedVoiceId,
    }),
  });
  const id = String(body.voice_id || '');
  if (!id) throw new Error('ElevenLabs kept the voice but did not say which one it is.');
  return id;
}

/** Her, saying something. Returns mp3 bytes. */
export async function say(voiceId: string, text: string, settings: Record<string, unknown> = {}): Promise<Buffer> {
  const { model_id = 'eleven_multilingual_v2', ...rest } = settings as { model_id?: string };
  const known = ['stability', 'similarity_boost', 'style', 'use_speaker_boost', 'speed'] as const;
  const voice_settings: Record<string, unknown> = {};
  for (const k of known) {
    const v = (rest as Record<string, unknown>)[k];
    if (v !== undefined) voice_settings[k] = v;
  }

  const res = await fetch(`${ELEVEN}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': key(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: text.slice(0, 2500),
      model_id,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.85,
        style: 0.35,
        use_speaker_boost: true,
        ...voice_settings,
      },
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    if (res.status === 404 && /voice_not_found/.test(raw)) {
      throw new Error('Her voice is not on this ElevenLabs account any more, so there is nothing to speak with. Design her a new one.');
    }
    throw new Error(`ElevenLabs would not speak that (${res.status}). ${raw.slice(0, 200)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// app/api/wardrobe/route.ts
//
// READING HIS PHOTOGRAPHS, AND TURNING A SHOOT INTO A RAIL.
//
// "I need it to take all of it and build her, especially her wardrobe as
// there is 200 outfits."
//
// For a while the answer was that it could not: the provider has no vision
// model, chat refuses an image part outright, and there is no caption
// endpoint. All true, and all beside the point - because their REFERENCE
// model hands back a `description`, the photograph written out as a prompt
// with the colours measured and the face deliberately left out.
//
// That is the vision model. It was there the whole time, filed under
// drawing rather than under reading.
//
// TWO HUNDRED PICTURES ARE NOT TWO HUNDRED OUTFITS, so the browser sorts
// them into groups first and sends ONE picture out of each. Describing
// every frame would mean paying twenty times over for the same dress and
// handing back a rail with twenty copies of it on.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { BUCKET, DEALER_ID, SUPABASE_ANON, SUPABASE_URL } from '@/lib/config';
import { adultGenerateStill, adultImageConfigured } from '@/lib/providers';

export const runtime = 'nodejs';
/* One reference picture is thirty to sixty seconds by their own estimate,
 * and the browser sends them a few at a time rather than all at once. */
export const maxDuration = 120;

const BASE = (process.env.ADULT_IMAGE_API_URL || 'https://api.spicyapi.com/v1').replace(/\/$/, '');

function no(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function asCaller(req: Request): SupabaseClient | null {
  const auth = req.headers.get('authorization') || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!jwt) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

function slug(s: string): string {
  return (s || 'outfit').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'outfit';
}

/** Their picture, into our bucket, written as the caller so the storage
 *  rule applies exactly as it does everywhere else. */
async function keep(db: SupabaseClient, url: string, label: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());

    /* THE KIND IT ACTUALLY IS, NOT THE KIND I ASSUMED.
     *
     * This wrote every swatch as .jpg with an image/jpeg type. What the
     * provider actually sends is PNG, so every picture on the rail was a
     * PNG wearing a jpg label - 3.4MB each, and a rail of thirty-three
     * was a hundred and thirteen megabytes on one screen. */
    const kind = (res.headers.get('content-type') || 'image/png').split(';')[0].trim();
    const ext = kind.includes('png') ? 'png' : kind.includes('webp') ? 'webp' : 'jpg';

    const path = `${DEALER_ID}/wardrobe/${slug(label)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: kind, upsert: true });
    if (error) return null;

    /* AND SERVED SMALL. The full size is kept - it is the swatch, and one
     * day it is worth looking at properly - but a rail is a page of
     * thumbnails, and the storage layer will resize on the way out. A
     * browser gets WebP at about 34KB instead of the original. */
    const full = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    return `${full.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')}?width=600&quality=72`;
  } catch {
    /* A swatch that would not save is not worth losing the outfit over -
     * the words are the part that does the work. */
    return null;
  }
}

type Named = { label: string; words: string };

/** Their wording for the ones that mean "try again", not "do not". */
function passing(message: string): boolean {
  return /temporarily unavailable|moderation_unavailable|try again|retry|rate.?limit|429|50[234]|timeout|timed out/i.test(message);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function askChat(numbered: string, expect: number): Promise<Named[]> {
  const key = process.env.ADULT_IMAGE_API_KEY || process.env.SPICYAPI_KEY;
  if (!key) throw new Error('This deployment has no provider key, so the outfits could not be named.');

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'spicy-chat-1',
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You turn written descriptions of photographs into wardrobe entries for a studio. '
            + 'You answer with JSON only: {"outfits":[{"label":string,"words":string}]}. '
            + 'ONE entry per description, in the same order, the same number out as in. '
            + 'The "label" is a short plain name for the clothes, two to five words, how somebody would ask for it off a rail - '
            + '"Red satin halter", "Black lace corset and leather mini". Never a number, never the word outfit. '
            + 'The "words" are ONE sentence beginning "She is wearing", covering ONLY the clothes, the shoes and anything carried: '
            + 'the garment, its colour, its material, its cut and its length. '
            + 'Leave out the room, the background, the lighting, the camera, the pose, the hair, the make-up, the body and the face entirely. '
            + 'Use the exact colours given. If a description has no clothes in it worth naming, still answer with an entry and say plainly what little there is.',
        },
        { role: 'user', content: `Here are the descriptions. Answer with the JSON only.\n\n${numbered}` },
      ],
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    let said = '';
    try { said = (JSON.parse(text) as { error?: { message?: string } })?.error?.message || ''; } catch { /* not json */ }
    throw new Error(said || `The outfits could not be named (${res.status}).`);
  }

  const body = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
  const raw = body.choices?.[0]?.message?.content?.trim() || '';
  const inner = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let parsed: { outfits?: Named[] };
  try { parsed = JSON.parse(inner) as { outfits?: Named[] }; }
  catch { throw new Error('What came back was not something that could be read as a list of outfits.'); }

  const out = (parsed.outfits || []).map((o) => ({
    label: String(o?.label || '').trim().slice(0, 60),
    words: String(o?.words || '').trim().slice(0, 900),
  }));
  if (out.length !== expect) {
    throw new Error(`${expect} went in and ${out.length} came back, so they cannot be lined up.`);
  }
  return out;
}

/**
 * Their description of a photograph, cut down to the clothes.
 *
 * What comes back from the reference model is the WHOLE picture - the
 * room, the light, where the camera was standing, the pose. All useful,
 * none of it wardrobe: an outfit that carries a hotel corridor in its
 * description drags that corridor into every shoot it is ever used in.
 *
 * IN SMALL BATCHES, WITH RETRIES, AND NEVER EMPTY HANDED.
 *
 * Every picture has already been paid for by the time this runs, so
 * failing here is not failing - it is throwing away money that is
 * already gone. Their screening drops out for a few seconds at a time
 * and says so in as many words ("Content screening is temporarily
 * unavailable ... retry in a few seconds"), which is exactly the kind of
 * thing a machine should sit out rather than hand to a person.
 *
 * So: eight at a time, three attempts each, four seconds then eight
 * between. A batch that still will not go becomes the provider's own
 * description instead - worse words than the model would have written,
 * and infinitely better than a lost outfit, because the picture is on
 * the rail beside it and the words can be tidied by hand.
 *
 * Positions never shift. The swatches are lined up by position, so an
 * entry quietly going missing would put every dress after it under
 * somebody else's photograph.
 */
async function nameThem(descriptions: string[]): Promise<{ outfits: Named[]; fallbacks: number }> {
  const SIZE = 8;
  const TRIES = 3;
  const out: Named[] = [];
  let fallbacks = 0;

  for (let at = 0; at < descriptions.length; at += SIZE) {
    const batch = descriptions.slice(at, at + SIZE);
    const numbered = batch
      .map((d, i) => `${i + 1}. ${d.replace(/\s+/g, ' ').slice(0, 1200)}`)
      .join('\n\n');

    let got: Named[] | null = null;
    for (let go = 0; go < TRIES; go++) {
      try { got = await askChat(numbered, batch.length); break; }
      catch (e) {
        const why = e instanceof Error ? e.message : 'no reason given';
        if (go < TRIES - 1 && passing(why)) { await wait(4000 * (go + 1)); continue; }
        break;
      }
    }

    if (got) { out.push(...got); continue; }

    for (const d of batch) {
      out.push({
        label: 'Needs a name',
        words: d.replace(/\s+/g, ' ').trim().slice(0, 900),
      });
      fallbacks++;
    }
  }

  return { outfits: out, fallbacks };
}

export async function POST(req: Request) {
  const db = asCaller(req);
  if (!db) return no('Your sign in has expired. Reload the page and sign in again. Nothing was spent.', 401);

  const { data: { user } } = await db.auth.getUser();
  if (!user) return no('Your sign in has expired. Reload the page and sign in again. Nothing was spent.', 401);

  const { data: member } = await db
    .from('dealer_members').select('dealer_id')
    .eq('user_id', user.id).eq('dealer_id', DEALER_ID).maybeSingle();
  if (!member) return no('This login is not on the studio account.', 403);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return no('The studio sent something it could not read.'); }

  const doing = String(body.doing || 'read');

  try {
    /* --------------------------------------------- read one photograph */
    if (doing === 'read') {
      if (!adultImageConfigured()) {
        return no('This deployment has no provider key, so nothing could be read. Add SPICYAPI_KEY in Vercel and redeploy. Nothing was spent.');
      }
      const image = String(body.image || '');
      if (!image.startsWith('data:image/') && !/^https:\/\//.test(image)) {
        return no('That is not a picture this can read.');
      }

      const made = await adultGenerateStill({ prompt: '', referenceImage: image });
      if (!made.description) {
        return no(
          'The provider drew the picture but sent back no description of it, so there is nothing to make an outfit out of. Nothing is lost - the drawing is still charged for.',
          502,
        );
      }

      /* Kept because it IS the swatch: a picture of these clothes, drawn
       * by the provider, which is the one thing the rail can show before
       * anybody has worn them. */
      const swatch = await keep(db, made.url, String(body.label || 'outfit'));

      return NextResponse.json({ description: made.description, swatch, provider_url: made.url });
    }

    /* ------------------------------------- turn descriptions into a rail */
    if (doing === 'name') {
      const raw = Array.isArray(body.descriptions) ? body.descriptions : [];
      const descriptions = raw.map((d) => String(d || '')).filter(Boolean);
      if (!descriptions.length) return no('There is nothing to name.');

      const { outfits, fallbacks } = await nameThem(descriptions);
      /* THE COUNT HAS TO MATCH OR THE RAIL IS WRONG.
       *
       * These are lined back up with the pictures they came from by
       * position, so one missing entry silently shifts every outfit after
       * it onto the wrong swatch. Better to refuse. */
      if (outfits.length !== descriptions.length) {
        return no(
          `${descriptions.length} pictures went in and ${outfits.length} outfits came back, so they cannot be matched up safely. Nothing was saved - press it again.`,
          502,
        );
      }
      return NextResponse.json({ outfits, fallbacks });
    }

    return no('The studio asked for something this route does not do.');
  } catch (e) {
    return no(e instanceof Error ? e.message : 'That could not be done and no reason was given.', 502);
  }
}

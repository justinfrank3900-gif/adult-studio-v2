// app/api/generate/route.ts
//
// THE ONLY SERVER CODE IN THE STUDIO, AND THE ONLY REASON IT EXISTS.
//
// Everything else the studio does goes straight from the browser to the
// database under the signed-in person's own token, which is what makes the
// row rules the thing enforcing separation rather than our own care. This
// route exists because the SpicyAPI key cannot be in a browser.
//
// So it does three things and nothing else:
//   1. proves who is asking, from the Authorization: Bearer header,
//   2. calls the provider with the key,
//   3. puts the result in our own bucket AS THAT PERSON, so the storage rule
//      applies to this write exactly as it does to every other one.
//
// There is no service-role key here. A route that held one could write
// anywhere, and the whole point of this app is that it cannot.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { BUCKET, DEALER_ID, SUPABASE_ANON, SUPABASE_URL } from '@/lib/config';
import { adultGenerateStill, adultGenerateVideo, adultImageConfigured, adultVideoConfigured } from '@/lib/providers';

export const runtime = 'nodejs';
/* A still comes back in well under a minute. A clip is the provider rendering
 * and then being polled, which is minutes, so this is as long as Vercel will
 * let a function run. */
export const maxDuration = 300;

/** A refusal a person can read. Never a bare status code: this sentence goes
 *  on the screen next to the button that was pressed. */
function no(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** The caller, as themselves. Everything this route writes is written with
 *  this client, so the database applies the same rules it would in the page. */
function asCaller(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!jwt) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

function slug(s: string): string {
  return (s || 'still').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'still';
}

export async function POST(req: Request) {
  const db = asCaller(req);
  if (!db) return no('Your sign in has expired, so the studio could not prove who you are. Reload the page and sign in again. Nothing was spent.', 401);

  const { data: { user } } = await db.auth.getUser();
  if (!user) return no('Your sign in has expired. Reload the page and sign in again. Nothing was spent.', 401);

  /* Membership is checked against the caller's OWN view of dealer_members,
   * which only ever shows their own rows. Someone who is not in this account
   * cannot spend its credits even if they reach this route. */
  const { data: member } = await db
    .from('dealer_members')
    .select('dealer_id')
    .eq('user_id', user.id)
    .eq('dealer_id', DEALER_ID)
    .maybeSingle();
  if (!member) return no('This login is not on the studio account, so nothing was generated.', 403);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return no('The studio sent something it could not read. Nothing was spent.');
  }

  const what = String(body.what || 'still');
  const prompt = String(body.prompt || '').trim();
  if (!prompt) return no('There is nothing written to shoot yet. Put the shot in words first.');

  const identityId = body.identity_id ? String(body.identity_id) : null;
  const seed = body.seed_url ? String(body.seed_url) : null;
  const label = String(body.label || what);

  try {
    if (what === 'clip') {
      if (!adultVideoConfigured()) {
        return no('The video provider is not set up on this deployment yet, so nothing was generated. ADULT_VIDEO_API_URL and ADULT_VIDEO_API_KEY are missing.');
      }
      const made = await adultGenerateVideo({
        prompt,
        referenceImageUrl: seed,
        durationSeconds: Math.min(30, Math.max(2, Number(body.duration) || 5)),
        action: body.action ? String(body.action) : null,
      });
      const kept = await keep(db, made.url, identityId, label, 'video/mp4', 'mp4');
      return NextResponse.json({ provider_url: made.url, url: kept.url, path: kept.path });
    }

    if (!adultImageConfigured()) {
      return no('The image provider is not set up on this deployment yet, so nothing was generated. ADULT_IMAGE_API_URL and ADULT_IMAGE_API_KEY are missing.');
    }

    const made = await adultGenerateStill({
      prompt,
      /* An edit can only anchor on a url the provider itself served. Handing
       * it our own copy would come back as a fresh face wearing the right
       * clothes, which is the failure that looks like success. */
      spicyReferenceUrl: seed,
      aspectRatio: String(body.aspect || '9:16'),
      numImages: 1,
    });
    const kept = await keep(db, made.url, identityId, label, 'image/jpeg', 'jpg');
    return NextResponse.json({ provider_url: made.url, url: kept.url, path: kept.path });
  } catch (e) {
    /* The provider's own words, kept whole. They are the only part of a
     * failure that tells anybody what to do differently. */
    return no(e instanceof Error ? e.message : 'The provider refused that and gave no reason.', 502);
  }
}

/** Pull what the provider made into our own bucket, so a link expiring on
 *  their side does not empty the studio. */
async function keep(
  db: SupabaseClient,
  url: string,
  identityId: string | null,
  label: string,
  contentType: string,
  ext: string,
): Promise<{ url: string; path: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The file came back from the provider but could not be read (${res.status}).`);
  const bytes = Buffer.from(await res.arrayBuffer());

  /* The first folder is the dealer id because that is literally what the
   * storage rule reads. Change the shape of this path and the upload stops
   * being allowed. */
  const path = `${DEALER_ID}/${identityId || 'loose'}/${slug(label)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`The file was made but could not be saved: ${error.message}`);

  return { url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, path };
}

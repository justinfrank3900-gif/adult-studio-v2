// app/api/voice/route.ts
//
// GIVING A PERFORMER A VOICE, AND LETTING HER SPEAK.
//
// Same shape as /api/generate and for the same reason: the ElevenLabs key
// cannot be in a browser. It proves who is asking from the Authorization
// header, checks they are on this account against their OWN view of
// dealer_members, and does everything else as them - so the row rules
// decide what gets written, not this file.
//
// It writes to adult_voices and nowhere else. The marketing studio's voices
// are a different table on purpose: the one time these were shared, a
// screen test of a female performer came back read by a male stock voice,
// because that stand-in is correct for the studio that films one man.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { DEALER_ID, SUPABASE_ANON, SUPABASE_URL } from '@/lib/config';
import { designFour, keepVoice, remixFour, say, voiceConfigured } from '@/lib/voice';

export const runtime = 'nodejs';
/* Designing four voices is two ElevenLabs calls in parallel, each of which
 * generates several seconds of speech. Comfortably under a minute, but not
 * under ten. */
export const maxDuration = 120;

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

/** A line she would actually say, so a preview is her talking rather than a
 *  stock pangram nobody can judge a voice on. */
const SAMPLE = 'Hey. I was wondering when you were going to message me. Come here, I want to tell you something.';

export async function POST(req: Request) {
  const db = asCaller(req);
  if (!db) return no('Your sign in has expired, so the studio could not prove who you are. Reload the page and sign in again. Nothing was spent.', 401);

  const { data: { user } } = await db.auth.getUser();
  if (!user) return no('Your sign in has expired. Reload the page and sign in again. Nothing was spent.', 401);

  const { data: member } = await db
    .from('dealer_members').select('dealer_id')
    .eq('user_id', user.id).eq('dealer_id', DEALER_ID).maybeSingle();
  if (!member) return no('This login is not on the studio account, so nothing was done.', 403);

  if (!voiceConfigured()) {
    return no('This deployment has no ElevenLabs key, so no voice can be made or spoken. Add ELEVENLABS_API_KEY in Vercel, then redeploy. Nothing was spent.');
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return no('The studio sent something it could not read. Nothing was spent.');
  }

  const doing = String(body.doing || '');
  const identityId = String(body.identity_id || '').trim();
  const sample = String(body.sample || '').trim() || SAMPLE;

  try {
    /* ------------------------------------------------- four to choose from */
    if (doing === 'design') {
      const description = String(body.description || '').trim();
      if (!description) return no('Say how she sounds first - age, pitch, pace, where she is from, how she talks when she is being quiet.');
      const previews = await designFour(description, sample);
      return NextResponse.json({ previews, sample });
    }

    /* ------------------------------------------- four changes to hers */
    if (doing === 'remix') {
      const direction = String(body.direction || '').trim();
      if (!direction) return no('Say what to change - deeper, slower, less breathy.');
      if (!identityId) return no('Which performer?');

      const voiceId = await providerVoiceOf(db, identityId);
      if (!voiceId) return no('She has no voice yet to change. Design her one first.');

      const previews = await remixFour(voiceId, direction, sample);
      return NextResponse.json({ previews, sample });
    }

    /* ------------------------------------------------------ keep this one */
    if (doing === 'keep') {
      const chosen = String(body.generated_voice_id || '').trim();
      const description = String(body.description || '').trim();
      const name = String(body.name || 'Her voice').trim();
      if (!chosen) return no('Which of the four?');
      if (!identityId) return no('Which performer?');

      const providerVoiceId = await keepVoice(name, description, chosen);

      /* The row first, then the pointer. A pointer written before the row
       * exists is a performer with a voice_id that joins to nothing, and
       * that reads on screen as "she has a voice" right up until she has to
       * speak. */
      const { data: row, error: rowErr } = await db
        .from('adult_voices')
        .insert({
          dealer_id: DEALER_ID,
          label: name,
          provider: 'elevenlabs',
          provider_voice_id: providerVoiceId,
          clone_type: 'designed',
          status: 'ready',
        })
        .select('id, label, provider_voice_id')
        .single();
      if (rowErr || !row) {
        return no(`The voice was made at ElevenLabs but could not be saved here: ${rowErr?.message || 'no row came back'}. It is called "${name}" on the account.`, 502);
      }

      const { error: linkErr } = await db
        .from('adult_identities')
        .update({ voice_id: row.id })
        .eq('id', identityId);
      if (linkErr) {
        return no(`The voice was saved but could not be put on her: ${linkErr.message}`, 502);
      }

      return NextResponse.json({ voice: row });
    }

    /* ---------------------------------------------------- hear her say it */
    if (doing === 'say') {
      const text = String(body.text || '').trim();
      if (!text) return no('Write something for her to say.');
      if (!identityId) return no('Which performer?');

      const voice = await voiceRowOf(db, identityId);
      if (!voice?.provider_voice_id) {
        return no('She has no voice yet, so there is nothing to speak with. Design her one first.');
      }

      const mp3 = await say(voice.provider_voice_id, text, (voice.settings || {}) as Record<string, unknown>);
      /* Handed straight back rather than stored. A line typed to hear what
       * she sounds like is not an asset, and a bucket full of them is just
       * a bucket full of them. */
      return new NextResponse(new Uint8Array(mp3), {
        headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
      });
    }

    return no('The studio asked for something this route does not do.');
  } catch (e) {
    return no(e instanceof Error ? e.message : 'ElevenLabs refused that and gave no reason.', 502);
  }
}

type VoiceRow = { id: string; provider_voice_id: string | null; settings: unknown };

async function voiceRowOf(db: SupabaseClient, identityId: string): Promise<VoiceRow | null> {
  const { data: who } = await db
    .from('adult_identities').select('voice_id').eq('id', identityId).maybeSingle();
  if (!who?.voice_id) return null;
  const { data: voice } = await db
    .from('adult_voices').select('id, provider_voice_id, settings').eq('id', who.voice_id).maybeSingle();
  return (voice as VoiceRow) || null;
}

async function providerVoiceOf(db: SupabaseClient, identityId: string): Promise<string | null> {
  return (await voiceRowOf(db, identityId))?.provider_voice_id ?? null;
}

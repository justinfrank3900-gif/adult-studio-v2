// app/api/voice/route.ts
//
// GIVING A PERFORMER A VOICE, AND LETTING HER SPEAK.
//
// Same shape as /api/generate and for the same reason: the provider key
// cannot be in a browser. It proves who is asking from the Authorization
// header, checks they are on this account against their OWN view of
// dealer_members, and does everything else as them.
//
// It writes to adult_voices and nowhere else. The one time these tables
// were shared, a screen test of a female performer came back read by a male
// stock voice, because that stand-in is correct for the studio that films
// one man.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { DEALER_ID, SUPABASE_ANON, SUPABASE_URL } from '@/lib/config';
import { bestModelFor, listVoices, say, takesInstructions, voiceConfigured } from '@/lib/voice';

export const runtime = 'nodejs';
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
    return no('This deployment has no provider key, so no voice can be heard. Add SPICYAPI_KEY in Vercel, then redeploy. Nothing was spent.');
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return no('The studio sent something it could not read. Nothing was spent.'); }

  const doing = String(body.doing || '');
  const identityId = String(body.identity_id || '').trim();

  try {
    /* ------------------------------------------------- what is available */
    if (doing === 'voices') {
      const all = await listVoices();
      return NextResponse.json({
        voices: all.map((v) => {
          const model = bestModelFor(v.models);
          return { ...v, model, directable: takesInstructions(model) };
        }),
      });
    }

    /* ------------------------------------------------------ hear one say */
    if (doing === 'say') {
      const text = String(body.text || '').trim();
      if (!text) return no('Write something for her to say.');

      /* Either a voice named right here - auditioning - or hers. */
      let voice = String(body.voice || '').trim();
      let model = String(body.model || '').trim();
      let instructions = body.instructions ? String(body.instructions) : null;

      if (!voice) {
        if (!identityId) return no('Which performer?');
        const hers = await voiceOf(db, identityId);
        if (!hers?.provider_voice_id) {
          return no('She has no voice yet, so there is nothing to speak with. Pick one for her first.');
        }
        voice = hers.provider_voice_id;
        const settings = (hers.settings || {}) as Record<string, unknown>;
        model = model || String(settings.model || '');
        if (instructions === null && typeof settings.instructions === 'string') {
          instructions = settings.instructions;
        }
      }

      const made = await say({ voice, text, model: model || undefined, instructions });
      return NextResponse.json(made);
    }

    /* ----------------------------------------------------- that is her */
    if (doing === 'keep') {
      const voice = String(body.voice || '').trim();
      const model = String(body.model || '').trim();
      const name = String(body.name || voice).trim();
      const instructions = String(body.instructions || '').trim();
      if (!voice) return no('Which voice?');
      if (!identityId) return no('Which performer?');

      /* The row first, then the pointer. A pointer written before the row
       * exists is a performer with a voice_id that joins to nothing, and on
       * screen that reads as "she has a voice" right up until she has to
       * speak. */
      const { data: row, error: rowErr } = await db
        .from('adult_voices')
        .insert({
          dealer_id: DEALER_ID,
          label: name,
          provider: 'spicyapi',
          provider_voice_id: voice,
          clone_type: 'preset',
          status: 'ready',
          settings: { model: model || undefined, instructions: instructions || undefined },
        })
        .select('id, label, provider_voice_id, settings')
        .single();
      if (rowErr || !row) {
        return no(`The voice could not be saved: ${rowErr?.message || 'no row came back'}`, 502);
      }

      const { error: linkErr } = await db
        .from('adult_identities').update({ voice_id: row.id }).eq('id', identityId);
      if (linkErr) return no(`The voice was saved but could not be put on her: ${linkErr.message}`, 502);

      return NextResponse.json({ voice: row });
    }

    return no('The studio asked for something this route does not do.');
  } catch (e) {
    return no(e instanceof Error ? e.message : 'The voice provider refused that and gave no reason.', 502);
  }
}

type VoiceRow = { id: string; provider_voice_id: string | null; settings: unknown };

async function voiceOf(db: SupabaseClient, identityId: string): Promise<VoiceRow | null> {
  const { data: who } = await db
    .from('adult_identities').select('voice_id').eq('id', identityId).maybeSingle();
  if (!who?.voice_id) return null;
  const { data: voice } = await db
    .from('adult_voices').select('id, provider_voice_id, settings').eq('id', who.voice_id).maybeSingle();
  return (voice as VoiceRow) || null;
}

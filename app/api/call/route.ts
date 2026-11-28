// app/api/call/route.ts
//
// SHE PICKS UP THE PHONE.
//
// A live call is the thing this category actually sells. Everything else
// here - the stills, the clips, even the chat - is something the next
// product will also have. A woman who answers, hears you and talks back
// with no send button in the middle is not.
//
// THE KEY NEVER LEAVES THIS FILE.
//
// The provider's realtime socket is opened BY THE BROWSER, which would
// normally mean handing a browser the account key. It does not: this route
// creates the session with the key and gets back a url carrying a one-time
// ticket. The ticket works once, within a minute, and is the whole
// credential - so the browser gets a door that closes behind it instead of
// a key to the building.
//
// That is also why this route does so little. It is a doorman.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { DEALER_ID, SUPABASE_ANON, SUPABASE_URL } from '@/lib/config';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BASE = (process.env.ADULT_IMAGE_API_URL || 'https://api.spicyapi.com/v1').replace(/\/$/, '');

/** The provider caps the persona text it will take on a session. */
const MOST_INSTRUCTIONS = 8000;

/** Models that take a live call, and what each one refuses.
 *
 *  Sending the wrong field is a 400 and a dead call, so the shape of the
 *  request is decided here from the model rather than hoped for. */
const LIVE = {
  'spicy-live-1': { turnDetection: true, language: false },
  'spicy-live-2': { turnDetection: false, language: true },
} as const;

type LiveModel = keyof typeof LIVE;

function no(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function key(): string {
  const k = process.env.ADULT_IMAGE_API_KEY || process.env.SPICYAPI_KEY;
  if (!k) {
    throw new Error('This deployment has no provider key, so the call cannot be placed. Add SPICYAPI_KEY in Vercel and redeploy. Nothing was spent.');
  }
  return k;
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

/** The provider's own words for what went wrong, turned into something a
 *  person can act on. A call that fails silently is worse than one that
 *  never starts. */
function refusal(status: number, code: string, said: string): string {
  if (code === 'payment_required' || status === 402) {
    return 'The provider says there is not enough balance on the account to open a call. Top it up and try again - nothing was spent.';
  }
  if (code === 'content_blocked' || status === 422) {
    return `The provider refused to start a call with that personality: ${said || 'it was screened and blocked'}. Edit "Who she is" under the chat and try again. Nothing was spent.`;
  }
  if (code === 'age_verification_required') {
    return 'The provider wants the account age-verified before it will run live calls. That is done on their site, on the account the key belongs to.';
  }
  if (status === 401 || status === 403) {
    return `The provider refused the key on this deployment (${status}). Check SPICYAPI_KEY in Vercel.`;
  }
  if (status === 404) {
    return 'This provider account does not have live calls switched on - the realtime endpoint is not there. Nothing was spent.';
  }
  return said
    ? `The call could not be opened: ${said}`
    : `The call could not be opened (${status}). Nothing was spent.`;
}

async function provider(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not json */ }

  if (!res.ok) {
    const err = (body as { error?: { message?: string; code?: string }; message?: string; code?: string } | null);
    const said = err?.error?.message || err?.message || text.slice(0, 300);
    const code = err?.error?.code || err?.code || '';
    throw new Error(refusal(res.status, String(code), String(said || '')));
  }
  return body;
}

/**
 * Who she is, written for a voice call rather than for a chat window.
 *
 * Her memory goes in whole, same as it does for typing, because the point
 * of the memory is that it is the same woman down the phone as in the
 * messages. The rest is about the medium: nobody reads a paragraph aloud,
 * and asterisks are not a sound.
 */
function instructionsFor(her: {
  name: string; persona: string; memory: string; greeting: string;
}, carry: string): string {
  const parts = [
    `You are ${her.name}, on a phone call with one person who you know. You are not an assistant. `
    + 'Never offer to help, never list anything, never break character, never mention being an AI or a model.',
    `WHO YOU ARE:\n${her.persona || 'Warm, direct, a bit teasing.'}`,
    her.memory
      ? `WHAT YOU KNOW ABOUT HIM, from everything you have talked about before. Use it the way a person does on the phone - mention it when it fits, never recite it:\n${her.memory}`
      : 'You have not learned much about him yet. Be curious, and ask.',
    'HOW YOU TALK ON THE PHONE: short turns, one or two sentences, the way people actually speak. '
    + 'Interrupt yourself, trail off, ask him things. Never read a list out loud. '
    + 'Never say stage directions - no asterisks, no describing your own tone, no narrating what you are doing. '
    + 'If he goes quiet, say something rather than waiting.',
    her.greeting ? `OPEN WITH SOMETHING LIKE: "${her.greeting}"` : '',
    /* Carried over when a call ran past the provider's session limit and a
     * second one was opened underneath him. Without this she answers the
     * new session as though the first thirteen minutes never happened. */
    carry ? `THE CALL IS ALREADY IN PROGRESS. This is what has been said so far - carry straight on, do not greet him again:\n${carry}` : '',
  ].filter(Boolean);

  const all = parts.join('\n\n');
  return all.length > MOST_INSTRUCTIONS ? `${all.slice(0, MOST_INSTRUCTIONS - 3)}...` : all;
}

export async function POST(req: Request) {
  const db = asCaller(req);
  if (!db) return no('Your sign in has expired. Reload the page and sign in again.', 401);

  const { data: { user } } = await db.auth.getUser();
  if (!user) return no('Your sign in has expired. Reload the page and sign in again.', 401);

  const { data: member } = await db
    .from('dealer_members').select('dealer_id')
    .eq('user_id', user.id).eq('dealer_id', DEALER_ID).maybeSingle();
  if (!member) return no('This login is not on the studio account.', 403);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return no('The studio sent something it could not read.'); }

  const doing = String(body.doing || 'open');

  try {
    /* ------------------------------------------------- what she can sound like
     *
     * Asked of the provider rather than written down here, because a list
     * of voice names hard-coded into a build is a list that is wrong the
     * first time they add one. What comes back is handed over whole and the
     * screen does the filtering, so a voice this code has never heard of
     * still shows up. */
    if (doing === 'voices') {
      const got = await provider('/voices?limit=200', { method: 'GET' }) as
        { data?: unknown[]; voices?: unknown[] } | unknown[] | null;
      const list = Array.isArray(got) ? got : (got?.data || got?.voices || []);
      return NextResponse.json({ voices: list });
    }

    /* ------------------------------------------------------------ open a line */
    if (doing === 'open') {
      const companionId = String(body.companion_id || '').trim();
      if (!companionId) return no('Which companion?');

      const { data: her } = await db
        .from('adult_companions')
        .select('id, name, persona, memory, greeting, call_voice, call_model')
        .eq('id', companionId).maybeSingle();
      if (!her) return no('She is not on this account.');

      const asked = String(body.model || her.call_model || 'spicy-live-1');
      const model = (asked in LIVE ? asked : 'spicy-live-1') as LiveModel;
      const voice = String(body.voice ?? her.call_voice ?? '').trim();
      const carry = String(body.carry || '').trim().slice(0, 3000);

      const ask: Record<string, unknown> = {
        model,
        instructions: instructionsFor({
          name: String(her.name || 'Her'),
          persona: String(her.persona || ''),
          memory: String(her.memory || ''),
          greeting: String(her.greeting || ''),
        }, carry),
        /* Their own id for this end user, so their logs and ours agree on
         * who was on the call. */
        user: `companion_${companionId}`.slice(0, 128),
      };
      /* An empty voice is left OUT rather than sent as "", so the provider
       * uses its own default. A first call should need no setting up. */
      if (voice) ask.voice = voice;

      const made = await provider('/realtime/sessions', {
        method: 'POST',
        body: JSON.stringify(ask),
      }) as {
        id?: string;
        url?: string;
        model?: string;
        voice?: string;
        max_seconds?: number;
        client_secret?: { value?: string; expires_at?: number };
        input_audio?: string;
        output_audio?: string;
      } | null;

      const ticket = made?.client_secret?.value || '';
      const url = made?.url
        || (ticket ? `wss://api.spicyapi.com/v1/realtime?session=${encodeURIComponent(ticket)}` : '');

      if (!url) {
        return no(
          'The provider opened a session but did not hand back an address to call it on, so there is nothing to connect to. Nothing was spent.',
          502,
        );
      }

      /* Remembered so the next call needs no setting up. A failure here is
       * not worth losing a line that is already open over. */
      if (voice !== String(her.call_voice || '') || model !== String(her.call_model || '')) {
        await db.from('adult_companions')
          .update({ call_voice: voice || null, call_model: model })
          .eq('id', companionId);
      }

      return NextResponse.json({
        url,
        id: made?.id || '',
        model: made?.model || model,
        voice: made?.voice || voice || '',
        max_seconds: typeof made?.max_seconds === 'number' ? made.max_seconds : 780,
        /* Handed on untouched so the screen can SAY what the line expects
         * rather than this code assuming it. If they ever change the
         * sample rate, the mismatch is readable instead of silent. */
        input_audio: made?.input_audio || '',
        output_audio: made?.output_audio || '',
      });
    }

    /* ------------------------------------------ what she takes away from it
     *
     * A thirteen minute call can be two hundred things said, and none of it
     * reaches her memory on its own - the typing route only rewrites her
     * notes every tenth message. So hanging up asks her to write down what
     * was talked about, the same way and into the same field.
     *
     * It runs after the call rather than during it. Nobody wants her to go
     * quiet mid-sentence because her diary needed updating. */
    if (doing === 'remember') {
      const companionId = String(body.companion_id || '').trim();
      if (!companionId) return no('Which companion?');

      const { data: her } = await db
        .from('adult_companions').select('id, name, memory').eq('id', companionId).maybeSingle();
      if (!her) return no('She is not on this account.');

      const { data: history } = await db
        .from('adult_messages')
        .select('role, content, created_at')
        .eq('companion_id', companionId)
        .order('created_at', { ascending: false })
        .limit(60);
      const recent = (history || []).reverse() as { role: string; content: string }[];
      if (!recent.length) return NextResponse.json({ memory: String(her.memory || ''), changed: false });

      const said = await provider('/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: 'spicy-chat-1',
          temperature: 0.4,
          max_tokens: 900,
          messages: [
            {
              role: 'system',
              content:
                'You keep notes for somebody about a person they are close to. You are given the notes so far and a conversation that just happened out loud. '
                + 'Rewrite the notes so they hold everything still true and everything newly learned: his name, his work, the people and things he mentions, '
                + 'what he likes and does not, what is going on in his life, and anything he said matters to him. '
                + 'Plain short lines. No preamble, no headings, no commentary - the notes only. Never invent anything he did not say. '
                + 'Drop nothing that is still true.',
            },
            {
              role: 'user',
              content:
                `NOTES SO FAR:\n${her.memory || '(nothing yet)'}\n\nWHAT WAS JUST SAID ON THE PHONE:\n`
                + recent.map((m) => `${m.role === 'user' ? 'HIM' : her.name}: ${m.content}`).join('\n')
                + '\n\nThe rewritten notes:',
            },
          ],
        }),
      }) as { choices?: { message?: { content?: string } }[] } | null;

      const memory = said?.choices?.[0]?.message?.content?.trim() || '';
      if (!memory) {
        /* Her old notes are worth more than a blank page, so a model that
         * answered with nothing changes nothing. */
        return NextResponse.json({ memory: String(her.memory || ''), changed: false });
      }

      const { error: saveErr } = await db.from('adult_companions')
        .update({ memory, memory_at: 0, updated_at: new Date().toISOString() })
        .eq('id', companionId);
      if (saveErr) return no(`She wrote it down but it could not be saved: ${saveErr.message}`, 502);

      return NextResponse.json({ memory, changed: true });
    }

    return no('The studio asked for something this route does not do.');
  } catch (e) {
    return no(e instanceof Error ? e.message : 'The call could not be opened and no reason was given.', 502);
  }
}

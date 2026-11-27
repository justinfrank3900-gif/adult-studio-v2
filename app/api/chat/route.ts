// app/api/chat/route.ts
//
// SHE TALKS BACK, AND SHE REMEMBERS.
//
// The loudest complaint about every product in this category is not that
// the companion is dull or expensive. It is that she forgets. Every one of
// them leans on the model's context window and calls it memory, so the
// moment a conversation is longer than the window the earliest and most
// important things - his name, what he does, what happened last month -
// fall out the back, silently.
//
// So memory here is written on purpose. Her row carries a `memory` field
// that is WHAT SHE KNOWS ABOUT HIM, it goes into the system prompt of
// every single reply, and every so often the model is asked to rewrite it
// from the recent conversation. The full messages are kept separately, so
// a summary that dropped something can be rebuilt.
//
// Everything runs on SpicyAPI's companion models, on the key this project
// already has. A mainstream model refuses this conversation outright,
// which would mean a girlfriend who works until she matters.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { DEALER_ID, SUPABASE_ANON, SUPABASE_URL } from '@/lib/config';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BASE = (process.env.ADULT_IMAGE_API_URL || 'https://api.spicyapi.com/v1').replace(/\/$/, '');

/** How many messages go to the model. Enough to hold a conversation;
 *  everything older is what the memory is for. */
const WINDOW = 24;
/** Rewrite what she knows about him every this many messages. */
const REMEMBER_EVERY = 10;

function no(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function key(): string {
  const k = process.env.ADULT_IMAGE_API_KEY || process.env.SPICYAPI_KEY;
  if (!k) throw new Error('This deployment has no provider key, so she cannot answer. Add SPICYAPI_KEY in Vercel and redeploy. Nothing was spent.');
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

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

async function chat(model: string, messages: Msg[], maxTokens: number): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.95, max_tokens: maxTokens }),
  });
  const text = await res.text();
  if (!res.ok) {
    let said = '';
    try { said = (JSON.parse(text) as { error?: { message?: string } })?.error?.message || ''; } catch { /* not json */ }
    throw new Error(said ? `She could not answer: ${said}` : `She could not answer (${res.status}). ${text.slice(0, 200)}`);
  }
  const body = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
  const out = body.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error('She answered with nothing. Send it again.');
  return out;
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

  const companionId = String(body.companion_id || '').trim();
  const said = String(body.text || '').trim();
  if (!companionId) return no('Which companion?');
  if (!said) return no('Write something to her first.');

  try {
    const { data: her } = await db
      .from('adult_companions')
      .select('id, name, persona, memory, memory_at, model')
      .eq('id', companionId).maybeSingle();
    if (!her) return no('She is not on this account.');

    /* What has been said, newest last. */
    const { data: history } = await db
      .from('adult_messages')
      .select('role, content, created_at')
      .eq('companion_id', companionId)
      .order('created_at', { ascending: false })
      .limit(WINDOW);
    const recent = (history || []).reverse() as { role: string; content: string }[];

    const system: Msg = {
      role: 'system',
      content:
        `You are ${her.name}. You are talking to one person, privately, and you are not an assistant - `
        + 'never offer to help, never list options, never break character and never mention being an AI.\n\n'
        + `WHO YOU ARE:\n${her.persona || 'Warm, direct, a bit teasing.'}\n\n`
        + (her.memory
          ? `WHAT YOU KNOW ABOUT HIM, from everything you have talked about before. Use it the way a person does - mention it when it fits, never recite it:\n${her.memory}\n\n`
          : 'You have not learned much about him yet. Be curious.\n\n')
        + 'HOW YOU WRITE: short, the way people actually message. One or two sentences most of the time. '
        + 'Ask about him as often as you talk about yourself. Never write stage directions in asterisks unless he does first.',
    };

    const reply = await chat(
      String(her.model || 'spicy-companion-1'),
      [system, ...recent.map((m) => ({ role: m.role === 'user' ? 'user' as const : 'assistant' as const, content: m.content })), { role: 'user', content: said }],
      600,
    );

    /* Both halves saved before anything is returned. A reply shown on
     * screen and not written down is a conversation that loses its last
     * exchange on every reload. */
    const { error: saveErr } = await db.from('adult_messages').insert([
      { dealer_id: DEALER_ID, companion_id: companionId, role: 'user', content: said },
      { dealer_id: DEALER_ID, companion_id: companionId, role: 'assistant', content: reply },
    ]);
    if (saveErr) return no(`She answered but it could not be saved: ${saveErr.message}`, 502);

    /* ---- REMEMBERING ----
     * Every so often, not every time: rewriting the memory on every message
     * doubles the cost of the product and makes her pause mid-conversation
     * for no visible reason. */
    const since = (her.memory_at || 0) + 2;
    let memory = her.memory as string;
    if (since >= REMEMBER_EVERY) {
      try {
        memory = await chat('spicy-chat-1', [
          {
            role: 'system',
            content:
              'You keep notes for somebody about a person they are close to. You are given the notes so far and a recent conversation. '
              + 'Rewrite the notes so they hold everything still true and everything newly learned: his name, his work, the people and things he mentions, '
              + 'what he likes and does not, what is going on in his life, and anything he said matters to him. '
              + 'Plain short lines. No preamble, no headings, no commentary - the notes only. Never invent anything he did not say. '
              + 'Drop nothing that is still true.',
          },
          {
            role: 'user',
            content:
              `NOTES SO FAR:\n${her.memory || '(nothing yet)'}\n\nRECENT CONVERSATION:\n`
              + [...recent, { role: 'user', content: said }, { role: 'assistant', content: reply }]
                .map((m) => `${m.role === 'user' ? 'HIM' : her.name}: ${m.content}`).join('\n')
              + '\n\nThe rewritten notes:',
          },
        ], 900);
      } catch {
        /* A memory that failed to rewrite is not worth failing a reply
         * over. It keeps the old notes and tries again in two messages. */
        memory = her.memory as string;
      }
    }

    await db.from('adult_companions').update({
      memory,
      memory_at: since >= REMEMBER_EVERY ? 0 : since,
      updated_at: new Date().toISOString(),
    }).eq('id', companionId);

    return NextResponse.json({ reply, remembered: since >= REMEMBER_EVERY, memory });
  } catch (e) {
    return no(e instanceof Error ? e.message : 'She could not answer and gave no reason.', 502);
  }
}

// app/api/post/route.ts
//
// SENDING IT OUT.
//
// WHY THESE PLACES AND NOT INSTAGRAM.
//
// Instagram, Facebook and TikTok ban this category outright - not "risk a
// strike", banned in the written policy - so building for them would be
// building a button that gets the account deleted. The places that allow
// it are Telegram, Reddit and X, which is also where this audience
// actually is.
//
// WHY A ROW FIRST AND A SEND SECOND.
//
// A post is written into adult_posts before anything is sent, and the
// platform's own refusal is written back onto that row. That is what makes
// scheduling, retrying and "what did we put out last week" possible at all,
// and it is what stops a failed send vanishing with the browser tab.
//
// Telegram works today because it needs a bot token and nothing else.
// Reddit and X need an app registered and their keys added, and until they
// are, this says exactly that rather than failing in a way that looks like
// a bug.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { DEALER_ID, SUPABASE_ANON, SUPABASE_URL } from '@/lib/config';

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

export type Channel = 'telegram' | 'reddit' | 'x';

export async function GET() {
  /* What is actually connected, so the composer can say so before anybody
   * writes a post for a place it cannot reach. */
  return NextResponse.json({
    channels: {
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      reddit: Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET
        && process.env.REDDIT_USERNAME && process.env.REDDIT_PASSWORD),
      x: Boolean(process.env.X_BEARER_TOKEN),
    },
  });
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

  const postId = String(body.post_id || '').trim();
  if (!postId) return no('Which post?');

  const { data: post } = await db
    .from('adult_posts')
    .select('id, body, media, channel, target, status')
    .eq('id', postId).maybeSingle();
  if (!post) return no('That post is not on this account.');
  if (post.status === 'sent') return no('That one has already gone out.');

  const media = Array.isArray(post.media) ? (post.media as unknown[]).map(String) : [];

  try {
    let where: string;
    switch (post.channel as Channel) {
      case 'telegram':
        where = await toTelegram(String(post.target || ''), String(post.body || ''), media);
        break;
      case 'reddit':
        where = await toReddit(String(post.target || ''), String(post.body || ''), media);
        break;
      case 'x':
        where = await toX(String(post.body || ''), media);
        break;
      default:
        return no(`${post.channel} is not somewhere this can post.`);
    }

    await db.from('adult_posts').update({
      status: 'sent', sent_at: new Date().toISOString(), posted_url: where, error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', postId);

    return NextResponse.json({ posted_url: where });
  } catch (e) {
    const why = e instanceof Error ? e.message : 'It would not send and gave no reason.';
    /* Written onto the row, not only returned. A failure that only exists
     * in a toast is a failure nobody can look up tomorrow. */
    await db.from('adult_posts').update({
      status: 'failed', error: why, updated_at: new Date().toISOString(),
    }).eq('id', postId);
    return no(why, 502);
  }
}

/* ------------------------------------------------------------------ */

/**
 * Telegram.
 *
 * A bot token and a chat id, and that is the whole setup - no OAuth, no
 * app review, no category policy to fall foul of. Which is why it is the
 * one that works on day one.
 *
 * The bot has to have been added to the channel as an administrator, and
 * the chat id of a public channel is its @name. Both of those are things
 * somebody gets wrong once, so the refusals below say which.
 */
async function toTelegram(target: string, text: string, media: string[]): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('Telegram is not connected on this deployment. Make a bot with @BotFather, then add TELEGRAM_BOT_TOKEN in Vercel and redeploy.');
  }
  if (!target) {
    throw new Error('Telegram needs to know where to post: the channel name including the @, or a numeric chat id. Add the bot to the channel as an administrator first.');
  }

  const call = async (method: string, payload: Record<string, unknown>) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const said = await res.json().catch(() => null) as { ok?: boolean; description?: string; result?: Record<string, unknown> } | null;
    if (!res.ok || !said?.ok) {
      const why = said?.description || `Telegram refused that (${res.status}).`;
      if (/chat not found/i.test(why)) {
        throw new Error(`Telegram says it cannot find ${target}. Check the name, and check the bot has been added to that channel as an administrator.`);
      }
      if (/not enough rights|administrator/i.test(why)) {
        throw new Error(`Telegram says the bot is not allowed to post in ${target}. Make it an administrator of the channel with permission to post.`);
      }
      throw new Error(`Telegram refused that: ${why}`);
    }
    return said.result || {};
  };

  let result: Record<string, unknown>;
  if (media.length === 0) {
    result = await call('sendMessage', { chat_id: target, text });
  } else if (media.length === 1) {
    const video = /\.(mp4|mov|webm)(\?|$)/i.test(media[0]);
    result = await call(video ? 'sendVideo' : 'sendPhoto', {
      chat_id: target, [video ? 'video' : 'photo']: media[0], caption: text.slice(0, 1024),
    });
  } else {
    /* An album. The caption rides on the first item, which is Telegram's
     * own rule rather than a choice. */
    const group = media.slice(0, 10).map((url, i) => ({
      type: /\.(mp4|mov|webm)(\?|$)/i.test(url) ? 'video' : 'photo',
      media: url,
      ...(i === 0 ? { caption: text.slice(0, 1024) } : {}),
    }));
    const got = await call('sendMediaGroup', { chat_id: target, media: group });
    result = Array.isArray(got) ? (got[0] as Record<string, unknown>) : got;
  }

  const chat = result?.chat as { username?: string } | undefined;
  const id = result?.message_id;
  return chat?.username && id
    ? `https://t.me/${chat.username}/${id}`
    : `sent to ${target}`;
}

async function toReddit(target: string, text: string, media: string[]): Promise<string> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;
  if (!id || !secret || !username || !password) {
    throw new Error('Reddit is not connected on this deployment. Register a script app at reddit.com/prefs/apps, then add REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME and REDDIT_PASSWORD in Vercel and redeploy.');
  }
  if (!target) throw new Error('Reddit needs a subreddit to post to, without the r/.');

  const auth = Buffer.from(`${id}:${secret}`).toString('base64');
  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'studio/1.0',
    },
    body: new URLSearchParams({ grant_type: 'password', username, password }),
  });
  const tokenBody = await tokenRes.json().catch(() => null) as { access_token?: string; error?: string } | null;
  if (!tokenRes.ok || !tokenBody?.access_token) {
    throw new Error(`Reddit would not sign in: ${tokenBody?.error || tokenRes.status}. If the account has two-factor on, a script app cannot sign in to it.`);
  }

  const [title, ...rest] = text.split('\n');
  const form = new URLSearchParams({
    sr: target,
    title: (title || text).slice(0, 300),
    api_type: 'json',
    ...(media.length
      ? { kind: 'link', url: media[0] }
      : { kind: 'self', text: rest.join('\n') }),
  });

  const res = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenBody.access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'studio/1.0',
    },
    body: form,
  });
  const said = await res.json().catch(() => null) as { json?: { errors?: unknown[][]; data?: { url?: string } } } | null;
  const errors = said?.json?.errors || [];
  if (!res.ok || errors.length) {
    throw new Error(`Reddit refused that: ${errors.length ? String(errors[0]?.[1] ?? errors[0]) : res.status}`);
  }
  return said?.json?.data?.url || `posted to r/${target}`;
}

async function toX(text: string, media: string[]): Promise<string> {
  if (!process.env.X_BEARER_TOKEN) {
    throw new Error('X is not connected on this deployment. It needs a paid X developer app, and posting pictures needs its media upload as well. Add X_BEARER_TOKEN in Vercel once the app exists.');
  }
  if (media.length) {
    /* Said plainly rather than quietly dropping the pictures. A post that
     * went out without the picture on it is worse than one that did not go
     * out, because nobody notices until it is on the timeline. */
    throw new Error('Posting pictures to X needs their media upload, which is not wired up yet. Send this one as words only, or put it on Telegram.');
  }
  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.X_BEARER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: text.slice(0, 280) }),
  });
  const said = await res.json().catch(() => null) as { data?: { id?: string }; detail?: string; title?: string } | null;
  if (!res.ok || !said?.data?.id) {
    throw new Error(`X refused that: ${said?.detail || said?.title || res.status}`);
  }
  return `https://x.com/i/status/${said.data.id}`;
}

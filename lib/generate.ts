'use client';

// lib/generate.ts
//
// Asking for a picture or a clip, with proof of who is asking.
//
// /api/generate resolves the caller from an Authorization: Bearer header and
// not a cookie. A plain fetch sends cookies and no header, arrives anonymous
// and comes back "Not authorised" - which is a mistake worth writing down,
// because it is the one that cost the marketing studio a whole evening.

import { token } from './data';

export type Made = {
  /** The provider's own url. This is the identity seed: an edit can only
   *  anchor on a url the provider served. */
  provider_url: string;
  /** Our copy, in our bucket. This is what the page shows. */
  url: string;
  path: string;
};

export async function make(body: {
  what: 'still' | 'clip';
  prompt: string;
  identity_id?: string | null;
  seed_url?: string | null;
  /** Her chr_ id, when she has one. */
  character?: string | null;
  /** A photograph from outside, as a public url or a data: url. */
  reference_image?: string | null;
  label?: string;
  aspect?: '9:16' | '16:9';
  duration?: number;
  action?: string | null;
}): Promise<Made> {
  const jwt = await token();
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(body),
  });
  const said = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    /* The route's own sentence wins. It was written to be read by the person
     * standing in front of the button, and a status code is not. */
    throw new Error(
      (said?.error as string) || `The studio refused that (${res.status}). Nothing was saved.`,
    );
  }
  return said as unknown as Made;
}

/** Register her with the provider from her own stills. */
export async function registerCharacter(name: string, spicyUrls: string[]): Promise<string> {
  const jwt = await token();
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ what: 'character', name, spicy_urls: spicyUrls }),
  });
  const said = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new Error((said?.error as string) || `She could not be registered (${res.status}).`);
  return String(said?.character || '');
}

'use client';

// lib/supabase.ts
//
// THE ONE CLIENT, AND WHY THERE IS NO SERVICE KEY ANYWHERE IN THIS APP.
//
// Every adult_* table carries an RLS policy of exactly one shape: you may
// touch a row when you are a member of the dealer it belongs to. The storage
// bucket carries the same rule on its first folder. That means the browser,
// signed in as Justin, can read and write everything this studio needs and
// nothing it does not - and the database is the thing enforcing it, not a
// line of our code that somebody could forget to write.
//
// A service-role key would bypass all of it, which is why this app does not
// have one. The only secret it holds is the SpicyAPI key, and that lives on
// the server in /api/generate where the browser never sees it.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON, SUPABASE_URL } from './config';

let client: SupabaseClient | null = null;

export function supa(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON);
  return client;
}

export { BUCKET, DEALER_ID } from './config';

// lib/config.ts
//
// WHERE THE DATABASE IS, AND WHY THE ADDRESS IS IN THE FILE.
//
// Both of these are public by design. NEXT_PUBLIC_ means a value is compiled
// into the JavaScript the browser downloads, so an anon key in an env var and
// an anon key in a source file are exactly as exposed as each other - the
// portal has been serving this same key in its bundle all year. It reads
// nothing on its own: every table here is behind a row rule that asks who you
// are signed in as, and anonymous is nobody.
//
// They are literals rather than env vars because the deployment they belong
// to cannot have env vars added to it from here, and a studio that cannot
// reach its own database until somebody pastes two public strings into a
// dashboard is a studio that does not work. An env var still wins if one is
// set, which is what makes pointing this at a different project a one-line
// change rather than an edit.

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nbvvueprzsbuvqpsxaze.supabase.co';

export const SUPABASE_ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5idnZ1ZXByenNidXZxcHN4YXplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNzQ1MjksImV4cCI6MjEwMDk1MDUyOX0.7sOJKRqw86mMHcd1szPy3vH8xos-1oQj-57u4lhvMKg';

/** Everything in this studio belongs to one account. */
export const DEALER_ID = 'aefa389c-eb5d-44a0-83fa-ca904de03618';

/** The studio's own bucket. Separate from avatar-studio on purpose: nothing
 *  made here can ever be served out of the folder a dealer's marketing reel
 *  reads from. */
export const BUCKET = 'adult-studio';

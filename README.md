# The Studio

A standalone adult-content studio with the TYME Avatar Studio's screens and
SpicyAPI behind them. It is its own app on its own URL, not a room inside the
portal: nothing in here imports from the portal and nothing in the portal
imports from here.

## How it is kept apart

- **Its own tables.** Every read and write goes to `adult_*`, which are
  column-for-column mirrors of the portal's `avatar_*`. A performer made here
  can never appear in a dealer's Cast and a clip made here can never be picked
  up by the dealer-facing floor.
- **Its own bucket.** Files land in `adult-studio`, never `avatar-studio`.
- **No service key.** The browser signs in as a real person and every query
  goes out under their token, so the database's row rules are what decide
  what is readable - not a line of our code that somebody could forget to
  write. The one secret in the app is the SpicyAPI key, and it never leaves
  the server.

## The one rule that makes it work

The first picture of a performer CREATES her. Every picture after it is an
EDIT of that same picture, sent back to the provider by the url the provider
itself served. Without that chain she comes back as a different woman in the
right clothes every time, and it looks like success until you put two stills
side by side.

So the studio keeps two urls for every still: the provider's (the anchor) and
our own copy (what the page shows, and what survives the provider expiring
their link).

## Settings

Only one is required, and it is already set:

- `SPICYAPI_KEY` - the provider key.

Optional: `ADULT_IMAGE_API_URL` / `ADULT_VIDEO_API_URL` to point somewhere
other than `https://api.spicyapi.com/v1`, and `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` to point at a different database. The
defaults are in `lib/config.ts` and are public values by design.

`NEXT_PUBLIC_DEMO=1` in a local `.env.local` fills the rooms with made-up
rows and skips the login, so the screens can be looked at on a laptop. It is
never set in Vercel.

## Running it

    npm install
    npm run dev

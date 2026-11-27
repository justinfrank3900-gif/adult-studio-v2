// lib/types.ts
//
// The rows this studio reads, named for what they are on screen rather than
// for the table they came from. A `prompt` row has always been a saved
// location and a `segment` has always been a take; calling them that at every
// call site is most of why the original studio was hard to follow.

/** adult_identities: a performer the studio can film. */
export type Identity = {
  id: string;
  name: string;
  master_ref_asset_ids: string[];
  identity_lock_prompt: string | null;
  is_default: boolean;
  retired_at: string | null;
  /** The SpicyAPI CDN url of the picture that MADE this performer. Every
   *  later still is an edit of this one, which is the only thing that keeps
   *  a face the same from shot to shot. Kept in meta on the asset row. */
  seed_url?: string | null;
};

/** adult_assets: a still. */
export type Asset = {
  id: string;
  identity_id: string | null;
  kind: string;
  label: string | null;
  public_url: string;
  storage_path: string | null;
  is_master_ref: boolean;
  wardrobe: string | null;
  angle: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

/** adult_wardrobe: an outfit. */
export type Outfit = {
  id: string;
  label: string;
  prompt_text: string;
  sort_order: number;
  /** This outfit photographed on each performer, keyed by identity id. */
  last_shots: Record<string, string> | null;
  reference_url: string | null;
};

/** adult_prompts: a saved location. */
export type SetRow = {
  id: string;
  label: string;
  prompt_text: string;
  negative_prompt: string | null;
  sort_order: number;
  reference_url: string | null;
};

/** adult_productions: one shoot. */
export type Shoot = {
  id: string;
  name: string | null;
  title: string;
  status: string;
  created_at: string;
  identity_id: string | null;
  scene_id: string | null;
  final_video_url: string | null;
  archived_at: string | null;
};

/** adult_segments: one take. */
export type Take = {
  id: string;
  production_id: string;
  order_index: number;
  layer: string;
  script_line: string | null;
  prompt_id: string | null;
  status: string;
  video_url: string | null;
  image_url: string | null;
  error: string | null;
  identity_id: string | null;
  outfit_id: string | null;
  direction_note: string | null;
  opens_on_frame_url: string | null;
  ends_on_frame_url: string | null;
};

/** Where a take has got to, in the words a person needs. */
export function takeState(s: Take): { word: string; tone: 'ok' | 'warn' | 'busy' | 'idle' } {
  if (s.status === 'ready') return { word: 'Shot', tone: 'ok' };
  if (s.status === 'failed' || s.status === 'rejected') return { word: 'Needs another go', tone: 'warn' };
  if (s.status === 'draft') return { word: 'Not shot yet', tone: 'idle' };
  return { word: 'Rolling', tone: 'busy' };
}

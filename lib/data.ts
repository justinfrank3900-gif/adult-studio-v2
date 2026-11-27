'use client';

// lib/data.ts
//
// Every read and write the studio makes, in one place.
//
// They all go out as the signed-in person, so the database's row rules are
// what decide the answer. A query that comes back empty here is not a bug to
// work around with a service key - it means the rule said no, and the rule is
// the thing keeping this account's work apart from the dealers'.

import { supa, DEALER_ID, BUCKET } from './supabase';
import type { Asset, Identity, Outfit, SetRow, Shoot, Take } from './types';

/** The provider's own sentence, kept whole. */
export class Refused extends Error {}

function hopeless(what: string, message: string): never {
  throw new Refused(`${what} failed: ${message}`);
}

export async function token(): Promise<string> {
  const { data } = await supa().auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Refused('Your sign in has expired. Reload the page and sign in again. Nothing was spent.');
  return t;
}

/* ------------------------------- reading ------------------------------- */

export async function loadCast(): Promise<Identity[]> {
  const { data, error } = await supa()
    .from('adult_identities')
    .select('id,name,master_ref_asset_ids,identity_lock_prompt,is_default,retired_at')
    .eq('dealer_id', DEALER_ID)
    .is('retired_at', null)
    .order('name');
  if (error) hopeless('Reading the cast', error.message);
  return (data || []) as Identity[];
}

export async function loadAssets(): Promise<Asset[]> {
  const { data, error } = await supa()
    .from('adult_assets')
    .select('id,identity_id,kind,label,public_url,storage_path,is_master_ref,wardrobe,angle,meta,created_at')
    .eq('dealer_id', DEALER_ID)
    .order('created_at', { ascending: false })
    .limit(600);
  if (error) hopeless('Reading the stills', error.message);
  return (data || []) as Asset[];
}

export async function loadWardrobe(): Promise<Outfit[]> {
  const { data, error } = await supa()
    .from('adult_wardrobe')
    .select('id,label,prompt_text,sort_order,last_shots,reference_url')
    .eq('dealer_id', DEALER_ID)
    .order('sort_order');
  if (error) hopeless('Reading the wardrobe', error.message);
  return (data || []) as Outfit[];
}

export async function loadSets(): Promise<SetRow[]> {
  const { data, error } = await supa()
    .from('adult_prompts')
    .select('id,label,prompt_text,negative_prompt,sort_order,reference_url')
    .eq('dealer_id', DEALER_ID)
    .order('sort_order');
  if (error) hopeless('Reading the sets', error.message);
  return (data || []) as SetRow[];
}

export async function loadShoots(): Promise<Shoot[]> {
  const { data, error } = await supa()
    .from('adult_productions')
    .select('id,name,title,status,created_at,identity_id,scene_id,final_video_url,archived_at')
    .eq('dealer_id', DEALER_ID)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) hopeless('Reading the floor', error.message);
  return (data || []) as Shoot[];
}

export async function loadTakes(productionId: string): Promise<Take[]> {
  const { data, error } = await supa()
    .from('adult_segments')
    .select('id,production_id,order_index,layer,script_line,prompt_id,status,video_url,image_url,error,identity_id,outfit_id,direction_note,opens_on_frame_url,ends_on_frame_url')
    .eq('production_id', productionId)
    .order('order_index');
  if (error) hopeless('Reading the takes', error.message);
  return (data || []) as Take[];
}

/* ------------------------------- writing ------------------------------- */

export async function addPerformer(name: string, look: string): Promise<Identity> {
  const { data, error } = await supa()
    .from('adult_identities')
    .insert({ dealer_id: DEALER_ID, name, identity_lock_prompt: look, master_ref_asset_ids: [] })
    .select('id,name,master_ref_asset_ids,identity_lock_prompt,is_default,retired_at')
    .single();
  if (error) hopeless('Adding the performer', error.message);
  return data as Identity;
}

export async function savePerformer(id: string, patch: Partial<Identity>): Promise<void> {
  const { error } = await supa().from('adult_identities').update(patch).eq('id', id);
  if (error) hopeless('Saving the performer', error.message);
}

export async function retirePerformer(id: string): Promise<void> {
  const { error } = await supa()
    .from('adult_identities')
    .update({ retired_at: new Date().toISOString() })
    .eq('id', id);
  if (error) hopeless('Putting the performer away', error.message);
}

export async function addOutfit(label: string, promptText: string): Promise<Outfit> {
  const { data, error } = await supa()
    .from('adult_wardrobe')
    .insert({ dealer_id: DEALER_ID, label, prompt_text: promptText, sort_order: 999 })
    .select('id,label,prompt_text,sort_order,last_shots,reference_url')
    .single();
  if (error) hopeless('Adding the outfit', error.message);
  return data as Outfit;
}

export async function saveOutfit(id: string, patch: Partial<Outfit>): Promise<void> {
  const { error } = await supa().from('adult_wardrobe').update(patch).eq('id', id);
  if (error) hopeless('Saving the outfit', error.message);
}

export async function removeOutfit(id: string): Promise<void> {
  const { error } = await supa().from('adult_wardrobe').delete().eq('id', id);
  if (error) hopeless('Removing the outfit', error.message);
}

export async function addSet(label: string, promptText: string): Promise<SetRow> {
  const { data, error } = await supa()
    .from('adult_prompts')
    .insert({ dealer_id: DEALER_ID, label, prompt_text: promptText, kind: 'scene', sort_order: 999 })
    .select('id,label,prompt_text,negative_prompt,sort_order,reference_url')
    .single();
  if (error) hopeless('Adding the set', error.message);
  return data as SetRow;
}

export async function saveSet(id: string, patch: Partial<SetRow>): Promise<void> {
  const { error } = await supa().from('adult_prompts').update(patch).eq('id', id);
  if (error) hopeless('Saving the set', error.message);
}

export async function removeSet(id: string): Promise<void> {
  const { error } = await supa().from('adult_prompts').delete().eq('id', id);
  if (error) hopeless('Removing the set', error.message);
}

export async function addShoot(name: string, identityId: string | null, sceneId: string | null): Promise<Shoot> {
  const { data, error } = await supa()
    .from('adult_productions')
    .insert({
      dealer_id: DEALER_ID,
      name,
      title: name,
      status: 'draft',
      identity_id: identityId,
      scene_id: sceneId,
    })
    .select('id,name,title,status,created_at,identity_id,scene_id,final_video_url,archived_at')
    .single();
  if (error) hopeless('Opening the shoot', error.message);
  return data as Shoot;
}

export async function saveShoot(id: string, patch: Partial<Shoot>): Promise<void> {
  const { error } = await supa().from('adult_productions').update(patch).eq('id', id);
  if (error) hopeless('Saving the shoot', error.message);
}

export async function putShootAway(id: string): Promise<void> {
  /* Nothing is destroyed. Every take, every file and every dollar of history
   * stays; clearing this brings the shoot back. */
  const { error } = await supa()
    .from('adult_productions')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) hopeless('Putting the shoot away', error.message);
}

export async function addTake(shoot: Shoot, orderIndex: number): Promise<Take> {
  const { data, error } = await supa()
    .from('adult_segments')
    .insert({
      dealer_id: DEALER_ID,
      production_id: shoot.id,
      order_index: orderIndex,
      layer: 'scene',
      status: 'draft',
      identity_id: shoot.identity_id,
      prompt_id: shoot.scene_id,
    })
    .select('id,production_id,order_index,layer,script_line,prompt_id,status,video_url,image_url,error,identity_id,outfit_id,direction_note,opens_on_frame_url,ends_on_frame_url')
    .single();
  if (error) hopeless('Adding the take', error.message);
  return data as Take;
}

export async function saveTake(id: string, patch: Partial<Take>): Promise<void> {
  const { error } = await supa().from('adult_segments').update(patch).eq('id', id);
  if (error) hopeless('Saving the take', error.message);
}

export async function removeTake(id: string): Promise<void> {
  const { error } = await supa().from('adult_segments').delete().eq('id', id);
  if (error) hopeless('Removing the take', error.message);
}

/* ------------------------------ the stills ----------------------------- */

/**
 * Keep a generated picture.
 *
 * The provider's url is kept as well as our own copy, and that is not
 * belt-and-braces: a SpicyAPI edit can only anchor on a SpicyAPI url, so the
 * CDN address IS the identity seed. Our copy is what the page shows and what
 * survives the provider expiring the link.
 */
export async function keepStill(opts: {
  identityId: string | null;
  spicyUrl: string;
  ourUrl: string;
  storagePath: string;
  kind?: string;
  label?: string | null;
  wardrobe?: string | null;
  angle?: string | null;
  masterRef?: boolean;
  /** Anything else worth keeping beside the still: which photoset run it
   *  belongs to, which pose it was. */
  extra?: Record<string, unknown>;
}): Promise<Asset> {
  const { data, error } = await supa()
    .from('adult_assets')
    .insert({
      dealer_id: DEALER_ID,
      identity_id: opts.identityId,
      kind: opts.kind || 'still',
      label: opts.label ?? null,
      public_url: opts.ourUrl,
      storage_path: opts.storagePath,
      wardrobe: opts.wardrobe ?? null,
      angle: opts.angle ?? null,
      is_master_ref: Boolean(opts.masterRef),
      meta: { spicy_url: opts.spicyUrl, ...(opts.extra || {}) },
    })
    .select('id,identity_id,kind,label,public_url,storage_path,is_master_ref,wardrobe,angle,meta,created_at')
    .single();
  if (error) hopeless('Keeping the still', error.message);
  return data as Asset;
}

/** The provider url a later edit has to anchor on, for this performer. */
export function seedOf(assets: Asset[], identityId: string | null): string | null {
  if (!identityId) return null;
  const mine = assets.filter((a) => a.identity_id === identityId);
  const master = mine.find((a) => a.is_master_ref && typeof a.meta?.spicy_url === 'string');
  const any = mine.find((a) => typeof a.meta?.spicy_url === 'string');
  const pick = master || any;
  return pick ? String(pick.meta?.spicy_url) : null;
}

/** The picture to put on a performer's card. */
export function faceOf(assets: Asset[], identityId: string): string | null {
  const mine = assets.filter((a) => a.identity_id === identityId);
  const master = mine.find((a) => a.is_master_ref);
  return (master || mine[0])?.public_url ?? null;
}

export { BUCKET };

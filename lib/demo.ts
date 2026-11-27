// lib/demo.ts
//
// A STAGED STUDIO, FOR LOOKING AT THE SCREENS WITHOUT SIGNING IN.
//
// Every room here is behind a real login, which is right, and it means the
// only way to check that a screen looks correct is to be Justin. That is how
// a studio ships with a row of tiles where one picture is taller than its
// neighbour: nobody could see it until it was live.
//
// So: NEXT_PUBLIC_DEMO=1 fills the rooms with made-up rows and skips the
// door. It is set in .env.local on a laptop and nowhere else - it is not in
// Vercel, and a build without it cannot reach any of this. It reads nothing
// and writes nothing; the rows below are literals in this file.

import type { Asset, Identity, Outfit, SetRow, Shoot } from './types';

export const DEMO = process.env.NEXT_PUBLIC_DEMO === '1';

const pic = (seed: string, w = 600, h = 800) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

export const demoCast: Identity[] = [
  { id: 'd1', name: 'Samantha', master_ref_asset_ids: [], identity_lock_prompt: "A 27-year-old woman, 5'7\", athletic build with a tiny waist.", is_default: false, retired_at: null },
  { id: 'd2', name: 'Vicky', master_ref_asset_ids: [], identity_lock_prompt: 'A 25-year-old woman, 5 feet 7 inches tall, dramatically cinched waist.', is_default: false, retired_at: null },
  { id: 'd3', name: 'Nadia', master_ref_asset_ids: [], identity_lock_prompt: '', is_default: false, retired_at: null },
];

export const demoAssets: Asset[] = [
  { id: 'a1', identity_id: 'd1', kind: 'still', label: 'Three quarter', public_url: pic('sam1'), storage_path: null, is_master_ref: true, wardrobe: null, angle: 'three_quarter', meta: { spicy_url: 'https://cdn.spicyapi.com/x1.jpg' }, created_at: '2026-11-02T10:00:00Z' },
  { id: 'a2', identity_id: 'd1', kind: 'still', label: 'Close up', public_url: pic('sam2'), storage_path: null, is_master_ref: false, wardrobe: null, angle: 'close', meta: {}, created_at: '2026-11-03T10:00:00Z' },
  { id: 'a3', identity_id: 'd1', kind: 'still', label: 'Full length', public_url: pic('sam3'), storage_path: null, is_master_ref: false, wardrobe: null, angle: 'full', meta: {}, created_at: '2026-11-04T10:00:00Z' },
  { id: 'a4', identity_id: 'd2', kind: 'still', label: 'Straight on', public_url: pic('vic1'), storage_path: null, is_master_ref: true, wardrobe: null, angle: 'front', meta: { spicy_url: 'https://cdn.spicyapi.com/x2.jpg' }, created_at: '2026-11-05T10:00:00Z' },
];

export const demoOutfits: Outfit[] = [
  { id: 'o1', label: 'Black slip dress', prompt_text: 'She is wearing a short black satin slip dress with thin straps.', sort_order: 1, last_shots: { d1: pic('fit1') }, reference_url: null },
  { id: 'o2', label: 'White shirt', prompt_text: 'She is wearing an oversized white cotton shirt, sleeves rolled.', sort_order: 2, last_shots: { d1: pic('fit2') }, reference_url: null },
  { id: 'o3', label: 'Red bikini', prompt_text: 'She is wearing a red string bikini.', sort_order: 3, last_shots: {}, reference_url: null },
  { id: 'o4', label: 'Grey knit', prompt_text: 'She is wearing a soft grey oversized knit jumper.', sort_order: 4, last_shots: { d1: pic('fit4') }, reference_url: null },
];

export const demoSets: SetRow[] = [
  { id: 's1', label: 'Hotel room, late afternoon', prompt_text: 'A high floor hotel room with floor to ceiling windows and low sun.', negative_prompt: null, sort_order: 1, reference_url: pic('set1') },
  { id: 's2', label: 'Kitchen, morning', prompt_text: 'A bright modern kitchen, marble counter, morning light.', negative_prompt: null, sort_order: 2, reference_url: pic('set2') },
  { id: 's3', label: 'Car, night', prompt_text: 'Inside a parked car at night, street lights through the windscreen.', negative_prompt: null, sort_order: 3, reference_url: null },
];

export const demoShoots: Shoot[] = [
  { id: 'p1', name: 'Hotel, Tuesday', title: 'Hotel, Tuesday', status: 'draft', created_at: '2026-11-20T10:00:00Z', identity_id: 'd1', scene_id: 's1', final_video_url: null, archived_at: null },
  { id: 'p2', name: 'Kitchen set', title: 'Kitchen set', status: 'draft', created_at: '2026-11-18T10:00:00Z', identity_id: 'd2', scene_id: 's2', final_video_url: null, archived_at: null },
];

export const demoTakes = [
  { id: 't1', production_id: 'p1', order_index: 1, layer: 'scene', script_line: null, prompt_id: 's1', status: 'frame', video_url: null, image_url: pic('tk1'), error: null, identity_id: 'd1', outfit_id: 'o1', direction_note: 'she turns from the window and walks towards the camera', opens_on_frame_url: pic('sam1'), ends_on_frame_url: pic('tk1') },
  { id: 't2', production_id: 'p1', order_index: 2, layer: 'scene', script_line: null, prompt_id: 's1', status: 'draft', video_url: null, image_url: null, error: null, identity_id: 'd1', outfit_id: 'o1', direction_note: '', opens_on_frame_url: null, ends_on_frame_url: null },
];

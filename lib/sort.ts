// lib/sort.ts
//
// TWO HUNDRED PICTURES ARE NOT TWO HUNDRED OUTFITS.
//
// "I need it to take all of it and build her, especially her wardrobe."
//
// A shoot is twenty photographs of one outfit from eight angles, so a
// folder of 218 is more like twenty-five things to wear. Describing every
// picture would mean paying twenty-five times over for the same dress and
// handing back a rail with eight copies of it on.
//
// So the pictures are SORTED FIRST, here, on this machine, for nothing -
// and only one picture out of each group is ever sent anywhere.
//
// WHAT IT SORTS ON.
//
// Clothes are mostly colour, and the colour that matters is in the middle
// of the frame where the body is. Each picture becomes a small histogram
// of that band - what proportion of it is in each of 64 colour buckets -
// which is a fingerprint of an outfit that survives a change of pose, a
// change of angle and a hand moving. It does NOT survive a change of
// lighting, which is why the brightness is measured separately and
// weighted low.
//
// A face recogniser would be better and is not available: the provider has
// no vision model this can call, and anything that could tell two black
// dresses apart could also tell two people apart, which is not a thing to
// build by hand in a browser.

/* WHY NOT RGB BUCKETS.
 *
 * The first version of this cut red, green and blue into four each and
 * came back with seven outfits out of 218 photographs. On a grey studio
 * backdrop a white dress, a cream one and a nude mesh top all land in the
 * same corner of that cube, and the backdrop itself - which is most of
 * every frame - drowns the clothes.
 *
 * Hue is the thing that actually separates burgundy from red from brown,
 * and it is useless for white, grey and black, which have no hue at all.
 * So those are counted apart, by how light they are. Fifty-three buckets:
 * five shades of grey and forty-eight colours.
 */
const GREYS = 5;
const HUES = 12;
const SATS = 2;
const VALS = 2;
const BUCKETS = GREYS + HUES * SATS * VALS;
/** Below this much colour, a pixel has no hue worth binning. */
const PALE = 0.18;

export type Signature = {
  /** How much of the torso is in each bucket. Sums to 1. */
  body: number[];
  /** The same for the hips and legs - what tells a mini from a maxi. */
  lower: number[];
  /** Mean brightness of the torso, 0 to 1. */
  light: number;
};

function bucketOf(r: number, g: number, b: number): number {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  const sat = max === 0 ? 0 : d / max;

  if (sat < PALE || d === 0) {
    return Math.min(GREYS - 1, Math.floor(max * GREYS));
  }

  let hue: number;
  if (max === R) hue = ((G - B) / d + 6) % 6;
  else if (max === G) hue = (B - R) / d + 2;
  else hue = (R - G) / d + 4;
  hue /= 6;

  const h = Math.min(HUES - 1, Math.floor(hue * HUES));
  const sB = sat < 0.45 ? 0 : 1;
  const vB = max < 0.5 ? 0 : 1;
  return GREYS + (h * SATS + sB) * VALS + vB;
}

function histogram(
  pixels: Uint8ClampedArray, w: number, h: number,
  x0f: number, x1f: number, y0f: number, y1f: number,
): { bins: number[]; light: number } {
  const bins = new Array<number>(BUCKETS).fill(0);
  const x0 = Math.floor(w * x0f), x1 = Math.ceil(w * x1f);
  const y0 = Math.floor(h * y0f), y1 = Math.ceil(h * y1f);
  let n = 0, lit = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      bins[bucketOf(r, g, b)] += 1;
      lit += (r + g + b) / 3;
      n++;
    }
  }
  for (let i = 0; i < BUCKETS; i++) bins[i] /= Math.max(1, n);
  return { bins, light: lit / Math.max(1, n) / 255 };
}

/**
 * The fingerprint of one picture.
 *
 * `pixels` is RGBA, as a canvas gives it. Two narrow bands down the middle
 * of the frame: the torso, and the hips and thighs. Narrow on purpose -
 * wide enough and it is measuring the room, and every picture taken in
 * that room then looks like every other.
 */
export function signatureOf(pixels: Uint8ClampedArray, w: number, h: number): Signature {
  const body = histogram(pixels, w, h, 0.34, 0.66, 0.24, 0.50);
  const lower = histogram(pixels, w, h, 0.34, 0.66, 0.50, 0.74);
  return { body: body.bins, lower: lower.bins, light: body.light };
}

/**
 * How far apart two pictures are, 0 (identical) to 1.
 *
 * Histogram intersection rather than a sum of squares: it answers "how
 * much of this picture's colour is also in that one", which is the
 * question being asked, and it does not blow up when one bucket happens to
 * hold half the pixels.
 *
 * The room is deliberately NOT part of this. Half of these photographs
 * were taken against the same grey backdrop, so anything that counted the
 * background made every one of them a match for every other.
 */
export function distance(a: Signature, b: Signature): number {
  let body = 0, lower = 0;
  for (let i = 0; i < BUCKETS; i++) {
    body += Math.min(a.body[i], b.body[i]);
    lower += Math.min(a.lower[i], b.lower[i]);
  }
  return 1 - (0.62 * body + 0.34 * lower + 0.04 * (1 - Math.abs(a.light - b.light)));
}

export type Group<T> = {
  members: T[];
  /** The member most like the rest of them - the one worth sending. */
  pick: T;
  signature: Signature;
};

function mean(sigs: Signature[]): Signature {
  const body = new Array<number>(BUCKETS).fill(0);
  const lower = new Array<number>(BUCKETS).fill(0);
  let light = 0;
  for (const s of sigs) {
    for (let i = 0; i < BUCKETS; i++) { body[i] += s.body[i]; lower[i] += s.lower[i]; }
    light += s.light;
  }
  const n = Math.max(1, sigs.length);
  for (let i = 0; i < BUCKETS; i++) { body[i] /= n; lower[i] /= n; }
  return { body, lower, light: light / n };
}

/**
 * Sort pictures into outfits.
 *
 * Nearest existing group wins if it is close enough, otherwise a new one
 * starts. Deliberately NOT k-means: the number of outfits is the answer,
 * not an input, and being asked how many outfits are in the folder before
 * it has been looked at is the question nobody can answer.
 *
 * Order matters and is used on purpose - a camera numbers its files in the
 * order they were taken, so neighbours in the list are usually the same
 * outfit. Walking in that order means a group is built from a run rather
 * than from scattered matches.
 */
export function groupBy<T>(
  items: T[],
  signatures: Signature[],
  apart = 0.34,
): Group<T>[] {
  const groups: { members: T[]; sigs: Signature[]; centre: Signature }[] = [];

  for (let i = 0; i < items.length; i++) {
    const sig = signatures[i];
    let best = -1;
    let bestGap = Infinity;
    for (let g = 0; g < groups.length; g++) {
      const gap = distance(sig, groups[g].centre);
      if (gap < bestGap) { bestGap = gap; best = g; }
    }

    if (best >= 0 && bestGap <= apart) {
      const g = groups[best];
      g.members.push(items[i]);
      g.sigs.push(sig);
      g.centre = mean(g.sigs);
    } else {
      groups.push({ members: [items[i]], sigs: [sig], centre: sig });
    }
  }

  return groups.map((g) => {
    let pick = g.members[0];
    let closest = Infinity;
    for (let i = 0; i < g.members.length; i++) {
      const gap = distance(g.sigs[i], g.centre);
      if (gap < closest) { closest = gap; pick = g.members[i]; }
    }
    return { members: g.members, pick, signature: g.centre };
  });
}

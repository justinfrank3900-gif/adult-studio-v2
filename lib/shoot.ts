'use client';

// lib/shoot.ts
//
// READING A SHOOT OFF THE DESKTOP.
//
// Every room that takes photographs needs the same five things done to
// them: unpack the zip, pull frames out of any clip, make a thumbnail,
// fingerprint it for sorting, and score it as a picture of a face. This
// was written inside the Cast room first, which was fine until the
// Wardrobe needed the identical thing - "in wardrobe section I need to
// upload the same zip and pull every outfit" - and copying two hundred
// lines into a second room is how two rooms start disagreeing about what
// a zip is.
//
// None of it touches a server. The zip is inflated, the frames seeked and
// the thumbnails drawn on his own machine, so a folder of photographs
// never crosses the wire to be looked at.

import { picturesInZip } from './unzip';
import { faceScore, groupBy, signatureOf, type Signature } from './sort';

/** The provider caps a request body at 4.5MB, and a phone photograph is
 *  bigger than that on its own. Scaled down before it is sent - a face at
 *  1280px is as much as the model uses anyway. */
const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.86;

/** Big enough to tell two outfits and two expressions apart at a glance,
 *  small enough that three hundred of them is a few megabytes. */
const THUMB_SIDE = 300;
const THUMB_QUALITY = 0.72;

/** Clips, not files. Six frames have to be seeked out of each one and
 *  that takes real seconds, so a folder with thirty videos in it would
 *  look like a hung tab rather than like work being done. */
const MOST_CLIPS = 3;
/** Pulled out of a zip. Set above a real folder rather than at a round
 *  number: the first set through this was 218 pictures off a phone, and a
 *  cap that quietly drops a third of somebody's photographs is worse than
 *  a slow page. */
export const MOST_IN_ZIP = 400;
/** Held at once, across everything picked. */
export const MOST_SHOWN = 300;

/* HOW FAR APART TWO OUTFITS HAVE TO LOOK.
 *
 * Not a guess: swept against a real folder of 218 photographs whose
 * contents were known. 0.26 split them into 47 groups - the same dress
 * twice over in places. 0.40 collapsed them into 16 and lost outfits
 * outright. 0.32 gave 29, which is what is actually in that folder.
 *
 * It errs towards splitting on purpose. A rail with one dress on it twice
 * is a nuisance; a rail missing a dress is a dress nobody knows is gone. */
export const SAME_OUTFIT = 0.32;

export type Shot = {
  thumb: string;
  /** What this picture is made of, for sorting it with its own kind. */
  sig: Signature;
  /** How good a picture of her face it is, 0 to 1. */
  face: number;
  /** The original, scaled up only when this one is the one being sent. */
  file?: Blob;
  /** A video frame, which never had a file behind it. */
  ready?: string;
  name: string;
};

async function draw(source: CanvasImageSource, w: number, h: number, side: number, quality: number): Promise<string> {
  return (await drawAnd(source, w, h, side, quality)).url;
}

/** The same, keeping the pixels. The fingerprint a picture is sorted by
 *  is made from the thumbnail that is being drawn anyway, so sorting two
 *  hundred photographs into outfits costs one extra read of a canvas. */
async function drawAnd(
  source: CanvasImageSource, w: number, h: number, side: number, quality: number,
): Promise<{ url: string; sig: Signature; face: number }> {
  const scale = Math.min(1, side / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser would not let the picture be read.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return {
    url: canvas.toDataURL('image/jpeg', quality),
    sig: signatureOf(pixels, canvas.width, canvas.height),
    face: faceScore(pixels, canvas.width, canvas.height),
  };
}

function loadPicture(blob: Blob): Promise<{ img: HTMLImageElement; free: () => void }> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve({ img: i, free: () => URL.revokeObjectURL(url) });
    i.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That picture could not be opened.')); };
    i.src = url;
  });
}

async function thumbOf(blob: Blob): Promise<{ url: string; sig: Signature; face: number }> {
  const { img, free } = await loadPicture(blob);
  try { return await drawAnd(img, img.naturalWidth, img.naturalHeight, THUMB_SIDE, THUMB_QUALITY); }
  finally { free(); }
}

/** The one being sent, at full working size. Done late and once, so
 *  choosing between three hundred pictures costs nothing. */
export async function fullOf(shot: Shot): Promise<string> {
  if (shot.ready) return shot.ready;
  if (!shot.file) throw new Error('That picture is no longer in hand. Pick the files again.');
  const { img, free } = await loadPicture(shot.file);
  try { return await draw(img, img.naturalWidth, img.naturalHeight, MAX_SIDE, JPEG_QUALITY); }
  finally { free(); }
}

async function framesFromVideo(file: File, howMany = 6): Promise<Shot[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('That video could not be opened in this browser. MP4 or WebM works.'));
    });

    const length = video.duration;
    if (!Number.isFinite(length) || length <= 0) {
      throw new Error('That video has no length this browser can read.');
    }

    const out: Shot[] = [];
    for (let i = 0; i < howMany; i++) {
      /* Spread across the middle rather than from zero: the first and last
       * second of a clip are nearly always a hand moving or a fade. */
      const at = length * (0.12 + (0.76 * i) / Math.max(1, howMany - 1));
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error('That video stopped part way through.'));
        video.currentTime = at;
      });
      const small = await drawAnd(video, video.videoWidth, video.videoHeight, THUMB_SIDE, THUMB_QUALITY);
      out.push({
        thumb: small.url,
        sig: small.sig,
        face: small.face,
        ready: await draw(video, video.videoWidth, video.videoHeight, MAX_SIDE, JPEG_QUALITY),
        name: `frame ${i + 1}`,
      });
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
    video.src = '';
  }
}

export type Reading = {
  shots: Shot[];
  /** What was found and what was left out, for the screen to say.  */
  notes: string[];
};

/**
 * Everything readable in a pile of files.
 *
 * Throws only when NOTHING could be read. One picture that will not open
 * inside a folder of two hundred is skipped and the rest carry on, which
 * is the difference between a bad photograph and a bad afternoon.
 */
export async function readShoot(
  files: File[],
  say: (what: string) => void,
): Promise<Reading> {
  const shots: Shot[] = [];
  const notes: string[] = [];
  let clips = 0;
  let loose = 0;

  for (const file of files) {
    if (shots.length >= MOST_SHOWN) break;
    if (file.size > 500 * 1024 * 1024) {
      throw new Error(`${file.name} is over 500MB. Trim it down - nothing that big is needed here.`);
    }

    const isZip = /\.zip$/i.test(file.name) || file.type === 'application/zip';
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
    const isPicture = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name);

    if (isZip) {
      say(file.name);
      const inside = await picturesInZip(file, MOST_IN_ZIP);
      let used = 0;
      for (const pic of inside.pictures) {
        if (shots.length >= MOST_SHOWN) break;
        try {
          const t = await thumbOf(pic.blob);
          shots.push({ thumb: t.url, sig: t.sig, face: t.face, file: pic.blob, name: pic.name });
          used++;
          /* The count moves while a big zip is read, because a progress
           * number that only appears at the end is not one. */
          if (used % 5 === 0) say(`${file.name} - ${used} pictures in`);
        } catch { /* one picture that will not open is not a bad zip */ }
      }
      notes.push(
        `${used} ${used === 1 ? 'picture' : 'pictures'} out of ${file.name}`
        + (inside.pictures.length > used ? `, ${inside.pictures.length - used} more left out to keep the page quick` : '')
        + '.'
        + (inside.skippedUnreadable.length
          ? ` ${inside.skippedUnreadable.length} in Apple's HEIC format ${inside.skippedUnreadable.length === 1 ? 'was' : 'were'} skipped - no browser can open one. On an iPhone: Settings, Camera, Formats, Most Compatible.`
          : ''),
      );
      continue;
    }

    if (isVideo) {
      if (clips >= MOST_CLIPS) continue;
      clips++;
      say(file.name);
      shots.push(...await framesFromVideo(file));
      continue;
    }

    if (!isPicture) continue;

    loose++;
    /* Named one at a time for a handful, counted for a folder - a flicker
     * of two hundred file names tells nobody anything. */
    say(files.length > 12 ? `${loose} pictures in` : file.name);
    try {
      const t = await thumbOf(file);
      shots.push({ thumb: t.url, sig: t.sig, face: t.face, file, name: file.name });
    } catch { /* one picture that will not open is not a bad folder */ }
  }

  if (!notes.length && loose > 12) notes.push(`${shots.length} pictures in.`);
  return { shots: shots.slice(0, MOST_SHOWN), notes };
}

export type Rack = {
  thumb: string;
  count: number;
  full: () => Promise<string>;
};

/** The shoot, sorted into outfits. Costs nothing: the fingerprints were
 *  made when the thumbnails were. */
export function racksOf(shots: Shot[]): Rack[] {
  if (shots.length < 2) return [];
  return groupBy(shots, shots.map((x) => x.sig), SAME_OUTFIT).map((g) => ({
    thumb: g.pick.thumb,
    count: g.members.length,
    full: () => fullOf(g.pick),
  }));
}

/**
 * The best pictures of her face, ONE PER OUTFIT.
 *
 * Spread across groups on purpose. The three sharpest frames in a folder
 * are usually three frames of the same minute of the same shoot, which
 * registers her from one angle three times - and that shows the moment
 * she turns her head in a clip. One per outfit is three different days,
 * three different lights, one face.
 */
export function facesOf(shots: Shot[], howMany = 3): { thumb: string; full: () => Promise<string> }[] {
  if (!shots.length) return [];
  const groups = shots.length < 2
    ? [{ members: shots, pick: shots[0], signature: shots[0].sig }]
    : groupBy(shots, shots.map((x) => x.sig), SAME_OUTFIT);

  const best = groups
    .map((g) => [...g.members].sort((a, b) => b.face - a.face)[0])
    .filter(Boolean)
    .sort((a, b) => b.face - a.face);

  /* Where there is only one outfit in the folder, fall back to the best
   * frames of it rather than handing back one. */
  const spread = best.length >= howMany
    ? best.slice(0, howMany)
    : [...shots].sort((a, b) => b.face - a.face).slice(0, howMany);

  return spread.map((shot) => ({ thumb: shot.thumb, full: () => fullOf(shot) }));
}

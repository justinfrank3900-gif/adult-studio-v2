'use client';

// components/FromMine.tsx
//
// BUILDING HER FROM PICTURES I ALREADY HAVE.
//
// "IN BUILDING AN AVATAR NEED TO BE ABLE TO UPLOAD MY OWN PICS OR VIDEO TO
// CLONE FROM AS WELL." / "can i clone a avatar with a zip file of a bunch
// of images?" / "i am going to upload 100 pics to clone a girl"
//
// The provider will not take an uploaded photograph as an input to edit -
// that is their written policy, not a gap - with exactly one door: a
// reference model that looks at an outside picture and DRAWS A NEW ONE of
// that person. The output is theirs, which is the whole point: once it
// exists, it can be edited, it can be registered as a character, and the
// whole rest of the studio works on her normally.
//
// So this is not a copy of his picture. It is the studio meeting her.
//
// A HUNDRED PICTURES IS A CHOICE, NOT A TRAINING SET.
//
// Worth being plain about, because every other tool in this space takes a
// folder and fine-tunes on it. This one does not: the studio draws from
// the ONE picture that gets picked. What a hundred buys is the ability to
// find the best one - straight on, well lit, sharp - which is a real thing
// to buy, and much easier side by side than one file dialog at a time.
//
// WHICH IS WHY THE GRID IS THUMBNAILS.
//
// A hundred pictures held at full size is a few hundred megabytes in a tab
// and a page that stops scrolling. Each one is kept as its own small
// thumbnail with the original file behind it, and only the picked one is
// scaled up and sent. Choosing costs nothing; sending costs one picture.

import { useRef, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn } from './kit';
import { Area, Grid, Row, Says, Tile, Working } from './parts';
import { picturesInZip } from '@/lib/unzip';

/** The provider caps a request body at 4.5MB, and a phone photograph is
 *  bigger than that on its own. Scaled down before it is sent - a face at
 *  1280px is as much as the model uses anyway. */
const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.86;

/** Big enough to tell two outfits and two expressions apart at a glance,
 *  small enough that a hundred of them is a few megabytes. */
const THUMB_SIDE = 300;
const THUMB_QUALITY = 0.72;

const MOST_FILES = 8;
/** Pulled out of a zip. A folder bigger than this is a photo library, and
 *  nobody is choosing a face out of four hundred. */
const MOST_IN_ZIP = 150;
/** Shown in the grid at once, across everything picked. */
const MOST_SHOWN = 120;

type Shot = {
  thumb: string;
  /** The original, scaled up only when this one is the one being sent. */
  file?: Blob;
  /** A video frame, which never had a file behind it. */
  ready?: string;
  name: string;
};

async function draw(source: CanvasImageSource, w: number, h: number, side: number, quality: number): Promise<string> {
  const scale = Math.min(1, side / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser would not let the picture be read.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
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

async function thumbOf(blob: Blob): Promise<string> {
  const { img, free } = await loadPicture(blob);
  try { return await draw(img, img.naturalWidth, img.naturalHeight, THUMB_SIDE, THUMB_QUALITY); }
  finally { free(); }
}

async function fullOf(shot: Shot): Promise<string> {
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
      out.push({
        thumb: await draw(video, video.videoWidth, video.videoHeight, THUMB_SIDE, THUMB_QUALITY),
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

export default function FromMine({
  name, busy, onMade,
}: {
  /** What she is called, for the label on what comes back. */
  name: string;
  busy: boolean;
  /** Hands back the chosen picture as a data url and the words to draw with. */
  onMade: (referenceImage: string, prompt: string) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [chosen, setChosen] = useState<number>(0);
  const [words, setWords] = useState('');
  const [reading, setReading] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);
  const [made, setMade] = useState(0);
  const [sending, setSending] = useState(false);

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSays(null); setFound(null); setShots([]); setMade(0);
    const got: Shot[] = [];
    const notes: string[] = [];
    try {
      for (const file of Array.from(files).slice(0, MOST_FILES)) {
        if (got.length >= MOST_SHOWN) break;
        if (file.size > 500 * 1024 * 1024) {
          throw new Error(`${file.name} is over 500MB. Trim it down - nothing that big is needed here.`);
        }
        setReading(file.name);

        /* A ZIP IS A FOLDER THAT TRAVELLED.
         *
         * Opened here rather than sent anywhere: the browser can inflate on
         * its own, so a folder of holiday photographs never crosses the
         * wire, and his pictures never touch a server that has no use for
         * them. */
        if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
          const inside = await picturesInZip(file, MOST_IN_ZIP);
          let used = 0;
          for (const pic of inside.pictures) {
            if (got.length >= MOST_SHOWN) break;
            try {
              got.push({ thumb: await thumbOf(pic.blob), file: pic.blob, name: pic.name });
              used++;
              /* The count moves while a big zip is being read, because a
               * progress number that only appears at the end is not a
               * progress number. */
              if (used % 5 === 0) setReading(`${file.name} - ${used} pictures in`);
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

        if (file.type.startsWith('video/')) {
          got.push(...await framesFromVideo(file));
          continue;
        }

        got.push({ thumb: await thumbOf(file), file, name: file.name });
      }

      if (got.length === 0) throw new Error('Nothing could be read out of those files.');
      setShots(got.slice(0, MOST_SHOWN));
      setChosen(0);
      if (notes.length) setFound(notes.join(' '));
    } catch (e) {
      /* Whatever did read is kept rather than thrown away with the one that
       * failed - fifty good photographs and one broken one is fifty
       * photographs, not a blank screen. */
      if (got.length) { setShots(got.slice(0, MOST_SHOWN)); setChosen(0); }
      setSays(e instanceof Error ? e.message : 'Those files could not be read.');
    } finally {
      setReading(null);
      if (input.current) input.current.value = '';
    }
  };

  const go = async () => {
    const shot = shots[chosen];
    if (!shot) { setSays('Pick a picture first.'); return; }
    setSays(null); setSending(true);
    try {
      await onMade(await fullOf(shot), words.trim());
      /* THE PICTURES STAY ON SCREEN AFTER ONE IS USED.
       *
       * Registering her with the provider takes up to three of her stills,
       * and three stills means pressing this three times. Clearing the grid
       * after the first one made that a re-upload every time. */
      setMade((n) => n + 1);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'She could not be made from that.');
    } finally { setSending(false); }
  };

  const working = busy || sending;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*,.zip,application/zip"
        multiple
        onChange={(e) => void pick(e.target.files)}
        style={{ display: 'none' }}
      />

      <Row>
        <Btn onClick={() => input.current?.click()} disabled={working || reading !== null}>
          {reading !== null ? 'Reading them' : shots.length ? 'Use different files' : 'Upload stills, a zip of them, or a video'}
        </Btn>
      </Row>

      <span style={{ fontSize: 13, color: T.textDim, lineHeight: 1.6, maxWidth: '62ch' }}>
        Pick as many pictures as you like at once, drop in a zip of a whole
        folder, or use a clip that six frames are pulled out of here on this
        machine. What comes back is a NEW picture of that person drawn by the
        studio, not a copy of yours - the provider does not accept an
        uploaded photograph as a picture it can edit, so this is the one way
        in. Everything after it works on her normally.
      </span>

      <span style={{ fontSize: 13, color: T.textDim, lineHeight: 1.6, maxWidth: '62ch' }}>
        A hundred pictures do not make a closer likeness than one does - the
        studio draws from the ONE you pick, not from the pile. What the pile
        buys you is the choice. Pick the sharpest, most straight-on, best lit
        picture of her face, make her from it, then make two more from
        different angles and register her: three is what holds her face
        through video.
      </span>

      {reading !== null ? <Working>Reading {reading}.</Working> : null}

      {shots.length > 0 ? (
        <>
          <div style={{
            fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', color: T.textDim,
            textTransform: 'uppercase',
          }}>
            {shots.length === 1
              ? 'Your picture'
              : `Pick the one that looks most like her - ${shots.length} to choose from`}
          </div>
          <Grid min={118}>
            {shots.map((s, i) => (
              <Tile
                key={i}
                title={s.name.length > 18 ? `${s.name.slice(0, 16)}...` : s.name}
                src={s.thumb}
                picked={i === chosen}
                onClick={() => setChosen(i)}
              />
            ))}
          </Grid>

          <Area
            label="What the first picture of her should be"
            value={words}
            onChange={setWords}
            rows={3}
            placeholder="standing square to the camera on a plain backdrop, even light, looking straight at the lens"
            hint="This describes the SHOT, not the face - the face comes from the picture above. Leave it blank for a plain studio portrait."
          />

          <Row>
            <Btn kind="gold" onClick={go} disabled={working}>
              {working ? 'Making her' : made ? 'Make another from this one' : `Make ${name || 'her'} from this`}
            </Btn>
          </Row>

          {made > 0 ? (
            <span style={{ fontSize: 13, color: T.gold, lineHeight: 1.6, maxWidth: '62ch' }}>
              {made} made from your pictures. Pick a different one above and make
              another - three of hers is what registering her takes, and
              registering is the thing that holds her face through video.
            </span>
          ) : null}
        </>
      ) : null}

      <Says text={found} tone="ok" />
      <Says text={says} />
    </div>
  );
}

/** The shot, when he has not said. Deliberately a plain portrait: the first
 *  picture is the one everything else anchors on, and anything stylish in
 *  it is a style every later picture inherits. */
export const PLAIN_PORTRAIT =
  'Standing square to the camera on a plain mid-grey studio backdrop, even soft light, head and shoulders to waist in frame, looking straight at the lens, natural expression.';

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

import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { T } from '@/lib/tokens';
import { Btn } from './kit';
import { Area, Grid, Row, Says, Tile, Working } from './parts';
import { picturesInZip } from '@/lib/unzip';
import { filesDropped } from '@/lib/dropped';
import { faceScore, groupBy, signatureOf, type Signature } from '@/lib/sort';
import Separate, { type Face, type Rack } from './Separate';

/** The provider caps a request body at 4.5MB, and a phone photograph is
 *  bigger than that on its own. Scaled down before it is sent - a face at
 *  1280px is as much as the model uses anyway. */
const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.86;

/** Big enough to tell two outfits and two expressions apart at a glance,
 *  small enough that a hundred of them is a few megabytes. */
const THUMB_SIDE = 300;
const THUMB_QUALITY = 0.72;

/** Clips, not files. Six frames have to be seeked out of each one and
 *  that takes real seconds, so a folder with thirty videos in it would
 *  look like a hung tab rather than like work being done. */
const MOST_CLIPS = 3;
/** Pulled out of a zip. Set above a real folder rather than at a round
 *  number: the first set that came through this was 218 pictures off a
 *  phone, and a cap that quietly drops a third of somebody's photographs
 *  is worse than a slow page. */
const MOST_IN_ZIP = 400;
/** Shown in the grid at once, across everything picked. At 300px a piece
 *  this is a few megabytes, which is the whole reason they are
 *  thumbnails. */
const MOST_SHOWN = 300;

/* HOW FAR APART TWO OUTFITS HAVE TO LOOK.
 *
 * Not a guess: swept against a real folder of 218 photographs whose
 * contents were known. 0.26 split them into 47 groups - the same dress
 * twice over in places. 0.40 collapsed them into 16 and lost outfits
 * outright. 0.32 gave 29, which is what is actually in that folder.
 *
 * It errs towards splitting on purpose. A rail with one dress on it twice
 * is a nuisance; a rail missing a dress is a dress nobody knows is gone. */
const SAME_OUTFIT = 0.32;

type Shot = {
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

/** The same, keeping the pixels. The fingerprint a picture is sorted by is
 *  made from the thumbnail that is being drawn anyway, so sorting two
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

export default function FromMine({
  name, busy, onMade, onRail, onEverything,
}: {
  /** What she is called, for the label on what comes back. */
  name: string;
  busy: boolean;
  /** Hands back the chosen picture as a data url and the words to draw with. */
  onMade: (referenceImage: string, prompt: string) => Promise<void>;
  /** Told how many outfits went up, so the room can reload its rail. */
  onRail?: (added: number) => void;
  /** Draw her from several pictures at once, keep them all and register
   *  her. Returns how many pictures of her were made. */
  onEverything?: (shots: { image: string; direction: string }[]) => Promise<number>;
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
  const [over, setOver] = useState(false);

  const pick = async (chosenFiles: File[] | FileList | null) => {
    const files = chosenFiles ? Array.from(chosenFiles) : [];
    if (files.length === 0) return;
    setSays(null); setFound(null); setShots([]); setMade(0);
    const got: Shot[] = [];
    const notes: string[] = [];
    /* Videos are counted on their own. Six frames have to be seeked out of
     * each one, which takes real seconds, so three dropped clips is a
     * reasonable afternoon and thirty is a hung tab. Pictures are cheap by
     * comparison and are capped by the grid instead. */
    let clips = 0;
    let loose = 0;
    try {
      for (const file of files) {
        if (got.length >= MOST_SHOWN) break;
        if (file.size > 500 * 1024 * 1024) {
          throw new Error(`${file.name} is over 500MB. Trim it down - nothing that big is needed here.`);
        }

        const isZip = /\.zip$/i.test(file.name) || file.type === 'application/zip';
        const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
        const isPicture = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name);

        /* A ZIP IS A FOLDER THAT TRAVELLED.
         *
         * Opened here rather than sent anywhere: the browser can inflate on
         * its own, so a folder of holiday photographs never crosses the
         * wire, and his pictures never touch a server that has no use for
         * them. */
        if (isZip) {
          setReading(file.name);
          const inside = await picturesInZip(file, MOST_IN_ZIP);
          let used = 0;
          for (const pic of inside.pictures) {
            if (got.length >= MOST_SHOWN) break;
            try {
              const t = await thumbOf(pic.blob);
              got.push({ thumb: t.url, sig: t.sig, face: t.face, file: pic.blob, name: pic.name });
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

        if (isVideo) {
          if (clips >= MOST_CLIPS) continue;
          clips++;
          setReading(file.name);
          got.push(...await framesFromVideo(file));
          continue;
        }

        if (!isPicture) continue;

        loose++;
        /* Named one at a time for a handful, counted for a folder - a
         * flicker of two hundred file names tells nobody anything. */
        setReading(files.length > 12 ? `${loose} pictures in` : file.name);
        try { const t = await thumbOf(file); got.push({ thumb: t.url, sig: t.sig, face: t.face, file, name: file.name }); }
        catch { /* one picture that will not open is not a bad folder */ }
      }

      if (got.length === 0) {
        throw new Error('There were no pictures, clips or zips in that. Photographs (jpg, png, webp), an MP4, or a zip of them.');
      }
      setShots(got.slice(0, MOST_SHOWN));
      setChosen(0);
      if (!notes.length && loose > 12) notes.push(`${got.length} pictures in.`);
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

  /* ------------------------------------------------------------ dragging
   *
   * dragover HAS to be cancelled or the browser refuses the drop and then
   * navigates the whole page to the file instead, losing everything on
   * screen. The counter is there because dragging across a child element
   * fires leave on the parent - without it the highlight flickers off the
   * moment the pointer crosses the text inside the zone. */
  const depth = useRef(0);

  /* MISSING THE ZONE MUST NOT COST HIM THE PAGE.
   *
   * A file dropped anywhere a browser is not expecting one makes it
   * NAVIGATE to that file, which throws away the screen, the pictures
   * already read and anything typed. Cancelled across the window - but
   * only for drags that actually carry files, so text can still be
   * dragged into the boxes. */
  useEffect(() => {
    const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');
    const stop = (e: DragEvent) => { if (carriesFiles(e)) e.preventDefault(); };
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    if (busy || sending || reading !== null) return;
    setReading('reading what you dropped');
    try {
      const files = await filesDropped(e.dataTransfer, MOST_IN_ZIP);
      if (!files.length) {
        setReading(null);
        setSays('Nothing came through with that drop. Try the button instead.');
        return;
      }
      await pick(files);
    } catch {
      setReading(null);
      setSays('That could not be read off the drop. Try the button instead.');
    }
  };

  /* The shoot, sorted into outfits. Costs nothing and is recomputed only
   * when the pictures change, which is why it can sit in the render. */
  const racks: Rack[] = useMemo(() => {
    if (shots.length < 2) return [];
    const groups = groupBy(shots, shots.map((x) => x.sig), SAME_OUTFIT);
    return groups.map((g) => ({
      thumb: g.pick.thumb,
      count: g.members.length,
      full: () => fullOf(g.pick),
    }));
  }, [shots]);

  /* THE THREE BEST PICTURES OF HER FACE, FROM THREE DIFFERENT OUTFITS.
   *
   * Spread across groups on purpose. The three sharpest frames in a
   * folder are usually three frames of the same minute of the same
   * shoot, which registers her from one angle three times - and that
   * shows up the moment she turns her head in a clip. One per outfit is
   * three different days, three different lights, one face. */
  const faces: Face[] = useMemo(() => {
    if (!shots.length) return [];
    const groups = shots.length < 2
      ? [{ members: shots, pick: shots[0], signature: shots[0].sig }]
      : groupBy(shots, shots.map((x) => x.sig), SAME_OUTFIT);

    const best = groups
      .map((g) => [...g.members].sort((a, b) => b.face - a.face)[0])
      .filter(Boolean)
      .sort((a, b) => b.face - a.face);

    /* Where there is only one outfit in the folder, fall back to the
     * three best frames of it rather than handing back one. */
    const spread = best.length >= 3
      ? best.slice(0, 3)
      : [...shots].sort((a, b) => b.face - a.face).slice(0, 3);

    return spread.map((shot) => ({ thumb: shot.thumb, full: () => fullOf(shot) }));
  }, [shots]);

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

      {/* THE DROP ZONE IS ALSO THE BUTTON.
        *
        * Two separate controls for the same job - a button here, a dashed
        * rectangle there - is how somebody ends up dragging a folder onto
        * the button and watching the page navigate away. One target, both
        * ways in, and clicking anywhere on it opens the file dialog. */}
      <div
        onDragEnter={(e) => { e.preventDefault(); depth.current += 1; setOver(true); }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDragLeave={(e) => { e.preventDefault(); depth.current -= 1; if (depth.current <= 0) { depth.current = 0; setOver(false); } }}
        onDrop={onDrop}
        onClick={() => { if (!working && reading === null) input.current?.click(); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
        style={{
          border: `2px dashed ${over ? T.gold : T.line}`,
          borderRadius: 14,
          background: over ? 'rgba(212,175,85,0.07)' : T.raised,
          padding: '26px 22px',
          textAlign: 'center',
          cursor: working || reading !== null ? 'default' : 'pointer',
          transition: 'border-color 120ms ease, background 120ms ease',
        }}
      >
        <div style={{
          fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em',
          color: over ? T.gold : T.text, marginBottom: 8,
        }}>
          {over
            ? 'Let go'
            : reading !== null
              ? 'Reading them'
              : shots.length
                ? 'Drop different ones, or click to pick'
                : 'Drag her pictures in here'}
        </div>
        <div style={{ fontSize: 13.5, color: T.textDim, lineHeight: 1.6, maxWidth: '54ch', margin: '0 auto' }}>
          A folder, a zip, as many photographs as you like, or a clip - straight
          off your desktop. Or click to pick them the usual way.
        </div>
      </div>

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

          {onRail && (racks.length > 1 || faces.length > 1) ? (
            <Separate
              name={name}
              racks={racks}
              faces={faces}
              onHer={onEverything}
              onDone={onRail}
            />
          ) : null}

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

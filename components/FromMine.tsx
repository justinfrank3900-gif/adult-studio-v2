'use client';

// components/FromMine.tsx
//
// BUILDING HER FROM PICTURES I ALREADY HAVE.
//
// "IN BUILDING AN AVATAR NEED TO BE ABLE TO UPLOAD MY OWN PICS OR VIDEO TO
// CLONE FROM AS WELL."
//
// The provider will not take an uploaded photograph as an input - that is
// their written policy, not a gap - with exactly one door: a reference
// model that looks at an outside picture and DRAWS A NEW ONE of that
// person. The output is theirs, which is the whole point: once it exists,
// it can be edited, it can be registered as a character, and the whole rest
// of the studio works on her normally.
//
// So this is not a copy of his picture. It is the studio meeting her.
//
// A VIDEO IS JUST A LOT OF PICTURES, AND THE BROWSER CAN READ IT.
//
// Pulling frames out happens here rather than on a server because a server
// would need ffmpeg and a 200MB upload, while a <video> and a <canvas> do
// it in a second on the machine the file is already sitting on. Six frames
// spread across the clip, and he picks the one that looks most like her -
// which is a judgement nobody should be automating anyway.

import { useRef, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn } from './kit';
import { Area, Grid, Row, Says, Tile, Working } from './parts';

/** The provider caps a request body at 4.5MB, and a phone photograph is
 *  bigger than that on its own. Scaled down before it is sent - a face at
 *  1280px is as much as the model uses anyway. */
const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.86;

async function shrink(source: CanvasImageSource, w: number, h: number): Promise<string> {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser would not let the picture be read.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

async function framesFromPicture(file: File): Promise<string[]> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That picture could not be opened.'));
      i.src = url;
    });
    return [await shrink(img, img.naturalWidth, img.naturalHeight)];
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function framesFromVideo(file: File, howMany = 6): Promise<string[]> {
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

    const out: string[] = [];
    for (let i = 0; i < howMany; i++) {
      /* Spread across the middle rather than from zero: the first and last
       * second of a clip are nearly always a hand moving or a fade. */
      const at = length * (0.12 + (0.76 * i) / Math.max(1, howMany - 1));
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error('That video stopped part way through.'));
        video.currentTime = at;
      });
      out.push(await shrink(video, video.videoWidth, video.videoHeight));
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
    video.src = '';
  }
}

/* Several files at once, because "upload stills" is plural and always was.
 * Capped so that dropping a folder of four hundred holiday photographs in
 * here fills a grid he can actually look at rather than the whole page. */
const MOST_FILES = 8;
const MOST_FRAMES = 12;

export default function FromMine({
  name, busy, onMade,
}: {
  /** What she is called, for the label on what comes back. */
  name: string;
  busy: boolean;
  /** Hands back the chosen frame as a data url and the words to draw with. */
  onMade: (referenceImage: string, prompt: string) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [chosen, setChosen] = useState<number>(0);
  const [words, setWords] = useState('');
  const [reading, setReading] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);
  const [made, setMade] = useState(0);

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSays(null); setFrames([]); setMade(0);
    const got: string[] = [];
    try {
      for (const file of Array.from(files).slice(0, MOST_FILES)) {
        if (file.size > 200 * 1024 * 1024) {
          throw new Error(`${file.name} is over 200MB. Trim the clip, or use a picture instead.`);
        }
        setReading(file.name);
        const out = file.type.startsWith('video/')
          ? await framesFromVideo(file)
          : await framesFromPicture(file);
        got.push(...out);
        if (got.length >= MOST_FRAMES) break;
      }
      if (got.length === 0) throw new Error('Nothing could be read out of those files.');
      setFrames(got.slice(0, MOST_FRAMES));
      setChosen(0);
    } catch (e) {
      /* Whatever did read is kept rather than thrown away with the one that
       * failed - five good photographs and one broken one is five
       * photographs, not a blank screen. */
      if (got.length) { setFrames(got.slice(0, MOST_FRAMES)); setChosen(0); }
      setSays(e instanceof Error ? e.message : 'Those files could not be read.');
    } finally {
      setReading(null);
      if (input.current) input.current.value = '';
    }
  };

  const go = async () => {
    if (!frames[chosen]) { setSays('Pick a picture first.'); return; }
    setSays(null);
    try {
      await onMade(frames[chosen], words.trim());
      /* THE PICTURES STAY ON SCREEN AFTER ONE IS USED.
       *
       * Registering her with the provider takes up to three of her stills,
       * and three stills means pressing this three times. Clearing the
       * grid after the first one made that a re-upload every time. */
      setMade((n) => n + 1);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'She could not be made from that.');
    }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={(e) => void pick(e.target.files)}
        style={{ display: 'none' }}
      />

      <Row>
        <Btn onClick={() => input.current?.click()} disabled={busy || reading !== null}>
          {reading !== null ? 'Reading them' : frames.length ? 'Use different files' : 'Upload stills or a video'}
        </Btn>
      </Row>

      <span style={{ fontSize: 13, color: T.textDim, lineHeight: 1.6, maxWidth: '62ch' }}>
        Pick as many pictures as you like at once, or a clip that six frames
        are pulled out of here on this machine. What comes back is a NEW
        picture of that person drawn by the studio, not a copy of yours - the
        provider does not accept an uploaded photograph as a picture it can
        edit, so this is the one way in. Everything after it works on her
        normally.
      </span>

      {reading !== null ? <Working>Reading {reading}.</Working> : null}

      {frames.length > 0 ? (
        <>
          <div style={{
            fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', color: T.textDim,
            textTransform: 'uppercase',
          }}>
            {frames.length === 1 ? 'Your picture' : 'Pick the one that looks most like her'}
          </div>
          <Grid min={140}>
            {frames.map((f, i) => (
              <Tile
                key={i}
                title={frames.length === 1 ? 'Yours' : `${i + 1}`}
                src={f}
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
            <Btn kind="gold" onClick={go} disabled={busy}>
              {busy ? 'Making her' : made ? 'Make another from this one' : `Make ${name || 'her'} from this`}
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

      <Says text={says} />
    </div>
  );
}

/** The shot, when he has not said. Deliberately a plain portrait: the first
 *  picture is the one everything else anchors on, and anything stylish in
 *  it is a style every later picture inherits. */
export const PLAIN_PORTRAIT =
  'Standing square to the camera on a plain mid-grey studio backdrop, even soft light, head and shoulders to waist in frame, looking straight at the lens, natural expression.';

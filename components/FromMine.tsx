'use client';

// components/FromMine.tsx
//
// BUILDING HER FROM PICTURES I ALREADY HAVE.
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
// find the best one, which is a real thing to buy and much easier side by
// side than one file dialog at a time.
//
// The reading, the sorting and the face scoring all live in lib/shoot,
// because the Wardrobe needs the identical thing - "in wardrobe section I
// need to upload the same zip and pull every outfit" - and two rooms
// copying two hundred lines is how two rooms start disagreeing about what
// a zip is.

import { useMemo, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn } from './kit';
import { Area, Grid, Row, Says, Tile, Working } from './parts';
import Dropper from './Dropper';
import Separate from './Separate';
import { facesOf, fullOf, racksOf, readShoot, type Shot } from '@/lib/shoot';

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
  const [shots, setShots] = useState<Shot[]>([]);
  const [chosen, setChosen] = useState<number>(0);
  const [words, setWords] = useState('');
  const [reading, setReading] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);
  const [made, setMade] = useState(0);
  const [sending, setSending] = useState(false);

  const take = async (files: File[]) => {
    setSays(null); setFound(null); setShots([]); setMade(0);
    setReading('reading them');
    try {
      const { shots: got, notes } = await readShoot(files, setReading);
      if (!got.length) {
        throw new Error('There were no pictures, clips or zips in that. Photographs (jpg, png, webp), an MP4, or a zip of them.');
      }
      setShots(got);
      setChosen(0);
      if (notes.length) setFound(notes.join(' '));
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'Those files could not be read.');
    } finally {
      setReading(null);
    }
  };

  const racks = useMemo(() => racksOf(shots), [shots]);
  const faces = useMemo(() => facesOf(shots), [shots]);

  const go = async () => {
    const shot = shots[chosen];
    if (!shot) { setSays('Pick a picture first.'); return; }
    setSays(null); setSending(true);
    try {
      await onMade(await fullOf(shot), words.trim());
      /* THE PICTURES STAY ON SCREEN AFTER ONE IS USED.
       *
       * Registering her takes up to three of her stills, and three stills
       * means pressing this three times. Clearing the grid after the
       * first one made that a re-upload every time. */
      setMade((n) => n + 1);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'She could not be made from that.');
    } finally { setSending(false); }
  };

  const working = busy || sending;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Dropper
        onFiles={take}
        busy={working || reading !== null}
        idle="Drag her pictures in here"
        full={shots.length ? 'Drop different ones, or click to pick' : undefined}
        note="A folder, a zip, as many photographs as you like, or a clip - straight off your desktop. Or click to pick them the usual way."
      />

      <span style={{ fontSize: 13, color: T.textDim, lineHeight: 1.6, maxWidth: '62ch' }}>
        What comes back is a NEW picture of that person drawn by the studio,
        not a copy of yours - the provider does not accept an uploaded
        photograph as a picture it can edit, so this is the one way in.
        Everything after it works on her normally.
      </span>

      <span style={{ fontSize: 13, color: T.textDim, lineHeight: 1.6, maxWidth: '62ch' }}>
        A hundred pictures do not make a closer likeness than one does - the
        studio draws from the ONE you pick, not from the pile. What the pile
        buys you is the choice.
      </span>

      {reading !== null ? <Working>Reading {reading}.</Working> : null}

      {shots.length > 0 ? (
        <>
          {onRail && (racks.length > 1 || faces.length > 1) ? (
            <Separate
              name={name}
              racks={racks}
              faces={faces}
              onHer={onEverything}
              onDone={onRail}
            />
          ) : null}

          <div style={{
            fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', color: T.textDim,
            textTransform: 'uppercase', marginTop: 4,
          }}>
            {shots.length === 1
              ? 'Your picture'
              : `Or pick one yourself - ${shots.length} to choose from`}
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

'use client';

// components/Separate.tsx
//
// ONE ZIP IN, A PERFORMER AND A WARDROBE OUT.
//
// "I want one zip upload and it separates it."
//
// Before this there were two presses and a judgement in between: pick a
// face out of two hundred thumbnails, press one button, then press
// another for the clothes. The judgement is the part a machine is better
// at - sharpness is not something anybody eyeballs correctly at thumbnail
// size - and the two presses were only ever two because the code was
// written in that order.
//
// So: one press. The shoot is already sorted by the time this renders.
// This takes the three best pictures of her face, makes her from them,
// registers her with the provider, and then turns every outfit group into
// a line on the rail with a picture beside it.
//
// EVERYTHING IT SPENDS IS ON THE BUTTON BEFORE IT IS PRESSED.
//
// And it stops where it got to: whatever has already been drawn has
// already been paid for, so stopping keeps it rather than throwing it
// away.

import { useRef, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn } from './kit';
import { Row, Says, Working } from './parts';
import { addOutfits, token } from '@/lib/data';

/** Their price for one drawing. Kept as a number so the sentence on the
 *  button and the sum behind it cannot drift apart. */
const EACH = 0.12;

/** How many outfits are read at once. Each is thirty to sixty seconds at
 *  their end, so this is four minutes against twenty - but a browser
 *  firing thirty at once is how an account gets rate limited mid-build. */
const AT_ONCE = 3;

/**
 * Three angles, so she is registered from three different views rather
 * than three copies of one.
 *
 * A character built from one angle three times holds that angle and
 * nothing else, which shows up the first time she turns her head in a
 * clip. Each of these goes with the reference picture as written
 * direction, which is what makes the second drawing obey it.
 */
const ANGLES = [
  'Standing square to the camera on a plain mid-grey studio backdrop, even soft light, head and shoulders to waist in frame, looking straight at the lens, natural expression.',
  'On a plain mid-grey studio backdrop, even soft light, turned about forty degrees off centre so one cheekbone catches the light, looking at the lens.',
  'On a plain mid-grey studio backdrop, even soft light, framed from the waist up, arms visible, looking at the lens.',
];

export type Rack = {
  thumb: string;
  count: number;
  full: () => Promise<string>;
};

export type Face = {
  thumb: string;
  full: () => Promise<string>;
};

export default function Separate({ racks, faces, onHer, onDone, name }: {
  racks: Rack[];
  faces: Face[];
  /** Draw her from these, keep them, register her. Returns how many
   *  pictures of her were made. Left off where there is nothing to hang
   *  them on yet. */
  onHer?: (shots: { image: string; direction: string }[]) => Promise<number>;
  onDone: (outfits: number) => void;
  name: string;
}) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [spent, setSpent] = useState(0);
  const [says, setSays] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [step, setStep] = useState('');
  /* A ref, not state: the loop below closes over its own copy of anything
   * in state, so a Stop wired to state does nothing until the run has
   * already finished on its own. */
  const stop = useRef(false);
  /* WHAT HAS ALREADY BEEN PAID FOR.
   *
   * Every picture read is money already spent. If the naming falls over
   * after them - and their screening does drop out for seconds at a time
   * - throwing the descriptions away would mean paying for all of them
   * again to get back to the same place. They are held here, and the
   * button that appears afterwards costs nothing. */
  const paidFor = useRef<{ description: string; swatch: string | null }[]>([]);
  const [owed, setOwed] = useState(0);

  const ask = async (payload: Record<string, unknown>) => {
    const jwt = await token();
    const res = await fetch('/api/wardrobe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify(payload),
    });
    const said = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!res.ok) throw new Error((said?.error as string) || `The studio refused that (${res.status}).`);
    return said || {};
  };

  const herShots = onHer ? faces.slice(0, ANGLES.length) : [];
  /* Each picture of her is two drawings: the reference read, and the
   * redraw that obeys the angle. Each outfit is one. */
  const cost = herShots.length * 2 * EACH + racks.length * EACH;

  /** Name what has been read and put it on the rail. Separate from the
   *  reading so it can be pressed again for nothing when their screening
   *  is having a moment. */
  const hangThem = async (read: { description: string; swatch: string | null }[]): Promise<number> => {
    setStep('Naming them');
    const said = await ask({ doing: 'name', descriptions: read.map((r) => r.description) });
    const outfits = (said.outfits as { label: string; words: string }[] | undefined) || [];
    if (!outfits.length) throw new Error('The outfits came back empty. Press Name them again.');

    setStep('Putting them up');
    const hung = await addOutfits(outfits.map((o, i) => ({
      label: o.label || `Outfit ${i + 1}`,
      words: o.words,
      swatch: read[i]?.swatch ?? null,
    })));

    const rough = Number(said.fallbacks || 0);
    if (rough) {
      setSays(
        `${rough} of them came back without a name, so they are on the rail as "Needs a name" with the provider's own `
        + 'description for words and the right picture beside them. Tidy those by hand - nothing is missing.',
      );
    }
    paidFor.current = [];
    setOwed(0);
    return hung;
  };

  const nameAgain = async () => {
    setRunning(true); setSays(null); setOk(null);
    try {
      const hung = await hangThem(paidFor.current);
      setOk(`${hung} ${hung === 1 ? 'outfit is' : 'outfits are'} on the rail. Nothing extra was spent.`);
      onDone(hung);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'They still could not be named.');
    } finally { setRunning(false); setStep(''); }
  };

  const run = async () => {
    stop.current = false;
    setRunning(true); setSays(null); setOk(null); setDone(0); setSpent(0);
    let made = 0;
    let trouble: string | null = null;

    try {
      /* ------------------------------------------------------------ her */
      if (onHer && herShots.length) {
        setStep(`Making ${name || 'her'}`);
        const shots: { image: string; direction: string }[] = [];
        for (let i = 0; i < herShots.length; i++) {
          shots.push({ image: await herShots[i].full(), direction: ANGLES[i] });
        }
        made = await onHer(shots);
        setSpent((s) => s + herShots.length * 2 * EACH);
        if (!made) throw new Error('She could not be made from any of those pictures, so nothing else was run. Nothing is on the books.');
      }

      /* -------------------------------------------------------- the rail */
      const read: { description: string; swatch: string | null }[] = [];
      if (racks.length) {
        setStep('Reading the outfits');
        for (let at = 0; at < racks.length && !stop.current; at += AT_ONCE) {
          const batch = racks.slice(at, at + AT_ONCE);
          const got = await Promise.all(batch.map(async (r) => {
            try {
              const image = await r.full();
              const said = await ask({ doing: 'read', image, label: 'outfit' });
              return {
                description: String(said.description || ''),
                swatch: typeof said.swatch === 'string' ? said.swatch : null,
              };
            } catch (e) {
              /* One picture their screening will not take does not end a
               * rail of thirty. It is counted, named at the end, and the
               * rest carry on. */
              if (!trouble) trouble = e instanceof Error ? e.message : 'One picture could not be read.';
              return null;
            }
          }));
          for (const g of got) if (g && g.description) read.push(g);
          setDone(Math.min(racks.length, at + batch.length));
          setSpent((s) => s + batch.length * EACH);
        }
      }

      paidFor.current = read;
      setOwed(read.length);
      const hung = read.length ? await hangThem(read) : 0;

      const bits: string[] = [];
      if (made) bits.push(`${name || 'She'} is made from ${made} ${made === 1 ? 'picture' : 'pictures'} and registered`);
      if (hung) bits.push(`${hung} ${hung === 1 ? 'outfit is' : 'outfits are'} on the rail, each with the picture it came from`);
      if (!bits.length) throw new Error(trouble || 'Nothing came of that.');

      setOk(
        `${bits.join('. ')}.`
        + (stop.current ? ' Stopped where you pressed it - the rest are still here to run.' : '')
        + (trouble ? ` Some pictures were refused: ${trouble}` : ''),
      );
      onDone(hung);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That could not be done.');
    } finally {
      setRunning(false);
      setStep('');
    }
  };

  if (!racks.length && !herShots.length) return null;

  return (
    <div style={{
      border: `1px solid ${T.gold}`, borderRadius: 14,
      background: 'rgba(212,175,85,0.05)',
      padding: '18px 20px', display: 'grid', gap: 12,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 700, letterSpacing: '0.14em',
        color: T.gold, textTransform: 'uppercase',
      }}>
        One press, the whole shoot
      </div>

      <p style={{ margin: 0, fontSize: 14, color: T.text, lineHeight: 1.7, maxWidth: '62ch' }}>
        {herShots.length ? (
          <>
            The <strong style={{ color: T.gold }}>three sharpest, most straight-on</strong> pictures
            of her face make her, from three angles, and register her with
            the provider.{' '}
          </>
        ) : null}
        {racks.length ? (
          <>
            The rest sort into <strong style={{ color: T.gold }}>{racks.length} different outfits</strong>,
            and one picture out of each becomes a line on the rail with a
            picture beside it. The others are never sent, so the same dress
            is never paid for twice.
          </>
        ) : null}
      </p>

      {herShots.length ? (
        <div>
          <div style={{ fontSize: 12, color: T.textDim, marginBottom: 6 }}>Her, from these</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {herShots.map((f, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={f.thumb} alt="" style={{
                width: 52, height: 68, objectFit: 'cover', borderRadius: 6,
                border: `1px solid ${T.gold}`,
              }} />
            ))}
          </div>
        </div>
      ) : null}

      {racks.length ? (
        <div>
          <div style={{ fontSize: 12, color: T.textDim, marginBottom: 6 }}>The outfits it found</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {racks.slice(0, 20).map((r, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={r.thumb} alt="" style={{
                width: 40, height: 54, objectFit: 'cover', borderRadius: 5,
                border: `1px solid ${T.lineSoft}`,
              }} />
            ))}
            {racks.length > 20 ? (
              <span style={{ fontSize: 12, color: T.textDim, alignSelf: 'center', paddingLeft: 4 }}>
                and {racks.length - 20} more
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {!running ? (
        <>
          <Row>
            <Btn kind="gold" onClick={run}>
              Separate it all - about ${cost.toFixed(2)}
            </Btn>
          </Row>
          <span style={{ fontSize: 13, color: T.textDim, lineHeight: 1.6, maxWidth: '62ch' }}>
            About {Math.max(1, Math.round((racks.length / 3) * 0.75) + (herShots.length ? 2 : 0))} minutes.
            Twelve cents a drawing, and you can stop part way and keep what is done.
          </span>
        </>
      ) : (
        <>
          <Working>
            {step}{racks.length && done ? ` - ${done} of ${racks.length}` : ''}. About ${spent.toFixed(2)} so far.
          </Working>
          <Row>
            <Btn kind="quiet" onClick={() => { stop.current = true; setStep('Stopping after this one'); }}>
              Stop and keep what is done
            </Btn>
          </Row>
        </>
      )}

      {owed > 0 && !running ? (
        <>
          <Row>
            <Btn kind="gold" onClick={nameAgain}>
              Name the {owed} again - costs nothing
            </Btn>
          </Row>
          <span style={{ fontSize: 13, color: T.textDim, lineHeight: 1.6, maxWidth: '62ch' }}>
            {owed} pictures were read and paid for before that went wrong, and
            they are still in hand. Naming them is a different call and a free
            one - pressing this does not read anything again.
          </span>
        </>
      ) : null}

      <Says text={says} />
      <Says text={ok} tone="ok" />
    </div>
  );
}

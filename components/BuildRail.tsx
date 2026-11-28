'use client';

// components/BuildRail.tsx
//
// A SHOOT, TURNED INTO A WARDROBE.
//
// "I need it to take all of it and build her, especially her wardrobe as
// there is 200 outfits."
//
// The pictures have already been sorted into outfits by then - that part
// happens in the browser for nothing. This is what it costs money to do:
// one picture out of each group goes to the provider's reference model,
// which draws it again and, in the same answer, hands back a WRITTEN
// DESCRIPTION of what was in it. That description is the only way anything
// in this studio reads a photograph.
//
// THE PRICE IS ON THE BUTTON.
//
// Twenty-nine outfits is twenty-nine drawings at twelve cents, and a
// button that quietly spends three and a half dollars is a button nobody
// presses twice. It says the number before it is pressed and counts the
// money up while it runs.
//
// AND IT STOPS WHERE IT GOT TO.
//
// Every outfit that has already been described is kept in hand. Press stop
// at nineteen of twenty-nine and nineteen go up on the rail - because the
// money for those nineteen has already been spent, and throwing them away
// over the ten that did not finish would be spending it twice.

import { useRef, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn } from './kit';
import { Row, Says, Working } from './parts';
import { token } from '@/lib/data';
import { addOutfits } from '@/lib/data';

/** Their price for one reference drawing. Shown, not hidden, and kept
 *  here as a number so the sentence and the sum cannot disagree. */
const EACH = 0.12;

/** How many go at once. Each one is thirty to sixty seconds at their end,
 *  so this is the difference between four minutes and twenty - but a
 *  browser firing twenty-nine at a provider is how an account gets rate
 *  limited mid-build. */
const AT_ONCE = 3;

export type Rack = {
  /** Something to show for it before anything is sent. */
  thumb: string;
  /** How many photographs were of this outfit. */
  count: number;
  /** The one that gets sent, fetched only when it is needed. */
  full: () => Promise<string>;
};

export default function BuildRail({ racks, onDone }: {
  racks: Rack[];
  onDone: (added: number) => void;
}) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [spent, setSpent] = useState(0);
  const [says, setSays] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [step, setStep] = useState('');
  /* A ref, not state: the loop below closes over its own copy of anything
   * held in state, so a Stop button wired to state is a button that does
   * nothing at all until the run has already finished. */
  const stop = useRef(false);

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

  const build = async () => {
    stop.current = false;
    setRunning(true); setSays(null); setOk(null); setDone(0); setSpent(0);

    const read: { description: string; swatch: string | null }[] = [];
    let trouble: string | null = null;

    try {
      setStep('Reading the pictures');
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

      if (!read.length) {
        throw new Error(trouble || 'None of the pictures could be read, so there is nothing to put on the rail.');
      }

      setStep('Naming them');
      const said = await ask({ doing: 'name', descriptions: read.map((r) => r.description) });
      const outfits = (said.outfits as { label: string; words: string }[] | undefined) || [];
      if (!outfits.length) throw new Error('The outfits came back empty. Press it again.');

      setStep('Putting them up');
      const added = await addOutfits(outfits.map((o, i) => ({
        label: o.label || `Outfit ${i + 1}`,
        words: o.words,
        swatch: read[i]?.swatch ?? null,
      })));

      setOk(
        `${added} ${added === 1 ? 'outfit is' : 'outfits are'} on the rail, each with the picture it came from.`
        + (stop.current ? ' Stopped where you pressed it - the rest are still here to run.' : '')
        + (trouble ? ` One or more pictures were refused: ${trouble}` : ''),
      );
      onDone(added);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'The rail could not be built.');
    } finally {
      setRunning(false);
      setStep('');
    }
  };

  if (!racks.length) return null;

  const cost = racks.length * EACH;

  return (
    <div style={{
      border: `1px solid ${T.line}`, borderRadius: 14, background: T.raised,
      padding: '18px 20px', display: 'grid', gap: 12,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 700, letterSpacing: '0.14em',
        color: T.gold, textTransform: 'uppercase',
      }}>
        Her wardrobe, out of these pictures
      </div>

      <p style={{ margin: 0, fontSize: 14, color: T.text, lineHeight: 1.7, maxWidth: '62ch' }}>
        <strong style={{ color: T.gold }}>{racks.length} different outfits</strong> in them.
        One picture out of each goes to the provider, which draws it and sends
        back what it saw written out - that is how the clothes get their
        words. The rest of each group is never sent, so the same dress is
        never paid for twice.
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {racks.slice(0, 18).map((r, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={r.thumb}
            alt=""
            style={{
              width: 44, height: 58, objectFit: 'cover', borderRadius: 6,
              border: `1px solid ${T.lineSoft}`,
            }}
          />
        ))}
        {racks.length > 18 ? (
          <span style={{
            fontSize: 12, color: T.textDim, alignSelf: 'center', paddingLeft: 4,
          }}>and {racks.length - 18} more</span>
        ) : null}
      </div>

      {!running ? (
        <>
          <Row>
            <Btn kind="gold" onClick={build}>
              Build all {racks.length} - about ${cost.toFixed(2)}
            </Btn>
          </Row>
          <span style={{ fontSize: 13, color: T.textDim, lineHeight: 1.6, maxWidth: '62ch' }}>
            About {Math.max(1, Math.round((racks.length / 3) * 0.75))} minutes. Each outfit is
            twelve cents, and what you get for it is the words plus a picture
            of the clothes on the rail. You can stop part way and keep what
            has been done.
          </span>
        </>
      ) : (
        <>
          <Working>
            {step}{racks.length ? ` - ${done} of ${racks.length}` : ''}. About ${spent.toFixed(2)} so far.
          </Working>
          <Row>
            <Btn kind="quiet" onClick={() => { stop.current = true; setStep('Stopping after this one'); }}>
              Stop and keep what is done
            </Btn>
          </Row>
        </>
      )}

      <Says text={says} />
      <Says text={ok} tone="ok" />
    </div>
  );
}

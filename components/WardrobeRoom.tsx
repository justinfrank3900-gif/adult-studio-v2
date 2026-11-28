'use client';

// components/WardrobeRoom.tsx
//
// WHAT THEY WEAR, AND WHY EACH PIECE IS PHOTOGRAPHED ON EACH PERFORMER.
//
// An outfit written in words is a guess until you have seen it on her. The
// swatch - this piece, on this performer, on a plain backdrop - is what makes
// picking one off the rail a decision rather than a hope, and it is what a
// take can open on later.
//
// A swatch is NOT a first frame. It is her standing still in the clothes on a
// blank background; a first frame is her in the set, mid-action. Confusing
// the two is how a take opens on a shot of a shop dummy.

import { useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn, Eyebrow, Lead, Panel, Title } from './kit';
import { Area, Empty, Field, Grid, Pick, Row, Says, Tile, Working } from './parts';
import { addOutfit, keepStill, removeOutfit, saveOutfit, seedOf } from '@/lib/data';
import { make } from '@/lib/generate';
import type { Library } from './Studio';
import type { Outfit } from '@/lib/types';

/** The backdrop every swatch is shot against, so two pieces on the rail can
 *  actually be compared. A swatch shot in a bedroom and one shot in a car
 *  park tell you about the room, not the clothes. */
const SWATCH = 'Standing square to the camera on a plain mid-grey studio backdrop, even soft light, full length, feet in frame, arms relaxed at her sides.';

/**
 * A WHOLE RAIL AT ONCE.
 *
 * "need it to build wardrobe for every outfit as well."
 *
 * A woman photographed a hundred times is wearing twenty things, and
 * typing twenty outfits into a two-field form one at a time is the kind of
 * job that does not get finished. So the rail also takes a list: a name on
 * its own line, what it is underneath it, a blank line between pieces.
 *
 * That shape is not arbitrary - it is what anybody writing a list of
 * clothes writes without being told, and it is what comes back when the
 * outfits are described from photographs somewhere else and pasted in.
 */
function railFrom(text: string): { label: string; words: string }[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((lump) => {
      const lines = lump.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return null;
      /* A leading number or dash is how people write lists, and it is not
       * part of what the thing is called. */
      const label = lines[0].replace(/^(\d+[.)]\s*|[-*]\s*)/, '').replace(/[:–-]\s*$/, '').trim();
      const words = lines.slice(1).join(' ').trim();
      if (!label) return null;
      /* One line on its own is a name with nothing behind it, which would
       * put a piece on the rail that generates nothing. The name becomes
       * the description too, which is at least true. */
      return { label, words: words || label };
    })
    .filter((x): x is { label: string; words: string } => x !== null);
}

export default function WardrobeRoom({ lib }: { lib: Library }) {
  const [on, setOn] = useState<string>(lib.cast[0]?.id || '');
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editing, setEditing] = useState<Outfit | null>(null);
  const [pasting, setPasting] = useState(false);
  const [rail, setRail] = useState('');

  const seed = seedOf(lib.assets, on || null);
  const wearer = lib.cast.find((c) => c.id === on) || null;

  const add = async () => {
    setBusy('add'); setSays(null); setOk(null);
    try {
      await addOutfit(label.trim(), words.trim());
      await lib.reload();
      setLabel(''); setWords(''); setAdding(false);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'The outfit could not be added.');
    } finally { setBusy(null); }
  };

  const addMany = async () => {
    const pieces = railFrom(rail);
    if (!pieces.length) { setSays('Nothing in that looked like a list of outfits.'); return; }
    setBusy('rail'); setSays(null); setOk(null);
    let put = 0;
    try {
      /* One at a time, and the count is kept as it goes. If the tenth of
       * twenty fails, nine are on the rail and the screen says so - a batch
       * that reports only "it failed" after writing half of them is how
       * somebody ends up with a rail they cannot trust. */
      for (const piece of pieces) {
        await addOutfit(piece.label, piece.words);
        put++;
      }
      await lib.reload();
      setRail(''); setPasting(false);
      setOk(`${put} ${put === 1 ? 'piece' : 'pieces'} on the rail. Pick who is wearing them and press Try it on.`);
    } catch (e) {
      await lib.reload();
      setSays(`${put} of ${pieces.length} went on, then it stopped: ${e instanceof Error ? e.message : 'no reason given'}. The ones already on the rail are there - take them out of the list and press it again.`);
    } finally { setBusy(null); }
  };

  const tryOn = async (o: Outfit) => {
    if (!wearer) { setSays('Pick who is wearing it first.'); return; }
    if (!seed) {
      setSays(`${wearer.name} has no anchor picture yet, so there is nothing to put the clothes on. Shoot her first still in Cast.`);
      return;
    }
    setBusy(o.id); setSays(null); setOk(null);
    try {
      const made = await make({
        what: 'still',
        prompt: `${o.prompt_text} ${SWATCH}`,
        identity_id: wearer.id,
        character: wearer.provider_character_id,
        seed_url: seed,
        label: `${wearer.name}_${o.label}`,
        aspect: '9:16',
      });
      await keepStill({
        identityId: wearer.id,
        spicyUrl: made.provider_url,
        ourUrl: made.url,
        storagePath: made.path,
        kind: 'wardrobe',
        label: o.label,
        wardrobe: o.label,
      });
      await saveOutfit(o.id, { last_shots: { ...(o.last_shots || {}), [wearer.id]: made.url } });
      await lib.reload();
      setOk(`${o.label} on ${wearer.name}, kept on the rail.`);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That could not be shot.');
    } finally { setBusy(null); }
  };

  const drop = async (o: Outfit) => {
    setBusy(o.id); setSays(null);
    try {
      await removeOutfit(o.id);
      await lib.reload();
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That could not be removed.');
    } finally { setBusy(null); }
  };

  if (editing) {
    return <EditOutfit lib={lib} outfit={editing} onDone={() => setEditing(null)} />;
  }

  return (
    <>
      <Eyebrow>Pornstars</Eyebrow>
      <Title lead="The" gold="wardrobe" />
      <Lead>
        Every piece, and what it looks like on each performer. Pick who is
        wearing it and the rail repaints itself in her.
      </Lead>

      <Panel style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <Pick
            label="On"
            value={on}
            onChange={setOn}
            options={[
              { value: '', label: 'Nobody - just the pieces' },
              ...lib.cast.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Row>
            <Btn kind="gold" onClick={() => { setAdding((v) => !v); setPasting(false); }}>
              {adding ? 'Not now' : 'Add a piece'}
            </Btn>
            <Btn kind="gold" onClick={() => { setPasting((v) => !v); setAdding(false); }}>
              {pasting ? 'Not now' : 'Add a whole rail'}
            </Btn>
          </Row>
          {adding ? (
            <div style={{ display: 'grid', gap: 14, paddingTop: 6 }}>
              <Field label="What it is called" value={label} onChange={setLabel} placeholder="Black slip dress" />
              <Area
                label="The piece, in words"
                value={words}
                onChange={setWords}
                rows={4}
                placeholder="She is wearing a short black satin slip dress with thin straps..."
                hint="Written as a sentence about what she is wearing. It gets sent in front of the camera direction."
              />
              <Row>
                <Btn kind="gold" onClick={add} disabled={busy === 'add' || !label.trim() || !words.trim()}>
                  {busy === 'add' ? 'Adding' : 'Put it on the rail'}
                </Btn>
              </Row>
            </div>
          ) : null}
          {pasting ? (
            <div style={{ display: 'grid', gap: 14, paddingTop: 6 }}>
              <Area
                label="The whole rail, as a list"
                value={rail}
                onChange={setRail}
                rows={12}
                placeholder={'Black slip dress\nShort black satin slip dress with thin straps, mid thigh, bare shoulders and a low back.\n\nRed gym set\nA red ribbed crop top and matching high waisted leggings, white trainers.'}
                hint="A name on its own line, what it is underneath it, a blank line between pieces. Paste as many as you like."
              />
              {rail.trim() ? (
                <span style={{ fontSize: 13, color: T.gold }}>
                  {railFrom(rail).length} {railFrom(rail).length === 1 ? 'piece' : 'pieces'} read out of that:{' '}
                  {railFrom(rail).slice(0, 6).map((p) => p.label).join(', ')}
                  {railFrom(rail).length > 6 ? ` and ${railFrom(rail).length - 6} more` : ''}.
                </span>
              ) : null}
              <Row>
                <Btn kind="gold" onClick={addMany} disabled={busy === 'rail' || !rail.trim()}>
                  {busy === 'rail' ? 'Hanging them up' : 'Put them all on the rail'}
                </Btn>
              </Row>
              {busy === 'rail' ? <Working>Adding them one at a time.</Working> : null}
            </div>
          ) : null}
          <Says text={says} />
          <Says text={ok} tone="ok" />
        </div>
      </Panel>

      {lib.outfits.length === 0 ? (
        <Empty>Nothing on the rail yet.</Empty>
      ) : (
        <Grid min={226}>
          {lib.outfits.map((o) => {
            const shot = (on && o.last_shots?.[on]) || o.reference_url || null;
            return (
              <Tile
                key={o.id}
                title={o.label}
                src={shot}
                note={on && !o.last_shots?.[on]
                  ? `Not shot on ${wearer?.name || 'her'} yet`
                  : o.prompt_text.slice(0, 80)}
                footer={(
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Btn kind="quiet" onClick={() => tryOn(o)} disabled={busy === o.id || !on}>
                      {busy === o.id ? 'Shooting' : 'Try it on'}
                    </Btn>
                    <Btn kind="quiet" onClick={() => setEditing(o)}>Edit</Btn>
                    <Btn kind="quiet" onClick={() => drop(o)} disabled={busy === o.id}>Remove</Btn>
                  </div>
                )}
              />
            );
          })}
        </Grid>
      )}

      {busy && busy !== 'add' ? <Working>Putting the clothes on her. About half a minute.</Working> : null}

      <p style={{ marginTop: 26, fontSize: 13, color: T.textDim, lineHeight: 1.7, maxWidth: '62ch' }}>
        A swatch is her standing still in the clothes on a plain backdrop, which
        is what makes two pieces comparable. It is not a first frame for a take:
        a first frame is her in the set, mid-action.
      </p>
    </>
  );
}

function EditOutfit({ lib, outfit, onDone }: { lib: Library; outfit: Outfit; onDone: () => void }) {
  const [label, setLabel] = useState(outfit.label);
  const [words, setWords] = useState(outfit.prompt_text);
  const [busy, setBusy] = useState(false);
  const [says, setSays] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setSays(null);
    try {
      await saveOutfit(outfit.id, { label: label.trim(), prompt_text: words.trim() });
      await lib.reload();
      onDone();
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That could not be saved.');
      setBusy(false);
    }
  };

  return (
    <>
      <Row><Btn kind="quiet" onClick={onDone}>The rail</Btn></Row>
      <div style={{ marginTop: 14 }}>
        <Eyebrow>Wardrobe</Eyebrow>
        <Title lead={outfit.label} />
      </div>
      <Panel>
        <div style={{ display: 'grid', gap: 16 }}>
          <Field label="What it is called" value={label} onChange={setLabel} />
          <Area label="The piece, in words" value={words} onChange={setWords} rows={6} />
          <Row>
            <Btn kind="gold" onClick={save} disabled={busy || !label.trim()}>
              {busy ? 'Saving' : 'Save it'}
            </Btn>
          </Row>
          <Says text={says} />
        </div>
      </Panel>
    </>
  );
}

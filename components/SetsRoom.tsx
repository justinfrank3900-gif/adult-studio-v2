'use client';

// components/SetsRoom.tsx
//
// WHERE YOU SHOOT.
//
// A set exists before anything has been shot in it, which is why its picture
// is its own thing and not pulled off a take. The picture is there so that
// picking a location is looking at one rather than reading one, and so that
// the same room comes back the same way in two shoots a week apart.
//
// The empty-room picture carries no performer on purpose. A set photographed
// with somebody in it stops being a location and becomes a shot.

import { useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn, Eyebrow, Lead, Panel, Title } from './kit';
import { Area, Empty, Field, Grid, Row, Says, Tile, Working } from './parts';
import { addSet, removeSet, saveSet } from '@/lib/data';
import { make } from '@/lib/generate';
import type { Library } from './Studio';
import type { SetRow } from '@/lib/types';

const EMPTY_ROOM = 'Photograph of the place itself with nobody in it, shot at eye level on a wide lens, natural light, nothing staged.';

export default function SetsRoom({ lib }: { lib: Library }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);
  const [editing, setEditing] = useState<SetRow | null>(null);

  const add = async () => {
    setBusy('add'); setSays(null);
    try {
      await addSet(label.trim(), words.trim());
      await lib.reload();
      setLabel(''); setWords(''); setAdding(false);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'The set could not be added.');
    } finally { setBusy(null); }
  };

  const shootRoom = async (s: SetRow) => {
    setBusy(s.id); setSays(null);
    try {
      const made = await make({
        what: 'still',
        prompt: `${s.prompt_text} ${EMPTY_ROOM}`,
        /* No performer and no seed: this is the room, not a shot of her in
         * it. Anchoring it on a face would put her in the picture. */
        identity_id: null,
        seed_url: null,
        label: `set_${s.label}`,
        aspect: '9:16',
      });
      await saveSet(s.id, { reference_url: made.url });
      await lib.reload();
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'The room could not be photographed.');
    } finally { setBusy(null); }
  };

  const drop = async (s: SetRow) => {
    setBusy(s.id); setSays(null);
    try {
      await removeSet(s.id);
      await lib.reload();
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That could not be removed.');
    } finally { setBusy(null); }
  };

  if (editing) return <EditSet lib={lib} row={editing} onDone={() => setEditing(null)} />;

  return (
    <>
      <Eyebrow>Scenes</Eyebrow>
      <Title lead="The" gold="sets" />
      <Lead>
        Every place the studio shoots. One set is picked for a whole shoot, so
        that the room does not change underneath a cut.
      </Lead>

      <Panel style={{ marginBottom: 20 }}>
        <Row>
          <Btn kind="gold" onClick={() => setAdding((v) => !v)}>{adding ? 'Not now' : 'Add a set'}</Btn>
        </Row>
        {adding ? (
          <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            <Field label="What it is called" value={label} onChange={setLabel} placeholder="Hotel room, late afternoon" />
            <Area
              label="The place, in words"
              value={words}
              onChange={setWords}
              rows={4}
              placeholder="A high floor hotel room with floor to ceiling windows, low sun..."
              hint="Describe the room and the light. The camera direction is added per take, not here."
            />
            <Row>
              <Btn kind="gold" onClick={add} disabled={busy === 'add' || !label.trim() || !words.trim()}>
                {busy === 'add' ? 'Adding' : 'Add it'}
              </Btn>
            </Row>
          </div>
        ) : null}
        <Says text={says} />
      </Panel>

      {lib.sets.length === 0 ? (
        <Empty>No sets yet.</Empty>
      ) : (
        <Grid min={226}>
          {lib.sets.map((s) => (
            <Tile
              key={s.id}
              title={s.label}
              src={s.reference_url}
              note={s.prompt_text.slice(0, 90)}
              footer={(
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <Btn kind="quiet" onClick={() => shootRoom(s)} disabled={busy === s.id}>
                    {busy === s.id ? 'Shooting' : s.reference_url ? 'Shoot it again' : 'Photograph it'}
                  </Btn>
                  <Btn kind="quiet" onClick={() => setEditing(s)}>Edit</Btn>
                  <Btn kind="quiet" onClick={() => drop(s)} disabled={busy === s.id}>Remove</Btn>
                </div>
              )}
            />
          ))}
        </Grid>
      )}

      {busy && busy !== 'add' ? <Working>Photographing the room. About half a minute.</Working> : null}

      <p style={{ marginTop: 26, fontSize: 13, color: T.textDim, lineHeight: 1.7, maxWidth: '62ch' }}>
        The picture of a set has nobody in it on purpose. A location with a
        performer standing in it is a shot, not a set, and it stops being
        reusable the moment the performer changes.
      </p>
    </>
  );
}

function EditSet({ lib, row, onDone }: { lib: Library; row: SetRow; onDone: () => void }) {
  const [label, setLabel] = useState(row.label);
  const [words, setWords] = useState(row.prompt_text);
  const [busy, setBusy] = useState(false);
  const [says, setSays] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setSays(null);
    try {
      await saveSet(row.id, { label: label.trim(), prompt_text: words.trim() });
      await lib.reload();
      onDone();
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That could not be saved.');
      setBusy(false);
    }
  };

  return (
    <>
      <Row><Btn kind="quiet" onClick={onDone}>All sets</Btn></Row>
      <div style={{ marginTop: 14 }}>
        <Eyebrow>Sets</Eyebrow>
        <Title lead={row.label} />
      </div>
      <Panel>
        <div style={{ display: 'grid', gap: 16 }}>
          <Field label="What it is called" value={label} onChange={setLabel} />
          <Area label="The place, in words" value={words} onChange={setWords} rows={6} />
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

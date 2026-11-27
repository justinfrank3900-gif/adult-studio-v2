'use client';

// components/ShootsRoom.tsx
//
// THE FLOOR: every shoot, and the only place one gets chosen.
//
// Each step used to have its own "nothing is open" screen with its own list
// of shoots to pick from, which is how five steps each quietly became a
// filing cabinet. There is one list, it is here, and opening a shoot from it
// lands on the work rather than on whichever room was clicked last.

import { useState } from 'react';
import { Btn, Eyebrow, Lead, Panel, Title } from './kit';
import { Empty, Field, Grid, Pick, Row, Says, Tile } from './parts';
import { addShoot, faceOf, putShootAway } from '@/lib/data';
import type { Library } from './Studio';

export default function ShootsRoom({ lib, onOpen }: { lib: Library; onOpen: (id: string) => void }) {
  const [opening, setOpening] = useState(false);
  const [name, setName] = useState('');
  const [who, setWho] = useState(lib.cast[0]?.id || '');
  const [where, setWhere] = useState(lib.sets[0]?.id || '');
  const [busy, setBusy] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);

  const open = async () => {
    setBusy('new'); setSays(null);
    try {
      const made = await addShoot(name.trim(), who || null, where || null);
      await lib.reload();
      setName(''); setOpening(false);
      onOpen(made.id);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'The shoot could not be opened.');
    } finally { setBusy(null); }
  };

  const away = async (id: string) => {
    setBusy(id); setSays(null);
    try {
      await putShootAway(id);
      await lib.reload();
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That could not be put away.');
    } finally { setBusy(null); }
  };

  return (
    <>
      <Eyebrow>The floor</Eyebrow>
      <Title lead="Every" gold="shoot" />
      <Lead>
        One performer and one set per shoot, so the room and the face do not
        change underneath a cut.
      </Lead>

      <Panel style={{ marginBottom: 20 }}>
        <Row>
          <Btn kind="gold" onClick={() => setOpening((v) => !v)}>{opening ? 'Not now' : 'Open a shoot'}</Btn>
        </Row>
        {opening ? (
          <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            <Field label="What this shoot is called" value={name} onChange={setName} placeholder="Hotel, Tuesday" />
            <Pick
              label="Who is in it"
              value={who}
              onChange={setWho}
              options={[{ value: '', label: 'Decide later' }, ...lib.cast.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <Pick
              label="Where"
              value={where}
              onChange={setWhere}
              options={[{ value: '', label: 'Decide later' }, ...lib.sets.map((s) => ({ value: s.id, label: s.label }))]}
            />
            <Row>
              <Btn kind="gold" onClick={open} disabled={busy === 'new' || !name.trim()}>
                {busy === 'new' ? 'Opening' : 'Open it'}
              </Btn>
            </Row>
          </div>
        ) : null}
        <Says text={says} />
      </Panel>

      {lib.shoots.length === 0 ? (
        <Empty>Nothing on the floor yet. Open a shoot.</Empty>
      ) : (
        <Grid min={240}>
          {lib.shoots.map((s) => {
            const who2 = lib.cast.find((c) => c.id === s.identity_id);
            const set = lib.sets.find((x) => x.id === s.scene_id);
            return (
              <Tile
                key={s.id}
                title={s.name || s.title.slice(0, 44) || 'Untitled shoot'}
                ratio="4 / 3"
                src={set?.reference_url || (who2 ? faceOf(lib.assets, who2.id) : null)}
                note={[who2?.name, set?.label].filter(Boolean).join(' - ') || 'Nobody and nowhere yet'}
                footer={(
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Btn kind="gold" onClick={() => onOpen(s.id)}>Open</Btn>
                    <Btn kind="quiet" onClick={() => away(s.id)} disabled={busy === s.id}>Put away</Btn>
                  </div>
                )}
              />
            );
          })}
        </Grid>
      )}
    </>
  );
}

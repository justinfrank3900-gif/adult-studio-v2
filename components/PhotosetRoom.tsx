'use client';

// components/PhotosetRoom.tsx
//
// ONE PERFORMER, ONE OUTFIT, ONE SET, A WHOLE ROLL OF POSES.
//
// Shooting stills one at a time in Cast is right for finding a look and
// wrong for filling a gallery: twenty pictures means twenty rounds of
// choosing an angle, pressing a button and waiting. This room is the roll -
// tick the poses, press once, walk away.
//
// Every frame in a set is an edit of the SAME anchor picture rather than of
// the one before it. That matters: chaining each pose off the last would let
// her drift across twenty shots, a little more each time, and the first and
// last would not be the same woman. Anchoring every one on the same picture
// keeps the whole set on her.
//
// They go one after another and not all at once on purpose. A provider that
// is handed twenty requests in a second rate-limits and you lose half the
// set with no way to tell which half; one at a time, a failure is one pose
// with its own sentence next to it and the rest of the roll still arrives.

import { useMemo, useRef, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn, Eyebrow, Lead, Panel, Title } from './kit';
import { Area, Empty, Grid, Pick, Row, Says, Tile, Working } from './parts';
import { GROUPS, POSES, DEFAULT_SET } from '@/lib/poses';
import { keepStill, seedOf } from '@/lib/data';
import { make } from '@/lib/generate';
import type { Library } from './Studio';
import type { Asset } from '@/lib/types';

type Shot = {
  pose: string;
  label: string;
  state: 'waiting' | 'rolling' | 'done' | 'failed';
  url?: string;
  why?: string;
};

export default function PhotosetRoom({ lib }: { lib: Library }) {
  const [who, setWho] = useState(lib.cast[0]?.id || '');
  const [outfit, setOutfit] = useState('');
  const [where, setWhere] = useState('');
  const [picked, setPicked] = useState<string[]>(DEFAULT_SET);
  const [words, setWords] = useState<Record<string, string>>({});
  const [mine, setMine] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [rolling, setRolling] = useState(false);
  const [says, setSays] = useState<string | null>(null);
  /* A REF AND NOT STATE. The loop below is one long-running function, so
   * it closes over whatever `stop` was when the render that made it ran -
   * setting state mid-roll would never reach it and Stop would do nothing. */
  const stop = useRef(false);

  const performer = lib.cast.find((c) => c.id === who) || null;
  const seed = seedOf(lib.assets, who || null);
  const wearing = lib.outfits.find((o) => o.id === outfit) || null;
  const room = lib.sets.find((s) => s.id === where) || null;

  /* The part of the sentence every pose in this set shares. Written once,
   * because twenty copies of the same description is twenty places for it to
   * drift. */
  const shared = [wearing?.prompt_text, room?.prompt_text].filter(Boolean).join(' ');
  const [sharedEdit, setSharedEdit] = useState<string | null>(null);
  const common = sharedEdit ?? shared;

  const lineOf = (key: string) =>
    words[key] ?? POSES.find((p) => p.key === key)?.line ?? '';

  const toggle = (key: string) =>
    setPicked((v) => (v.includes(key) ? v.filter((k) => k !== key) : [...v, key]));

  const addMine = () => {
    const text = mine.trim();
    if (!text) return;
    const key = `own_${Date.now().toString(36)}`;
    setWords((w) => ({ ...w, [key]: text }));
    setPicked((v) => [...v, key]);
    setMine('');
  };

  const labelOf = (key: string) =>
    POSES.find((p) => p.key === key)?.label || 'Your own';

  const roll = async () => {
    if (!performer) { setSays('Pick who you are shooting first.'); return; }
    if (!seed) {
      setSays(`${performer.name} has no anchor picture, so there is nothing to hold her face to. Shoot her first still in Cast.`);
      return;
    }
    if (picked.length === 0) { setSays('Tick at least one pose.'); return; }

    setSays(null);
    stop.current = false;
    setRolling(true);

    /* One id for the whole roll, so the set can be found again as a set
     * rather than as twenty loose stills with the same date on them. */
    const runId = `set_${Date.now().toString(36)}`;
    const queue: Shot[] = picked.map((k) => ({ pose: k, label: labelOf(k), state: 'waiting' }));
    setShots(queue);

    for (let i = 0; i < queue.length; i++) {
      if (stop.current) break;
      setShots((s) => s.map((x, n) => (n === i ? { ...x, state: 'rolling' } : x)));
      const key = queue[i].pose;
      const prompt = [common, lineOf(key)].filter(Boolean).join(' ');
      try {
        const made = await make({
          what: 'still',
          prompt,
          identity_id: performer.id,
          character: performer.provider_character_id,
          /* THE SAME anchor every time, never the frame before. */
          seed_url: seed,
          label: `${performer.name}_${key}`,
          aspect: '9:16',
        });
        await keepStill({
          identityId: performer.id,
          spicyUrl: made.provider_url,
          ourUrl: made.url,
          storagePath: made.path,
          kind: 'photoset',
          label: queue[i].label,
          wardrobe: wearing?.label ?? null,
          angle: key,
          extra: { photoset: runId, pose: key, set: room?.label ?? null },
        });
        setShots((s) => s.map((x, n) => (n === i ? { ...x, state: 'done', url: made.url } : x)));
      } catch (e) {
        setShots((s) => s.map((x, n) => (n === i
          ? { ...x, state: 'failed', why: e instanceof Error ? e.message : 'That one did not come back.' }
          : x)));
      }
    }

    setRolling(false);
    await lib.reload();
  };

  const done = shots.filter((s) => s.state === 'done').length;
  const failed = shots.filter((s) => s.state === 'failed').length;

  /* Rolls already shot, newest first, so a set can be looked at again. */
  const pastSets = useMemo(() => {
    const byRun = new Map<string, Asset[]>();
    for (const a of lib.assets) {
      const run = a.meta && typeof a.meta.photoset === 'string' ? a.meta.photoset : null;
      if (!run) continue;
      const list = byRun.get(run) || [];
      list.push(a);
      byRun.set(run, list);
    }
    return [...byRun.entries()]
      .map(([run, list]) => ({ run, list, when: list[0]?.created_at }))
      .sort((a, b) => String(b.when).localeCompare(String(a.when)));
  }, [lib.assets]);

  return (
    <>
      <Eyebrow>Scenes</Eyebrow>
      <Title lead="Shoot a" gold="set" />
      <Lead>
        One performer, one outfit, one room, and as many poses as you tick.
        Every frame is an edit of her same anchor picture, so the twentieth is
        still the same woman as the first.
      </Lead>

      <Panel style={{ marginBottom: 18 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <Pick
            label="Who"
            value={who}
            onChange={(v) => { setWho(v); setSharedEdit(null); }}
            options={lib.cast.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Pick
            label="Wearing"
            value={outfit}
            onChange={(v) => { setOutfit(v); setSharedEdit(null); }}
            options={[
              { value: '', label: 'Whatever she has on' },
              ...lib.outfits.map((o) => ({ value: o.id, label: o.label })),
            ]}
          />
          <Pick
            label="Where"
            value={where}
            onChange={(v) => { setWhere(v); setSharedEdit(null); }}
            options={[
              { value: '', label: 'Leave the room out of it' },
              ...lib.sets.map((s) => ({ value: s.id, label: s.label })),
            ]}
          />
          <Area
            label="What every shot in this set says"
            value={common}
            onChange={setSharedEdit}
            rows={3}
            hint="The clothes and the room. The pose is added to the end of this, one per shot. Her face is not written here - it comes from her anchor picture."
          />
          {!seed && performer ? (
            <p style={{ margin: 0, fontSize: 14, color: T.warn, lineHeight: 1.6 }}>
              {performer.name} has no anchor picture yet, so a set would come back
              as twenty different women. Shoot her first still in Cast.
            </p>
          ) : null}
        </div>
      </Panel>

      <Eyebrow>The poses</Eyebrow>
      <div style={{ marginBottom: 18 }}>
        {GROUPS.map((g) => (
          <div key={g} style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 13, fontWeight: 700, letterSpacing: '0.14em',
              color: T.textDim, textTransform: 'uppercase', marginBottom: 10,
            }}>{g}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
              {POSES.filter((p) => p.group === g).map((p) => {
                const on = picked.includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => toggle(p.key)}
                    title={p.line}
                    style={{
                      borderRadius: 999, padding: '10px 16px', minHeight: 42,
                      fontSize: 14, fontWeight: on ? 700 : 400, fontFamily: 'inherit',
                      cursor: 'pointer',
                      background: on ? T.raised : 'transparent',
                      color: on ? T.text : T.textMuted,
                      border: `1px solid ${on ? T.gold : T.line}`,
                    }}
                  >
                    {on ? `${String.fromCharCode(0x2713)} ` : ''}{p.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <Row>
          <input
            value={mine}
            onChange={(e) => setMine(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMine(); } }}
            placeholder="a pose of your own, written as a sentence"
            style={{
              flex: '999 1 300px', background: T.ink, color: T.text,
              border: `1px solid ${T.line}`, borderRadius: 999,
              padding: '12px 17px', fontSize: 14, fontFamily: 'inherit',
            }}
          />
          <Btn onClick={addMine} disabled={!mine.trim()}>Add it</Btn>
        </Row>
      </div>

      {picked.length > 0 ? (
        <Panel style={{ marginBottom: 18 }}>
          <Eyebrow>What gets sent, pose by pose</Eyebrow>
          <div style={{ display: 'grid', gap: 12 }}>
            {picked.map((k) => (
              <div key={k}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{labelOf(k)}</div>
                <textarea
                  value={lineOf(k)}
                  rows={2}
                  onChange={(e) => setWords((w) => ({ ...w, [k]: e.target.value }))}
                  style={{
                    width: '100%', background: T.ink, color: T.text,
                    border: `1px solid ${T.line}`, borderRadius: 10,
                    padding: '10px 12px', fontSize: 14, fontFamily: 'inherit',
                    lineHeight: 1.5, resize: 'vertical',
                  }}
                />
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Row>
        <Btn kind="gold" onClick={roll} disabled={rolling || !seed || picked.length === 0}>
          {rolling ? `Shooting ${done + failed + 1} of ${shots.length}` : `Shoot the set (${picked.length})`}
        </Btn>
        {rolling ? <Btn kind="quiet" onClick={() => { stop.current = true; }}>Stop after this one</Btn> : null}
        <span style={{ fontSize: 13, color: T.textDim }}>
          About half a minute each, so {picked.length} is roughly {Math.ceil(picked.length * 0.5)} minutes.
        </span>
      </Row>
      {rolling ? <Working>Leave the page open. Each one is saved as it lands.</Working> : null}
      <Says text={says} />

      {shots.length > 0 ? (
        <div style={{ marginTop: 22 }}>
          <Eyebrow>
            This set{done ? ` - ${done} shot` : ''}{failed ? `, ${failed} missed` : ''}
          </Eyebrow>
          <Grid min={200}>
            {shots.map((s) => (
              <Tile
                key={s.pose}
                title={s.label}
                src={s.url}
                tone={s.state === 'failed' ? 'warn' : undefined}
                badge={s.state === 'rolling' ? 'rolling' : s.state === 'waiting' ? 'waiting' : null}
                note={s.state === 'failed' ? s.why : s.state === 'done' ? null : s.state}
                footer={s.url ? <Save url={s.url} name={`${performer?.name || 'still'}-${s.pose}.jpg`} /> : null}
              />
            ))}
          </Grid>
        </div>
      ) : null}

      {pastSets.length > 0 ? (
        <div style={{ marginTop: 34 }}>
          <Eyebrow>Sets already shot</Eyebrow>
          {pastSets.slice(0, 6).map((set) => {
            const name = lib.cast.find((c) => c.id === set.list[0]?.identity_id)?.name || 'Someone';
            return (
              <div key={set.run} style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 14, color: T.textMuted, marginBottom: 10 }}>
                  {name} - {set.list.length} frames - {new Date(String(set.when)).toLocaleDateString()}
                  {set.list[0]?.wardrobe ? ` - ${set.list[0].wardrobe}` : ''}
                </div>
                <Grid min={160}>
                  {set.list.map((a) => (
                    <Tile
                      key={a.id}
                      title={a.label || 'Still'}
                      src={a.public_url}
                      footer={<Save url={a.public_url} name={`${name}-${a.label || a.id}.jpg`} />}
                    />
                  ))}
                </Grid>
              </div>
            );
          })}
        </div>
      ) : (
        shots.length === 0 ? <div style={{ marginTop: 26 }}><Empty>No sets shot yet.</Empty></div> : null
      )}
    </>
  );
}

/** Keeping a picture on the machine it is being looked at on. A plain link
 *  with download on it opens the image in a tab instead of saving it when
 *  the file is served from somewhere else, so it goes through a blob. */
function Save({ url, name }: { url: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setWhy(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`It could not be fetched back (${res.status}).`);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      setWhy(e instanceof Error ? e.message : 'It could not be saved.');
    } finally { setBusy(false); }
  };
  return (
    <>
      <Btn kind="quiet" onClick={save} disabled={busy}>{busy ? 'Saving' : 'Save it'}</Btn>
      <Says text={why} />
    </>
  );
}

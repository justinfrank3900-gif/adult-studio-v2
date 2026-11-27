'use client';

// components/ShootRoom.tsx
//
// THE TAKES, AND THE CHAIN THAT MAKES A CUT DISAPPEAR.
//
// Take 01 opens on the performer's anchor picture. Take 02 opens on take 01's
// frame. Take 03 opens on take 02's. That chain is the only thing that makes
// a join invisible - not matching camera sizes, not matching wording, not
// shooting them minutes apart. Two takes that each describe "medium shot, same
// room" come back as two different rooms with two different women in them.
//
// So the frame is shot first and the clip is made FROM it, in that order,
// with the frame visible on the card. If the frame is wrong, the clip was
// always going to be wrong, and it is cheaper to see that before paying for
// the render.

import { useCallback, useEffect, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn, Eyebrow, Lead, Mark, Panel, Title } from './kit';
import { Area, Empty, Pick, Row, Says, Working } from './parts';
import {
  addTake, keepStill, loadTakes, removeTake, saveTake, seedOf,
} from '@/lib/data';
import { make } from '@/lib/generate';
import type { Library } from './Studio';
import type { Shoot, Take } from '@/lib/types';
import { DEMO, demoTakes } from '@/lib/demo';

export default function ShootRoom({ lib, shoot, onClose }: {
  lib: Library; shoot: Shoot; onClose: () => void;
}) {
  const [takes, setTakes] = useState<Take[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);

  const who = lib.cast.find((c) => c.id === shoot.identity_id) || null;
  const set = lib.sets.find((s) => s.id === shoot.scene_id) || null;
  const seed = seedOf(lib.assets, shoot.identity_id);

  const reload = useCallback(async () => {
    if (DEMO) {
      setTakes(demoTakes.filter((t) => t.production_id === shoot.id) as Take[]);
      setLoading(false);
      return;
    }
    try {
      setTakes(await loadTakes(shoot.id));
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'The takes could not be read.');
    } finally {
      setLoading(false);
    }
  }, [shoot.id]);

  useEffect(() => { void reload(); }, [reload]);

  const add = async () => {
    setBusy('add'); setSays(null);
    try {
      await addTake(shoot, (takes[takes.length - 1]?.order_index ?? 0) + 1);
      await reload();
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'The take could not be added.');
    } finally { setBusy(null); }
  };

  /** What this take opens on: the one before it, or her anchor if it is the
   *  first. A take with neither cannot be shot, and says so. */
  const opensOn = (i: number): string | null => {
    for (let k = i - 1; k >= 0; k--) {
      const prev = takes[k];
      const frame = prev.ends_on_frame_url || prev.opens_on_frame_url;
      if (frame) return frame;
    }
    return seed;
  };

  return (
    <>
      <Row>
        <Btn kind="quiet" onClick={onClose}>The floor</Btn>
      </Row>
      <div style={{ marginTop: 14 }}>
        <Eyebrow>Shoot</Eyebrow>
        <Title lead={shoot.name || shoot.title.slice(0, 44) || 'Untitled'} />
        <Lead>
          {[who?.name, set?.label].filter(Boolean).join(' - ') || 'Nobody and nowhere set yet'}
        </Lead>
      </div>

      <Panel style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <Mark state={who ? 'ok' : 'warn'}>
            {who ? `${who.name} is on camera.` : 'Nobody is cast in this shoot yet. Set it on the floor.'}
          </Mark>
          <Mark state={seed ? 'ok' : 'warn'}>
            {seed
              ? 'She is anchored, so take 01 opens on her own picture.'
              : 'She has no anchor picture, so nothing here can hold her face. Shoot her first still in Cast.'}
          </Mark>
          <Mark state={set ? 'ok' : 'off'}>
            {set ? `${set.label}.` : 'No set chosen. The words on each take are all the room gets.'}
          </Mark>
        </div>
      </Panel>

      <Says text={says} />

      {loading ? (
        <p style={{ fontSize: 15, color: T.textMuted }}>Reading the takes.</p>
      ) : takes.length === 0 ? (
        <Empty>No takes yet. Add the first one and write what happens in it.</Empty>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {takes.map((t, i) => (
            <TakeCard
              key={t.id}
              lib={lib}
              shoot={shoot}
              take={t}
              n={i + 1}
              opensOn={opensOn(i)}
              setWideBusy={setBusy}
              onChanged={reload}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <Btn kind="gold" onClick={add} disabled={busy === 'add'}>
          {busy === 'add' ? 'Adding' : takes.length === 0 ? 'Add the first take' : 'Add another take'}
        </Btn>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------- */

function TakeCard({ lib, shoot, take, n, opensOn, onChanged }: {
  lib: Library;
  shoot: Shoot;
  take: Take;
  n: number;
  opensOn: string | null;
  setWideBusy: (v: string | null) => void;
  onChanged: () => Promise<void>;
}) {
  const [note, setNote] = useState(take.direction_note || '');
  const [outfit, setOutfit] = useState(take.outfit_id || '');
  const [seconds, setSeconds] = useState('5');
  const [busy, setBusy] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);

  const set = lib.sets.find((s) => s.id === shoot.scene_id) || null;
  const wearing = lib.outfits.find((o) => o.id === outfit) || null;
  const who = lib.cast.find((c) => c.id === shoot.identity_id) || null;

  /* WHAT GETS SENT, SHOWN RATHER THAN DESCRIBED.
   * Three parts in a fixed order: the clothes, the room, then what happens.
   * The face is not in here at all - it comes from the frame this take opens
   * on, and writing it in words as well is how you get a second woman who
   * matches the description. */
  const assembled = [
    wearing?.prompt_text,
    set?.prompt_text,
    note.trim(),
  ].filter(Boolean).join(' ');
  const [edited, setEdited] = useState<string | null>(null);
  const prompt = edited ?? assembled;

  const save = async (patch: Partial<Take>) => {
    try {
      await saveTake(take.id, patch);
      await onChanged();
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That could not be saved.');
    }
  };

  const shootFrame = async () => {
    if (!opensOn) {
      setSays('There is nothing for this take to open on. Shoot her anchor picture in Cast first, or shoot the take before this one.');
      return;
    }
    if (!prompt.trim()) { setSays('Write what happens in this take first.'); return; }
    setBusy('frame'); setSays(null);
    try {
      const made = await make({
        what: 'still',
        prompt,
        identity_id: shoot.identity_id,
        /* The anchor. An edit can only hold on a url the provider served,
         * which is why the provider url is what the chain carries and our
         * own copy is only what the page shows. */
        seed_url: opensOn,
        label: `${shoot.name || 'take'}_${n}`,
        aspect: '9:16',
      });
      if (shoot.identity_id) {
        await keepStill({
          identityId: shoot.identity_id,
          spicyUrl: made.provider_url,
          ourUrl: made.url,
          storagePath: made.path,
          kind: 'frame',
          label: `Take ${String(n).padStart(2, '0')}`,
          wardrobe: wearing?.label ?? null,
        });
      }
      await saveTake(take.id, {
        image_url: made.url,
        opens_on_frame_url: opensOn,
        /* What the NEXT take opens on. Until there is a clip to pull a last
         * frame from, this take's own frame is the honest answer: it is the
         * last thing the chain actually knows about. */
        ends_on_frame_url: made.provider_url,
        direction_note: note.trim() || null,
        outfit_id: outfit || null,
        status: 'frame',
        error: null,
      });
      await Promise.all([onChanged(), lib.reload()]);
      setEdited(null);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'The frame could not be shot.';
      setSays(m);
      void saveTake(take.id, { error: m, status: 'failed' }).catch(() => {});
    } finally { setBusy(null); }
  };

  const rollClip = async () => {
    const from = take.ends_on_frame_url;
    if (!from) { setSays('Shoot the frame first. The clip is made from it.'); return; }
    setBusy('clip'); setSays(null);
    try {
      const made = await make({
        what: 'clip',
        prompt,
        identity_id: shoot.identity_id,
        seed_url: from,
        duration: Math.min(30, Math.max(2, Number(seconds) || 5)),
        label: `${shoot.name || 'take'}_${n}_clip`,
        action: note.trim() || null,
      });
      await saveTake(take.id, { video_url: made.url, status: 'ready', error: null });
      await onChanged();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'The clip could not be made.';
      setSays(m);
      void saveTake(take.id, { error: m, status: 'failed' }).catch(() => {});
    } finally { setBusy(null); }
  };

  const drop = async () => {
    setBusy('drop');
    try {
      await removeTake(take.id);
      await onChanged();
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That take could not be removed.');
      setBusy(null);
    }
  };

  return (
    <Panel tone={take.status === 'failed' ? 'warn' : 'plain'}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>

        {/* The two ends of the take, as pictures. A seam is only clean when
            two of these hold the same picture, so they go side by side and
            a person can simply see it. */}
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          <Frame label="Opens on" src={opensOn && take.image_url ? take.opens_on_frame_url || opensOn : opensOn} />
          <Frame label={`Take ${String(n).padStart(2, '0')}`} src={take.image_url} lit />
        </div>

        <div style={{ flex: '999 1 360px', minWidth: 0, display: 'grid', gap: 14 }}>
          <Pick
            label="Wearing"
            value={outfit}
            onChange={(v) => { setOutfit(v); setEdited(null); void save({ outfit_id: v || null }); }}
            options={[
              { value: '', label: 'Whatever she has on' },
              ...lib.outfits.map((o) => ({ value: o.id, label: o.label })),
            ]}
          />
          <Area
            label="What happens in this take"
            value={note}
            onChange={(v) => { setNote(v); setEdited(null); }}
            rows={3}
            placeholder="she turns from the window and walks towards the camera"
            hint="Written as the action. Her face is not described here - it comes from the frame this take opens on."
          />
          <Area
            label="What gets sent"
            value={prompt}
            onChange={setEdited}
            rows={3}
            hint={`The clothes, then the room, then the action. ${opensOn ? 'Anchored on the frame on the left.' : 'Nothing to anchor on yet.'}`}
          />

          <Row>
            <Btn kind="gold" onClick={shootFrame} disabled={busy !== null || !opensOn}>
              {busy === 'frame' ? 'Shooting' : take.image_url ? 'Shoot the frame again' : 'Shoot the frame'}
            </Btn>
            <Btn onClick={rollClip} disabled={busy !== null || !take.ends_on_frame_url}>
              {busy === 'clip' ? 'Rolling' : take.video_url ? 'Roll it again' : 'Roll the clip'}
            </Btn>
            <select
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              style={{
                background: T.ink, color: T.text, border: `1px solid ${T.line}`,
                borderRadius: 999, padding: '12px 15px', fontSize: 14, fontFamily: 'inherit',
              }}
            >
              {['5', '10', '15', '20', '30'].map((s) => <option key={s} value={s}>{s} seconds</option>)}
            </select>
            <Btn kind="quiet" onClick={drop} disabled={busy !== null}>Remove take</Btn>
          </Row>

          {busy === 'frame' ? <Working>Shooting the frame. About half a minute.</Working> : null}
          {busy === 'clip' ? (
            <Working>
              Rolling. The provider renders in five second pieces and this can take
              several minutes - leave the page open.
            </Working>
          ) : null}

          <Says text={says} />
          {take.error && !says ? <Says text={take.error} /> : null}

          {take.video_url ? (
            <video
              src={take.video_url}
              controls
              playsInline
              style={{ width: '100%', maxWidth: 320, borderRadius: 12, border: `1px solid ${T.line}`, display: 'block' }}
            />
          ) : null}
        </div>
      </div>

      {who && !lib.assets.some((a) => a.identity_id === who.id) ? (
        <p style={{ margin: '14px 0 0', fontSize: 13, color: T.warn, lineHeight: 1.6 }}>
          {who.name} has no pictures at all, so this take has nothing to hold her to.
        </p>
      ) : null}
    </Panel>
  );
}

/** One end of a take, drawn as a frame rather than described in words. */
function Frame({ label, src, lit }: { label: string; src?: string | null; lit?: boolean }) {
  return (
    <figure style={{ margin: 0, width: 118 }}>
      <div style={{
        height: 200, borderRadius: 10, overflow: 'hidden', position: 'relative',
        border: `${lit ? 2 : 1}px solid ${lit && src ? T.gold : T.line}`,
        background: src ? T.ink : `linear-gradient(175deg, ${T.raised} 0%, ${T.surface} 52%, ${T.ink} 100%)`,
      }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : null}
        <span style={{
          position: 'absolute', left: 7, top: 7, borderRadius: 999, padding: '2px 9px',
          fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
          background: 'rgba(0,0,0,0.72)', color: T.goldLit, border: `1px solid ${T.line}`,
        }}>{label}</span>
      </div>
    </figure>
  );
}

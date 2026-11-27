'use client';

// components/StillsRoom.tsx
//
// ONE PICTURE, NOT PART OF ANYTHING.
//
// Cast makes a performer. Shoot a set makes a roll of her. This is the
// third thing, and it is the one people actually use most: a picture,
// right now, of whatever is in your head - a thumbnail, a post, an idea
// you want to see before you build a shoot around it.
//
// It is a separate room rather than a button inside Cast because the moment
// a free picture lives inside a performer's page, every free picture has to
// belong to a performer. Half of them do not.

import { useMemo, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn, Eyebrow, Lead, Panel, Title } from './kit';
import { Area, Empty, Grid, Pick, Row, Says, Tile, Working } from './parts';
import { keepStill, seedOf } from '@/lib/data';
import { make } from '@/lib/generate';
import type { Library } from './Studio';
import type { Asset } from '@/lib/types';

type Made = { id: string; url: string; state: 'rolling' | 'done' | 'failed'; why?: string };

export default function StillsRoom({ lib }: { lib: Library }) {
  const [who, setWho] = useState('');
  const [outfit, setOutfit] = useState('');
  const [where, setWhere] = useState('');
  const [words, setWords] = useState('');
  const [shape, setShape] = useState<'9:16' | '16:9'>('9:16');
  const [howMany, setHowMany] = useState('1');
  const [made, setMade] = useState<Made[]>([]);
  const [busy, setBusy] = useState(false);
  const [says, setSays] = useState<string | null>(null);

  const performer = lib.cast.find((c) => c.id === who) || null;
  const seed = seedOf(lib.assets, who || null);
  const wearing = lib.outfits.find((o) => o.id === outfit) || null;
  const room = lib.sets.find((s) => s.id === where) || null;

  /* THE SENTENCE, SHOWN RATHER THAN DESCRIBED.
   * Clothes, then room, then what you typed - the same order as a take, so
   * a picture made here behaves the same way as one made in a shoot. */
  const assembled = [wearing?.prompt_text, room?.prompt_text, words.trim()].filter(Boolean).join(' ');
  const [edited, setEdited] = useState<string | null>(null);
  const prompt = edited ?? assembled;

  const loose = useMemo(
    () => lib.assets.filter((a) => a.kind === 'free').slice(0, 24),
    [lib.assets],
  );

  const roll = async () => {
    if (!prompt.trim()) { setSays('Write what the picture is first.'); return; }
    setBusy(true); setSays(null);

    const n = Math.min(6, Math.max(1, Number(howMany) || 1));
    const queue: Made[] = Array.from({ length: n }, (_, i) => ({
      id: `m${Date.now()}_${i}`, url: '', state: 'rolling' as const,
    }));
    setMade(queue);

    for (let i = 0; i < n; i++) {
      try {
        const got = await make({
          what: 'still',
          prompt,
          identity_id: who || null,
          character: performer?.provider_character_id ?? null,
          /* Anchored on her when somebody is in it, so it is the same woman
           * as everywhere else. Nothing to anchor on when nobody is. */
          seed_url: seed,
          label: performer ? `${performer.name}_still` : 'still',
          aspect: shape,
        });
        await keepStill({
          identityId: who || null,
          spicyUrl: got.provider_url,
          ourUrl: got.url,
          storagePath: got.path,
          kind: 'free',
          label: words.trim().slice(0, 60) || 'Still',
          wardrobe: wearing?.label ?? null,
          extra: { set: room?.label ?? null, shape },
        });
        setMade((m) => m.map((x, k) => (k === i ? { ...x, state: 'done', url: got.url } : x)));
      } catch (e) {
        setMade((m) => m.map((x, k) => (k === i
          ? { ...x, state: 'failed', why: e instanceof Error ? e.message : 'That one did not come back.' }
          : x)));
      }
    }

    setBusy(false);
    setEdited(null);
    await lib.reload();
  };

  return (
    <>
      <Eyebrow>Scenes</Eyebrow>
      <Title lead="Build a" gold="still" />
      <Lead>
        A picture on its own - no shoot, no set, no roll. Put somebody in it
        and it is anchored on her face; leave her out and it is whatever you
        describe.
      </Lead>

      <Panel style={{ marginBottom: 18 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <Area
            label="What the picture is"
            value={words}
            onChange={(v) => { setWords(v); setEdited(null); }}
            rows={3}
            placeholder="lying back on a hotel bed in the late afternoon, one arm behind her head, looking at the camera"
          />

          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <Pick
              label="Who is in it"
              value={who}
              onChange={(v) => { setWho(v); setEdited(null); }}
              options={[{ value: '', label: 'Nobody' }, ...lib.cast.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <Pick
              label="Wearing"
              value={outfit}
              onChange={(v) => { setOutfit(v); setEdited(null); }}
              options={[{ value: '', label: 'Whatever you wrote' }, ...lib.outfits.map((o) => ({ value: o.id, label: o.label }))]}
            />
            <Pick
              label="Where"
              value={where}
              onChange={(v) => { setWhere(v); setEdited(null); }}
              options={[{ value: '', label: 'Whatever you wrote' }, ...lib.sets.map((s) => ({ value: s.id, label: s.label }))]}
            />
            <Pick
              label="Shape"
              value={shape}
              onChange={(v) => setShape(v === '16:9' ? '16:9' : '9:16')}
              options={[
                { value: '9:16', label: 'Tall (phone)' },
                { value: '16:9', label: 'Wide' },
              ]}
            />
            <Pick
              label="How many"
              value={howMany}
              onChange={setHowMany}
              options={['1', '2', '3', '4', '6'].map((n) => ({ value: n, label: n }))}
            />
          </div>

          <Area
            label="What gets sent"
            value={prompt}
            onChange={setEdited}
            rows={3}
            hint={who
              ? (seed
                ? 'An edit of her anchor picture, so it is the same face.'
                : `${performer?.name || 'She'} has no anchor picture, so this will come back as somebody else. Shoot her first still in Cast.`)
              : 'Nobody in it, so nothing is anchored.'}
          />

          <Row>
            <Btn kind="gold" onClick={roll} disabled={busy || !prompt.trim()}>
              {busy ? 'Making it' : `Make ${howMany === '1' ? 'it' : `${howMany} of them`}`}
            </Btn>
            {edited !== null ? <Btn kind="quiet" onClick={() => setEdited(null)}>Put the wording back</Btn> : null}
          </Row>
          {busy ? <Working>About half a minute each. Each one is saved as it lands.</Working> : null}
          <Says text={says} />
        </div>
      </Panel>

      {made.length > 0 ? (
        <div style={{ marginBottom: 30 }}>
          <Eyebrow>Just made</Eyebrow>
          <Grid min={200}>
            {made.map((m) => (
              <Tile
                key={m.id}
                title={m.state === 'failed' ? 'Did not come back' : 'Still'}
                src={m.url || null}
                ratio={shape === '16:9' ? '16 / 9' : '3 / 4'}
                tone={m.state === 'failed' ? 'warn' : undefined}
                badge={m.state === 'rolling' ? 'rolling' : null}
                note={m.why}
                footer={m.url ? <Save url={m.url} name={`still-${m.id}.jpg`} /> : null}
              />
            ))}
          </Grid>
        </div>
      ) : null}

      <Eyebrow>Made here before</Eyebrow>
      {loose.length === 0 ? (
        <Empty>Nothing yet.</Empty>
      ) : (
        <Grid min={180}>
          {loose.map((a: Asset) => (
            <Tile
              key={a.id}
              title={a.label || 'Still'}
              src={a.public_url}
              note={new Date(a.created_at).toLocaleDateString()}
              footer={<Save url={a.public_url} name={`${a.label || a.id}.jpg`} />}
            />
          ))}
        </Grid>
      )}
    </>
  );
}

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

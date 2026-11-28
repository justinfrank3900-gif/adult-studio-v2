'use client';

// components/CastRoom.tsx
//
// WHO IS ON CAMERA, AND THE ONE RULE THAT KEEPS A FACE THE SAME.
//
// The first picture of a performer CREATES them. Everything after it is an
// EDIT of that same picture, sent back to the provider by the url the
// provider itself served. That is the whole trick, and it is why the seed
// url is shown on the card rather than hidden: a performer with no seed will
// come back as a different woman in the right clothes every single time, and
// that failure looks like success until you put two stills side by side.
//
// The words that describe her - the look - are written once and sent with
// every shot. They do not override the picture. The picture wins, always.
// They are there for the parts a 400x600 jpeg cannot carry.

import { useMemo, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn, Eyebrow, Lead, Panel, Title } from './kit';
import { Area, Empty, Field, Grid, Pick, Row, Says, Tile, Working } from './parts';
import { addPerformer, faceOf, keepStill, retirePerformer, savePerformer, seedOf } from '@/lib/data';
import { make, registerCharacter } from '@/lib/generate';
import FromMine, { PLAIN_PORTRAIT } from './FromMine';
import type { Library } from './Studio';
import type { Identity } from '@/lib/types';
import VoicePanel from './VoicePanel';

/* The angles, as sentences rather than as words.
 *
 * "three quarter" is not an instruction a generation model can follow; a
 * sentence that describes where the camera is standing is. Each of these is
 * sent verbatim, and is editable before it goes, because the only way to
 * learn what this provider answers to is to see exactly what was asked. */
const ANGLES: { key: string; label: string; line: string }[] = [
  { key: 'front', label: 'Straight on', line: 'Camera straight on at eye level, her face square to the lens, neutral studio light.' },
  { key: 'three_quarter', label: 'Three quarter', line: 'Camera at eye level, turned about forty degrees off centre so one cheekbone catches the light.' },
  { key: 'near_profile', label: 'Near profile', line: 'Camera almost side on at eye level, showing the line of her nose and jaw against the background.' },
  { key: 'low', label: 'From below', line: 'Camera low, a little below chest height, tilted up at her, so she reads taller than the lens.' },
  { key: 'high', label: 'From above', line: 'Camera a head above her, tilted down, her chin lifted towards the lens.' },
  { key: 'full', label: 'Full length', line: 'Camera back far enough for her whole body in frame, feet included, standing.' },
  { key: 'waist', label: 'Waist up', line: 'Camera framing her from the waist up, arms visible.' },
  { key: 'close', label: 'Close up', line: 'Camera close, her head and shoulders filling the frame.' },
];

export default function CastRoom({ lib }: { lib: Library }) {
  const [who, setWho] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const picked = lib.cast.find((c) => c.id === who) || null;

  if (adding) return <NewPerformer lib={lib} onDone={(id) => { setAdding(false); setWho(id); }} onCancel={() => setAdding(false)} />;
  if (picked) return <Sheet lib={lib} who={picked} onBack={() => setWho(null)} />;

  return (
    <>
      <Eyebrow>Pornstars</Eyebrow>
      <Title lead="Who is" gold="on camera" />
      <Lead>
        Everyone the studio can film. The first picture of a performer makes her;
        every picture after it is an edit of that one, which is what keeps the
        same face across a whole shoot.
      </Lead>

      <Row>
        <Btn kind="gold" onClick={() => setAdding(true)}>Add a performer</Btn>
      </Row>

      <div style={{ marginTop: 22 }}>
        {lib.cast.length === 0 ? (
          <Empty>Nobody on the books yet. Add a performer and shoot her first picture.</Empty>
        ) : (
          <Grid min={226}>
            {lib.cast.map((c) => {
              const stills = lib.assets.filter((a) => a.identity_id === c.id).length;
              const seeded = Boolean(seedOf(lib.assets, c.id));
              return (
                <Tile
                  key={c.id}
                  title={c.name}
                  src={faceOf(lib.assets, c.id)}
                  badge={seeded ? null : 'no seed'}
                  tone={seeded ? undefined : 'warn'}
                  note={seeded
                    ? `${stills} ${stills === 1 ? 'still' : 'stills'}${c.provider_character_id ? ', registered' : ''}${c.voice_id ? '' : ' - no voice yet'}`
                    : 'Not anchored yet. Shoot her first picture.'}
                  onClick={() => setWho(c.id)}
                />
              );
            })}
          </Grid>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------- */

function NewPerformer({ lib, onDone, onCancel }: {
  lib: Library; onDone: (id: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [look, setLook] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);

  const add = async () => {
    setBusy('add'); setSays(null);
    try {
      const made = await addPerformer(name.trim(), look.trim());
      await lib.reload();
      onDone(made.id);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'She could not be added.');
      setBusy(null);
    }
  };

  /**
   * Make her out of pictures he already has, in one press.
   *
   * THE DRAWING HAPPENS BEFORE SHE EXISTS, AND THAT ORDER IS THE POINT.
   *
   * Creating the performer first and then drawing would leave a nameless
   * empty performer on the books every time the provider refused a
   * photograph - and it refuses them for real reasons, like a face it will
   * not redraw. So the picture is made against nobody, and only once it
   * exists is she created and the picture filed under her as her anchor.
   * A failure here leaves the books exactly as they were.
   */
  const fromMine = async (referenceImage: string, words: string) => {
    if (!name.trim()) throw new Error('Give her a name first - the picture gets filed under it.');
    setBusy('mine'); setSays(null);
    try {
      const shot = await make({
        what: 'still',
        prompt: [look.trim(), words || PLAIN_PORTRAIT].filter(Boolean).join(' '),
        identity_id: null,
        reference_image: referenceImage,
        label: `${name.trim()}_from_mine`,
        aspect: '9:16',
      });

      const her = await addPerformer(name.trim(), look.trim());
      await keepStill({
        identityId: her.id,
        spicyUrl: shot.provider_url,
        ourUrl: shot.url,
        storagePath: shot.path,
        label: 'From my own picture',
        angle: 'from_mine',
        masterRef: true,
        extra: { from: 'upload' },
      });
      await lib.reload();
      onDone(her.id);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'She could not be made from that.');
      setBusy(null);
      throw e;
    }
  };

  return (
    <>
      <Eyebrow>Pornstars</Eyebrow>
      <Title lead="A new" gold="performer" />
      <Lead>
        Two ways to make her: describe her in words, or upload pictures of
        somebody and have the studio draw her from them. Either way she needs
        a name and a line about the look - that is the part a picture cannot
        carry on its own.
      </Lead>
      <Panel style={{ marginBottom: 18 }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <Field label="Name" value={name} onChange={setName} placeholder="What you will call her" />
          <Area
            label="The look"
            value={look}
            onChange={setLook}
            rows={7}
            placeholder="A 27-year-old woman, 5'7&quot;, athletic build..."
            hint="Written once and sent with every shot. It never overrides the picture - once she has a first still, the picture decides the face and this fills in the rest."
          />
          <Row>
            <Btn kind="gold" onClick={add} disabled={busy !== null || !name.trim()}>
              {busy === 'add' ? 'Adding' : 'Add her'}
            </Btn>
            <Btn kind="quiet" onClick={onCancel} disabled={busy !== null}>Back</Btn>
          </Row>
          <Says text={says} />
        </div>
      </Panel>

      <Panel>
        <Eyebrow>Or build her from pictures I already have</Eyebrow>
        <p style={{ margin: '8px 0 14px', fontSize: 14, color: T.textMuted, lineHeight: 1.7, maxWidth: '62ch' }}>
          Upload stills or a clip. The first picture that comes back is hers,
          and it becomes her anchor - every shot after it holds that face.
          Nothing is added to the books unless the picture works.
        </p>
        <FromMine name={name} busy={busy !== null} onMade={fromMine} />
        {busy === 'mine' ? <Working>Drawing her. About half a minute.</Working> : null}
      </Panel>
    </>
  );
}

/* ---------------------------------------------------------------------- */

function Sheet({ lib, who, onBack }: { lib: Library; who: Identity; onBack: () => void }) {
  const [look, setLook] = useState(who.identity_lock_prompt || '');
  const [angle, setAngle] = useState(ANGLES[1].key);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const seed = seedOf(lib.assets, who.id);
  const mine = useMemo(
    () => lib.assets.filter((a) => a.identity_id === who.id),
    [lib.assets, who.id],
  );

  /* THE PROMPT, SHOWN RATHER THAN DESCRIBED.
   * Justin asked to see the angle of the shot as it is actually sent. This
   * is that string, built from the three parts, and it is editable before it
   * goes out. */
  const angleLine = ANGLES.find((a) => a.key === angle)?.line || '';
  const [edited, setEdited] = useState<string | null>(null);
  const assembled = [
    seed ? null : look.trim(),
    angleLine,
    extra.trim() || null,
  ].filter(Boolean).join(' ');
  const prompt = edited ?? assembled;

  const saveLook = async () => {
    setBusy('look'); setSays(null); setOk(null);
    try {
      await savePerformer(who.id, { identity_lock_prompt: look });
      await lib.reload();
      setOk('Saved.');
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That could not be saved.');
    } finally { setBusy(null); }
  };

  const shoot = async () => {
    setBusy('shoot'); setSays(null); setOk(null);
    try {
      const made = await make({
        what: 'still',
        prompt,
        identity_id: who.id,
        character: who.provider_character_id,
        seed_url: seed,
        label: `${who.name}_${angle}`,
        aspect: '9:16',
      });
      await keepStill({
        identityId: who.id,
        spicyUrl: made.provider_url,
        ourUrl: made.url,
        storagePath: made.path,
        label: ANGLES.find((a) => a.key === angle)?.label || angle,
        angle,
        /* The FIRST picture is the one everything else anchors on, so it is
         * the master reference. Later ones are edits of it and are not. */
        masterRef: !seed,
      });
      await lib.reload();
      setEdited(null);
      setOk(seed ? 'Shot and kept.' : 'She is anchored now. Every picture from here is an edit of this one.');
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'The picture could not be made.');
    } finally { setBusy(null); }
  };

  /* HER OWN PICTURES, AS THE PROVIDER'S OWN URLS.
   * Only these can be used to register her, because the provider only
   * accepts urls it minted for this account. */
  const hersAtTheProvider = mine
    .map((a) => (typeof a.meta?.spicy_url === 'string' ? a.meta.spicy_url : null))
    .filter((u): u is string => Boolean(u));

  /**
   * Build her from a photograph or a frame of a video.
   *
   * This is a DIFFERENT route from shooting her: the provider will not edit
   * an uploaded picture, so this asks it to draw a new person who looks
   * like the one in the frame. Everything after it is ordinary.
   */
  const fromMine = async (referenceImage: string, words: string) => {
    setBusy('mine'); setSays(null); setOk(null);
    try {
      const made = await make({
        what: 'still',
        prompt: [look.trim(), words || PLAIN_PORTRAIT].filter(Boolean).join(' '),
        identity_id: who.id,
        reference_image: referenceImage,
        label: `${who.name}_from_mine`,
        aspect: '9:16',
      });
      await keepStill({
        identityId: who.id,
        spicyUrl: made.provider_url,
        ourUrl: made.url,
        storagePath: made.path,
        label: 'From my own picture',
        angle: 'from_mine',
        masterRef: !seed,
        extra: { from: 'upload' },
      });
      await lib.reload();
      setOk(seed
        ? 'Kept. Make it the anchor below if that is the one she should look like.'
        : 'That is her now. Every picture from here holds that face.');
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'She could not be made from that.');
      throw e;
    } finally { setBusy(null); }
  };

  /**
   * Register her with the provider.
   *
   * Up to three of her own pictures become a character, and the id that
   * comes back goes on every picture AND every clip from then on. The edit
   * chain only ever worked on stills; this is the only thing that holds a
   * face through motion.
   */
  const lockIn = async () => {
    setBusy('lock'); setSays(null); setOk(null);
    try {
      const id = await registerCharacter(who.name, hersAtTheProvider.slice(0, 3));
      await savePerformer(who.id, { provider_character_id: id });
      await lib.reload();
      setOk('She is registered. Every picture and every clip names her now, instead of hoping she comes out the same.');
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'She could not be registered.');
    } finally { setBusy(null); }
  };

  const putAway = async () => {
    setBusy('away'); setSays(null);
    try {
      await retirePerformer(who.id);
      await lib.reload();
      onBack();
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'She could not be put away.');
      setBusy(null);
    }
  };

  const makeSeed = async (assetId: string) => {
    setBusy(assetId); setSays(null); setOk(null);
    try {
      await Promise.all([
        ...mine.filter((a) => a.is_master_ref && a.id !== assetId)
          .map((a) => supaUpdateMaster(a.id, false)),
        supaUpdateMaster(assetId, true),
      ]);
      await lib.reload();
      setOk('That picture is the anchor now. Every new shot is an edit of it.');
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That could not be set as the anchor.');
    } finally { setBusy(null); }
  };

  return (
    <>
      <Row>
        <Btn kind="quiet" onClick={onBack}>All performers</Btn>
      </Row>
      <div style={{ marginTop: 14 }}>
        <Eyebrow>{seed ? 'Anchored' : 'Not anchored yet'}</Eyebrow>
        <Title lead={who.name} />
      </div>

      {!seed ? (
        <Panel tone="warn" style={{ marginBottom: 18 }}>
          <p style={{ margin: 0, fontSize: 15, color: T.onWarn, lineHeight: 1.6 }}>
            She has no first picture, so this next shot will MAKE her. The look
            below is the only thing deciding what she turns out to be. Once it
            is shot, every picture after it is an edit of that one and the
            words stop deciding the face.
          </p>
        </Panel>
      ) : null}

      <VoicePanel
        who={who}
        voiceLabel={lib.voices.find((v) => v.id === who.voice_id)?.label ?? null}
        onChanged={lib.reload}
      />

      <Panel style={{ marginBottom: 18 }} tone={who.provider_character_id ? 'lit' : 'plain'}>
        <Eyebrow>{who.provider_character_id ? 'Registered with the provider' : 'Not registered yet'}</Eyebrow>
        <p style={{ margin: '0 0 14px', fontSize: 15, color: T.textMuted, lineHeight: 1.65 }}>
          {who.provider_character_id
            ? 'Every picture and every clip names her, so the face is held by reference rather than by resemblance. This is the only thing that holds a face through motion.'
            : hersAtTheProvider.length
              ? `Registering her turns ${Math.min(3, hersAtTheProvider.length)} of her pictures into a character the provider knows by name. It costs about the price of one picture, and it is what stops her drifting in video.`
              : 'She needs at least one picture made in the studio before she can be registered.'}
        </p>
        {!who.provider_character_id ? (
          <Btn kind="gold" onClick={lockIn} disabled={busy !== null || hersAtTheProvider.length === 0}>
            {busy === 'lock' ? 'Registering' : 'Lock her in'}
          </Btn>
        ) : null}
      </Panel>

      <Panel style={{ marginBottom: 18 }}>
        <Eyebrow>Build her from my own</Eyebrow>
        <FromMine name={who.name} busy={busy !== null} onMade={fromMine} />
        {busy === 'mine' ? <Working>Drawing her. About half a minute.</Working> : null}
      </Panel>

      <Panel style={{ marginBottom: 18 }}>
        <Area
          label="The look"
          value={look}
          onChange={(v) => { setLook(v); setOk(null); }}
          rows={6}
          hint="Sent with every shot. Once she is anchored, the picture decides the face and this fills in the rest."
        />
        <div style={{ marginTop: 12 }}>
          <Btn onClick={saveLook} disabled={busy === 'look' || look === (who.identity_lock_prompt || '')}>
            {busy === 'look' ? 'Saving' : 'Save the look'}
          </Btn>
        </div>
      </Panel>

      <Panel style={{ marginBottom: 18 }}>
        <Eyebrow>Shoot a still</Eyebrow>
        <div style={{ display: 'grid', gap: 16 }}>
          <Pick
            label="Where the camera is"
            value={angle}
            onChange={(v) => { setAngle(v); setEdited(null); }}
            options={ANGLES.map((a) => ({ value: a.key, label: a.label }))}
          />
          <Field
            label="Anything else in this shot"
            value={extra}
            onChange={(v) => { setExtra(v); setEdited(null); }}
            placeholder="what she is wearing, what she is doing, the light"
          />
          <Area
            label="What gets sent"
            value={prompt}
            onChange={setEdited}
            rows={4}
            hint={seed
              ? 'An edit of her anchor picture. The look is not repeated here because the picture already carries it.'
              : 'The look plus the camera, because there is no picture to edit yet.'}
          />
          <Row>
            <Btn kind="gold" onClick={shoot} disabled={busy === 'shoot' || !prompt.trim()}>
              {busy === 'shoot' ? 'Shooting' : seed ? 'Shoot it' : 'Make her'}
            </Btn>
            {edited !== null ? <Btn kind="quiet" onClick={() => setEdited(null)}>Put the wording back</Btn> : null}
          </Row>
          {busy === 'shoot' ? <Working>Waiting on the provider. This is about half a minute.</Working> : null}
          <Says text={says} />
          <Says text={ok} tone="ok" />
        </div>
      </Panel>

      <Eyebrow>Her pictures</Eyebrow>
      {mine.length === 0 ? (
        <Empty>No pictures of her yet.</Empty>
      ) : (
        <Grid min={200}>
          {mine.map((a) => (
            <Tile
              key={a.id}
              title={a.label || a.angle || 'Still'}
              src={a.public_url}
              picked={a.is_master_ref}
              badge={a.is_master_ref ? 'anchor' : null}
              note={new Date(a.created_at).toLocaleDateString()}
              footer={a.is_master_ref ? null : (
                <Btn kind="quiet" onClick={() => makeSeed(a.id)} disabled={busy === a.id}>
                  {busy === a.id ? 'Setting' : 'Make this the anchor'}
                </Btn>
              )}
            />
          ))}
        </Grid>
      )}

      <div style={{ marginTop: 30, paddingTop: 20, borderTop: `1px solid ${T.lineSoft}` }}>
        <Btn kind="quiet" onClick={putAway} disabled={busy === 'away'}>
          {busy === 'away' ? 'Putting away' : 'Put her away'}
        </Btn>
        <span style={{ display: 'block', fontSize: 13, color: T.textDim, marginTop: 8, lineHeight: 1.6 }}>
          Nothing is destroyed. Her pictures and her shoots all stay; she just
          comes off the list.
        </span>
      </div>
    </>
  );
}

/** Setting the anchor is the only write in this room that is not in data.ts,
 *  because it is the only one that touches a single column on a still. */
async function supaUpdateMaster(assetId: string, on: boolean): Promise<void> {
  const { supa } = await import('@/lib/supabase');
  const { error } = await supa().from('adult_assets').update({ is_master_ref: on }).eq('id', assetId);
  if (error) throw new Error(`The anchor could not be changed: ${error.message}`);
}

'use client';

// components/ScreenTest.tsx
//
// SEEING HER MOVE BEFORE COMMITTING TO HER.
//
// "i built her but there is no option of a screen test to lock it in."
//
// Registering a performer is the decision that everything after it
// inherits: every picture and every clip from then on names her instead
// of resembling her, and changing her mind later means doing the whole
// build again. Making that decision off three still photographs is making
// it half blind - a face can hold perfectly still and come apart the
// moment it turns.
//
// So: five seconds of her moving, and her own voice saying a line, before
// the button that locks it in. Same question a real screen test asks, and
// the answer costs one clip.
//
// THE SOUND IS BESIDE THE PICTURE, NOT IN IT.
//
// Nothing here lip syncs, and pretending otherwise by muxing her voice
// onto the clip would make her look dubbed - which tells him something
// false about the performer rather than something true. They play
// together and are plainly two things.

import { useEffect, useRef, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn, Eyebrow, Panel } from './kit';
import { Area, Row, Says, Working } from './parts';
import { make } from '@/lib/generate';
import { keepStill, token } from '@/lib/data';

/** What she does in the test. Deliberately ordinary: a performer who
 *  holds together through a slow turn and a blink holds together through
 *  anything, and anything more athletic tests the renderer rather than
 *  the face. */
const MOVEMENT =
  'She turns her head slowly from one side to the other and back, blinks, and gives a small natural smile. The camera does not move. Plain backdrop, even light.';

const LINE = 'Hey. I was wondering when you were going to call me.';

export default function ScreenTest({ who, seed, character, canLock, locked, onLock, onKept }: {
  who: { id: string; name: string; voice_id: string | null; identity_lock_prompt: string | null };
  /** Her anchor picture at the provider, which the clip is built from. */
  seed: string | null;
  /** Her chr_ id, when she already has one. */
  character: string | null;
  canLock: boolean;
  locked: boolean;
  onLock: () => Promise<void>;
  onKept: () => Promise<void>;
}) {
  const [line, setLine] = useState(LINE);
  const [clip, setClip] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { if (audio.current) audio.current.pause(); }, []);

  const run = async () => {
    if (!seed && !character) {
      setSays('She has no anchor picture at the provider yet, so there is nothing to put in motion. Make her first.');
      return;
    }
    setBusy('clip'); setSays(null); setOk(null); setClip(null); setHeard(null);
    try {
      const made = await make({
        what: 'clip',
        prompt: [who.identity_lock_prompt || '', MOVEMENT].filter(Boolean).join(' '),
        identity_id: who.id,
        character,
        seed_url: seed,
        label: `${who.name}_screen_test`,
        duration: 5,
      });
      /* Kept rather than shown and lost. A screen test is the one clip
       * worth having again later, because it is the evidence for the
       * decision it is about to be used for. */
      await keepStill({
        identityId: who.id,
        kind: 'video',
        spicyUrl: made.provider_url,
        ourUrl: made.url,
        storagePath: made.path,
        label: 'Screen test',
        angle: 'screen_test',
      });
      setClip(made.url);
      await onKept();

      /* Her voice, if she has one. A failure here does not spoil the
       * clip - it says so and leaves the picture standing. */
      if (who.voice_id && line.trim()) {
        try {
          const jwt = await token();
          const res = await fetch('/api/voice', {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
            body: JSON.stringify({ doing: 'say', identity_id: who.id, text: line.trim() }),
          });
          const said = await res.json().catch(() => null) as Record<string, unknown> | null;
          if (!res.ok) throw new Error((said?.error as string) || `She could not say the line (${res.status}).`);
          setHeard(String(said?.url || ''));
        } catch (e) {
          setSays(`The clip is here, but her voice would not read the line: ${e instanceof Error ? e.message : 'no reason given'}`);
        }
      }
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'The screen test could not be shot.');
    } finally { setBusy(null); }
  };

  const lock = async () => {
    setBusy('lock'); setSays(null); setOk(null);
    try {
      await onLock();
      setOk('She is registered. Every picture and every clip names her now, instead of hoping she comes out the same.');
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'She could not be registered.');
    } finally { setBusy(null); }
  };

  const playLine = () => {
    if (!heard) return;
    if (audio.current) audio.current.pause();
    const a = new Audio(heard);
    audio.current = a;
    void a.play().catch(() => setSays('The browser blocked the sound. Click the page and press it again.'));
  };

  return (
    <Panel style={{ marginBottom: 18 }} tone={locked ? 'lit' : 'plain'}>
      <Eyebrow>{locked ? 'Screen test' : 'Screen test, then lock her in'}</Eyebrow>

      <p style={{ margin: '8px 0 14px', fontSize: 14, color: T.textMuted, lineHeight: 1.7, maxWidth: '62ch' }}>
        Five seconds of her moving, and her own voice reading a line. A face
        can hold perfectly still in three photographs and come apart the
        moment it turns, and registering her is the decision everything
        after it inherits - so it is worth one clip to look first.
      </p>

      {who.voice_id ? (
        <Area
          label="The line she reads"
          value={line}
          onChange={setLine}
          rows={2}
          hint="Her own words tell you whether it is her. Leave it blank for a silent test."
        />
      ) : (
        <p style={{ margin: '0 0 14px', fontSize: 13, color: T.warn, lineHeight: 1.6 }}>
          She has no voice yet, so this will be a silent test. Give her one
          above and the line comes with it.
        </p>
      )}

      <Row>
        <Btn kind="gold" onClick={run} disabled={busy !== null}>
          {busy === 'clip' ? 'Shooting it' : clip ? 'Shoot it again' : 'Run a screen test'}
        </Btn>
      </Row>

      {busy === 'clip' ? <Working>Putting her in motion. A couple of minutes.</Working> : null}

      {clip ? (
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <video
            src={clip}
            controls
            autoPlay
            loop
            muted
            playsInline
            style={{
              width: '100%', maxWidth: 360, borderRadius: 12,
              border: `1px solid ${T.line}`, background: T.ink, display: 'block',
            }}
          />
          {heard ? (
            <Row>
              <Btn kind="quiet" onClick={playLine}>Hear her say it</Btn>
            </Row>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.lineSoft}` }}>
        {locked ? (
          <p style={{ margin: 0, fontSize: 14, color: T.gold, lineHeight: 1.7 }}>
            She is registered. Every picture and every clip names her.
          </p>
        ) : (
          <>
            <Row>
              <Btn kind="gold" onClick={lock} disabled={busy !== null || !canLock}>
                {busy === 'lock' ? 'Locking her in' : 'That is her - lock her in'}
              </Btn>
            </Row>
            {!canLock ? (
              <p style={{ margin: '10px 0 0', fontSize: 13, color: T.warn, lineHeight: 1.6, maxWidth: '62ch' }}>
                None of her pictures came from the provider yet, and those are
                the only ones it will build a character from. Make her from a
                photograph or shoot her a still first.
              </p>
            ) : null}
          </>
        )}
      </div>

      <Says text={says} />
      <Says text={ok} tone="ok" />
    </Panel>
  );
}

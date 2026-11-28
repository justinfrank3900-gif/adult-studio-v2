'use client';

// components/VoicePanel.tsx
//
// HOW SHE SOUNDS.
//
// An audition, not a design. The provider's voice-building-from-a-
// description is paused on their side, and it turns out not to matter:
// they publish a long list of ready voices, so the studio types the line
// SHE would say and plays it through as many of them as you like. That is
// the same question - "is that her" - answered faster, because there is
// nothing to build before you can listen.
//
// One line, read by every voice you press, is deliberate. Judging a voice
// on a stock sentence tells you nothing about whether it is hers; judging
// it on her own words tells you immediately.

import { useCallback, useEffect, useRef, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn, Eyebrow, Panel } from './kit';
import { Area, Row, Says, Working } from './parts';
import { token } from '@/lib/data';
import type { Identity } from '@/lib/types';

type Choice = {
  id: string;
  name: string;
  kind: string;
  model: string;
  directable: boolean;
};

const LINE = 'Hey. I was wondering when you were going to message me. Come here, I want to tell you something.';

export default function VoicePanel({
  who, voiceLabel, onChanged,
}: {
  who: Identity;
  voiceLabel: string | null;
  onChanged: () => Promise<void>;
}) {
  const [line, setLine] = useState(LINE);
  const [direction, setDirection] = useState('');
  const [voices, setVoices] = useState<Choice[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [heard, setHeard] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);
  /* WHICH ROW WENT WRONG, NOT JUST THAT SOMETHING DID.
   *
   * The refusal used to print once, underneath the whole list. Press Hear
   * it on the ninth of forty-five voices and the answer appeared several
   * screens below the button - which is indistinguishable from nothing
   * happening, and is exactly what it looked like. */
  const [rowSays, setRowSays] = useState<{ id: string; message: string } | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const hasVoice = Boolean(voiceLabel);

  const post = useCallback(async <T,>(payload: Record<string, unknown>): Promise<T> => {
    const jwt = await token();
    const res = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ identity_id: who.id, ...payload }),
    });
    const said = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!res.ok) throw new Error((said?.error as string) || `The studio refused that (${res.status}). Nothing was spent.`);
    return said as T;
  }, [who.id]);

  useEffect(() => () => { if (audio.current) audio.current.pause(); }, []);

  const play = (src: string, tag: string) => {
    if (!src) {
      setSays('The provider gave no sound back for that one, so there is nothing to play.');
      return;
    }
    if (audio.current) { audio.current.pause(); audio.current = null; }
    const a = new Audio(src);
    audio.current = a;
    setPlaying(tag);
    a.onended = () => setPlaying(null);
    a.onerror = () => { setPlaying(null); setSays('That clip would not play in this browser.'); };
    void a.play().catch(() => {
      setPlaying(null);
      setSays('The browser blocked the sound. Click anywhere on the page and press it again.');
    });
  };

  const fetchVoices = async () => {
    setBusy('list'); setSays(null); setOk(null);
    try {
      const got = await post<{ voices: Choice[] }>({ doing: 'voices' });
      setVoices(got.voices || []);
      if (!got.voices?.length) setSays('The provider listed no voices on this account.');
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'The voices could not be read.');
    } finally { setBusy(null); }
  };

  /** One voice, reading her line. Kept so pressing it twice costs nothing. */
  const audition = async (v: Choice) => {
    const cached = heard[`${v.id}|${line}|${direction}`];
    if (cached) { play(cached, v.id); return; }

    setBusy(v.id); setSays(null); setRowSays(null);
    try {
      const made = await post<{ url: string }>({
        doing: 'say',
        voice: v.id,
        model: v.model,
        text: line,
        instructions: v.directable ? direction : '',
      });
      setHeard((h) => ({ ...h, [`${v.id}|${line}|${direction}`]: made.url }));
      play(made.url, v.id);
    } catch (e) {
      setRowSays({ id: v.id, message: e instanceof Error ? e.message : 'That voice could not read it.' });
    } finally { setBusy(null); }
  };

  const keep = async (v: Choice) => {
    setBusy(`keep:${v.id}`); setSays(null); setOk(null);
    try {
      await post({
        doing: 'keep',
        voice: v.id,
        model: v.model,
        name: `${who.name} - ${v.name}`,
        instructions: v.directable ? direction : '',
      });
      setVoices(null);
      await onChanged();
      setOk(`That is ${who.name} now. Every line she speaks uses it.`);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That voice could not be kept.');
    } finally { setBusy(null); }
  };

  const speakHers = async () => {
    setBusy('hers'); setSays(null); setOk(null);
    try {
      const made = await post<{ url: string }>({ doing: 'say', text: line });
      play(made.url, 'hers');
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'She could not say that.');
    } finally { setBusy(null); }
  };

  const shown = voices ? (showAll ? voices : voices.slice(0, 12)) : [];

  return (
    <Panel tone={hasVoice ? 'plain' : 'warn'} style={{ marginBottom: 18 }}>
      <Eyebrow>{hasVoice ? 'Her voice' : 'She has no voice yet'}</Eyebrow>

      {hasVoice ? (
        <p style={{ margin: '0 0 16px', fontSize: 15, color: T.textMuted, lineHeight: 1.6 }}>{voiceLabel}</p>
      ) : (
        <p style={{ margin: '0 0 16px', fontSize: 15, color: T.onWarn, lineHeight: 1.6 }}>
          Until she has one, nothing can speak her lines - and a screen test
          will refuse rather than read her in a stand-in, because every
          stand-in on the account is a man.
        </p>
      )}

      <div style={{ display: 'grid', gap: 14 }}>
        <Area
          label="The line she says"
          value={line}
          onChange={setLine}
          rows={2}
          hint="Every voice below reads this. Her own words tell you whether it is her; a stock sentence does not."
        />

        <Row>
          {hasVoice ? (
            <Btn kind="gold" onClick={speakHers} disabled={busy !== null || !line.trim()}>
              {busy === 'hers' ? 'Speaking' : playing === 'hers' ? 'Playing' : 'Say it'}
            </Btn>
          ) : null}
          <Btn
            kind={hasVoice ? 'ghost' : 'gold'}
            onClick={voices ? () => setVoices(null) : fetchVoices}
            disabled={busy === 'list'}
          >
            {busy === 'list' ? 'Reading the list' : voices ? 'Close the list' : hasVoice ? 'Try a different voice' : 'Find her voice'}
          </Btn>
        </Row>

        {busy === 'list' ? <Working>Asking the provider which voices this account has.</Working> : null}

        {voices ? (
          <>
            <Area
              label="How she should say it"
              value={direction}
              onChange={setDirection}
              rows={2}
              placeholder="slower, lower, like she is standing very close"
              hint="Only some voices take written direction - those say so. The rest ignore it."
            />

            <div style={{
              fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', color: T.textDim,
              textTransform: 'uppercase', marginTop: 4,
            }}>
              {voices.length} voices - press one to hear your line
            </div>

            <div style={{ display: 'grid', gap: 9 }}>
              {shown.map((v) => (
                <div
                  key={v.id}
                  style={{
                    display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
                    background: T.raised, border: `1px solid ${playing === v.id ? T.gold : T.line}`,
                    borderRadius: 12, padding: '11px 14px',
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 700, flex: '1 1 130px', minWidth: 0 }}>
                    {v.name}
                    {v.directable ? (
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 400, color: T.textDim, marginTop: 2 }}>
                        takes direction
                      </span>
                    ) : null}
                  </span>
                  <Btn onClick={() => audition(v)} disabled={busy !== null || !line.trim()}>
                    {busy === v.id ? 'Reading' : playing === v.id ? 'Playing' : 'Hear it'}
                  </Btn>
                  <Btn kind="gold" onClick={() => keep(v)} disabled={busy !== null}>
                    {busy === `keep:${v.id}` ? 'Keeping' : 'This is her'}
                  </Btn>
                  {rowSays?.id === v.id ? (
                    <span style={{
                      flexBasis: '100%', fontSize: 13, color: T.warn, lineHeight: 1.6,
                    }}>
                      {rowSays.message}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            {voices.length > shown.length ? (
              <Row>
                <Btn kind="quiet" onClick={() => setShowAll(true)}>
                  Show the other {voices.length - shown.length}
                </Btn>
              </Row>
            ) : null}
          </>
        ) : null}

        <Says text={says} />
        <Says text={ok} tone="ok" />
      </div>
    </Panel>
  );
}

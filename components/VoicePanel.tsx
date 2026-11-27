'use client';

// components/VoicePanel.tsx
//
// HOW SHE SOUNDS.
//
// There is nobody to record, so the voice is DESIGNED from a description
// rather than cloned from audio. Four are built at once and played back
// side by side, because one option is not a choice - and a voice is the
// thing people disagree with themselves about until they hear the
// alternative.
//
// It is four buttons and not a waveform on purpose. The only question that
// matters here is "is that her", and nobody answers that by looking.

import { useRef, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn, Eyebrow, Panel } from './kit';
import { Area, Row, Says, Working } from './parts';
import { token } from '@/lib/data';
import type { Identity } from '@/lib/types';

type Preview = { generated_voice_id: string; audio_base_64: string };

export default function VoicePanel({
  who, voiceLabel, onChanged,
}: {
  who: Identity;
  /** What her voice is called, or null when she has none. */
  voiceLabel: string | null;
  onChanged: () => Promise<void>;
}) {
  const [description, setDescription] = useState('');
  const [direction, setDirection] = useState('');
  const [line, setLine] = useState('Hey. I was wondering when you were going to message me.');
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const hasVoice = Boolean(voiceLabel);

  const post = async (payload: Record<string, unknown>) => {
    const jwt = await token();
    const res = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ identity_id: who.id, ...payload }),
    });
    if (!res.ok) {
      const said = await res.json().catch(() => null) as { error?: string } | null;
      throw new Error(said?.error || `The studio refused that (${res.status}). Nothing was spent.`);
    }
    return res;
  };

  const play = (src: string, tag: string) => {
    if (audio.current) { audio.current.pause(); audio.current = null; }
    const a = new Audio(src);
    audio.current = a;
    setPlaying(tag);
    a.onended = () => setPlaying(null);
    a.onerror = () => { setPlaying(null); setSays('That clip would not play in this browser.'); };
    void a.play().catch(() => {
      setPlaying(null);
      setSays('The browser blocked the sound. Click anywhere on the page and try again.');
    });
  };

  const design = async () => {
    setBusy('design'); setSays(null); setOk(null); setPreviews([]);
    try {
      const res = await post({ doing: 'design', description });
      const body = await res.json() as { previews: Preview[] };
      setPreviews(body.previews || []);
      if (!body.previews?.length) setSays('ElevenLabs came back with nothing to listen to.');
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'The voices could not be made.');
    } finally { setBusy(null); }
  };

  const change = async () => {
    setBusy('remix'); setSays(null); setOk(null); setPreviews([]);
    try {
      const res = await post({ doing: 'remix', direction });
      const body = await res.json() as { previews: Preview[] };
      setPreviews(body.previews || []);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That change could not be made.');
    } finally { setBusy(null); }
  };

  const keep = async (p: Preview) => {
    setBusy(p.generated_voice_id); setSays(null); setOk(null);
    try {
      await post({
        doing: 'keep',
        generated_voice_id: p.generated_voice_id,
        description: description.trim() || direction.trim(),
        name: `${who.name} - her voice`,
      });
      setPreviews([]);
      setDirection('');
      await onChanged();
      setOk(`That is ${who.name} now. Every line she speaks uses it.`);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That voice could not be kept.');
    } finally { setBusy(null); }
  };

  const speak = async () => {
    setBusy('say'); setSays(null); setOk(null);
    try {
      const res = await post({ doing: 'say', text: line });
      const blob = await res.blob();
      play(URL.createObjectURL(blob), 'say');
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'She could not say that.');
    } finally { setBusy(null); }
  };

  return (
    <Panel tone={hasVoice ? 'plain' : 'warn'} style={{ marginBottom: 18 }}>
      <Eyebrow>{hasVoice ? 'Her voice' : 'She has no voice yet'}</Eyebrow>

      {!hasVoice ? (
        <p style={{ margin: '0 0 16px', fontSize: 15, color: T.onWarn, lineHeight: 1.6 }}>
          Until she has one, nothing can speak her lines - and a screen test
          will refuse rather than read her in a stand-in voice, because every
          stand-in on the account is a man.
        </p>
      ) : (
        <p style={{ margin: '0 0 16px', fontSize: 15, color: T.textMuted, lineHeight: 1.6 }}>
          {voiceLabel}
        </p>
      )}

      {hasVoice ? (
        <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
          <Area
            label="Hear her say something"
            value={line}
            onChange={setLine}
            rows={2}
          />
          <Row>
            <Btn kind="gold" onClick={speak} disabled={busy !== null || !line.trim()}>
              {busy === 'say' ? 'Speaking' : playing === 'say' ? 'Playing' : 'Say it'}
            </Btn>
          </Row>
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 14 }}>
        {hasVoice ? (
          <>
            <Area
              label="Change her voice"
              value={direction}
              onChange={setDirection}
              rows={2}
              placeholder="deeper, slower, less breathy"
              hint="Four versions of the voice she already has, built from what you asked for. Nothing changes until you pick one."
            />
            <Row>
              <Btn onClick={change} disabled={busy !== null || !direction.trim()}>
                {busy === 'remix' ? 'Building four' : 'Build four changes'}
              </Btn>
            </Row>
          </>
        ) : (
          <>
            <Area
              label="How she sounds"
              value={description}
              onChange={setDescription}
              rows={5}
              placeholder="Late twenties, warm and low, unhurried. A slight rasp. Canadian. Sounds like she is standing close to you rather than performing."
              hint="Age, pitch, pace, where she is from, and how she talks when she is being quiet. The more of it you write, the less of it is guessed."
            />
            <Row>
              <Btn kind="gold" onClick={design} disabled={busy !== null || !description.trim()}>
                {busy === 'design' ? 'Building four' : 'Build four voices'}
              </Btn>
            </Row>
          </>
        )}

        {busy === 'design' || busy === 'remix' ? (
          <Working>Making four of them. About half a minute.</Working>
        ) : null}

        {previews.length > 0 ? (
          <div>
            <div style={{
              fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', color: T.textDim,
              textTransform: 'uppercase', margin: '8px 0 12px',
            }}>
              Listen to all four before you pick
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {previews.map((p, i) => (
                <div
                  key={p.generated_voice_id}
                  style={{
                    display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
                    background: T.raised, border: `1px solid ${T.line}`,
                    borderRadius: 12, padding: '12px 14px',
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 700, minWidth: 74 }}>
                    Voice {i + 1}
                  </span>
                  <Btn
                    onClick={() => play(`data:audio/mpeg;base64,${p.audio_base_64}`, p.generated_voice_id)}
                  >
                    {playing === p.generated_voice_id ? 'Playing' : 'Hear it'}
                  </Btn>
                  <Btn
                    kind="gold"
                    onClick={() => keep(p)}
                    disabled={busy !== null}
                  >
                    {busy === p.generated_voice_id ? 'Keeping' : 'This is her'}
                  </Btn>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <Says text={says} />
        <Says text={ok} tone="ok" />
      </div>
    </Panel>
  );
}

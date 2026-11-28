'use client';

// components/CallPanel.tsx
//
// CALLING HER.
//
// Everything else in this studio is made and then looked at. This is the
// only thing that happens while you are in it, which changes what the
// screen is for: it is not a form, it is a status light. At any moment it
// has to answer three questions without being read - is she hearing me, is
// she talking, and what is this costing.
//
// WHAT IS SAID IS KEPT.
//
// Both sides of the call are written into the same messages the typing
// goes into, and hanging up asks her to update what she knows about him.
// Without that, a thirteen minute conversation is a thing that never
// happened the moment the line drops - which is the exact complaint every
// product in this category gets.

import { useCallback, useEffect, useRef, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn, Eyebrow, Panel } from './kit';
import { Pick, Row, Says } from './parts';
import { token } from '@/lib/data';
import { supa, DEALER_ID } from '@/lib/supabase';
import { call, type Line, type LineEvent } from '@/lib/line';

/* The two models, and the difference between them in money. Written out
 * because "spicy-live-2" tells nobody anything. */
const MODELS = [
  { value: 'spicy-live-1', label: 'Normal - about a penny a minute' },
  { value: 'spicy-live-2', label: 'The better voice - about 8c a minute' },
];

type Turn = { who: 'him' | 'her'; text: string };

type Voice = { id?: string; name?: string; kind?: string; models?: string[] };

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function CallPanel({ her, onMemory }: {
  her: { id: string; name: string; call_voice?: string | null; call_model?: string | null };
  /** Her notes, after she has written up the call. */
  onMemory: (memory: string) => void;
}) {
  const [on, setOn] = useState(false);
  const [state, setState] = useState<'ringing' | 'listening' | 'talking' | 'thinking'>('ringing');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [partial, setPartial] = useState<{ him: string; her: string }>({ him: '', her: '' });
  const [spent, setSpent] = useState(0);
  const [left, setLeft] = useState(0);
  const [muted, setMuted] = useState(false);
  const [says, setSays] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [odd, setOdd] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const [model, setModel] = useState(her.call_model || 'spicy-live-1');
  const [voice, setVoice] = useState(her.call_voice || '');
  const [voices, setVoices] = useState<Voice[] | null>(null);

  const line = useRef<Line | null>(null);
  const ends = useRef<number>(0);
  const saved = useRef<number>(0);
  const bottom = useRef<HTMLDivElement | null>(null);
  /* Read inside the event handler, which is created once per call - state
   * read there would be whatever it was when the call started. */
  const turnsNow = useRef<Turn[]>([]);
  const rolling = useRef(false);
  /* The event handler is built before these two are, and it needs both -
   * a closed line either rolls into a fresh one or is written up. Holding
   * them in refs is how that is said without putting the handler at the
   * bottom of the file, away from the events it explains. */
  const beginAgain = useRef<(carrying?: boolean) => Promise<void>>(async () => {});
  const writeUp = useRef<() => Promise<void>>(async () => {});

  useEffect(() => { turnsNow.current = turns; }, [turns]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [turns.length, partial]);

  /* The countdown. The provider ends a session at its own limit whatever
   * this says, so this is a warning, not a timer that does anything. */
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setLeft(Math.max(0, (ends.current - Date.now()) / 1000)), 500);
    return () => clearInterval(t);
  }, [on]);

  /* Hanging up by closing the tab still stops the microphone. */
  useEffect(() => () => { line.current?.hangUp(); }, []);

  const keep = useCallback(async (list: Turn[]) => {
    const fresh = list.slice(saved.current);
    if (!fresh.length) return;
    saved.current = list.length;
    const { error } = await supa().from('adult_messages').insert(
      fresh.map((t) => ({
        dealer_id: DEALER_ID,
        companion_id: her.id,
        role: t.who === 'him' ? 'user' : 'assistant',
        content: t.text,
        spoken: true,
      })),
    );
    if (error) {
      /* Said out loud rather than swallowed: a call that is not written
       * down is a call she will not remember, and he should know that
       * while he can still do something about it. */
      saved.current -= fresh.length;
      setSays(`What was said could not be written down: ${error.message}`);
    }
  }, [her.id]);

  const askFor = useCallback(async (payload: Record<string, unknown>) => {
    const jwt = await token();
    const res = await fetch('/api/call', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify(payload),
    });
    const said = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!res.ok) throw new Error((said?.error as string) || `The studio refused that (${res.status}).`);
    return said || {};
  }, []);

  const loadVoices = useCallback(async () => {
    if (voices) return;
    try {
      const got = await askFor({ doing: 'voices' });
      setVoices(Array.isArray(got.voices) ? got.voices as Voice[] : []);
    } catch {
      /* Not worth a red box. A call works without choosing a voice at all -
       * the provider uses its own. */
      setVoices([]);
    }
  }, [askFor, voices]);

  useEffect(() => { void loadVoices(); }, [loadVoices]);

  const handle = useCallback((e: LineEvent) => {
    switch (e.kind) {
      case 'ready':
        setState('listening');
        setOk(`Connected${e.voice ? ` - she is using ${e.voice}` : ''}. Talk.`);
        return;
      case 'listening': setState('listening'); setPartial((p) => ({ ...p, her: '' })); return;
      case 'thinking': setState('thinking'); return;
      case 'talking': setState('talking'); return;
      case 'heard': {
        if (!e.done) {
          setPartial((p) => ({ ...p, [e.who]: p[e.who] + e.text }));
          return;
        }
        const text = e.text.trim();
        setPartial((p) => ({ ...p, [e.who]: '' }));
        if (!text) return;
        setTurns((list) => {
          const next = [...list, { who: e.who, text }];
          void keep(next);
          return next;
        });
        return;
      }
      case 'spent': setSpent(e.total || 0); return;
      case 'trouble': setSays(e.message); return;
      case 'odd': setOdd((list) => (list.includes(e.name) ? list : [...list, e.name])); return;
      case 'expired': {
        /* THIRTEEN MINUTES IS THEIR LIMIT, NOT HIS.
         *
         * A second session is opened underneath him carrying what has been
         * said, so the call keeps going. She is told not to say hello
         * again, which is the giveaway that would otherwise make it
         * obvious something was restarted. */
        rolling.current = true;
        setOk('Still here - the line was renewed.');
        return;
      }
      case 'closed': {
        line.current = null;
        if (rolling.current) { rolling.current = false; void beginAgain.current(true); return; }
        setOn(false);
        setState('ringing');
        void writeUp.current();
        return;
      }
      default: return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keep]);

  const wrapUp = useCallback(async () => {
    if (turnsNow.current.length < 2) return;
    setBusy(true);
    try {
      const got = await askFor({ doing: 'remember', companion_id: her.id });
      if (typeof got.memory === 'string' && got.changed) {
        onMemory(got.memory);
        setOk('Call ended. She has written down what you talked about.');
      } else {
        setOk('Call ended.');
      }
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'She could not write up the call.');
    } finally { setBusy(false); }
  }, [askFor, her.id, onMemory]);

  const begin = useCallback(async (carrying = false) => {
    setBusy(true);
    if (!carrying) { setSays(null); setOk(null); setTurns([]); setPartial({ him: '', her: '' }); setSpent(0); saved.current = 0; }
    try {
      const got = await askFor({
        doing: 'open',
        companion_id: her.id,
        model,
        voice,
        carry: carrying
          ? turnsNow.current.slice(-14).map((t) => `${t.who === 'him' ? 'HIM' : her.name}: ${t.text}`).join('\n')
          : '',
      });
      const seconds = Number(got.max_seconds || 780);
      ends.current = Date.now() + seconds * 1000;
      setLeft(seconds);
      line.current = await call({
        url: String(got.url),
        model: String(got.model || model),
        onEvent: handle,
      });
      setOn(true);
      setState('ringing');
      setMuted(false);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'The call could not be placed.');
      setOn(false);
    } finally { setBusy(false); }
  }, [askFor, handle, her.id, her.name, model, voice]);

  useEffect(() => { beginAgain.current = begin; writeUp.current = wrapUp; }, [begin, wrapUp]);

  const hangUp = () => { line.current?.hangUp(); };

  const forModel = (voices || []).filter((v) => Array.isArray(v.models) && v.models.some((m) => String(m).includes(model)));
  const choosable = forModel.length ? forModel : (voices || []);
  const guessing = forModel.length === 0 && (voices || []).length > 0;

  const light = state === 'talking' ? T.gold : state === 'listening' ? '#5ad17a' : T.textDim;
  const word = state === 'talking' ? `${her.name} is talking`
    : state === 'listening' ? (muted ? 'muted' : 'listening')
      : state === 'thinking' ? 'thinking' : 'connecting';

  return (
    <Panel style={{ marginBottom: 16 }} tone={on ? 'lit' : 'plain'}>
      <Eyebrow>{on ? 'On a call' : 'Call her'}</Eyebrow>

      {!on ? (
        <>
          <p style={{ margin: '8px 0 14px', fontSize: 14, color: T.textMuted, lineHeight: 1.7, maxWidth: '62ch' }}>
            A real call - she hears you and answers out loud, no send button.
            Use headphones if you can, or she will hear herself through your
            speakers and keep stopping. Billed by the minute while the line is
            open, and it hangs up on its own after about thirteen minutes
            unless it renews.
          </p>

          <div style={{ display: 'grid', gap: 12, maxWidth: 460, marginBottom: 14 }}>
            <Pick label="How she sounds" value={model} onChange={setModel} options={MODELS} />
            <Pick
              label="Her voice"
              value={voice}
              onChange={setVoice}
              options={[
                { value: '', label: voices === null ? 'Reading the voices' : 'Whatever they default to' },
                ...choosable
                  .map((v) => String(v.name || v.id || ''))
                  .filter(Boolean)
                  .map((n) => ({ value: n, label: n })),
              ]}
            />
          </div>

          {guessing ? (
            <p style={{ margin: '0 0 14px', fontSize: 13, color: T.textDim, lineHeight: 1.6, maxWidth: '62ch' }}>
              The provider did not say which of these voices take a call, so
              they are all listed. If one is refused, pick another - cloned
              voices never work on calls, only their own.
            </p>
          ) : null}

          <Row>
            <Btn kind="gold" onClick={() => void begin()} disabled={busy}>
              {busy ? 'Ringing' : `Call ${her.name}`}
            </Btn>
          </Row>
        </>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            margin: '10px 0 14px',
          }}>
            <span style={{
              width: 11, height: 11, borderRadius: '50%', background: light,
              boxShadow: `0 0 10px ${light}`, flexShrink: 0,
            }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: T.text, minWidth: 140 }}>{word}</span>
            <span style={{ fontSize: 14, color: T.textDim }}>{clock(left)} left</span>
            <span style={{ fontSize: 14, color: T.textDim }}>
              {spent > 0 ? `$${spent.toFixed(3)} so far` : 'nothing spent yet'}
            </span>
          </div>

          <div style={{
            background: T.ink, border: `1px solid ${T.lineSoft}`, borderRadius: 12,
            padding: '14px 16px', maxHeight: 260, overflowY: 'auto', marginBottom: 14,
          }}>
            {turns.length === 0 && !partial.him && !partial.her ? (
              <p style={{ margin: 0, fontSize: 14, color: T.textDim }}>Say hello.</p>
            ) : null}
            {turns.map((t, i) => (
              <p key={i} style={{
                margin: '0 0 8px', fontSize: 14, lineHeight: 1.6,
                color: t.who === 'him' ? T.textMuted : T.text,
              }}>
                <span style={{ color: t.who === 'him' ? T.textDim : T.gold, fontWeight: 700 }}>
                  {t.who === 'him' ? 'You: ' : `${her.name}: `}
                </span>
                {t.text}
              </p>
            ))}
            {partial.him ? (
              <p style={{ margin: '0 0 8px', fontSize: 14, color: T.textDim, lineHeight: 1.6 }}>
                <span style={{ fontWeight: 700 }}>You: </span>{partial.him}
              </p>
            ) : null}
            {partial.her ? (
              <p style={{ margin: '0 0 8px', fontSize: 14, color: T.textMuted, lineHeight: 1.6 }}>
                <span style={{ color: T.gold, fontWeight: 700 }}>{her.name}: </span>{partial.her}
              </p>
            ) : null}
            <div ref={bottom} />
          </div>

          <Row>
            <Btn kind="gold" onClick={hangUp}>Hang up</Btn>
            <Btn kind="quiet" onClick={() => { const q = !muted; setMuted(q); line.current?.mute(q); }}>
              {muted ? 'Unmute' : 'Mute me'}
            </Btn>
            <Btn kind="quiet" onClick={() => line.current?.cut()}>Let me talk</Btn>
          </Row>
        </>
      )}

      <Says text={says} />
      <Says text={ok} tone="ok" />

      {odd.length ? (
        <p style={{ marginTop: 10, fontSize: 12, color: T.textDim, lineHeight: 1.6 }}>
          The line also sent things this screen does not know about yet:{' '}
          {odd.join(', ')}. Nothing is broken by it - it is here so it can be
          looked into rather than guessed at.
        </p>
      ) : null}
    </Panel>
  );
}

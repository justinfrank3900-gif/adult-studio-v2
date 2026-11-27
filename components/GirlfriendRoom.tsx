'use client';

// components/GirlfriendRoom.tsx
//
// THE COMPANIONS.
//
// A performer who talks back. Same face, same voice, same wardrobe - this
// is the fourth thing you can do with a character you have already built,
// and the one that is sold by the month rather than by the clip.
//
// WHAT SHE KNOWS ABOUT HIM IS ON SCREEN.
//
// Every product in this category hides its memory, which is how everybody
// finds out it is not working at the worst possible moment. Hers is shown,
// in her own words, and it can be edited by hand. If she has the wrong idea
// about somebody, that is a text box, not a bug report.

import { useCallback, useEffect, useRef, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn, Eyebrow, Lead, Panel, Title } from './kit';
import { Area, Empty, Field, Grid, Pick, Row, Says, Tile, Working } from './parts';
import { faceOf, token } from '@/lib/data';
import { supa, DEALER_ID } from '@/lib/supabase';
import type { Library } from './Studio';

type Companion = {
  id: string;
  identity_id: string | null;
  name: string;
  persona: string;
  greeting: string;
  memory: string;
  model: string;
};

type Message = { id: string; role: string; content: string; audio_url: string | null; created_at: string };

export default function GirlfriendRoom({ lib }: { lib: Library }) {
  const [all, setAll] = useState<Companion[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [making, setMaking] = useState(false);
  const [who, setWho] = useState('');
  const [name, setName] = useState('');
  const [persona, setPersona] = useState('');
  const [greeting, setGreeting] = useState('');
  const [busy, setBusy] = useState(false);
  const [says, setSays] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const { data, error } = await supa()
      .from('adult_companions')
      .select('id,identity_id,name,persona,greeting,memory,model')
      .eq('dealer_id', DEALER_ID)
      .order('created_at', { ascending: false });
    if (error) setSays(`The companions could not be read: ${error.message}`);
    else setAll((data || []) as Companion[]);
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const start = async () => {
    setBusy(true); setSays(null);
    try {
      const performer = lib.cast.find((c) => c.id === who);
      const { data, error } = await supa().from('adult_companions').insert({
        dealer_id: DEALER_ID,
        identity_id: who || null,
        name: name.trim() || performer?.name || 'Her',
        persona: persona.trim(),
        greeting: greeting.trim(),
      }).select('id').single();
      if (error) throw new Error(error.message);
      setMaking(false); setName(''); setPersona(''); setGreeting(''); setWho('');
      await reload();
      setOpen((data as { id: string }).id);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'She could not be made.');
    } finally { setBusy(false); }
  };

  const her = all.find((c) => c.id === open) || null;
  if (her) return <Chat lib={lib} her={her} onBack={() => setOpen(null)} onChanged={reload} />;

  return (
    <>
      <Eyebrow>AI girlfriend</Eyebrow>
      <Title lead="The" gold="companions" />
      <Lead>
        A performer who talks back, in her own voice, and remembers what was
        said last time. Everything she knows is written down where you can
        read it and change it.
      </Lead>

      <Panel style={{ marginBottom: 20 }}>
        <Row>
          <Btn kind="gold" onClick={() => setMaking((v) => !v)}>{making ? 'Not now' : 'Make a companion'}</Btn>
        </Row>
        {making ? (
          <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            <Pick
              label="Which performer"
              value={who}
              onChange={(v) => {
                setWho(v);
                const c = lib.cast.find((x) => x.id === v);
                if (c && !name.trim()) setName(c.name);
              }}
              options={[{ value: '', label: 'Nobody - she is only a voice' }, ...lib.cast.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <Field label="What she is called" value={name} onChange={setName} />
            <Area
              label="Who she is"
              value={persona}
              onChange={setPersona}
              rows={6}
              placeholder="Twenty-eight, lives alone, works nights. Dry, teasing, says what she means. Gets attached faster than she admits. Hates being asked what she is wearing straight away."
              hint="How she talks, what she wants, what she will not do. This goes into every reply whole - the longer and more specific it is, the less of her is guessed."
            />
            <Field
              label="The first thing she says"
              value={greeting}
              onChange={setGreeting}
              placeholder="you took your time"
            />
            <Row>
              <Btn kind="gold" onClick={start} disabled={busy || (!name.trim() && !who)}>
                {busy ? 'Making her' : 'Make her'}
              </Btn>
            </Row>
          </div>
        ) : null}
        <Says text={says} />
      </Panel>

      {loading ? (
        <p style={{ fontSize: 15, color: T.textMuted }}>Reading the companions.</p>
      ) : all.length === 0 ? (
        <Empty>No companions yet. Pick one of your performers and give her a personality.</Empty>
      ) : (
        <Grid min={226}>
          {all.map((c) => (
            <Tile
              key={c.id}
              title={c.name}
              src={c.identity_id ? faceOf(lib.assets, c.identity_id) : null}
              note={c.persona.slice(0, 90) || 'No personality written yet'}
              footer={<Btn kind="gold" onClick={() => setOpen(c.id)}>Talk to her</Btn>}
            />
          ))}
        </Grid>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------- */

function Chat({ lib, her, onBack, onChanged }: {
  lib: Library; her: Companion; onBack: () => void; onChanged: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [memory, setMemory] = useState(her.memory);
  const [showMemory, setShowMemory] = useState(false);
  const [showHer, setShowHer] = useState(false);
  const [persona, setPersona] = useState(her.persona);
  const [busy, setBusy] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  const identity = lib.cast.find((c) => c.id === her.identity_id) || null;
  const hasVoice = Boolean(identity?.voice_id);

  const reload = useCallback(async () => {
    const { data, error } = await supa()
      .from('adult_messages')
      .select('id,role,content,audio_url,created_at')
      .eq('companion_id', her.id)
      .order('created_at')
      .limit(400);
    if (error) setSays(`What she said could not be read: ${error.message}`);
    else setMessages((data || []) as Message[]);
  }, [her.id]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);
  useEffect(() => () => { if (audio.current) audio.current.pause(); }, []);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy('send'); setSays(null);
    setDraft('');
    /* Shown straight away. Waiting for the round trip before his own words
     * appear makes a conversation feel like a form. */
    setMessages((m) => [...m, {
      id: `local_${Date.now()}`, role: 'user', content: text, audio_url: null,
      created_at: new Date().toISOString(),
    }]);
    try {
      const jwt = await token();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ companion_id: her.id, text }),
      });
      const said = await res.json().catch(() => null) as Record<string, unknown> | null;
      if (!res.ok) throw new Error((said?.error as string) || `She did not answer (${res.status}).`);
      if (typeof said?.memory === 'string') setMemory(said.memory);
      await reload();
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'She did not answer.');
      setDraft(text);
    } finally { setBusy(null); }
  };

  const hear = async (m: Message) => {
    if (m.audio_url) { play(m.audio_url, m.id); return; }
    if (!identity) { setSays('She is not linked to a performer, so she has no voice. Make her from one of your cast.'); return; }
    setBusy(m.id); setSays(null);
    try {
      const jwt = await token();
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ doing: 'say', identity_id: identity.id, text: m.content }),
      });
      const said = await res.json().catch(() => null) as Record<string, unknown> | null;
      if (!res.ok) throw new Error((said?.error as string) || `She could not say that (${res.status}).`);
      const url = String(said?.url || '');
      await supa().from('adult_messages').update({ audio_url: url }).eq('id', m.id);
      setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, audio_url: url } : x)));
      play(url, m.id);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'She could not say that.');
    } finally { setBusy(null); }
  };

  const play = (src: string, tag: string) => {
    if (audio.current) { audio.current.pause(); audio.current = null; }
    const a = new Audio(src);
    audio.current = a;
    setPlaying(tag);
    a.onended = () => setPlaying(null);
    a.onerror = () => { setPlaying(null); setSays('That clip would not play.'); };
    void a.play().catch(() => { setPlaying(null); setSays('The browser blocked the sound. Click the page and press it again.'); });
  };

  const saveMemory = async () => {
    setBusy('memory'); setSays(null);
    try {
      const { error } = await supa().from('adult_companions').update({ memory }).eq('id', her.id);
      if (error) throw new Error(error.message);
      await onChanged();
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That could not be saved.');
    } finally { setBusy(null); }
  };

  const savePersona = async () => {
    setBusy('persona'); setSays(null);
    try {
      const { error } = await supa().from('adult_companions').update({ persona }).eq('id', her.id);
      if (error) throw new Error(error.message);
      await onChanged();
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That could not be saved.');
    } finally { setBusy(null); }
  };

  const shown = messages.length ? messages : (her.greeting
    ? [{ id: 'greeting', role: 'assistant', content: her.greeting, audio_url: null, created_at: '' }]
    : []);

  return (
    <>
      <Row>
        <Btn kind="quiet" onClick={onBack}>All companions</Btn>
        <Btn kind="quiet" onClick={() => setShowHer((v) => !v)}>{showHer ? 'Hide who she is' : 'Who she is'}</Btn>
        <Btn kind="quiet" onClick={() => setShowMemory((v) => !v)}>
          {showMemory ? 'Hide what she knows' : 'What she knows about you'}
        </Btn>
      </Row>

      <div style={{ marginTop: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        {identity && faceOf(lib.assets, identity.id) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={faceOf(lib.assets, identity.id) as string}
            alt=""
            style={{ width: 58, height: 58, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${T.gold}` }}
          />
        ) : null}
        <div>
          <Title lead={her.name} size={26} />
          <span style={{ fontSize: 13, color: hasVoice ? T.gold : T.textDim }}>
            {hasVoice ? 'she can speak' : 'no voice yet - give her one in Cast'}
          </span>
        </div>
      </div>

      {showHer ? (
        <Panel style={{ marginBottom: 16 }}>
          <Area label="Who she is" value={persona} onChange={setPersona} rows={6} />
          <div style={{ marginTop: 12 }}>
            <Btn onClick={savePersona} disabled={busy !== null || persona === her.persona}>
              {busy === 'persona' ? 'Saving' : 'Save it'}
            </Btn>
          </div>
        </Panel>
      ) : null}

      {showMemory ? (
        <Panel style={{ marginBottom: 16 }}>
          <Area
            label="What she knows about you"
            value={memory}
            onChange={setMemory}
            rows={8}
            hint="She rewrites this herself as you talk, and it goes into every reply. If she has the wrong idea about something, change it here."
          />
          <div style={{ marginTop: 12 }}>
            <Btn onClick={saveMemory} disabled={busy !== null || memory === her.memory}>
              {busy === 'memory' ? 'Saving' : 'Save it'}
            </Btn>
          </div>
        </Panel>
      ) : null}

      <Panel style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
        <div style={{ maxHeight: 520, overflowY: 'auto', padding: '20px 22px' }}>
          {shown.length === 0 ? (
            <p style={{ fontSize: 15, color: T.textMuted, margin: 0 }}>Say something to her.</p>
          ) : shown.map((m) => {
            const mine = m.role === 'user';
            return (
              <div key={m.id} style={{
                display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 12,
              }}>
                <div style={{ maxWidth: '76%' }}>
                  <div style={{
                    background: mine ? T.raisedGrad : T.surfaceGrad,
                    border: `1px solid ${mine ? T.line : T.lineSoft}`,
                    borderLeft: mine ? undefined : `3px solid ${T.gold}`,
                    borderRadius: 14, padding: '11px 15px',
                    fontSize: 15, lineHeight: 1.6, color: T.text,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>{m.content}</div>
                  {!mine && m.id !== 'greeting' ? (
                    <button
                      type="button"
                      onClick={() => void hear(m)}
                      disabled={busy !== null}
                      style={{
                        marginTop: 5, background: 'transparent', border: 'none',
                        color: playing === m.id ? T.gold : T.textDim,
                        fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', padding: '2px 0',
                      }}
                    >
                      {busy === m.id ? 'speaking' : playing === m.id ? 'playing' : m.audio_url ? 'hear it again' : 'hear it'}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {busy === 'send' ? (
            <div style={{ marginTop: 4 }}><Working>{her.name} is typing.</Working></div>
          ) : null}
          <div ref={bottom} />
        </div>

        <div style={{
          borderTop: `1px solid ${T.lineSoft}`, padding: '14px 16px',
          display: 'flex', gap: 10, alignItems: 'flex-end', background: T.ink,
        }}>
          <textarea
            value={draft}
            rows={2}
            placeholder={`Say something to ${her.name}`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
            style={{
              flex: 1, background: T.surface, color: T.text,
              border: `1px solid ${T.line}`, borderRadius: 12,
              padding: '11px 14px', fontSize: 15, fontFamily: 'inherit',
              lineHeight: 1.5, resize: 'none',
            }}
          />
          <Btn kind="gold" onClick={send} disabled={busy !== null || !draft.trim()}>
            {busy === 'send' ? 'Sending' : 'Send'}
          </Btn>
        </div>
      </Panel>

      <Says text={says} />
    </>
  );
}

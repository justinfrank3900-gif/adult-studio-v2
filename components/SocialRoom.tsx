'use client';

// components/SocialRoom.tsx
//
// PUTTING IT OUT THERE.
//
// Write the post, pick the pictures off the studio's own wall, choose where
// it goes, send it or leave it queued. Every post is a row before it is a
// send, so a refusal has somewhere to be written and tomorrow there is a
// list of what went out rather than a memory of it.
//
// Instagram, Facebook and TikTok are not on the list. They ban this
// category in writing, so a button for them would be a button that gets
// the account deleted.

import { useCallback, useEffect, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn, Eyebrow, Lead, Mark, Panel, Title } from './kit';
import { Area, Empty, Field, Grid, Pick, Row, Says, Tile, Working } from './parts';
import { token } from '@/lib/data';
import { supa, DEALER_ID } from '@/lib/supabase';
import type { Library } from './Studio';

type Post = {
  id: string;
  body: string;
  media: string[];
  channel: string;
  target: string;
  status: string;
  error: string | null;
  posted_url: string | null;
  created_at: string;
};

const CHANNELS = [
  { value: 'telegram', label: 'Telegram', where: 'the channel, with the @' },
  { value: 'reddit', label: 'Reddit', where: 'the subreddit, without the r/' },
  { value: 'x', label: 'X', where: '' },
];

export default function SocialRoom({ lib }: { lib: Library }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [connected, setConnected] = useState<Record<string, boolean> | null>(null);
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState('telegram');
  const [target, setTarget] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const { data, error } = await supa()
      .from('adult_posts')
      .select('id,body,media,channel,target,status,error,posted_url,created_at')
      .eq('dealer_id', DEALER_ID)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) setSays(`The posts could not be read: ${error.message}`);
    else setPosts((data || []).map((p) => ({ ...p, media: Array.isArray(p.media) ? p.media.map(String) : [] })) as Post[]);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const jwt = await token();
        const res = await fetch('/api/post', { headers: { Authorization: `Bearer ${jwt}` } });
        const said = await res.json().catch(() => null) as { channels?: Record<string, boolean> } | null;
        if (live) setConnected(said?.channels || {});
      } catch { if (live) setConnected({}); }
    })();
    return () => { live = false; };
  }, []);

  /* The wall to pick from: anything with a picture, newest first. */
  const wall = lib.assets.filter((a) => a.public_url).slice(0, 36);

  const send = async (queueOnly: boolean) => {
    setBusy('send'); setSays(null); setOk(null);
    try {
      const { data, error } = await supa().from('adult_posts').insert({
        dealer_id: DEALER_ID,
        body: body.trim(),
        media: picked,
        channel,
        target: target.trim(),
        status: queueOnly ? 'queued' : 'draft',
      }).select('id').single();
      if (error) throw new Error(error.message);
      const id = (data as { id: string }).id;

      if (queueOnly) {
        setBody(''); setPicked([]);
        await reload();
        setOk('Kept. Send it whenever you want from the list below.');
        return;
      }

      const jwt = await token();
      const res = await fetch('/api/post', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ post_id: id }),
      });
      const said = await res.json().catch(() => null) as Record<string, unknown> | null;
      await reload();
      if (!res.ok) throw new Error((said?.error as string) || `It would not send (${res.status}).`);
      setBody(''); setPicked([]);
      setOk(`Gone out. ${said?.posted_url || ''}`);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'It would not send.');
    } finally { setBusy(null); }
  };

  const sendExisting = async (p: Post) => {
    setBusy(p.id); setSays(null); setOk(null);
    try {
      const jwt = await token();
      const res = await fetch('/api/post', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ post_id: p.id }),
      });
      const said = await res.json().catch(() => null) as Record<string, unknown> | null;
      await reload();
      if (!res.ok) throw new Error((said?.error as string) || `It would not send (${res.status}).`);
      setOk('Gone out.');
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'It would not send.');
    } finally { setBusy(null); }
  };

  const here = CHANNELS.find((c) => c.value === channel);
  const live = connected?.[channel];

  return (
    <>
      <Eyebrow>Out there</Eyebrow>
      <Title lead="Post" gold="it" />
      <Lead>
        Telegram, Reddit and X. Instagram, Facebook and TikTok are not here
        because they ban this outright - a button for them would be a button
        that loses the account.
      </Lead>

      <Panel style={{ marginBottom: 18 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <Area
            label="The post"
            value={body}
            onChange={setBody}
            rows={4}
            placeholder="what it says"
            hint={channel === 'reddit' ? 'On Reddit the first line is the title and the rest is the body.' : undefined}
          />

          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <Pick
              label="Where it goes"
              value={channel}
              onChange={(v) => { setChannel(v); setTarget(''); }}
              options={CHANNELS.map((c) => ({ value: c.value, label: c.label }))}
            />
            {here?.where ? (
              <Field label="Which one" value={target} onChange={setTarget} placeholder={here.where} />
            ) : null}
          </div>

          {connected ? (
            <Mark state={live ? 'ok' : 'warn'}>
              {live
                ? `${here?.label} is connected.`
                : `${here?.label} is not connected on this deployment yet. You can still write and keep the post - it will say what is missing when you try to send it.`}
            </Mark>
          ) : null}

          <div>
            <div style={{
              fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', color: T.textDim,
              textTransform: 'uppercase', margin: '4px 0 10px',
            }}>
              Pictures {picked.length ? `- ${picked.length} picked` : ''}
            </div>
            {wall.length === 0 ? (
              <Empty>Nothing on the wall yet. Shoot something first.</Empty>
            ) : (
              <Grid min={120}>
                {wall.map((a) => (
                  <Tile
                    key={a.id}
                    title={a.label || 'Still'}
                    src={a.public_url}
                    picked={picked.includes(a.public_url)}
                    onClick={() => setPicked((p) => (
                      p.includes(a.public_url) ? p.filter((u) => u !== a.public_url) : [...p, a.public_url]
                    ))}
                  />
                ))}
              </Grid>
            )}
          </div>

          <Row>
            <Btn kind="gold" onClick={() => send(false)} disabled={busy !== null || (!body.trim() && picked.length === 0)}>
              {busy === 'send' ? 'Sending' : 'Send it now'}
            </Btn>
            <Btn onClick={() => send(true)} disabled={busy !== null || (!body.trim() && picked.length === 0)}>
              Keep it for later
            </Btn>
          </Row>
          {busy === 'send' ? <Working>Sending.</Working> : null}
          <Says text={says} />
          <Says text={ok} tone="ok" />
        </div>
      </Panel>

      <Eyebrow>What has gone out</Eyebrow>
      {posts.length === 0 ? (
        <Empty>Nothing posted yet.</Empty>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {posts.map((p) => (
            <div
              key={p.id}
              style={{
                background: T.surfaceGrad,
                border: `1px solid ${p.status === 'failed' ? T.warn : T.line}`,
                borderLeft: `3px solid ${p.status === 'sent' ? T.gold : p.status === 'failed' ? T.warn : T.lineSoft}`,
                borderRadius: 12, padding: '13px 16px',
                display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
              }}
            >
              <span style={{ flex: '999 1 260px', minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, lineHeight: 1.5 }}>
                  {p.body.slice(0, 120) || '(pictures only)'}
                </span>
                <span style={{ display: 'block', fontSize: 13, color: T.textDim, marginTop: 3 }}>
                  {p.channel}{p.target ? ` - ${p.target}` : ''}
                  {p.media.length ? ` - ${p.media.length} picture${p.media.length === 1 ? '' : 's'}` : ''}
                  {' - '}{new Date(p.created_at).toLocaleDateString()}
                </span>
                {p.error ? (
                  <span style={{ display: 'block', fontSize: 13, color: T.bad, marginTop: 5, lineHeight: 1.5 }}>
                    {p.error}
                  </span>
                ) : null}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: p.status === 'sent' ? T.gold : p.status === 'failed' ? T.warn : T.textDim,
              }}>{p.status}</span>
              {p.status === 'sent' && p.posted_url?.startsWith('http') ? (
                <a href={p.posted_url} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: T.info }}>Open</a>
              ) : p.status !== 'sent' ? (
                <Btn kind="quiet" onClick={() => sendExisting(p)} disabled={busy !== null}>
                  {busy === p.id ? 'Sending' : p.status === 'failed' ? 'Try again' : 'Send it'}
                </Btn>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

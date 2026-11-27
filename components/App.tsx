'use client';

// components/App.tsx
//
// THE DOOR, AND THE REASON IT IS A REAL SIGN IN AND NOT A PASSWORD BOX.
//
// A shared password would have had to be checked by our own code, which means
// our own code also has to decide what a signed-in person may read - and the
// moment that decision lives in a route handler, one missing line opens the
// whole account. Signing in properly means the database holds the rule
// instead: every adult_* table lets you touch a row only when you are a
// member of the dealer it belongs to, and the browser's token is what proves
// that. No service key exists in this app at all.
//
// It is the same login as the portal. Different studio, same person.

import { useCallback, useEffect, useState } from 'react';
import { supa } from '@/lib/supabase';
import { T } from '@/lib/tokens';
import { Btn, Eyebrow, Lead, Panel, Title } from './kit';
import { Field, Says } from './parts';
import Studio from './Studio';
import { DEMO } from '@/lib/demo';

export default function App() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [says, setSays] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let unsub: (() => void) | undefined;
    try {
      const sb = supa();
      sb.auth.getSession().then(({ data }) => {
        if (!live) return;
        setSignedIn(Boolean(data.session));
        setReady(true);
      });
      const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
        if (live) setSignedIn(Boolean(session));
      });
      unsub = () => sub.subscription.unsubscribe();
    } catch (e) {
      /* A missing connection is a sentence on the screen, not a white page. */
      setSays(e instanceof Error ? e.message : 'The studio could not start.');
      setReady(true);
    }
    return () => { live = false; if (unsub) unsub(); };
  }, []);

  const signIn = useCallback(async () => {
    setBusy(true);
    setSays(null);
    try {
      const { error } = await supa().auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setSays(
          error.message.toLowerCase().includes('invalid')
            ? 'That email and password did not match. It is the same login as the portal.'
            : error.message,
        );
      } else {
        setPassword('');
      }
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'The studio could not reach its database.');
    } finally {
      setBusy(false);
    }
  }, [email, password]);

  if (!ready && !DEMO) {
    return (
      <main style={{ padding: 40 }}>
        <p style={{ fontSize: 15, color: T.textMuted }}>Opening the studio.</p>
      </main>
    );
  }

  /* A staged studio on a laptop, so the screens can be LOOKED at without
   * being Justin. Never set in Vercel. See lib/demo.ts. */
  if (DEMO) return <Studio onSignOut={() => {}} />;

  if (signedIn) return <Studio onSignOut={() => supa().auth.signOut()} />;

  return (
    <main style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <Panel style={{ width: '100%', maxWidth: 430 }}>
        <Eyebrow>Private</Eyebrow>
        <Title lead="The" gold="Studio" size={32} />
        <Lead>Same login as the portal.</Lead>
        <div style={{ display: 'grid', gap: 14 }}>
          <Field label="Email" type="email" value={email} onChange={setEmail} onEnter={signIn} />
          <Field label="Password" type="password" value={password} onChange={setPassword} onEnter={signIn} />
          <Btn kind="gold" onClick={signIn} disabled={busy || !email.trim() || !password}>
            {busy ? 'Checking' : 'Open the studio'}
          </Btn>
        </div>
        <Says text={says} />
      </Panel>
    </main>
  );
}

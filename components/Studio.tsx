'use client';

// components/Studio.tsx
//
// The shell: the company down the left, the work in the middle.
//
// Laid out the same way as the TYME Avatar Studio for one reason that is not
// taste. The five steps of a shoot belong to the shoot that is open, so they
// live on the rail above the work; the things that get REUSED - the cast, the
// wardrobe, the sets - are standing lists that outlive any one shoot, so they
// live in the nav. Putting the steps in both places is what made the rebuilt
// studio still read as the old one.

import { useCallback, useEffect, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn } from './kit';
import { Says } from './parts';
import {
  Refused, loadAssets, loadCast, loadSets, loadShoots, loadWardrobe,
} from '@/lib/data';
import type { Asset, Identity, Outfit, SetRow, Shoot } from '@/lib/types';
import { DEMO, demoAssets, demoCast, demoOutfits, demoSets, demoShoots } from '@/lib/demo';
import CastRoom from './CastRoom';
import WardrobeRoom from './WardrobeRoom';
import SetsRoom from './SetsRoom';
import ShootsRoom from './ShootsRoom';
import ShootRoom from './ShootRoom';

type Room = 'floor' | 'cast' | 'wardrobe' | 'sets';

const ROOMS: { key: Room; label: string; detail: string }[] = [
  { key: 'floor', label: 'The floor', detail: 'every shoot' },
  { key: 'cast', label: 'Cast', detail: 'who is on camera' },
  { key: 'wardrobe', label: 'Wardrobe', detail: 'what they wear' },
  { key: 'sets', label: 'Sets', detail: 'where you shoot' },
];

export type Library = {
  cast: Identity[];
  assets: Asset[];
  outfits: Outfit[];
  sets: SetRow[];
  shoots: Shoot[];
  reload: () => Promise<void>;
};

export default function Studio({ onSignOut }: { onSignOut: () => void }) {
  const [room, setRoom] = useState<Room>('floor');
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [says, setSays] = useState<string | null>(null);

  const [cast, setCast] = useState<Identity[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [shoots, setShoots] = useState<Shoot[]>([]);

  const reload = useCallback(async () => {
    setSays(null);
    if (DEMO) {
      setCast(demoCast); setAssets(demoAssets); setOutfits(demoOutfits);
      setSets(demoSets); setShoots(demoShoots); setLoading(false);
      return;
    }
    try {
      const [c, a, w, s, p] = await Promise.all([
        loadCast(), loadAssets(), loadWardrobe(), loadSets(), loadShoots(),
      ]);
      setCast(c); setAssets(a); setOutfits(w); setSets(s); setShoots(p);
    } catch (e) {
      setSays(e instanceof Refused ? e.message : 'The studio could not read its own shelves.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const lib: Library = { cast, assets, outfits, sets, shoots, reload };

  const navBtn = (active: boolean) => ({
    display: 'block', width: '100%', textAlign: 'left' as const,
    background: active ? T.raised : 'transparent',
    border: `1px solid ${active ? T.line : 'transparent'}`,
    borderRadius: 12, padding: '11px 14px', cursor: 'pointer',
    fontFamily: 'inherit', color: active ? T.text : T.textMuted, minHeight: 46,
  });

  const openShoot = shoots.find((s) => s.id === open) || null;

  return (
    <div style={{ maxWidth: 1340, margin: '0 auto', padding: '30px 22px 90px' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, marginBottom: 26,
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 11 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: T.gold }} />
          <span style={{
            fontSize: 13, fontWeight: 700, letterSpacing: '0.2em',
            color: T.textDim, textTransform: 'uppercase',
          }}>The Studio</span>
        </span>
        <Btn kind="quiet" onClick={onSignOut}>Sign out</Btn>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 30, alignItems: 'flex-start' }}>
        <nav aria-label="Studio" style={{ flex: '0 0 226px', minWidth: 196 }}>
          {openShoot ? (
            <button
              type="button"
              onClick={() => setRoom('floor')}
              style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                fontFamily: 'inherit', background: T.raised, color: T.text,
                border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.gold}`,
                borderRadius: 12, padding: '13px 15px', marginBottom: 22,
              }}
            >
              <span style={{
                display: 'block', fontSize: 13, fontWeight: 700, letterSpacing: '0.16em',
                color: T.textDim, textTransform: 'uppercase',
              }}>Open now</span>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700, marginTop: 5, lineHeight: 1.35 }}>
                {openShoot.name || openShoot.title.slice(0, 48)}
              </span>
            </button>
          ) : null}

          <div style={{
            fontSize: 13, fontWeight: 700, letterSpacing: '0.16em', color: T.textDim,
            textTransform: 'uppercase', margin: '0 0 10px 14px',
          }}>The company</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ROOMS.map((r) => (
              <button
                key={r.key}
                type="button"
                style={navBtn(room === r.key)}
                onClick={() => { setRoom(r.key); if (r.key !== 'floor') setOpen(null); }}
              >
                <span style={{ display: 'block', fontSize: 15, fontWeight: room === r.key ? 700 : 400 }}>{r.label}</span>
                <span style={{ display: 'block', fontSize: 13, color: T.textDim, marginTop: 2 }}>{r.detail}</span>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 26, paddingLeft: 14, fontSize: 13, color: T.textDim, lineHeight: 1.7 }}>
            <div>{cast.length} on the books</div>
            <div>{outfits.length} outfits</div>
            <div>{sets.length} sets</div>
            <div>{shoots.length} shoots</div>
          </div>
        </nav>

        <main style={{ flex: '999 1 620px', minWidth: 0 }}>
          <Says text={says} />
          {loading ? (
            <p style={{ fontSize: 15, color: T.textMuted }}>Opening the studio.</p>
          ) : room === 'cast' ? (
            <CastRoom lib={lib} />
          ) : room === 'wardrobe' ? (
            <WardrobeRoom lib={lib} />
          ) : room === 'sets' ? (
            <SetsRoom lib={lib} />
          ) : openShoot ? (
            <ShootRoom lib={lib} shoot={openShoot} onClose={() => setOpen(null)} />
          ) : (
            <ShootsRoom lib={lib} onOpen={(id) => setOpen(id)} />
          )}
        </main>
      </div>
    </div>
  );
}

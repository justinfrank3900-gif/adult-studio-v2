'use client';

// components/Studio.tsx
//
// THE SHELL: FOUR SECTIONS, NOT A LIST OF NINE ROOMS.
//
// "NEED THE MENUS SEPERATED. cAST WARDROBE AND EVERYTHING BUIDLING THE
// AVATAR IN pORNSTARS SECTION. THE SCENES WOULD HAVE THE SHOOT A SET SETS
// AND THE SHHOTS AND THEN cOURSES IS SEPERATE... NEED AN AI GIRLFRIEND
// SECTION."
//
// Those are four different jobs done on four different days, and a flat
// list of nine made every one of them look like part of the same errand.
// The grouping is his, word for word, because he is the one who has to find
// things in it at one in the morning.
//
// The masthead and the lit edges are the portal's, from the same tokens, so
// a screen here put beside a TYME screen reads as the same product rather
// than as something that borrowed the colours.

import { useCallback, useEffect, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn, GOLD_FILL } from './kit';
import { Says } from './parts';
import {
  Refused, loadAssets, loadCast, loadSets, loadShoots, loadVoices, loadWardrobe,
} from '@/lib/data';
import type { Asset, Identity, Outfit, SetRow, Shoot, VoiceRow } from '@/lib/types';
import { DEMO, demoAssets, demoCast, demoOutfits, demoSets, demoShoots, demoVoices } from '@/lib/demo';
import CastRoom from './CastRoom';
import WardrobeRoom from './WardrobeRoom';
import SetsRoom from './SetsRoom';
import ShootsRoom from './ShootsRoom';
import ShootRoom from './ShootRoom';
import PhotosetRoom from './PhotosetRoom';
import CoursesRoom from './CoursesRoom';
import StillsRoom from './StillsRoom';
import GirlfriendRoom from './GirlfriendRoom';
import SocialRoom from './SocialRoom';

type Room =
  | 'cast' | 'wardrobe'
  | 'floor' | 'sets' | 'photoset' | 'stills'
  | 'courses'
  | 'girlfriend'
  | 'social';

type Section = { name: string; rooms: { key: Room; label: string; detail: string }[] };

const SECTIONS: Section[] = [
  {
    name: 'Pornstars',
    rooms: [
      { key: 'cast', label: 'Cast', detail: 'who is on camera' },
      { key: 'wardrobe', label: 'Wardrobe', detail: 'what they wear' },
    ],
  },
  {
    name: 'Scenes',
    rooms: [
      { key: 'floor', label: 'Shoots', detail: 'scenes with takes' },
      { key: 'photoset', label: 'Shoot a set', detail: 'a roll of stills' },
      { key: 'stills', label: 'Stills', detail: 'one picture at a time' },
      { key: 'sets', label: 'Sets', detail: 'where you shoot' },
    ],
  },
  { name: 'Courses', rooms: [{ key: 'courses', label: 'Courses', detail: 'what you sell' }] },
  { name: 'AI girlfriend', rooms: [{ key: 'girlfriend', label: 'Companions', detail: 'she talks back' }] },
  { name: 'Out there', rooms: [{ key: 'social', label: 'Social', detail: 'post it' }] },
];

export type Library = {
  cast: Identity[];
  assets: Asset[];
  outfits: Outfit[];
  sets: SetRow[];
  shoots: Shoot[];
  voices: VoiceRow[];
  reload: () => Promise<void>;
};

export default function Studio({ onSignOut }: { onSignOut: () => void }) {
  const [room, setRoom] = useState<Room>('cast');
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [says, setSays] = useState<string | null>(null);

  const [cast, setCast] = useState<Identity[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [shoots, setShoots] = useState<Shoot[]>([]);
  const [voices, setVoices] = useState<VoiceRow[]>([]);

  const reload = useCallback(async () => {
    setSays(null);
    if (DEMO) {
      setCast(demoCast); setAssets(demoAssets); setOutfits(demoOutfits);
      setSets(demoSets); setShoots(demoShoots); setVoices(demoVoices); setLoading(false);
      return;
    }
    try {
      const [c, a, w, s, p, v] = await Promise.all([
        loadCast(), loadAssets(), loadWardrobe(), loadSets(), loadShoots(), loadVoices(),
      ]);
      setCast(c); setAssets(a); setOutfits(w); setSets(s); setShoots(p); setVoices(v);
    } catch (e) {
      setSays(e instanceof Refused ? e.message : 'The studio could not read its own shelves.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const lib: Library = { cast, assets, outfits, sets, shoots, voices, reload };
  const openShoot = shoots.find((s) => s.id === open) || null;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 22px 90px' }}>
      <Masthead onSignOut={onSignOut} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 34, alignItems: 'flex-start' }}>
        <nav aria-label="Studio" style={{ flex: '0 0 232px', minWidth: 200 }}>
          {openShoot ? (
            <button
              type="button"
              onClick={() => { setRoom('floor'); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                fontFamily: 'inherit', background: T.raisedGrad, color: T.text,
                border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.gold}`,
                borderRadius: 12, padding: '13px 15px', marginBottom: 24,
                boxShadow: T.lift1,
              }}
            >
              <span style={{
                display: 'block', fontSize: 13, fontWeight: 700, letterSpacing: '0.16em',
                color: T.textDim, textTransform: 'uppercase',
              }}>On the floor</span>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700, marginTop: 5, lineHeight: 1.35 }}>
                {openShoot.name || openShoot.title.slice(0, 44)}
              </span>
            </button>
          ) : null}

          {SECTIONS.map((section) => (
            <div key={section.name} style={{ marginBottom: 24 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                margin: '0 0 9px 14px',
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.gold, opacity: 0.8 }} />
                <span style={{
                  fontSize: 13, fontWeight: 700, letterSpacing: '0.18em',
                  color: T.textDim, textTransform: 'uppercase',
                }}>{section.name}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {section.rooms.map((r) => {
                  const active = room === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => { setRoom(r.key); if (r.key !== 'floor') setOpen(null); }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        background: active ? T.raisedGrad : 'transparent',
                        border: `1px solid ${active ? T.line : 'transparent'}`,
                        borderLeft: `3px solid ${active ? T.gold : 'transparent'}`,
                        borderRadius: 11, padding: '10px 13px', cursor: 'pointer',
                        fontFamily: 'inherit', color: active ? T.text : T.textMuted,
                        minHeight: 46,
                        boxShadow: active ? T.lift1 : 'none',
                      }}
                    >
                      <span style={{ display: 'block', fontSize: 15, fontWeight: active ? 700 : 400 }}>{r.label}</span>
                      <span style={{ display: 'block', fontSize: 13, color: T.textDim, marginTop: 2 }}>{r.detail}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{
            marginTop: 8, padding: '14px 16px', borderRadius: 12,
            background: T.surfaceGrad, border: `1px solid ${T.lineSoft}`,
            fontSize: 13, color: T.textDim, lineHeight: 1.8,
          }}>
            <Count n={cast.length} of="on the books" />
            <Count n={outfits.length} of="outfits" />
            <Count n={sets.length} of="sets" />
            <Count n={shoots.length} of="shoots" />
            <Count n={assets.length} of="pictures" />
          </div>
        </nav>

        <main style={{ flex: '999 1 640px', minWidth: 0 }}>
          <Says text={says} />
          {loading ? (
            <p style={{ fontSize: 15, color: T.textMuted }}>Opening the studio.</p>
          ) : room === 'cast' ? (
            <CastRoom lib={lib} />
          ) : room === 'wardrobe' ? (
            <WardrobeRoom lib={lib} />
          ) : room === 'sets' ? (
            <SetsRoom lib={lib} />
          ) : room === 'photoset' ? (
            <PhotosetRoom lib={lib} />
          ) : room === 'stills' ? (
            <StillsRoom lib={lib} />
          ) : room === 'courses' ? (
            <CoursesRoom />
          ) : room === 'girlfriend' ? (
            <GirlfriendRoom lib={lib} />
          ) : room === 'social' ? (
            <SocialRoom lib={lib} />
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

function Count({ n, of }: { n: number; of: string }) {
  return (
    <div>
      <span style={{ color: T.textMuted, fontWeight: 700 }}>{n}</span> {of}
    </div>
  );
}

/**
 * The masthead.
 *
 * Gold on a shield is the portal's identity and it is a SEPARATE role from
 * the gold that marks the one action on a screen - which is why there is a
 * gold wordmark up here and a gold button down there and they do not fight.
 */
function Masthead({ onSignOut }: { onSignOut: () => void }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 14,
      padding: '26px 0 24px', marginBottom: 28,
      borderBottom: `1px solid ${T.lineSoft}`,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 13 }}>
        <span style={{
          width: 34, height: 38, flexShrink: 0,
          background: GOLD_FILL,
          /* A shield, drawn rather than fetched: one less file, and it
           * cannot go missing behind a login. */
          clipPath: 'polygon(50% 0%, 100% 18%, 100% 62%, 50% 100%, 0% 62%, 0% 18%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.onGold, fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em',
          boxShadow: `0 8px 24px -10px ${T.gold}`,
        }}>S</span>
        <span>
          <span style={{
            display: 'block', fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1,
          }}>
            The{' '}
            <span style={{
              background: GOLD_FILL, WebkitBackgroundClip: 'text',
              backgroundClip: 'text', color: 'transparent',
            }}>Studio</span>
          </span>
          <span style={{
            display: 'block', fontSize: 13, letterSpacing: '0.18em',
            color: T.textDim, textTransform: 'uppercase', marginTop: 3,
          }}>Private</span>
        </span>
      </span>
      <Btn kind="quiet" onClick={onSignOut}>Sign out</Btn>
    </header>
  );
}

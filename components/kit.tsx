'use client';

// components/kit.tsx
//
// The small set of parts the new studio is built from.
//
// The old studio grew to 3,800 lines in one file with its styles inlined at
// every call site, which is why a change to how a card looks meant reading
// the whole thing. These are the only shapes the new screens use, and they
// take their colour from lib/tokens so the studio themes with the portal
// instead of carrying a palette of its own.
//
// Type sizes come from the nine the portal allows. scripts/check-type-scale
// fails the build on anything in between, which is the right rule: half a
// pixel between two sizes is two people guessing.

import { T } from '@/lib/tokens';

/** The four shot sizes, which is the whole camera vocabulary. */
export type ShotSize = 'wide' | 'medium' | 'close' | 'detail';
import type { CSSProperties, ReactNode } from 'react';

export const GOLD_FILL = `linear-gradient(135deg, ${T.goldLit} 0%, ${T.gold} 45%, ${T.goldDeep} 100%)`;

/** A small caps label over a section. Gold dot, letterspaced, never a heading. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 13 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.gold }} />
      <span style={{
        fontSize: 13, fontWeight: 700, letterSpacing: '0.16em',
        color: T.gold, textTransform: 'uppercase',
      }}>{children}</span>
    </span>
  );
}

/** A two tone heading: the plain half, then the gold half. */
export function Title({ lead, gold, size = 32 }: { lead: string; gold?: string; size?: 22 | 26 | 32 }) {
  return (
    <h2 style={{ margin: '0 0 10px', fontSize: size, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, color: T.text }}>
      {lead}
      {gold ? (
        <>
          {' '}
          <span style={{
            background: GOLD_FILL,
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>{gold}</span>
        </>
      ) : null}
    </h2>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return <p style={{ margin: '0 0 22px', fontSize: 15, color: T.textMuted, lineHeight: 1.65, maxWidth: '62ch' }}>{children}</p>;
}

export function Panel({ children, tone = 'plain', style }: { children: ReactNode; tone?: 'plain' | 'warn' | 'lit'; style?: CSSProperties }) {
  const border = tone === 'warn' ? T.warn : tone === 'lit' ? T.gold : T.line;
  return (
    <section style={{
      background: T.surfaceGrad, border: `1px solid ${border}`, borderRadius: 16,
      padding: '22px 24px', boxShadow: T.edge, ...style,
    }}>{children}</section>
  );
}

/** A figure that matters, with its label under it. */
export function Stat({ value, label, tone = 'gold' }: { value: ReactNode; label: string; tone?: 'gold' | 'plain' | 'warn' }) {
  const color = tone === 'warn' ? T.warn : tone === 'plain' ? T.text : undefined;
  return (
    <div>
      <div style={{
        fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em',
        ...(color ? { color } : {
          background: GOLD_FILL, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }),
      }}>{value}</div>
      <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}

export function Divider() {
  return <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', minHeight: 36, background: T.line }} />;
}

export function Btn({
  children, onClick, kind = 'ghost', disabled, type = 'button', title,
}: {
  children: ReactNode; onClick?: () => void; kind?: 'gold' | 'ghost' | 'quiet';
  disabled?: boolean; type?: 'button' | 'submit'; title?: string;
}) {
  const base: CSSProperties = {
    borderRadius: 999, padding: '13px 24px', fontSize: 14, fontWeight: 700,
    fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer', minHeight: 46,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    border: `1px solid ${T.line}`, background: 'transparent', color: T.text,
  };
  const look: CSSProperties =
    disabled ? { background: T.raised, color: T.textDim, border: `1px solid ${T.line}` }
    : kind === 'gold' ? { background: GOLD_FILL, color: T.onGold, border: 'none', boxShadow: `0 8px 26px -10px ${T.gold}` }
    : kind === 'quiet' ? { color: T.textMuted }
    : {};
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} style={{ ...base, ...look }}>
      {children}
    </button>
  );
}

/** A tick, a warning or a dash, with its sentence. The studio's whole status vocabulary. */
export function Mark({ state, children }: { state: 'ok' | 'warn' | 'off'; children: ReactNode }) {
  const color = state === 'ok' ? T.gold : state === 'warn' ? T.warn : T.textDim;
  const glyph = state === 'ok' ? String.fromCharCode(0x2713) : state === 'warn' ? '!' : String.fromCharCode(0x2013);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: state === 'off' ? T.textDim : T.textMuted, lineHeight: 1.5 }}>
      <span style={{
        width: 20, height: 20, flexShrink: 0, borderRadius: '50%', marginTop: 1,
        background: state === 'off' ? 'transparent' : `color-mix(in srgb, ${color} 13%, transparent)`,
        border: state === 'off' ? `1px solid ${T.line}` : 'none',
        color, fontSize: 13, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{glyph}</span>
      {children}
    </span>
  );
}

/**
 * One end of a take, drawn as a frame rather than described in words.
 *
 * A seam is only clean when two of these hold the SAME picture, so the whole
 * point is to put them next to each other and let a person see it.
 */
export function FrameSlot({
  label, size, src, flagged,
}: { label: string; size: ShotSize; src?: string | null; flagged?: boolean }) {
  /* An extreme close up is drawn as a head bigger than the frame, because
   * that is literally what it is: the subject does not fit. */
  const head = size === 'detail' ? 150 : size === 'close' ? 74 : size === 'medium' ? 42 : 20;
  const body = size === 'detail' ? 150 : size === 'close' ? 104 : size === 'medium' ? 70 : 34;
  return (
    <figure style={{ margin: 0, width: 108 }}>
      <div style={{
        position: 'relative', height: 192, borderRadius: 10, overflow: 'hidden',
        border: `${flagged ? 2 : 1}px solid ${flagged ? T.warn : T.line}`,
        background: src ? T.raised : `linear-gradient(175deg, ${T.raised} 0%, ${T.surface} 52%, ${T.ink} 100%)`,
      }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <>
            <span style={{
              position: 'absolute', left: '50%', top: size === 'wide' ? '44%' : size === 'medium' ? '28%' : size === 'detail' ? '8%' : '16%',
              transform: 'translateX(-50%)', width: head, height: head, borderRadius: '50%', background: GOLD_FILL,
            }} />
            <span style={{
              position: 'absolute', left: '50%', bottom: size === 'wide' ? 16 : 0, transform: 'translateX(-50%)',
              width: body, height: size === 'wide' ? 40 : size === 'detail' ? 20 : 66,
              borderRadius: size === 'wide' ? 7 : '14px 14px 0 0',
              display: size === 'detail' ? 'none' : 'block',
              background: T.ink,
            }} />
          </>
        )}
        <span style={{
          position: 'absolute', left: 7, top: 7, borderRadius: 999, padding: '2px 9px',
          fontSize: 13, fontWeight: 700, letterSpacing: '0.08em',
          background: flagged ? T.warn : 'rgba(0,0,0,0.72)',
          color: flagged ? T.onGold : T.goldLit,
          border: flagged ? 'none' : `1px solid ${T.line}`,
        }}>{label}</span>
      </div>
      <figcaption style={{ fontSize: 13, color: flagged ? T.warn : T.textMuted, marginTop: 7, textAlign: 'center', fontWeight: flagged ? 700 : 400 }}>
        {size}
      </figcaption>
    </figure>
  );
}

/** The join between two takes: linked, broken, or not yet knowable. */
export function SeamLink({ state }: { state: 'shared' | 'jumps' | 'unknown' }) {
  const c = state === 'shared' ? T.gold : state === 'jumps' ? T.warn : T.textDim;
  const glyph = state === 'shared' ? String.fromCharCode(0x221E) : state === 'jumps' ? String.fromCharCode(0x2717) : '?';
  const word = state === 'shared' ? 'SHARED' : state === 'jumps' ? 'JUMPS' : 'NOT SHOT';
  return (
    <div style={{ width: 86, paddingTop: 76, textAlign: 'center', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ height: 1, width: 16, background: c }} />
        <span style={{
          width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `color-mix(in srgb, ${c} 13%, transparent)`,
          border: `1px ${state === 'unknown' ? 'dashed' : 'solid'} ${c}`, color: c, fontSize: 15, fontWeight: 800,
        }}>{glyph}</span>
        <span style={{ height: 1, width: 16, background: c }} />
      </div>
      <div style={{ fontSize: 13, color: c, fontWeight: 700, marginTop: 8, letterSpacing: '0.08em' }}>{word}</div>
    </div>
  );
}

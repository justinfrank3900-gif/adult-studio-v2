'use client';

// components/parts.tsx
//
// The parts the rooms are built from, on top of kit.tsx.
//
// Everything on a screen here is a CARD in a GRID. That is Justin's rule and
// it is not decoration: a list of rows makes twenty things look like one
// thing, and the whole job in this studio is picking one face, one outfit,
// one set out of a wall of them.

import { T } from '@/lib/tokens';
import { GOLD_FILL } from './kit';
import type { CSSProperties, ReactNode } from 'react';

/** A wall of cards. A minimum width per card, never a fixed column count, so
 *  the same grid works at phone width and on a monitor. */
export function Grid({ min = 240, children }: { min?: number; children: ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
      gap: 16,
      alignItems: 'stretch',
    }}>{children}</div>
  );
}

/**
 * One card in the grid.
 *
 * The picture is a FIXED aspect box, not an image sized to itself. Two tiles
 * side by side where one picture is taller than the other is the exact thing
 * the symmetry rule exists to stop, and it cannot happen when the frame is
 * the thing with the size and the picture only fills it.
 */
export function Tile({
  title, note, src, ratio = '3 / 4', picked, onClick, footer, tone, badge,
}: {
  title: string;
  note?: ReactNode;
  src?: string | null;
  ratio?: string;
  picked?: boolean;
  onClick?: () => void;
  footer?: ReactNode;
  tone?: 'warn';
  badge?: string | null;
}) {
  const edge = picked ? T.gold : tone === 'warn' ? T.warn : T.line;
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      } : undefined}
      style={{
        background: T.surfaceGrad,
        border: `${picked ? 2 : 1}px solid ${edge}`,
        borderRadius: 14,
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: picked ? `${T.topEdge}, 0 10px 30px -14px ${T.gold}` : T.edge,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{
        aspectRatio: ratio,
        background: src ? T.ink : `linear-gradient(175deg, ${T.raised} 0%, ${T.surface} 55%, ${T.ink} 100%)`,
        position: 'relative',
      }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          /* TAKEN OUT OF THE FLOW ON PURPOSE. An img left in flow contributes
             its own height, and a box whose height is auto takes the taller
             of its content and its aspect-ratio - so a 600x800 jpeg quietly
             turned a 4/3 card into a 3/4 one and two rows stopped matching. */
          <img src={src} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <span style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.textDim, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>no picture yet</span>
        )}
        {badge ? (
          <span style={{
            position: 'absolute', left: 9, top: 9, borderRadius: 999, padding: '3px 10px',
            fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
            background: 'rgba(0,0,0,0.72)', color: T.goldLit, border: `1px solid ${T.line}`,
          }}>{badge}</span>
        ) : null}
        {picked ? (
          <span style={{
            position: 'absolute', right: 9, top: 9, width: 26, height: 26, borderRadius: '50%',
            background: GOLD_FILL, color: T.onGold, fontSize: 15, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{String.fromCharCode(0x2713)}</span>
        ) : null}
      </div>
      <div style={{ padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{title}</span>
        {note ? <span style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.45 }}>{note}</span> : null}
        {footer ? <div style={{ marginTop: 'auto', paddingTop: 10 }}>{footer}</div> : null}
      </div>
    </div>
  );
}

const inputLook: CSSProperties = {
  width: '100%', background: T.ink, color: T.text,
  border: `1px solid ${T.line}`, borderRadius: 10,
  padding: '12px 13px', fontSize: 15, fontFamily: 'inherit', lineHeight: 1.5,
};

function Cap({ children }: { children: ReactNode }) {
  return (
    <span style={{
      display: 'block', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em',
      color: T.textDim, textTransform: 'uppercase', marginBottom: 7,
    }}>{children}</span>
  );
}

/** A labelled single line. The label is always there, never a placeholder: a
 *  placeholder disappears the moment somebody types in the box. */
export function Field({
  label, value, onChange, placeholder, type = 'text', onEnter,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; onEnter?: () => void;
}) {
  return (
    <label style={{ display: 'block' }}>
      <Cap>{label}</Cap>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onEnter ? (e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } } : undefined}
        style={inputLook}
      />
    </label>
  );
}

/** The same, for the long ones. Always live and always editable: a box you
 *  have to press an Edit button to type in is the thing Justin threw out. */
export function Area({
  label, value, onChange, rows = 5, placeholder, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  rows?: number; placeholder?: string; hint?: ReactNode;
}) {
  return (
    <label style={{ display: 'block' }}>
      <Cap>{label}</Cap>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputLook, resize: 'vertical' }}
      />
      {hint ? <span style={{ display: 'block', fontSize: 13, color: T.textDim, marginTop: 6, lineHeight: 1.5 }}>{hint}</span> : null}
    </label>
  );
}

/** A labelled chooser. */
export function Pick({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label style={{ display: 'block' }}>
      <Cap>{label}</Cap>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputLook}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/**
 * What went wrong, where it went wrong.
 *
 * Never a toast and never a console line. This studio's whole history of "it
 * just does nothing" came from failures that happened somewhere the person
 * was not looking, so this sits directly under the button that was pressed
 * and carries the provider's own sentence.
 */
export function Says({ text, tone = 'bad' }: { text: string | null; tone?: 'bad' | 'ok' }) {
  if (!text) return null;
  const c = tone === 'ok' ? T.good : T.bad;
  return (
    <p style={{
      margin: '12px 0 0', fontSize: 14, lineHeight: 1.55, color: c,
      background: `color-mix(in srgb, ${c} 10%, transparent)`,
      border: `1px solid color-mix(in srgb, ${c} 38%, transparent)`,
      borderRadius: 10, padding: '11px 13px',
    }}>{text}</p>
  );
}

/** A row of controls that stays a row by wrapping rather than squashing. */
export function Row({ children, gap = 10 }: { children: ReactNode; gap?: number }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap, alignItems: 'center' }}>{children}</div>;
}

/** Nothing here yet, said in a sentence rather than with an empty grid. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <p style={{
      margin: 0, padding: '26px 22px', fontSize: 15, color: T.textMuted, lineHeight: 1.6,
      background: T.surfaceGrad, border: `1px dashed ${T.line}`, borderRadius: 14,
    }}>{children}</p>
  );
}

/** Something is happening and it takes a minute. The sentence says what. */
export function Working({ children }: { children: ReactNode }) {
  return (
    <p style={{
      margin: '12px 0 0', display: 'inline-flex', alignItems: 'center', gap: 10,
      fontSize: 14, color: T.goldLit, lineHeight: 1.5,
    }}>
      <span style={{
        width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
        border: `2px solid color-mix(in srgb, ${T.gold} 30%, transparent)`,
        borderTopColor: T.gold, animation: 'spin 760ms linear infinite',
      }} />
      {children}
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </p>
  );
}

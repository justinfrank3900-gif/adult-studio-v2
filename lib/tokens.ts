import type { CSSProperties } from 'react';

/**
 * The design tokens, for inline styles.
 *
 * The values live in app/globals.css as CSS variables. This file is only the
 * handle: every entry is `var(--something)`, so a colour changes in one place
 * and the whole studio follows.
 *
 * WHY THIS FILE HOLDS NO COLOURS
 *
 * It would be easier to export hex strings from here and skip the CSS. That is
 * how the codebase got 175 distinct colours in 2,890 places: every value typed
 * fresh, nothing able to cascade, and no way to theme anything. A TypeScript
 * constant cannot be overridden per dealer, cannot respond to a media query,
 * and cannot be shared with a generated page.
 *
 * HOW TO USE IT
 *
 *   import { T } from '@/lib/tokens';
 *   <div style={{ background: T.surface, color: T.text, boxShadow: T.lift1 }}>
 *
 * WHAT NOT TO DO
 *
 * Do not write a hex code in a component. scripts/check-design-tokens.mjs
 * fails the build on a new one. The existing ones are recorded in a baseline
 * that is allowed to shrink and never to grow, which is how a rule gets
 * introduced to a codebase that already breaks it everywhere.
 */

export const T = {
  /* Surfaces, lowest to highest. The gap between each is deliberate: the old
   * page ground and the old card were 1.62 apart on a scale where 2.3 is the
   * point a human starts to see a difference, which is why the product read as
   * one flat plane with lines drawn on it. */
  ink: 'var(--ink)',
  surface: 'var(--surface)',
  /** A card as a gradient rather than a flat fill, so it catches light down
   * its height the way a physical panel does. Two shades apart on purpose: a
   * gradient you can see stops being a material and becomes a decoration. */
  surfaceGrad: 'var(--surface-grad)',
  raised: 'var(--raised)',
  raisedGrad: 'var(--raised-grad)',
  overlay: 'var(--overlay)',
  scrim: 'var(--scrim)',

  /* Edges only. Hierarchy is elevation's job. When every card carries the same
   * border, nothing is emphasised. */
  line: 'var(--line)',
  lineSoft: 'var(--line-soft)',

  text: 'var(--text)',
  textMuted: 'var(--text-muted)',
  textDim: 'var(--text-dim)',

  /** One action per screen. Identity gold, the shield and the masthead, is a
   * separate role and does not spend this. */
  gold: 'var(--gold)',
  goldLit: 'var(--gold-lit)',
  goldDeep: 'var(--gold-deep)',
  onGold: 'var(--on-gold)',
  /** The ground behind a rendered preview of a dealer's page. White on
   * purpose: it is their page, not a portal surface. */
  previewGround: 'var(--preview-ground)',
  /** The bar painted over a customer's details in recording mode. */
  redact: 'var(--redact)',

  /** The chart series, in order. Several things told apart at a glance;
   * never a judgement about any of them. Anything drawn with these also
   * carries a pattern or a label, so the colour is never the only thing
   * doing the work. */
  series: [
    'var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)',
    'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)',
  ],
  seriesLine: 'var(--series-line)',
  /** Readable on the gold warning wash. */
  onWarn: 'var(--on-warn)',

  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  badSoft: 'var(--bad-soft)',
  info: 'var(--info)',

  lift1: 'var(--lift-1)',
  lift2: 'var(--lift-2)',
  lift3: 'var(--lift-3)',
  topEdge: 'var(--top-edge)',
  /** The lit top edge plus a visible outline. On a near black page a drop
   * shadow has nothing to fall on, so this is what actually makes a card read
   * as an object. Use it wherever a card used to have a plain 1px border. */
  edge: 'var(--edge)',

  ease: 'var(--ease)',
  fast: 'var(--fast)',
  normal: 'var(--normal)',
} as const;

/* ---------------------------------------------------------------------- *
 * The three surface treatments, so a card is built the same way everywhere.
 * ---------------------------------------------------------------------- */

/** A card on the page. A shadow below and a lit top edge, which together are
 * what make a rectangle read as a physical object rather than a coloured area.
 * No border: the elevation is doing that work now. */
export const card: CSSProperties = {
  background: T.surface,
  borderRadius: 10,
  boxShadow: `${T.topEdge}, ${T.lift1}`,
};

/** Something sitting on a card: a row, a hovered item, an active tab. */
export const raised: CSSProperties = {
  background: T.raised,
  borderRadius: 8,
  boxShadow: `${T.topEdge}, ${T.lift1}`,
};

/** A modal, a popover, a dropdown. Lifted far enough that the page reads as
 * being behind it rather than beside it. */
export const overlay: CSSProperties = {
  background: T.overlay,
  borderRadius: 12,
  boxShadow: `${T.topEdge}, ${T.lift3}`,
};

/**
 * The primary button, and the one piece of deliberate character in the set.
 *
 * The logo is machined gold on a shield, so gold behaves like metal rather than
 * like a colour: a vertical gradient so it catches light, a lighter line along
 * the top edge, and a soft bloom underneath so it reads as the thing emitting
 * light on the screen. That is what stops a primary button looking like every
 * other framework's primary button, and it costs one gradient.
 */
export const goldButton: CSSProperties = {
  background: `linear-gradient(180deg, ${T.goldLit} 0%, ${T.gold} 46%, ${T.goldDeep} 100%)`,
  color: T.onGold,
  border: 'none',
  borderRadius: 8,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.45), 0 1px 2px rgba(0,0,0,.4), 0 6px 18px rgba(245,197,24,.18)',
  fontWeight: 700,
  cursor: 'pointer',
  transition: `filter var(--fast) var(--ease), box-shadow var(--fast) var(--ease)`,
};

/** A quiet button. Present, pressable, and not competing with the gold one. */
export const quietButton: CSSProperties = {
  background: T.raised,
  color: T.text,
  border: `1px solid ${T.line}`,
  borderRadius: 8,
  fontWeight: 600,
  cursor: 'pointer',
  transition: `background var(--fast) var(--ease), border-color var(--fast) var(--ease)`,
};

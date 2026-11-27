'use client';

// components/Lesson.tsx
//
// A LESSON, LAID OUT - AND THE SAME LESSON, EDITABLE.
//
// "Needs to be able to have font design so it isnt just written text."
//
// So the page is typeset rather than printed: a measure that stops at 66
// characters because longer lines are genuinely harder to read, a scale
// where a heading is a heading at a glance, the one sentence that matters
// set large in his gold, and the things that interrupt - a rule, a warning,
// a list of steps - looking like they interrupt.
//
// The reading view and the editing view are the same list of blocks in the
// same order, which is the whole reason a lesson is stored as blocks. What
// he types into is a plain box; what he gets is a page.

import { useRef, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn } from './kit';
import { Row, Says } from './parts';
import { BLOCK_NAMES, emptyBlock, type Block } from '@/lib/blocks';

const MEASURE = '66ch';

/* ---------------------------------------------------------------------- *
 * READING
 * ---------------------------------------------------------------------- */

export function LessonView({ blocks }: { blocks: Block[] }) {
  return (
    <article style={{ maxWidth: MEASURE }}>
      {blocks.map((b, i) => <Piece key={i} b={b} />)}
    </article>
  );
}

function Piece({ b }: { b: Block }) {
  switch (b.type) {
    case 'heading':
      return (
        <h3 style={{
          fontSize: b.level === 3 ? 20 : 26,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
          color: T.text,
          /* More space above than below. A heading belongs to what comes
           * after it, and equal space makes it float between the two. */
          margin: b.level === 3 ? '30px 0 10px' : '40px 0 14px',
        }}>{b.text}</h3>
      );

    case 'text':
      return (
        <p style={{
          fontSize: 16, lineHeight: 1.72, color: T.textMuted, margin: '0 0 18px',
        }}>{b.text}</p>
      );

    case 'pull':
      return (
        <blockquote style={{
          margin: '32px 0', padding: '4px 0 4px 22px',
          borderLeft: `3px solid ${T.gold}`,
          fontSize: 22, lineHeight: 1.45, fontWeight: 700,
          letterSpacing: '-0.01em', color: T.text,
        }}>{b.text}</blockquote>
      );

    case 'note':
      return (
        <aside style={{
          margin: '26px 0', padding: '18px 20px', borderRadius: 14,
          background: b.tone === 'warn'
            ? `color-mix(in srgb, ${T.warn} 12%, transparent)`
            : T.surfaceGrad,
          border: `1px solid ${b.tone === 'warn' ? T.warn : T.line}`,
          fontSize: 15, lineHeight: 1.65,
          color: b.tone === 'warn' ? T.onWarn : T.textMuted,
        }}>{b.text}</aside>
      );

    case 'steps':
      return (
        <ol style={{ margin: '24px 0', padding: 0, listStyle: 'none', counterReset: 'step' }}>
          {b.items.filter(Boolean).map((item, i) => (
            <li key={i} style={{
              display: 'flex', gap: 14, alignItems: 'flex-start', margin: '0 0 14px',
              fontSize: 16, lineHeight: 1.65, color: T.textMuted,
            }}>
              <span style={{
                flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                background: T.raised, border: `1px solid ${T.line}`,
                color: T.gold, fontSize: 14, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 1,
              }}>{i + 1}</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );

    case 'table':
      return (
        <div style={{ margin: '26px 0', overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 15 }}>
            <thead>
              <tr>
                {b.head.map((h, i) => (
                  <th key={i} style={{
                    textAlign: 'left', padding: '11px 14px',
                    borderBottom: `1px solid ${T.line}`,
                    fontSize: 13, fontWeight: 700, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: T.textDim, whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, n) => (
                    <td key={n} style={{
                      padding: '11px 14px', borderBottom: `1px solid ${T.lineSoft}`,
                      color: T.textMuted, lineHeight: 1.55, verticalAlign: 'top',
                    }}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'image':
      return b.url ? (
        <figure style={{ margin: '28px 0' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.url} alt={b.caption || ''} style={{
            width: '100%', borderRadius: 14, border: `1px solid ${T.line}`, display: 'block',
          }} />
          {b.caption ? (
            <figcaption style={{ fontSize: 13, color: T.textDim, marginTop: 9, lineHeight: 1.55 }}>
              {b.caption}
            </figcaption>
          ) : null}
        </figure>
      ) : null;

    default:
      return null;
  }
}

/* ---------------------------------------------------------------------- *
 * EDITING
 * ---------------------------------------------------------------------- */

const box = {
  width: '100%', background: T.ink, color: T.text,
  border: `1px solid ${T.line}`, borderRadius: 10,
  padding: '11px 13px', fontSize: 15, fontFamily: 'inherit',
  lineHeight: 1.6, resize: 'vertical' as const,
};

export function LessonEditor({
  blocks, onChange,
}: {
  blocks: Block[];
  onChange: (b: Block[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  const put = (i: number, b: Block) => onChange(blocks.map((x, n) => (n === i ? b : x)));
  const drop = (i: number) => onChange(blocks.filter((_, n) => n !== i));
  const move = (i: number, by: number) => {
    const to = i + by;
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[to]] = [next[to], next[i]];
    onChange(next);
  };

  return (
    <div>
      {blocks.map((b, i) => (
        <div key={i} style={{
          background: T.surfaceGrad, border: `1px solid ${T.line}`,
          borderRadius: 14, padding: '14px 16px', marginBottom: 12,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, marginBottom: 10, flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: 13, fontWeight: 700, letterSpacing: '0.12em',
              color: T.textDim, textTransform: 'uppercase',
            }}>{BLOCK_NAMES[b.type]}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <Tiny onClick={() => move(i, -1)} disabled={i === 0}>Up</Tiny>
              <Tiny onClick={() => move(i, 1)} disabled={i === blocks.length - 1}>Down</Tiny>
              <Tiny onClick={() => drop(i)}>Remove</Tiny>
            </div>
          </div>
          <Fields b={b} onChange={(next) => put(i, next)} />
        </div>
      ))}

      {adding ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          {(Object.keys(BLOCK_NAMES) as Block['type'][]).map((t) => (
            <Btn key={t} kind="quiet" onClick={() => { onChange([...blocks, emptyBlock(t)]); setAdding(false); }}>
              {BLOCK_NAMES[t]}
            </Btn>
          ))}
          <Btn kind="quiet" onClick={() => setAdding(false)}>Not now</Btn>
        </div>
      ) : (
        <Btn onClick={() => setAdding(true)}>Add something</Btn>
      )}
    </div>
  );
}

function Tiny({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 999, padding: '6px 13px', minHeight: 32,
        fontSize: 13, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
        background: 'transparent', color: disabled ? T.textDim : T.textMuted,
        border: `1px solid ${T.lineSoft}`,
      }}
    >{children}</button>
  );
}

function Fields({ b, onChange }: { b: Block; onChange: (b: Block) => void }) {
  if (b.type === 'steps') {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {b.items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 14, color: T.gold, fontWeight: 800, width: 18 }}>{i + 1}</span>
            <input
              value={item}
              onChange={(e) => onChange({ ...b, items: b.items.map((x, n) => (n === i ? e.target.value : x)) })}
              style={box}
            />
            <Tiny onClick={() => onChange({ ...b, items: b.items.filter((_, n) => n !== i) })}>x</Tiny>
          </div>
        ))}
        <Row><Tiny onClick={() => onChange({ ...b, items: [...b.items, ''] })}>Another step</Tiny></Row>
      </div>
    );
  }

  if (b.type === 'table') {
    const setCell = (r: number, c: number, v: string) =>
      onChange({ ...b, rows: b.rows.map((row, i) => (i === r ? row.map((x, n) => (n === c ? v : x)) : row)) });
    return (
      <div style={{ display: 'grid', gap: 8, overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {b.head.map((h, i) => (
            <input
              key={i}
              value={h}
              placeholder={`Column ${i + 1}`}
              onChange={(e) => onChange({ ...b, head: b.head.map((x, n) => (n === i ? e.target.value : x)) })}
              style={{ ...box, fontWeight: 700, minWidth: 130 }}
            />
          ))}
        </div>
        {b.rows.map((row, r) => (
          <div key={r} style={{ display: 'flex', gap: 8 }}>
            {row.map((c, n) => (
              <input key={n} value={c} onChange={(e) => setCell(r, n, e.target.value)} style={{ ...box, minWidth: 130 }} />
            ))}
            <Tiny onClick={() => onChange({ ...b, rows: b.rows.filter((_, i) => i !== r) })}>x</Tiny>
          </div>
        ))}
        <Row>
          <Tiny onClick={() => onChange({ ...b, rows: [...b.rows, b.head.map(() => '')] })}>Another row</Tiny>
          <Tiny onClick={() => onChange({ ...b, head: [...b.head, ''], rows: b.rows.map((r) => [...r, '']) })}>Another column</Tiny>
        </Row>
      </div>
    );
  }

  if (b.type === 'image') {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <input value={b.url} placeholder="the picture's address" onChange={(e) => onChange({ ...b, url: e.target.value })} style={box} />
        <input value={b.caption || ''} placeholder="what it is (optional)" onChange={(e) => onChange({ ...b, caption: e.target.value })} style={box} />
      </div>
    );
  }

  if (b.type === 'heading') {
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} style={{ ...box, flex: '999 1 240px', fontWeight: 700 }} />
        <select
          value={String(b.level || 2)}
          onChange={(e) => onChange({ ...b, level: e.target.value === '3' ? 3 : 2 })}
          style={{ ...box, width: 'auto' }}
        >
          <option value="2">Big</option>
          <option value="3">Smaller</option>
        </select>
      </div>
    );
  }

  if (b.type === 'note') {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <textarea value={b.text} rows={3} onChange={(e) => onChange({ ...b, text: e.target.value })} style={box} />
        <select
          value={b.tone || 'plain'}
          onChange={(e) => onChange({ ...b, tone: e.target.value === 'warn' ? 'warn' : 'plain' })}
          style={{ ...box, width: 'auto' }}
        >
          <option value="plain">Just a box</option>
          <option value="warn">A warning</option>
        </select>
      </div>
    );
  }

  return (
    <textarea
      value={b.text}
      rows={b.type === 'pull' ? 2 : 5}
      onChange={(e) => onChange({ ...b, text: e.target.value } as Block)}
      style={box}
    />
  );
}

/* ---------------------------------------------------------------------- *
 * BRINGING IN A FILE
 * ---------------------------------------------------------------------- */

export function BringIn({
  onBlocks, busy,
}: {
  onBlocks: (blocks: Block[], name: string) => Promise<void> | void;
  busy: boolean;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [says, setSays] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const pick = async (file: File | null) => {
    if (!file) return;
    setReading(true); setSays(null);
    try {
      const { readFile } = await import('@/lib/courses');
      const got = await readFile(file);
      if (!got.blocks.length) { setSays('There was nothing in that file to lay out.'); return; }
      await onBlocks(got.blocks, got.source_name);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That file could not be read.');
    } finally {
      setReading(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept=".docx,.txt,.md,.markdown,.csv,.tsv"
        onChange={(e) => void pick(e.target.files?.[0] ?? null)}
        style={{ display: 'none' }}
      />
      <Btn onClick={() => input.current?.click()} disabled={busy || reading}>
        {reading ? 'Reading it' : 'Bring in a document'}
      </Btn>
      <span style={{ display: 'block', fontSize: 13, color: T.textDim, marginTop: 8, lineHeight: 1.6, maxWidth: '62ch' }}>
        Word (.docx), plain text (.txt, .md), or a sheet saved as .csv. From
        Google Docs or Sheets use File, Download and pick Word or Comma
        Separated Values - that needs no sign in and no sharing settings.
        Word headings come through as headings.
      </span>
      <Says text={says} />
    </div>
  );
}

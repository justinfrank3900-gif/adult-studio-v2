// lib/blocks.ts
//
// WHAT A LESSON IS MADE OF.
//
// "Needs to be able to have font design so it isnt just written text."
//
// A lesson stored as one long string can only ever be rendered one way, and
// every attempt to make it look like something turns into parsing it back
// out again. So a lesson is an ordered list of TYPED blocks: the layout is
// data, the editor is a list, and a new kind of block is a new case rather
// than a new parser.
//
// The set is deliberately small. Eleven kinds of box is a page builder, and
// a page builder is a thing people fight with instead of writing. These
// seven are the shapes a lesson actually takes.

export type Block =
  | { type: 'heading'; text: string; level?: 2 | 3 }
  | { type: 'text'; text: string }
  /** The sentence the lesson is really about. Set large, in his gold. */
  | { type: 'pull'; text: string }
  /** A box that interrupts: a warning, a rule, a thing not to get wrong. */
  | { type: 'note'; text: string; tone?: 'warn' | 'plain' }
  /** Do this, then this. Numbered because the order is the point. */
  | { type: 'steps'; items: string[] }
  /** Rows out of a spreadsheet, kept as a table rather than flattened. */
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'image'; url: string; caption?: string };

export const BLOCK_NAMES: Record<Block['type'], string> = {
  heading: 'A heading',
  text: 'Writing',
  pull: 'The line that matters',
  note: 'A box that interrupts',
  steps: 'Numbered steps',
  table: 'A table',
  image: 'A picture',
};

export function emptyBlock(type: Block['type']): Block {
  switch (type) {
    case 'heading': return { type: 'heading', text: '', level: 2 };
    case 'pull': return { type: 'pull', text: '' };
    case 'note': return { type: 'note', text: '', tone: 'plain' };
    case 'steps': return { type: 'steps', items: [''] };
    case 'table': return { type: 'table', head: ['', ''], rows: [['', '']] };
    case 'image': return { type: 'image', url: '', caption: '' };
    default: return { type: 'text', text: '' };
  }
}

/** Anything that is not one of ours is dropped rather than rendered as a
 *  blank. A lesson is read by people; a mystery box in the middle of one is
 *  worse than a missing paragraph. */
export function cleanBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [];
  for (const b of raw) {
    if (!b || typeof b !== 'object') continue;
    const t = (b as { type?: unknown }).type;
    const o = b as Record<string, unknown>;
    if (t === 'heading' && typeof o.text === 'string') {
      out.push({ type: 'heading', text: o.text, level: o.level === 3 ? 3 : 2 });
    } else if (t === 'text' && typeof o.text === 'string') {
      out.push({ type: 'text', text: o.text });
    } else if (t === 'pull' && typeof o.text === 'string') {
      out.push({ type: 'pull', text: o.text });
    } else if (t === 'note' && typeof o.text === 'string') {
      out.push({ type: 'note', text: o.text, tone: o.tone === 'warn' ? 'warn' : 'plain' });
    } else if (t === 'steps' && Array.isArray(o.items)) {
      out.push({ type: 'steps', items: o.items.map(String) });
    } else if (t === 'table' && Array.isArray(o.head) && Array.isArray(o.rows)) {
      out.push({
        type: 'table',
        head: (o.head as unknown[]).map(String),
        rows: (o.rows as unknown[]).map((r) => (Array.isArray(r) ? r.map(String) : [String(r)])),
      });
    } else if (t === 'image' && typeof o.url === 'string') {
      out.push({ type: 'image', url: o.url, caption: typeof o.caption === 'string' ? o.caption : '' });
    }
  }
  return out;
}

/** Roughly how long this lesson takes to read, for the card. */
export function minutesOf(blocks: Block[]): number {
  let words = 0;
  for (const b of blocks) {
    if (b.type === 'steps') words += b.items.join(' ').split(/\s+/).length;
    else if (b.type === 'table') words += b.rows.flat().join(' ').split(/\s+/).length;
    else if (b.type === 'image') words += 12;
    else words += String((b as { text: string }).text || '').split(/\s+/).length;
  }
  return Math.max(1, Math.round(words / 220));
}

/* ---------------------------------------------------------------------- *
 * BRINGING IN WRITING THAT ALREADY EXISTS
 *
 * "I need to be able to upload google docs or sheets as well of written
 * stuff I have."
 *
 * Google's own export is the path of least resistance: File - Download -
 * .docx for a doc, .csv for a sheet. That needs no OAuth, no sharing
 * settings and no permission screen, and it works for anything else he has
 * lying around too.
 * ---------------------------------------------------------------------- */

/**
 * Plain writing into blocks.
 *
 * Blank lines separate paragraphs, which is how everybody already writes.
 * Lines starting with a number or a bullet become steps. A markdown hash is
 * taken at its word.
 *
 * THE HARD PART IS THE SHORT LINE WITH NO FULL STOP.
 *
 * It might be a heading. It might equally be one item of a list somebody
 * typed without bullets, which is how most people write a list. The first
 * version of this called every short line a heading, and the first real
 * file put through it - a workout plan, 52 paragraphs, no Word styles at
 * all - came back as forty-seven headings and four paragraphs. That is not
 * a lesson with headings in it, that is a lesson with nothing in it.
 *
 * So a short line is only a heading when it behaves like one: it is ALONE,
 * and the thing after it is longer than it. A heading introduces something.
 * Two or more short lines in a row are a list, because that is what two or
 * more short lines in a row almost always are.
 */
/** A run of short lines longer than this is a document, not a list. */
const LONGEST_LIST = 12;

export function blocksFromText(text: string): Block[] {
  const paras = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  /** A paragraph that could be a heading OR could be a list item. */
  const shortish = (p: string) => {
    const lines = p.split('\n').filter(Boolean);
    if (lines.length !== 1) return false;
    const l = lines[0];
    return l.length <= 70 && !/[.!?,;]$/.test(l) && l.split(/\s+/).length <= 10;
  };

  const out: Block[] = [];
  let i = 0;

  while (i < paras.length) {
    const para = paras[i];
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);

    /* Explicit markdown wins over any guessing. */
    const md = lines.length === 1 ? /^(#{1,6})\s+(.*)$/.exec(lines[0]) : null;
    if (md) {
      out.push({ type: 'heading', text: md[2].trim(), level: md[1].length <= 2 ? 2 : 3 });
      i++;
      continue;
    }

    /* A bulleted or numbered block, written as one paragraph. */
    const bulleted = lines.filter((l) => /^(\d+[.)]\s|[-*•]\s)/.test(l));
    if (bulleted.length >= 2 && bulleted.length === lines.length) {
      out.push({ type: 'steps', items: lines.map((l) => l.replace(/^(\d+[.)]\s|[-*•]\s)/, '').trim()) });
      i++;
      continue;
    }

    if (shortish(para)) {
      /* How many short ones in a row? */
      let n = i;
      while (n < paras.length && shortish(paras[n])) n++;
      const run = paras.slice(i, n).map((p) => p.replace(/^(\d+[.)]\s|[-*•]\s)/, '').trim());

      if (run.length >= 2 && run.length <= LONGEST_LIST) {
        out.push({ type: 'steps', items: run });
      } else if (run.length > LONGEST_LIST) {
        /* FIFTY SHORT LINES IS NOT A LIST OF FIFTY THINGS.
         *
         * It is a document somebody typed with hard returns instead of
         * paragraphs, and the workout plan that broke the first version of
         * this is exactly that: 52 lines, no Word styles, no bullets.
         * Calling it one fifty-item list is a worse lie than calling it
         * fifty paragraphs, because a fifty-item list cannot be read and
         * cannot be edited, while paragraphs can be promoted to headings
         * one at a time by somebody who knows which ones they are. */
        for (const one of run) out.push({ type: 'text', text: one });
      } else if (n < paras.length && !shortish(paras[n])) {
        /* Alone, and something longer follows it. That is a heading. */
        out.push({ type: 'heading', text: run[0], level: 2 });
      } else {
        /* Alone at the very end, introducing nothing. */
        out.push({ type: 'text', text: run[0] });
      }
      i = n;
      continue;
    }

    out.push({ type: 'text', text: lines.join(' ') });
    i++;
  }

  return out;
}

/**
 * A spreadsheet into one table block.
 *
 * Handles quoted cells, because a sheet of written material has commas in
 * it and splitting on every comma turns one sentence into four columns.
 */
export function blocksFromCsv(csv: string): Block[] {
  const rows = parseCsv(csv).filter((r) => r.some((c) => c.trim()));
  if (!rows.length) return [];
  const [head, ...body] = rows;
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '');
  return [{ type: 'table', head: pad(head), rows: body.map(pad) }];
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/\r\n/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(cell); cell = ''; continue; }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

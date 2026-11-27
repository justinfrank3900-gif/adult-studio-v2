// lib/docx.ts
//
// READING A WORD FILE WITHOUT A LIBRARY FOR READING WORD FILES.
//
// A .docx is a zip with an XML file inside it. The whole job here is: find
// word/document.xml in the zip, inflate it, and walk its paragraphs. That
// is about seventy lines of Node's own zlib, against a dependency that
// renders to HTML which would then have to be parsed back into blocks - so
// the library would be doing the easy half and handing back the hard half
// in a different shape.
//
// Doing it by hand also gets the thing the HTML route loses: Word's own
// paragraph STYLE. "Heading 1" in the file becomes a heading block here,
// instead of being guessed at from how short the line is. A Google Doc
// exported as .docx carries those styles, so his own headings survive.
//
// What this deliberately does not do: images, tables, numbering formats,
// footnotes, tracked changes. Those turn a small reader into a Word
// implementation. Text and headings and lists is what a lesson is.

import { inflateRawSync } from 'node:zlib';
import type { Block } from './blocks';
import { blocksFromText } from './blocks';

/** Pull one named file out of a zip. Returns null when it is not there. */
function unzipOne(buf: Buffer, wanted: string): Buffer | null {
  /* The end-of-central-directory record, found from the back because it is
   * the only part of a zip whose position is knowable without reading the
   * whole thing. Up to 64KB because it may carry a comment. */
  const tail = Math.max(0, buf.length - 66_000);
  let eocd = -1;
  for (let i = buf.length - 22; i >= tail; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) return null;

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localAt = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    if (name === wanted) {
      /* The local header repeats the name and extra fields, and its extra
       * length can differ from the central one - reading the central
       * directory's number here is a classic way to land mid-file. */
      const lnLen = buf.readUInt16LE(localAt + 26);
      const leLen = buf.readUInt16LE(localAt + 28);
      const start = localAt + 30 + lnLen + leLen;
      const raw = buf.subarray(start, start + compressed);
      return method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
    }

    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const unescapeXml = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

/** The words of one <w:p>, with its style name. */
function paragraphsOf(xml: string): { text: string; style: string }[] {
  const out: { text: string; style: string }[] = [];
  const paras = xml.split(/<w:p[\s>]/).slice(1);

  for (const chunk of paras) {
    const body = chunk.slice(0, chunk.indexOf('</w:p>') === -1 ? undefined : chunk.indexOf('</w:p>'));

    const style = /<w:pStyle[^>]*w:val="([^"]*)"/.exec(body)?.[1] || '';

    let text = '';
    const runs = body.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g);
    for (const r of runs) text += unescapeXml(r[1]);
    /* Word writes a line break inside a paragraph as its own tag rather
     * than as a character. Without this, two lines become one word. */
    text = text.replace(/\s+/g, ' ').trim();
    if (body.includes('<w:br')) text = text.trim();

    out.push({ text, style });
  }
  return out;
}

const headingLevel = (style: string): 2 | 3 | null => {
  const m = /^Heading([1-6])$/i.exec(style.replace(/\s+/g, ''));
  if (!m) return style.toLowerCase() === 'title' ? 2 : null;
  return Number(m[1]) <= 2 ? 2 : 3;
};

const isList = (style: string) => /list|bullet/i.test(style);

/**
 * A Word file as blocks.
 *
 * Headings come from Word's own styles. Runs of list paragraphs collapse
 * into one steps block, because twenty one-line blocks is not a list, it is
 * twenty blocks.
 */
export function blocksFromDocx(buf: Buffer): Block[] {
  const xmlBuf = unzipOne(buf, 'word/document.xml');
  if (!xmlBuf) {
    throw new Error('That does not look like a Word file inside - word/document.xml is not in it. If it came from Google Docs, use File, Download, Microsoft Word (.docx).');
  }
  const paras = paragraphsOf(xmlBuf.toString('utf8'));

  const out: Block[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) { out.push({ type: 'steps', items: list }); list = []; }
  };

  for (const { text, style } of paras) {
    if (!text) { flush(); continue; }

    if (isList(style)) { list.push(text); continue; }
    flush();

    const level = headingLevel(style);
    if (level) { out.push({ type: 'heading', text, level }); continue; }

    out.push({ type: 'text', text });
  }
  flush();

  /* A file with no styles at all - plenty of them - reads as one long run
   * of paragraphs. Fall through to the plain-text reader so that at least
   * the short lines become headings. */
  if (out.length && out.every((b) => b.type === 'text')) {
    return blocksFromText(out.map((b) => (b as { text: string }).text).join('\n\n'));
  }

  return out;
}

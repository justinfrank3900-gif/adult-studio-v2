'use client';

// lib/unzip.ts
//
// A ZIP OF PICTURES, OPENED IN THE BROWSER.
//
// "can i clone a avatar with a zip file of a bunch of images?"
//
// Phones and cameras hand you a folder, and a folder travels as a zip.
// Picking two hundred files out of a file dialog is not a thing anybody
// does twice, so the zip itself is the upload.
//
// NO LIBRARY, AND NO UPLOAD EITHER.
//
// Every browser since 2023 can inflate on its own - DecompressionStream is
// built in - so a zip is read here on his machine. That matters for more
// than neatness: a 400MB holiday folder never crosses the wire, and his
// pictures never touch a server that does not need them. The zip format
// itself is a directory at the END of the file and a header in front of
// each entry, which is about sixty lines to walk.
//
// THE TRAP, WHICH THE WORD READER ALSO HIT.
//
// Each entry appears twice - once in the directory at the back, once in a
// header right before its bytes - and the two can disagree about how long
// the extra field is. The data starts after the LOCAL one. Trusting the
// directory's number puts the read a few bytes off and hands back a
// picture that will not open.

/** Pictures only. A zip of a phone folder is full of other things. */
const PICTURES = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;

/** Formats a canvas cannot draw, so they cannot become a candidate here
 *  however much the name says picture. Apple's own format, mostly. */
const UNREADABLE = /\.(heic|heif)$/i;

export type Unzipped = {
  pictures: { name: string; blob: Blob }[];
  /** Named so the screen can say what was skipped and why, rather than
   *  quietly handing back fewer pictures than the zip holds. */
  skippedUnreadable: string[];
  otherFiles: number;
};

function u16(v: DataView, at: number): number { return v.getUint16(at, true); }
function u32(v: DataView, at: number): number { return v.getUint32(at, true); }

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot unpack a zip on its own. Chrome, Edge or Safari will - or drag the pictures in loose.');
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function typeOf(name: string): string {
  const ext = name.toLowerCase().split('.').pop() || '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'avif') return 'image/avif';
  return 'application/octet-stream';
}

/**
 * Every picture in a zip, in the order the zip lists them.
 *
 * `most` stops a folder of four thousand holiday photographs from being
 * decompressed in full before anybody looks at it - the first few dozen
 * are the choice being made, and the rest is a frozen tab.
 */
export async function picturesInZip(file: File, most = 60): Promise<Unzipped> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  /* The directory at the back. Found by scanning backwards, because its
   * position is the only thing in a zip knowable without reading all of
   * it - and it can carry up to 64KB of comment after it. */
  const floor = Math.max(0, buf.length - 66_000);
  let eocd = -1;
  for (let i = buf.length - 22; i >= floor; i--) {
    if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) {
    throw new Error('That does not look like a zip file inside - the directory a zip keeps at its end is not there. If it came from a phone, send the pictures themselves.');
  }

  const count = u16(view, eocd + 10);
  let at = u32(view, eocd + 16);

  const pictures: { name: string; blob: Blob }[] = [];
  const skippedUnreadable: string[] = [];
  let otherFiles = 0;

  for (let n = 0; n < count && at + 46 <= buf.length; n++) {
    if (u32(view, at) !== 0x02014b50) break;

    const how = u16(view, at + 10);
    const packed = u32(view, at + 20);
    const nameLen = u16(view, at + 28);
    const extraLen = u16(view, at + 30);
    const commentLen = u16(view, at + 32);
    const where = u32(view, at + 42);
    const name = new TextDecoder().decode(buf.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;

    /* A folder, or the junk drawer a Mac puts in every zip it makes. */
    if (name.endsWith('/') || name.startsWith('__MACOSX/') || name.split('/').pop()?.startsWith('.')) continue;

    if (!PICTURES.test(name)) { otherFiles++; continue; }
    if (UNREADABLE.test(name)) { skippedUnreadable.push(name.split('/').pop() || name); continue; }
    if (pictures.length >= most) continue;

    /* THE LOCAL HEADER DECIDES WHERE THE BYTES START, not the directory. */
    if (where + 30 > buf.length || u32(view, where) !== 0x04034b50) continue;
    const localName = u16(view, where + 26);
    const localExtra = u16(view, where + 28);
    const from = where + 30 + localName + localExtra;
    const raw = buf.subarray(from, from + packed);
    if (!raw.length) continue;

    try {
      /* 0 is stored as-is, 8 is deflate. Anything else is a zip made by
       * something unusual, and guessing at it would hand back a broken
       * picture rather than an honest miss. */
      const bytes = how === 0 ? raw : how === 8 ? await inflateRaw(raw) : null;
      if (!bytes) { otherFiles++; continue; }
      pictures.push({ name: name.split('/').pop() || name, blob: new Blob([bytes as BlobPart], { type: typeOf(name) }) });
    } catch {
      otherFiles++;
    }
  }

  if (pictures.length === 0 && skippedUnreadable.length === 0) {
    throw new Error(`There are no pictures in that zip that a browser can open${otherFiles ? ` - ${otherFiles} other ${otherFiles === 1 ? 'file' : 'files'} in it were left alone` : ''}.`);
  }

  return { pictures, skippedUnreadable, otherFiles };
}

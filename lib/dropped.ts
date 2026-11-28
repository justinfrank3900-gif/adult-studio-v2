'use client';

// lib/dropped.ts
//
// WHAT CAME OFF THE END OF A DRAG.
//
// A drop looks like one thing and is really three. The browser hands over
// `dataTransfer.files` for plain files, which is the easy case and the only
// one most code handles. But a FOLDER dragged in appears in that list as a
// single zero-length entry that is not a file at all - so the obvious
// implementation silently reads nothing and says nothing, which is the
// worst failure a drop zone can have.
//
// The folder lives on `dataTransfer.items` instead, behind
// `webkitGetAsEntry`, and has to be walked. That walk is the whole reason
// this file exists.
//
// AND THE READER HAS TO BE CALLED IN A LOOP.
//
// `readEntries` does not return a directory's contents. It returns the
// NEXT BATCH of them - a hundred at a time in Chrome - and an empty array
// when there are no more. Calling it once on a folder of two hundred
// photographs gets a hundred of them and no error, which is exactly the
// kind of bug nobody finds until the day it matters.

/** Entries are read while the drop event is still live, so the whole walk
 *  has to finish promptly. A folder deeper than this is a library. */
const DEEPEST = 6;

type Entry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file: (ok: (f: File) => void, no: (e: unknown) => void) => void;
  createReader: () => { readEntries: (ok: (e: Entry[]) => void, no: (e: unknown) => void) => void };
};

function fileOf(entry: Entry): Promise<File | null> {
  return new Promise((resolve) => {
    try { entry.file((f) => resolve(f), () => resolve(null)); }
    catch { resolve(null); }
  });
}

function batchOf(reader: { readEntries: (ok: (e: Entry[]) => void, no: (e: unknown) => void) => void }): Promise<Entry[]> {
  return new Promise((resolve) => {
    try { reader.readEntries((e) => resolve(e || []), () => resolve([])); }
    catch { resolve([]); }
  });
}

async function walk(entry: Entry, into: File[], most: number, depth = 0): Promise<void> {
  if (into.length >= most || depth > DEEPEST) return;

  if (entry.isFile) {
    /* A Mac zips its own metadata alongside, and a folder dragged off one
     * carries the same junk. Dropped here it would become a grid of
     * pictures that will not open. */
    if (entry.name.startsWith('.') || entry.name.startsWith('._')) return;
    const f = await fileOf(entry);
    if (f && f.size > 0) into.push(f);
    return;
  }

  if (!entry.isDirectory) return;
  if (entry.name === '__MACOSX') return;

  const reader = entry.createReader();
  /* IN A LOOP, until a batch comes back empty. One call is a hundred
   * files and a lie. */
  for (;;) {
    const batch = await batchOf(reader);
    if (!batch.length) return;
    for (const child of batch) {
      await walk(child, into, most, depth + 1);
      if (into.length >= most) return;
    }
  }
}

/**
 * Every real file behind a drop, folders walked.
 *
 * Falls back to the plain file list wherever the entry API is missing or
 * gives nothing - a drop that reads no files is never left as silence.
 */
export async function filesDropped(dt: DataTransfer, most = 400): Promise<File[]> {
  const items = Array.from(dt.items || []);
  const entries = items
    .map((i) => {
      const get = (i as unknown as { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry;
      try { return typeof get === 'function' ? get.call(i) : null; } catch { return null; }
    })
    .filter((e): e is Entry => Boolean(e));

  if (entries.length) {
    const out: File[] = [];
    for (const e of entries) {
      await walk(e, out, most);
      if (out.length >= most) break;
    }
    if (out.length) return out;
  }

  return Array.from(dt.files || []).slice(0, most);
}

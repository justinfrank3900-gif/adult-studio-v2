'use client';

// components/Dropper.tsx
//
// THE PLACE YOU DROP A SHOOT, WHEREVER YOU ARE STANDING.
//
// One target, both ways in: dragging onto it and clicking it do the same
// thing. Two separate controls for one job - a button here, a dashed
// rectangle there - is how somebody ends up dragging a folder onto the
// button and watching the page navigate away to it.

import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { T } from '@/lib/tokens';
import { filesDropped } from '@/lib/dropped';
import { MOST_IN_ZIP } from '@/lib/shoot';

export default function Dropper({ onFiles, busy, idle, full, note }: {
  onFiles: (files: File[]) => Promise<void> | void;
  busy: boolean;
  /** What it says with nothing in it yet. */
  idle: string;
  /** What it says once something has been read. */
  full?: string;
  note: string;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  /* Dragging across a child fires leave on the parent, so without a
   * counter the highlight flickers off the moment the pointer crosses
   * the text inside the zone. */
  const depth = useRef(0);

  /* MISSING THE ZONE MUST NOT COST HIM THE PAGE.
   *
   * A file dropped anywhere a browser is not expecting one makes it
   * NAVIGATE to that file, throwing away the screen and anything typed.
   * Cancelled across the window - but only for drags carrying files, so
   * text can still be dragged into the boxes. */
  useEffect(() => {
    const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');
    const stop = (e: DragEvent) => { if (carriesFiles(e)) e.preventDefault(); };
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  const drop = async (e: React.DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    if (busy) return;
    try {
      const files = await filesDropped(e.dataTransfer, MOST_IN_ZIP);
      if (!files.length) return;
      await onFiles(files);
    } catch {
      /* Reported by whoever owns the reading - this only hands over
       * files. */
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*,.zip,application/zip"
        multiple
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          if (input.current) input.current.value = '';
          if (files.length) void onFiles(files);
        }}
        style={{ display: 'none' }}
      />

      <div
        onDragEnter={(e) => { e.preventDefault(); depth.current += 1; setOver(true); }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDragLeave={(e) => { e.preventDefault(); depth.current -= 1; if (depth.current <= 0) { depth.current = 0; setOver(false); } }}
        onDrop={drop}
        onClick={() => { if (!busy) input.current?.click(); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
        style={{
          border: `2px dashed ${over ? T.gold : T.line}`,
          borderRadius: 14,
          background: over ? 'rgba(212,175,85,0.07)' : T.raised,
          padding: '26px 22px',
          textAlign: 'center',
          cursor: busy ? 'default' : 'pointer',
          transition: 'border-color 120ms ease, background 120ms ease',
        }}
      >
        <div style={{
          fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em',
          color: over ? T.gold : T.text, marginBottom: 8,
        }}>
          {over ? 'Let go' : busy ? 'Reading them' : (full || idle)}
        </div>
        <div style={{ fontSize: 13.5, color: T.textDim, lineHeight: 1.6, maxWidth: '54ch', margin: '0 auto' }}>
          {note}
        </div>
      </div>
    </>
  );
}

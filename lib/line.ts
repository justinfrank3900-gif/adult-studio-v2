'use client';

// lib/line.ts
//
// THE LINE: microphone in, her voice out, over one websocket.
//
// All of this runs in the browser and none of it touches the account key -
// the server mints a one-time ticket and the url it comes back in IS the
// credential. The ticket is good once, for about a minute, so the socket is
// opened immediately and never stored.
//
// THREE THINGS MAKE OR BREAK A CALL, AND THEY ARE ALL TIMING.
//
// 1. WHAT GOES UP. The provider wants 16kHz mono PCM16 and a microphone
//    gives 48kHz floats. Converting that on the main thread means every
//    React render is a chance to drop a chunk of his voice, so it happens
//    inside an AudioWorklet - its own thread, unaffected by anything the
//    screen is doing. Where a worklet cannot be loaded there is a fallback
//    that does the same arithmetic the old way.
//
// 2. WHAT COMES DOWN. Her voice arrives as a stream of small pieces at
//    24kHz. Playing each one as it lands leaves a click between every
//    piece, so they are SCHEDULED end to end against the audio clock, with
//    a cursor that only ever moves forward.
//
// 3. INTERRUPTING. When he starts talking over her she has to stop
//    instantly - everything already scheduled is killed and the cursor is
//    reset. Without this she carries on talking into his sentence for
//    however many seconds were already queued, which is the single thing
//    that makes one of these feel like a machine.

export type LineEvent =
  | { kind: 'open' }
  | { kind: 'ready'; voice: string; model: string }
  /** Something was heard from him, or from her. */
  | { kind: 'heard'; who: 'him' | 'her'; text: string; done: boolean }
  | { kind: 'listening' }
  | { kind: 'talking' }
  | { kind: 'thinking' }
  | { kind: 'spent'; turn: number; total: number }
  /** The provider ended the session because it hit its length limit. */
  | { kind: 'expired' }
  | { kind: 'trouble'; message: string; fatal: boolean }
  | { kind: 'closed'; why: string }
  /** Anything the provider sent that this code does not know about. Shown
   *  rather than swallowed, so a changed event name is a readable line on
   *  the screen instead of a call that goes quiet for no reason. */
  | { kind: 'odd'; name: string };

type Send = Record<string, unknown>;

const TARGET_RATE = 16000;
const HER_RATE = 24000;
/** How far ahead of the clock her audio is scheduled. Enough to absorb a
 *  jittery network, short enough that interrupting her feels immediate. */
const LEAD = 0.09;

/* ---------------------------------------------------------------------- *
 * BYTES
 * ---------------------------------------------------------------------- */

function toBase64(bytes: Uint8Array): string {
  let s = '';
  /* In pieces: String.fromCharCode with a hundred thousand arguments
   * throws, and a chunk of microphone audio is well inside that only until
   * somebody raises the buffer size. */
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    s += String.fromCharCode(...bytes.subarray(i, i + STEP));
  }
  return btoa(s);
}

function fromBase64(b64: string): Int16Array {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  /* A PCM16 stream can arrive split on an odd byte. Dropping the stray
   * byte is right; reading past it would put a crack in her voice. */
  const usable = bytes.length - (bytes.length % 2);
  return new Int16Array(bytes.buffer, 0, usable / 2);
}

/* ---------------------------------------------------------------------- *
 * THE WORKLET
 *
 * Resampling is a box average over each output sample's window rather than
 * taking every third sample. Plain decimation folds everything above 8kHz
 * back down into the speech as a metallic edge; averaging the window is
 * both the resample and a gentle filter, for about the same arithmetic.
 * ---------------------------------------------------------------------- */

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${TARGET_RATE};
    this.tail = new Float32Array(0);
    this.out = [];
  }
  process(inputs) {
    const block = inputs[0] && inputs[0][0];
    if (!block) return true;

    const buf = new Float32Array(this.tail.length + block.length);
    buf.set(this.tail, 0);
    buf.set(block, this.tail.length);

    let at = 0;
    while (at + this.ratio <= buf.length) {
      const from = Math.floor(at);
      const to = Math.min(buf.length, Math.floor(at + this.ratio));
      let sum = 0;
      for (let i = from; i < to; i++) sum += buf[i];
      const v = sum / Math.max(1, to - from);
      this.out.push(v < -1 ? -32768 : v > 1 ? 32767 : Math.round(v * 32767));
      at += this.ratio;
    }
    this.tail = buf.slice(Math.floor(at));

    if (this.out.length >= ${TARGET_RATE / 10}) {
      this.port.postMessage(new Int16Array(this.out));
      this.out = [];
    }
    return true;
  }
}
registerProcessor('tap', Tap);
`;

/* ---------------------------------------------------------------------- *
 * HER VOICE, PLAYED END TO END
 * ---------------------------------------------------------------------- */

class Speaker {
  private ctx: AudioContext;
  private cursor = 0;
  private live: AudioBufferSourceNode[] = [];

  constructor(ctx: AudioContext) { this.ctx = ctx; }

  push(pcm: Int16Array): void {
    if (!pcm.length) return;
    const buf = this.ctx.createBuffer(1, pcm.length, HER_RATE);
    const chan = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) chan[i] = pcm[i] / 32768;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    /* The cursor only moves forward. Scheduling against currentTime alone
     * would stack every piece on top of the last one the moment the
     * network delivers two at once. */
    if (this.cursor < now + LEAD) this.cursor = now + LEAD;
    src.start(this.cursor);
    this.cursor += buf.duration;

    this.live.push(src);
    src.onended = () => {
      const at = this.live.indexOf(src);
      if (at >= 0) this.live.splice(at, 1);
    };
  }

  /** Stop her dead and forget what was queued. */
  cut(): void {
    for (const s of this.live) { try { s.stop(); } catch { /* already done */ } }
    this.live = [];
    this.cursor = 0;
  }

  /** Is there still something of hers waiting to be heard? */
  get busy(): boolean { return this.cursor > this.ctx.currentTime; }
}

/* ---------------------------------------------------------------------- *
 * THE CALL
 * ---------------------------------------------------------------------- */

export type Line = {
  /** Say something to her without speaking - used for the opening nudge. */
  type: (text: string) => void;
  /** Stop her talking right now. */
  cut: () => void;
  mute: (quiet: boolean) => void;
  hangUp: () => void;
};

export async function call(opts: {
  url: string;
  model: string;
  onEvent: (e: LineEvent) => void;
}): Promise<Line> {
  const { url, model, onEvent } = opts;

  /* The microphone is asked for FIRST. If he is going to refuse it, or the
   * browser has no device, that should happen before a session is burned -
   * the ticket is good for one try. */
  let mic: MediaStream;
  try {
    mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (e) {
    const why = e instanceof Error ? e.name : '';
    throw new Error(
      why === 'NotAllowedError'
        ? 'The browser blocked the microphone. Allow it for this site - the padlock next to the address - and press call again.'
        : why === 'NotFoundError'
          ? 'There is no microphone on this machine that the browser can see.'
          : 'The microphone could not be opened, so there is nothing to call with.',
    );
  }

  const ctx = new AudioContext();
  /* Opening a call is a click, so this resume is allowed. Without it the
   * tab can hand back a suspended context and she plays into silence. */
  if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* best effort */ } }

  const speaker = new Speaker(ctx);
  const source = ctx.createMediaStreamSource(mic);
  let quiet = false;
  let shut = false;

  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  const send = (payload: Send) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  };

  const upload = (pcm: Int16Array) => {
    if (quiet || shut) return;
    send({ type: 'input_audio_buffer.append', audio: toBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)) });
  };

  /* ------------------------------------------------------ the microphone */
  let node: AudioNode | null = null;
  let fallback: ScriptProcessorNode | null = null;

  try {
    const blob = new Blob([WORKLET], { type: 'application/javascript' });
    const href = URL.createObjectURL(blob);
    try {
      await ctx.audioWorklet.addModule(href);
    } finally { URL.revokeObjectURL(href); }

    const tap = new AudioWorkletNode(ctx, 'tap');
    tap.port.onmessage = (ev) => upload(ev.data as Int16Array);
    source.connect(tap);
    /* Connected to nothing audible on purpose: some browsers stop pulling
     * audio through a node that goes nowhere, and a muted gain is the
     * standard way to keep the graph running without hearing himself. */
    const silent = ctx.createGain();
    silent.gain.value = 0;
    tap.connect(silent).connect(ctx.destination);
    node = tap;
  } catch {
    /* No worklet - usually a browser too old or a page that will not load
     * a blob module. Same arithmetic, on the main thread. */
    const ratio = ctx.sampleRate / TARGET_RATE;
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    let tail = new Float32Array(0);
    proc.onaudioprocess = (ev) => {
      const block = ev.inputBuffer.getChannelData(0);
      const buf = new Float32Array(tail.length + block.length);
      buf.set(tail, 0); buf.set(block, tail.length);
      const out: number[] = [];
      let at = 0;
      while (at + ratio <= buf.length) {
        const from = Math.floor(at);
        const to = Math.min(buf.length, Math.floor(at + ratio));
        let sum = 0;
        for (let i = from; i < to; i++) sum += buf[i];
        const v = sum / Math.max(1, to - from);
        out.push(v < -1 ? -32768 : v > 1 ? 32767 : Math.round(v * 32767));
        at += ratio;
      }
      tail = buf.slice(Math.floor(at));
      if (out.length) upload(new Int16Array(out));
    };
    const silent = ctx.createGain();
    silent.gain.value = 0;
    source.connect(proc); proc.connect(silent); silent.connect(ctx.destination);
    fallback = proc;
  }

  /* ----------------------------------------------------------- shutting down */
  const shutDown = (why: string) => {
    if (shut) return;
    shut = true;
    speaker.cut();
    try { if (node) node.disconnect(); } catch { /* gone */ }
    try { if (fallback) { fallback.onaudioprocess = null; fallback.disconnect(); } } catch { /* gone */ }
    try { source.disconnect(); } catch { /* gone */ }
    for (const t of mic.getTracks()) { try { t.stop(); } catch { /* gone */ } }
    try { if (ws.readyState <= WebSocket.OPEN) ws.close(); } catch { /* gone */ }
    void ctx.close().catch(() => {});
    onEvent({ kind: 'closed', why });
  };

  /* -------------------------------------------------------------- the socket */
  ws.onopen = () => onEvent({ kind: 'open' });

  ws.onerror = () => {
    /* A websocket error carries nothing useful by design, so this says what
     * it actually means rather than pretending to know. */
    onEvent({
      kind: 'trouble',
      message: 'The line to the provider dropped. That is usually the one-time ticket having already been used or timed out - press call again.',
      fatal: true,
    });
  };

  ws.onclose = (ev) => {
    if (shut) return;
    shutDown(ev.code === 1000 ? 'hung up' : `the line closed (${ev.code})`);
  };

  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return;
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(ev.data) as Record<string, unknown>; } catch { return; }
    const name = String(msg.type || '');

    switch (name) {
      case 'session.created':
      case 'session.updated': {
        const s = (msg.session || {}) as { voice?: string; model?: string };
        onEvent({ kind: 'ready', voice: String(s.voice || ''), model: String(s.model || model) });
        return;
      }

      case 'input_audio_buffer.speech_started': {
        /* HE HAS STARTED TALKING OVER HER.
         *
         * Everything of hers already scheduled is thrown away before the
         * cancel goes up, because the cancel only stops what has not been
         * sent yet - the seconds already in the speaker would keep playing
         * into his sentence otherwise. */
        if (speaker.busy) {
          speaker.cut();
          /* Only the first live model takes this; the second ignores it
           * and answers with an unsupported_event we would then have to
           * explain away on screen. */
          if (model === 'spicy-live-1') send({ type: 'response.cancel' });
        }
        onEvent({ kind: 'listening' });
        return;
      }

      case 'input_audio_buffer.speech_stopped':
        onEvent({ kind: 'thinking' });
        return;

      case 'response.audio.delta':
      case 'response.output_audio.delta': {
        const b64 = String(msg.delta || msg.audio || '');
        if (b64) { speaker.push(fromBase64(b64)); onEvent({ kind: 'talking' }); }
        return;
      }

      case 'conversation.item.input_audio_transcription.delta':
        onEvent({ kind: 'heard', who: 'him', text: String(msg.delta || ''), done: false });
        return;

      case 'conversation.item.input_audio_transcription.completed':
        onEvent({ kind: 'heard', who: 'him', text: String(msg.transcript || ''), done: true });
        return;

      case 'response.audio_transcript.delta':
      case 'response.output_audio_transcript.delta':
        onEvent({ kind: 'heard', who: 'her', text: String(msg.delta || ''), done: false });
        return;

      case 'response.audio_transcript.done':
      case 'response.output_audio_transcript.done':
        onEvent({ kind: 'heard', who: 'her', text: String(msg.transcript || ''), done: true });
        return;

      case 'spicy.usage': {
        const turn = Number(msg.cost_usd || 0);
        const total = Number(msg.total_cost_usd || 0);
        onEvent({ kind: 'spent', turn, total });
        return;
      }

      case 'spicy.session_expired':
        onEvent({ kind: 'expired' });
        return;

      case 'error': {
        const e = (msg.error || msg) as { message?: string; code?: string };
        const code = String(e.code || '');
        /* Four of theirs end the call and the rest are noise worth seeing
         * but not worth hanging up over. */
        const fatal = ['payment_required', 'content_blocked', 'moderation_unavailable', 'upstream_unavailable'].includes(code);
        const message =
          code === 'payment_required' ? 'The provider says the balance ran out, so the call ended.'
            : code === 'content_blocked' ? 'The provider blocked that and ended the call.'
              : code === 'moderation_unavailable' ? 'The provider could not run its own checks, so it ended the call. Nothing is wrong at this end.'
                : code === 'upstream_unavailable' ? 'The provider dropped the call at their end.'
                  : String(e.message || `The provider complained: ${code || 'no reason given'}`);
        onEvent({ kind: 'trouble', message, fatal });
        if (fatal) shutDown(message);
        return;
      }

      case 'response.created':
      case 'response.done':
      case 'input_audio_buffer.committed':
      case 'conversation.item.created':
      case 'rate_limits.updated':
        return;

      default:
        onEvent({ kind: 'odd', name });
    }
  };

  return {
    type: (text: string) => {
      if (!text.trim()) return;
      send({
        type: 'conversation.item.create',
        item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
      });
      if (model === 'spicy-live-1') send({ type: 'response.create' });
    },
    cut: () => {
      speaker.cut();
      if (model === 'spicy-live-1') send({ type: 'response.cancel' });
    },
    mute: (q: boolean) => { quiet = q; },
    hangUp: () => shutDown('hung up'),
  };
}

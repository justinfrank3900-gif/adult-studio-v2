// lib/think.ts
//
// THE WRITING MODEL, AND WHY IT IS THE SAME VENDOR AS THE PICTURES.
//
// A course on this subject matter gets refused by every mainstream model
// API, which means a course builder on one of them works right up until the
// lesson that matters and then fails in a way that looks like a bug.
// SpicyAPI sells an OpenAI-compatible chat endpoint on the key this project
// already has, so there is no second vendor, no second key, no second thing
// that can cut the studio off, and no second bill.
//
// spicy-chat-1 and not the companion models: those are tuned for role-play,
// which is the wrong voice for "write me module three". Their flash model
// is a tenth of the price and cannot do structured output reliably, and the
// whole point here is getting JSON back.

const BASE = (process.env.ADULT_IMAGE_API_URL || 'https://api.spicyapi.com/v1').replace(/\/$/, '');
const MODEL = process.env.ADULT_TEXT_MODEL || 'spicy-chat-1';

export function thinkConfigured(): boolean {
  return Boolean(process.env.ADULT_IMAGE_API_KEY || process.env.SPICYAPI_KEY);
}

function key(): string {
  const k = process.env.ADULT_IMAGE_API_KEY || process.env.SPICYAPI_KEY;
  if (!k) throw new Error('This deployment has no provider key, so nothing could be written. Add SPICYAPI_KEY in Vercel and redeploy. Nothing was spent.');
  return k;
}

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

async function chat(messages: Msg[], json: boolean, maxTokens = 4000): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.8,
      max_tokens: maxTokens,
      /* Their JSON mode errors unless the word JSON appears in the prompt,
       * which every prompt below does say. */
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    let said = '';
    try { said = (JSON.parse(text) as { error?: { message?: string } })?.error?.message || ''; } catch { /* not json */ }
    throw new Error(said ? `The writing model refused that: ${said}` : `The writing model refused that (${res.status}). ${text.slice(0, 200)}`);
  }

  let body: { choices?: { message?: { content?: string } }[] };
  try { body = JSON.parse(text); } catch { throw new Error('The writing model answered with something that was not JSON.'); }
  const out = body.choices?.[0]?.message?.content;
  if (!out) throw new Error('The writing model answered with nothing.');
  return out;
}

/** Their JSON mode still sometimes wraps the object in a fence or a
 *  sentence. Pull the object out rather than failing on punctuation. */
function objectIn(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const body = (fenced ? fenced[1] : raw).trim();
  try { return JSON.parse(body); } catch { /* keep looking */ }
  const first = body.indexOf('{');
  const last = body.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try { return JSON.parse(body.slice(first, last + 1)); } catch { /* give up */ }
  }
  throw new Error('The writing model did not answer with JSON. Press it again - it usually works on the second go.');
}

export type Shape = {
  modules: { title: string; summary: string; lessons: { title: string; summary: string }[] }[];
};

/**
 * A paragraph about a course, turned into a course.
 *
 * The count is in the prompt rather than left open because "write me a
 * course" comes back as four modules of one lesson each or as forty, and
 * neither is something somebody wants to reorganise by hand. Six to eight
 * modules of three to five lessons is a real course with a real shape.
 */
export async function shapeCourse(title: string, description: string): Promise<Shape> {
  const raw = await chat([
    {
      role: 'system',
      content:
        'You design the structure of paid online courses for adults. You are given a course title and a paragraph about what it is. '
        + 'You answer with JSON only, no commentary. The JSON is an object: '
        + '{"modules":[{"title":string,"summary":string,"lessons":[{"title":string,"summary":string}]}]}. '
        + 'Between six and eight modules, each with three to five lessons. '
        + 'A module summary is one sentence saying what somebody can do by the end of it. '
        + 'A lesson summary is one sentence saying what that lesson covers. '
        + 'Titles are plain and specific, never clickbait and never numbered - the numbers are added by the software. '
        + 'The first module always covers the ground rules, consent and safety of the subject, because a paid course that skips that is not a course. '
        + 'The last module is about keeping it going: practice, troubleshooting and what to do when it stops working.',
    },
    { role: 'user', content: `Course title: ${title}\n\nWhat it is:\n${description}\n\nAnswer with the JSON only.` },
  ], true, 4000);

  const shape = objectIn(raw) as Shape;
  if (!shape?.modules?.length) throw new Error('The shape came back empty. Press it again.');

  return {
    modules: shape.modules.slice(0, 12).map((m) => ({
      title: String(m.title || 'Untitled module'),
      summary: String(m.summary || ''),
      lessons: (m.lessons || []).slice(0, 10).map((l) => ({
        title: String(l.title || 'Untitled lesson'),
        summary: String(l.summary || ''),
      })),
    })),
  };
}

/**
 * One lesson, written as laid-out blocks rather than as prose.
 *
 * The block vocabulary goes into the prompt, so what comes back needs no
 * conversion - and asking for a pull quote and a steps list by name is what
 * stops every lesson being eight identical paragraphs.
 */
export async function writeLesson(opts: {
  course: string;
  module: string;
  lesson: string;
  summary: string;
}): Promise<unknown[]> {
  const raw = await chat([
    {
      role: 'system',
      content:
        'You write lessons for paid online courses for adults, as laid-out pages rather than as plain prose. '
        + 'You answer with JSON only: {"blocks":[...]}. Each block is one of: '
        + '{"type":"heading","text":string,"level":2|3}, '
        + '{"type":"text","text":string}, '
        + '{"type":"pull","text":string} for the one sentence the lesson is really about, '
        + '{"type":"note","text":string,"tone":"warn"|"plain"} for a rule or a warning, '
        + '{"type":"steps","items":[string]} for things done in order. '
        + 'A good lesson is 700 to 1100 words: an opening paragraph with no heading, then three or four sections, '
        + 'exactly one pull quote, at least one steps block and at least one note. '
        + 'Write in plain direct sentences to one reader as "you". No bullet points inside a text block, no markdown, no emoji. '
        + 'Never refer to the course, the module or the lesson number - write the thing itself.',
    },
    {
      role: 'user',
      content:
        `Course: ${opts.course}\nModule: ${opts.module}\nLesson: ${opts.lesson}\n`
        + `What it covers: ${opts.summary || 'use your judgement'}\n\nAnswer with the JSON only.`,
    },
  ], true, 5000);

  const body = objectIn(raw) as { blocks?: unknown[] };
  if (!Array.isArray(body?.blocks) || !body.blocks.length) {
    throw new Error('The lesson came back empty. Press it again.');
  }
  return body.blocks;
}

// lib/outline.ts
//
// A DOCUMENT HE ALREADY WROTE, TURNED INTO A COURSE.
//
// "NEED THE ABILITY TO UPLOAD GOOGLE SHEETS AND DOCS ON THE COURSE BUILDER"
//
// Importing already worked, but only INSIDE one lesson - which means the
// course had to be invented first and the document poured into it
// afterwards, one lesson at a time. That is backwards for the common case:
// he has fifty pages of material and no course.
//
// So this reads the document's own structure and builds the course out of
// it. NO MODEL IS CALLED HERE, and that is the point. A document with
// headings already says where it divides; asking a model to guess at it
// would cost a minute, cost money, and come back with different words than
// the ones he wrote. His headings are his headings.
//
// The model is still there for the document that has no structure at all -
// that is what "Give it a shape" is for, and the imported text is kept so
// that button has the real material to work from rather than a one-line
// description.

import type { Block } from './blocks';

export type OutlineLesson = { title: string; summary: string; blocks: Block[] };
export type OutlineModule = { title: string; summary: string; lessons: OutlineLesson[] };

export type Outline = {
  modules: OutlineModule[];
  /** The document had nothing to divide on, so it came in as one lesson. */
  flat: boolean;
  lessons: number;
};

/** Past this many lessons, one module is not a structure, it is a list. */
const LESSONS_PER_PART = 5;
/** At or under this, parts are noise - one module holds the lot. */
const ONE_MODULE_UP_TO = 6;

function words(b: Block): string {
  if (b.type === 'steps') return b.items.join(' ');
  if (b.type === 'table') return [...b.head, ...b.rows.flat()].join(' ');
  if (b.type === 'image') return b.caption || '';
  return b.text;
}

/** The first real sentence, for the line under the lesson title. */
function summaryOf(blocks: Block[]): string {
  for (const b of blocks) {
    if (b.type !== 'text' && b.type !== 'pull') continue;
    const t = b.text.trim().replace(/\s+/g, ' ');
    if (t.length < 24) continue;
    const stop = t.search(/[.!?](\s|$)/);
    const one = stop > 30 ? t.slice(0, stop + 1) : t;
    return one.length > 160 ? `${one.slice(0, 157).trimEnd()}...` : one;
  }
  return '';
}

/** Is there anything here, or is it a heading with white space under it? */
function hasContent(blocks: Block[]): boolean {
  return blocks.some((b) => words(b).trim().length > 2);
}

/** The whole document as plain text, kept on the course so that shaping it
 *  later has the same material the import had. */
export function textOf(blocks: Block[], limit = 60000): string {
  const out: string[] = [];
  let n = 0;
  for (const b of blocks) {
    const line = b.type === 'heading' ? `\n## ${b.text}` : words(b);
    if (!line.trim()) continue;
    n += line.length + 2;
    if (n > limit) break;
    out.push(line.trim());
  }
  return out.join('\n\n');
}

type Section = { level: 2 | 3; title: string; body: Block[] };

/**
 * Split a document into modules and lessons.
 *
 * Three shapes, in order of how much the document tells us:
 *
 *   1. Headings AND sub-headings. The obvious reading: a heading is a
 *      module, a sub-heading under it is a lesson.
 *   2. One level of heading only. Each heading is a LESSON, not a module -
 *      a module holding a single lesson is a filing cabinet with one sheet
 *      of paper in it. Six or fewer go in one module; more are cut into
 *      parts of five, named Part 1, Part 2, which are placeholders he can
 *      rename in place and which at least do not pretend to be his words.
 *   3. No headings. One lesson with everything in it, and `flat` is set so
 *      the screen can say so and point at the button that fixes it.
 */
export function outlineFrom(blocks: Block[], courseTitle: string): Outline {
  const before: Block[] = [];
  const sections: Section[] = [];

  for (const b of blocks) {
    if (b.type === 'heading' && b.text.trim()) {
      sections.push({ level: b.level === 3 ? 3 : 2, title: b.text.trim(), body: [] });
    } else if (sections.length) {
      sections[sections.length - 1].body.push(b);
    } else {
      before.push(b);
    }
  }

  const real = sections.filter((s) => hasContent(s.body) || s.level === 2);

  /* ------------------------------------------------ nothing to divide on */
  if (real.length < 2) {
    const all: Block[] = [...before];
    for (const s of sections) {
      all.push({ type: 'heading', text: s.title, level: s.level });
      all.push(...s.body);
    }
    return {
      flat: true,
      lessons: 1,
      modules: [{
        title: courseTitle,
        summary: '',
        lessons: [{
          title: sections[0]?.title || courseTitle,
          summary: summaryOf(all),
          blocks: all,
        }],
      }],
    };
  }

  const subs = real.filter((s) => s.level === 3).length;
  const tops = real.filter((s) => s.level === 2).length;
  const modules: OutlineModule[] = [];

  /* --------------------------------------- headings AND sub-headings */
  if (tops >= 1 && subs >= 2) {
    let open: OutlineModule | null = null;
    for (const s of real) {
      if (s.level === 2) {
        open = { title: s.title, summary: summaryOf(s.body), lessons: [] };
        modules.push(open);
        if (hasContent(s.body)) {
          /* The writing that sits under a chapter heading before its first
           * sub-heading is the chapter's opening, so it leads the module.
           * Named for now; renamed below if it ends up being the only one,
           * because "Overview" alone in a module is a lie about there
           * being more. */
          open.lessons.push({ title: 'Overview', summary: summaryOf(s.body), blocks: s.body });
        }
        continue;
      }
      if (!open) {
        open = { title: courseTitle, summary: '', lessons: [] };
        modules.push(open);
      }
      open.lessons.push({ title: s.title, summary: summaryOf(s.body), blocks: s.body });
    }

    for (const m of modules) {
      if (m.lessons.length === 1 && m.lessons[0].title === 'Overview') m.lessons[0].title = m.title;
      if (m.lessons.length === 0) m.lessons.push({ title: m.title, summary: m.summary, blocks: [] });
    }
  } else {
    /* ------------------------------------------- one level of heading */
    const lessons: OutlineLesson[] = real.map((s) => ({
      title: s.title,
      summary: summaryOf(s.body),
      blocks: s.body,
    }));

    if (lessons.length <= ONE_MODULE_UP_TO) {
      modules.push({ title: courseTitle, summary: '', lessons });
    } else {
      /* EVENLY, NOT IN FIVES WITH A STUB ON THE END.
       *
       * Cutting seven into fives gives a part of five and a part of two,
       * and a two-lesson Part 2 sitting under a five-lesson Part 1 looks
       * like something went wrong rather than like a decision. The number
       * of parts is worked out first, then the lessons are dealt out
       * round the parts, so the biggest and the smallest are never more
       * than one lesson apart. */
      const parts = Math.ceil(lessons.length / LESSONS_PER_PART);
      const each = Math.floor(lessons.length / parts);
      const extra = lessons.length % parts;
      let at = 0;
      for (let i = 0; i < parts; i++) {
        const take = each + (i < extra ? 1 : 0);
        modules.push({
          title: `Part ${i + 1}`,
          summary: '',
          lessons: lessons.slice(at, at + take),
        });
        at += take;
      }
    }
  }

  /* Whatever came before the first heading is the front of the document,
   * and dropping it would lose a page he wrote without telling him. */
  if (hasContent(before) && modules[0]) {
    modules[0].lessons.unshift({
      title: 'Before you start',
      summary: summaryOf(before),
      blocks: before,
    });
  }

  return {
    modules,
    flat: false,
    lessons: modules.reduce((n, m) => n + m.lessons.length, 0),
  };
}

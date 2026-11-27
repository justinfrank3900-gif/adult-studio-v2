// app/api/course/route.ts
//
// SHAPING A COURSE, WRITING A LESSON, AND READING A FILE HE ALREADY HAS.
//
// Same shape and same reasons as the other two routes: the provider key
// cannot be in a browser, so this proves who is asking and then does
// everything else as them, under the row rules.
//
// The upload arrives here rather than being read in the browser because a
// .docx is a zip and Node has an inflate built in. Doing it client side
// would mean shipping a zip library to every page load for a thing that
// happens once a week.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { DEALER_ID, SUPABASE_ANON, SUPABASE_URL } from '@/lib/config';
import { shapeCourse, thinkConfigured, writeLesson } from '@/lib/think';
import { blocksFromCsv, blocksFromText, cleanBlocks } from '@/lib/blocks';
import { blocksFromDocx } from '@/lib/docx';

export const runtime = 'nodejs';
/* Shaping a whole course is one long answer from the model. Writing a
 * lesson is another. Both are comfortably under two minutes and nowhere
 * near ten seconds. */
export const maxDuration = 300;

function no(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function asCaller(req: Request): SupabaseClient | null {
  const auth = req.headers.get('authorization') || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!jwt) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

async function whoIsAsking(req: Request): Promise<SupabaseClient | NextResponse> {
  const db = asCaller(req);
  if (!db) return no('Your sign in has expired, so the studio could not prove who you are. Reload the page and sign in again. Nothing was spent.', 401);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return no('Your sign in has expired. Reload the page and sign in again. Nothing was spent.', 401);
  const { data: member } = await db
    .from('dealer_members').select('dealer_id')
    .eq('user_id', user.id).eq('dealer_id', DEALER_ID).maybeSingle();
  if (!member) return no('This login is not on the studio account, so nothing was done.', 403);
  return db;
}

export async function POST(req: Request) {
  const asked = await whoIsAsking(req);
  if (asked instanceof NextResponse) return asked;
  const db = asked;

  const kind = req.headers.get('content-type') || '';

  /* ---------------------------------------------------------- a document */
  if (kind.includes('multipart/form-data')) {
    let form: FormData;
    try { form = await req.formData(); } catch { return no('That upload could not be read.'); }

    const file = form.get('file');
    if (!(file instanceof File)) return no('No file came with that.');
    if (file.size > 12 * 1024 * 1024) {
      return no('That file is bigger than 12MB. Split it, or paste the part you want as a lesson.');
    }

    const name = file.name || 'document';
    const lower = name.toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());

    try {
      let blocks;
      if (lower.endsWith('.docx')) {
        blocks = blocksFromDocx(buf);
      } else if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
        blocks = blocksFromCsv(buf.toString('utf8'));
      } else if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.markdown')) {
        blocks = blocksFromText(buf.toString('utf8'));
      } else if (lower.endsWith('.doc')) {
        return no('That is the old Word format, which this cannot read. Open it and save it as .docx, or copy the writing and paste it in.');
      } else if (lower.endsWith('.pdf')) {
        return no('A PDF is a picture of a page rather than the writing itself, so nothing can be pulled out of it cleanly. Paste the writing in, or export it as .docx first.');
      } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        return no('For a spreadsheet, use File, Download, Comma Separated Values (.csv) - a .xlsx is a different format inside and would come back as rubbish.');
      } else {
        return no(`${name} is not a kind of file this reads. Word (.docx), a sheet saved as .csv, or plain text (.txt, .md).`);
      }

      if (!blocks.length) return no(`${name} had no writing in it that could be laid out.`);
      return NextResponse.json({ blocks: cleanBlocks(blocks), source_name: name });
    } catch (e) {
      return no(e instanceof Error ? e.message : `${name} could not be read.`);
    }
  }

  /* ------------------------------------------------------------ the rest */
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return no('The studio sent something it could not read. Nothing was spent.'); }

  const doing = String(body.doing || '');

  if (!thinkConfigured()) {
    return no('This deployment has no provider key, so nothing could be written. Add SPICYAPI_KEY in Vercel and redeploy. Nothing was spent.');
  }

  try {
    /* ------------------------------------------- a paragraph into a shape */
    if (doing === 'shape') {
      const courseId = String(body.course_id || '').trim();
      if (!courseId) return no('Which course?');

      const { data: course } = await db
        .from('adult_courses').select('id, title, description').eq('id', courseId).maybeSingle();
      if (!course) return no('That course is not on this account.');
      if (!String(course.description || '').trim()) {
        return no('Write what the course is about first - a paragraph is enough. That paragraph IS what the shape is built from.');
      }

      const shape = await shapeCourse(course.title, course.description);

      /* THE OLD SHAPE GOES FIRST, AND ON PURPOSE.
       *
       * Shaping again is "I did not like that, do it again", not "add
       * another eight modules underneath the eight I already have". The
       * cascade takes the lessons with it, which is why the button that
       * reaches this says so in those words. */
      const { error: wipeErr } = await db.from('adult_modules').delete().eq('course_id', courseId);
      if (wipeErr) return no(`The old shape could not be cleared: ${wipeErr.message}`, 502);

      const modules = shape.modules.map((m, i) => ({
        dealer_id: DEALER_ID,
        course_id: courseId,
        title: m.title,
        summary: m.summary,
        sort_order: i + 1,
      }));

      const { data: made, error: modErr } = await db
        .from('adult_modules').insert(modules).select('id, title, sort_order');
      if (modErr || !made) return no(`The modules could not be saved: ${modErr?.message || 'nothing came back'}`, 502);

      const bySort = new Map(made.map((m) => [m.sort_order as number, m.id as string]));
      const lessons = shape.modules.flatMap((m, i) => {
        const moduleId = bySort.get(i + 1);
        if (!moduleId) return [];
        return m.lessons.map((l, n) => ({
          dealer_id: DEALER_ID,
          module_id: moduleId,
          title: l.title,
          summary: l.summary,
          sort_order: n + 1,
          blocks: [],
        }));
      });

      if (lessons.length) {
        const { error: lesErr } = await db.from('adult_lessons').insert(lessons);
        if (lesErr) return no(`The modules were saved but the lessons were not: ${lesErr.message}`, 502);
      }

      return NextResponse.json({ modules: made.length, lessons: lessons.length });
    }

    /* ------------------------------------------------------- write one up */
    if (doing === 'write') {
      const lessonId = String(body.lesson_id || '').trim();
      if (!lessonId) return no('Which lesson?');

      const { data: lesson } = await db
        .from('adult_lessons').select('id, title, summary, module_id').eq('id', lessonId).maybeSingle();
      if (!lesson) return no('That lesson is not on this account.');

      const { data: mod } = await db
        .from('adult_modules').select('title, course_id').eq('id', lesson.module_id).maybeSingle();
      const { data: course } = mod
        ? await db.from('adult_courses').select('title').eq('id', mod.course_id).maybeSingle()
        : { data: null };

      const blocks = await writeLesson({
        course: String(course?.title || ''),
        module: String(mod?.title || ''),
        lesson: String(lesson.title || ''),
        summary: String(lesson.summary || ''),
      });

      const clean = cleanBlocks(blocks);
      if (!clean.length) return no('What came back was not anything that could be laid out. Press it again.');

      /* Handed back rather than saved. Overwriting a lesson somebody has
       * already edited, without showing them first, is the kind of help
       * nobody asks for twice. */
      return NextResponse.json({ blocks: clean });
    }

    return no('The studio asked for something this route does not do.');
  } catch (e) {
    return no(e instanceof Error ? e.message : 'The writing model refused that and gave no reason.', 502);
  }
}

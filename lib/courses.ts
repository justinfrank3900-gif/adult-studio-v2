'use client';

// lib/courses.ts
//
// Reading and writing the course tables, as the signed-in person.

import { supa, DEALER_ID } from './supabase';
import { cleanBlocks, type Block } from './blocks';
import { outlineFrom, textOf, type Outline } from './outline';
import { token } from './data';
import { DEMO, demoCourses, demoLessons, demoModules } from './demo';

export class Refused extends Error {}
function hopeless(what: string, message: string): never {
  throw new Refused(`${what} failed: ${message}`);
}

export type Course = {
  id: string;
  title: string;
  description: string;
  status: string;
  cover_url: string | null;
  created_at: string;
  /** What it was built from, when it was built from a document. */
  source_name?: string | null;
};

export type Module = {
  id: string;
  course_id: string;
  title: string;
  summary: string;
  sort_order: number;
};

export type Lesson = {
  id: string;
  module_id: string;
  title: string;
  summary: string;
  sort_order: number;
  blocks: Block[];
  source_name: string | null;
};

export async function loadCourses(): Promise<Course[]> {
  if (DEMO) return demoCourses as Course[];
  const { data, error } = await supa()
    .from('adult_courses')
    .select('id,title,description,status,cover_url,created_at,source_name')
    .eq('dealer_id', DEALER_ID)
    .order('created_at', { ascending: false });
  if (error) hopeless('Reading the courses', error.message);
  return (data || []) as Course[];
}

export async function loadCourse(courseId: string): Promise<{ modules: Module[]; lessons: Lesson[] }> {
  if (DEMO) {
    const modules = demoModules.filter((m) => m.course_id === courseId) as Module[];
    const ids = new Set(modules.map((m) => m.id));
    return {
      modules,
      lessons: (demoLessons as unknown as Lesson[])
        .filter((l) => ids.has(l.module_id))
        .map((l) => ({ ...l, blocks: cleanBlocks(l.blocks) })),
    };
  }
  const { data: modules, error: mErr } = await supa()
    .from('adult_modules')
    .select('id,course_id,title,summary,sort_order')
    .eq('course_id', courseId)
    .order('sort_order');
  if (mErr) hopeless('Reading the modules', mErr.message);

  const ids = (modules || []).map((m) => m.id as string);
  if (!ids.length) return { modules: [], lessons: [] };

  const { data: lessons, error: lErr } = await supa()
    .from('adult_lessons')
    .select('id,module_id,title,summary,sort_order,blocks,source_name')
    .in('module_id', ids)
    .order('sort_order');
  if (lErr) hopeless('Reading the lessons', lErr.message);

  return {
    modules: (modules || []) as Module[],
    lessons: (lessons || []).map((l) => ({
      ...(l as unknown as Lesson),
      blocks: cleanBlocks(l.blocks),
    })),
  };
}

export async function addCourse(title: string, description: string): Promise<Course> {
  const { data, error } = await supa()
    .from('adult_courses')
    .insert({ dealer_id: DEALER_ID, title, description })
    .select('id,title,description,status,cover_url,created_at,source_name')
    .single();
  if (error) hopeless('Starting the course', error.message);
  return data as Course;
}

export async function saveCourse(id: string, patch: Partial<Course>): Promise<void> {
  const { error } = await supa()
    .from('adult_courses').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) hopeless('Saving the course', error.message);
}

export async function removeCourse(id: string): Promise<void> {
  /* The modules and lessons go with it - the foreign keys cascade. That is
   * why the button that reaches this says how many lessons are about to
   * disappear rather than "are you sure". */
  const { error } = await supa().from('adult_courses').delete().eq('id', id);
  if (error) hopeless('Removing the course', error.message);
}

export async function saveModule(id: string, patch: Partial<Module>): Promise<void> {
  const { error } = await supa().from('adult_modules').update(patch).eq('id', id);
  if (error) hopeless('Saving the module', error.message);
}

export async function addModule(courseId: string, title: string, order: number): Promise<void> {
  const { error } = await supa()
    .from('adult_modules')
    .insert({ dealer_id: DEALER_ID, course_id: courseId, title, sort_order: order });
  if (error) hopeless('Adding the module', error.message);
}

export async function removeModule(id: string): Promise<void> {
  const { error } = await supa().from('adult_modules').delete().eq('id', id);
  if (error) hopeless('Removing the module', error.message);
}

export async function addLesson(moduleId: string, title: string, order: number): Promise<void> {
  const { error } = await supa()
    .from('adult_lessons')
    .insert({ dealer_id: DEALER_ID, module_id: moduleId, title, sort_order: order, blocks: [] });
  if (error) hopeless('Adding the lesson', error.message);
}

export async function saveLesson(id: string, patch: Partial<Lesson>): Promise<void> {
  const { error } = await supa()
    .from('adult_lessons')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) hopeless('Saving the lesson', error.message);
}

export async function removeLesson(id: string): Promise<void> {
  const { error } = await supa().from('adult_lessons').delete().eq('id', id);
  if (error) hopeless('Removing the lesson', error.message);
}

/**
 * Swap two things' places.
 *
 * Two writes and not one, because sort_order has no unique constraint on
 * it: trying to be clever with a single update that shifts everything is
 * how a list ends up with two number threes and an order nobody can
 * explain.
 */
export async function swapOrder(
  table: 'adult_modules' | 'adult_lessons',
  a: { id: string; sort_order: number },
  b: { id: string; sort_order: number },
): Promise<void> {
  const db = supa();
  const one = await db.from(table).update({ sort_order: b.sort_order }).eq('id', a.id);
  if (one.error) hopeless('Reordering', one.error.message);
  const two = await db.from(table).update({ sort_order: a.sort_order }).eq('id', b.id);
  if (two.error) hopeless('Reordering', two.error.message);
}

/* ----------------------------- the model ------------------------------ */

async function ask<T>(payload: Record<string, unknown>): Promise<T> {
  const jwt = await token();
  const res = await fetch('/api/course', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(payload),
  });
  const said = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (!res.ok) throw new Error((said?.error as string) || `The studio refused that (${res.status}). Nothing was saved.`);
  return said as T;
}

export const shapeIt = (courseId: string) =>
  ask<{ modules: number; lessons: number }>({ doing: 'shape', course_id: courseId });

export const writeIt = (lessonId: string) =>
  ask<{ blocks: Block[] }>({ doing: 'write', lesson_id: lessonId });

/** A file he already has, turned into blocks. */
export async function readFile(file: File): Promise<{ blocks: Block[]; source_name: string }> {
  const jwt = await token();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/course', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  const said = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (!res.ok) throw new Error((said?.error as string) || `That file could not be read (${res.status}).`);
  return { blocks: cleanBlocks(said?.blocks), source_name: String(said?.source_name || file.name) };
}

/** A Google Docs or Sheets link, turned into blocks. */
export async function readGoogle(url: string): Promise<{ blocks: Block[]; source_name: string }> {
  const said = await ask<{ blocks: Block[]; source_name: string }>({ doing: 'google', url });
  return { blocks: cleanBlocks(said.blocks), source_name: said.source_name };
}

/* ---------------------------------------------------------------------- *
 * A WHOLE COURSE, OUT OF A DOCUMENT
 * ---------------------------------------------------------------------- */

/**
 * Build the course, its modules and its lessons from something already
 * written, with his own words in the lessons.
 *
 * Written in that order and checked at every step, because the half-built
 * case is real: a course with modules and no lessons looks exactly like a
 * course somebody abandoned, and silently leaving one behind is worse than
 * saying which step stopped. Nothing is cleaned up on failure - what got
 * in is his, and it is on the screen where he can see it.
 */
export async function buildCourseFromDocument(opts: {
  title: string;
  blocks: Block[];
  sourceName: string;
}): Promise<{ course: Course; outline: Outline }> {
  const title = opts.title.trim() || opts.sourceName;
  const outline = outlineFrom(opts.blocks, title);
  const source = textOf(opts.blocks);

  const db = supa();

  const { data: course, error: cErr } = await db
    .from('adult_courses')
    .insert({
      dealer_id: DEALER_ID,
      title,
      /* The opening of his own document is a better description of the
       * course than anything that could be invented for it, and it is what
       * the Shape button reads if he presses it later. */
      description: source.slice(0, 1200),
      source_name: opts.sourceName,
      source_text: source,
    })
    .select('id,title,description,status,cover_url,created_at,source_name')
    .single();
  if (cErr || !course) hopeless('Starting the course', cErr?.message || 'nothing came back');

  const made = course as Course;

  const { data: modules, error: mErr } = await db
    .from('adult_modules')
    .insert(outline.modules.map((m, i) => ({
      dealer_id: DEALER_ID,
      course_id: made.id,
      title: m.title,
      summary: m.summary,
      sort_order: i + 1,
    })))
    .select('id, sort_order');
  if (mErr || !modules) {
    hopeless('Saving the modules', `${mErr?.message || 'nothing came back'}. The course itself was made - open it and the document can be brought in again.`);
  }

  const bySort = new Map((modules as { id: string; sort_order: number }[]).map((m) => [m.sort_order, m.id]));
  const lessons = outline.modules.flatMap((m, i) => {
    const moduleId = bySort.get(i + 1);
    if (!moduleId) return [];
    return m.lessons.map((l, n) => ({
      dealer_id: DEALER_ID,
      module_id: moduleId,
      title: l.title,
      summary: l.summary,
      sort_order: n + 1,
      blocks: l.blocks,
      source_name: opts.sourceName,
    }));
  });

  if (lessons.length) {
    const { error: lErr } = await db.from('adult_lessons').insert(lessons);
    if (lErr) {
      hopeless('Saving the lessons', `${lErr.message}. The course and its ${modules.length} modules were made, but the writing did not go in.`);
    }
  }

  return { course: made, outline };
}

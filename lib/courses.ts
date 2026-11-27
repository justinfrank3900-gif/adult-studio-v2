'use client';

// lib/courses.ts
//
// Reading and writing the course tables, as the signed-in person.

import { supa, DEALER_ID } from './supabase';
import { cleanBlocks, type Block } from './blocks';
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
    .select('id,title,description,status,cover_url,created_at')
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
    .select('id,title,description,status,cover_url,created_at')
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

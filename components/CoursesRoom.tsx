'use client';

// components/CoursesRoom.tsx
//
// WRITE WHAT IT IS, AND IT TAKES SHAPE.
//
// "I need to write a description of the course and have it take shape."
//
// So the first screen is one box. A paragraph about what the course is goes
// in, and a real structure comes back: modules with lessons, each with a
// line saying what it covers, all of it editable and reorderable. The
// paragraph is KEPT rather than thrown away afterwards, because shaping it
// again is a thing that happens, and retyping the brief to do it is the
// thing that stops people trying a second shape.
//
// Nothing here writes a word of a lesson until it is asked to. A course
// that generates eight hundred words into every lesson the moment it is
// created is a course nobody trusts and nobody reads.

import { useCallback, useEffect, useState } from 'react';
import { T } from '@/lib/tokens';
import { Btn, Eyebrow, Lead, Panel, Title } from './kit';
import { Area, Empty, Field, Grid, Row, Says, Tile, Working } from './parts';
import { BringIn, LessonEditor, LessonView } from './Lesson';
import { minutesOf, type Block } from '@/lib/blocks';
import {
  addCourse, addLesson, addModule, loadCourse, loadCourses, removeCourse,
  removeLesson, removeModule, saveCourse, saveLesson, saveModule, shapeIt,
  swapOrder, writeIt,
  type Course, type Lesson, type Module,
} from '@/lib/courses';

export default function CoursesRoom() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [making, setMaking] = useState(false);
  const [title, setTitle] = useState('');
  const [about, setAbout] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { setCourses(await loadCourses()); }
    catch (e) { setSays(e instanceof Error ? e.message : 'The courses could not be read.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const start = async () => {
    setBusy('new'); setSays(null);
    try {
      const made = await addCourse(title.trim(), about.trim());
      setTitle(''); setAbout(''); setMaking(false);
      await reload();
      setOpen(made.id);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'The course could not be started.');
    } finally { setBusy(null); }
  };

  const course = courses.find((c) => c.id === open) || null;
  if (course) return <CourseSheet course={course} onBack={() => setOpen(null)} onChanged={reload} />;

  return (
    <>
      <Eyebrow>The company</Eyebrow>
      <Title lead="The" gold="courses" />
      <Lead>
        Write what a course is in a paragraph and it comes back as modules and
        lessons you can move around. Nothing writes itself until you ask it to.
      </Lead>

      <Panel style={{ marginBottom: 20 }}>
        <Row>
          <Btn kind="gold" onClick={() => setMaking((v) => !v)}>{making ? 'Not now' : 'Start a course'}</Btn>
        </Row>
        {making ? (
          <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            <Field label="What it is called" value={title} onChange={setTitle} placeholder="How to train a submissive" />
            <Area
              label="What the course is"
              value={about}
              onChange={setAbout}
              rows={6}
              placeholder="Who it is for, what they can do by the end of it, what it covers and what it deliberately does not."
              hint="This paragraph is what the shape is built from, and it is kept - you can rewrite it and shape it again."
            />
            <Row>
              <Btn kind="gold" onClick={start} disabled={busy === 'new' || !title.trim()}>
                {busy === 'new' ? 'Starting' : 'Start it'}
              </Btn>
            </Row>
          </div>
        ) : null}
        <Says text={says} />
      </Panel>

      {loading ? (
        <p style={{ fontSize: 15, color: T.textMuted }}>Reading the courses.</p>
      ) : courses.length === 0 ? (
        <Empty>No courses yet. Write what one is and it will take shape.</Empty>
      ) : (
        <Grid min={240}>
          {courses.map((c) => (
            <Tile
              key={c.id}
              title={c.title}
              ratio="4 / 3"
              src={c.cover_url}
              note={c.description.slice(0, 110) || 'Nothing written about it yet'}
              footer={<Btn kind="gold" onClick={() => setOpen(c.id)}>Open</Btn>}
            />
          ))}
        </Grid>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------- */

function CourseSheet({ course, onBack, onChanged }: {
  course: Course; onBack: () => void; onChanged: () => Promise<void>;
}) {
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [about, setAbout] = useState(course.description);
  const [busy, setBusy] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [confirmShape, setConfirmShape] = useState(false);

  const reload = useCallback(async () => {
    try {
      const got = await loadCourse(course.id);
      setModules(got.modules);
      setLessons(got.lessons);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'The course could not be read.');
    } finally { setLoading(false); }
  }, [course.id]);

  useEffect(() => { void reload(); }, [reload]);

  const shape = async () => {
    setBusy('shape'); setSays(null); setOk(null); setConfirmShape(false);
    try {
      if (about.trim() !== course.description) await saveCourse(course.id, { description: about.trim() });
      const got = await shapeIt(course.id);
      await Promise.all([reload(), onChanged()]);
      setOk(`${got.modules} modules, ${got.lessons} lessons. Move them around and rewrite anything.`);
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'The shape could not be made.');
    } finally { setBusy(null); }
  };

  const saveAbout = async () => {
    setBusy('about'); setSays(null); setOk(null);
    try {
      await saveCourse(course.id, { description: about.trim() });
      await onChanged();
      setOk('Saved.');
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That could not be saved.');
    } finally { setBusy(null); }
  };

  const lesson = lessons.find((l) => l.id === openLesson) || null;
  if (lesson) {
    const mod = modules.find((m) => m.id === lesson.module_id);
    return (
      <LessonPage
        course={course}
        module={mod || null}
        lesson={lesson}
        onBack={() => setOpenLesson(null)}
        onChanged={reload}
      />
    );
  }

  const totalLessons = lessons.length;
  const written = lessons.filter((l) => l.blocks.length > 0).length;

  return (
    <>
      <Row><Btn kind="quiet" onClick={onBack}>All courses</Btn></Row>
      <div style={{ marginTop: 14 }}>
        <Eyebrow>Course</Eyebrow>
        <Title lead={course.title} />
        <Lead>
          {totalLessons === 0
            ? 'No shape yet.'
            : `${modules.length} modules, ${totalLessons} lessons, ${written} written.`}
        </Lead>
      </div>

      <Panel style={{ marginBottom: 20 }}>
        <Area
          label="What the course is"
          value={about}
          onChange={(v) => { setAbout(v); setOk(null); }}
          rows={5}
          hint="Rewrite this and shape it again to get a different structure."
        />
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Btn onClick={saveAbout} disabled={busy !== null || about === course.description}>
            {busy === 'about' ? 'Saving' : 'Save it'}
          </Btn>
          {modules.length === 0 ? (
            <Btn kind="gold" onClick={shape} disabled={busy !== null || !about.trim()}>
              {busy === 'shape' ? 'Shaping' : 'Give it a shape'}
            </Btn>
          ) : confirmShape ? (
            <>
              <Btn kind="gold" onClick={shape} disabled={busy !== null}>
                {busy === 'shape' ? 'Shaping' : `Yes - replace ${modules.length} modules and ${totalLessons} lessons`}
              </Btn>
              <Btn kind="quiet" onClick={() => setConfirmShape(false)}>Leave it alone</Btn>
            </>
          ) : (
            <Btn onClick={() => setConfirmShape(true)} disabled={busy !== null}>Shape it again</Btn>
          )}
        </div>
        {confirmShape ? (
          <p style={{ margin: '12px 0 0', fontSize: 14, color: T.warn, lineHeight: 1.6 }}>
            Shaping again throws the current structure away, and the lessons go
            with it - including {written} that {written === 1 ? 'has' : 'have'} been written.
            That cannot be undone.
          </p>
        ) : null}
        {busy === 'shape' ? <Working>Working out the structure. About a minute.</Working> : null}
        <Says text={says} />
        <Says text={ok} tone="ok" />
      </Panel>

      {loading ? (
        <p style={{ fontSize: 15, color: T.textMuted }}>Reading the modules.</p>
      ) : modules.length === 0 ? (
        <Empty>No shape yet. Write what the course is above and press Give it a shape.</Empty>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {modules.map((m, i) => (
            <ModuleCard
              key={m.id}
              n={i + 1}
              module={m}
              lessons={lessons.filter((l) => l.module_id === m.id)}
              canUp={i > 0}
              canDown={i < modules.length - 1}
              onSwap={async (by) => {
                const other = modules[i + by];
                if (!other) return;
                await swapOrder('adult_modules', m, other);
                await reload();
              }}
              onOpen={setOpenLesson}
              onChanged={reload}
            />
          ))}
        </div>
      )}

      {modules.length > 0 ? (
        <div style={{ marginTop: 20 }}>
          <Btn onClick={async () => {
            await addModule(course.id, 'A new module', (modules[modules.length - 1]?.sort_order ?? 0) + 1);
            await reload();
          }}>Add a module</Btn>
        </div>
      ) : null}

      <div style={{ marginTop: 34, paddingTop: 20, borderTop: `1px solid ${T.lineSoft}` }}>
        <Btn kind="quiet" onClick={async () => {
          if (busy === 'kill') return;
          setBusy('kill');
          try { await removeCourse(course.id); await onChanged(); onBack(); }
          catch (e) { setSays(e instanceof Error ? e.message : 'It could not be removed.'); setBusy(null); }
        }}>
          {busy === 'kill' ? 'Removing' : `Remove this course and its ${totalLessons} lessons`}
        </Btn>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------- */

function ModuleCard({
  n, module: m, lessons, canUp, canDown, onSwap, onOpen, onChanged,
}: {
  n: number;
  module: Module;
  lessons: Lesson[];
  canUp: boolean;
  canDown: boolean;
  onSwap: (by: number) => Promise<void>;
  onOpen: (id: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [title, setTitle] = useState(m.title);
  const [busy, setBusy] = useState(false);
  const [says, setSays] = useState<string | null>(null);

  const run = async (what: () => Promise<void>) => {
    setBusy(true); setSays(null);
    try { await what(); await onChanged(); }
    catch (e) { setSays(e instanceof Error ? e.message : 'That did not work.'); }
    finally { setBusy(false); }
  };

  return (
    <Panel>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <span style={{
          flexShrink: 0, width: 38, height: 38, borderRadius: '50%',
          background: T.raised, border: `1px solid ${T.line}`, color: T.gold,
          fontSize: 15, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{n}</span>

        <div style={{ flex: '999 1 300px', minWidth: 0 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title !== m.title) void run(() => saveModule(m.id, { title: title.trim() })); }}
            style={{
              width: '100%', background: 'transparent', color: T.text,
              border: 'none', borderBottom: `1px solid transparent`,
              fontSize: 20, fontWeight: 800, fontFamily: 'inherit',
              letterSpacing: '-0.02em', padding: '2px 0',
            }}
          />
          {m.summary ? (
            <p style={{ margin: '6px 0 0', fontSize: 14, color: T.textMuted, lineHeight: 1.6 }}>{m.summary}</p>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <Btn kind="quiet" onClick={() => void onSwap(-1)} disabled={!canUp || busy}>Up</Btn>
          <Btn kind="quiet" onClick={() => void onSwap(1)} disabled={!canDown || busy}>Down</Btn>
          <Btn kind="quiet" onClick={() => void run(() => removeModule(m.id))} disabled={busy}>Remove</Btn>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
        {lessons.map((l, i) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onOpen(l.id)}
            style={{
              display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left',
              width: '100%', cursor: 'pointer', fontFamily: 'inherit',
              background: T.raised, border: `1px solid ${T.lineSoft}`,
              borderLeft: `3px solid ${l.blocks.length ? T.gold : T.lineSoft}`,
              borderRadius: 10, padding: '12px 14px', minHeight: 46,
            }}
          >
            <span style={{ fontSize: 13, color: T.textDim, fontWeight: 700, width: 26 }}>
              {n}.{i + 1}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: T.text }}>{l.title}</span>
              {l.summary ? (
                <span style={{ display: 'block', fontSize: 13, color: T.textDim, marginTop: 2, lineHeight: 1.5 }}>
                  {l.summary}
                </span>
              ) : null}
            </span>
            <span style={{ fontSize: 13, color: l.blocks.length ? T.gold : T.textDim, whiteSpace: 'nowrap' }}>
              {l.blocks.length ? `${minutesOf(l.blocks)} min` : 'not written'}
            </span>
          </button>
        ))}
        <Row>
          <Btn kind="quiet" onClick={() => void run(() => addLesson(m.id, 'A new lesson', (lessons[lessons.length - 1]?.sort_order ?? 0) + 1))} disabled={busy}>
            Add a lesson
          </Btn>
        </Row>
      </div>
      <Says text={says} />
    </Panel>
  );
}

/* ---------------------------------------------------------------------- */

function LessonPage({ course, module: m, lesson, onBack, onChanged }: {
  course: Course;
  module: Module | null;
  lesson: Lesson;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [title, setTitle] = useState(lesson.title);
  const [blocks, setBlocks] = useState<Block[]>(lesson.blocks);
  const [reading, setReading] = useState(lesson.blocks.length > 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const dirty = JSON.stringify(blocks) !== JSON.stringify(lesson.blocks) || title !== lesson.title;

  const save = async () => {
    setBusy('save'); setSays(null); setOk(null);
    try {
      await saveLesson(lesson.id, { title: title.trim(), blocks });
      await onChanged();
      setOk('Saved.');
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'That could not be saved.');
    } finally { setBusy(null); }
  };

  const write = async () => {
    setBusy('write'); setSays(null); setOk(null);
    try {
      const got = await writeIt(lesson.id);
      /* Added to what is there rather than replacing it. Anything he has
       * already written is his, and a button that silently eats it is a
       * button nobody presses twice. */
      setBlocks((b) => [...b, ...got.blocks]);
      setReading(false);
      setOk('Written in below. Nothing is saved until you press Save.');
    } catch (e) {
      setSays(e instanceof Error ? e.message : 'It could not be written.');
    } finally { setBusy(null); }
  };

  return (
    <>
      <Row>
        <Btn kind="quiet" onClick={onBack}>Back to {course.title}</Btn>
      </Row>

      <div style={{ marginTop: 14, marginBottom: 18 }}>
        <Eyebrow>{m?.title || 'Lesson'}</Eyebrow>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            width: '100%', background: 'transparent', color: T.text, border: 'none',
            fontSize: 32, fontWeight: 800, fontFamily: 'inherit',
            letterSpacing: '-0.03em', lineHeight: 1.1, padding: 0, margin: '0 0 10px',
          }}
        />
        {lesson.summary ? <Lead>{lesson.summary}</Lead> : null}
      </div>

      <Panel style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <Btn kind="gold" onClick={save} disabled={busy !== null || !dirty}>
            {busy === 'save' ? 'Saving' : dirty ? 'Save' : 'Saved'}
          </Btn>
          <Btn onClick={() => setReading((v) => !v)} disabled={blocks.length === 0}>
            {reading ? 'Edit it' : 'See it laid out'}
          </Btn>
          <Btn onClick={write} disabled={busy !== null}>
            {busy === 'write' ? 'Writing' : blocks.length ? 'Write more of it' : 'Write it for me'}
          </Btn>
        </div>
        <div style={{ marginTop: 16 }}>
          <BringIn
            busy={busy !== null}
            onBlocks={(got, name) => {
              setBlocks((b) => [...b, ...got]);
              setReading(false);
              void saveLesson(lesson.id, { source_name: name }).catch(() => {});
              setOk(`${name} came in as ${got.length} ${got.length === 1 ? 'piece' : 'pieces'}. Nothing is saved until you press Save.`);
            }}
          />
        </div>
        {busy === 'write' ? <Working>Writing the lesson. About a minute.</Working> : null}
        <Says text={says} />
        <Says text={ok} tone="ok" />
        {dirty ? (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: T.warn }}>
            Not saved yet.
          </p>
        ) : null}
      </Panel>

      {blocks.length === 0 ? (
        <Empty>
          Nothing in this lesson yet. Write it, bring in a document you already
          have, or add the pieces yourself.
        </Empty>
      ) : reading ? (
        <Panel><LessonView blocks={blocks} /></Panel>
      ) : (
        <LessonEditor blocks={blocks} onChange={setBlocks} />
      )}

      {lesson.source_name ? (
        <p style={{ marginTop: 20, fontSize: 13, color: T.textDim }}>
          Some of this came from {lesson.source_name}.
        </p>
      ) : null}

      <div style={{ marginTop: 30, paddingTop: 20, borderTop: `1px solid ${T.lineSoft}` }}>
        <Btn kind="quiet" onClick={async () => {
          setBusy('kill');
          try { await removeLesson(lesson.id); await onChanged(); onBack(); }
          catch (e) { setSays(e instanceof Error ? e.message : 'It could not be removed.'); setBusy(null); }
        }} disabled={busy !== null}>
          {busy === 'kill' ? 'Removing' : 'Remove this lesson'}
        </Btn>
      </div>
    </>
  );
}

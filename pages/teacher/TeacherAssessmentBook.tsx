import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';
import { ASSESSMENT_CATEGORIES } from '../../types';
import { WorkSurface } from '../../components/Layouts';
import { exportToCSV } from '../../lib/exportUtils';
import {
  Badge, Button, Card, Chip, Drawer, EmptyState, Field, InlineNote, Input, PageHeader, Select, SkeletonTable,
} from '../../components/ui';
import { CA_MAX } from '../../lib/grading';

const TERMS = ['Term 1', 'Term 2', 'Term 3'];

/**
 * The mark sheet.
 *
 * A teacher's assessment book is a grid on paper — names down the side, one column
 * per piece of work, marks in the cells — so it is a grid here. The previous screen
 * asked for one student, one score, one Save, per mark; a class of thirty with six
 * assessments meant a hundred and eighty round trips through a form.
 *
 * A COLUMN is an assessment given to the class, identified by its title, category
 * and denominator. A CELL is one student's row in that column, which may be empty.
 * Typing in an empty cell creates the entry; changing a filled one updates it;
 * clearing it deletes it. Enter and the arrow keys move like a spreadsheet.
 */

/**
 * Columns are grouped by what makes two marks "the same assessment".
 *
 * The effective title, not the raw one: older entries were saved with no title and
 * fall back to their category for display. Keying on the raw value meant such a
 * column rendered as "Class Work" but keyed as empty, so typing into it created a
 * second, identical-looking column instead of filling the one under the cursor.
 */
const effectiveTitle = (e: any) => (e.title && String(e.title).trim()) || e.category;
const columnKey = (e: any) => `${e.category}||${effectiveTitle(e)}||${e.maxScore}`;

type Column = { key: string; title: string; category: string; maxScore: number; date: string | null };

const pct = (score: number, max: number) => (max > 0 ? (score / max) * 100 : 0);

export const TeacherAssessmentBook: React.FC = () => {
  const { user } = useAuth();
  const assignedClasses = user?.assignedClasses && user.assignedClasses.length > 0 ? user.assignedClasses : ['Unassigned'];

  const [activeClass, setActiveClass] = useState(assignedClasses[0]);
  const [term, setTerm] = useState('Term 2');
  const [students, setStudents] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  // Cells being written right now, so a slow save shows on the cell it belongs to.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  // What the teacher has typed but not yet committed, keyed by cell.
  const [draft, setDraft] = useState<Record<string, string>>({});

  // New-column drawer
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumn, setNewColumn] = useState({
    title: '',
    category: ASSESSMENT_CATEGORIES[0] as string,
    maxScore: '100',
    date: new Date().toISOString().split('T')[0],
  });
  // Columns the teacher has created but not yet filled in. They have no rows in the
  // database yet, so they live here until the first mark is typed into one.
  const [emptyColumns, setEmptyColumns] = useState<Column[]>([]);

  // Quiz import
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [importQuizId, setImportQuizId] = useState('');
  const [importing, setImporting] = useState(false);

  // Which subject these marks belong to. Continuous assessment is per subject, so
  // without this the Science teacher's entries and the Maths teacher's entries were
  // one undifferentiated pool for the class.
  const [assignments, setAssignments] = useState<{ classId: string; subject: string }[]>([]);
  const [activeSubject, setActiveSubject] = useState('');

  const gridRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    firestoreService
      .getSystemSettings()
      .then((settings) => {
        if (settings?.current_term) setTerm(settings.current_term);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsubStudents = firestoreService.getStudentsForClass(activeClass, (data) => {
      setStudents(data);
      setLoading(false);
    });
    return () => unsubStudents();
  }, [activeClass]);

  useEffect(() => {
    const unsubEntries = firestoreService.getAssessments({ classId: activeClass, term }, setEntries);
    return () => unsubEntries();
  }, [activeClass, term]);

  useEffect(() => {
    firestoreService
      .getTeacherAssignments()
      .then((rows) => setAssignments(rows.map((r: any) => ({ classId: r.classId, subject: r.subject }))))
      .catch(() => setAssignments([]));
  }, [user?.uid]);

  /** The subjects this teacher takes in the class on screen. */
  const mySubjects = useMemo(
    () => [...new Set(assignments.filter((a) => a.classId === activeClass).map((a) => a.subject))].sort(),
    [assignments, activeClass],
  );

  useEffect(() => {
    if (mySubjects.length === 0) {
      if (activeSubject) setActiveSubject('');
      return;
    }
    if (!activeSubject || !mySubjects.includes(activeSubject)) setActiveSubject(mySubjects[0]);
  }, [mySubjects, activeSubject]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = firestoreService.onTeacherQuizzesChange(user.uid, (data) => {
      setQuizzes(data.filter((q: any) => q.isPublished && q.classId === activeClass));
    });
    return () => unsub();
  }, [user?.uid, activeClass]);

  // Switching class or term throws away unsaved typing and locally-added columns:
  // both belong to the sheet you were looking at, not the one you moved to.
  useEffect(() => {
    setDraft({});
    setEmptyColumns([]);
  }, [activeClass, term, activeSubject]);

  /* ---- the grid ---------------------------------------------------------- */

  const columns: Column[] = useMemo(() => {
    const map = new Map<string, Column>();
    entries.forEach((e) => {
      const key = columnKey(e);
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: effectiveTitle(e),
          category: e.category,
          maxScore: Number(e.maxScore) || 100,
          date: e.date || null,
        });
      }
    });
    // Locally-added columns that nobody has a mark in yet.
    emptyColumns.forEach((c) => {
      if (!map.has(c.key)) map.set(c.key, c);
    });
    return [...map.values()].sort((a, b) => {
      const ad = a.date || '';
      const bd = b.date || '';
      return ad === bd ? a.title.localeCompare(b.title) : ad.localeCompare(bd);
    });
  }, [entries, emptyColumns]);

  /** cellKey -> the stored entry, so a cell knows whether it is creating or updating. */
  const cellIndex = useMemo(() => {
    const map: Record<string, any> = {};
    entries.forEach((e) => {
      map[`${e.studentId}||${columnKey(e)}`] = e;
    });
    return map;
  }, [entries]);

  const rowAverage = useCallback(
    (studentId: string) => {
      const mine = entries.filter((e) => e.studentId === studentId);
      if (mine.length === 0) return null;
      const avg = mine.reduce((sum, e) => sum + pct(Number(e.score), Number(e.maxScore) || 100), 0) / mine.length;
      return Math.round(avg * 10) / 10;
    },
    [entries],
  );

  const columnAverage = (col: Column) => {
    const marks = entries.filter((e) => columnKey(e) === col.key);
    if (marks.length === 0) return null;
    const avg = marks.reduce((sum, e) => sum + pct(Number(e.score), Number(e.maxScore) || 100), 0) / marks.length;
    return Math.round(avg);
  };

  /* ---- saving ------------------------------------------------------------ */

  /**
   * Commit one cell. Empty means "no mark", which is a deletion rather than a zero —
   * a child who missed a test has not scored nothing, and averaging a false zero
   * would quietly drag their CA down.
   */
  const commitCell = async (student: any, col: Column, raw: string) => {
    const cell = `${student.id}||${col.key}`;
    const existing = cellIndex[cell];
    const trimmed = raw.trim();

    if (trimmed === '') {
      if (!existing) return;
      setPending((p) => ({ ...p, [cell]: true }));
      try {
        await firestoreService.deleteAssessment(existing.id);
      } catch {
        setStatus({ tone: 'bad', text: `Could not clear ${student.name}'s mark for ${col.title}.` });
      } finally {
        setPending((p) => ({ ...p, [cell]: false }));
      }
      return;
    }

    const score = Number(trimmed);
    if (!Number.isFinite(score) || score < 0 || score > col.maxScore) {
      setStatus({ tone: 'bad', text: `${col.title} is out of ${col.maxScore} — ${trimmed} is not a valid mark.` });
      return;
    }
    if (existing && Number(existing.score) === score) return;

    setPending((p) => ({ ...p, [cell]: true }));
    setStatus(null);
    try {
      if (existing) {
        await firestoreService.updateAssessment(existing.id, { score });
      } else {
        await firestoreService.createAssessment({
          studentId: student.id,
          classId: activeClass,
          term,
          subject: activeSubject || undefined,
          category: col.category,
          title: col.title,
          score,
          maxScore: col.maxScore,
          date: col.date || new Date().toISOString().split('T')[0],
        });
        // It exists in the database now, so it no longer needs a local placeholder.
        setEmptyColumns((prev) => prev.filter((c) => c.key !== col.key));
      }
    } catch {
      setStatus({ tone: 'bad', text: `Could not save ${student.name}'s mark for ${col.title}.` });
    } finally {
      setPending((p) => ({ ...p, [cell]: false }));
      setDraft((d) => {
        const next = { ...d };
        delete next[cell];
        return next;
      });
    }
  };

  /** Arrow keys and Enter move between cells the way a spreadsheet does. */
  const onCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
    const move = (dr: number, dc: number) => {
      const next = gridRef.current?.querySelector<HTMLInputElement>(
        `input[data-r="${rowIndex + dr}"][data-c="${colIndex + dc}"]`,
      );
      if (next) {
        e.preventDefault();
        next.focus();
        next.select();
      }
    };
    if (e.key === 'Enter' || e.key === 'ArrowDown') move(1, 0);
    else if (e.key === 'ArrowUp') move(-1, 0);
    else if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) move(0, 1);
    else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) move(0, -1);
    else if (e.key === 'Escape') {
      e.currentTarget.blur();
    }
  };

  /* ---- columns ----------------------------------------------------------- */

  const handleAddColumn = () => {
    const title = newColumn.title.trim();
    const maxScore = Number(newColumn.maxScore) || 100;
    if (!title) {
      setStatus({ tone: 'bad', text: 'Give the assessment a name so you can tell the columns apart.' });
      return;
    }
    const col: Column = { key: `${newColumn.category}||${title}||${maxScore}`, title, category: newColumn.category, maxScore, date: newColumn.date };
    if (columns.some((c) => c.key === col.key)) {
      setStatus({ tone: 'bad', text: `There is already a column for ${title}.` });
      return;
    }
    setEmptyColumns((prev) => [...prev, col]);
    setAddingColumn(false);
    setNewColumn({ title: '', category: ASSESSMENT_CATEGORIES[0] as string, maxScore: '100', date: new Date().toISOString().split('T')[0] });
    setStatus({ tone: 'ok', text: `Added “${title}”. Type marks down the column — each one saves on its own.` });
  };

  const handleDeleteColumn = async (col: Column) => {
    const marks = entries.filter((e) => columnKey(e) === col.key);
    if (
      marks.length > 0 &&
      !window.confirm(`Delete “${col.title}” and all ${marks.length} mark(s) in it? This changes every affected student's CA average.`)
    )
      return;
    setStatus(null);
    try {
      for (const m of marks) await firestoreService.deleteAssessment(m.id);
      setEmptyColumns((prev) => prev.filter((c) => c.key !== col.key));
    } catch {
      setStatus({ tone: 'bad', text: 'Could not delete that column.' });
    }
  };

  const handleImportQuiz = async () => {
    const quiz = quizzes.find((q) => q.id === importQuizId);
    if (!quiz) return;
    setImporting(true);
    setStatus(null);
    try {
      const results = await firestoreService.fetchQuizResults(quiz.id);
      const title = quiz.title || 'Quiz';
      const already = new Set(
        entries.filter((e) => e.category === 'Quiz' && e.title === title).map((e) => e.studentId),
      );
      const fresh = results.filter((r) => !already.has(r.studentId));
      if (fresh.length === 0) {
        setStatus({
          tone: 'bad',
          text: results.length === 0 ? 'Nobody has sat that quiz yet.' : 'Every result from that quiz is already in the sheet.',
        });
        return;
      }
      for (const r of fresh) {
        await firestoreService.createAssessment({
          studentId: r.studentId,
          classId: activeClass,
          term,
          subject: activeSubject || undefined,
          category: 'Quiz',
          title,
          score: Number(r.score) || 0,
          maxScore: Number(r.totalQuestions) || 1,
          date: r.submittedAt ? String(r.submittedAt).slice(0, 10) : new Date().toISOString().slice(0, 10),
        });
      }
      setStatus({ tone: 'ok', text: `Pulled in ${fresh.length} mark${fresh.length === 1 ? '' : 's'} from “${title}”.` });
    } catch {
      setStatus({ tone: 'bad', text: 'Could not import those results.' });
    } finally {
      setImporting(false);
    }
  };

  const handleExport = () => {
    exportToCSV(
      students.map((s) => {
        const row: Record<string, any> = { Student: s.name, 'Admission No.': s.admissionNumber || s.loginId || '' };
        columns.forEach((c) => {
          const entry = cellIndex[`${s.id}||${c.key}`];
          row[`${c.title} (/${c.maxScore})`] = entry ? entry.score : '';
        });
        const avg = rowAverage(s.id);
        row['CA average %'] = avg == null ? '' : avg;
        return row;
      }),
      `assessment-book-${activeClass}-${term}`.replace(/\s+/g, '-'),
    );
  };

  if (loading) {
    return (
      <WorkSurface>
        <div className="h-14 w-64 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <SkeletonTable rows={6} />
      </WorkSurface>
    );
  }

  const classAverage = (() => {
    const all = students.map((s) => rowAverage(s.id)).filter((v): v is number => v != null);
    return all.length ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10 : null;
  })();

  return (
    <WorkSurface>
      <PageHeader
        title="Assessment Book"
        subtitle="One column per assessment, one row per student. Marks save as you type."
        actions={
          <>
            <Button variant="secondary" icon="file_download" onClick={handleExport} disabled={columns.length === 0}>
              Export
            </Button>
            <Button icon="add" onClick={() => setAddingColumn(true)}>
              New assessment
            </Button>
          </>
        }
      />

      <Card className="flex flex-wrap items-center gap-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">Class</span>
          {assignedClasses.map((c) => (
            <Chip key={c} active={c === activeClass} onClick={() => setActiveClass(c)}>
              {c}
            </Chip>
          ))}
        </div>
        {mySubjects.length > 0 && (
          <>
            <span className="hidden md:block w-px h-6 bg-slate-200 dark:bg-slate-700" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">Subject</span>
              {mySubjects.length === 1 ? (
                <Chip active onClick={() => {}}>
                  {mySubjects[0]}
                </Chip>
              ) : (
                mySubjects.map((sub) => (
                  <Chip key={sub} active={sub === activeSubject} onClick={() => setActiveSubject(sub)}>
                    {sub}
                  </Chip>
                ))
              )}
            </div>
          </>
        )}

        <span className="hidden md:block w-px h-6 bg-slate-200 dark:bg-slate-700" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">Term</span>
          <Select value={term} onChange={(e) => setTerm(e.target.value)} className="h-8 text-xs">
            {TERMS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </div>

        {quizzes.length > 0 && (
          <>
            <span className="hidden md:block w-px h-6 bg-slate-200 dark:bg-slate-700" />
            <div className="flex items-center gap-2">
              <Select
                value={importQuizId}
                onChange={(e) => setImportQuizId(e.target.value)}
                className="h-8 text-xs w-[200px]"
                aria-label="Import marks from a quiz"
              >
                <option value="">Import from a quiz…</option>
                {quizzes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title}
                  </option>
                ))}
              </Select>
              <Button
                variant="secondary"
                className="h-8 px-3 text-[11.5px]"
                loading={importing}
                disabled={!importQuizId}
                onClick={handleImportQuiz}
              >
                Pull in
              </Button>
            </div>
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          {status && (
            <span className={`text-[11.5px] flex items-center gap-1.5 ${status.tone === 'ok' ? 'text-ink-mint' : 'text-ink-blush'}`}>
              <Icon name={status.tone === 'ok' ? 'check_circle' : 'priority_high'} className="text-[14px]" />
              {status.text}
            </span>
          )}
          {classAverage != null && (
            <Badge tone={classAverage >= 70 ? 'mint' : classAverage >= 50 ? 'blue' : 'blush'}>Class {classAverage}%</Badge>
          )}
        </div>
      </Card>

      {students.length === 0 ? (
        <EmptyState icon="groups" title={`No students in ${activeClass}`} body="Students registered into this class appear here." />
      ) : columns.length === 0 ? (
        <EmptyState
          icon="table_chart"
          title="The sheet is empty"
          body="Add an assessment to create your first column, then type each student's mark down it."
          action={
            <Button icon="add" onClick={() => setAddingColumn(true)}>
              New assessment
            </Button>
          }
        />
      ) : (
        <Card pad={false} className="overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
            <table ref={gridRef} className="border-collapse text-[12.5px] tabular min-w-full">
              <thead>
                <tr>
                  {/* Sticky in both directions so names stay put while you scroll across. */}
                  <th className="sticky left-0 top-0 z-30 bg-slate-50 dark:bg-slate-900 text-left px-4 py-2.5 min-w-[210px] border-b border-r border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">Student</span>
                  </th>
                  {columns.map((c) => (
                      <th
                        key={c.key}
                        className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-900 px-2 py-2 min-w-[104px] border-b border-r border-slate-200 dark:border-slate-700 align-bottom"
                      >
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-start gap-1">
                            <span className="flex-1 text-left text-[11.5px] font-semibold text-slate-900 dark:text-white leading-tight break-words">
                              {c.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteColumn(c)}
                              aria-label={`Delete the ${c.title} column`}
                              className="shrink-0 text-slate-300 hover:text-danger rounded focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                            >
                              <Icon name="close" className="text-[13px]" />
                            </button>
                          </div>
                          {/* Just the denominator. The category repeats what the
                              column name already says, and a class average in a
                              header competes with the marks underneath it. */}
                          <span className="text-left text-[10px] text-slate-400">/{c.maxScore}</span>
                        </div>
                      </th>
                  ))}
                  <th className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-900 px-3 py-2 min-w-[92px] border-b border-slate-200 dark:border-slate-700 align-bottom">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">Total CA </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, r) => {
                  const avg = rowAverage(s.id);
                  return (
                    <tr key={s.id} className="even:bg-slate-50/40 dark:even:bg-slate-900/20">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-surface-light dark:bg-surface-dark even:bg-inherit text-left px-4 py-1.5 border-b border-r border-slate-100 dark:border-slate-800 font-medium text-slate-900 dark:text-white truncate max-w-[210px]"
                      >
                        {s.name}
                      </th>

                      {columns.map((c, ci) => {
                        const cell = `${s.id}||${c.key}`;
                        const existing = cellIndex[cell];
                        const value = draft[cell] ?? (existing ? String(existing.score) : '');
                        const busy = pending[cell];
                        return (
                          <td key={c.key} className="p-0 border-b border-r border-slate-100 dark:border-slate-800 relative">
                            <input
                              data-r={r}
                              data-c={ci}
                              inputMode="decimal"
                              value={value}
                              aria-label={`${c.title} mark for ${s.name}, out of ${c.maxScore}`}
                              onChange={(e) => setDraft((d) => ({ ...d, [cell]: e.target.value }))}
                              onFocus={(e) => e.currentTarget.select()}
                              onBlur={(e) => commitCell(s, c, e.target.value)}
                              onKeyDown={(e) => onCellKeyDown(e, r, ci)}
                              className={`w-full h-9 px-2 text-right bg-transparent outline-none transition-colors
                                focus:bg-tint-blue focus:ring-2 focus:ring-inset focus:ring-primary
                                ${existing ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-400'}`}
                            />
                            {busy && (
                              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                <Icon name="spinner" className="text-[11px] text-primary animate-spin" />
                              </span>
                            )}
                          </td>
                        );
                      })}

                      <td className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-right">
                        {avg == null ? (
                          <span className="text-[11px] text-slate-300">—</span>
                        ) : (
                          <span
                            className={`text-[12px] font-bold ${
                              avg >= 70 ? 'text-ink-mint' : avg >= 50 ? 'text-ink-blue' : 'text-ink-blush'
                            }`}
                          >
                            {avg}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <InlineNote icon="info">
        Each mark saves the moment you leave the cell — there is no Save button. An empty cell means no mark was given, not
        a zero, so it is left out of the average rather than counted against the student. The CA average is scaled to the{' '}
        {CA_MAX}-mark column on Report Generation; you never type that figure directly.
      </InlineNote>

      <Drawer
        open={addingColumn}
        onClose={() => setAddingColumn(false)}
        title="New assessment"
        subtitle="Adds a column to the sheet"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddingColumn(false)}>
              Cancel
            </Button>
            <Button className="flex-1" icon="add" onClick={handleAddColumn} disabled={!newColumn.title.trim()}>
              Add column
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Name" hint="What you would write at the top of the column.">
            <Input
              value={newColumn.title}
              onChange={(e) => setNewColumn({ ...newColumn, title: e.target.value })}
              placeholder="e.g. Chapter 3 test"
            />
          </Field>
          <Field label="Category">
            <Select value={newColumn.category} onChange={(e) => setNewColumn({ ...newColumn, category: e.target.value })}>
              {ASSESSMENT_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-3">
            <Field label="Out of" className="w-32">
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={newColumn.maxScore}
                onChange={(e) => setNewColumn({ ...newColumn, maxScore: e.target.value })}
                className="text-right"
              />
            </Field>
            <Field label="Date" className="flex-1">
              <Input type="date" value={newColumn.date} onChange={(e) => setNewColumn({ ...newColumn, date: e.target.value })} />
            </Field>
          </div>
          <InlineNote icon="info">
            Marks are averaged as percentages, so columns can be out of different totals — a mark out of 20 counts the same
            as one out of 100.
          </InlineNote>
        </div>
      </Drawer>
    </WorkSurface>
  );
};

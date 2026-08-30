import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';
import { WorkSurface } from '../../components/Layouts';
import {
  Avatar, Badge, Button, Card, Chip, EmptyState, InlineNote, Input, PageHeader, Select, SkeletonTable,
} from '../../components/ui';
import { CA_MAX, EXAM_MAX, SUBJECT_MAX, gradeFor } from '../../lib/grading';

interface CaScore {
  /** Already weighted to the admin's CA share, e.g. 88% of 50 = 44. */
  caScore: number;
  /** The raw assessment-book average, before weighting. */
  averagePercent: number;
  entryCount: number;
}

/**
 * Exam marks are typed out of 100 — the figure that is actually on the paper — and
 * the admin's exam weight is applied by the system, so a teacher never does "×0.5"
 * in their head.
 *
 * A mark saved BEFORE the weighting changed was weighted against the old maximum,
 * and nothing records what that maximum was. A 60 stored when the exam share was 60
 * is a full mark; read against a share of 50 it converts to 120 out of 100. Such a
 * row is flagged rather than quietly capped: silently turning 60 into 50 would
 * change a student's score without anyone being told.
 */
const EXAM_RAW_MAX = 100;
const toWeightedExam = (raw: number) => Math.round(((raw / EXAM_RAW_MAX) * EXAM_MAX) * 100) / 100;
const toRawExam = (weighted: number) =>
  Math.min(EXAM_RAW_MAX, Math.max(0, Math.round(((weighted / EXAM_MAX) * EXAM_RAW_MAX) * 100) / 100));

/** Clamp and validate against the paper's own total, not the weighted share. */
const clampRawExam = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(EXAM_RAW_MAX, Math.max(0, Math.round(n * 100) / 100));
};

const rawExamError = (value: unknown): string | null => {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n)) return 'Enter a number';
  if (n < 0) return 'Cannot be negative';
  if (n > EXAM_RAW_MAX) return `Exam cannot exceed ${EXAM_RAW_MAX}`;
  return null;
};

const TERMS = ['Term 1', 'Term 2', 'Term 3'];

export const TeacherReportEntry: React.FC = () => {
  const { user } = useAuth();
  const assignedClasses = user?.assignedClasses && user.assignedClasses.length > 0 ? user.assignedClasses : ['Unassigned'];
  const [students, setStudents] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [grades, setGrades] = useState<Record<string, { exam: number; remarks: string }>>({});
  const [caScores, setCaScores] = useState<Record<string, CaScore>>({});
  const [existingReports, setExistingReports] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Seeded empty on purpose: the real list arrives from teacher_assignments below.
  // Seeding from user.assignedClasses cached the class picked at LOGIN, so an admin
  // changing assignments left this pointing at a class no longer in the chip list —
  // no chip highlighted, no subjects, and the screen looked locked to one class.
  const [activeClass, setActiveClass] = useState('');
  const [currentTerm, setCurrentTerm] = useState('Term 2');
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  // Rows the teacher has typed into since the last save. The subject_reports
  // subscription re-reads every few seconds and also re-fires whenever it is
  // resubscribed; without this it overwrote in-progress marks with whatever was
  // last saved, which looks exactly like a field that refuses to be edited.
  const dirtyRef = useRef<Set<string>>(new Set());
  const [assignments, setAssignments] = useState<{ classId: string; courseCode: string; subject: string }[]>([]);

  // Subjects are per class, not global. A teacher who takes English in Grade 7 and
  // Maths in Grade 9 must only ever see English while Grade 7 is selected — offering
  // both everywhere is what used to make a class expect a subject nobody taught there.
  const mySubjects = useMemo(
    () => [...new Set(assignments.filter((a) => a.classId === activeClass).map((a) => a.subject))].sort(),
    [assignments, activeClass],
  );

  /** Classes this teacher actually takes a subject in. */
  const myClasses = useMemo(() => {
    const fromAssignments = [...new Set(assignments.map((a) => a.classId))];
    return fromAssignments.length ? fromAssignments.sort() : assignedClasses;
  }, [assignments, assignedClasses]);
  const [activeSubject, setActiveSubject] = useState('');

  useEffect(() => {
    firestoreService
      .getTeacherAssignments()
      .then((rows) => {
        setAssignments(rows);
        // Nothing to teach means no class will ever be selected, and the students
        // fetch below never runs — so release the skeleton here or it spins forever.
        if (rows.length === 0) setLoading(false);
      })
      .catch(() => {
        setAssignments([]);
        setLoading(false);
      });
  }, [user?.uid]);

  // Keep the chosen class valid — mirrors the subject reconciliation below.
  useEffect(() => {
    if (myClasses.length === 0) return;
    if (!activeClass || !myClasses.includes(activeClass)) setActiveClass(myClasses[0]);
  }, [myClasses, activeClass]);

  // Keep the chosen subject valid for the chosen class.
  useEffect(() => {
    if (mySubjects.length === 0) {
      if (activeSubject) setActiveSubject('');
      return;
    }
    if (!activeSubject || !mySubjects.includes(activeSubject)) setActiveSubject(mySubjects[0]);
  }, [mySubjects, activeSubject]);

  useEffect(() => {
    firestoreService
      .getSystemSettings()
      .then((settings) => {
        if (settings?.current_term) setCurrentTerm(settings.current_term);
      })
      .catch(() => {});
    firestoreService.getCourses((data) => setCourses(data));
  }, []);

  useEffect(() => {
    if (!user?.uid || !activeClass) return;
    const unsub = firestoreService.getStudentsForClass(activeClass, (data) => {
      setStudents(data);
      setLoading(false);
    });
    return () => unsub();
  }, [user, activeClass]);

  // Existing subject_reports for this class/subject/term — prefills what is saved
  // and tells us which rows are locked (already submitted).
  useEffect(() => {
    if (!activeClass || !activeSubject || !currentTerm) return;
    const unsub = firestoreService.getSubjectReports({ classId: activeClass, subject: activeSubject, term: currentTerm }, (data) => {
      const map: Record<string, any> = {};
      const gradeMap: Record<string, any> = {};
      data.forEach((r: any) => {
        map[r.studentId] = r;
        gradeMap[r.studentId] = { exam: toRawExam(Number(r.examScore) || 0), remarks: r.remarks || '' };
      });
      setExistingReports(map);
      setGrades((prev) => {
        const next = { ...prev };
        students.forEach((s) => {
          // Never clobber a row being edited right now.
          if (dirtyRef.current.has(s.id)) return;
          next[s.id] = gradeMap[s.id] || prev[s.id] || { exam: 0, remarks: '' };
        });
        return next;
      });
    });
    return () => unsub();
  }, [activeClass, activeSubject, currentTerm, students]);

  // CA is auto-computed from the Assessment Book, never typed in here.
  useEffect(() => {
    if (students.length === 0 || !activeClass) return;
    let cancelled = false;
    Promise.all(
      students.map((s) =>
        firestoreService
          .getAssessmentSummary(s.id, activeClass, currentTerm, CA_MAX, activeSubject)
          .then((summary) => [s.id, summary] as const)
          .catch(() => [s.id, { caScore: 0, entryCount: 0 }] as const),
      ),
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, CaScore> = {};
      results.forEach(([id, summary]) => {
        map[id] = summary;
      });
      setCaScores(map);
    });
    return () => {
      cancelled = true;
    };
  }, [students, activeClass, currentTerm, activeSubject]);

  useEffect(() => {
    dirtyRef.current.clear();
  }, [activeClass, activeSubject, currentTerm]);

  const isLocked = (studentId: string) => existingReports[studentId]?.status === 'submitted';

  const handleGradeChange = (studentId: string, field: 'exam' | 'remarks', value: any) => {
    if (isLocked(studentId)) return;
    dirtyRef.current.add(studentId);
    setStatus(null);
    setGrades((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        // Was `Number(value) || 0` — an out-of-range mark was stored as typed
        // because `max` on the input only styles, it does not block.
        [field]: field === 'remarks' ? value : clampRawExam(value),
      },
    }));
  };

  /** How many assessments the best-covered student has — our stand-in for "expected". */
  const expectedEntries = useMemo(
    () => Math.max(0, ...students.map((s) => caScores[s.id]?.entryCount ?? 0)),
    [students, caScores],
  );

  const rows = useMemo(
    () =>
      students.map((s) => {
        // caRaw is the assessment book's own average; caWeighted is that average
        // taken to the admin's CA share. Both are shown so the arithmetic is visible.
        const caWeighted = Number(caScores[s.id]?.caScore ?? 0) || 0;
        const caRaw = Number(caScores[s.id]?.averagePercent ?? 0) || 0;
        const entryCount = caScores[s.id]?.entryCount ?? 0;
        const examRaw = Number(grades[s.id]?.exam ?? 0) || 0;
        const examWeighted = toWeightedExam(examRaw);
        // The stored mark exceeds today's exam share, so it was saved under a
        // different weighting and cannot be trusted until it is re-entered.
        const storedExam = Number(existingReports[s.id]?.examScore ?? NaN);
        const staleWeighting = Number.isFinite(storedExam) && storedExam > EXAM_MAX;
        const total = Math.round((caWeighted + examWeighted) * 100) / 100;
        return {
          student: s,
          ca: caWeighted,
          caRaw,
          entryCount,
          exam: examRaw,
          examWeighted,
          total,
          band: gradeFor(total),
          error: rawExamError(examRaw),
          staleWeighting,
          locked: isLocked(s.id),
          noCa: entryCount === 0,
          partialCa: entryCount > 0 && expectedEntries > 0 && entryCount < expectedEntries,
        };
      }),
    [students, caScores, grades, existingReports, expectedEntries],
  );

  const editable = rows.filter((r) => !r.locked);
  const blocking = editable.filter((r) => r.error).length;
  const entered = editable.filter((r) => r.exam > 0).length;
  const allLocked = students.length > 0 && rows.every((r) => r.locked);

  const persist = () =>
    Promise.all(
      editable.map((r) =>
        firestoreService.saveSubjectReport({
          studentId: r.student.id,
          classId: activeClass,
          term: currentTerm,
          subject: activeSubject,
          caScore: r.ca,
          // Stored weighted: report cards, merges and grades are all out of 100.
          examScore: r.examWeighted,
          remarks: grades[r.student.id]?.remarks ?? '',
        }),
      ),
    );

  const saveDraft = async () => {
    // Saving nothing is not a success. With every row locked, persist() iterates an
    // empty list and the old code still reported "Draft saved", which reads as though
    // the screen should now be editable.
    if (editable.length === 0) {
      setStatus({
        tone: 'bad',
        text: 'Nothing to save — every row here is submitted and locked. An administrator must reopen it first.',
      });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await persist();
      dirtyRef.current.clear();
      setStatus({ tone: 'ok', text: `Draft saved for ${activeSubject}. You can keep editing until you submit.` });
    } catch (error) {
      console.error('Save failed:', error);
      // Show what the server actually said. "Try again" is wrong advice when the
      // reason is that the subject is already submitted and needs an admin to reopen it.
      setStatus({
        tone: 'bad',
        text: error instanceof Error ? error.message : 'Could not save. Your entries are still on screen — try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const submitToClassTeacher = async () => {
    if (blocking > 0) return;
    if (
      !window.confirm(
        `Submit ${activeSubject} scores for ${activeClass} (${currentTerm})? You won't be able to edit them afterward unless an Admin reopens them.`,
      )
    )
      return;
    setSubmitting(true);
    setStatus(null);
    try {
      await persist();
      dirtyRef.current.clear();
      await firestoreService.submitSubjectReports(activeClass, activeSubject, currentTerm);
      setStatus({ tone: 'ok', text: `${activeSubject} scores submitted to the class teacher.` });
    } catch (error) {
      console.error('Submission failed:', error);
      setStatus({
        tone: 'bad',
        text: error instanceof Error ? error.message : 'Submission failed. Nothing was locked — try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <WorkSurface>
        <div className="h-14 w-72 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <SkeletonTable rows={6} />
      </WorkSurface>
    );
  }

  if (assignments.length === 0) {
    return (
      <WorkSurface>
        <PageHeader title="Report Generation" />
        <EmptyState
          icon="menu_book"
          title="You have no subjects assigned"
          body="Ask your school administrator to assign you a subject in a class, under Registration."
        />
      </WorkSurface>
    );
  }

  return (
    <WorkSurface>
      <PageHeader
        title="Report Generation"
        subtitle={`Enter exam scores and remarks. Continuous assessment comes from your Assessment Book.`}
      />

      {/* Context bar */}
      <Card className="flex flex-wrap items-center gap-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">Class</span>
          {myClasses.map((c) => (
            <Chip key={c} active={c === activeClass} onClick={() => setActiveClass(c)}>
              {c}
            </Chip>
          ))}
        </div>
        <span className="hidden md:block w-px h-6 bg-slate-200 dark:bg-slate-700" />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">Subject</span>
          {mySubjects.map((s) => (
            <Chip key={s} active={s === activeSubject} onClick={() => setActiveSubject(s)}>
              {s}
            </Chip>
          ))}
        </div>
        <span className="hidden md:block w-px h-6 bg-slate-200 dark:bg-slate-700" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">Term</span>
          <Select value={currentTerm} onChange={(e) => setCurrentTerm(e.target.value)} className="h-8 text-xs">
            {TERMS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </div>
      </Card>

      {mySubjects.length === 0 ? (
        <EmptyState
          icon="menu_book"
          title={`You do not teach a subject in ${activeClass}`}
          body="Pick one of your other classes above, or ask an administrator to correct your assignments."
        />
      ) : null}

      {allLocked && (
        <InlineNote tone="mint" icon="lock">
          Every row for {activeSubject} in {activeClass} has been submitted and locked. An administrator can reopen them.
        </InlineNote>
      )}

      {mySubjects.length === 0 ? null : students.length === 0 ? (
        <EmptyState icon="groups" title={`No students in ${activeClass}`} body="Students registered into this class will appear here." />
      ) : (
        <Card pad={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[1040px]">
              <thead className="bg-slate-50 dark:bg-slate-900/40">
                <tr className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                  <th className="text-left px-5 py-3.5 w-10">#</th>
                  <th className="text-left px-2 py-3.5">Student</th>
                  <th className="text-right px-2 py-3.5 w-24">CA(100)</th>
                  <th className="text-right px-2 py-3.5 w-24">CA ({CA_MAX})</th>
                  <th className="text-right px-2 py-3.5 w-32">Exam ({EXAM_RAW_MAX})</th>
                  <th className="text-right px-2 py-3.5 w-24">Exam ({EXAM_MAX})</th>
                  <th className="text-right px-2 py-3.5 w-20">Total</th>
                  <th className="text-center px-2 py-3.5 w-20">Grade</th>
                  <th className="text-left px-2 py-3.5">Remark</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const rowTint = r.locked
                    ? 'bg-slate-50 dark:bg-slate-900/40'
                    : r.error
                      ? 'bg-tint-blush'
                      : r.noCa || r.partialCa
                        ? 'bg-tint-butter'
                        : '';
                  return (
                    <tr key={r.student.id} className={`border-t border-slate-100 dark:border-slate-800 ${rowTint}`}>
                      <td className="px-5 py-2.5 text-[11.5px] font-semibold text-slate-300">
                        {String(i + 1).padStart(2, '0')}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={r.student.name} size={30} tint={r.locked ? 'plain' : 'blue'} />
                          <span className={`text-[12.5px] font-medium ${r.locked ? 'text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                            {r.student.name}
                          </span>
                        </div>
                      </td>
                      {/* Straight from the Assessment Book, before weighting. */}
                      <td className="px-2 py-2.5 text-right">
                        <span className={`text-[12.5px] font-semibold ${r.noCa ? 'text-ink-butter' : 'text-slate-600 dark:text-slate-300'}`}>
                          {r.noCa ? '—' : `${r.caRaw}%`}
                        </span>
                        <span className={`block text-[10px] mt-px ${r.noCa || r.partialCa ? 'text-ink-butter' : 'text-slate-400'}`}>
                          {r.noCa
                            ? 'no assessments'
                            : r.partialCa
                              ? `${r.entryCount} of ${expectedEntries} entries`
                              : `${r.entryCount} entr${r.entryCount === 1 ? 'y' : 'ies'}`}
                        </span>
                      </td>

                      {/* The same figure at the admin's CA weight. */}
                      <td className="px-2 py-2.5 text-right">
                        <span className={`text-[13px] font-bold ${r.noCa ? 'text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                          {r.noCa ? '—' : r.ca}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        {r.locked ? (
                          <div className="h-[38px] rounded-[11px] bg-slate-100 dark:bg-slate-800 flex items-center justify-end px-3 text-[13px] font-semibold text-slate-400">
                            {r.exam}
                          </div>
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            max={EXAM_RAW_MAX}
                            inputMode="numeric"
                            value={r.exam}
                            invalid={!!r.error}
                            onChange={(e) => handleGradeChange(r.student.id, 'exam', e.target.value)}
                            aria-label={`Exam score out of ${EXAM_RAW_MAX} for ${r.student.name}`}
                            className="h-[38px] w-full text-right font-semibold"
                          />
                        )}

                        {/* Sits under the mark it is about. It used to occupy the
                            Remark cell, which meant a flagged row could not be
                            given a remark at all. */}
                        {r.error ? (
                          <span className="mt-1 flex items-center justify-end gap-1 text-[10px] font-medium text-ink-blush">
                            <Icon name="priority_high" className="text-[12px]" />
                            {r.error}
                          </span>
                        ) : r.staleWeighting ? (
                          <span className="mt-1 flex items-center justify-end gap-1 text-[10px] font-medium text-ink-butter">
                            <Icon name="warning" className="text-[12px]" />
                            Older weighting — re-enter
                          </span>
                        ) : null}
                      </td>

                      {/* Weighted automatically — the teacher never does the arithmetic. */}
                      <td className="px-2 py-2.5 text-right">
                        <span className={`text-[13px] font-bold ${r.error ? 'text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                          {r.error ? '—' : r.examWeighted}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right text-[13px] font-bold text-slate-900 dark:text-white">
                        {r.error ? <span className="text-slate-300">—</span> : r.total}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        {r.error || !r.band ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : (
                          <Badge tone={r.band.tone}>{r.band.label}</Badge>
                        )}
                      </td>
                      <td className="px-2 py-2.5 pr-5">
                        {r.locked ? (
                          <span className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
                            <Icon name="lock" className="text-[14px]" />
                            Submitted · locked
                          </span>
                        ) : (
                          <Input
                            value={grades[r.student.id]?.remarks ?? ''}
                            onChange={(e) => handleGradeChange(r.student.id, 'remarks', e.target.value)}
                            placeholder="Add a remark"
                            aria-label={`Remark for ${r.student.name}`}
                            className="h-[38px] w-full"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-2.5">
                <div className="w-32 h-[7px] rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${editable.length ? (entered / editable.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-[11.5px] text-slate-500">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {entered} of {editable.length}
                  </span>{' '}
                  entered
                </span>
              </div>
              {blocking > 0 && (
                <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-blush">
                  <Icon name="priority_high" className="text-[14px]" />
                  {blocking} {blocking === 1 ? 'error blocks' : 'errors block'} submission
                </span>
              )}
              {status && (
                <span className={`flex items-center gap-1.5 text-[11.5px] ${status.tone === 'ok' ? 'text-ink-mint' : 'text-ink-blush'}`}>
                  <Icon name={status.tone === 'ok' ? 'check_circle' : 'priority_high'} className="text-[14px]" />
                  {status.text}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <Button variant="secondary" onClick={saveDraft} loading={saving} disabled={allLocked}>
                Save draft
              </Button>
              <Button onClick={submitToClassTeacher} loading={submitting} disabled={allLocked || blocking > 0 || editable.length === 0}>
                Submit for approval
              </Button>
            </div>
          </div>
        </Card>
      )}

      <InlineNote icon="info">
        Enter the exam mark out of {EXAM_RAW_MAX} — the figure on the paper. The system weights it to {EXAM_MAX} and adds the
        CA, weighted to {CA_MAX}, for a total out of {SUBJECT_MAX}. Both weights come from School Settings. Changing them
        affects marks entered afterwards; anything saved under the previous weighting is flagged in its row and has to be
        re-entered, because nothing records which maximum it was marked against. CA comes from the Assessment Book and
        cannot be typed here; a partly-assessed student is flagged but can still be submitted.
      </InlineNote>
    </WorkSurface>
  );
};

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';
import { SubjectMergeStatus, MergedStudentSubjects } from '../../types';
import { WorkSurface } from '../../components/Layouts';
import {
  Avatar, Badge, Button, Card, Chip, EmptyState, InlineNote, PageHeader, ProgressBar, SkeletonTable, StatTile,
  Td, Textarea, Th,
} from '../../components/ui';
import { CA_MAX, EXAM_MAX, SUBJECT_MAX, gradeFor } from '../../lib/grading';

/**
 * Class Teacher Review.
 *
 * The class teacher's job here is narrow: read each child's report card as it is
 * coming together, see which subject teachers are still outstanding, and write the
 * remark that goes on the card. They do not enter or change marks — those belong to
 * the subject teachers — so nothing on this screen edits a score.
 *
 * The roster lists EVERY student in the class, not only those whose subjects have
 * arrived: a child nobody has submitted for is exactly the one the class teacher
 * needs to notice.
 */

export const TeacherClassReview: React.FC = () => {
  const { user } = useAuth();
  const [myClasses, setMyClasses] = useState<any[]>([]);
  const [activeClass, setActiveClass] = useState('');
  const [currentTerm, setCurrentTerm] = useState('Term 2');
  const [roster, setRoster] = useState<any[]>([]);
  const [mergeStatus, setMergeStatus] = useState<SubjectMergeStatus | null>(null);
  const [merged, setMerged] = useState<MergedStudentSubjects[]>([]);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  // Which student's card is open. Null means the roster.
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  const [draftRemark, setDraftRemark] = useState('');
  const [savingRemark, setSavingRemark] = useState(false);
  // Finalised cards for this class+term, keyed by student, so the class teacher can
  // open the same PDF a parent will receive and check it before or after release.
  const [reports, setReports] = useState<Record<string, any>>({});
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    firestoreService
      .getSystemSettings()
      .then((settings) => {
        if (settings?.current_term) setCurrentTerm(settings.current_term);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = firestoreService.getGrades((data) => {
      const mine = data.filter((g: any) => g.classTeacherId === user.uid);
      setMyClasses(mine);
      setActiveClass((prev) => prev || mine[0]?.name || '');
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!activeClass) return;
    const unsub = firestoreService.getStudentsForClass(activeClass, setRoster);
    return () => unsub();
  }, [activeClass]);

  useEffect(() => {
    if (!activeClass || !currentTerm) return;
    firestoreService
      .getSubjectMergeStatus(activeClass, currentTerm)
      .then(setMergeStatus)
      .catch(() => setMergeStatus(null));
  }, [activeClass, currentTerm]);

  useEffect(() => {
    if (!activeClass || !currentTerm) return;
    const unsub = firestoreService.getMergedSubjectReports(activeClass, currentTerm, setMerged);
    return () => unsub();
  }, [activeClass, currentTerm]);

  useEffect(() => {
    if (!activeClass || !currentTerm) return;
    const unsub = firestoreService.getReportsForClass(activeClass, currentTerm, (rows: any[]) =>
      setReports(Object.fromEntries((rows || []).map((r) => [r.studentId, r]))),
    );
    return () => unsub();
  }, [activeClass, currentTerm]);

  const handleDownload = async (studentId: string, studentName: string) => {
    const report = reports[studentId];
    if (!report) return;
    setDownloading(studentId);
    setStatus(null);
    try {
      await firestoreService.downloadReportPdf(report.id);
    } catch (error) {
      setStatus({
        tone: 'bad',
        text: error instanceof Error ? error.message : `Could not download ${studentName}'s report card.`,
      });
    } finally {
      setDownloading(null);
    }
  };

  const loadRemarks = useCallback(() => {
    if (!activeClass || !currentTerm) return;
    firestoreService
      .getClassRemarks(activeClass, currentTerm)
      .then((rows) => setRemarks(Object.fromEntries(rows.map((r) => [r.studentId, r.remark]))))
      .catch(() => setRemarks({}));
  }, [activeClass, currentTerm]);

  useEffect(loadRemarks, [loadRemarks]);

  // Moving between classes or terms closes the open card: it belonged to the old one.
  useEffect(() => {
    setOpenStudentId(null);
  }, [activeClass, currentTerm]);

  /* ---- derived ----------------------------------------------------------- */

  /** Every subject this class is expected to produce, from the merge status. */
  const expectedSubjects = useMemo(
    () => (mergeStatus?.subjects ?? []).map((s) => s.subject),
    [mergeStatus],
  );

  const mergedById = useMemo(
    () => Object.fromEntries(merged.map((m) => [m.studentId, m])),
    [merged],
  );

  const overallFor = (student?: MergedStudentSubjects) => {
    if (!student || student.subjects.length === 0) return null;
    const total = student.subjects.reduce((sum, s) => sum + s.caScore + s.examScore, 0);
    return Math.round((total / student.subjects.length) * 100) / 100;
  };

  const openStudent = openStudentId ? roster.find((s) => s.id === openStudentId) : null;
  const openMerged = openStudentId ? mergedById[openStudentId] : undefined;

  const openCard = (studentId: string) => {
    setOpenStudentId(studentId);
    setDraftRemark(remarks[studentId] ?? '');
    setStatus(null);
  };

  const handleSaveRemark = async () => {
    if (!openStudentId) return;
    setSavingRemark(true);
    setStatus(null);
    try {
      await firestoreService.saveClassRemark(activeClass, currentTerm, openStudentId, draftRemark);
      setRemarks((prev) => {
        const next = { ...prev };
        if (draftRemark.trim() === '') delete next[openStudentId];
        else next[openStudentId] = draftRemark.trim();
        return next;
      });
      setStatus({
        tone: 'ok',
        text: draftRemark.trim() === '' ? 'Remark removed.' : 'Remark saved. It will print on this report card.',
      });
    } catch (error) {
      setStatus({ tone: 'bad', text: error instanceof Error ? error.message : 'Could not save that remark.' });
    } finally {
      setSavingRemark(false);
    }
  };

  const handleFinalize = async () => {
    setStatus(null);
    if (!mergeStatus?.allComplete) {
      setStatus({ tone: 'bad', text: 'Every subject must be submitted before this class can be finalized.' });
      return;
    }
    const missing = roster.filter((s) => !(remarks[s.id] ?? '').trim());
    if (
      missing.length > 0 &&
      !window.confirm(
        `${missing.length} student(s) have no remark yet:\n\n${missing.map((s) => s.name).join(', ')}\n\nFinalize anyway? Their cards will go out with an empty remark.`,
      )
    )
      return;
    if (!window.confirm(`Finalize and submit ${activeClass}'s report cards (${currentTerm}) for Admin approval?`)) return;

    setFinalizing(true);
    try {
      const result = await firestoreService.finalizeClassReports(activeClass, currentTerm, remarks);
      setStatus({ tone: 'ok', text: `${result.finalizedCount} report card(s) submitted for admin approval.` });
    } catch (error) {
      console.error('Finalize failed:', error);
      setStatus({ tone: 'bad', text: error instanceof Error ? error.message : 'Could not finalize the reports.' });
    } finally {
      setFinalizing(false);
    }
  };

  /* ---- states ------------------------------------------------------------ */

  if (loading) {
    return (
      <WorkSurface>
        <div className="h-14 w-72 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <SkeletonTable rows={5} />
      </WorkSurface>
    );
  }

  if (myClasses.length === 0) {
    return (
      <WorkSurface>
        <PageHeader title="Class Teacher Review" />
        <EmptyState
          icon="task_alt"
          title="You are not a class teacher"
          body="This screen belongs to whoever is set as class teacher for a class. Ask your administrator if that should be you."
        />
      </WorkSurface>
    );
  }

  const submitted = mergeStatus?.subjects.filter((s) => s.complete).length ?? 0;
  const totalSubjects = mergeStatus?.subjects.length ?? 0;
  const remarked = roster.filter((s) => (remarks[s.id] ?? '').trim()).length;

  const statusLine = status && (
    <span className={`text-[11.5px] flex items-center gap-1.5 ${status.tone === 'ok' ? 'text-ink-mint' : 'text-ink-blush'}`}>
      <Icon name={status.tone === 'ok' ? 'check_circle' : 'priority_high'} className="text-[14px]" />
      {status.text}
    </span>
  );

  /* ---- one student's report card ----------------------------------------- */

  if (openStudent) {
    const rows = expectedSubjects.map((subject) => {
      const entry = openMerged?.subjects.find((s) => s.subject === subject);
      return { subject, entry };
    });
    // A subject submitted for this child that nobody expected — still show it.
    (openMerged?.subjects ?? []).forEach((s) => {
      if (!expectedSubjects.includes(s.subject)) rows.push({ subject: s.subject, entry: s });
    });

    const present = rows.filter((r) => r.entry);
    const overall = overallFor(openMerged);
    const band = overall != null ? gradeFor(overall) : null;
    const savedRemark = remarks[openStudent.id] ?? '';
    const dirty = draftRemark.trim() !== savedRemark.trim();

    return (
      <WorkSurface>
        <PageHeader
          breadcrumb={
            <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
              <button
                onClick={() => setOpenStudentId(null)}
                className="hover:text-primary rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {activeClass}
              </button>
              <Icon name="chevron_right" className="text-[13px]" />
              <span className="text-primary font-semibold">{openStudent.name}</span>
            </div>
          }
          title={openStudent.name}
          subtitle={`${activeClass} · ${currentTerm} · ${openStudent.admissionNumber || openStudent.loginId || ''}`}
          actions={
            <>
              {statusLine}
              {reports[openStudent.id] && (
                <Button
                  variant="secondary"
                  icon="file_download"
                  loading={downloading === openStudent.id}
                  onClick={() => handleDownload(openStudent.id, openStudent.name)}
                >
                  Download PDF
                </Button>
              )}
              <Button variant="secondary" icon="arrow_back" onClick={() => setOpenStudentId(null)}>
                Back to class
              </Button>
            </>
          }
        />

        <Card className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-4 justify-between">
            <div className="flex items-center gap-3.5">
              <Avatar name={openStudent.name} size={44} />
              <div>
                <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">{openStudent.name}</p>
                <p className="text-[11.5px] text-slate-500">
                  {present.length} of {rows.length} subject{rows.length === 1 ? '' : 's'} submitted
                </p>
              </div>
            </div>
            {overall != null && (
              <div className="flex items-center gap-2.5">
                <span className="text-[17px] font-bold text-slate-900 dark:text-white">
                  {overall}
                  <span className="text-slate-400 font-medium text-[13px]"> / {SUBJECT_MAX}</span>
                </span>
                {band && <Badge tone={band.tone}>{band.label}</Badge>}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[560px]">
              <thead className="bg-slate-50 dark:bg-slate-900/40">
                <tr>
                  <Th>Subject</Th>
                  <Th className="text-right w-24">CA {CA_MAX}</Th>
                  <Th className="text-right w-24">Exam {EXAM_MAX}</Th>
                  <Th className="text-right w-20">Total</Th>
                  <Th className="text-center w-20">Grade</Th>
                  <Th>Subject teacher&rsquo;s remark</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ subject, entry }) => {
                  if (!entry) {
                    // The point of this screen: an outstanding subject is visible per child.
                    return (
                      <tr key={subject} className="bg-tint-butter/40">
                        <Td className="font-semibold text-slate-900 dark:text-white">{subject}</Td>
                        <Td colSpan={5} className="text-ink-butter text-[11.5px]">
                          <span className="inline-flex items-center gap-1.5">
                            <Icon name="pending" className="text-[14px]" />
                            Not submitted yet
                          </span>
                        </Td>
                      </tr>
                    );
                  }
                  const total = entry.caScore + entry.examScore;
                  const b = gradeFor(total);
                  return (
                    <tr key={subject}>
                      <Td className="font-semibold text-slate-900 dark:text-white">{subject}</Td>
                      <Td className="text-right">{entry.caScore}</Td>
                      <Td className="text-right">{entry.examScore}</Td>
                      <Td className="text-right font-semibold text-slate-900 dark:text-white">{total}</Td>
                      <Td className="text-center">{b ? <Badge tone={b.tone}>{b.label}</Badge> : '—'}</Td>
                      <Td className="text-slate-500">{entry.remarks || '—'}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length === 0 && (
            <InlineNote tone="butter" icon="warning">
              No subjects are expected for {activeClass} yet. Subjects appear once teachers are assigned to teach them here.
            </InlineNote>
          )}

          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Your remark</p>
                <p className="mt-0.5 text-[11.5px] text-slate-500">
                  The only thing you write on this card. It prints under the subject table.
                </p>
              </div>
              {savedRemark ? (
                <Badge tone="mint">Remark added</Badge>
              ) : (
                <Badge tone="butter">No remark yet</Badge>
              )}
            </div>

            <Textarea
              rows={3}
              value={draftRemark}
              onChange={(e) => setDraftRemark(e.target.value)}
              placeholder={`How did ${openStudent.name.split(' ')[0]} do this term?`}
              aria-label={`Class teacher remark for ${openStudent.name}`}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button icon="save" onClick={handleSaveRemark} loading={savingRemark} disabled={!dirty}>
                {savedRemark ? 'Update remark' : 'Save remark'}
              </Button>
              {dirty && !savingRemark && <span className="text-[11.5px] text-ink-butter">Unsaved changes</span>}
            </div>
          </div>
        </Card>

        <InlineNote icon="lock">
          Marks are entered by each subject teacher and are read-only here. If something looks wrong, ask the teacher who
          submitted it to correct it before you finalize.
        </InlineNote>
      </WorkSurface>
    );
  }

  /* ---- the class roster --------------------------------------------------- */

  return (
    <WorkSurface>
      <PageHeader
        title="Class Teacher Review"
        subtitle={`${activeClass} · ${currentTerm} — open each student to read their card and write your remark`}
        actions={
          <>
            {statusLine}
            <Button icon="send" loading={finalizing} disabled={!mergeStatus?.allComplete} onClick={handleFinalize}>
              Finalize &amp; submit
            </Button>
          </>
        }
      />

      {myClasses.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {myClasses.map((c) => (
            <Chip key={c.id ?? c.name} active={c.name === activeClass} onClick={() => setActiveClass(c.name)}>
              {c.name}
            </Chip>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile tint="blue" icon="groups" label="Students" value={roster.length} />
        <StatTile
          tint={mergeStatus?.allComplete ? 'mint' : 'peach'}
          icon="fact_check"
          label="Subjects submitted"
          value={totalSubjects ? `${submitted} / ${totalSubjects}` : '—'}
        />
        <StatTile
          tint={roster.length > 0 && remarked === roster.length ? 'mint' : 'butter'}
          icon="edit"
          label="Remarks written"
          value={roster.length ? `${remarked} / ${roster.length}` : '—'}
        />
      </div>

      {/* No teacher is assigned to teach anything in this class, so nothing can ever
          be "submitted" and Finalize would sit disabled with no stated reason. */}
      {mergeStatus && totalSubjects === 0 && (
        <InlineNote tone="peach" icon="warning">
          No subjects are set up for {activeClass}. Report cards are built from the subjects teachers are assigned to
          teach in this class, so until an administrator assigns at least one teacher to it under Registration, there is
          nothing to merge and this class cannot be finalised.
        </InlineNote>
      )}

      {mergeStatus && totalSubjects > 0 && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Subject submissions</p>
            <Badge tone={mergeStatus.allComplete ? 'mint' : 'peach'}>
              {mergeStatus.allComplete ? 'All in' : `${totalSubjects - submitted} outstanding`}
            </Badge>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {mergeStatus.subjects.map((s) => (
              <div key={s.subject} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-[11.5px] text-slate-600 dark:text-slate-400 truncate">{s.subject}</span>
                <ProgressBar
                  value={s.totalStudents ? (s.submittedCount / s.totalStudents) * 100 : 0}
                  tone={s.complete ? 'success' : 'warning'}
                  className="flex-1"
                />
                <span className={`w-14 shrink-0 text-right text-[11px] font-semibold ${s.complete ? 'text-ink-mint' : 'text-ink-peach'}`}>
                  {s.submittedCount}/{s.totalStudents}
                </span>
              </div>
            ))}
          </div>
          {!mergeStatus.allComplete && (
            <InlineNote tone="peach" icon="warning">
              Finalizing is blocked until every subject teacher has submitted. Chase the subjects still short above.
            </InlineNote>
          )}
        </Card>
      )}

      {roster.length === 0 ? (
        <EmptyState
          icon="groups"
          title={`No students in ${activeClass}`}
          body="Students registered into this class appear here for review."
        />
      ) : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[600px]">
              <thead className="bg-slate-50 dark:bg-slate-900/40">
                <tr>
                  <Th>Student</Th>
                  <Th className="w-44">Subjects in</Th>
                  <Th className="text-right w-28">Average</Th>
                  <Th className="w-40">Remark</Th>
                  <Th className="w-28 text-right">Card</Th>
                  <Th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {roster.map((s) => {
                  const m = mergedById[s.id];
                  const have = m?.subjects.length ?? 0;
                  const want = expectedSubjects.length;
                  const overall = overallFor(m);
                  const band = overall != null ? gradeFor(overall) : null;
                  const hasRemark = !!(remarks[s.id] ?? '').trim();
                  return (
                    <tr
                      key={s.id}
                      onClick={() => openCard(s.id)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40"
                    >
                      <Td>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar name={s.name} size={32} />
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-semibold text-slate-900 dark:text-white truncate">{s.name}</p>
                            <p className="text-[10.5px] text-slate-400 truncate">
                              {s.admissionNumber || s.loginId || ''}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            value={want ? (have / want) * 100 : 0}
                            tone={want > 0 && have === want ? 'success' : 'warning'}
                            className="flex-1"
                          />
                          <span
                            className={`text-[11px] font-semibold shrink-0 ${
                              want > 0 && have === want ? 'text-ink-mint' : 'text-ink-peach'
                            }`}
                          >
                            {have}/{want || '—'}
                          </span>
                        </div>
                      </Td>
                      <Td className="text-right">
                        {overall == null ? (
                          <span className="text-[11.5px] text-slate-300">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-[12.5px] font-semibold text-slate-900 dark:text-white">{overall}</span>
                            {band && <Badge tone={band.tone}>{band.label}</Badge>}
                          </span>
                        )}
                      </Td>
                      <Td>
                        {hasRemark ? (
                          <Badge tone="mint">Added</Badge>
                        ) : (
                          <Badge tone="butter">Needed</Badge>
                        )}
                      </Td>
                      <Td className="text-right">
                        {reports[s.id] ? (
                          <button
                            type="button"
                            // The row itself opens the card, so this must not do both.
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(s.id, s.name);
                            }}
                            aria-label={`Download ${s.name}'s report card`}
                            className="h-8 px-2.5 rounded-[10px] bg-slate-50 dark:bg-slate-900/40 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-primary inline-flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          >
                            <Icon
                              name={downloading === s.id ? 'spinner' : 'file_download'}
                              className={`text-[13px] ${downloading === s.id ? 'animate-spin' : ''}`}
                            />
                            PDF
                          </button>
                        ) : (
                          <span className="text-[10.5px] text-slate-300">Not finalised</span>
                        )}
                      </Td>
                      <Td className="text-right">
                        <Icon name="chevron_right" className="text-[16px] text-slate-300" />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <InlineNote icon="lock">
        Finalizing locks every subject entry for this class and sends the batch to an administrator. Only they can release
        it to parents, or send it back to you.
      </InlineNote>
    </WorkSurface>
  );
};

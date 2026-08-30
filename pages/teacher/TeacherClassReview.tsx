import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';
import { SubjectMergeStatus, MergedStudentSubjects } from '../../types';
import { WorkSurface } from '../../components/Layouts';
import {
  Avatar, Badge, Button, Card, Chip, EmptyState, InlineNote, Input, PageHeader, ProgressBar, SkeletonTable, StatTile,
} from '../../components/ui';
import { SUBJECT_MAX, gradeFor } from '../../lib/grading';

export const TeacherClassReview: React.FC = () => {
  const { user } = useAuth();
  const [myClasses, setMyClasses] = useState<any[]>([]);
  const [activeClass, setActiveClass] = useState('');
  const [currentTerm, setCurrentTerm] = useState('Term 2');
  const [mergeStatus, setMergeStatus] = useState<SubjectMergeStatus | null>(null);
  const [merged, setMerged] = useState<MergedStudentSubjects[]>([]);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

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

  const overallFor = (student: MergedStudentSubjects) => {
    if (student.subjects.length === 0) return null;
    const total = student.subjects.reduce((sum, s) => sum + s.caScore + s.examScore, 0);
    return Math.round((total / student.subjects.length) * 100) / 100;
  };

  const handleFinalize = async () => {
    setStatus(null);
    if (!mergeStatus?.allComplete) {
      setStatus({ tone: 'bad', text: 'Every subject must be submitted before this class can be finalized.' });
      return;
    }
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

  return (
    <WorkSurface>
      <PageHeader
        title="Class Teacher Review"
        subtitle={`${activeClass} · ${currentTerm} — merge every subject, add your remark, then send for approval`}
        actions={
          <>
            {status && (
              <span className={`text-[11.5px] flex items-center gap-1.5 ${status.tone === 'ok' ? 'text-ink-mint' : 'text-ink-blush'}`}>
                <Icon name={status.tone === 'ok' ? 'check_circle' : 'priority_high'} className="text-[14px]" />
                {status.text}
              </span>
            )}
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
        <StatTile tint="blue" icon="groups" label="Students" value={mergeStatus?.totalStudents ?? merged.length} />
        <StatTile
          tint={mergeStatus?.allComplete ? 'mint' : 'peach'}
          icon="fact_check"
          label="Subjects submitted"
          value={totalSubjects ? `${submitted} / ${totalSubjects}` : '—'}
        />
        <StatTile
          tint="lilac"
          icon="analytics"
          label="Class average"
          value={
            merged.length
              ? Math.round(
                  (merged.reduce((a, s) => a + (overallFor(s) ?? 0), 0) / merged.length) * 10,
                ) / 10
              : '—'
          }
        />
      </div>

      {mergeStatus && (
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

      {merged.length === 0 ? (
        <EmptyState
          icon="fact_check"
          title="Nothing merged yet"
          body={`Once subject teachers submit scores for ${activeClass}, each student's subjects merge here for your review.`}
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {merged.map((student) => {
            const overall = overallFor(student);
            const band = overall != null ? gradeFor(overall) : null;
            return (
              <Card key={student.studentId} className="flex flex-col gap-3.5">
                <div className="flex items-center gap-3.5">
                  <Avatar name={student.studentName} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">{student.studentName}</p>
                    <p className="text-[11px] text-slate-500">
                      {student.subjects.length} subject{student.subjects.length === 1 ? '' : 's'} merged
                    </p>
                  </div>
                  {overall != null && (
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-[13px] font-bold text-slate-900 dark:text-white">
                        {overall}
                        <span className="text-slate-400 font-medium"> / {SUBJECT_MAX}</span>
                      </span>
                      {band && <Badge tone={band.tone}>{band.label}</Badge>}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {student.subjects.map((s) => {
                    const total = s.caScore + s.examScore;
                    const b = gradeFor(total);
                    return (
                      <span
                        key={s.subject}
                        className="text-[10.5px] px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400"
                      >
                        {s.subject} <span className="font-semibold text-slate-900 dark:text-white">{total}</span>
                        {b ? ` · ${b.label}` : ''}
                      </span>
                    );
                  })}
                </div>

                <Input
                  value={remarks[student.studentId] ?? ''}
                  onChange={(e) => setRemarks((prev) => ({ ...prev, [student.studentId]: e.target.value }))}
                  placeholder="Your remark on this student's term — printed on the report card"
                  aria-label={`Class teacher remark for ${student.studentName}`}
                />
              </Card>
            );
          })}
        </div>
      )}

      <InlineNote icon="lock">
        Finalizing locks every subject entry for this class and sends the batch to an administrator. Only they can release
        it to parents, or send it back to you.
      </InlineNote>
    </WorkSurface>
  );
};

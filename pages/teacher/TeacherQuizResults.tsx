import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { View } from '../../types';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';
import { exportToCSV } from '../../lib/exportUtils';
import { WorkSurface } from '../../components/Layouts';
import {
  Avatar, Badge, Button, Card, Drawer, EmptyState, PageHeader, ProgressBar, SkeletonTable, StatTile, Td, Th,
} from '../../components/ui';

interface TeacherQuizResultsProps {
  onNavigate: (view: View) => void;
}

const same = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

export const TeacherQuizResults: React.FC<TeacherQuizResultsProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [detailResult, setDetailResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    const unsub = firestoreService.onTeacherQuizzesChange(user.uid, (data) => {
      const published = data.filter((q: any) => q.isPublished);
      setQuizzes(published);
      setSelectedQuiz((prev: any) =>
        prev ? published.find((q: any) => q.id === prev.id) || published[0] || null : published[0] || null,
      );
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!selectedQuiz?.id) return;
    const unsub = firestoreService.getQuizResults(selectedQuiz.id, setResults);
    return () => unsub();
  }, [selectedQuiz?.id]);

  // The class roster — previously `totalClassSize` was set to the number of
  // submissions, so "X of Y submitted" always read "X of X".
  useEffect(() => {
    if (!selectedQuiz?.classId) return setRoster([]);
    const unsub = firestoreService.getStudentsForClass(selectedQuiz.classId, setRoster);
    return () => unsub();
  }, [selectedQuiz?.classId]);

  const students = useMemo(
    () =>
      results
        .map((r) => ({
          id: r.studentId,
          name: r.studentName || r.studentId,
          score: `${r.score} / ${r.totalQuestions}`,
          scoreValue: r.score,
          correctCount: r.correctCount,
          totalQuestions: r.totalQuestions,
          submittedAt: r.submittedAt,
          answers: r.answers,
          pct: r.totalQuestions > 0 ? (r.correctCount / r.totalQuestions) * 100 : 0,
        }))
        .sort((a, b) => b.pct - a.pct),
    [results],
  );

  const stats = useMemo(() => {
    const pcts = students.map((s) => s.pct);
    return {
      avgScore: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0,
      completedCount: students.length,
      totalClassSize: roster.length || students.length,
      best: pcts.length ? Math.round(Math.max(...pcts)) : 0,
    };
  }, [students, roster]);

  /** Per-question difficulty, derived from stored answers against the quiz key. */
  const difficulty = useMemo(() => {
    const questions: any[] = selectedQuiz?.questions ?? [];
    if (!questions.length || !results.length) return [];
    return questions.map((q, i) => {
      const correct = results.filter((r) => same(r.answers?.[q.id], q.correctAnswer)).length;
      return { index: i + 1, text: q.text, pct: Math.round((correct / results.length) * 100) };
    });
  }, [selectedQuiz, results]);

  const handleExport = () => {
    if (students.length === 0) return;
    exportToCSV(
      students.map((s, i) => ({ Rank: i + 1, Name: s.name, StudentID: s.id, Score: s.score, SubmittedAt: s.submittedAt })),
      `quiz_results_${selectedQuiz?.title || 'quiz'}.csv`,
    );
  };


  const handleResetAttempt = async () => {
    if (!detailResult || !selectedQuiz) return;
    setResetting(true);
    setResetError(null);
    try {
      await firestoreService.resetQuizAttempt(selectedQuiz.id, detailResult.id);
      // The results subscription will drop the row on its next poll; closing the
      // drawer now stops the teacher staring at a score that no longer exists.
      setDetailResult(null);
      setConfirmReset(false);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : String(err));
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <WorkSurface>
        <div className="h-14 w-64 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <SkeletonTable rows={5} />
      </WorkSurface>
    );
  }

  if (quizzes.length === 0) {
    return (
      <WorkSurface>
        <PageHeader title="Quiz Results" />
        <EmptyState
          icon="leaderboard"
          title="No published quizzes yet"
          body="Results appear once you publish a quiz and students start submitting."
          action={<Button icon="add" onClick={() => onNavigate(View.TEACHER_QUIZ_CONFIG)}>Build a quiz</Button>}
        />
      </WorkSurface>
    );
  }

  const hardest = difficulty.length ? difficulty.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;

  return (
    <WorkSurface>
      <PageHeader
        title="Quiz Results"
        subtitle={selectedQuiz?.title}
        actions={
          <Button variant="secondary" icon="file_download" onClick={handleExport} disabled={students.length === 0}>
            Export CSV
          </Button>
        }
      />

      {quizzes.length > 1 && (
        <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
          {quizzes.map((q) => {
            const on = q.id === selectedQuiz?.id;
            return (
              <button
                key={q.id}
                onClick={() => setSelectedQuiz(q)}
                aria-pressed={on}
                className={`shrink-0 rounded-2xl px-4 py-2.5 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  on ? 'bg-primary shadow-primary' : 'bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700'
                }`}
              >
                <p className={`text-[12.5px] font-semibold ${on ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{q.title}</p>
                <p className={`text-[10.5px] ${on ? 'text-white/70' : 'text-slate-500'}`}>{q.questions?.length ?? 0} questions</p>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          tint="blue"
          icon="groups"
          label={roster.length ? 'Submitted' : 'Submissions'}
          value={roster.length ? `${stats.completedCount} / ${stats.totalClassSize}` : stats.completedCount}
        />
        <StatTile tint="mint" icon="analytics" label="Average score" value={`${stats.avgScore}%`} />
        <StatTile tint="lilac" icon="emoji_events" label="Best score" value={`${stats.best}%`} />
        <StatTile tint="peach" icon="quiz" label="Questions" value={selectedQuiz?.questions?.length ?? 0} />
      </div>

      {students.length === 0 ? (
        <EmptyState
          icon="leaderboard"
          title="No submissions yet"
          body="As students complete the quiz their scores appear here, ranked, with a per-question breakdown."
          action={<Button variant="secondary" onClick={() => onNavigate(View.TEACHER_QUIZ_SHARE)}>Get the share link</Button>}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[620px]">
                <thead className="bg-slate-50 dark:bg-slate-900/40">
                  <tr>
                    <Th className="w-14">Rank</Th>
                    <Th>Student</Th>
                    <Th className="text-right w-28">Score</Th>
                    <Th className="text-right w-24">Correct</Th>
                    <Th className="text-right w-32">Submitted</Th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr
                      key={s.id}
                      onClick={() => setDetailResult(s)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40"
                    >
                      <Td className={`font-bold ${i === 0 ? 'text-ink-butter' : 'text-slate-400'}`}>{i + 1}</Td>
                      <Td>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar name={s.name} size={30} />
                          <span className="text-[12.5px] font-medium text-slate-900 dark:text-white truncate">{s.name}</span>
                        </div>
                      </Td>
                      <Td className="text-right">
                        <Badge tone={s.pct >= 70 ? 'mint' : s.pct >= 50 ? 'blue' : 'blush'}>{s.score}</Badge>
                      </Td>
                      <Td className="text-right">{s.correctCount}</Td>
                      <Td className="text-right text-slate-400">
                        {s.submittedAt
                          ? new Date(s.submittedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {roster.length > students.length && (
              <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
                <span className="text-[11.5px] text-slate-500">
                  {roster.length - students.length} student{roster.length - students.length === 1 ? '' : 's'} in{' '}
                  {selectedQuiz?.classId} have not submitted
                </span>
              </div>
            )}
          </Card>

          <Card className="flex flex-col gap-3 h-fit">
            <div>
              <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Where the class struggled</p>
              <p className="mt-0.5 text-[10.5px] text-slate-400">Share of students who answered correctly</p>
            </div>
            {difficulty.length === 0 ? (
              <p className="text-[11.5px] text-slate-400 leading-relaxed">
                Per-question figures need stored answers. Nothing to break down yet.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-2.5">
                  {difficulty.map((d) => (
                    <div key={d.index} className="flex items-center gap-3" title={d.text}>
                      <span className={`w-6 shrink-0 text-[11px] font-semibold ${d.pct < 50 ? 'text-ink-blush' : 'text-slate-500'}`}>
                        Q{d.index}
                      </span>
                      <ProgressBar value={d.pct} tone={d.pct < 50 ? 'danger' : 'primary'} className="flex-1 h-3" />
                      <span
                        className={`w-9 shrink-0 text-right text-[11.5px] font-semibold ${
                          d.pct < 50 ? 'text-ink-blush' : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {d.pct}%
                      </span>
                    </div>
                  ))}
                </div>
                {hardest && hardest.pct < 50 && (
                  <div className="flex items-start gap-2.5 bg-tint-blush rounded-xl px-3.5 py-3 mt-1">
                    <Icon name="warning" className="text-[15px] text-ink-blush shrink-0 mt-px" />
                    <span className="text-[11.5px] text-ink-blush leading-relaxed">
                      Only {hardest.pct}% got Q{hardest.index} right. Worth reteaching before the next assessment.
                    </span>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      )}

      <Drawer
        open={!!detailResult}
        onClose={() => {
          setDetailResult(null);
          setConfirmReset(false);
          setResetError(null);
        }}
        title={detailResult?.name ?? ''}
        subtitle={detailResult ? `${detailResult.score} correct` : undefined}
        footer={
          detailResult ? (
            <div className="flex flex-col gap-2.5 w-full">
              {resetError && <p className="text-[11.5px] text-ink-blush">{resetError}</p>}
              {confirmReset ? (
                <>
                  <p className="text-[11.5px] text-slate-500 leading-relaxed">
                    This deletes {detailResult.name}&rsquo;s score of {detailResult.score} and lets them sit the quiz
                    again. It cannot be undone, and the reset is recorded in the audit log.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setConfirmReset(false)} disabled={resetting}>
                      Cancel
                    </Button>
                    <Button icon="reset" onClick={handleResetAttempt} disabled={resetting}>
                      {resetting ? 'Resetting…' : 'Yes, clear the attempt'}
                    </Button>
                  </div>
                </>
              ) : (
                <Button variant="secondary" icon="reset" onClick={() => setConfirmReset(true)}>
                  Allow a retake
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        {detailResult && (
          <div className="flex flex-col gap-3">
            {(selectedQuiz?.questions ?? []).map((q: any, i: number) => {
              const given = detailResult.answers?.[q.id];
              const correct = same(given, q.correctAnswer);
              return (
                <div key={q.id ?? i} className={`rounded-[14px] p-3.5 ${correct ? 'bg-slate-50 dark:bg-slate-900/40' : 'bg-tint-blush'}`}>
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`size-6 rounded-lg text-[11px] font-bold flex items-center justify-center shrink-0 ${
                        correct ? 'bg-tint-mint text-ink-mint' : 'bg-white text-ink-blush'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <p className="flex-1 text-[12.5px] font-medium text-slate-900 dark:text-white">{q.text}</p>
                    <Icon
                      name={correct ? 'check_circle' : 'cancel'}
                      className={`text-[17px] shrink-0 ${correct ? 'text-success' : 'text-danger'}`}
                    />
                  </div>
                  <div className="mt-2 pl-[34px] flex flex-col gap-1">
                    <p className="text-[11.5px] text-slate-600 dark:text-slate-400">
                      Answered: <span className="font-medium">{given ? String(given) : 'no answer'}</span>
                    </p>
                    {!correct && (
                      <p className="text-[11.5px] text-ink-mint">
                        Correct: <span className="font-medium">{String(q.correctAnswer)}</span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Drawer>
    </WorkSurface>
  );
};

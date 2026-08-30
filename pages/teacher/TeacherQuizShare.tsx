import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { View } from '../../types';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';
import { WorkSurface } from '../../components/Layouts';
import { Badge, Button, Card, EmptyState, InlineNote, PageHeader, SkeletonTable, StatTile } from '../../components/ui';

interface TeacherQuizShareProps {
  onNavigate: (view: View) => void;
}

export const TeacherQuizShare: React.FC<TeacherQuizShareProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    const unsub = firestoreService.onTeacherQuizzesChange(user.uid, (data) => {
      setQuizzes(data);
      setSelectedQuiz((prev: any) => (prev ? data.find((q: any) => q.id === prev.id) || data[0] || null : data[0] || null));
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  const shareUrl = selectedQuiz ? `${window.location.origin}/join-quiz/${selectedQuiz.id}` : '';

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the link is on screen and selectable regardless.
      setCopied(false);
    }
  };

  if (loading) {
    return (
      <WorkSurface>
        <div className="h-14 w-72 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <SkeletonTable rows={3} />
      </WorkSurface>
    );
  }

  if (quizzes.length === 0) {
    return (
      <WorkSurface>
        <PageHeader title="Share a quiz" />
        <EmptyState
          icon="quiz"
          title="No quizzes yet"
          body="Build a quiz first, then publish it to get a link you can share with your class."
          action={<Button icon="add" onClick={() => onNavigate(View.TEACHER_QUIZ_CONFIG)}>Build a quiz</Button>}
        />
      </WorkSurface>
    );
  }

  const questionCount = selectedQuiz?.questions?.length ?? 0;

  return (
    <WorkSurface>
      <PageHeader
        breadcrumb={
          <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
            <button
              onClick={() => onNavigate(View.TEACHER_QUIZ_CONFIG)}
              className="hover:text-primary rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Setup
            </button>
            <Icon name="chevron_right" className="text-[13px]" />
            <span className="text-primary font-semibold">Share</span>
          </div>
        }
        title={selectedQuiz?.title || 'Share a quiz'}
        actions={
          <>
            {selectedQuiz?.isPublished ? (
              <Badge tone="mint">Live · accepting answers</Badge>
            ) : (
              <Badge tone="peach">Draft · not shareable yet</Badge>
            )}
            <Button variant="secondary" onClick={() => onNavigate(View.TEACHER_QUIZ_CONFIG)}>
              Edit questions
            </Button>
            <Button variant="secondary" icon="leaderboard" onClick={() => onNavigate(View.TEACHER_QUIZ_RESULTS)}>
              Results
            </Button>
          </>
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
                <p className={`text-[10.5px] ${on ? 'text-white/70' : 'text-slate-500'}`}>
                  {q.questions?.length ?? 0} questions · {q.isPublished ? 'live' : 'draft'}
                </p>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile tint="blue" icon="quiz" label="Questions" value={questionCount} />
        <StatTile tint="lilac" icon="class" label="Class" value={selectedQuiz?.classId || 'Unassigned'} />
        <StatTile
          tint={selectedQuiz?.isPublished ? 'mint' : 'peach'}
          icon={selectedQuiz?.isPublished ? 'check_circle' : 'pending'}
          label="Status"
          value={selectedQuiz?.isPublished ? 'Published' : 'Draft'}
        />
      </div>

      {!selectedQuiz?.isPublished ? (
        <InlineNote tone="peach" icon="warning">
          This quiz is still a draft, so the link below will not open for students. Publish it from the setup screen first.
        </InlineNote>
      ) : null}

      <Card className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Share this link with your class</p>
          <p className="mt-1 text-[11.5px] text-slate-500">
            Students open it, enter their student ID, and start. No account needed.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="flex-1 min-w-0 h-[46px] rounded-[13px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 flex items-center gap-2.5 px-3.5">
            <Icon name="link" className="text-[16px] text-primary shrink-0" />
            <input
              readOnly
              value={shareUrl}
              aria-label="Quiz share link"
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 bg-transparent text-[13px] font-medium text-slate-900 dark:text-white outline-none"
            />
          </div>
          <Button icon={copied ? 'check' : 'copy'} onClick={handleCopyLink} className="h-[46px] shrink-0">
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>

        <InlineNote icon="lock">
          One attempt per student — the database enforces this with a unique constraint on quiz and student, so a second
          submission is rejected rather than overwriting the first. A student who needs another go must be reset by an
          administrator; there is no self-service reset.
        </InlineNote>
      </Card>

      <InlineNote tone="butter" icon="info">
        A printable QR poster is specified in the design but not built: no QR library ships with the app, and a decorative
        code that scans to nothing would be worse than none. Adding one is a small, separate change.
      </InlineNote>
    </WorkSurface>
  );
};

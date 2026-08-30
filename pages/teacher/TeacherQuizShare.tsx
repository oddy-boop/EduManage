import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
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
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

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

  // A real, scannable code — error-correction level M so it still reads when the
  // printout is taped to a wall and a corner gets scuffed.
  useEffect(() => {
    let cancelled = false;
    if (!shareUrl) {
      setQrSvg(null);
      return;
    }
    setQrError(false);
    // margin 2 keeps the quiet zone inside the image itself, so the code still
    // scans when it is cropped, pasted into a document, or printed edge to edge.
    QRCode.toString(shareUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, width: 320 })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => {
        if (!cancelled) {
          setQrSvg(null);
          setQrError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  const handlePrintPoster = () => {
    if (!qrSvg || !selectedQuiz) return;
    const esc = (v: string) =>
      String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const win = window.open('', '_blank', 'width=820,height=1000');
    if (!win) {
      // Pop-up blocked. The code is on screen and printable with the browser's
      // own print command, so this is a downgrade, not a dead end.
      alert('Your browser blocked the print window. Allow pop-ups for this site, or print this page directly.');
      return;
    }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8">
      <title>${esc(selectedQuiz.title || 'Quiz')} — join poster</title>
      <style>
        @page { size: A4; margin: 18mm; }
        body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; text-align: center; color: #0f172a; }
        h1 { font-size: 34px; margin: 0 0 6px; letter-spacing: -0.02em; }
        .sub { font-size: 15px; color: #64748b; margin: 0 0 34px; }
        .qr { width: 340px; height: 340px; margin: 0 auto; }
        .qr svg { width: 100%; height: 100%; }
        .url { margin-top: 30px; font-size: 13px; word-break: break-all; color: #334155; }
        .steps { margin-top: 34px; font-size: 14px; color: #475569; line-height: 1.8; }
      </style></head><body>
      <h1>${esc(selectedQuiz.title || 'Quiz')}</h1>
      <p class="sub">${esc(selectedQuiz.classId || 'All classes')} · ${selectedQuiz.questions?.length ?? 0} questions</p>
      <div class="qr">${qrSvg}</div>
      <p class="url">${esc(shareUrl)}</p>
      <div class="steps">Scan the code &nbsp;·&nbsp; Enter your student ID &nbsp;·&nbsp; Start the quiz</div>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

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
          One attempt per student — a unique constraint on quiz and student means a second submission is rejected rather
          than overwriting the first. If someone needs another go, open their row on the Results screen and choose
          &ldquo;Allow a retake&rdquo;; every reset is recorded in the audit log.
        </InlineNote>
      </Card>

      <Card className="flex flex-col sm:flex-row gap-6 items-center">
        <div className="shrink-0 p-3 rounded-2xl bg-white border border-slate-200 dark:border-slate-700">
          {qrSvg ? (
            <div
              className="size-[168px] [&>svg]:size-full"
              role="img"
              aria-label={`QR code linking to ${shareUrl}`}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <div className="size-[168px] rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-center px-3">
              <span className="text-[11px] text-slate-500">
                {qrError ? 'Could not build a code for this link.' : 'Generating…'}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 text-center sm:text-left">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Printable poster</p>
          <p className="mt-1 text-[11.5px] text-slate-500 leading-relaxed">
            The same link as a scannable code. Print it and put it on the wall so students can join without typing a URL —
            it points at the live quiz, so a draft still will not open for them.
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2 justify-center sm:justify-start">
            <Button icon="print" variant="secondary" onClick={handlePrintPoster} disabled={!qrSvg}>
              Print poster
            </Button>
          </div>
        </div>
      </Card>
    </WorkSurface>
  );
};

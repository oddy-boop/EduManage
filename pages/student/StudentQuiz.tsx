import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { Button, Card, EmptyState, Field, InlineNote, Input } from '../../components/ui';

const QUIZ_SECONDS = 14 * 60 + 59;

export const StudentQuiz: React.FC = () => {
  const [studentId, setStudentId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState('');
  const [tempId, setTempId] = useState('');
  const [currentQuiz, setCurrentQuiz] = useState<any>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState(QUIZ_SECONDS);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [result, setResult] = useState<{ score: number; correctCount?: number; totalQuestions?: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Previously the unsubscribe was returned from inside an async function, so
    // React never received it and the subscription leaked. Subscribe directly.
    const unsub = firestoreService.onQuizzesChange((quizzes) => {
      const published = quizzes.filter((q: any) => q.isPublished);
      if (published.length > 0) setCurrentQuiz(published[0]);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const QUESTIONS: any[] = currentQuiz?.questions || [];
  const currentQuestion = QUESTIONS[currentQuestionIndex];
  const totalQuestions = QUESTIONS.length;
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;
  const answeredCount = useMemo(() => QUESTIONS.filter((q) => answers[q.id] != null).length, [QUESTIONS, answers]);

  const submitRef = useRef<() => void>(() => {});

  const handleSubmit = async (auto = false) => {
    if (!currentQuiz || isSubmitted || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await firestoreService.submitQuizResult({
        quizId: currentQuiz.id,
        studentId: studentId as string,
        studentName: studentName || studentId || undefined,
        answers,
      });
      // The score is authoritative from the server — the client never holds the
      // correct answers for a quiz it is actively taking.
      setResult(res);
      setIsSubmitted(true);
    } catch (err) {
      console.error('Failed to submit quiz result:', err);
      // "You already sat this" is not a failure the student can retry their way out
      // of, so it must not be dressed up as a connection problem.
      if ((err as { code?: string })?.code === 'already_submitted') {
        setError(
          'You have already submitted this quiz, so this attempt was not saved. Ask your teacher if you need another go.',
        );
      } else {
        setError(
          auto
            ? 'Time ran out but we could not save your answers. Tell your teacher before you leave.'
            : 'We could not save your answers. Check your connection and try again.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };
  submitRef.current = () => handleSubmit(true);

  useEffect(() => {
    if (!studentId || isSubmitted || !currentQuiz) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // The old code stopped at zero and did nothing, stranding the student
          // with no submission. Hand in what they have.
          submitRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [studentId, isSubmitted, currentQuiz]);

  const formatTime = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  const handleOptionSelect = (value: string) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
  };

  const toggleFlag = () => {
    if (!currentQuestion) return;
    setFlagged((prev) => {
      const next = new Set(prev);
      next.has(currentQuestion.id) ? next.delete(currentQuestion.id) : next.add(currentQuestion.id);
      return next;
    });
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background-light dark:bg-background-dark font-display flex flex-col items-center">
      <div className="w-full max-w-[520px] flex flex-col min-h-screen">{children}</div>
    </div>
  );

  /* --- Gate --- */
  if (!studentId) {
    return shell(
      <div className="flex-1 flex flex-col justify-center p-6 gap-6">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-primary text-white flex items-center justify-center">
            <Icon name="school" className="text-[23px]" />
          </div>
          <span className="text-lg font-bold tracking-[-0.03em] text-slate-900 dark:text-white">EduManage</span>
        </div>

        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.03em] text-slate-900 dark:text-white">
            {currentQuiz?.title || 'Class quiz'}
          </h1>
          <p className="mt-1.5 text-[13px] text-slate-500">
            {totalQuestions > 0 ? `${totalQuestions} questions · ${Math.round(QUIZ_SECONDS / 60)} minutes` : 'Enter your ID to begin.'}
          </p>
        </div>

        <Card className="flex flex-col gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (tempId.trim()) setStudentId(tempId.trim());
            }}
            className="flex flex-col gap-4"
          >
            <Field label="Your student ID">
              <Input
                value={tempId}
                onChange={(e) => setTempId(e.target.value)}
                placeholder="e.g. STU-2041"
                autoCapitalize="characters"
                spellCheck={false}
                className="h-12 text-[15px]"
              />
            </Field>
            <Field label="Your name" hint="So your teacher knows whose paper this is.">
              <Input
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Full name"
                className="h-12 text-[15px]"
              />
            </Field>
            <Button type="submit" block disabled={!tempId.trim() || !currentQuiz} className="h-12 text-sm">
              Start quiz
            </Button>
          </form>

          <InlineNote icon="lock">
            You get one attempt. Once you submit, your answers are final and go straight to your teacher.
          </InlineNote>
        </Card>

        {!loading && !currentQuiz && (
          <EmptyState icon="quiz" title="No quiz is open right now" body="Your teacher has not published a quiz yet. Check the link they gave you." />
        )}
      </div>,
    );
  }

  /* --- Result --- */
  if (isSubmitted) {
    const correct = result?.correctCount ?? result?.score ?? 0;
    const outOf = result?.totalQuestions ?? totalQuestions;
    const pct = outOf > 0 ? Math.round((correct / outOf) * 100) : 0;
    return shell(
      <>
        <div className="bg-primary rounded-b-[26px] px-5 pt-8 pb-8 flex flex-col items-center gap-3.5">
          <div className="size-[62px] rounded-full bg-white/20 flex items-center justify-center text-white">
            <Icon name="check" className="text-[32px]" strokeWidth={2.4} />
          </div>
          <div className="text-center">
            <p className="text-[19px] font-bold text-white tracking-[-0.025em]">Submitted</p>
            <p className="mt-1 text-[12.5px] text-white/[0.78]">{currentQuiz?.title}</p>
          </div>
        </div>

        <div className="flex-1 p-5 flex flex-col gap-4">
          <Card className="flex flex-col items-center gap-3 py-7">
            <p className="text-[44px] font-bold tracking-[-0.04em] text-slate-900 dark:text-white leading-none">
              {correct}
              <span className="text-lg text-slate-400 font-semibold"> / {outOf}</span>
            </p>
            <span
              className={`text-xs font-semibold px-3.5 py-1.5 rounded-full ${
                pct >= 70 ? 'bg-tint-mint text-ink-mint' : pct >= 50 ? 'bg-tint-blue text-ink-blue' : 'bg-tint-blush text-ink-blush'
              }`}
            >
              {pct}%
            </span>
            <p className="text-[11.5px] text-slate-500 text-center leading-relaxed max-w-[260px]">
              Your score was marked on the school server, not in this browser.
            </p>
          </Card>

          {error && <InlineNote tone="blush" icon="priority_high">{error}</InlineNote>}

          <InlineNote icon="lock">
            That was your one attempt. Your teacher can see your answers and will go over the quiz in class.
          </InlineNote>
        </div>
      </>,
    );
  }

  /* --- Loading / no questions --- */
  if (loading || !currentQuiz || totalQuestions === 0) {
    return shell(
      <div className="flex-1 flex items-center justify-center p-6">
        {loading ? (
          <Icon name="spinner" className="text-[32px] text-primary animate-spin" />
        ) : (
          <EmptyState icon="quiz" title="This quiz has no questions" body="Ask your teacher to check it and share the link again." />
        )}
      </div>,
    );
  }

  /* --- Taking the quiz --- */
  const selected = answers[currentQuestion.id];
  const isFlagged = flagged.has(currentQuestion.id);
  const options: string[] = currentQuestion.type === 'True/False' ? ['True', 'False'] : currentQuestion.options || [];
  const lowTime = timeLeft <= 60;

  return shell(
    <>
      <div className="bg-surface-light dark:bg-surface-dark border-b border-slate-100 dark:border-slate-800 px-4 pt-3.5 pb-3 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold tracking-[-0.02em] text-slate-900 dark:text-white truncate">{currentQuiz.title}</p>
            <p className="mt-0.5 text-[11px] text-slate-500 truncate">{studentName || studentId}</p>
          </div>
          <div
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full shrink-0 ${
              lowTime ? 'bg-tint-blush' : 'bg-tint-butter'
            }`}
            role="timer"
            aria-live={lowTime ? 'assertive' : 'off'}
          >
            <Icon name="schedule" className={`text-[15px] ${lowTime ? 'text-ink-blush' : 'text-ink-butter'}`} />
            <span className={`text-[13px] font-bold tracking-[-0.01em] ${lowTime ? 'text-ink-blush' : 'text-ink-butter'}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-slate-500">
              Question <span className="font-bold text-slate-900 dark:text-white">{currentQuestionIndex + 1}</span> of{' '}
              {totalQuestions}
            </span>
            <span className="text-[11px] text-slate-500">{answeredCount} answered</span>
          </div>
          <div className="flex gap-[3px] h-[5px]">
            {QUESTIONS.map((q, i) => (
              <span
                key={q.id ?? i}
                className={`flex-1 rounded-full ${
                  i === currentQuestionIndex ? 'bg-primary' : answers[q.id] != null ? 'bg-primary/50' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 pt-5 flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-start gap-3">
          <p className="flex-1 text-[17px] font-semibold leading-snug tracking-[-0.015em] text-slate-900 dark:text-white text-pretty">
            {currentQuestion.text}
          </p>
          <button
            type="button"
            onClick={toggleFlag}
            aria-pressed={isFlagged}
            aria-label={isFlagged ? 'Remove flag from this question' : 'Flag this question to come back to'}
            className={`size-11 -mt-2 -mr-2 shrink-0 flex items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
              isFlagged ? 'text-ink-butter bg-tint-butter' : 'text-slate-400'
            }`}
          >
            <Icon name="flag" className="text-[20px]" />
          </button>
        </div>

        {options.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {options.map((opt, idx) => {
              const on = selected === opt;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleOptionSelect(opt)}
                  aria-pressed={on}
                  className={`flex items-center gap-3.5 min-h-14 rounded-2xl px-4 py-3 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    on
                      ? 'border-2 border-primary bg-tint-blue shadow-primary'
                      : 'border-[1.5px] border-slate-200 dark:border-slate-700 bg-surface-light dark:bg-surface-dark'
                  }`}
                >
                  <span
                    className={`size-[26px] rounded-full text-[11.5px] font-bold flex items-center justify-center shrink-0 ${
                      on ? 'bg-primary text-white' : 'border-2 border-slate-300 dark:border-slate-600 text-slate-400'
                    }`}
                  >
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className={`flex-1 text-[14.5px] ${on ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                    {opt}
                  </span>
                  {on && <Icon name="check_circle" className="text-[19px] text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        ) : (
          <Field label="Your answer">
            <Input
              value={selected ?? ''}
              onChange={(e) => handleOptionSelect(e.target.value)}
              placeholder="Type your answer"
              className="h-12 text-[15px]"
            />
          </Field>
        )}

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400 mb-2">Jump to</p>
          <div className="flex flex-wrap gap-2">
            {QUESTIONS.map((q, i) => {
              const answered = answers[q.id] != null;
              const flag = flagged.has(q.id);
              const here = i === currentQuestionIndex;
              return (
                <button
                  key={q.id ?? i}
                  onClick={() => setCurrentQuestionIndex(i)}
                  aria-label={`Go to question ${i + 1}${answered ? ', answered' : ''}${flag ? ', flagged' : ''}`}
                  aria-current={here ? 'true' : undefined}
                  className={`size-11 rounded-[13px] text-[13px] font-semibold flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    here
                      ? 'bg-primary text-white'
                      : flag
                        ? 'bg-tint-butter border-[1.5px] border-warning text-ink-butter'
                        : answered
                          ? 'bg-tint-blue text-ink-blue'
                          : 'bg-surface-light dark:bg-surface-dark border-[1.5px] border-slate-200 dark:border-slate-700 text-slate-400'
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

        {error && <InlineNote tone="blush" icon="priority_high">{error}</InlineNote>}
      </div>

      <div className="bg-surface-light dark:bg-surface-dark border-t border-slate-100 dark:border-slate-800 px-4 py-3 pb-4 flex gap-2.5">
        <button
          type="button"
          onClick={() => setCurrentQuestionIndex((i) => Math.max(0, i - 1))}
          disabled={currentQuestionIndex === 0}
          aria-label="Previous question"
          className="w-[52px] h-[50px] shrink-0 rounded-[14px] border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Icon name="chevron_left" className="text-[20px]" />
        </button>

        {isLastQuestion ? (
          <Button
            block
            variant="success"
            loading={submitting}
            className="h-[50px] text-[14.5px]"
            onClick={() => {
              const unanswered = totalQuestions - answeredCount;
              if (unanswered > 0 && !window.confirm(`${unanswered} question(s) are unanswered. Submit anyway? You cannot change them afterwards.`))
                return;
              handleSubmit(false);
            }}
          >
            Submit quiz
          </Button>
        ) : (
          <Button block className="h-[50px] text-[14.5px]" onClick={() => setCurrentQuestionIndex((i) => Math.min(totalQuestions - 1, i + 1))}>
            Next question
            <Icon name="arrow_forward" className="text-[18px]" />
          </Button>
        )}
      </div>
    </>,
  );
};

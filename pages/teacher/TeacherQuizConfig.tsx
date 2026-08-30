import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { View } from '../../types';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';
import { WorkSurface } from '../../components/Layouts';
import {
  Badge, Button, Card, Drawer, EmptyState, Field, InlineNote, Input, PageHeader, SkeletonTable, Select, Textarea,
  type Tint,
} from '../../components/ui';

interface TeacherQuizConfigProps {
  onNavigate: (view: View) => void;
}

interface Question {
  id: string;
  text: string;
  type: string;
  correctAnswer: string;
  options?: string[];
  points?: number;
}

const TYPES = ['Multiple Choice', 'True/False', 'Short Answer'];

const TYPE_TONE: Record<string, Tint> = {
  'Multiple Choice': 'blue',
  'True/False': 'lilac',
  'Short Answer': 'mint',
};

/** A question with no correct answer cannot be marked, so it must not ship. */
const isMarkable = (q: Question) => !!q.text.trim() && !!String(q.correctAnswer ?? '').trim();

export const TeacherQuizConfig: React.FC<TeacherQuizConfigProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [quizTitle, setQuizTitle] = useState('New Assessment');
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    // Resume the teacher's most recent unpublished (draft) quiz, if any.
    const unsub = firestoreService.onTeacherQuizzesChange(user.uid, (quizzes) => {
      const draft = quizzes.find((q: any) => !q.isPublished);
      if (draft) {
        setActiveQuizId(draft.id);
        setQuizTitle(draft.title);
        setQuestions(draft.questions || []);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  const buildQuestionPayload = () =>
    questions.map((q) => ({
      id: q.id && !q.id.startsWith('temp-') ? q.id : Math.random().toString(36).substring(2, 11),
      text: q.text,
      type: q.type,
      correctAnswer: q.correctAnswer,
      options: q.options || [],
      points: q.points || 1,
    }));

  const unmarkable = useMemo(() => questions.filter((q) => !isMarkable(q)), [questions]);
  const totalPoints = questions.reduce((a, q) => a + (q.points || 1), 0);

  const save = async (publish: boolean) => {
    if (questions.length === 0) {
      setStatus({ tone: 'bad', text: 'Add at least one question first.' });
      return;
    }
    if (publish && unmarkable.length > 0) {
      setStatus({ tone: 'bad', text: `${unmarkable.length} question(s) have no correct answer set — they cannot be marked.` });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      if (activeQuizId) {
        await firestoreService.updateQuiz(activeQuizId, {
          title: quizTitle,
          questions: buildQuestionPayload(),
          ...(publish ? { isPublished: true } : {}),
        });
      } else {
        const created = await firestoreService.createQuiz({
          title: quizTitle,
          teacherId: user?.uid,
          classId: user?.assignedClasses?.[0],
          questions: buildQuestionPayload(),
          isPublished: publish,
        });
        setActiveQuizId(created.id);
      }
      if (publish) onNavigate(View.TEACHER_QUIZ_SHARE);
      else setStatus({ tone: 'ok', text: 'Draft saved.' });
    } catch (error) {
      console.error(publish ? 'Failed to publish quiz:' : 'Failed to save quiz draft:', error);
      setStatus({ tone: 'bad', text: publish ? 'Could not publish. Nothing was shared.' : 'Could not save the draft.' });
    } finally {
      setSaving(false);
    }
  };

  const addManualQuestion = () =>
    setEditingQuestion({
      id: `temp-${Date.now()}`,
      text: '',
      type: 'Multiple Choice',
      correctAnswer: '',
      options: ['', '', '', ''],
      points: 1,
    });

  const handleUpdateQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    setQuestions((prev) => {
      const exists = prev.some((q) => q.id === editingQuestion.id);
      return exists ? prev.map((q) => (q.id === editingQuestion.id ? editingQuestion : q)) : [...prev, editingQuestion];
    });
    setEditingQuestion(null);
    setStatus(null);
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    if (editingQuestion?.id === id) setEditingQuestion(null);
  };

  const setOption = (idx: number, value: string) =>
    setEditingQuestion((q) => {
      if (!q) return q;
      const options = [...(q.options || [])];
      const previous = options[idx];
      options[idx] = value;
      // Keep the correct answer pointing at the option the teacher marked.
      return { ...q, options, correctAnswer: q.correctAnswer === previous ? value : q.correctAnswer };
    });

  if (loading) {
    return (
      <WorkSurface>
        <div className="h-14 w-64 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <SkeletonTable rows={5} />
      </WorkSurface>
    );
  }

  const q = editingQuestion;
  const isChoice = q?.type === 'Multiple Choice';
  const isTrueFalse = q?.type === 'True/False';

  return (
    <WorkSurface>
      <PageHeader
        breadcrumb={
          <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
            <span className="text-primary font-semibold">Setup</span>
            <Icon name="chevron_right" className="text-[13px]" />
            <span>Share</span>
          </div>
        }
        title="Quiz Configuration"
        actions={
          <>
            <Badge tone={activeQuizId ? 'peach' : 'plain'}>Draft · not visible to students</Badge>
            <Button variant="secondary" loading={saving} onClick={() => save(false)}>
              Save draft
            </Button>
            <Button icon="send" loading={saving} disabled={questions.length === 0 || unmarkable.length > 0} onClick={() => save(true)}>
              Publish &amp; share
            </Button>
          </>
        }
      />

      {status && (
        <InlineNote tone={status.tone === 'ok' ? 'mint' : 'blush'} icon={status.tone === 'ok' ? 'check_circle' : 'priority_high'}>
          {status.text}
        </InlineNote>
      )}

      <Card className="flex flex-col md:flex-row gap-4">
        <Field label="Quiz title" className="flex-[2]">
          <Input value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} placeholder="e.g. Algebra — linear equations check" />
        </Field>
        <Field label="Class" className="flex-1">
          <Input value={user?.assignedClasses?.[0] || 'Unassigned'} readOnly className="bg-slate-50 dark:bg-slate-900/40" />
        </Field>
        <Field label="Total points" className="w-32">
          <Input value={totalPoints} readOnly className="bg-slate-50 dark:bg-slate-900/40 text-right font-semibold" />
        </Field>
      </Card>

      <Card pad={false} className="flex flex-col">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Questions <span className="text-slate-400 font-medium">({questions.length})</span>
          </p>
          <Button variant="secondary" icon="add" onClick={addManualQuestion}>
            Add question
          </Button>
        </div>

        {questions.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon="quiz"
              title="No questions yet"
              body="Add a question and set which answer is correct. Marking happens on the server when a student submits."
              action={<Button icon="add" onClick={addManualQuestion}>Add the first question</Button>}
            />
          </div>
        ) : (
          <div className="px-3.5 pb-3 flex flex-col gap-1.5">
            {questions.map((question, i) => {
              const bad = !isMarkable(question);
              return (
                <div
                  key={question.id}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-[14px] ${bad ? 'bg-tint-butter' : 'bg-slate-50 dark:bg-slate-900/40'}`}
                >
                  <span
                    className={`size-[22px] rounded-[7px] text-[10.5px] font-bold flex items-center justify-center shrink-0 ${
                      bad ? 'bg-white text-ink-butter' : 'bg-white dark:bg-slate-800 text-slate-500'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <p
                    className={`flex-1 min-w-0 truncate text-[12.5px] ${
                      question.text ? 'font-medium text-slate-900 dark:text-white' : 'italic text-ink-butter'
                    }`}
                  >
                    {question.text || 'Untitled question'}
                  </p>
                  {bad && <Badge tone="butter">No answer set</Badge>}
                  <Badge tone={TYPE_TONE[question.type] ?? 'plain'}>{question.type}</Badge>
                  <span className="text-[11px] text-slate-400 shrink-0 w-10 text-right">{question.points || 1} pt</span>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingQuestion(question)}
                      aria-label={`Edit question ${i + 1}`}
                      className="size-7 rounded-lg bg-white dark:bg-slate-800 text-slate-500 hover:text-primary flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <Icon name="edit" className="text-[14px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQuestion(question.id)}
                      aria-label={`Delete question ${i + 1}`}
                      className="size-7 rounded-lg bg-white dark:bg-slate-800 text-slate-500 hover:text-danger flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <Icon name="delete" className="text-[14px]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {unmarkable.length > 0 && (
          <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
            <span className="flex items-center gap-2 text-[11.5px] text-ink-butter">
              <Icon name="warning" className="text-[15px]" />
              {unmarkable.length} question{unmarkable.length === 1 ? ' has' : 's have'} no correct answer set. Publishing is
              blocked until every question can be marked.
            </span>
          </div>
        )}
      </Card>

      <InlineNote icon="lock">
        Correct answers are never sent to the student&rsquo;s browser. Marking happens on the server when the quiz is submitted.
      </InlineNote>

      <Drawer
        open={!!q}
        onClose={() => setEditingQuestion(null)}
        title={questions.some((x) => x.id === q?.id) ? 'Edit question' : 'New question'}
        footer={
          <>
            <Button variant="secondary" block onClick={() => setEditingQuestion(null)}>
              Cancel
            </Button>
            <Button block onClick={handleUpdateQuestion} disabled={!q?.text.trim()}>
              Save question
            </Button>
          </>
        }
      >
        {q && (
          <form onSubmit={handleUpdateQuestion} className="flex flex-col gap-4">
            <Field label="Question text">
              <Textarea rows={3} value={q.text} onChange={(e) => setEditingQuestion({ ...q, text: e.target.value })} />
            </Field>

            <div className="flex gap-3">
              <Field label="Type" className="flex-1">
                <Select
                  value={q.type}
                  onChange={(e) => {
                    const type = e.target.value;
                    setEditingQuestion({
                      ...q,
                      type,
                      correctAnswer: '',
                      options: type === 'Multiple Choice' ? q.options?.length ? q.options : ['', '', '', ''] : [],
                    });
                  }}
                >
                  {TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Points" className="w-28">
                <Input
                  type="number"
                  min={1}
                  value={q.points || 1}
                  onChange={(e) => setEditingQuestion({ ...q, points: Math.max(1, Number(e.target.value) || 1) })}
                  className="text-right font-semibold"
                />
              </Field>
            </div>

            {isChoice && (
              <Field label="Options — tick the correct one">
                <div className="flex flex-col gap-2">
                  {(q.options || []).map((opt, idx) => {
                    const correct = !!opt && q.correctAnswer === opt;
                    return (
                      <div
                        key={idx}
                        className={`flex items-center gap-2.5 h-[42px] rounded-xl border px-3.5 ${
                          correct ? 'border-[1.5px] border-success bg-tint-mint' : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => opt && setEditingQuestion({ ...q, correctAnswer: opt })}
                          disabled={!opt}
                          aria-label={`Mark option ${idx + 1} correct`}
                          className={`size-[18px] rounded-full shrink-0 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                            correct ? 'bg-success text-white' : 'border-2 border-slate-300 dark:border-slate-600'
                          } ${!opt ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          {correct && <Icon name="check" className="text-[11px]" strokeWidth={3} />}
                        </button>
                        <input
                          value={opt}
                          onChange={(e) => setOption(idx, e.target.value)}
                          placeholder={`Option ${idx + 1}`}
                          aria-label={`Option ${idx + 1}`}
                          className="flex-1 bg-transparent text-[12.5px] text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                        />
                        {correct && <span className="text-[10.5px] font-semibold text-ink-mint">Correct</span>}
                      </div>
                    );
                  })}
                </div>
              </Field>
            )}

            {isTrueFalse && (
              <Field label="Correct answer">
                <div className="flex gap-2">
                  {['True', 'False'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setEditingQuestion({ ...q, correctAnswer: v })}
                      className={`flex-1 h-11 rounded-xl text-[12.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        q.correctAnswer === v
                          ? 'bg-success text-white'
                          : 'bg-slate-50 dark:bg-slate-900/40 text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            {!isChoice && !isTrueFalse && (
              <Field label="Accepted answer" hint="Compared case-insensitively on the server.">
                <Input value={q.correctAnswer} onChange={(e) => setEditingQuestion({ ...q, correctAnswer: e.target.value })} />
              </Field>
            )}

            {!isMarkable(q) && (
              <InlineNote tone="butter" icon="warning">
                Set a correct answer, or this question cannot be marked and the quiz cannot be published.
              </InlineNote>
            )}
          </form>
        )}
      </Drawer>
    </WorkSurface>
  );
};

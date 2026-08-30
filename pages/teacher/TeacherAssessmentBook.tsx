import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';
import { ASSESSMENT_CATEGORIES } from '../../types';
import { WorkSurface } from '../../components/Layouts';
import {
  Avatar, Badge, Button, Card, Chip, EmptyState, Field, InlineNote, Input, PageHeader, Select, SkeletonTable, StatTile,
} from '../../components/ui';
import { CA_MAX } from '../../lib/grading';

const TERMS = ['Term 1', 'Term 2', 'Term 3'];

export const TeacherAssessmentBook: React.FC = () => {
  const { user } = useAuth();
  const assignedClasses = user?.assignedClasses && user.assignedClasses.length > 0 ? user.assignedClasses : ['Unassigned'];

  const [activeClass, setActiveClass] = useState(assignedClasses[0]);
  const [term, setTerm] = useState('Term 2');
  const [students, setStudents] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const [form, setForm] = useState({
    studentId: '',
    category: ASSESSMENT_CATEGORIES[0] as string,
    title: '',
    score: '',
    maxScore: '100',
    date: new Date().toISOString().split('T')[0],
  });

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

  const entriesByStudent = useMemo(() => {
    const map: Record<string, any[]> = {};
    entries.forEach((e) => {
      if (!map[e.studentId]) map[e.studentId] = [];
      map[e.studentId].push(e);
    });
    return map;
  }, [entries]);

  const averageFor = (studentId: string) => {
    const list = entriesByStudent[studentId] || [];
    if (list.length === 0) return null;
    const avg = list.reduce((sum, e) => sum + (e.score / e.maxScore) * 100, 0) / list.length;
    return Math.round(avg * 10) / 10;
  };

  const scoreNum = Number(form.score);
  const maxNum = Number(form.maxScore) || 100;
  const scoreError =
    form.score === ''
      ? null
      : Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > maxNum
        ? `Must be between 0 and ${maxNum}`
        : null;

  const handleAddEntry = async () => {
    setStatus(null);
    if (!form.studentId || form.score === '') {
      setStatus({ tone: 'bad', text: 'Pick a student and enter a score.' });
      return;
    }
    if (scoreError) return;

    setSaving(true);
    try {
      await firestoreService.createAssessment({
        studentId: form.studentId,
        classId: activeClass,
        term,
        category: form.category,
        title: form.title || undefined,
        score: scoreNum,
        maxScore: maxNum,
        date: form.date,
      });
      setForm((prev) => ({ ...prev, title: '', score: '' }));
      setStatus({ tone: 'ok', text: 'Entry recorded. The student’s CA average has been updated.' });
    } catch (error) {
      console.error('Failed to log assessment:', error);
      setStatus({ tone: 'bad', text: 'Could not save that entry. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this assessment entry? This will change the student's computed CA average.")) return;
    setStatus(null);
    try {
      await firestoreService.deleteAssessment(id);
    } catch (error) {
      console.error(error);
      setStatus({ tone: 'bad', text: 'Could not delete that entry.' });
    }
  };

  const covered = students.filter((s) => (entriesByStudent[s.id]?.length ?? 0) > 0).length;
  const maxEntries = Math.max(0, ...students.map((s) => entriesByStudent[s.id]?.length ?? 0));

  if (loading) {
    return (
      <WorkSurface>
        <div className="h-14 w-64 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <SkeletonTable rows={5} />
      </WorkSurface>
    );
  }

  return (
    <WorkSurface>
      <PageHeader
        title="Assessment Book"
        subtitle="Continuous assessment entries. These feed the CA column on Report Generation automatically."
        actions={
          status && (
            <span className={`text-[11.5px] flex items-center gap-1.5 ${status.tone === 'ok' ? 'text-ink-mint' : 'text-ink-blush'}`}>
              <Icon name={status.tone === 'ok' ? 'check_circle' : 'priority_high'} className="text-[14px]" />
              {status.text}
            </span>
          )
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
        <span className="hidden md:block w-px h-6 bg-slate-200 dark:bg-slate-700" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">Term</span>
          <Select value={term} onChange={(e) => setTerm(e.target.value)} className="h-8 text-xs">
            {TERMS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile tint="blue" icon="groups" label="Students" value={students.length} />
        <StatTile tint="mint" icon="fact_check" label="With entries" value={`${covered} / ${students.length}`} />
        <StatTile tint="lilac" icon="table_chart" label="Entries logged" value={entries.length} />
        <StatTile tint="peach" icon="analytics" label="Most entries for one student" value={maxEntries} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="flex flex-col gap-4 h-fit">
          <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">Log an entry</p>

          <Field label="Student">
            <Select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
              <option value="">Choose a student…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {ASSESSMENT_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>

          <Field label="Title" hint="Optional — helps you tell entries apart later.">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Chapter 3 test" />
          </Field>

          <div className="flex gap-3">
            <Field label="Score" error={scoreError ?? undefined} className="flex-1">
              <Input
                type="number"
                inputMode="numeric"
                value={form.score}
                invalid={!!scoreError}
                onChange={(e) => setForm({ ...form, score: e.target.value })}
                className="text-right"
              />
            </Field>
            <Field label="Out of" className="w-28">
              <Input
                type="number"
                inputMode="numeric"
                value={form.maxScore}
                onChange={(e) => setForm({ ...form, maxScore: e.target.value })}
                className="text-right"
              />
            </Field>
          </div>

          <Field label="Date">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>

          <Button icon="add" block loading={saving} disabled={!!scoreError} onClick={handleAddEntry}>
            Record entry
          </Button>

          <InlineNote icon="info">
            Entries are averaged as a percentage, then scaled to the {CA_MAX}-mark CA column on Report Generation. Teachers
            never type the CA figure directly.
          </InlineNote>
        </Card>

        <div className="flex flex-col gap-2.5">
          {students.length === 0 ? (
            <EmptyState icon="groups" title={`No students in ${activeClass}`} body="Students registered into this class appear here." />
          ) : (
            students.map((s) => {
              const list = entriesByStudent[s.id] || [];
              const avg = averageFor(s.id);
              const open = expandedStudent === s.id;
              const thin = list.length > 0 && maxEntries > 0 && list.length < maxEntries;
              return (
                <Card key={s.id} pad={false} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedStudent(open ? null : s.id)}
                    aria-expanded={open}
                    className="w-full flex items-center gap-3.5 p-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  >
                    <Avatar name={s.name} size={36} tint={list.length === 0 ? 'butter' : 'blue'} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">{s.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {list.length === 0
                          ? 'No entries yet'
                          : `${list.length} ${list.length === 1 ? 'entry' : 'entries'}${thin ? ' · fewer than the rest of the class' : ''}`}
                      </p>
                    </div>
                    {avg != null ? (
                      <Badge tone={avg >= 70 ? 'mint' : avg >= 50 ? 'blue' : 'blush'}>{avg}%</Badge>
                    ) : (
                      <Badge tone="butter">No CA</Badge>
                    )}
                    <Icon name={open ? 'chevron_down' : 'chevron_right'} className="text-[18px] text-slate-300 shrink-0" />
                  </button>

                  {open && (
                    <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800 pt-3 flex flex-col gap-2">
                      {list.length === 0 ? (
                        <p className="text-[11.5px] text-slate-400 py-2">
                          Nothing recorded for {s.name} this term. Their CA column will read zero.
                        </p>
                      ) : (
                        list.map((e) => (
                          <div key={e.id} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/40 rounded-[13px] px-3.5 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="text-[12.5px] font-medium text-slate-900 dark:text-white truncate">
                                {e.title || e.category}
                              </p>
                              <p className="text-[10.5px] text-slate-400">
                                {e.category}
                                {e.date ? ` · ${new Date(e.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
                              </p>
                            </div>
                            <span className="text-[12.5px] font-semibold text-slate-900 dark:text-white shrink-0">
                              {e.score} / {e.maxScore}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDelete(e.id)}
                              aria-label={`Delete ${e.title || e.category} for ${s.name}`}
                              className="size-8 shrink-0 rounded-[10px] bg-surface-light dark:bg-surface-dark text-slate-400 hover:text-danger flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            >
                              <Icon name="delete" className="text-[15px]" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </div>
    </WorkSurface>
  );
};

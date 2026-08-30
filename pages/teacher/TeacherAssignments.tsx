import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';
import { WorkSurface } from '../../components/Layouts';
import {
  Badge, Button, Card, Chip, EmptyState, Field, InlineNote, Input, NoResults, PageHeader, SkeletonTable, Textarea,
} from '../../components/ui';

export const TeacherAssignments: React.FC = () => {
  const { user } = useAuth();
  const assignedClasses = user?.assignedClasses && user.assignedClasses.length > 0 ? user.assignedClasses : ['Unassigned'];

  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [formData, setFormData] = useState({ title: '', description: '', classId: assignedClasses[0], dueDate: '' });
  const [touched, setTouched] = useState(false);
  const [filterClass, setFilterClass] = useState('All');
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  useEffect(() => {
    // Assignments are stored per-class; aggregate across every class this teacher has.
    const unsubs = assignedClasses.map((classId) =>
      firestoreService.getAssignments(classId, (data) => {
        setAssignments((prev) => {
          const rest = prev.filter((a) => a.classId !== classId);
          return [...rest, ...data];
        });
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [assignedClasses.join(',')]);

  const resetForm = () => {
    setEditingId(null);
    setFormData({ title: '', description: '', classId: assignedClasses[0], dueDate: '' });
    setTouched(false);
  };

  const titleMissing = touched && !formData.title.trim();
  const dueMissing = touched && !formData.dueDate;

  const handlePublish = async () => {
    setTouched(true);
    setStatus(null);
    if (!formData.title.trim() || !formData.dueDate) return;

    setLoading(true);
    try {
      if (editingId) {
        await firestoreService.updateAssignment(editingId, formData);
        setStatus({ tone: 'ok', text: 'Assignment updated.' });
      } else {
        await firestoreService.createAssignment({
          ...formData,
          teacherId: user?.uid || 'anonymous',
          status: 'published',
          createdAt: new Date().toISOString(),
        });
        setStatus({ tone: 'ok', text: 'Assignment published to the class.' });
      }
      resetForm();
    } catch (error) {
      console.error(error);
      setStatus({ tone: 'bad', text: 'Could not save that. Your text is still here — try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (asgn: any) => {
    setEditingId(asgn.id);
    setFormData({
      title: asgn.title || '',
      description: asgn.description || '',
      classId: asgn.classId,
      dueDate: asgn.dueDate ? String(asgn.dueDate).slice(0, 10) : '',
    });
    setTouched(false);
    setStatus(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? Parents and students lose sight of it immediately.`)) return;
    setStatus(null);
    try {
      await firestoreService.deleteAssignment(id);
      setAssignments((prev) => prev.filter((a) => a.id !== id));
      if (editingId === id) resetForm();
      setStatus({ tone: 'ok', text: 'Assignment deleted.' });
    } catch (error) {
      console.error(error);
      setStatus({ tone: 'bad', text: 'Could not delete that assignment.' });
    }
  };

  const sorted = useMemo(
    () =>
      [...assignments]
        .filter((a) => filterClass === 'All' || a.classId === filterClass)
        .sort((a, b) => new Date(b.dueDate || 0).getTime() - new Date(a.dueDate || 0).getTime()),
    [assignments, filterClass],
  );

  return (
    <WorkSurface>
      <PageHeader
        title="Assignments"
        subtitle={`Across ${assignedClasses.length} class${assignedClasses.length === 1 ? '' : 'es'}`}
        actions={
          status && (
            <span className={`text-[11.5px] flex items-center gap-1.5 ${status.tone === 'ok' ? 'text-ink-mint' : 'text-ink-blush'}`}>
              <Icon name={status.tone === 'ok' ? 'check_circle' : 'priority_high'} className="text-[14px]" />
              {status.text}
            </span>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="flex flex-col gap-4 h-fit">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
              {editingId ? 'Edit assignment' : 'New assignment'}
            </p>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-[11.5px] font-semibold text-slate-500 hover:text-primary rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Cancel edit
              </button>
            )}
          </div>

          <Field label="Title" error={titleMissing ? 'Give the assignment a title.' : undefined}>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Algebra worksheet 4"
              invalid={titleMissing}
            />
          </Field>

          <Field label="Class">
            <div className="flex flex-wrap gap-2">
              {assignedClasses.map((c) => (
                <Chip key={c} active={formData.classId === c} onClick={() => setFormData({ ...formData, classId: c })}>
                  {c}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Due date" error={dueMissing ? 'Pick a due date.' : undefined}>
            <Input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              invalid={dueMissing}
            />
          </Field>

          <Field label="Instructions" hint="Shown to parents on their portal.">
            <Textarea
              rows={5}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What should students do, and what should they bring?"
            />
          </Field>

          <Button icon={editingId ? 'save' : 'add'} block loading={loading} onClick={handlePublish}>
            {editingId ? 'Save changes' : 'Publish assignment'}
          </Button>
        </Card>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={filterClass === 'All'} onClick={() => setFilterClass('All')}>
              All ({assignments.length})
            </Chip>
            {assignedClasses.map((c) => (
              <Chip key={c} active={filterClass === c} onClick={() => setFilterClass(c)}>
                {c}
              </Chip>
            ))}
          </div>

          {assignments.length === 0 ? (
            <EmptyState
              icon="assignment"
              title="No assignments yet"
              body="Anything you publish shows up here and on the parent portal for that class."
            />
          ) : sorted.length === 0 ? (
            <NoResults title={`Nothing set for ${filterClass}`} onClear={() => setFilterClass('All')} clearLabel="Show all classes" />
          ) : (
            sorted.map((a) => {
              const due = a.dueDate ? new Date(a.dueDate) : null;
              const overdue = due ? due.getTime() < Date.now() : false;
              return (
                <Card key={a.id} className="flex items-start gap-3.5">
                  <div
                    className={`size-[42px] rounded-[13px] flex items-center justify-center shrink-0 ${
                      overdue ? 'bg-slate-100 dark:bg-slate-800 text-slate-400' : 'bg-tint-blue text-ink-blue'
                    }`}
                  >
                    <Icon name="assignment" className="text-[20px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white">{a.title}</p>
                      <Badge tone="blue">{a.classId}</Badge>
                      {overdue && <Badge tone="plain">Past due</Badge>}
                    </div>
                    {a.description && (
                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500 line-clamp-2">{a.description}</p>
                    )}
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      {due ? `Due ${due.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}` : 'No due date'}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEdit(a)}
                      aria-label={`Edit "${a.title}"`}
                      className="size-8 rounded-[10px] bg-slate-50 dark:bg-slate-900/40 text-slate-500 hover:text-primary transition-colors flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <Icon name="edit" className="text-[16px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(a.id, a.title)}
                      aria-label={`Delete "${a.title}"`}
                      className="size-8 rounded-[10px] bg-slate-50 dark:bg-slate-900/40 text-slate-500 hover:text-danger hover:bg-tint-blush transition-colors flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <Icon name="delete" className="text-[16px]" />
                    </button>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>

      <InlineNote icon="info">
        Assignments are visible to parents as soon as they are published. Work is handed in at school — there is no
        submission upload.
      </InlineNote>
    </WorkSurface>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';
import { WorkSurface } from '../../components/Layouts';
import {
  Badge, Card, ChildSwitcher, Chip, Drawer, EmptyState, InlineNote, NoResults, PageHeader, SkeletonTable,
} from '../../components/ui';

type Filter = 'all' | 'due' | 'past';

export const ParentAssignments: React.FC = () => {
  const { user } = useAuth();
  const [children, setChildren] = useState<any[]>([]);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = firestoreService.getStudentsForParent(user.uid, (data) => {
      setChildren(data);
      setActiveChildId((prev) => prev ?? data[0]?.id ?? null);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  const activeChild = children.find((c) => c.id === activeChildId) ?? null;

  useEffect(() => {
    if (!activeChild?.classId) return;
    const unsub = firestoreService.getAssignments(activeChild.classId, setAssignments);
    return () => unsub();
  }, [activeChild?.classId]);

  const now = Date.now();
  const decorated = useMemo(
    () =>
      assignments
        .map((a) => {
          const due = a.dueDate ? new Date(a.dueDate) : null;
          const ms = due ? due.getTime() - now : null;
          return {
            ...a,
            due,
            overdue: ms !== null && ms < 0,
            soon: ms !== null && ms >= 0 && ms < 1000 * 60 * 60 * 48,
          };
        })
        .sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity)),
    [assignments, now],
  );

  const visible = decorated.filter((a) => (filter === 'all' ? true : filter === 'due' ? !a.overdue : a.overdue));
  const dueCount = decorated.filter((a) => !a.overdue).length;

  if (loading) {
    return (
      <WorkSurface>
        <div className="h-14 w-56 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <SkeletonTable rows={4} />
      </WorkSurface>
    );
  }

  if (children.length === 0) {
    return (
      <WorkSurface>
        <PageHeader title="Assignments" />
        <EmptyState icon="family_restroom" title="No children linked to your account" body="Contact the school office if one is missing." />
      </WorkSurface>
    );
  }

  return (
    <WorkSurface>
      <PageHeader
        title="Assignments"
        subtitle="What has been set, and what is still to come"
        actions={
          <div className="flex items-center gap-2">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
              All ({decorated.length})
            </Chip>
            <Chip active={filter === 'due'} onClick={() => setFilter('due')}>
              Still due ({dueCount})
            </Chip>
            <Chip active={filter === 'past'} onClick={() => setFilter('past')}>
              Past due
            </Chip>
          </div>
        }
      />

      <ChildSwitcher children={children} activeId={activeChildId} onSelect={setActiveChildId} />

      {!activeChild?.classId ? (
        <EmptyState
          icon="class"
          title={`${activeChild?.name || 'This child'} is not in a class yet`}
          body="Assignments are set per class. The school office assigns a class on registration."
        />
      ) : decorated.length === 0 ? (
        <EmptyState
          icon="assignment"
          title="Nothing set right now"
          body={`Work set for ${activeChild.classId} will appear here as soon as a teacher publishes it.`}
        />
      ) : visible.length === 0 ? (
        <NoResults title="Nothing in this filter" body="Try another filter to see the rest." onClear={() => setFilter('all')} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((a) => (
            <Card
              key={a.id}
              className={`flex items-center gap-3.5 p-4 cursor-pointer transition-transform hover:-translate-y-0.5 ${
                a.overdue ? 'outline outline-[1.5px] -outline-offset-[1.5px] outline-danger' : ''
              }`}
              onClick={() => setDetail(a)}
            >
              <div
                className={`size-[42px] rounded-[13px] flex items-center justify-center shrink-0 ${
                  a.overdue ? 'bg-tint-blush text-ink-blush' : a.soon ? 'bg-tint-butter text-ink-butter' : 'bg-tint-mint text-ink-mint'
                }`}
              >
                <Icon name={a.overdue ? 'schedule' : 'assignment'} className="text-[20px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white">{a.title}</p>
                  {a.overdue && <Badge tone="blush">Past due</Badge>}
                  {a.soon && !a.overdue && <Badge tone="butter">Due soon</Badge>}
                </div>
                <p className="mt-1 text-[11.5px] text-slate-500 truncate">
                  {a.subject || a.classId}
                  {a.due ? ` · due ${a.due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ' · no due date'}
                </p>
              </div>
              <Icon name="chevron_right" className="text-[18px] text-slate-300 shrink-0" />
            </Card>
          ))}
        </div>
      )}

      <InlineNote icon="info">
        This is a read-only view of what teachers have set. Work is handed in at school — there is nothing to upload here.
      </InlineNote>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.title ?? ''}
        subtitle={detail ? `${detail.subject || ''}${detail.classId ? ` · ${detail.classId}` : ''}` : undefined}
      >
        {detail && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2.5">
              <div className="flex-1 bg-slate-50 dark:bg-slate-900/40 rounded-[13px] px-3.5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">Due</p>
                <p className="mt-1 text-[12.5px] font-semibold text-slate-900 dark:text-white">
                  {detail.dueDate ? new Date(detail.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : 'Not set'}
                </p>
              </div>
              <div className="flex-1 bg-slate-50 dark:bg-slate-900/40 rounded-[13px] px-3.5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">Class</p>
                <p className="mt-1 text-[12.5px] font-semibold text-slate-900 dark:text-white">{detail.classId || '—'}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-white mb-2">Instructions</p>
              <p className="text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-400">
                {detail.description || 'No further instructions were given.'}
              </p>
            </div>

            <InlineNote tone="butter" icon="info">
              Handed in on paper. You can see what was set, but there is nothing to submit here.
            </InlineNote>
          </div>
        )}
      </Drawer>
    </WorkSurface>
  );
};

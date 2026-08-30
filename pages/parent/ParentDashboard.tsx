import React, { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';
import { View } from '../../types';
import { Overview, ProfileCard, MiniCalendar, type CalendarEvent } from '../../components/Layouts';
import {
  Avatar, Badge, Button, Card, ChildSwitcher, EmptyState, feeBilled, feePaid, Greeting, isCarried, ProgressBar,
  SectionHeading, SkeletonTable, StatTile,
} from '../../components/ui';

interface ParentDashboardProps {
  onNavigate: (view: View) => void;
}

export const ParentDashboard: React.FC<ParentDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [children, setChildren] = useState<any[]>([]);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<{ rate: number; total: number; present: number } | null>(null);
  const [fees, setFees] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubStudents = firestoreService.getStudentsForParent(user.uid, (data) => {
      setChildren(data);
      setActiveChildId((prev) => prev ?? data[0]?.id ?? null);
      setLoading(false);
    });
    const unsubAnnouncements = firestoreService.getAnnouncements('parents', setAnnouncements);
    const unsubEvents = firestoreService.getEventsByAudience('parents', setEvents);
    return () => {
      unsubStudents();
      unsubAnnouncements();
      unsubEvents();
    };
    // activeChildId deliberately excluded — it caused this subscription to tear
    // down and re-open every time the parent switched child.
  }, [user?.uid]);

  const activeChild = children.find((c) => c.id === activeChildId) ?? null;

  useEffect(() => {
    if (!activeChild?.id || !user?.uid) return;
    const unsubAttendance = firestoreService.getStudentAttendanceSummary(activeChild.id, user.uid, setAttendance);
    const unsubFees = firestoreService.getFeesForStudent(activeChild.id, setFees);
    const unsubAssignments = firestoreService.getAssignments(activeChild.classId, setAssignments);
    const unsubReports = firestoreService.getStudentReports(activeChild.id, user.uid, setReports);
    return () => {
      unsubAttendance();
      unsubFees();
      unsubAssignments();
      unsubReports();
    };
  }, [activeChild?.id, user?.uid]);

  const firstName = (user?.name || 'there').split(' ')[0];

  // Skip rows superseded by an arrears carry-forward — their debt now lives in
  // the arrears charge that replaced them.
  const totals = fees.filter((f) => !isCarried(f)).reduce(
    (acc, f) => {
      acc.due += feeBilled(f);
      acc.paid += feePaid(f);
      return acc;
    },
    { due: 0, paid: 0 },
  );
  const balance = Math.max(0, totals.due - totals.paid);
  const paidPct = totals.due > 0 ? (totals.paid / totals.due) * 100 : 0;
  const releasedReports = reports.filter((r) => r.status === 'published').length;

  const calendarEvents: CalendarEvent[] = events
    .filter((e) => e?.date)
    .map((e) => ({ date: e.date, type: (e.type as CalendarEvent['type']) || 'event' }));

  const aside = activeChild ? (
    <>
      <ProfileCard name={activeChild.name} role={activeChild.classId || activeChild.grade || 'Student'} />
      <MiniCalendar events={calendarEvents} />
      {announcements.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <SectionHeading>From the school</SectionHeading>
          <div className="flex flex-col gap-[7px]">
            {announcements.slice(0, 3).map((a, i) => (
              <div key={a.id ?? i} className="bg-slate-50 dark:bg-slate-900/40 rounded-[14px] px-3 py-2.5">
                <p className="text-[11.5px] font-semibold text-slate-900 dark:text-white">{a.title}</p>
                <p className="mt-1 text-[10.5px] text-slate-500 leading-relaxed line-clamp-3">{a.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  ) : undefined;

  if (loading) {
    return (
      <Overview>
        <div className="h-14 w-64 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[104px] skeleton rounded-tile bg-slate-200/70 dark:bg-slate-700/50" />
          ))}
        </div>
        <SkeletonTable rows={3} />
      </Overview>
    );
  }

  if (children.length === 0) {
    return (
      <Overview>
        <Greeting name={firstName} />
        <EmptyState
          icon="family_restroom"
          title="No children linked to your account"
          body="The school office links a parent account to each child. Contact them if one is missing."
        />
      </Overview>
    );
  }

  return (
    <Overview aside={aside}>
      <Greeting name={firstName} subtitle="Here is how your children are doing this term" />

      <ChildSwitcher children={children} activeId={activeChildId} onSelect={setActiveChildId} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile
          tint="mint"
          icon="how_to_reg"
          label={attendance ? `Present ${attendance.present} of ${attendance.total} days` : 'Attendance this term'}
          value={attendance ? `${Math.round(attendance.rate)}%` : '—'}
        />
        <StatTile
          tint={balance > 0 ? 'blush' : 'mint'}
          icon="payments"
          label={balance > 0 ? 'Balance outstanding' : 'Fees settled'}
          value={`GHS ${balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          onClick={() => onNavigate(View.PARENT_FEES)}
        />
        <StatTile
          tint="blue"
          icon="description"
          label="Report cards released"
          value={releasedReports}
          onClick={() => onNavigate(View.PARENT_REPORTS)}
        />
      </div>

      {totals.due > 0 && (
        <Card>
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Fee progress</p>
              <p className="mt-0.5 text-[11.5px] text-slate-500">
                GHS {totals.paid.toLocaleString(undefined, { maximumFractionDigits: 0 })} of{' '}
                {totals.due.toLocaleString(undefined, { maximumFractionDigits: 0 })} paid
              </p>
            </div>
            <Button variant={balance > 0 ? 'primary' : 'secondary'} onClick={() => onNavigate(View.PARENT_FEES)}>
              {balance > 0 ? 'Pay fees' : 'View receipts'}
            </Button>
          </div>
          <ProgressBar value={paidPct} tone={balance > 0 ? 'warning' : 'success'} />
        </Card>
      )}

      <SectionHeading
        action={
          <button onClick={() => onNavigate(View.PARENT_ASSIGNMENTS)} className="text-[11px] font-semibold text-primary hover:underline">
            View all
          </button>
        }
      >
        Assignments
      </SectionHeading>
      {assignments.length === 0 ? (
        <EmptyState
          icon="assignment"
          title="Nothing set right now"
          body={`Work set for ${activeChild?.classId || 'this class'} will appear here.`}
        />
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2">
          {assignments.slice(0, 4).map((a, i) => {
            const due = a.dueDate ? new Date(a.dueDate) : null;
            const overdue = due ? due.getTime() < Date.now() : false;
            return (
              <Card key={a.id ?? i} className="flex items-center gap-3.5 p-4">
                <div
                  className={`size-[42px] rounded-[13px] flex items-center justify-center shrink-0 ${
                    overdue ? 'bg-tint-blush text-ink-blush' : 'bg-tint-blue text-ink-blue'
                  }`}
                >
                  <Icon name="assignment" className="text-[20px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">{a.title}</p>
                  <p className="mt-0.5 text-[11.5px] text-slate-500 truncate">
                    {a.subject || a.classId || ''}
                    {due ? ` · due ${due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
                  </p>
                </div>
                {overdue && <Badge tone="blush">Overdue</Badge>}
              </Card>
            );
          })}
        </div>
      )}
    </Overview>
  );
};

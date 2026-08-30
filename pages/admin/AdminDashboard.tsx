import React, { useEffect, useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';
import { View } from '../../types';
import { Overview, ProfileCard, MiniCalendar, type CalendarEvent } from '../../components/Layouts';
import { Avatar, Badge, Button, Card, EmptyState, Greeting, SectionHeading, SkeletonTable, StatTile } from '../../components/ui';

/**
 * Chart series colours — the corrected order from the design system.
 * `#6366f1` was removed: beside `#8b5cf6` it measured ΔE 0.8 under protanopia,
 * i.e. two class lines that some readers simply cannot tell apart.
 * Recharts needs literal hex, so these are not read from CSS custom properties.
 */
const SERIES = ['#195de6', '#f97316', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#4a3aa7'];

const money = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}k` : n.toFixed(0);

export const AdminDashboard: React.FC<{ onNavigate: (view: View) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [stats, setStats] = useState({ studentsCount: 0, teachersCount: 0 });
  const [finance, setFinance] = useState({ totalCollected: 0, chartData: [] as { name: string; amount: number }[] });
  const [attendanceRate, setAttendanceRate] = useState(0);
  const [distribution, setDistribution] = useState<{ grade: string; count: number }[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    firestoreService.getGlobalStats().then(setStats).catch(() => {});

    const unsubFees = firestoreService.getAllFees((data) => {
      const total = data.reduce((acc, curr) => acc + (parseFloat(curr.amountPaid) || 0), 0);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const currentYear = new Date().getFullYear();
      const monthly = months.map((m) => ({ name: m, amount: 0 }));
      data.forEach((f) => {
        const date = f.updatedAt ? new Date(f.updatedAt) : f.createdAt ? new Date(f.createdAt) : new Date();
        if (date.getFullYear() === currentYear) monthly[date.getMonth()].amount += parseFloat(f.amountPaid) || 0;
      });
      setFinance({ totalCollected: total, chartData: monthly.slice(0, new Date().getMonth() + 1) });
    });

    const unsubAttendance = firestoreService.getAllAttendance((data) => {
      if (!data.length) return setAttendanceRate(0);
      setAttendanceRate(Math.round((data.filter((a) => a.status === 'present').length / data.length) * 100));
    });

    const unsubDist = firestoreService.getDistribution((d) => setDistribution(d as any));

    const unsubStudents = firestoreService.getStudents((data) => {
      const sorted = [...data]
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 5);
      setRecentActivities(
        sorted.map((s) => ({
          id: s.id,
          name: s.name,
          detail: s.classId || s.grade || 'Unassigned',
          kind: 'Student',
          date: s.createdAt ? new Date(s.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'Today',
        })),
      );
      setLoading(false);
    });

    const unsubReports = firestoreService.getAllReports(setReports);
    const unsubEvents = firestoreService.getAllEvents(setEvents);

    return () => {
      unsubFees();
      unsubAttendance();
      unsubDist();
      unsubStudents();
      unsubReports();
      unsubEvents();
    };
  }, []);

  const pendingApprovals = useMemo(() => reports.filter((r) => r.status === 'pending').length, [reports]);
  const firstName = (user?.name || 'there').split(' ')[0];
  const maxCount = Math.max(1, ...distribution.map((d) => d.count));

  const calendarEvents: CalendarEvent[] = events
    .filter((e) => e?.date)
    .map((e) => ({ date: e.date, type: (e.type as CalendarEvent['type']) || 'event' }));

  const aside = (
    <>
      <ProfileCard name={user?.name || 'Administrator'} role="School Administrator" tint="lilac" />
      <MiniCalendar events={calendarEvents} />

      <div className="flex flex-col gap-2.5">
        <SectionHeading>Needs attention</SectionHeading>
        {pendingApprovals > 0 ? (
          <button
            onClick={() => onNavigate(View.ADMIN_APPROVALS)}
            className="text-left bg-tint-peach rounded-panel p-4 flex items-center gap-3 transition-transform hover:-translate-y-0.5"
          >
            <div className="size-9 rounded-xl bg-white dark:bg-slate-900/50 text-ink-peach flex items-center justify-center shrink-0">
              <Icon name="fact_check" className="text-[18px]" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
                {pendingApprovals} report {pendingApprovals === 1 ? 'batch' : 'batches'} awaiting release
              </p>
              <p className="mt-0.5 text-[10.5px] text-slate-500">Open the approvals queue</p>
            </div>
          </button>
        ) : (
          <p className="text-[11.5px] text-slate-400 leading-relaxed">Nothing is waiting on you right now.</p>
        )}
      </div>
    </>
  );

  if (loading) {
    return (
      <Overview>
        <div className="h-14 w-64 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[104px] skeleton rounded-tile bg-slate-200/70 dark:bg-slate-700/50" />
          ))}
        </div>
        <SkeletonTable rows={4} />
      </Overview>
    );
  }

  return (
    <Overview aside={aside}>
      <Greeting
        name={firstName}
        subtitle={`${stats.studentsCount.toLocaleString()} students · ${stats.teachersCount} staff`}
        actions={
          <>
            <Button variant="secondary" icon="campaign" onClick={() => onNavigate(View.ADMIN_ANNOUNCEMENTS)}>
              Announce
            </Button>
            <Button icon="person_add" onClick={() => onNavigate(View.ADMIN_REGISTRATION)}>
              Register
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile tint="blue" icon="groups" label="Enrolled students" value={stats.studentsCount.toLocaleString()} />
        <StatTile tint="lilac" icon="school" label="Teaching staff" value={stats.teachersCount} />
        <StatTile
          tint="mint"
          icon="payments"
          label="Fees collected"
          value={`GHS ${money(finance.totalCollected)}`}
          onClick={() => onNavigate(View.ADMIN_FEES)}
        />
        <StatTile tint="peach" icon="how_to_reg" label="Attendance rate" value={`${attendanceRate}%`} />
      </div>

      <SectionHeading>Finance</SectionHeading>
      <div className="bg-tint-blue rounded-panel p-5 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13.5px] font-semibold text-ink-blue">Fee collection by month</p>
            <p className="mt-0.5 text-[10.5px] text-slate-500">GHS received · {new Date().getFullYear()} to date</p>
          </div>
        </div>
        {finance.chartData.length === 0 ? (
          <p className="py-10 text-center text-[11.5px] text-slate-500">No payments recorded this year yet.</p>
        ) : (
          <div className="h-[190px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              {/* The left margin used to be -18, which pulled the axis gutter off the
                  canvas and sliced the first characters off every tick — "4,000"
                  rendered as ")00". Compact ticks keep the gutter narrow honestly. */}
              <BarChart data={finance.chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#c7d7fb" strokeDasharray="3 4" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} dy={8} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  width={42}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : String(v)
                  }
                />
                <Tooltip
                  cursor={{ fill: 'rgba(25,93,230,0.08)' }}
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 26px -12px rgba(15,23,42,.35)', fontSize: 12 }}
                  formatter={(v: any) => [`GHS ${Number(v).toLocaleString()}`, 'Collected']}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={44} fill={SERIES[0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <SectionHeading>Students per class</SectionHeading>
      {distribution.length === 0 ? (
        <EmptyState icon="groups" title="No classes with students yet" body="Class levels with registered students will be charted here." />
      ) : (
        <Card>
          <div className="flex flex-col gap-2.5">
            {distribution.map((d, i) => (
              <div key={d.grade ?? i} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[11.5px] text-slate-600 dark:text-slate-400 truncate">{d.grade || 'Unassigned'}</span>
                <div className="flex-1 h-3.5 rounded-[7px] bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-[7px]"
                    style={{ width: `${(d.count / maxCount) * 100}%`, background: SERIES[i % SERIES.length] }}
                  />
                </div>
                <span className="w-9 shrink-0 text-right text-[11.5px] font-semibold text-slate-900 dark:text-white">{d.count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <SectionHeading
        action={
          <button onClick={() => onNavigate(View.ADMIN_REGISTRATION)} className="text-[11px] font-semibold text-primary hover:underline">
            View all
          </button>
        }
      >
        Recent registrations
      </SectionHeading>
      {recentActivities.length === 0 ? (
        <EmptyState icon="person_add" title="No registrations yet" body="Newly registered students and staff appear here." />
      ) : (
        <Card pad={false} className="p-2">
          {recentActivities.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-[14px] hover:bg-slate-50 dark:hover:bg-slate-900/40">
              <Avatar name={a.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">{a.name}</p>
                <p className="text-[10.5px] text-slate-500 truncate">{a.detail}</p>
              </div>
              <span className="text-[10.5px] text-slate-400 shrink-0">{a.date}</span>
              <Badge tone="mint">{a.kind}</Badge>
            </div>
          ))}
        </Card>
      )}
    </Overview>
  );
};

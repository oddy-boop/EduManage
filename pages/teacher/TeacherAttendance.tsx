import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';
import { exportToCSV } from '../../lib/exportUtils';
import { WorkSurface } from '../../components/Layouts';
import {
  Avatar, Button, Card, Chip, EmptyState, InlineNote, Input, NoResults, PageHeader, SegmentedControl, SkeletonTable,
  StatTile,
} from '../../components/ui';

/**
 * A register records whether the child was in school, nothing finer. "Late" was a
 * third option that meant present for every calculation that mattered, so it only
 * made the teacher choose between two answers that behaved identically.
 *
 * Any legacy 'late' row is still read as attending — see historyDays and counts —
 * so old registers keep the same rate they always had.
 */
type Status = 'present' | 'absent';

const OPTIONS: { value: Status; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
];

const toneFor = (v: Status): 'success' | 'danger' => (v === 'present' ? 'success' : 'danger');

export const TeacherAttendance: React.FC = () => {
  const { user } = useAuth();

  /**
   * Only the classes this teacher is CLASS TEACHER of.
   *
   * It used to list every class they teach, so a subject teacher could mark the
   * daily register for a form class that was not theirs — and two teachers could
   * overwrite each other's register for the same day. The server now refuses that;
   * this stops the screen offering it in the first place.
   */
  const [formClasses, setFormClasses] = useState<string[] | null>(null);
  const classes = formClasses ?? [];

  // Was pinned to assignedClasses[0], so a teacher with two classes could only
  // ever mark the first one.
  const [activeClassId, setActiveClassId] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const isToday = selectedDate === today;

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = firestoreService.getGrades((data: any[]) => {
      const mine = (data || []).filter((g) => g.classTeacherId === user.uid).map((g) => g.name);
      setFormClasses(mine);
      setActiveClassId((prev) => (prev && mine.includes(prev) ? prev : mine[0] || ''));
      if (mine.length === 0) setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !activeClassId) {
      if (formClasses !== null && formClasses.length === 0) setLoading(false);
      return;
    }
    setLoading(true);
    const unsubAttendance = firestoreService.getAttendanceForClass(activeClassId, setAttendance);
    const unsubStudents = firestoreService.getStudentsForClass(activeClassId, (data) => {
      setStudents(data);
      setLoading(false);
    });
    return () => {
      unsubAttendance();
      unsubStudents();
    };
  }, [user, activeClassId]);

  /** Marks for the selected day. The tiles previously counted every record ever
   *  stored for the class, so "present today" was an all-time total. */
  const todayByStudent = useMemo(() => {
    const m = new Map<string, Status>();
    attendance.filter((a) => a.date === selectedDate).forEach((a) => m.set(a.studentId, a.status));
    return m;
  }, [attendance, selectedDate]);

  /** Every day this class has a record for, newest first — the history the API
   *  was already returning and the screen used to discard. */
  const historyDays = useMemo(() => {
    const byDate = new Map<string, { present: number; absent: number; total: number }>();
    attendance.forEach((a) => {
      if (!a.date) return;
      const row = byDate.get(a.date) ?? { present: 0, absent: 0, total: 0 };
      // Anything that is not an absence counts as attending, which folds in any
      // 'late' rows recorded before that option was removed.
      if (a.status === 'absent') row.absent += 1;
      else row.present += 1;
      row.total += 1;
      byDate.set(a.date, row);
    });
    return [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, c]) => ({ date, ...c, rate: c.total ? Math.round((c.present / c.total) * 100) : 0 }));
  }, [attendance]);

  const shiftDay = (delta: number) => {
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setDate(d.getDate() + delta);
    const next = d.toISOString().split('T')[0];
    if (next > today) return; // no marking the future
    setSelectedDate(next);
    setStatus(null);
  };

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0 };
    todayByStudent.forEach((s) => {
      if (s === 'absent') c.absent += 1;
      else c.present += 1;
    });
    return c;
  }, [todayByStudent]);

  const unmarked = students.length - todayByStudent.size;

  const mark = async (studentId: string, next: Status) => {
    setStatus(null);
    setBusy(studentId);
    try {
      const student = students.find((s) => s.id === studentId);
      await firestoreService.markAttendance({
        studentId,
        parentId: student?.parentId,
        classId: activeClassId,
        date: selectedDate,
        status: next,
      });
    } catch (error) {
      console.error('Attendance failed', error);
      setStatus({ tone: 'bad', text: 'That mark did not save. Check your connection and try again.' });
    } finally {
      setBusy(null);
    }
  };

  const markAllPresent = async () => {
    setStatus(null);
    try {
      await Promise.all(
        students.map((s) =>
          firestoreService.markAttendance({
            studentId: s.id,
            parentId: s.parentId,
            classId: activeClassId,
            date: selectedDate,
            status: 'present',
          }),
        ),
      );
      setStatus({ tone: 'ok', text: `Marked all ${students.length} students present.` });
    } catch {
      setStatus({ tone: 'bad', text: 'Could not mark everyone present.' });
    }
  };

  const finalize = async () => {
    const unrecorded = students.filter((s) => !todayByStudent.has(s.id));
    if (unrecorded.length === 0) {
      setStatus({ tone: 'ok', text: 'Every student is already recorded for today.' });
      return;
    }
    if (!window.confirm(`${unrecorded.length} student(s) have no attendance recorded today. Mark them absent and finalize?`)) return;
    setFinalizing(true);
    setStatus(null);
    try {
      await Promise.all(
        unrecorded.map((s) =>
          firestoreService.markAttendance({
            studentId: s.id,
            parentId: s.parentId,
            classId: activeClassId,
            date: selectedDate,
            status: 'absent',
          }),
        ),
      );
      setStatus({ tone: 'ok', text: `Finalized. ${unrecorded.length} unrecorded student(s) marked absent.` });
    } catch {
      setStatus({ tone: 'bad', text: 'Could not finalize attendance.' });
    } finally {
      setFinalizing(false);
    }
  };

  const visible = students.filter((s) => (s.name || '').toLowerCase().includes(search.toLowerCase()));

  if (loading) {
    return (
      <WorkSurface>
        <div className="h-14 w-64 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <SkeletonTable rows={6} />
      </WorkSurface>
    );
  }

  // Says why rather than showing an empty class picker. Teaching a class is not the
  // same as being its class teacher, and only the latter marks the register.
  if (formClasses !== null && formClasses.length === 0) {
    return (
      <WorkSurface>
        <PageHeader title="Attendance" subtitle="The daily register for your form class" />
        <EmptyState
          icon="how_to_reg"
          title="You are not a class teacher"
          body="The register is marked by whoever is set as class teacher for a class. Teaching a subject in a class does not include marking its register — ask your administrator if that should be you."
        />
      </WorkSurface>
    );
  }

  return (
    <WorkSurface>
      <PageHeader
        title="Attendance"
        subtitle={`${activeClassId} · ${new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}${isToday ? '' : ' · past date'}`}
        actions={
          <>
            <Button
              variant="secondary"
              icon="file_download"
              onClick={() =>
                exportToCSV(
                  students.map((s) => ({ Name: s.name, Student: s.id, Status: todayByStudent.get(s.id) ?? 'not marked' })),
                  `attendance_${activeClassId}_${selectedDate}.csv`,
                )
              }
            >
              Export register
            </Button>
            <Button icon="check" onClick={finalize} loading={finalizing} disabled={students.length === 0}>
              Finalize day
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1.5 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 rounded-control p-1">
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            aria-label="Previous day"
            className="size-8 rounded-[9px] flex items-center justify-center text-slate-500 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          >
            <Icon name="chevron_left" className="text-[17px]" />
          </button>
          <input
            type="date"
            value={selectedDate}
            max={today}
            onChange={(e) => {
              if (e.target.value && e.target.value <= today) {
                setSelectedDate(e.target.value);
                setStatus(null);
              }
            }}
            aria-label="Attendance date"
            className="bg-transparent text-[12.5px] font-medium text-slate-900 dark:text-white outline-none px-1"
          />
          <button
            type="button"
            onClick={() => shiftDay(1)}
            disabled={isToday}
            aria-label="Next day"
            className="size-8 rounded-[9px] flex items-center justify-center text-slate-500 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          >
            <Icon name="chevron_right" className="text-[17px]" />
          </button>
        </div>
        {!isToday && (
          <Button variant="secondary" icon="calendar_today" onClick={() => { setSelectedDate(today); setStatus(null); }}>
            Back to today
          </Button>
        )}
      </div>

      {!isToday && (
        <InlineNote tone="butter" icon="history">
          You are viewing <span className="font-semibold">
            {new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>, not today. Changes here correct the record for that day.
        </InlineNote>
      )}

      <div className="grid grid-cols-3 gap-3">
        <StatTile tint="mint" icon="check_circle" label="Present" value={counts.present} />
        <StatTile tint="blush" icon="cancel" label="Absent" value={counts.absent} />
        <StatTile tint="plain" icon="pending" label="Not marked" value={unmarked < 0 ? 0 : unmarked} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {classes.map((c) => (
            <Chip key={c} active={c === activeClassId} onClick={() => setActiveClassId(c)}>
              {c}
            </Chip>
          ))}
          <span className="hidden md:block w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
          <div className="relative">
            <Icon name="search" className="text-[15px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a student"
              aria-label="Find a student"
              className="h-9 w-[230px] pl-9"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status && (
            <span className={`text-[11.5px] flex items-center gap-1.5 ${status.tone === 'ok' ? 'text-ink-mint' : 'text-ink-blush'}`}>
              <Icon name={status.tone === 'ok' ? 'check_circle' : 'priority_high'} className="text-[14px]" />
              {status.text}
            </span>
          )}
          <Button variant="secondary" onClick={markAllPresent} disabled={students.length === 0}>
            Mark all present
          </Button>
        </div>
      </div>

      {students.length === 0 ? (
        <EmptyState
          icon="groups"
          title={activeClassId === 'Unassigned' ? 'You have no class assigned' : `No students in ${activeClassId}`}
          body={
            activeClassId === 'Unassigned'
              ? 'Ask your school administrator to assign you to a class.'
              : 'Students registered into this class will appear here.'
          }
        />
      ) : visible.length === 0 ? (
        <NoResults
          title={`No students match “${search}”`}
          body={`${students.length} students in ${activeClassId}, none with that name.`}
          onClear={() => setSearch('')}
          clearLabel="Clear search"
        />
      ) : (
        <Card pad={false} className="overflow-hidden">
          <div className="hidden md:grid grid-cols-[40px_minmax(0,1fr)_300px_120px] items-center gap-4 px-5 py-3.5 bg-slate-50 dark:bg-slate-900/40 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
            <span>#</span>
            <span>Student</span>
            <span>Today</span>
            <span className="text-right">Recorded</span>
          </div>

          {visible.map((s, i) => {
            const current = todayByStudent.get(s.id) ?? null;
            return (
              <div
                key={s.id}
                className={`grid grid-cols-1 md:grid-cols-[40px_minmax(0,1fr)_300px_120px] items-center gap-3 md:gap-4 px-5 py-3 border-t border-slate-100 dark:border-slate-800 ${
                  current === 'absent' ? 'bg-tint-blush' : current === null ? 'bg-slate-50/60 dark:bg-slate-900/20' : ''
                } ${busy === s.id ? 'opacity-60' : ''}`}
              >
                <span className="hidden md:block text-[11.5px] font-semibold text-slate-300">{String(i + 1).padStart(2, '0')}</span>
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={s.name} size={34} tint={current === 'absent' ? 'blush' : 'blue'} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">{s.name}</p>
                    <p className="text-[10.5px] text-slate-400 truncate">{current === null ? 'Not marked yet' : s.id}</p>
                  </div>
                </div>
                <SegmentedControl
                  options={OPTIONS}
                  value={current}
                  onChange={(v) => mark(s.id, v)}
                  toneFor={toneFor}
                  className={current === null ? 'border border-dashed border-slate-300 dark:border-slate-700' : ''}
                />
                <span className="hidden md:block text-right text-[11.5px] text-slate-400">
                  {current ? <Icon name="check_circle" className="text-[16px] text-success" /> : '—'}
                </span>
              </div>
            );
          })}

          <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex items-center gap-3">
            <div className="w-36 h-[7px] rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${students.length ? (todayByStudent.size / students.length) * 100 : 0}%` }}
              />
            </div>
            <span className="text-[11.5px] text-slate-500">
              <span className="font-semibold text-slate-900 dark:text-white">
                {todayByStudent.size} of {students.length}
              </span>{' '}
              students marked
            </span>
          </div>
        </Card>
      )}
      {historyDays.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Previous registers</p>
              <p className="mt-0.5 text-[11.5px] text-slate-500">
                Every day {activeClassId} has a record for. Pick one to view or correct it.
              </p>
            </div>
            <span className="text-[11.5px] text-slate-400">{historyDays.length} days recorded</span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {historyDays.slice(0, 30).map((d) => {
              const on = d.date === selectedDate;
              const day = new Date(`${d.date}T00:00:00`);
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => { setSelectedDate(d.date); setStatus(null); }}
                  aria-pressed={on}
                  aria-label={`View ${day.toLocaleDateString()} — ${d.rate}% present`}
                  className={`shrink-0 w-[92px] rounded-[14px] p-2.5 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    on
                      ? 'bg-primary text-white shadow-primary'
                      : 'bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.06em] ${on ? 'text-white/70' : 'text-slate-400'}`}>
                    {day.toLocaleDateString(undefined, { weekday: 'short' })}
                  </p>
                  <p className={`mt-0.5 text-[13px] font-bold ${on ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                    {day.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span
                      className={`size-1.5 rounded-full ${
                        on ? 'bg-white' : d.rate >= 90 ? 'bg-success' : d.rate >= 75 ? 'bg-warning' : 'bg-danger'
                      }`}
                    />
                    <span className={`text-[10.5px] font-semibold ${on ? 'text-white/85' : 'text-slate-500'}`}>
                      {d.rate}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </WorkSurface>
  );
};

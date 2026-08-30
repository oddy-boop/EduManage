import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { WorkSurface } from '../../components/Layouts';
import {
  Avatar, Badge, Card, Chip, EmptyState, Field, InlineNote, Input, NoResults, PageHeader, ProgressBar, SkeletonTable,
  StatTile, Td, Th,
} from '../../components/ui';

/**
 * Attendance, by class, for an administrator.
 *
 * Teachers already mark and review their own registers. What was missing was the
 * whole-school view: an admin could see a single "attendance rate" tile on the
 * dashboard but could not answer "which class, and which child in it".
 */
const STATUS_TONE: Record<string, 'mint' | 'blush' | 'plain'> = {
  present: 'mint',
  absent: 'blush',
};

export const AdminAttendance: React.FC = () => {
  const [classes, setClasses] = useState<string[]>([]);
  const [activeClass, setActiveClass] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [day, setDay] = useState('');

  const [configuredClasses, setConfiguredClasses] = useState<string[]>([]);
  const [studentClasses, setStudentClasses] = useState<string[]>([]);
  const [attendanceClasses, setAttendanceClasses] = useState<string[]>([]);

  /**
   * Classes come from three places, unioned. Listing only the configured class
   * levels hid any class that has students and registers but was never added to (or
   * was later removed from) School Settings — the admin would not even see it as an
   * option, while its attendance sat in the database.
   */
  useEffect(() => {
    const unsubGrades = firestoreService.getGrades((data: any[]) =>
      setConfiguredClasses((data || []).map((g) => g.name).filter(Boolean)),
    );
    const unsubStudents = firestoreService.getStudents((data: any[]) =>
      setStudentClasses((data || []).map((st) => st.classId).filter(Boolean)),
    );
    const unsubAttendance = firestoreService.getAllAttendance((data: any[]) => {
      setAttendanceClasses((data || []).map((r) => r.classId).filter(Boolean));
      setLoading(false);
    });
    return () => {
      unsubGrades();
      unsubStudents();
      unsubAttendance();
    };
  }, []);

  useEffect(() => {
    const names = Array.from(new Set([...configuredClasses, ...studentClasses, ...attendanceClasses])).sort();
    setClasses(names);
    setActiveClass((prev) => (prev && names.includes(prev) ? prev : names[0] || ''));
  }, [configuredClasses, studentClasses, attendanceClasses]);

  useEffect(() => {
    if (!activeClass) return;
    const unsubStudents = firestoreService.getStudentsForClass(activeClass, setStudents);
    const unsubAttendance = firestoreService.getAttendanceForClass(activeClass, setRecords);
    return () => {
      unsubStudents();
      unsubAttendance();
    };
  }, [activeClass]);

  /** Per-student tallies over every record held for this class, or one chosen day. */
  const rows = useMemo(() => {
    const scoped = day ? records.filter((r) => String(r.date).slice(0, 10) === day) : records;
    const byStudent: Record<string, { present: number; absent: number }> = {};
    scoped.forEach((r) => {
      const tally = (byStudent[r.studentId] ||= { present: 0, absent: 0 });
      // Registers record attendance or absence. A legacy 'late' row still counts as
      // attending, so historical rates do not change now the option is gone.
      if (String(r.status || '').toLowerCase() === 'absent') tally.absent += 1;
      else tally.present += 1;
    });

    const q = search.trim().toLowerCase();
    return students
      .filter((s) => !q || (s.name || '').toLowerCase().includes(q))
      .map((s) => {
        const t = byStudent[s.id] || { present: 0, absent: 0 };
        const total = t.present + t.absent;
        const rate = total > 0 ? (t.present / total) * 100 : null;
        return { student: s, ...t, total, rate };
      })
      .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || a.student.name.localeCompare(b.student.name));
  }, [students, records, search, day]);

  const summary = useMemo(() => {
    const withData = rows.filter((r) => r.total > 0);
    const marked = withData.reduce((a, r) => a + r.total, 0);
    const attended = withData.reduce((a, r) => a + r.present, 0);
    const sessions = new Set(
      (day ? records.filter((r) => String(r.date).slice(0, 10) === day) : records).map((r) => String(r.date).slice(0, 10)),
    ).size;
    return {
      rate: marked > 0 ? Math.round((attended / marked) * 100) : null,
      sessions,
      // Below 75% is the usual threshold at which a school starts asking questions.
      atRisk: withData.filter((r) => (r.rate ?? 100) < 75).length,
    };
  }, [rows, records, day]);

  if (loading) {
    return (
      <WorkSurface>
        <div className="h-14 w-72 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <SkeletonTable rows={6} />
      </WorkSurface>
    );
  }

  if (classes.length === 0) {
    return (
      <WorkSurface>
        <PageHeader title="Attendance" subtitle="Registers by class" />
        <EmptyState
          icon="how_to_reg"
          title="No class levels configured"
          body="Add class levels under School Settings, then attendance marked by teachers appears here."
        />
      </WorkSurface>
    );
  }

  return (
    <WorkSurface>
      <PageHeader
        title="Attendance"
        subtitle="Every register marked by teachers, grouped by class"
        actions={
          <Field label="" className="w-[190px]">
            <Input
              type="date"
              value={day}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDay(e.target.value)}
              aria-label="Show a single day"
            />
          </Field>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {classes.map((c) => (
          <Chip key={c} active={activeClass === c} onClick={() => setActiveClass(c)}>
            {c}
            {!configuredClasses.includes(c) ? ' ·' : ''}
          </Chip>
        ))}
        {day && (
          <button
            type="button"
            onClick={() => setDay('')}
            className="ml-1 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-primary rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Icon name="close" className="text-[13px]" />
            Showing {new Date(day).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })} — show all
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile tint="blue" icon="groups" label="Students" value={students.length} />
        <StatTile
          tint="mint"
          icon="how_to_reg"
          label="Attendance rate"
          value={summary.rate == null ? '—' : `${summary.rate}%`}
        />
        <StatTile tint="lilac" icon="calendar_today" label="Days marked" value={summary.sessions} />
        <StatTile tint="peach" icon="warning" label="Below 75%" value={summary.atRisk} />
      </div>

      <div className="max-w-xs">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a student" aria-label="Find a student" />
      </div>

      {activeClass && !configuredClasses.includes(activeClass) && (
        <InlineNote tone="butter" icon="warning">
          {activeClass} is not one of the class levels configured in School Settings, but students and registers exist for
          it. Add it there so it appears everywhere else in the app.
        </InlineNote>
      )}

      {records.length === 0 ? (
        <EmptyState
          icon="how_to_reg"
          title={`No attendance recorded for ${activeClass}`}
          body="Once the class teacher marks a register it appears here — nothing is entered from this screen."
        />
      ) : rows.length === 0 ? (
        <NoResults title={`No student matches “${search}”`} onClear={() => setSearch('')} clearLabel="Clear search" />
      ) : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[640px]">
              <thead className="bg-slate-50 dark:bg-slate-900/40">
                <tr>
                  <Th>Student</Th>
                  <Th className="text-right w-24">Present</Th>
                  <Th className="text-right w-24">Absent</Th>
                  <Th className="w-52">Rate</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.student.id}>
                    <Td>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={r.student.name} size={30} />
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-semibold text-slate-900 dark:text-white truncate">
                            {r.student.name}
                          </p>
                          <p className="text-[10.5px] text-slate-400 truncate">
                            {r.student.admissionNumber || r.student.loginId || ''}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-right">
                      <Badge tone={STATUS_TONE.present}>{r.present}</Badge>
                    </Td>
                    <Td className="text-right">{r.absent > 0 ? <Badge tone={STATUS_TONE.absent}>{r.absent}</Badge> : '—'}</Td>
                    <Td>
                      {r.rate == null ? (
                        <span className="text-[11.5px] text-slate-400">Not marked</span>
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <ProgressBar value={r.rate} tone={r.rate >= 90 ? 'success' : r.rate >= 75 ? 'primary' : 'danger'} />
                          <span className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-300 w-10 text-right shrink-0">
                            {Math.round(r.rate)}%
                          </span>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </WorkSurface>
  );
};

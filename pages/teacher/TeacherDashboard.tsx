import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';
import { View } from '../../types';
import { exportToCSV } from '../../lib/exportUtils';
import { Overview, ProfileCard, MiniCalendar, type CalendarEvent } from '../../components/Layouts';
import {
  Avatar, Badge, Button, Card, EmptyState, Greeting, SectionHeading, SkeletonTable, StatTile, Td, Th, TableShell,
} from '../../components/ui';

interface TeacherDashboardProps {
  onNavigate: (view: View) => void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const assignedClasses = user?.assignedClasses || [];
  // Being a class teacher is recorded on the class (grade_configs.class_teacher_id),
  // not on the teacher. It was previously guessed from assignedClasses[0] — the first
  // class they TEACH — so a teacher who takes a subject in JHS 1 but is form teacher
  // of JHS 2 was labelled "Class teacher · JHS 1", contradicting the review screen.
  const [formClasses, setFormClasses] = useState<string[]>([]);

  useEffect(() => {
    if (!user?.uid) {
      if (user === null) setLoading(false);
      return;
    }

    const unsubStudents = firestoreService.getStudentsByGrades(assignedClasses, (data) => {
      setStudents(data);
      setLoading(false);
    });

    const unsubGrades = firestoreService.getGrades((data: any[]) =>
      setFormClasses((data || []).filter((g) => g.classTeacherId === user.uid).map((g) => g.name)),
    );

    // Every class they teach, not just the first: a teacher with two classes was
    // shown one class's assignments and told that was all of them.
    const perClass = new Map<string, any[]>();
    const unsubAssignments = assignedClasses.map((c) =>
      firestoreService.getAssignments(c, (data) => {
        perClass.set(c, data);
        setAssignments([...perClass.values()].flat());
      }),
    );

    const schedByClass = new Map<string, any[]>();
    const unsubSchedules = assignedClasses.map((c) =>
      firestoreService.getClassSchedule(c, (data) => {
        schedByClass.set(c, (data || []).map((d: any) => ({ ...d, classId: c })));
        setSchedule([...schedByClass.values()].flat());
      }),
    );

    const unsubAnnouncements = firestoreService.getAnnouncements('teachers', setAnnouncements);
    const unsubEvents = firestoreService.getEventsByAudience('teachers', setEvents);

    return () => {
      unsubStudents();
      unsubGrades();
      unsubAssignments.forEach((u) => u());
      unsubSchedules.forEach((u) => u());
      unsubAnnouncements();
      unsubEvents();
    };
  }, [user, assignedClasses.join(',')]);

  const firstName = (user?.name || 'there').split(' ')[0];
  const primaryClass = assignedClasses[0];
  /** What this teacher actually is, from the class record rather than a guess. */
  const roleLabel = formClasses.length
    ? `Class teacher · ${formClasses.join(', ')}`
    : assignedClasses.length
      ? 'Subject teacher'
      : 'Teacher';

  const calendarEvents: CalendarEvent[] = events
    .filter((e) => e?.date)
    .map((e) => ({ date: e.date, type: (e.type as CalendarEvent['type']) || 'event' }));

  const aside = (
    <>
      <ProfileCard name={user?.name || 'Teacher'} role={roleLabel} />
      <MiniCalendar events={calendarEvents} />

      <div className="flex flex-col gap-2.5">
        <SectionHeading>Today&rsquo;s schedule</SectionHeading>
        {schedule.length === 0 ? (
          <p className="text-[11.5px] text-slate-400 leading-relaxed">
            Nothing scheduled for {assignedClasses.length ? assignedClasses.join(' or ') : 'your classes'} today.
          </p>
        ) : (
          <div className="flex flex-col gap-[7px]">
            {schedule.slice(0, 5).map((s, i) => (
              <div key={s.id ?? i} className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-[14px] px-3 py-2.5">
                <div className="size-[30px] rounded-[10px] bg-tint-blue text-ink-blue flex items-center justify-center shrink-0">
                  <Icon name="menu_book" className="text-[15px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{s.subject || s.title || 'Lesson'}</p>
                  <p className="text-[10.5px] text-slate-500 truncate">{s.classId || primaryClass}{s.room ? ` · ${s.room}` : ''}</p>
                </div>
                {s.time && <span className="text-[10.5px] text-slate-400 shrink-0">{s.time}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {announcements.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <SectionHeading>From the school</SectionHeading>
          <div className="flex flex-col gap-[7px]">
            {announcements.slice(0, 3).map((a, i) => (
              <div key={a.id ?? i} className="bg-slate-50 dark:bg-slate-900/40 rounded-[14px] px-3 py-2.5">
                <p className="text-[11.5px] font-semibold text-slate-900 dark:text-white">{a.title}</p>
                <p className="mt-1 text-[10.5px] text-slate-500 leading-relaxed line-clamp-2">{a.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
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
        <SkeletonTable rows={5} />
      </Overview>
    );
  }

  return (
    <Overview aside={aside}>
      <Greeting
        name={firstName}
        subtitle={
          <span className="flex items-center gap-1.5">
            <Icon name="calendar_today" className="text-[14px]" />
            {assignedClasses.length ? `${assignedClasses.join(' · ')} · ` : ''}
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" icon="file_download" onClick={() => exportToCSV(students, 'student_roster.csv')}>
              Export
            </Button>
            <Button icon="add" onClick={() => onNavigate(View.TEACHER_ASSIGNMENTS)}>
              New Assignment
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          tint="blue"
          icon="groups"
          label="Total students"
          value={students.length}
          badge={<Badge tone="blue">Active</Badge>}
          onClick={() => onNavigate(View.TEACHER_ATTENDANCE)}
        />
        <StatTile
          tint="peach"
          icon="pending_actions"
          label="Assignments set"
          value={assignments.length}
          onClick={() => onNavigate(View.TEACHER_ASSIGNMENTS)}
        />
        <StatTile tint="mint" icon="schedule" label="Sessions today" value={schedule.length} badge={<Badge tone="mint">Today</Badge>} />
        <StatTile
          tint="lilac"
          icon="analytics"
          label={formClasses.length ? 'Class teacher of' : 'Classes taught'}
          value={formClasses.length ? formClasses.join(', ') : assignedClasses.length ? String(assignedClasses.length) : '—'}
        />
      </div>

      <SectionHeading
        action={
          <button onClick={() => onNavigate(View.TEACHER_ATTENDANCE)} className="text-[11px] font-semibold text-primary hover:underline">
            Take attendance
          </button>
        }
      >
        Student roster
      </SectionHeading>

      {students.length === 0 ? (
        <EmptyState
          icon="groups"
          title={assignedClasses.length ? 'No students in your classes yet' : 'You have no classes assigned'}
          body={
            assignedClasses.length
              ? 'Students registered into your classes by the school office will appear here.'
              : 'Ask your school administrator to assign you to a class.'
          }
        />
      ) : (
        <TableShell>
          <table className="w-full border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-900/40">
              <tr>
                <Th>Student</Th>
                <Th>Class</Th>
                <Th>Guardian</Th>
                <Th className="text-right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {students.slice(0, 8).map((s) => (
                <tr key={s.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={s.name} size={30} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">{s.name}</p>
                        <p className="text-[10.5px] text-slate-400">{s.id}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>{s.classId || s.grade || '—'}</Td>
                  <Td className="text-slate-400">{s.parentId ? 'Linked' : 'Not linked'}</Td>
                  <Td className="text-right">
                    <Badge tone={s.parentId ? 'mint' : 'butter'}>{s.parentId ? 'Active' : 'No guardian'}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {students.length > 8 && (
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
              <span className="text-[11.5px] text-slate-500">{students.length - 8} more students</span>
            </div>
          )}
        </TableShell>
      )}

      <SectionHeading>Assignments</SectionHeading>
      {assignments.length === 0 ? (
        <EmptyState
          icon="assignment"
          title="No assignments yet"
          body={`Anything you set for ${assignedClasses.length ? assignedClasses.join(' or ') : 'your classes'} shows up here, with submissions as they come in.`}
          action={
            <Button icon="add" onClick={() => onNavigate(View.TEACHER_ASSIGNMENTS)}>
              New assignment
            </Button>
          }
        />
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2">
          {assignments.slice(0, 4).map((a, i) => (
            <Card key={a.id ?? i} className="flex items-center gap-3.5 p-4">
              <div className="size-[42px] rounded-[13px] bg-tint-blue text-ink-blue flex items-center justify-center shrink-0">
                <Icon name="assignment" className="text-[20px]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">{a.title}</p>
                <p className="mt-0.5 text-[11.5px] text-slate-500 truncate">
                  {a.classId || primaryClass}
                  {a.dueDate ? ` · due ${new Date(a.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Overview>
  );
};

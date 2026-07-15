import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';
import { View } from '../../types';
import { exportToCSV } from '../../lib/exportUtils';

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

  // Extract teacher's assigned classes from their profile
  const assignedClasses = user?.assignedClasses || [];

  useEffect(() => {
    if (!user?.uid) {
      if (user === null) setLoading(false); // If definitely logged out, stop loading
      return;
    }

    // Fetch students assigned to ANY of the teacher's assigned classes
    const unsubStudents = firestoreService.getStudentsByGrades(assignedClasses, (data) => {
      setStudents(data);
      setLoading(false);
    });

    // Fetch assignments for the teacher's primary class
    const primaryClass = assignedClasses[0] || 'Unassigned';
    const unsubAssignments = firestoreService.getAssignments(primaryClass, setAssignments);

    // Fetch schedule for the primary class
    const unsubSchedule = firestoreService.getClassSchedule(primaryClass, setSchedule);

    // Fetch announcements filtered for teachers
    const unsubAnnouncements = firestoreService.getAnnouncements('teachers', setAnnouncements);

    // Fetch academic events filtered for teachers
    const unsubEvents = firestoreService.getEventsByAudience('teachers', setEvents);

    return () => {
      unsubStudents();
      unsubAssignments();
      unsubSchedule();
      unsubAnnouncements();
      unsubEvents();
    };
  }, [user, assignedClasses.join(',')]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 h-screen">
        <Icon name="sync" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  const pendingGradingCount = assignments.length; // Simplified logic

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Welcome back, {user?.name || 'Teacher'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
            <Icon name="calendar_today" className="text-[18px]" />
            Academic Year 2023-24 • Fall Semester
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => exportToCSV(students, 'student_roster.csv')}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
          >
            <Icon name="file_download" className="text-[20px]" />
            Export Summary
          </button>
          <button 
            onClick={() => onNavigate(View.TEACHER_ASSIGNMENTS)}
            className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-primary/25"
          >
            <Icon name="add" className="text-[20px]" />
            New Assignment
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Students', value: students.length.toString(), icon: 'groups', color: 'text-primary', bg: 'bg-blue-50 dark:bg-blue-900/30', badge: 'Active', badgeColor: 'text-green-600 bg-green-50 dark:bg-green-900/30' },
          { label: 'Pending Grades', value: pendingGradingCount.toString(), icon: 'pending_actions', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/30', badge: 'High', badgeColor: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' },
          { label: 'Sessions Scheduled', value: schedule.length.toString(), icon: 'schedule', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/30', badge: 'Today', badgeColor: 'text-slate-400 bg-slate-50 dark:bg-slate-800' },
          { label: 'Primary Grade', value: assignedClasses[0] || 'N/A', icon: 'assessment', color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/30', badge: 'Focus', badgeColor: 'text-purple-600 bg-purple-50 dark:bg-purple-900/30' },
        ].map((stat, i) => (
          <div key={i} className="bg-surface-light dark:bg-surface-dark p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className={`${stat.bg} p-2.5 rounded-xl ${stat.color}`}>
                <Icon name={stat.icon} className="text-[24px]" />
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${stat.badgeColor}`}>{stat.badge}</span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-surface-light dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="size-2 rounded-full bg-green-500 animate-pulse"></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Student Roster</h3>
                  <p className="text-xs text-slate-500">Live view of registered students</p>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {assignedClasses.map((grade: string) => {
                  const gradeStudents = students.filter(s => s.classId === grade);
                  if (gradeStudents.length === 0) return null;

                  return (
                    <div key={grade} className="p-4">
                      <div className="flex items-center gap-2 mb-4 px-2">
                        <span className="size-2 rounded-full bg-primary"></span>
                        <h4 className="text-xs font-black uppercase text-slate-500 tracking-widest">{grade}</h4>
                        <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-bold">{gradeStudents.length} Students</span>
                      </div>
                      <table className="w-full text-left">
                        <thead className="bg-slate-50/30 dark:bg-slate-800/30 text-[10px] uppercase font-bold text-slate-400">
                          <tr>
                            <th className="px-4 py-2">Student Name</th>
                            <th className="px-4 py-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                          {gradeStudents.map((student) => (
                            <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="size-8 rounded-full bg-slate-200 overflow-hidden shrink-0">
                                    <img src={`https://picsum.photos/seed/${student.id}/100`} alt="" referrerPolicy="no-referrer" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{student.name}</p>
                                    <p className="text-[10px] font-mono text-slate-400">{student.loginId}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button 
                                  onClick={() => onNavigate(View.TEACHER_REPORT_ENTRY)}
                                  className="text-primary text-xs font-black uppercase hover:underline"
                                >
                                  Enter Report
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
                {assignedClasses.length === 0 ? (
                   <div className="p-12 text-center bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-100 dark:border-amber-900/30">
                      <Icon name="warning" className="text-amber-500 text-4xl mb-4" />
                      <h4 className="font-bold text-slate-900 dark:text-white mb-2">No Grades Assigned</h4>
                      <p className="text-sm text-slate-500 max-w-xs mx-auto italic">
                        Your profile does not currently have any assigned grades. Please check your account settings or contact the administrator to be linked to a class.
                      </p>
                   </div>
                ) : students.length === 0 && (
                   <div className="p-12 text-center text-slate-400 text-sm italic">You have no students registered in your assigned grades ({assignedClasses.join(', ')}).</div>
                )}
              </div>
            </div>
          </section>

          <section className="bg-surface-light dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Active Assignments</h3>
              <button 
                onClick={() => onNavigate(View.TEACHER_ASSIGNMENTS)}
                className="text-sm text-primary font-semibold hover:underline"
              >
                Full List
              </button>
            </div>
            <div className="p-2 space-y-1">
              {assignments.length > 0 ? assignments.slice(0, 3).map((assignment, i) => (
                <div key={assignment.id || i} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer group">
                  <div className="flex items-center gap-4">
                    <div className={`size-11 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 dark:bg-opacity-20`}>
                      <Icon name="assignment" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{assignment.title}</h4>
                      <p className="text-xs text-slate-400">{assignment.subject} • Due {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'TBD'}</p>
                    </div>
                  </div>
                  <Icon name="chevron_right" className="text-slate-300 group-hover:text-primary transition-colors" />
                </div>
              )) : (
                <div className="p-8 text-center text-slate-400 text-sm italic">No assignments created yet.</div>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-8">
          <section className="bg-surface-light dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Today's Schedule</h3>
            <div className="relative space-y-6">
              {schedule.length > 0 ? (
                <>
                  <div className="absolute left-1.5 top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-800"></div>
                  {schedule.map((item, i) => {
                    const isCurrent = i === 0; // Simple logic for demo
                    return (
                      <div key={item.id || i} className={`relative pl-7 flex flex-col gap-1 ${item.status === 'done' ? 'opacity-50' : ''}`}>
                        <div className={`absolute left-0 top-1.5 size-3 rounded-full border-2 z-10 ${isCurrent ? 'border-primary bg-white dark:bg-slate-900 shadow-[0_0_8px_rgba(25,93,230,0.5)]' : 'border-slate-300 bg-white dark:bg-slate-900'}`}></div>
                        <span className={`text-[11px] font-bold ${isCurrent ? 'text-primary flex items-center gap-1' : 'text-slate-500'}`}>
                          {item.time}
                          {isCurrent && <span className="size-1.5 rounded-full bg-primary animate-ping"></span>}
                        </span>
                        <span className={`text-sm font-semibold ${item.status === 'done' ? 'text-slate-600 line-through' : 'text-slate-900 dark:text-white'}`}>{item.course} ({item.classId})</span>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="p-8 text-center text-slate-400 text-sm italic">No classes scheduled for today.</div>
              )}
            </div>
          </section>

          {/* Announcements Notice Board */}
          <section className="bg-surface-light dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <Icon name="campaign" className="text-emerald-500 text-[22px]" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Announcements</h3>
            </div>
            <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
              {announcements.map((ann, i) => (
                <div key={ann.id || i} className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] font-mono text-slate-400">{ann.createdAt ? new Date(ann.createdAt).toLocaleDateString() : 'Recent'}</span>
                    <span className="text-[8px] uppercase tracking-wider font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Notice</span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{ann.title}</h4>
                  <p className="text-[11px] text-slate-550 dark:text-slate-400 mt-1 whitespace-pre-wrap font-medium">{ann.content}</p>
                </div>
              ))}
              {announcements.length === 0 && (
                <div className="text-center py-6 text-slate-400 italic text-xs">No active notices published.</div>
              )}
            </div>
          </section>

          {/* Academic Calendar Events */}
          <section className="bg-surface-light dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <Icon name="event" className="text-primary text-[22px]" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Calendar Events</h3>
            </div>
            <div className="space-y-4">
              {events.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 3).map((evt, idx) => (
                <div key={evt.id || idx} className="flex gap-3 items-center group">
                  <div className="flex flex-col items-center justify-center size-10 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800 shrink-0">
                    <span className="text-[8px] font-black text-primary uppercase leading-none">{new Date(evt.date).toLocaleString('default', { month: 'short' })}</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white leading-none mt-1">{new Date(evt.date).getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-primary transition-colors">{evt.title}</h4>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase mt-0.5 ${
                      evt.type === 'holiday' ? 'bg-red-50 text-red-600' :
                      evt.type === 'exam' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'
                    }`}>
                      {evt.type}
                    </span>
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <div className="text-center py-6 text-slate-400 italic text-xs">No upcoming events scheduled.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';
import { View } from '../../types';
import { exportToCSV } from '../../lib/exportUtils';

interface ParentDashboardProps {
  onNavigate: (view: View) => void;
}

export const ParentDashboard: React.FC<ParentDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [children, setChildren] = useState<any[]>([]);
  const [activeChild, setActiveChild] = useState<any>(null);
  const [attendance, setAttendance] = useState<any>(null);
  const [fees, setFees] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;

    const unsubStudents = firestoreService.getStudentsForParent(user.uid, (data) => {
      setChildren(data);
      if (data.length > 0 && !activeChild) {
        setActiveChild(data[0]);
      }
      setLoading(false);
    });

    const unsubAnnouncements = firestoreService.getAnnouncements('parents', setAnnouncements);
    const unsubEvents = firestoreService.getEventsByAudience('parents', setEvents);

    return () => {
      unsubStudents();
      unsubAnnouncements();
      unsubEvents();
    };
  }, [user, activeChild]);

  const [assignments, setAssignments] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);

  useEffect(() => {
    if (!activeChild?.id) return;

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
  }, [activeChild]);

  const isUnpaid = (f: any) => f.status === 'pending' || f.status === 'overdue';
  const unpaidFeesCount = fees.filter(isUnpaid).length;
  const totalAmount = fees.filter(isUnpaid).reduce((sum, f) => sum + ((parseFloat(f.totalAmount) || 0) - (parseFloat(f.amountPaid) || 0)), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Icon name="sync" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-8">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Hello, {user?.name || 'Parent'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
            <Icon name="verified_user" className="text-emerald-500 text-[18px]" />
            Your account is verified • Term 2 Academic Year
          </p>
        </div>

        {/* Child Selector */}
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm self-start">
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setActiveChild(child)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                activeChild?.id === child.id 
                  ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                  : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className="size-6 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <img src={`https://picsum.photos/seed/${child.id}/100`} alt={child.name} referrerPolicy="no-referrer" />
              </div>
              {child.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Quick Stats */}
        <div className="bg-gradient-to-br from-primary to-blue-700 p-6 rounded-2xl shadow-xl shadow-primary/20 text-white relative overflow-hidden group">
          <Icon name="payments" className="absolute -right-4 -bottom-4 text-white/10 text-[120px] rotate-12 transition-transform group-hover:rotate-0" />
          <p className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1">Unpaid Fees</p>
          <p className="text-4xl font-black mb-4">GH₵{totalAmount.toLocaleString()}</p>
          <div className="flex items-center gap-2 text-[10px] bg-white/20 w-fit px-2 py-0.5 rounded-full font-bold uppercase">
             <Icon name="priority_high" className="text-[12px]" /> {unpaidFeesCount} Invoices Pending
          </div>
          <button
            onClick={() => onNavigate(View.PARENT_FEES)}
            className="w-full mt-6 py-2.5 bg-white text-primary rounded-xl text-sm font-bold hover:bg-blue-50 transition-colors"
          >
            View Fee Statement
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
          <Icon name="calendar_month" className="absolute -right-4 -bottom-4 text-slate-100 dark:text-slate-900 text-[120px] rotate-12" />
          <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Attendance Rate</p>
          <p className="text-4xl font-black text-slate-900 dark:text-white mb-4">{attendance?.rate ? Math.round(attendance.rate) : '0'}%</p>
          <div className="flex items-center gap-2 text-[10px] bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 w-fit px-2 py-0.5 rounded-full font-bold uppercase">
             <Icon name="check_circle" className="text-[12px]" /> Excellent Status
          </div>
          <div className="mt-6 flex gap-1">
             {[...Array(5)].map((_, i) => (
                <div key={i} className={`h-1.5 flex-1 rounded-full ${i < 4 ? 'bg-primary' : 'bg-slate-100 dark:bg-slate-700'}`}></div>
             ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
          <Icon name="military_tech" className="absolute -right-4 -bottom-4 text-slate-100 dark:text-slate-900 text-[120px] rotate-12" />
          <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Latest Academic Grade</p>
          <p className="text-4xl font-black text-slate-900 dark:text-white mb-4">{reports[0]?.grade || 'N/A'}</p>
          <div className="flex items-center gap-2 text-[10px] bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 w-fit px-2 py-0.5 rounded-full font-bold uppercase">
             <Icon name="trending_up" className="text-[12px]" /> Current Term Grade
          </div>
          <p className="mt-6 text-xs text-slate-400 font-medium tracking-tight">Updated via latest Registrar records</p>
        </div>
      </div>

      {/* Announcements & Academic Calendar Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Notice Board */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col p-6">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-100 dark:border-slate-700 mb-4">
            <Icon name="campaign" className="text-emerald-500 text-[24px]" />
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">School Announcements</h3>
          </div>
          <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
            {announcements.map((ann, i) => (
              <div key={ann.id || i} className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-mono text-slate-400">{ann.createdAt ? new Date(ann.createdAt).toLocaleDateString() : 'Recent'}</span>
                  <span className="text-[9px] uppercase tracking-wider font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Official Notice</span>
                </div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{ann.title}</h4>
                <p className="text-xs text-slate-505 dark:text-slate-400 mt-2 whitespace-pre-wrap leading-relaxed font-medium">{ann.content}</p>
              </div>
            ))}
            {announcements.length === 0 && (
              <div className="text-center py-10 text-slate-400 italic text-sm">No new school announcements at this time.</div>
            )}
          </div>
        </div>

        {/* Academic Calendar Events */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col p-6">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-100 dark:border-slate-700 mb-4">
            <Icon name="event" className="text-primary text-[24px]" />
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Upcoming Events</h3>
          </div>
          <div className="space-y-4 flex-grow">
            {events.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 4).map((evt, idx) => (
              <div key={evt.id || idx} className="flex gap-4 items-center group">
                <div className="flex flex-col items-center justify-center size-12 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shrink-0">
                  <span className="text-[10px] font-black text-primary uppercase leading-none">{new Date(evt.date).toLocaleString('default', { month: 'short' })}</span>
                  <span className="text-lg font-black text-slate-900 dark:text-white leading-none mt-1">{new Date(evt.date).getDate()}</span>
                </div>
                <div className="flex-grow min-w-0">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-primary transition-colors">{evt.title}</h4>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase mt-1 ${
                    evt.type === 'holiday' ? 'bg-red-50 text-red-600' :
                    evt.type === 'exam' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'
                  }`}>
                    {evt.type}
                  </span>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <div className="text-center py-10 text-slate-400 italic text-sm">No upcoming school events scheduled.</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
          <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white">Upcoming Assignments</h3>
            <button 
              onClick={() => onNavigate(View.PARENT_ASSIGNMENTS)}
              className="text-primary text-xs font-bold hover:underline"
            >
              View All
            </button>
          </div>
          <div className="p-5 flex flex-col gap-4">
            {assignments.length > 0 ? assignments.slice(0, 3).map((task, i) => (
              <div key={task.id || i} className="flex items-start gap-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-transparent hover:border-primary/20 transition-all cursor-pointer group">
                <div className={`size-10 rounded-lg bg-blue-100 text-blue-600 dark:bg-opacity-20 flex items-center justify-center flex-shrink-0`}>
                  <Icon name="assignment" />
                </div>
                <div className="flex-grow text-xs">
                  <div className="flex justify-between">
                    <p className={`font-bold text-blue-600 uppercase tracking-wider`}>{task.subject}</p>
                    <span className={`font-bold text-slate-400 px-1.5 py-0.5 rounded uppercase`}>Due {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'TBD'}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{task.title}</p>
                </div>
              </div>
            )) : (
              <p className="text-center py-8 text-slate-400 text-sm italic">No upcoming tasks scheduled.</p>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
          <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white">Fee Status (Term 2)</h3>
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded">
              {unpaidFeesCount > 0 ? 'PENDING BALANCE' : 'PAID IN FULL'}
            </span>
          </div>
          <div className="p-6">
            <div className="flex justify-between items-end mb-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Unpaid Balance</p>
                <p className="text-2xl font-bold text-amber-600">GH₵{totalAmount.toLocaleString()}</p>
              </div>
            </div>
            <div className="space-y-4">
              {fees.slice(0, 2).map((fee, i) => (
                <div key={fee.id || i} className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`size-8 rounded-full flex items-center justify-center ${fee.status === 'paid' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                      <Icon name={fee.status === 'paid' ? 'check' : 'schedule'} className="text-sm" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">{fee.type || 'Tuition Fee'}</p>
                      <p className="text-[10px] text-slate-400">{fee.dueDate ? `Due ${new Date(fee.dueDate).toLocaleDateString()}` : 'No date'}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">GH₵{(parseFloat(fee.totalAmount) || 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-bold text-slate-900 dark:text-white">Recent Reports</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-bold">Document Name</th>
                <th className="px-6 py-4 font-bold">Term Grade</th>
                <th className="px-6 py-4 font-bold">Total Score</th>
                <th className="px-6 py-4 font-bold">Status</th>
                <th className="px-6 py-4 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {reports.length > 0 ? reports.map((report, i) => (
                <tr key={report.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Icon name="picture_as_pdf" className="text-red-500" />
                      <span className="text-sm font-medium">{report.term} Progress Report</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold">{report.grade}</td>
                  <td className="px-6 py-4 text-sm font-black text-primary">{report.totalScore ? `${report.totalScore} / 100` : '--'}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-[10px] font-bold bg-green-100 text-green-700 rounded-full uppercase">{report.status}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => exportToCSV([report], `${activeChild.name}_report.csv`)}
                      className="text-primary hover:text-primary/70 font-bold text-sm"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm italic">No reports available as of yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

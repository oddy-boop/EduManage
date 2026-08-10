import React, { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';

export const TeacherAttendance: React.FC = () => {
  const { user, signOut } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  // Use the teacher's first assigned class as default
  const activeClassId = user?.assignedClasses?.[0] || 'Unassigned';

  useEffect(() => {
    if (!user?.uid || activeClassId === 'Unassigned') {
        if (activeClassId === 'Unassigned') setLoading(false);
        return;
    }

    const unsubAttendance = firestoreService.getAttendanceForClass(activeClassId, (data) => {
      setAttendance(data);
    });

    const unsubStudents = firestoreService.getStudentsForClass(activeClassId, (data) => {
      setStudents(data);
      setLoading(false);
    });
    
    return () => {
      unsubAttendance();
      unsubStudents();
    };
  }, [user, activeClassId]);

  const handleMark = async (studentId: string, status: string) => {
    try {
      const student = students.find(s => s.id === studentId);
      await firestoreService.markAttendance({
        studentId,
        parentId: student?.parentId,
        classId: activeClassId, 
        date: new Date().toISOString().split('T')[0],
        status
      });
    } catch (error) {
      console.error("Attendance failed", error);
    }
  };

  const handleMarkAllPresent = async () => {
    const today = new Date().toISOString().split('T')[0];
    const promises = students.map(s => firestoreService.markAttendance({
      studentId: s.id,
      parentId: s.parentId,
      classId: activeClassId,
      date: today,
      status: 'present'
    }));
    await Promise.all(promises);
    alert(`Marked ${students.length} students as present.`);
  };

  const today = new Date().toISOString().split('T')[0];
  const recordedToday = attendance.filter(a => a.date === today).length;
  const visibleStudents = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  const handleFinalize = async () => {
    const unrecorded = students.filter(s => !attendance.find(a => a.studentId === s.id && a.date === today));
    if (unrecorded.length === 0) {
      alert("All students are already recorded for today.");
      return;
    }
    if (!window.confirm(`${unrecorded.length} student(s) have no attendance recorded today. Mark them absent and finalize?`)) return;
    try {
      setFinalizing(true);
      await Promise.all(unrecorded.map(s => firestoreService.markAttendance({
        studentId: s.id,
        parentId: s.parentId,
        classId: activeClassId,
        date: today,
        status: 'absent'
      })));
      alert("Attendance finalized for today.");
    } catch (error) {
      alert("Failed to finalize attendance.");
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark">
      {/* Header */}
      <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
        <div>
           <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
             <span className="font-bold text-primary">EduManage</span>
             <span>/</span>
             <span className="font-medium">Attendance Tracking</span>
           </div>
           <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Student Attendance</h1>
        </div>
        
        <div className="flex items-center gap-6">
            <div className="text-right">
                <p className="text-xs font-bold uppercase text-slate-500">Current Session</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{activeClassId} - Academic Session</p>
            </div>
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700"></div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <Icon name="calendar_today" className="text-slate-500 text-sm" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
            </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-6 lg:p-8 max-w-6xl mx-auto w-full">
         
         {/* Stats Cards */}
         <div className="grid grid-cols-4 gap-4 mb-8 shrink-0">
             {[
                 { label: 'TOTAL CLASS', value: students.length.toString(), icon: 'groups', color: 'text-primary bg-blue-50' },
                 { label: 'PRESENT TODAY', value: attendance.filter(a => a.status === 'present').length.toString(), icon: 'check_circle', color: 'text-green-600 bg-green-50' },
                 { label: 'ABSENT TODAY', value: attendance.filter(a => a.status === 'absent').length.toString(), icon: 'cancel', color: 'text-red-500 bg-red-50' },
                 { label: 'LATE ARRIVAL', value: attendance.filter(a => a.status === 'late').length.toString(), icon: 'schedule', color: 'text-orange-500 bg-orange-50' },
             ].map((stat, i) => (
                 <div key={i} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
                     <div className={`size-12 rounded-lg flex items-center justify-center ${stat.color} dark:bg-opacity-20`}>
                         <Icon name={stat.icon} className="text-2xl" />
                     </div>
                     <div>
                         <p className="text-xs font-bold text-slate-500 uppercase">{stat.label}</p>
                         <p className="text-2xl font-black text-slate-900 dark:text-white">{stat.value}</p>
                     </div>
                 </div>
             ))}
         </div>

         {/* Roll Call List Header */}
         <div className="flex justify-between items-end mb-4 shrink-0">
             <div>
                 <h3 className="text-lg font-bold text-slate-900 dark:text-white">Roll Call List</h3>
                 <p className="text-xs text-slate-500">Mark attendance for today's session</p>
             </div>
             <div className="flex gap-3">
                 <div className="relative">
                     <Icon name="search" className="absolute left-3 top-2.5 text-slate-400 text-sm" />
                     <input
                       type="text"
                       value={search}
                       onChange={(e) => setSearch(e.target.value)}
                       placeholder="Search students..."
                       className="pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm w-64"
                     />
                 </div>
                 <button 
                  onClick={handleMarkAllPresent}
                  className="text-primary text-sm font-bold hover:underline px-2"
                >
                  Mark All Present
                </button>
             </div>
         </div>

         {/* List Container */}
         <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
             <div className="grid grid-cols-12 gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold uppercase text-slate-500">
                 <div className="col-span-4 pl-2">Profile</div>
                 <div className="col-span-3">Full Name & Student ID</div>
                 <div className="col-span-4 text-center">Attendance Status</div>
                 <div className="col-span-1 text-right pr-2">Remarks</div>
             </div>
             
             <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                 {visibleStudents.map((student, i) => {
                     const today = new Date().toISOString().split('T')[0];
                     const record = attendance.find(a => a.studentId === student.id && a.date === today);
                     const currentStatus = record?.status;

                     return (
                     <div key={student.id || i} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                         <div className="col-span-4 pl-2">
                             <div className="size-10 rounded-full bg-cover bg-center border border-slate-200" style={{ backgroundImage: `url(https://picsum.photos/seed/${student.id}/100)` }}></div>
                         </div>
                         <div className="col-span-3">
                             <p className="text-sm font-bold text-slate-900 dark:text-white">{student.name}</p>
                             <p className="text-[10px] text-slate-400 font-mono">STUDENT ID: {student.id?.slice(0, 8)}</p>
                         </div>
                         <div className="col-span-4 flex justify-center">
                             <div className="inline-flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1 gap-1">
                                 <button 
                                   onClick={() => handleMark(student.id, 'present')}
                                   className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${currentStatus === 'present' ? 'bg-green-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                                 >
                                     {currentStatus === 'present' && <Icon name="check" className="text-xs" />} Present
                                 </button>
                                 <button 
                                   onClick={() => handleMark(student.id, 'absent')}
                                   className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${currentStatus === 'absent' ? 'bg-red-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                                 >
                                     {currentStatus === 'absent' && <Icon name="close" className="text-xs" />} Absent
                                 </button>
                                 <button 
                                   onClick={() => handleMark(student.id, 'late')}
                                   className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${currentStatus === 'late' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                                 >
                                     Late
                                 </button>
                             </div>
                         </div>
                         <div className="col-span-1 text-right pr-2">
                             {currentStatus && <Icon name="check_circle" className="text-emerald-500 text-sm" />}
                         </div>
                     </div>
                     );
                 })}
                 {visibleStudents.length === 0 && (
                    <div className="p-12 text-center text-slate-400 italic">
                      {students.length === 0 ? 'No students found for this class.' : 'No students match your search.'}
                    </div>
                 )}
             </div>

             <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center text-xs text-slate-500 uppercase font-bold tracking-tighter">
                 <span>SHOWING {visibleStudents.length} OF {students.length} STUDENTS</span>
             </div>
         </div>
      </div>
      
      {/* Footer Actions */}
      <div className="px-8 py-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
             <div className="size-8 rounded-full bg-cover bg-center" style={{ backgroundImage: `url(${user?.avatar || 'https://picsum.photos/seed/teacher/200'})` }}></div>
             <div>
                <p className="text-xs font-bold">{user?.name || 'Teacher'}</p>
                <button onClick={signOut} className="text-[10px] text-red-500 hover:underline flex items-center gap-1"><Icon name="logout" className="text-[10px]" /> Sign Out</button>
             </div>
          </div>
          
          <div className="flex items-center gap-2">
              <Icon name="check_circle" className="text-green-500" />
              <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">Submission Ready</p>
                  <p className="text-[10px] text-slate-400">{recordedToday}/{students.length} students recorded today.</p>
              </div>
          </div>
          
          <div className="flex gap-3">
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className="px-6 py-2.5 bg-primary text-white rounded-lg font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-50"
              >
                  <Icon name={finalizing ? 'sync' : 'send'} className={`text-sm ${finalizing ? 'animate-spin' : ''}`} />
                  {finalizing ? 'Finalizing...' : 'Finalize & Mark Remaining Absent'}
              </button>
          </div>
      </div>
    </div>
  );
};

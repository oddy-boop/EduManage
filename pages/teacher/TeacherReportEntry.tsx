import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';

export const TeacherReportEntry: React.FC = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [grades, setGrades] = useState<Record<string, { ca: number, exam: number, remarks: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeClass, setActiveClass] = useState('10-B'); // Default class

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = firestoreService.getStudentsForClass(activeClass, (data) => {
      setStudents(data);
      // Initialize grades state for new students
      const initialGrades: Record<string, any> = {};
      data.forEach(s => {
        initialGrades[s.id] = { ca: 0, exam: 0, remarks: '' };
      });
      setGrades(prev => ({ ...initialGrades, ...prev }));
      setLoading(false);
    });
    return () => unsub();
  }, [user, activeClass]);

  const handleGradeChange = (studentId: string, field: 'ca' | 'exam' | 'remarks', value: any) => {
    setGrades(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: field === 'remarks' ? value : Number(value) || 0
      }
    }));
  };

  const calculateGrade = (total: number) => {
    if (total >= 90) return 'A+';
    if (total >= 80) return 'A';
    if (total >= 70) return 'B';
    if (total >= 60) return 'C';
    if (total >= 50) return 'D';
    return 'F';
  };

  const submitToAdmin = async () => {
    try {
      setSaving(true);
      const submissionPromises = students.map(student => {
        const studentGrades = grades[student.id];
        const total = (studentGrades?.ca || 0) + (studentGrades?.exam || 0);
        return firestoreService.createReport({
          studentId: student.id,
          parentId: student.parentId,
          term: 'Fall 2023',
          totalScore: total,
          grade: calculateGrade(total),
          status: 'pending', // Send to admin for review
          comments: studentGrades?.remarks || '',
          session: '2023-24',
          grades: { ca: studentGrades?.ca || 0, exam: studentGrades?.exam || 0 }
        });
      });
      await Promise.all(submissionPromises);
      alert("Reports submitted successfully for admin review.");
    } catch (error) {
      console.error("Submission failed:", error);
      alert("Failed to submit reports. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Icon name="sync" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark">
      {/* Header */}
      <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Portal</span>
            <span>/</span>
            <span className="font-medium text-primary">Semester Report Entry</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Report Entry</h1>
          <p className="text-xs text-slate-500">Grade input for Continuous Assessment(40%) and Exam(60%)</p>
        </div>
        <div className="flex gap-3">
           <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              {['10-B', '11-A', '12-C'].map(cls => (
                <button 
                  key={cls}
                  onClick={() => setActiveClass(cls)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                    activeClass === cls ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500'
                  }`}
                >
                  {cls}
                </button>
              ))}
           </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 px-6 py-6 flex flex-col">
         <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex-1 flex flex-col overflow-hidden">
             <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/20">
                 <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                     <Icon name="table_chart" className="text-primary" /> Grade Entry Sheet
                 </h3>
             </div>
             
             <div className="flex-1 overflow-auto">
                 <table className="w-full text-left border-collapse">
                     <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                         <tr>
                             <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase w-48">Student Name</th>
                             <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase w-32 text-center">CA (40)</th>
                             <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase w-32 text-center">Exam (60)</th>
                             <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase w-24 text-center">Total</th>
                             <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase w-24 text-center">Grade</th>
                             <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Remarks</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                         {students.map((student) => {
                             const studentGrades = grades[student.id] || { ca: 0, exam: 0, remarks: '' };
                             const total = studentGrades.ca + studentGrades.exam;
                             return (
                               <tr key={student.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 group">
                                   <td className="px-6 py-4">
                                       <div className="flex items-center gap-3">
                                           <div className="size-8 rounded-full bg-slate-200 overflow-hidden shrink-0">
                                               <img src={`https://picsum.photos/seed/${student.id}/100`} alt="" />
                                           </div>
                                           <div className="flex flex-col">
                                              <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{student.name}</span>
                                              <span className="text-[10px] text-slate-400 font-mono uppercase">{student.id}</span>
                                           </div>
                                       </div>
                                   </td>
                                   <td className="px-6 py-3">
                                       <input 
                                         type="number" 
                                         max={40}
                                         value={studentGrades.ca} 
                                         onChange={(e) => handleGradeChange(student.id, 'ca', e.target.value)}
                                         className={`w-full text-center p-2 rounded border text-sm font-bold border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900`} 
                                       />
                                   </td>
                                   <td className="px-6 py-3">
                                       <input 
                                         type="number" 
                                         max={60}
                                         value={studentGrades.exam} 
                                         onChange={(e) => handleGradeChange(student.id, 'exam', e.target.value)}
                                         className="w-full text-center p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold" 
                                       />
                                   </td>
                                   <td className="px-6 py-4 text-center font-black text-slate-900 dark:text-white">{total}</td>
                                   <td className="px-6 py-4 text-center">
                                       <span className={`inline-block w-8 text-center text-sm font-bold rounded ${total >= 70 ? 'text-green-600 bg-green-50' : 'text-slate-600 bg-slate-100'}`}>
                                         {calculateGrade(total)}
                                       </span>
                                   </td>
                                   <td className="px-6 py-3">
                                       <input 
                                         type="text" 
                                         placeholder="Add remark..." 
                                         value={studentGrades.remarks}
                                         onChange={(e) => handleGradeChange(student.id, 'remarks', e.target.value)}
                                         className="w-full text-sm p-2 bg-transparent border-b border-dashed border-slate-300 focus:border-primary outline-none" 
                                       />
                                   </td>
                               </tr>
                             );
                         })}
                     </tbody>
                 </table>
             </div>
         </div>
      </div>

      <div className="px-8 py-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4 text-xs text-slate-400 mr-auto">
              <Icon name="history" /> Student data synced from roster.
          </div>
          <div className="flex gap-3">
              <button 
                disabled={saving}
                onClick={submitToAdmin}
                className="px-6 py-2.5 bg-primary text-white rounded-lg font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-50"
              >
                  {saving ? 'Submitting...' : 'Send to Admin'} <Icon name={saving ? 'sync' : 'send'} className={`text-sm ${saving ? 'animate-spin' : ''}`} />
              </button>
          </div>
      </div>
    </div>
  );
};

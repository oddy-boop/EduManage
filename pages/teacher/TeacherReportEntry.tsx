import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';

interface CaScore {
  caScore: number;
  entryCount: number;
}

export const TeacherReportEntry: React.FC = () => {
  const { user } = useAuth();
  const assignedClasses = user?.assignedClasses && user.assignedClasses.length > 0 ? user.assignedClasses : ['Unassigned'];
  const [students, setStudents] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [grades, setGrades] = useState<Record<string, { exam: number, remarks: string }>>({});
  const [caScores, setCaScores] = useState<Record<string, CaScore>>({});
  const [existingReports, setExistingReports] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeClass, setActiveClass] = useState(assignedClasses[0]);
  const [currentTerm, setCurrentTerm] = useState('Term 2');

  // A Teacher's assignedCourses stores subject codes (e.g. "MATH101"); the report keys on the
  // human-readable subject name (e.g. "Mathematics"), matching how reports.grades is keyed elsewhere.
  const mySubjects = useMemo(() => {
    const codes: string[] = user?.assignedCourses || [];
    return codes.map(code => courses.find(c => c.code === code)?.name || code).filter(Boolean);
  }, [user, courses]);
  const [activeSubject, setActiveSubject] = useState('');

  useEffect(() => {
    if (!activeSubject && mySubjects.length > 0) setActiveSubject(mySubjects[0]);
  }, [mySubjects, activeSubject]);

  useEffect(() => {
    firestoreService.getSystemSettings()
      .then(settings => { if (settings?.current_term) setCurrentTerm(settings.current_term); })
      .catch(() => {});
    firestoreService.getCourses((data) => setCourses(data));
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = firestoreService.getStudentsForClass(activeClass, (data) => {
      setStudents(data);
      setLoading(false);
    });
    return () => unsub();
  }, [user, activeClass]);

  // Load this teacher's existing subject_reports for this class/subject/term — prefills the
  // exam score/remarks already saved, and tells us which rows are locked (already submitted).
  useEffect(() => {
    if (!activeClass || !activeSubject || !currentTerm) return;
    const unsub = firestoreService.getSubjectReports({ classId: activeClass, subject: activeSubject, term: currentTerm }, (data) => {
      const map: Record<string, any> = {};
      const gradeMap: Record<string, any> = {};
      data.forEach((r: any) => {
        map[r.studentId] = r;
        gradeMap[r.studentId] = { exam: r.examScore, remarks: r.remarks || '' };
      });
      setExistingReports(map);
      setGrades(prev => {
        const next = { ...prev };
        students.forEach(s => {
          next[s.id] = gradeMap[s.id] || { exam: 0, remarks: '' };
        });
        return next;
      });
    });
    return () => unsub();
  }, [activeClass, activeSubject, currentTerm, students]);

  // CA score is auto-computed from the Assessment Book, not typed in here.
  useEffect(() => {
    if (students.length === 0) return;
    let cancelled = false;
    Promise.all(students.map(s =>
      firestoreService.getAssessmentSummary(s.id, activeClass, currentTerm, 40)
        .then(summary => [s.id, summary] as const)
        .catch(() => [s.id, { caScore: 0, entryCount: 0 }] as const)
    )).then(results => {
      if (cancelled) return;
      const map: Record<string, CaScore> = {};
      results.forEach(([id, summary]) => { map[id] = summary; });
      setCaScores(map);
    });
    return () => { cancelled = true; };
  }, [students, activeClass, currentTerm]);

  const isLocked = (studentId: string) => existingReports[studentId]?.status === 'submitted';

  const handleGradeChange = (studentId: string, field: 'exam' | 'remarks', value: any) => {
    if (isLocked(studentId)) return;
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

  const saveDraft = async () => {
    try {
      setSaving(true);
      await Promise.all(students.filter(s => !isLocked(s.id)).map(student => {
        const studentGrades = grades[student.id] || { exam: 0, remarks: '' };
        return firestoreService.saveSubjectReport({
          studentId: student.id,
          classId: activeClass,
          term: currentTerm,
          subject: activeSubject,
          caScore: caScores[student.id]?.caScore || 0,
          examScore: studentGrades.exam,
          remarks: studentGrades.remarks
        });
      }));
      alert("Draft saved.");
    } catch (error) {
      console.error("Save failed:", error);
      alert("Failed to save draft.");
    } finally {
      setSaving(false);
    }
  };

  const submitToClassTeacher = async () => {
    if (!window.confirm(`Submit ${activeSubject} scores for ${activeClass} (${currentTerm})? You won't be able to edit them afterward unless an Admin reopens them.`)) return;
    try {
      setSubmitting(true);
      // Save the latest values first, then lock the whole batch.
      await Promise.all(students.filter(s => !isLocked(s.id)).map(student => {
        const studentGrades = grades[student.id] || { exam: 0, remarks: '' };
        return firestoreService.saveSubjectReport({
          studentId: student.id,
          classId: activeClass,
          term: currentTerm,
          subject: activeSubject,
          caScore: caScores[student.id]?.caScore || 0,
          examScore: studentGrades.exam,
          remarks: studentGrades.remarks
        });
      }));
      await firestoreService.submitSubjectReports(activeClass, activeSubject, currentTerm);
      alert(`${activeSubject} scores submitted to the Class Teacher.`);
    } catch (error) {
      console.error("Submission failed:", error);
      alert("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const allLocked = students.length > 0 && students.every(s => isLocked(s.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Icon name="sync" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  if (mySubjects.length === 0) {
    return (
      <div className="p-12 text-center text-slate-400">
        <Icon name="menu_book" className="text-6xl mb-4 mx-auto opacity-30" />
        <p className="italic">You have no subjects assigned. Ask your Admin to assign courses to your profile under Registration.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark">
      {/* Header */}
      <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Portal</span>
            <span>/</span>
            <span className="font-medium text-primary">Subject Report Entry</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Report Entry</h1>
          <p className="text-xs text-slate-500">CA (40%) is auto-computed from the Assessment Book &bull; enter Exam (60%) below &bull; {currentTerm}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            {assignedClasses.map(cls => (
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
          <select
            value={activeSubject}
            onChange={(e) => setActiveSubject(e.target.value)}
            className="px-3 py-2 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:ring-primary"
          >
            {mySubjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {allLocked && (
        <div className="mx-8 mt-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/40 p-3 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
          <Icon name="lock" className="text-sm" /> {activeSubject} has been submitted to the Class Teacher for {activeClass} ({currentTerm}). Ask an Admin to reopen it if corrections are needed.
        </div>
      )}

      {/* Main Table */}
      <div className="flex-1 px-6 py-6 flex flex-col">
         <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex-1 flex flex-col overflow-hidden">
             <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/20">
                 <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                     <Icon name="table_chart" className="text-primary" /> Grade Entry Sheet &mdash; {activeSubject}
                 </h3>
             </div>

             <div className="flex-1 overflow-auto">
                 <table className="w-full text-left border-collapse">
                     <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                         <tr>
                             <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase w-48">Student Name</th>
                             <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase w-32 text-center">CA (40, auto)</th>
                             <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase w-32 text-center">Exam (60)</th>
                             <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase w-24 text-center">Total</th>
                             <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase w-24 text-center">Grade</th>
                             <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Remarks</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                         {students.map((student) => {
                             const studentGrades = grades[student.id] || { exam: 0, remarks: '' };
                             const ca = caScores[student.id];
                             const caValue = ca?.caScore || 0;
                             const total = caValue + studentGrades.exam;
                             const locked = isLocked(student.id);
                             return (
                               <tr key={student.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 group ${locked ? 'opacity-60' : ''}`}>
                                   <td className="px-6 py-4">
                                       <div className="flex items-center gap-3">
                                           <div className="size-8 rounded-full bg-slate-200 overflow-hidden shrink-0">
                                               <img src={`https://picsum.photos/seed/${student.id}/100`} alt="" />
                                           </div>
                                           <div className="flex flex-col">
                                              <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{student.name}</span>
                                              <span className="text-[10px] text-slate-400 font-mono uppercase flex items-center gap-1">
                                                {student.id}
                                                {locked && <Icon name="lock" className="text-[10px]" />}
                                              </span>
                                           </div>
                                       </div>
                                   </td>
                                   <td className="px-6 py-3 text-center">
                                       <div className="inline-flex flex-col items-center">
                                         <span className="text-sm font-bold text-slate-900 dark:text-white">{caValue.toFixed(1)}</span>
                                         <span className="text-[9px] text-slate-400 uppercase font-bold">
                                           {ca && ca.entryCount > 0 ? `${ca.entryCount} entries` : 'No entries'}
                                         </span>
                                       </div>
                                   </td>
                                   <td className="px-6 py-3">
                                       <input
                                         type="number"
                                         max={60}
                                         disabled={locked}
                                         value={studentGrades.exam}
                                         onChange={(e) => handleGradeChange(student.id, 'exam', e.target.value)}
                                         className="w-full text-center p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold disabled:cursor-not-allowed"
                                       />
                                   </td>
                                   <td className="px-6 py-4 text-center font-black text-slate-900 dark:text-white">{total.toFixed(1)}</td>
                                   <td className="px-6 py-4 text-center">
                                       <span className={`inline-block w-8 text-center text-sm font-bold rounded ${total >= 70 ? 'text-green-600 bg-green-50' : 'text-slate-600 bg-slate-100'}`}>
                                         {calculateGrade(total)}
                                       </span>
                                   </td>
                                   <td className="px-6 py-3">
                                       <input
                                         type="text"
                                         placeholder="Add remark..."
                                         disabled={locked}
                                         value={studentGrades.remarks}
                                         onChange={(e) => handleGradeChange(student.id, 'remarks', e.target.value)}
                                         className="w-full text-sm p-2 bg-transparent border-b border-dashed border-slate-300 focus:border-primary outline-none disabled:cursor-not-allowed"
                                       />
                                   </td>
                               </tr>
                             );
                         })}
                         {students.length === 0 && (
                           <tr>
                             <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">No students found for this class.</td>
                           </tr>
                         )}
                     </tbody>
                 </table>
             </div>
         </div>
      </div>

      <div className="px-8 py-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4 text-xs text-slate-400 mr-auto">
              <Icon name="history" /> This subject's scores merge with every other subject teacher's under the Class Teacher's review.
          </div>
          <div className="flex gap-3">
              <button
                disabled={saving || submitting || allLocked}
                onClick={saveDraft}
                className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-bold hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50"
              >
                  {saving ? 'Saving...' : 'Save Draft'} <Icon name={saving ? 'sync' : 'save'} className={`text-sm ${saving ? 'animate-spin' : ''}`} />
              </button>
              <button
                disabled={saving || submitting || allLocked || students.length === 0}
                onClick={submitToClassTeacher}
                className="px-6 py-2.5 bg-primary text-white rounded-lg font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-50"
              >
                  {submitting ? 'Submitting...' : 'Submit to Class Teacher'} <Icon name={submitting ? 'sync' : 'send'} className={`text-sm ${submitting ? 'animate-spin' : ''}`} />
              </button>
          </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';
import { SubjectMergeStatus, MergedStudentSubjects } from '../../types';

export const TeacherClassReview: React.FC = () => {
  const { user } = useAuth();
  const [myClasses, setMyClasses] = useState<any[]>([]);
  const [activeClass, setActiveClass] = useState('');
  const [currentTerm, setCurrentTerm] = useState('Term 2');
  const [mergeStatus, setMergeStatus] = useState<SubjectMergeStatus | null>(null);
  const [merged, setMerged] = useState<MergedStudentSubjects[]>([]);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    firestoreService.getSystemSettings()
      .then(settings => { if (settings?.current_term) setCurrentTerm(settings.current_term); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = firestoreService.getGrades((data) => {
      const mine = data.filter((g: any) => g.classTeacherId === user.uid);
      setMyClasses(mine);
      if (mine.length > 0 && !activeClass) setActiveClass(mine[0].name);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!activeClass || !currentTerm) return;
    firestoreService.getSubjectMergeStatus(activeClass, currentTerm)
      .then(setMergeStatus)
      .catch(() => setMergeStatus(null));
  }, [activeClass, currentTerm]);

  useEffect(() => {
    if (!activeClass || !currentTerm) return;
    const unsub = firestoreService.getMergedSubjectReports(activeClass, currentTerm, (data) => setMerged(data));
    return () => unsub();
  }, [activeClass, currentTerm]);

  const overallFor = (student: MergedStudentSubjects) => {
    if (student.subjects.length === 0) return null;
    const total = student.subjects.reduce((sum, s) => sum + s.caScore + s.examScore, 0);
    return Math.round((total / student.subjects.length) * 100) / 100;
  };

  const handleFinalize = async () => {
    if (!mergeStatus?.allComplete) {
      alert("All subjects must be submitted before you can finalize this class's reports.");
      return;
    }
    if (!window.confirm(`Finalize and submit ${activeClass}'s report cards (${currentTerm}) for Admin approval?`)) return;
    try {
      setFinalizing(true);
      const result = await firestoreService.finalizeClassReports(activeClass, currentTerm, remarks);
      alert(`${result.finalizedCount} report card(s) submitted for Admin approval.`);
    } catch (error) {
      console.error("Finalize failed:", error);
      alert(error instanceof Error ? error.message : "Failed to finalize reports.");
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Icon name="sync" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  if (myClasses.length === 0) {
    return (
      <div className="p-12 text-center text-slate-400 max-w-lg mx-auto">
        <Icon name="groups" className="text-6xl mb-4 mx-auto opacity-30" />
        <h2 className="text-lg font-bold text-slate-600 dark:text-slate-300 mb-2">Not a Class Teacher</h2>
        <p className="italic text-sm">You haven't been designated as a Class Teacher for any class. An Admin can assign this under Settings &rarr; Grade Levels.</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span className="font-bold text-slate-900 dark:text-white">Teacher Portal</span>
            <span>/</span>
            <span className="font-medium text-primary">Class Teacher Review</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Merge &amp; Submit Report Cards</h1>
          <p className="text-slate-500 text-sm mt-1">Every subject teacher's scores for {activeClass || 'this class'} merge here &mdash; add your remarks and submit for Admin approval.</p>
        </div>
        {myClasses.length > 1 && (
          <select
            value={activeClass}
            onChange={(e) => setActiveClass(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-primary"
          >
            {myClasses.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        )}
      </div>

      {/* Merge status banner */}
      {mergeStatus && (
        <div className={`p-5 rounded-2xl border ${mergeStatus.allComplete ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900/40' : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/40'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Icon name={mergeStatus.allComplete ? 'check_circle' : 'pending'} className={mergeStatus.allComplete ? 'text-emerald-600' : 'text-amber-600'} />
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {mergeStatus.allComplete ? 'All subjects submitted — ready to finalize.' : 'Waiting on some subject teachers to submit.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {mergeStatus.subjects.map(s => (
              <span
                key={s.subject}
                className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${s.complete ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}
              >
                {s.subject}: {s.submittedCount}/{s.totalStudents}
              </span>
            ))}
            {mergeStatus.subjects.length === 0 && (
              <span className="text-xs text-slate-400 italic">No subjects are assigned to teachers for this class yet.</span>
            )}
          </div>
        </div>
      )}

      {/* Merged table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white">{activeClass} &middot; {currentTerm}</h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {merged.map(student => {
            const overall = overallFor(student);
            return (
              <div key={student.studentId} className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{student.studentName}</p>
                  <span className="text-sm font-black text-primary">{overall === null ? 'No submissions yet' : `${overall} avg`}</span>
                </div>
                {student.subjects.length === 0 ? (
                  <p className="text-xs text-slate-400 italic mb-3">No subject scores submitted for this student yet.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
                    {student.subjects.map(s => (
                      <div key={s.subject} className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 border border-slate-100 dark:border-slate-800">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{s.subject}</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{s.caScore + s.examScore} <span className="text-[10px] text-slate-400 font-normal">(CA {s.caScore} + Exam {s.examScore})</span></p>
                        {s.remarks && <p className="text-[11px] text-slate-500 italic mt-1">"{s.remarks}"</p>}
                      </div>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  placeholder="Overall class teacher's remark for this student..."
                  value={remarks[student.studentId] || ''}
                  onChange={(e) => setRemarks(prev => ({ ...prev, [student.studentId]: e.target.value }))}
                  className="w-full text-sm p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-primary focus:border-primary"
                />
              </div>
            );
          })}
          {merged.length === 0 && (
            <div className="p-12 text-center text-slate-400 italic">No students found for this class.</div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleFinalize}
          disabled={finalizing || !mergeStatus?.allComplete}
          className="px-8 py-3.5 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {finalizing ? <Icon name="sync" className="animate-spin" /> : <Icon name="task_alt" />}
          {finalizing ? 'Submitting...' : 'Finalize & Submit for Approval'}
        </button>
      </div>
    </div>
  );
};

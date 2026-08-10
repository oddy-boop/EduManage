
import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { View } from '../../types';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';
import { exportToCSV } from '../../lib/exportUtils';

interface TeacherQuizResultsProps {
  onNavigate: (view: View) => void;
}

export const TeacherQuizResults: React.FC<TeacherQuizResultsProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    const unsub = firestoreService.onTeacherQuizzesChange(user.uid, (data) => {
      setQuizzes(data);
      setSelectedQuiz(prev => prev ? (data.find((q: any) => q.id === prev.id) || data[0] || null) : (data[0] || null));
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!selectedQuiz) {
      setResults([]);
      return;
    }
    const unsub = firestoreService.getQuizResults(selectedQuiz.id, setResults);
    return () => unsub();
  }, [selectedQuiz?.id]);

  const [detailResult, setDetailResult] = useState<any>(null);

  const students = useMemo(() => results.map(r => ({
    id: r.studentId,
    name: r.studentName || r.studentId,
    score: `${r.score} / ${r.totalQuestions}`,
    scoreValue: r.score,
    correctCount: r.correctCount,
    totalQuestions: r.totalQuestions,
    submittedAt: r.submittedAt,
    answers: r.answers
  })), [results]);

  const stats = useMemo(() => {
    const pctScores = results.map(r => r.totalQuestions > 0 ? (r.correctCount / r.totalQuestions) * 100 : 0);
    const avgScore = pctScores.length ? Math.round(pctScores.reduce((a, b) => a + b, 0) / pctScores.length) : 0;
    return { avgScore, completedCount: students.length, totalClassSize: students.length };
  }, [students, results]);

  const handleExport = () => {
    if (students.length === 0) return;
    exportToCSV(
      students.map((s, i) => ({ Rank: i + 1, Name: s.name, StudentID: s.id, Score: s.score, SubmittedAt: s.submittedAt })),
      `${selectedQuiz?.title || 'quiz'}-results.csv`
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Icon name="sync" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto h-full flex flex-col space-y-6">
      <div className="flex justify-between items-center shrink-0">
        <div>
           <button 
            onClick={() => onNavigate(View.TEACHER_QUIZ_SHARE)}
            className="flex items-center gap-1 text-sm font-bold text-primary hover:underline mb-2"
           >
            <Icon name="arrow_back" className="text-sm" /> Distribution Center
           </button>
           <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Academic Performance Audit</h1>
           <div className="flex items-center gap-4 mt-2">
             <select 
               value={selectedQuiz?.id} 
               onChange={(e) => setSelectedQuiz(quizzes.find(q => q.id === e.target.value))}
               className="bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-sm font-bold px-3 py-1.5 focus:ring-primary"
             >
                {quizzes.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
             </select>
           </div>
        </div>
        <div className="flex gap-3">
             <button
               onClick={handleExport}
               disabled={students.length === 0}
               className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
             >
               <Icon name="download" /> Export Registrar CSV
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
              <div className="size-10 rounded-xl bg-blue-50 text-primary flex items-center justify-center mb-4"><Icon name="groups" /></div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Submissions Received</p>
              <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">{stats.completedCount}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
              <div className="size-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4"><Icon name="analytics" /></div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Mean Accuracy</p>
              <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">{stats.avgScore}%</p>
          </div>
          <div className="bg-slate-900 text-slate-400 p-6 rounded-2xl shadow-xl flex flex-col justify-end relative overflow-hidden">
              <Icon name="quiz" className="absolute top-[-20px] right-[-20px] text-8xl opacity-10 text-white" />
              <p className="text-[10px] font-black uppercase tracking-widest mb-1">Active Assessment</p>
              <p className="text-xl font-bold text-white truncate">{selectedQuiz?.title || 'No quiz selected'}</p>
          </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden flex-1 flex flex-col">
          <div className="p-6 border-b border-slate-50 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white">Student Academic Rankings</h3>
          </div>
          <div className="flex-1 overflow-auto">
              <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 text-[10px] uppercase font-black text-slate-400 sticky top-0 z-10">
                      <tr>
                          <th className="px-8 py-5">Rank</th>
                          <th className="px-8 py-5">Full Name</th>
                          <th className="px-8 py-5">System ID</th>
                          <th className="px-8 py-5">Final Score</th>
                          <th className="px-8 py-5 text-right">Registrar Actions</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {quizzes.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-8 py-16 text-center text-slate-400 italic">
                            You haven't created any quizzes yet. Head to Quiz Configuration to build one.
                          </td>
                        </tr>
                      )}
                      {quizzes.length > 0 && students.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-8 py-16 text-center text-slate-400 italic">
                            No student submissions yet for this quiz.
                          </td>
                        </tr>
                      )}
                      {students.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-all group">
                              <td className="px-8 py-5">
                                  <div className={`size-8 rounded-lg flex items-center justify-center font-black text-xs ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</div>
                              </td>
                              <td className="px-8 py-5 font-bold text-sm text-slate-900 dark:text-white">{row.name}</td>
                              <td className="px-8 py-5 font-mono text-xs text-slate-400">{row.id}</td>
                              <td className="px-8 py-5">
                                <span className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 px-3 py-1 rounded-full text-xs font-black">{row.score}</span>
                              </td>
                              <td className="px-8 py-5 text-right">
                                  <button
                                    onClick={() => setDetailResult(row)}
                                    className="text-xs font-black text-primary hover:underline uppercase tracking-widest"
                                  >
                                    Detail Audit
                                  </button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>

      {detailResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setDetailResult(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">{detailResult.name}</h3>
                <p className="text-xs text-slate-500">{detailResult.correctCount} / {detailResult.totalQuestions} correct</p>
              </div>
              <button onClick={() => setDetailResult(null)} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"><Icon name="close" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3">
              {(selectedQuiz?.questions || []).map((q: any, idx: number) => {
                const given = detailResult.answers?.[q.id];
                const isCorrect = given === q.correctAnswer;
                return (
                  <div key={q.id} className={`p-4 rounded-xl border ${isCorrect ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10' : 'border-red-200 bg-red-50 dark:bg-red-900/10'}`}>
                    <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">{idx + 1}. {q.text}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">Answered: <span className="font-bold">{given ?? '(no answer)'}</span></p>
                    {!isCorrect && <p className="text-xs text-emerald-700 dark:text-emerald-400">Correct answer: {q.correctAnswer}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

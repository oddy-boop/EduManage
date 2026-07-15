
import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { View } from '../../types';
import { firestoreService } from '../../lib/services';

interface TeacherQuizResultsProps {
  onNavigate: (view: View) => void;
}

export const TeacherQuizResults: React.FC<TeacherQuizResultsProps> = ({ onNavigate }) => {
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Logic to fetch all quizzes created by this teacher
    const unsub = firestoreService.onQuizzesChange((data) => {
      setQuizzes(data);
      if (data.length > 0) setSelectedQuiz(data[0]);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Quiz submissions are not yet stored anywhere in the database, so there is
  // no real results data to show here. Surface that honestly instead of
  // displaying fabricated placeholder students.
  const students: any[] = [];

  const stats = useMemo(() => {
    const scores = students.map(s => parseInt(s.score.replace(/[^0-9]/g, '')) || 0);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return { avgScore, completedCount: students.length, totalClassSize: 0 };
  }, [students]);

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
             <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
               <Icon name="download" /> Export Registrar CSV
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
              <div className="size-10 rounded-xl bg-blue-50 text-primary flex items-center justify-center mb-4"><Icon name="groups" /></div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Global Participation</p>
              <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">{stats.completedCount} / {stats.totalClassSize}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
              <div className="size-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4"><Icon name="analytics" /></div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Mean Accuracy</p>
              <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">{stats.avgScore}%</p>
          </div>
          <div className="bg-slate-900 text-slate-400 p-6 rounded-2xl shadow-xl flex flex-col justify-end relative overflow-hidden">
              <Icon name="construction" className="absolute top-[-20px] right-[-20px] text-8xl opacity-10 text-white" />
              <p className="text-[10px] font-black uppercase tracking-widest mb-1">Status</p>
              <p className="text-xl font-bold text-white">Not Yet Available</p>
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
                      {students.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-8 py-16 text-center text-slate-400 italic">
                            Quiz result collection isn't wired up yet — student submissions aren't being saved to a results table. This view will populate once that's built.
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
                                  <button className="text-xs font-black text-primary hover:underline uppercase tracking-widest">Detail Audit</button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  );
};

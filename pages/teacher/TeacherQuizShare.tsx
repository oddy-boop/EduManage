
import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { View } from '../../types';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';

interface TeacherQuizShareProps {
  onNavigate: (view: View) => void;
}

export const TeacherQuizShare: React.FC<TeacherQuizShareProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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

  const shareUrl = selectedQuiz ? `${window.location.origin}/join-quiz/${selectedQuiz.id}` : '';

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Icon name="sync" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
             <span className="font-bold text-slate-900 dark:text-white">Teacher Portal</span>
             <span>/</span>
             <span className="font-medium text-primary">Assessment Distribution</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Distribution Center</h1>
          <p className="text-slate-500 mt-1">Manage external access and student synchronization for active tests.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm p-10">
             <div className="mb-10">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4 block">
                   Step 1: Select Active Assessment
                </label>
                <div className="grid grid-cols-1 gap-4">
                  {quizzes.map(q => (
                    <button 
                      key={q.id}
                      onClick={() => setSelectedQuiz(q)}
                      className={`flex items-center justify-between p-6 rounded-2xl border-2 transition-all group ${selectedQuiz?.id === q.id ? 'border-primary bg-primary/5' : 'border-slate-50 dark:border-slate-900 hover:border-primary/30'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`size-12 rounded-xl flex items-center justify-center text-xl ${selectedQuiz?.id === q.id ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-900 text-slate-400'}`}>
                          <Icon name="quiz" />
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-slate-900 dark:text-white">{q.title}</p>
                          <p className="text-xs text-slate-400">{q.questions?.length || 0} Questions • {q.isPublished ? 'Published' : 'Draft'}</p>
                        </div>
                      </div>
                      {selectedQuiz?.id === q.id && <Icon name="check_circle" className="text-primary text-2xl" />}
                    </button>
                  ))}
                </div>
             </div>

             {selectedQuiz && (
               <div className="pt-10 border-t border-slate-50 dark:border-slate-800 space-y-10 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div>
                      <div className="flex items-center gap-2 mb-4">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Step 2: External Access Link</span>
                      </div>
                      <div className="flex gap-3">
                          <div className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl px-6 py-4 text-sm font-mono text-slate-500 flex items-center gap-3 overflow-x-auto">
                              <Icon name="lock" className="text-xs shrink-0" />
                              <span className="whitespace-nowrap">{shareUrl}</span>
                          </div>
                          <button
                            onClick={handleCopyLink}
                            className="px-8 bg-slate-900 text-white font-bold rounded-2xl hover:scale-105 transition-all text-sm flex items-center gap-2 shrink-0"
                          >
                              <Icon name={copied ? 'check' : 'content_copy'} className="text-lg" /> {copied ? 'Copied!' : 'Copy'}
                          </button>
                      </div>
                  </div>

                  <div className="flex items-start gap-10">
                    <div className="bg-white p-4 rounded-3xl border-2 border-slate-100 shadow-xl">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareUrl)}`} alt="QR" className="size-32" />
                    </div>
                    <div className="space-y-4 pt-4">
                      <h4 className="font-bold text-slate-900 dark:text-white">Classroom Integration</h4>
                      <p className="text-xs text-slate-500 leading-relaxed max-w-sm">Project this QR code on the smart board for instant synchronization during classroom hours. No manual ID entry required.</p>
                    </div>
                  </div>
               </div>
             )}
          </div>
        </div>

        <div className="space-y-6">
           <div className="bg-slate-900 text-white rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
               <Icon name="tips_and_updates" className="text-6xl text-amber-400 opacity-20 absolute top-[-10px] right-[-10px]" />
               <h3 className="text-lg font-bold mb-6">Distribution Protocol</h3>
               <div className="space-y-6">
                 <div className="flex gap-4">
                    <div className="size-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0 font-black text-xs">1</div>
                    <p className="text-xs text-slate-400 leading-relaxed">Ensure the quiz is "Published" in the configuration module before sharing.</p>
                 </div>
                 <div className="flex gap-4">
                    <div className="size-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0 font-black text-xs">2</div>
                    <p className="text-xs text-slate-400 leading-relaxed">Link access is synchronized with the Academic Calendar for automatic locking.</p>
                 </div>
               </div>
               <button 
                 onClick={() => onNavigate(View.TEACHER_QUIZ_RESULTS)}
                 className="mt-10 w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
               >
                   View Real-time Results <Icon name="east" className="ml-2" />
               </button>
           </div>

           <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-8">
               <h3 className="font-bold text-slate-900 dark:text-white mb-6">Audited Distribution History</h3>
               <div className="space-y-4">
                    {quizzes.slice(0, 3).map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all cursor-pointer border border-transparent hover:border-slate-100">
                            <div className="flex items-center gap-4">
                                <div className="size-10 rounded-xl bg-primary/5 text-primary flex items-center justify-center">
                                    <Icon name="history" className="text-sm" />
                                </div>
                                <div className="text-left">
                                    <p className="text-xs font-bold text-slate-900 dark:text-white">{item.title}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{item.isPublished ? 'Published' : 'Draft'}</p>
                                </div>
                            </div>
                            <Icon name="arrow_forward_ios" className="text-[10px] text-slate-300" />
                        </div>
                    ))}
               </div>
           </div>
        </div>
      </div>
    </div>
  );
};

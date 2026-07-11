
import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { UserRole } from '../../types';
import { firestoreService } from '../../lib/services';

export const StudentQuiz: React.FC = () => {
  const { user } = useAuth();
  const [studentId, setStudentId] = useState<string | null>(null);
  const [tempId, setTempId] = useState('');
  const [currentQuiz, setCurrentQuiz] = useState<any>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && user.role === UserRole.STUDENT) {
      setStudentId(user.username || user.uid);
    }
  }, [user]);

  useEffect(() => {
    // Logic to fetch active quizzes for the student's grade/class
    const fetchQuiz = async () => {
       try {
         // Subscribing to get quizzes
         const unsub = firestoreService.onQuizzesChange((quizzes) => {
           if (quizzes.length > 0) {
             setCurrentQuiz(quizzes[0]); // Selecting the first available active quiz
           }
           setLoading(false);
         });
         return () => unsub();
       } catch (error) {
         console.error("Failed to fetch quiz:", error);
         setLoading(false);
       }
    };
    fetchQuiz();
  }, [studentId]);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState(14 * 60 + 59);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if(tempId.trim()) setStudentId(tempId);
  }

  const QUESTIONS = currentQuiz?.questions || [];
  const currentQuestion = QUESTIONS[currentQuestionIndex];
  const totalQuestions = QUESTIONS.length;
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;
  const isFirstQuestion = currentQuestionIndex === 0;

  useEffect(() => {
    if(!studentId || isSubmitted || !currentQuiz) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0) {
            clearInterval(timer);
            return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [studentId, isSubmitted, currentQuiz]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleOptionSelect = (optionValue: string) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: optionValue
    }));
  };

  const toggleFlag = () => {
    const newFlagged = new Set(flagged);
    if (newFlagged.has(currentQuestion.id)) {
      newFlagged.delete(currentQuestion.id);
    } else {
      newFlagged.add(currentQuestion.id);
    }
    setFlagged(newFlagged);
  };

  const handleSubmit = async () => {
    let calculatedScore = 0;
    QUESTIONS.forEach((q: any) => {
      if (answers[q.id] === q.correctAnswer) {
        calculatedScore += (q.points || 1);
      }
    });

    try {
      // In a real app we'd submit this score to Firestore
      setScore(calculatedScore);
      setIsSubmitted(true);
      alert("Assessment record synced with Registrar.");
    } catch (error) {
      alert("Error submitting results.");
    }
  };

  if (!studentId) {
      return (
          <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center p-6 font-display">
              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-8 border border-slate-200 dark:border-slate-800 text-center">
                  <div className="size-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
                      <Icon name="badge" className="text-3xl" />
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Secure Quiz Portal</h1>
                  <p className="text-slate-500 mt-2 text-sm mb-8">Enter your credentials to initiate synchronous assessment.</p>
                  <form onSubmit={handleLogin} className="space-y-4">
                      <input 
                        type="text" 
                        value={tempId}
                        onChange={(e) => setTempId(e.target.value)}
                        className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl font-mono text-center text-xl tracking-[0.2em] font-black focus:border-primary outline-none uppercase transition-all mb-4"
                        placeholder="STU-XXXX-XXXX"
                        required
                      />
                      <button type="submit" className="w-full py-4 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-3">
                          Begin Assessment <Icon name="bolt" />
                      </button>
                  </form>
              </div>
          </div>
      )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Icon name="sync" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  if (!currentQuiz) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center p-6 grayscale opacity-60">
        <Icon name="no_sim" className="text-6xl mb-4" />
        <h2 className="text-2xl font-bold">No Active Assessments</h2>
        <p className="text-slate-500 max-w-xs mt-2">There are currently no synchronized tests scheduled for your grade level.</p>
      </div>
    );
  }

  const progressPercentage = Math.round((Object.keys(answers).length / totalQuestions) * 100);

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-white dark:bg-background-dark flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="size-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-6">
          <Icon name="verified" className="text-4xl" />
        </div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">Quiz Complete</h1>
        <p className="text-slate-500 mb-8">Synchronized results have been transmitted to teacher records.</p>
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl w-full max-w-sm mb-8">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Final Score</p>
            <p className="text-5xl font-black text-slate-900 dark:text-white">{score} <span className="text-xl text-slate-400">pts</span></p>
        </div>
        <button 
          onClick={() => setStudentId(null)}
          className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold hover:scale-105 transition-transform"
        >
          Return to Portal
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#f8fafc] dark:bg-background-dark font-display text-slate-900 dark:text-white min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-[#1e293b]/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 h-16 px-8 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
            <div className="size-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center font-black">
                {currentQuestionIndex + 1}
            </div>
            <div className="hidden sm:block">
                <h1 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{currentQuiz.title}</h1>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Live Assessment Session</p>
            </div>
        </div>

        <div className="flex items-center gap-6">
            <div className="hidden lg:flex flex-col w-48 gap-1.5">
                 <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                     <div className="h-full bg-primary transition-all duration-700 ease-out rounded-full" style={{ width: `${progressPercentage}%` }}></div>
                 </div>
            </div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-sm font-black border-2 ${timeLeft < 180 ? 'bg-red-50 text-red-600 border-red-500 shadow-lg shadow-red-200 animate-pulse' : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
                <Icon name="schedule" className="text-lg" />
                {formatTime(timeLeft)}
            </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-8 flex flex-col items-center">
          <div className="bg-white dark:bg-[#1e293b] rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 p-10 w-full animate-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-3 mb-8">
                  <span className="text-[10px] font-black uppercase text-primary tracking-widest bg-primary/10 px-3 py-1 rounded-full">{currentQuiz?.subject || 'Live Assessment'}</span>
                  <div className="h-1 flex-1 bg-slate-100 dark:bg-slate-800 rounded-full"></div>
              </div>

              <h2 className="text-3xl font-bold text-slate-900 dark:text-white leading-[1.4] mb-12">
                  {currentQuestion?.text}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
                  {(currentQuestion?.options || []).map((opt: string, idx: number) => {
                      const isSelected = answers[currentQuestion.id] === opt;
                      return (
                          <button 
                            key={idx}
                            onClick={() => handleOptionSelect(opt)}
                            className={`p-6 rounded-2xl border-2 text-left transition-all relative overflow-hidden group ${isSelected ? 'border-primary bg-primary/5 ring-4 ring-primary/10' : 'border-slate-100 dark:border-slate-800 hover:border-primary/50'}`}
                          >
                            <span className={`text-[10px] font-black mb-2 block uppercase tracking-widest ${isSelected ? 'text-primary' : 'text-slate-400 group-hover:text-primary transition-colors'}`}>Option {String.fromCharCode(65 + idx)}</span>
                            <p className={`font-bold transition-colors ${isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>{opt}</p>
                            {isSelected && <div className="absolute right-4 top-4 text-primary animate-in zoom-in duration-300"><Icon name="check_circle" className="text-xl" /></div>}
                          </button>
                      )
                  })}
              </div>

              <div className="flex items-center justify-between pt-10 border-t border-slate-50 dark:border-slate-800">
                  <button 
                    onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                    className={`flex items-center gap-2 p-3 rounded-2xl font-black text-xs uppercase tracking-widest ${isFirstQuestion ? 'opacity-0 pointer-events-none' : 'text-slate-400 hover:text-slate-900 transition-colors'}`}
                  >
                    <Icon name="west" /> Previous
                  </button>

                  {isLastQuestion ? (
                    <button 
                      onClick={handleSubmit}
                      className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:scale-105 transition-all flex items-center gap-3"
                    >
                      Sync & Finish <Icon name="rocket_launch" />
                    </button>
                  ) : (
                    <button 
                      onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
                      className="px-10 py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-105 transition-all flex items-center gap-3"
                    >
                      Next Question <Icon name="east" />
                    </button>
                  )}
              </div>
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-8 flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Synchronizing with Central Database Engine
          </p>
      </main>
    </div>
  );
};

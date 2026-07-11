
import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { View } from '../../types';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';

interface TeacherQuizConfigProps {
  onNavigate: (view: View) => void;
}

interface Question {
  id: string;
  text: string;
  type: string;
  correctAnswer: string;
  options?: string[];
  points?: number;
}

export const TeacherQuizConfig: React.FC<TeacherQuizConfigProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [quizTitle, setQuizTitle] = useState('New Assessment');
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);

  useEffect(() => {
    // For simplicity, we fetch the latest "draft" quiz or create one
    const fetchLatestQuiz = async () => {
      // Logic to either find existing draft or just start fresh in real app
      setLoading(false);
    };
    fetchLatestQuiz();
  }, []);

  const handleUpdateQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    
    if (editingQuestion.id.startsWith('temp-')) {
       setQuestions([...questions, { ...editingQuestion, id: Math.random().toString(36).substr(2, 9) }]);
    } else {
       setQuestions(questions.map(q => q.id === editingQuestion.id ? editingQuestion : q));
    }
    setEditingQuestion(null);
  };

  const handleCreateQuiz = async () => {
    if (questions.length === 0) {
      alert("Please add at least one question.");
      return;
    }
    try {
      setSaving(true);
      const quizId = await firestoreService.createQuiz({
        title: quizTitle,
        teacherId: user?.uid || 'anonymous',
        questions: questions.map(q => ({
          id: Math.random().toString(36).substr(2, 9),
          text: q.text,
          type: q.type,
          correctAnswer: q.correctAnswer,
          options: q.options || []
        })),
        settings: {
          timeLimit: 45,
          allowShuffle: true,
          totalQuestions: questions.length
        },
        status: 'published',
        createdAt: new Date().toISOString()
      });
      setActiveQuizId(quizId);
      alert("Quiz successfully published and synced with Student Dashboard.");
      onNavigate(View.TEACHER_QUIZ_SHARE);
    } catch (error) {
      console.error("Failed to create quiz:", error);
      alert("Error publishing quiz.");
    } finally {
      setSaving(false);
    }
  };

  const addManualQuestion = () => {
    setEditingQuestion({
      id: `temp-${Date.now()}`,
      text: '',
      type: 'Multiple Choice',
      correctAnswer: '',
      options: ['', '', '', ''],
      points: 1
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Icon name="sync" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto h-full flex flex-col relative">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Quiz Configuration</h1>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
            <Icon name="home" className="text-sm" /> 
            <span>Dashboard</span>
            <span>/</span>
            <span className="font-medium text-primary">Setup</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-8 flex flex-col">
          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Quiz Title</label>
            <input 
              type="text" 
              value={quizTitle}
              onChange={(e) => setQuizTitle(e.target.value)}
              className="w-full text-xl font-bold p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-primary outline-none"
            />
          </div>

          <div className="flex-1 flex flex-col min-h-0 border-t border-slate-100 dark:border-slate-700 pt-6">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Question List ({questions.length})</h3>
                <button 
                  onClick={addManualQuestion}
                  className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg flex items-center gap-2 hover:bg-primary/90"
                >
                  <Icon name="add" className="text-sm" /> Add Question
                </button>
             </div>

             <div className="flex-1 overflow-y-auto space-y-3">
                {questions.map((q, idx) => (
                  <div key={q.id} className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate max-w-md">{q.text || <span className="italic opacity-50">Untitled question</span>}</p>
                        <span className="text-[10px] font-bold uppercase text-primary bg-primary/10 px-2 py-0.5 rounded mt-1 inline-block">{q.type}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setEditingQuestion(q)}
                      className="size-8 rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-primary flex items-center justify-center transition-colors"
                    >
                      <Icon name="edit" className="text-sm" />
                    </button>
                  </div>
                ))}
                {questions.length === 0 && (
                  <div className="h-32 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400">
                    <Icon name="quiz" className="text-3xl mb-2 opacity-20" />
                    <p className="text-sm font-medium">No questions added yet.</p>
                  </div>
                )}
             </div>
          </div>
        </div>

        <div className="w-full lg:w-80 space-y-6">
           <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Quiz Status</h3>
              <div className="flex items-center gap-2 mb-6">
                <span className="size-2 rounded-full bg-slate-300 animate-pulse"></span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Awaiting Publication</span>
              </div>
              <button 
                onClick={handleCreateQuiz}
                disabled={saving}
                className="w-full py-4 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 flex items-center justify-center gap-3 disabled:opacity-50 transition-all"
              >
                {saving ? 'Creating...' : 'Publish to Students'} <Icon name={saving ? 'sync' : 'publish'} className={`text-sm ${saving ? 'animate-spin' : ''}`} />
              </button>
           </div>
        </div>
      </div>

      {editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">Edit Question</h3>
                <button onClick={() => setEditingQuestion(null)} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"><Icon name="close" /></button>
            </div>
            <form onSubmit={handleUpdateQuestion} className="p-6 overflow-y-auto space-y-4">
                <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Question Text</label>
                    <textarea 
                        required
                        className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-primary focus:border-primary min-h-[100px] dark:text-white"
                        value={editingQuestion.text}
                        onChange={e => setEditingQuestion({...editingQuestion, text: e.target.value})}
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Type</label>
                        <select 
                            className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-primary focus:border-primary dark:text-white"
                            value={editingQuestion.type}
                            onChange={e => setEditingQuestion({...editingQuestion, type: e.target.value})}
                        >
                            <option>Multiple Choice</option>
                            <option>Short Answer</option>
                            <option>True/False</option>
                        </select>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <button 
                        type="button"
                        onClick={() => setEditingQuestion(null)}
                        className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit"
                        className="px-6 py-2 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary/90"
                    >
                        Save Question
                    </button>
                </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

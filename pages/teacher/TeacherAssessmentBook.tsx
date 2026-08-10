import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';
import { ASSESSMENT_CATEGORIES } from '../../types';

export const TeacherAssessmentBook: React.FC = () => {
  const { user } = useAuth();
  const assignedClasses = user?.assignedClasses && user.assignedClasses.length > 0 ? user.assignedClasses : ['Unassigned'];
  const [activeClass, setActiveClass] = useState(assignedClasses[0]);
  const [term, setTerm] = useState('Term 2');
  const [students, setStudents] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  const [form, setForm] = useState({
    studentId: '',
    category: ASSESSMENT_CATEGORIES[0] as string,
    title: '',
    score: '',
    maxScore: '100',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    firestoreService.getSystemSettings()
      .then(settings => { if (settings?.current_term) setTerm(settings.current_term); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const unsubStudents = firestoreService.getStudentsForClass(activeClass, (data) => {
      setStudents(data);
      setLoading(false);
    });
    return () => unsubStudents();
  }, [activeClass]);

  useEffect(() => {
    const unsubEntries = firestoreService.getAssessments({ classId: activeClass, term }, setEntries);
    return () => unsubEntries();
  }, [activeClass, term]);

  const entriesByStudent = useMemo(() => {
    const map: Record<string, any[]> = {};
    entries.forEach(e => {
      if (!map[e.studentId]) map[e.studentId] = [];
      map[e.studentId].push(e);
    });
    return map;
  }, [entries]);

  const averageFor = (studentId: string) => {
    const list = entriesByStudent[studentId] || [];
    if (list.length === 0) return null;
    const avg = list.reduce((sum, e) => sum + (e.score / e.maxScore) * 100, 0) / list.length;
    return Math.round(avg * 10) / 10;
  };

  const handleAddEntry = async () => {
    if (!form.studentId || !form.score) {
      alert("Please select a student and enter a score.");
      return;
    }
    const score = Number(form.score);
    const maxScore = Number(form.maxScore) || 100;
    if (Number.isNaN(score) || score < 0 || score > maxScore) {
      alert(`Score must be a number between 0 and ${maxScore}.`);
      return;
    }
    try {
      setSaving(true);
      await firestoreService.createAssessment({
        studentId: form.studentId,
        classId: activeClass,
        term,
        category: form.category,
        title: form.title || undefined,
        score,
        maxScore,
        date: form.date
      });
      setForm(prev => ({ ...prev, title: '', score: '' }));
    } catch (error) {
      console.error("Failed to log assessment:", error);
      alert("Failed to save this assessment entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this assessment entry? This will change the student's computed CA average.")) return;
    try {
      await firestoreService.deleteAssessment(id);
    } catch (error) {
      alert("Failed to delete entry.");
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span className="font-bold text-slate-900 dark:text-white">Teacher Portal</span>
            <span>/</span>
            <span className="font-medium text-primary">Assessment Book</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Continuous Assessment Log</h1>
          <p className="text-slate-500 text-sm mt-1">Log tests, homework, and class work here — the CA score on Report Entry is calculated automatically from these entries.</p>
        </div>
        <div className="flex gap-3">
          <select
            value={activeClass}
            onChange={(e) => setActiveClass(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-primary"
          >
            {assignedClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-primary"
          >
            <option value="Term 1">Term 1</option>
            <option value="Term 2">Term 2</option>
            <option value="Term 3">Term 3</option>
          </select>
        </div>
      </div>

      {/* Log New Entry */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
        <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Icon name="add_task" className="text-primary" /> Log New Assessment
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="md:col-span-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Student</label>
            <select
              value={form.studentId}
              onChange={(e) => setForm({ ...form, studentId: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold"
            >
              <option value="">Select student...</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold"
            >
              {ASSESSMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Title (optional)</label>
            <input
              type="text"
              placeholder="e.g. Chapter 3 Quiz"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Score / Max</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={form.score}
                onChange={(e) => setForm({ ...form, score: e.target.value })}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-center"
              />
              <span className="text-slate-400">/</span>
              <input
                type="number"
                value={form.maxScore}
                onChange={(e) => setForm({ ...form, maxScore: e.target.value })}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-center"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold"
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={handleAddEntry}
            disabled={saving}
            className="px-6 py-2.5 bg-primary text-white rounded-lg font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Icon name="sync" className="animate-spin" /> : <Icon name="add" />}
            {saving ? 'Saving...' : 'Log Entry'}
          </button>
        </div>
      </div>

      {/* Roster with rolling averages */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-slate-900 dark:text-white">{activeClass} &middot; {term}</h3>
          <span className="text-xs font-bold text-slate-400 uppercase">{entries.length} entries logged</span>
        </div>
        {loading ? (
          <div className="p-12 flex justify-center"><Icon name="sync" className="animate-spin text-primary text-3xl" /></div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {students.map(student => {
              const studentEntries = entriesByStudent[student.id] || [];
              const avg = averageFor(student.id);
              const isExpanded = expandedStudent === student.id;
              return (
                <div key={student.id}>
                  <button
                    onClick={() => setExpandedStudent(isExpanded ? null : student.id)}
                    className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Icon name={isExpanded ? 'expand_less' : 'expand_more'} className="text-slate-400" />
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{student.name}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">{studentEntries.length} entries</span>
                    </div>
                    <span className={`text-sm font-black ${avg === null ? 'text-slate-400' : avg >= 50 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {avg === null ? 'No entries yet' : `${avg}% avg`}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4">
                      {studentEntries.length === 0 ? (
                        <p className="text-xs text-slate-400 italic pl-7">No assessments logged for this student yet.</p>
                      ) : (
                        <table className="w-full text-left text-xs">
                          <thead className="text-[10px] uppercase font-bold text-slate-400">
                            <tr>
                              <th className="py-2 pl-7">Date</th>
                              <th className="py-2">Category</th>
                              <th className="py-2">Title</th>
                              <th className="py-2 text-center">Score</th>
                              <th className="py-2 text-right pr-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                            {studentEntries.map(e => (
                              <tr key={e.id}>
                                <td className="py-2 pl-7 text-slate-500">{new Date(e.date).toLocaleDateString()}</td>
                                <td className="py-2 font-bold text-slate-700 dark:text-slate-300">{e.category}</td>
                                <td className="py-2 text-slate-500">{e.title || '—'}</td>
                                <td className="py-2 text-center font-bold text-slate-900 dark:text-white">{e.score} / {e.maxScore}</td>
                                <td className="py-2 text-right pr-2">
                                  <button onClick={() => handleDelete(e.id)} className="text-slate-400 hover:text-rose-600">
                                    <Icon name="delete" className="text-sm" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {students.length === 0 && (
              <div className="p-12 text-center text-slate-400 italic">No students found for this class.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

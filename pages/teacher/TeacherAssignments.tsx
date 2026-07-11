import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';

export const TeacherAssignments: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    classId: '10-A',
    dueDate: '',
    subject: 'History'
  });

  useEffect(() => {
    // For simplicity, we fetch assignments for the default class or we could fetch all by teacherId
    // Let's fetch the list of assignments created by this teacher
    // We don't have a getAssignmentsByTeacherId so we use classId for now as in the dashboard mockup
    const unsub = firestoreService.getAssignments('10-A', (data) => {
      setAssignments(data);
    });
    return () => unsub();
  }, []);

  const handlePublish = async () => {
    if (!formData.title || !formData.dueDate) {
      alert("Please fill in the title and due date.");
      return;
    }

    try {
      setLoading(true);
      await firestoreService.createAssignment({
        ...formData,
        teacherId: user?.uid || 'anonymous',
        status: 'published',
        createdAt: new Date().toISOString()
      });
      alert("Assignment published successfully!");
      setFormData({
        title: '',
        description: '',
        classId: '10-A',
        dueDate: '',
        subject: 'History'
      });
    } catch (error) {
      console.error("Failed to publish:", error);
      alert("Failed to publish assignment.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this assignment?")) return;
    try {
      await firestoreService.deleteAssignment(id);
    } catch (error) {
      alert("Failed to delete assignment.");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark">
      {/* Top Navigation */}
      <div className="h-16 px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
        <div>
           <div className="flex items-center gap-2 text-xs text-slate-500">
               <span className="uppercase font-bold tracking-wider text-primary">EduPortal</span>
               <span>|</span>
               <span className="font-semibold">Teacher Dashboard</span>
           </div>
           <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-none mt-1">Assignment Management</h1>
        </div>
        
        <div className="flex items-center gap-3">
           <div className="size-8 rounded-full bg-slate-200 overflow-hidden border border-slate-200">
              <img src={user?.photoURL || 'https://picsum.photos/seed/teacher/200'} alt="" />
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto w-full">
         <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
             <span>Assignments</span>
             <Icon name="chevron_right" className="text-xs" />
             <span className="font-bold text-slate-900 dark:text-white">Create New</span>
         </div>

         <div className="flex justify-between items-end mb-6">
             <div>
                 <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Publish Assignment</h2>
                 <p className="text-slate-500 mt-1">Configure and share classroom tasks with students and parents.</p>
             </div>
         </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
             {/* Left Column: Form */}
             <div className="lg:col-span-2 space-y-8">
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-6">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                          <Icon name="add" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-white">Create New Assignment</h3>
                          <p className="text-xs text-slate-500">Fill in the details to publish to students</p>
                        </div>
                      </div>

                      <div>
                          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Assignment Title <span className="text-red-500">*</span></label>
                          <input 
                            type="text" 
                            placeholder="e.g., The Industrial Revolution Analysis" 
                            value={formData.title}
                            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                            className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-primary focus:border-primary" 
                          />
                      </div>

                      <div>
                          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Instructions & Requirements</label>
                          <textarea 
                            rows={8} 
                            value={formData.description}
                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-primary focus:border-primary resize-none text-sm" 
                            placeholder="Detailed description of the assignment tasks..."
                          ></textarea>
                      </div>
                  </div>

                  {/* Recently Published List */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                        <h3 className="font-bold text-slate-900 dark:text-white">Published Assignments</h3>
                        <span className="text-xs font-bold text-slate-400 uppercase">{assignments.length} Total</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {assignments.length > 0 ? assignments.map((asgn, i) => (
                           <div key={asgn.id || i} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                              <div className="flex items-center gap-4">
                                  <div className="size-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 flex items-center justify-center">
                                      <Icon name="assignment" />
                                  </div>
                                  <div>
                                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{asgn.title}</p>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Due {asgn.dueDate} • Class {asgn.classId}</p>
                                  </div>
                              </div>
                              <div className="flex items-center gap-2">
                                  <button className="p-2 text-slate-400 hover:text-primary transition-colors">
                                      <Icon name="edit" className="text-base" />
                                  </button>
                                  <button 
                                    onClick={() => handleDelete(asgn.id)}
                                    className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                                  >
                                      <Icon name="delete" className="text-base" />
                                  </button>
                              </div>
                           </div>
                        )) : (
                          <div className="p-12 text-center">
                              <p className="text-sm text-slate-500 italic">No assignments published for this class yet.</p>
                          </div>
                        )}
                    </div>
                  </div>
             </div>

             {/* Right Column: Settings */}
             <div className="space-y-6">
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Publishing Settings</h3>
                      
                      <div className="space-y-4">
                          <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 text-[10px]">TARGET CLASS</label>
                              <select 
                                value={formData.classId}
                                onChange={(e) => setFormData(prev => ({ ...prev, classId: e.target.value }))}
                                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold"
                              >
                                  <option value="10-A">History - 10A</option>
                                  <option value="10-B">History - 10B</option>
                                  <option value="11-C">History - 11C</option>
                              </select>
                          </div>
                          
                          <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 text-[10px]">SUBMISSION DEADLINE</label>
                              <input 
                                type="date" 
                                value={formData.dueDate}
                                onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" 
                              />
                          </div>

                          <button 
                            onClick={handlePublish}
                            disabled={loading}
                            className="w-full py-3 bg-primary text-white font-bold rounded-lg shadow-lg shadow-primary/20 hover:bg-primary/90 flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
                          >
                              {loading ? 'Publishing...' : 'Publish Assignment'} <Icon name={loading ? 'sync' : 'send'} className={`text-sm ${loading ? 'animate-spin' : ''}`} />
                          </button>
                      </div>
                  </div>

                  <div className="bg-primary text-white rounded-xl p-6 shadow-lg">
                      <h3 className="text-sm font-bold uppercase tracking-wider mb-2 opacity-80">Class Communication</h3>
                      <p className="text-xs opacity-70 italic leading-relaxed">
                          Assignments published here will be instantly visible on the Parent Portal for students and guardians.
                      </p>
                  </div>
             </div>
         </div>
      </div>
    </div>
  );
};

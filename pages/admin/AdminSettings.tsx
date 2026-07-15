import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';

interface GradeConfig {
  id: string;
  name: string;
  baseFee: number;
}

interface CourseConfig {
  id: string;
  name: string;
  code: string;
  department: string;
}

export const AdminSettings: React.FC = () => {
  const { user } = useAuth();
  const [grades, setGrades] = useState<GradeConfig[]>([]);
  const [courses, setCourses] = useState<CourseConfig[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'grades' | 'courses' | 'system'>('grades');

  // Form states
  const [newGrade, setNewGrade] = useState({ name: '', baseFee: 0 });
  const [newCourse, setNewCourse] = useState({ name: '', code: '', department: '' });

  // Editing states
  const [editingGrade, setEditingGrade] = useState<GradeConfig | null>(null);
  const [editingCourse, setEditingCourse] = useState<CourseConfig | null>(null);

  // System states
  const [currentTerm, setCurrentTerm] = useState('Term 2');
  const [savingTerm, setSavingTerm] = useState(false);
  const [fromClass, setFromClass] = useState('');
  const [toClass, setToClass] = useState('');
  const [promoting, setPromoting] = useState(false);

  // Password change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    const unsubGrades = firestoreService.getGrades((data) => {
        setGrades(data as GradeConfig[]);
    });

    const unsubCourses = firestoreService.getCourses((data) => {
        setCourses(data as CourseConfig[]);
        setLoading(false);
    });

    const unsubAudit = firestoreService.getAuditLogs((data) => {
        setAuditLogs(data);
    });

    const fetchSystemSettings = async () => {
      try {
        const settings = await firestoreService.getSystemSettings();
        if (settings && settings.current_term) {
          setCurrentTerm(settings.current_term);
        }
      } catch (err) {
        console.error("Failed to load system settings:", err);
      }
    };
    fetchSystemSettings();

    return () => {
        unsubGrades();
        unsubCourses();
        unsubAudit();
    };
  }, []);

  const handleAddGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGrade.name) return;
    try {
        const id = newGrade.name.replace(/\s+/g, '-').toLowerCase();
        await firestoreService.createGradeConfig(id, {
            ...newGrade,
            updatedAt: new Date().toISOString()
        });
        if (user) {
          await firestoreService.logActivity({
            userId: user.uid,
            userEmail: user.email || '',
            userName: user.name || '',
            action: 'Add Grade Config',
            details: `Added/updated grade level configuration: ${newGrade.name} with Base Fee: GH₵${newGrade.baseFee}`,
            type: 'config_change'
          });
        }
        setNewGrade({ name: '', baseFee: 0 });
    } catch (error) {
        console.error("Error adding grade:", error);
    }
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourse.name || !newCourse.code) return;
    try {
        const id = newCourse.code.toUpperCase();
        await firestoreService.createCourseConfig(id, {
            ...newCourse,
            updatedAt: new Date().toISOString()
        });
        if (user) {
          await firestoreService.logActivity({
            userId: user.uid,
            userEmail: user.email || '',
            userName: user.name || '',
            action: 'Add Course Config',
            details: `Added/updated course catalog configuration: ${newCourse.name} (${id}) under Department: ${newCourse.department || 'General'}`,
            type: 'config_change'
          });
        }
        setNewCourse({ name: '', code: '', department: '' });
    } catch (error) {
        console.error("Error adding course:", error);
    }
  };

  const handleEditGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGrade) return;
    try {
      await firestoreService.createGradeConfig(editingGrade.id, {
        name: editingGrade.name,
        baseFee: editingGrade.baseFee,
        updatedAt: new Date().toISOString()
      });
      if (user) {
        await firestoreService.logActivity({
          userId: user.uid,
          userEmail: user.email || '',
          userName: user.name || '',
          action: 'Edit Grade Config',
          details: `Edited grade level configuration: ${editingGrade.name} to Base Fee: GH₵${editingGrade.baseFee}`,
          type: 'config_change'
        });
      }
      setEditingGrade(null);
    } catch (error) {
      console.error("Error updating grade config:", error);
    }
  };

  const handleEditCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse) return;
    try {
      await firestoreService.createCourseConfig(editingCourse.id, {
        name: editingCourse.name,
        code: editingCourse.code,
        department: editingCourse.department,
        updatedAt: new Date().toISOString()
      });
      if (user) {
        await firestoreService.logActivity({
          userId: user.uid,
          userEmail: user.email || '',
          userName: user.name || '',
          action: 'Edit Course Config',
          details: `Edited course config: ${editingCourse.name} (${editingCourse.code})`,
          type: 'config_change'
        });
      }
      setEditingCourse(null);
    } catch (error) {
      console.error("Error updating course config:", error);
    }
  };

  const handleDeleteGrade = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete the configuration for ${name}?`)) return;
    try {
      await firestoreService.deleteGradeConfig(id);
      if (user) {
        await firestoreService.logActivity({
          userId: user.uid,
          userEmail: user.email || '',
          userName: user.name || '',
          action: 'Delete Grade Config',
          details: `Deleted grade level configuration for ${name}`,
          type: 'config_change'
        });
      }
    } catch (error) {
      console.error("Error deleting grade config:", error);
    }
  };

  const handleDeleteCourse = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete the configuration for ${name}?`)) return;
    try {
      await firestoreService.deleteCourseConfig(id);
      if (user) {
        await firestoreService.logActivity({
          userId: user.uid,
          userEmail: user.email || '',
          userName: user.name || '',
          action: 'Delete Course Config',
          details: `Deleted course configuration for ${name}`,
          type: 'config_change'
        });
      }
    } catch (error) {
      console.error("Error deleting course config:", error);
    }
  };

  const handleSaveTerm = async () => {
    setSavingTerm(true);
    try {
      await firestoreService.updateSystemSetting('current_term', currentTerm);
      alert('School active term updated successfully!');
      if (user) {
        await firestoreService.logActivity({
          userId: user.uid,
          userEmail: user.email || '',
          userName: user.name || '',
          action: 'System Configuration Update',
          details: `Updated active academic term to ${currentTerm}`,
          type: 'config_change'
        });
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save settings.');
    } finally {
      setSavingTerm(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (newPassword.length < 8) {
      alert('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('New password and confirmation do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      await firestoreService.changePassword(currentPassword, newPassword);
      alert('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handlePromote = async () => {
    if (!fromClass || !toClass) {
      alert('Please select both starting and destination classes.');
      return;
    }
    if (fromClass === toClass) {
      alert('Starting and destination classes must be different.');
      return;
    }
    if (!window.confirm(`Are you sure you want to promote all students from ${fromClass} to ${toClass}? This will move them in real-time, assigning them to the teachers of ${toClass}.`)) {
      return;
    }
    setPromoting(true);
    try {
      const res = await firestoreService.promoteStudents(fromClass, toClass);
      alert(`Promotion completed successfully! ${res.promotedCount} students promoted from ${fromClass} to ${toClass}.`);
      if (user) {
        await firestoreService.logActivity({
          userId: user.uid,
          userEmail: user.email || '',
          userName: user.name || '',
          action: 'Batch Promotion Executed',
          details: `Promoted ${res.promotedCount} students from class ${fromClass} to class ${toClass}`,
          type: 'config_change'
        });
      }
      setFromClass('');
      setToClass('');
    } catch (err) {
      console.error(err);
      alert('Promotion execution failed.');
    } finally {
      setPromoting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Icon name="sync" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-150">
      {/* Header Block */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
             <span className="font-bold text-slate-900 dark:text-white">Admin Portal</span>
             <span>/</span>
             <span className="font-medium text-primary">System Settings</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">Configuration Hub</h1>
          <p className="text-sm text-slate-555">Manage academic parameters, course directory, and student transition pathways.</p>
        </div>

        <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200/50 dark:border-slate-700/30 w-fit shrink-0">
             <button 
               onClick={() => setActiveTab('grades')}
               className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'grades' ? 'bg-white dark:bg-slate-700 shadow-md text-primary dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'}`}
             >
                 <Icon name="tune" /> Grade Levels & Rates
             </button>
             <button 
               onClick={() => setActiveTab('courses')}
               className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'courses' ? 'bg-white dark:bg-slate-700 shadow-md text-primary dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'}`}
             >
                 <Icon name="auto_stories" /> Course Catalog
             </button>
             <button 
               onClick={() => setActiveTab('system')}
               className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'system' ? 'bg-white dark:bg-slate-700 shadow-md text-primary dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'}`}
             >
                 <Icon name="settings_system_daydream" /> System & Promotions
             </button>
        </div>
      </div>

      {activeTab === 'grades' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Add Grade Form */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm h-fit">
            <h3 className="font-bold text-slate-900 dark:text-white mb-4">Add Grade Config</h3>
            <form onSubmit={handleAddGrade} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Grade Level Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Grade 10"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary outline-none"
                  value={newGrade.name}
                  onChange={(e) => setNewGrade({ ...newGrade, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Base Tuition Fee (GHS)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-450 font-bold text-xs">GH₵</span>
                  <input 
                    type="number" 
                    placeholder="0.00"
                    className="w-full pl-14 pr-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-primary outline-none"
                    value={newGrade.baseFee || ''}
                    onChange={(e) => setNewGrade({ ...newGrade, baseFee: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <button 
                type="submit"
                className="w-full py-3 bg-primary text-white rounded-lg text-xs font-bold shadow-lg shadow-primary/20 hover:bg-primary/95 transition-all flex items-center justify-center gap-2"
              >
                <Icon name="add" /> Register Grade Rate
              </button>
            </form>
          </div>

          {/* Grades List */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
             <div className="p-6 border-b border-slate-200 dark:border-slate-700">
               <h3 className="font-bold text-slate-900 dark:text-white text-base">Configured Grade Levels</h3>
               <p className="text-xs text-slate-550">Master list of school fees structure policies by grade level.</p>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 text-[10px] uppercase font-bold text-slate-500">
                    <tr>
                      <th className="px-6 py-4">Grade / Class</th>
                      <th className="px-6 py-4">Base Fee Rate</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                    {grades.map(g => (
                      <tr key={g.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">{g.name}</td>
                        <td className="px-6 py-4 font-semibold text-slate-500">GH₵{g.baseFee?.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td className="px-6 py-4 text-right flex items-center justify-end gap-3">
                           <button 
                             onClick={() => setEditingGrade(g)}
                             className="text-xs font-bold text-primary hover:underline"
                           >
                             Edit
                           </button>
                           <button 
                             onClick={() => handleDeleteGrade(g.id, g.name)}
                             className="text-xs font-bold text-red-500 hover:underline"
                           >
                             Delete
                           </button>
                        </td>
                      </tr>
                    ))}
                    {grades.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-slate-400 italic">No grade configs defined.</td>
                      </tr>
                    )}
                  </tbody>
               </table>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'courses' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Add Course Form */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm h-fit">
            <h3 className="font-bold text-slate-900 dark:text-white mb-4">Add Course Config</h3>
            <form onSubmit={handleAddCourse} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Course Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Introductory Physics"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary outline-none"
                  value={newCourse.name}
                  onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Course Code</label>
                  <input 
                    type="text" 
                    placeholder="e.g. PHY101"
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-primary outline-none"
                    value={newCourse.code}
                    onChange={(e) => setNewCourse({ ...newCourse, code: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Department</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Science"
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary outline-none"
                    value={newCourse.department}
                    onChange={(e) => setNewCourse({ ...newCourse, department: e.target.value })}
                  />
                </div>
              </div>
              <button 
                type="submit"
                className="w-full py-3 bg-indigo-650 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
              >
                <Icon name="add" /> Register Subject
              </button>
            </form>
          </div>

          {/* Courses List */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
             <div className="p-6 border-b border-slate-200 dark:border-slate-700">
               <h3 className="font-bold text-slate-900 dark:text-white text-base">Subjects & Courses Catalog</h3>
               <p className="text-xs text-slate-500">Master roster of academic curriculum directories.</p>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 text-[10px] uppercase font-bold text-slate-500">
                    <tr>
                      <th className="px-6 py-4">Code</th>
                      <th className="px-6 py-4">Course Name</th>
                      <th className="px-6 py-4">Department</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                    {courses.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="px-6 py-4 font-mono font-bold text-primary">{c.code}</td>
                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">{c.name}</td>
                        <td className="px-6 py-4 text-slate-500 font-semibold">{c.department || 'General'}</td>
                        <td className="px-6 py-4 text-right flex items-center justify-end gap-3">
                           <button 
                             onClick={() => setEditingCourse(c)}
                             className="text-xs font-bold text-primary hover:underline"
                           >
                             Edit
                           </button>
                           <button 
                             onClick={() => handleDeleteCourse(c.id, c.name)}
                             className="text-xs font-bold text-red-500 hover:underline"
                           >
                             Delete
                           </button>
                        </td>
                      </tr>
                    ))}
                    {courses.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-400 italic">No courses config defined.</td>
                      </tr>
                    )}
                  </tbody>
               </table>
             </div>
          </div>
        </div>
      )}

      {/* System Settings Tab */}
      {activeTab === 'system' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Account Security */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Account Security</h3>
              <p className="text-xs text-slate-500 mt-1">Change your administrator password.</p>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Current Password</label>
                <input
                  type="password"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">New Password</label>
                <input
                  type="password"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Confirm New Password</label>
                <input
                  type="password"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={changingPassword}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg text-xs font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                <Icon name={changingPassword ? 'sync' : 'lock_reset'} className={changingPassword ? 'animate-spin' : ''} />
                {changingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>

          {/* Term Configuration */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Academic Calendar Settings</h3>
              <p className="text-xs text-slate-500 mt-1">Configure active school term/semester system parameters.</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Active School Term / Semester</label>
                <select
                  value={currentTerm}
                  onChange={(e) => setCurrentTerm(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                >
                  <option value="Term 1">Term 1</option>
                  <option value="Term 2">Term 2</option>
                  <option value="Term 3">Term 3</option>
                </select>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  Updating this global active term determines where fee invoices are allocated by default when recorded, and updates statements displayed to parents.
                </p>
              </div>

              <button
                onClick={handleSaveTerm}
                disabled={savingTerm}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg text-xs font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                <Icon name={savingTerm ? 'sync' : 'save'} className={savingTerm ? 'animate-spin' : ''} />
                {savingTerm ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>

          {/* Student Promotions tool */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Batch Student Promotions</h3>
              <p className="text-xs text-slate-500 mt-1">Bulk transition student enrollments to new class levels.</p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Promote From</label>
                  <select
                    value={fromClass}
                    onChange={(e) => setFromClass(e.target.value)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                  >
                    <option value="">-- Choose Class --</option>
                    {grades.map(g => (
                      <option key={g.id} value={g.name}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Promote To</label>
                  <select
                    value={toClass}
                    onChange={(e) => setToClass(e.target.value)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                  >
                    <option value="">-- Choose Class --</option>
                    {grades.map(g => (
                      <option key={g.id} value={g.name}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-900/40">
                <p className="text-xs text-slate-550 leading-relaxed font-semibold">
                  <Icon name="warning" className="text-amber-500 inline mr-1 text-sm align-middle animate-pulse" />
                  <strong>Real-Time Allocation Notice</strong>: This operation updates the grade records for all students in the source class. The students will be moved immediately, making them available in the dashboards of the destination class instructors.
                </p>
              </div>

              <button
                onClick={handlePromote}
                disabled={promoting || !fromClass || !toClass}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-primary to-indigo-600 text-white rounded-lg text-xs font-bold shadow-lg shadow-primary/20 hover:from-primary/95 hover:to-indigo-700 transition-all disabled:opacity-50"
              >
                <Icon name={promoting ? 'sync' : 'arrow_forward'} className={promoting ? 'animate-spin' : ''} />
                {promoting ? 'Promoting...' : 'Execute Batch Promotion'}
              </button>
            </div>
          </div>

          {/* Activity Logs Confirmation Feed */}
          <div className="md:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
             <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                   <h3 className="font-bold text-slate-900 dark:text-white text-base">System Audit & Promotion Logs</h3>
                   <p className="text-xs text-slate-555">Real-time confirmation logs of configuration adjustments and promotions.</p>
                </div>
                <Icon name="history" className="text-slate-400 text-xl" />
             </div>
             
             <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-80 overflow-y-auto">
                {auditLogs.filter(log => log.type === 'config_change' || log.action?.toLowerCase().includes('promotion')).map((log, i) => (
                   <div key={log.id || i} className="p-5 flex items-start gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <div className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${log.action?.toLowerCase().includes('promotion') ? 'bg-indigo-50 text-indigo-650 dark:bg-indigo-900/20 dark:text-indigo-400' : 'bg-primary/5 text-primary'}`}>
                         <Icon name={log.action?.toLowerCase().includes('promotion') ? 'trending_up' : 'settings'} className="text-base" />
                      </div>
                      <div className="flex-1 min-w-0">
                         <div className="flex justify-between items-start gap-2">
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase">{log.action}</p>
                            <span className="text-[10px] font-bold text-slate-400 shrink-0">
                               {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : new Date(log.timestamp).toLocaleString()}
                            </span>
                         </div>
                         <p className="text-xs text-slate-550 dark:text-slate-400 mt-1 font-medium">{log.details}</p>
                         <p className="text-[10px] text-slate-400 mt-1 font-semibold flex items-center gap-1">
                            <Icon name="person" className="text-xs" /> Executed by: {log.userName || log.userEmail || 'System'}
                         </p>
                      </div>
                   </div>
                ))}
                {auditLogs.filter(log => log.type === 'config_change' || log.action?.toLowerCase().includes('promotion')).length === 0 && (
                   <div className="p-8 text-center text-xs text-slate-500 italic">No activity logs recorded yet.</div>
                )}
             </div>
          </div>
        </div>
      )}

      {/* Edit Grade Modal */}
      {editingGrade && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">Edit Grade Details</h3>
                <p className="text-xs text-slate-555 mt-0.5">Modify base fee policies for {editingGrade.name}</p>
              </div>
              <button 
                onClick={() => setEditingGrade(null)}
                className="size-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <Icon name="close" />
              </button>
            </div>
            
            <form onSubmit={handleEditGrade}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Grade Level Name</label>
                  <input 
                    type="text" 
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-950 dark:text-white focus:ring-primary focus:border-primary outline-none"
                    value={editingGrade.name}
                    onChange={(e) => setEditingGrade({ ...editingGrade, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Base Tuition Rate (GHS)</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">GH₵</span>
                    <input 
                      type="number" 
                      className="w-full pl-14 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                      value={editingGrade.baseFee}
                      onChange={(e) => setEditingGrade({ ...editingGrade, baseFee: parseFloat(e.target.value) || 0 })}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setEditingGrade(null)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-655 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-bold transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold shadow-lg shadow-primary/20 hover:bg-primary/95 transition-all"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Course Modal */}
      {editingCourse && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">Edit Course Details</h3>
                <p className="text-xs text-slate-555 mt-0.5">Modify parameters for {editingCourse.code}</p>
              </div>
              <button 
                onClick={() => setEditingCourse(null)}
                className="size-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <Icon name="close" />
              </button>
            </div>
            
            <form onSubmit={handleEditCourse}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Course Name</label>
                  <input 
                    type="text" 
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                    value={editingCourse.name}
                    onChange={(e) => setEditingCourse({ ...editingCourse, name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Code</label>
                    <input 
                      type="text" 
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-500 outline-none cursor-not-allowed"
                      value={editingCourse.code}
                      disabled
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Department</label>
                    <input 
                      type="text" 
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                      value={editingCourse.department}
                      onChange={(e) => setEditingCourse({ ...editingCourse, department: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setEditingCourse(null)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-bold transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-200 transition-all"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

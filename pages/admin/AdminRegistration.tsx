import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';

export const AdminRegistration: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'student' | 'teacher' | 'roster'>('student');
  const [generatedId, setGeneratedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recentMembers, setRecentMembers] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [rosterSearch, setRosterSearch] = useState('');
  const [memberExtraInfo, setMemberExtraInfo] = useState<{
    attendance?: any;
    fees?: any[];
    reports?: any[];
  }>({});

  const [availableGrades, setAvailableGrades] = useState<any[]>([]);
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  
  // Student Form State
  const [studentForm, setStudentForm] = useState({
    name: '',
    age: '',
    parentName: '',
    parentContact: '',
    classId: '',
    parentId: 'temp-parent-id'
  });

  // Teacher Form State
  const [teacherForm, setTeacherForm] = useState({
    name: '',
    email: '',
    qualification: '',
    subjects: ['Mathematics'],
    assignedClasses: [] as string[],
    assignedCourses: [] as string[]
  });

  useEffect(() => {
    // Helper to extract a sortable time value
    const getTime = (m: any) => {
        if (m.createdAt?.toMillis) return m.createdAt.toMillis();
        if (m.createdAt?.seconds) return m.createdAt.seconds * 1000;
        return Date.now(); // Fallback for optimistic updates
    };

    const unsubStudents = firestoreService.getStudents((data) => {
        setAllStudents(data);
        setRecentMembers(prev => {
            const teacherOnly = prev.filter(m => m.type === 'Teacher');
            const newStudents = data.map(s => ({ ...s, type: 'Student' }));
            return [...teacherOnly, ...newStudents].sort((a,b) => getTime(b) - getTime(a)).slice(0, 10);
        });
    });

    const unsubTeachers = firestoreService.getTeachers((data) => {
        setRecentMembers(prev => {
            const studentOnly = prev.filter(m => m.type === 'Student');
            const newTeachers = data.map(t => ({ ...t, type: 'Teacher' }));
            return [...studentOnly, ...newTeachers].sort((a,b) => getTime(b) - getTime(a)).slice(0, 10);
        });
    });

    const unsubGrades = firestoreService.getGrades((data) => setAvailableGrades(data));
    const unsubCourses = firestoreService.getCourses((data) => setAvailableCourses(data));

    setLoadingMembers(false);
    return () => {
        unsubStudents();
        unsubTeachers();
        unsubGrades();
        unsubCourses();
    }
  }, []);

  useEffect(() => {
    if (selectedMember) {
      // Find the latest data for this member in our existing recentMembers list
      // This ensures that if loginId was added a split second later, we see it
      const matchingMember = recentMembers.find(m => m.id === selectedMember.id);
      if (matchingMember && matchingMember.loginId !== selectedMember.loginId) {
        setSelectedMember(matchingMember);
      }
    }
  }, [recentMembers, selectedMember]);

  useEffect(() => {
    if (selectedMember && selectedMember.type === 'Student') {
      const unsubAttendance = firestoreService.getStudentAttendanceSummary(
        selectedMember.id, 
        selectedMember.parentId, 
        (data) => setMemberExtraInfo(prev => ({ ...prev, attendance: data }))
      );
      const unsubFees = firestoreService.getFeesForStudent(
        selectedMember.id, 
        (data) => setMemberExtraInfo(prev => ({ ...prev, fees: data }))
      );
      const unsubReports = firestoreService.pocketGetStudentReports(
        selectedMember.id,
        (data) => setMemberExtraInfo(prev => ({ ...prev, reports: data }))
      );

      return () => {
        unsubAttendance();
        unsubFees();
        unsubReports();
      };
    } else {
      setMemberExtraInfo({});
    }
  }, [selectedMember]);

  const handleRegister = async () => {
      setIsSubmitting(true);
      try {
        if (editingId) {
            if (activeTab === 'student') {
                await firestoreService.updateStudent(editingId, {
                    ...studentForm,
                    grade: studentForm.classId
                });
                if (user) {
                  await firestoreService.logActivity({
                    userId: user.uid,
                    userEmail: user.email || '',
                    userName: user.name || '',
                    action: 'Student Profile Update',
                    details: `Updated student profile for ${studentForm.name} (ID/Class: ${studentForm.classId})`,
                    type: 'registration'
                  });
                }
            } else {
                await firestoreService.updateUser(editingId, {
                    ...teacherForm
                });
                if (user) {
                  await firestoreService.logActivity({
                    userId: user.uid,
                    userEmail: user.email || '',
                    userName: user.name || '',
                    action: 'Teacher Profile Update',
                    details: `Updated teacher profile for ${teacherForm.name} (Email: ${teacherForm.email})`,
                    type: 'registration'
                  });
                }
            }
            setEditingId(null);
            resetForm();
            return;
        }

        let newMemberId = '';
        if (activeTab === 'student') {
            // Pre-calculate the Login ID using a fresh document ID to make it ATOMIC
            const studentId = firestoreService.generateId('students');
            newMemberId = `STU${new Date().getFullYear()}${studentId.slice(0, 4).toUpperCase()}`;
            
            await firestoreService.registerStudentWithId(studentId, {
              ...studentForm,
              grade: studentForm.classId,
              loginId: newMemberId
            });

            if (user) {
              await firestoreService.logActivity({
                userId: user.uid,
                userEmail: user.email || '',
                userName: user.name || '',
                action: 'Student Registration',
                details: `Registered new student ${studentForm.name} with Login ID ${newMemberId}`,
                type: 'registration'
              });
            }
        } else {
            // Same for teachers
            const teacherId = firestoreService.generateId('users');
            newMemberId = `T${Math.floor(100 + Math.random() * 900)}`;
            
            await firestoreService.registerTeacherWithId(teacherId, {
              ...teacherForm,
              role: 'Teacher',
              loginId: newMemberId,
              avatar: `https://picsum.photos/seed/${teacherId}/100`
            });

            if (user) {
              await firestoreService.logActivity({
                userId: user.uid,
                userEmail: user.email || '',
                userName: user.name || '',
                action: 'Teacher Registration',
                details: `Registered new teacher ${teacherForm.name} (Login ID: ${newMemberId})`,
                type: 'registration'
              });
            }
        }

        setGeneratedId(newMemberId);
        resetForm();
      } catch (err) {
        console.error("Registration failed:", err);
        alert("Registration failed. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
  };

  const resetForm = () => {
    setStudentForm({
      name: '',
      age: '',
      parentName: '',
      parentContact: '',
      classId: '',
      parentId: 'temp-parent-id'
    });
    setTeacherForm({
      name: '',
      email: '',
      qualification: '',
      subjects: ['Mathematics'],
      assignedClasses: [],
      assignedCourses: []
    });
  };

  const startEdit = (member: any) => {
      setEditingId(member.id);
      if (member.type === 'Student') {
          setActiveTab('student');
          setStudentForm({
              name: member.name,
              age: member.age ? String(member.age) : '',
              parentName: member.parentName || '',
              parentContact: member.parentContact || '',
              classId: member.classId || '',
              parentId: member.parentId || 'temp-parent-id'
          });
      } else {
          setActiveTab('teacher');
          setTeacherForm({
              name: member.name,
              email: member.email || '',
              qualification: member.qualification || '',
              subjects: member.subjects || ['Mathematics'],
              assignedClasses: member.assignedClasses || [],
              assignedCourses: member.assignedCourses || []
          });
      }
  };

  // Grouped students sorted by class/grade
  const groupedStudents = useMemo(() => {
    const filtered = allStudents.filter(s => s.name.toLowerCase().includes(rosterSearch.toLowerCase()));
    const groups: { [key: string]: any[] } = {};
    
    filtered.forEach(student => {
      const key = student.classId || 'Unassigned';
      if (!groups[key]) groups[key] = [];
      groups[key].push(student);
    });

    return Object.keys(groups).sort().reduce((acc, key) => {
      acc[key] = groups[key].sort((a, b) => a.name.localeCompare(b.name));
      return acc;
    }, {} as { [key: string]: any[] });
  }, [allStudents, rosterSearch]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header Block */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
             <span className="font-bold text-slate-900 dark:text-white">Admin Portal</span>
             <span>/</span>
             <span className="font-medium text-primary">Credential Management</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">Onboard & Directory</h1>
          <p className="text-sm text-slate-500">Register new academic participants and view student directory tables.</p>
        </div>

        <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200/50 dark:border-slate-700/30 w-fit shrink-0">
             <button 
               onClick={() => { if(!editingId) setActiveTab('student'); }}
               className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'student' ? 'bg-white dark:bg-slate-700 shadow-md text-primary dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'} ${editingId ? 'opacity-50 cursor-not-allowed' : ''}`}
             >
                 <Icon name="person_add" /> Student Registration
             </button>
             <button 
               onClick={() => { if(!editingId) setActiveTab('teacher'); }}
               className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'teacher' ? 'bg-white dark:bg-slate-700 shadow-md text-primary dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'} ${editingId ? 'opacity-50 cursor-not-allowed' : ''}`}
             >
                 <Icon name="co_present" /> Teacher Registration
             </button>
             <button 
               onClick={() => { if(!editingId) setActiveTab('roster'); }}
               className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'roster' ? 'bg-white dark:bg-slate-700 shadow-md text-primary dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'} ${editingId ? 'opacity-50 cursor-not-allowed' : ''}`}
             >
                 <Icon name="groups" /> Student Roster
             </button>
        </div>
      </div>

      {generatedId && (
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 p-6 rounded-2xl flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex gap-4">
                <div className="size-12 bg-emerald-500 text-white rounded-xl flex items-center justify-center text-xl shrink-0">
                    <Icon name="check_circle" />
                </div>
                <div>
                    <h3 className="font-bold text-emerald-950 dark:text-emerald-300">Member Onboarded Successfully</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Database records synced. Write down this generated Login Access ID:
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                       <code className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 rounded font-mono font-black text-sm">{generatedId}</code>
                       <button onClick={() => { navigator.clipboard.writeText(generatedId); alert('Copied to clipboard!'); }} className="text-xs font-bold text-primary hover:underline">Copy</button>
                    </div>
                </div>
            </div>
            <button onClick={() => setGeneratedId(null)} className="text-slate-400 hover:text-slate-600"><Icon name="close" /></button>
        </div>
      )}

      {/* Main Tab Render blocks */}
      {activeTab === 'student' && (
          <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
              {editingId && (
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/40 p-4 rounded-xl flex justify-between items-center">
                      <div className="flex gap-3 items-center">
                          <div className="size-8 bg-primary rounded-lg flex items-center justify-center text-white">
                              <Icon name="edit" />
                          </div>
                          <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white">Editing Mode Active</p>
                              <p className="text-xs text-slate-550">Updating student profile for {studentForm.name}</p>
                          </div>
                      </div>
                      <button onClick={resetForm} className="text-xs font-black text-slate-400 uppercase hover:text-slate-600 transition-colors">Cancel Edit</button>
                  </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
                      <input 
                          type="text" 
                          placeholder="e.g. John Doe" 
                          className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                          value={studentForm.name}
                          onChange={(e) => setStudentForm({...studentForm, name: e.target.value})}
                      />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Age</label>
                      <input 
                          type="number" 
                          className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                          value={studentForm.age}
                          onChange={(e) => setStudentForm({...studentForm, age: e.target.value})}
                      />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Parent/Guardian</label>
                      <input 
                          type="text" 
                          className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                          value={studentForm.parentName}
                          onChange={(e) => setStudentForm({...studentForm, parentName: e.target.value})}
                      />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Guardian Contact / Phone</label>
                      <input 
                          type="text" 
                          className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                          placeholder="e.g. +233 24 123 4567"
                          value={studentForm.parentContact}
                          onChange={(e) => setStudentForm({...studentForm, parentContact: e.target.value})}
                      />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Assigned Class / Grade</label>
                      <select 
                          className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                          value={studentForm.classId}
                          onChange={(e) => setStudentForm({...studentForm, classId: e.target.value})}
                      >
                          <option value="">Select Grade</option>
                          {availableGrades.map(g => (
                              <option key={g.id} value={g.name}>{g.name}</option>
                          ))}
                          {availableGrades.length === 0 && (
                              <option value="" disabled>No grades configured in Settings</option>
                          )}
                      </select>
                      <p className="text-[10px] text-slate-450 mt-1 italic">Fees are set by the administration in Settings.</p>
                  </div>
              </div>
              <div className="flex justify-end pt-4">
                  <button 
                      onClick={handleRegister} 
                      disabled={isSubmitting || !studentForm.name}
                      className="px-8 py-3 bg-primary text-white font-bold rounded-lg shadow-lg hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50 text-sm"
                  >
                      {isSubmitting ? <Icon name="sync" className="animate-spin" /> : editingId ? <Icon name="save" /> : <Icon name="person_add" />}
                      {isSubmitting ? 'Syncing...' : editingId ? 'Update Credentials' : 'Register Student'}
                  </button>
              </div>
          </div>
      )}

      {activeTab === 'teacher' && (
          <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
              {editingId && (
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/40 p-4 rounded-xl flex justify-between items-center">
                      <div className="flex gap-3 items-center">
                          <div className="size-8 bg-primary rounded-lg flex items-center justify-center text-white">
                              <Icon name="edit" />
                          </div>
                          <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white">Editing Mode Active</p>
                              <p className="text-xs text-slate-550">Updating teacher profile for {teacherForm.name}</p>
                          </div>
                      </div>
                      <button onClick={resetForm} className="text-xs font-black text-slate-400 uppercase hover:text-slate-600 transition-colors">Cancel Edit</button>
                  </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Teacher Name</label>
                      <input 
                          type="text" 
                          placeholder="e.g. Mrs. Emily Mensah" 
                          className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                          value={teacherForm.name}
                          onChange={(e) => setTeacherForm({...teacherForm, name: e.target.value})}
                      />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
                      <input 
                          type="email" 
                          placeholder="e.g. emily@school.edu" 
                          className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                          value={teacherForm.email}
                          onChange={(e) => setTeacherForm({...teacherForm, email: e.target.value})}
                      />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Qualification / Degree</label>
                      <input 
                          type="text" 
                          placeholder="e.g. Bachelor of Education" 
                          className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                          value={teacherForm.qualification}
                          onChange={(e) => setTeacherForm({...teacherForm, qualification: e.target.value})}
                      />
                  </div>

                  {/* Assigned Classes Multi-check */}
                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Assigned Class / Grade Levels</label>
                      <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg max-h-40 overflow-y-auto space-y-2">
                         {availableGrades.map(g => (
                            <label key={g.id} className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={teacherForm.assignedClasses.includes(g.name)}
                                  onChange={(e) => {
                                      const list = e.target.checked 
                                        ? [...teacherForm.assignedClasses, g.name]
                                        : teacherForm.assignedClasses.filter(c => c !== g.name);
                                      setTeacherForm({ ...teacherForm, assignedClasses: list });
                                  }}
                                  className="w-4 h-4 text-primary bg-slate-100 rounded focus:ring-primary"
                                />
                                {g.name}
                            </label>
                         ))}
                         {availableGrades.length === 0 && <span className="text-[10px] text-slate-400 italic">No grades found. Please configure them in Settings.</span>}
                      </div>
                  </div>

                  {/* Assigned Courses Catalog Check */}
                  <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Assigned Courses / Subjects</label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg max-h-40 overflow-y-auto">
                         {availableCourses.map(c => (
                            <label key={c.id} className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={teacherForm.assignedCourses.includes(c.code)}
                                  onChange={(e) => {
                                      const list = e.target.checked 
                                        ? [...teacherForm.assignedCourses, c.code]
                                        : teacherForm.assignedCourses.filter(code => code !== c.code);
                                      setTeacherForm({ ...teacherForm, assignedCourses: list });
                                  }}
                                  className="w-4 h-4 text-primary bg-slate-100 rounded focus:ring-primary"
                                />
                                <div>
                                   <p className="font-black text-[10px] text-primary">{c.code}</p>
                                   <p className="font-semibold text-slate-500 text-[11px] truncate w-32">{c.name}</p>
                                </div>
                            </label>
                         ))}
                         {availableCourses.length === 0 && <span className="text-[10px] text-slate-400 italic">No courses found.</span>}
                      </div>
                  </div>
              </div>
              <div className="flex justify-end pt-4">
                  <button 
                      onClick={handleRegister} 
                      disabled={isSubmitting || !teacherForm.name || !teacherForm.email}
                      className="px-8 py-3 bg-primary text-white font-bold rounded-lg shadow-lg hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50 text-sm"
                  >
                      {isSubmitting ? <Icon name="sync" className="animate-spin" /> : editingId ? <Icon name="save" /> : <Icon name="school" />}
                      {isSubmitting ? 'Syncing...' : editingId ? 'Update Credentials' : 'Register Teacher'}
                  </button>
              </div>
          </div>
      )}

      {/* Student Roster Tab */}
      {activeTab === 'roster' && (
          <div className="space-y-6 max-w-6xl mx-auto">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-lg">School Student Roster</h3>
                      <p className="text-xs text-slate-500 mt-1">Complete enrollment sheet grouped by assigned class levels.</p>
                  </div>
                  <div className="relative w-full md:w-80">
                      <Icon name="search" className="absolute left-3 top-2.5 text-slate-400 text-sm" />
                      <input 
                          type="text" 
                          placeholder="Search student by name..." 
                          value={rosterSearch}
                          onChange={(e) => setRosterSearch(e.target.value)}
                          className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 focus:ring-primary outline-none text-slate-900 dark:text-white font-semibold" 
                      />
                  </div>
              </div>

              <div className="space-y-8">
                  {Object.keys(groupedStudents).map(className => (
                      <div key={className} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                          <div className="p-5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-205 dark:border-slate-750 flex items-center justify-between">
                              <h4 className="font-bold text-slate-850 dark:text-slate-100 flex items-center gap-2">
                                  <Icon name="school" className="text-primary text-lg" />
                                  {className}
                              </h4>
                              <span className="px-2.5 py-0.5 bg-primary/10 text-primary rounded-md text-[10px] font-black uppercase">
                                  {groupedStudents[className].length} {groupedStudents[className].length === 1 ? 'Student' : 'Students'}
                              </span>
                          </div>

                          <div className="overflow-x-auto">
                              <table className="w-full text-left">
                                  <thead className="bg-slate-50/50 dark:bg-slate-900/20 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100 dark:border-slate-800">
                                      <tr>
                                          <th className="px-6 py-3.5">Full Name</th>
                                          <th className="px-6 py-3.5">Admission Number</th>
                                          <th className="px-6 py-3.5">Access Login ID</th>
                                          <th className="px-6 py-3.5">Parent/Guardian</th>
                                          <th className="px-6 py-3.5">Guardian Contact</th>
                                          <th className="px-6 py-3.5 text-right">Actions</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                      {groupedStudents[className].map((student, i) => (
                                          <tr key={student.id || i} className="hover:bg-slate-50/80 dark:hover:bg-slate-850/40 transition-colors">
                                              <td className="px-6 py-4">
                                                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{student.name}</span>
                                              </td>
                                              <td className="px-6 py-4 text-xs font-semibold text-slate-500">
                                                  {student.admissionNumber || 'N/A'}
                                              </td>
                                              <td className="px-6 py-4">
                                                  <span className="text-xs font-mono font-black text-primary px-2 py-0.5 bg-primary/5 rounded border border-primary/10">
                                                      {student.loginId || 'SYNCING...'}
                                                  </span>
                                              </td>
                                              <td className="px-6 py-4 text-xs font-bold text-slate-600 dark:text-slate-350">
                                                  {student.parentName || 'N/A'}
                                              </td>
                                              <td className="px-6 py-4 text-xs text-slate-500">
                                                  {student.parentContact || 'N/A'}
                                              </td>
                                              <td className="px-6 py-4 text-right flex items-center justify-end gap-3.5">
                                                  <button 
                                                      onClick={() => startEdit({ ...student, type: 'Student' })}
                                                      className="text-[10px] font-black text-slate-400 uppercase hover:text-primary transition-colors flex items-center gap-1"
                                                  >
                                                      <Icon name="edit" className="text-sm" /> Edit
                                                  </button>
                                                  <button 
                                                      onClick={() => setSelectedMember({ ...student, type: 'Student' })}
                                                      className="text-[10px] font-black text-primary uppercase hover:underline"
                                                  >
                                                      View File
                                                  </button>
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  ))}

                  {Object.keys(groupedStudents).length === 0 && (
                      <div className="p-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-center text-slate-400 italic">
                          No students found matching your search term.
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* Recent Onboardings (Hidden in roster view to keep it clean) */}
      {activeTab !== 'roster' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-slate-900 dark:text-white">Recently Registered Members</h3>
            <p className="text-xs text-slate-500">Live feed of latest synchronization with the Central Register.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-[10px] uppercase font-bold text-slate-500">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Login Access ID</th>
                  <th className="px-6 py-4">Date Added</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                 {recentMembers.map((member, i) => (
                    <tr key={member.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-6 py-4">
                         <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{member.name}</span>
                      </td>
                      <td className="px-6 py-4">
                         <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${member.type === 'Student' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                           {member.type}
                         </span>
                      </td>
                      <td className="px-6 py-4">
                         <span className="text-xs font-mono font-black text-primary px-2 py-1 bg-primary/5 rounded border border-primary/10">
                            {member.loginId || member.id?.slice(0, 8).toUpperCase() || 'SYNCING...'}
                         </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-500">
                        {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : 'Just now'}
                      </td>
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-4">
                         <button 
                           onClick={() => startEdit(member)}
                           className="text-[10px] font-black text-slate-400 uppercase hover:text-primary transition-colors flex items-center gap-1"
                         >
                           <Icon name="edit" className="text-sm" /> Edit
                         </button>
                         <button 
                           onClick={() => setSelectedMember(member)}
                           className="text-[10px] font-black text-primary uppercase hover:underline"
                         >
                           View File
                         </button>
                      </td>
                    </tr>
                 ))}
                 {recentMembers.length === 0 && (
                   <tr>
                     <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No members registered in this session yet.</td>
                   </tr>
                 )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Selected Member Detail Dialog */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="bg-white dark:bg-[#1a202c] rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col border border-slate-200 dark:border-slate-800">
             {/* Modal Header */}
             <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/20">
                <div className="flex items-center gap-4">
                   <div className={`size-12 rounded-2xl flex items-center justify-center text-2xl ${selectedMember.type === 'Student' ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-500'}`}>
                      <Icon name={selectedMember.type === 'Student' ? 'person' : 'work_history'} />
                   </div>
                   <div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selectedMember.name}</h3>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedMember.type} • Profile Record</p>
                   </div>
                </div>
                <button 
                  onClick={() => setSelectedMember(null)} 
                  className="size-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 transition-colors"
                >
                   <Icon name="close" />
                </button>
             </div>

             {/* Modal Body */}
             <div className="flex-1 overflow-y-auto p-8 space-y-8">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-100 dark:border-slate-800/80">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Access System ID</p>
                       <p className="text-sm font-mono font-bold text-primary">{selectedMember.loginId || 'N/A'}</p>
                    </div>
                    {selectedMember.type === 'Student' ? (
                       <>
                          <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-100 dark:border-slate-800/80">
                             <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Assigned Grade</p>
                             <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{selectedMember.classId || 'Unassigned'}</p>
                          </div>
                          <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-100 dark:border-slate-800/80">
                             <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Student Age</p>
                             <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{selectedMember.age || 'N/A'} yrs old</p>
                          </div>
                       </>
                    ) : (
                       <>
                          <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-100 dark:border-slate-800/80">
                             <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Credentials Email</p>
                             <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{selectedMember.email}</p>
                          </div>
                          <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-100 dark:border-slate-800/80">
                             <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Highest Qualification</p>
                             <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{selectedMember.qualification || 'N/A'}</p>
                          </div>
                       </>
                    )}
                 </div>

                 {selectedMember.type === 'Student' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-4">
                          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                             <Icon name="family_restroom" /> Parent / Guardian Info
                          </h4>
                          <div className="p-6 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/85 rounded-3xl space-y-4">
                             <div>
                               <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Guardian Fullname</p>
                               <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{selectedMember.parentName || 'N/A'}</p>
                             </div>
                             <div>
                               <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Emergency Contact</p>
                               <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{selectedMember.parentContact || 'Private'}</p>
                             </div>
                          </div>
                       </div>

                       <div className="space-y-4">
                          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                             <Icon name="monitoring" /> Student Performance Stubs
                          </h4>
                          <div className="p-6 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/85 rounded-3xl space-y-4">
                             <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold text-slate-555">Attendance Rate:</span>
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                   {memberExtraInfo.attendance ? `${memberExtraInfo.attendance.rate}% (${memberExtraInfo.attendance.present}/${memberExtraInfo.attendance.total} days)` : 'N/A'}
                                </span>
                             </div>
                             <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold text-slate-555">Outstanding Fees:</span>
                                <span className="text-sm font-bold text-red-600">
                                   {memberExtraInfo.fees ? `GH₵${memberExtraInfo.fees.reduce((acc, curr) => acc + (parseFloat(curr.totalAmount) - parseFloat(curr.amountPaid)), 0).toLocaleString()}` : 'N/A'}
                                </span>
                             </div>
                             <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold text-slate-555">Term Grade Report Cards:</span>
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                   {memberExtraInfo.reports ? `${memberExtraInfo.reports.length} Reports` : 'N/A'}
                                </span>
                             </div>
                          </div>
                       </div>
                    </div>
                 ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-4">
                          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                             <Icon name="class" /> Classes Assigned
                          </h4>
                          <div className="p-6 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/85 rounded-3xl flex flex-wrap gap-2">
                             {selectedMember.assignedClasses?.map((cls: string) => (
                                <span key={cls} className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-xs font-bold">{cls}</span>
                             )) || <span className="text-xs text-slate-400 italic">No classes assigned</span>}
                          </div>
                       </div>

                       <div className="space-y-4">
                          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                             <Icon name="auto_stories" /> Subjects / Courses Taught
                          </h4>
                          <div className="p-6 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/85 rounded-3xl flex flex-wrap gap-2">
                             {selectedMember.assignedCourses?.map((crs: string) => (
                                <span key={crs} className="px-3 py-1 bg-amber-500/10 text-amber-600 rounded-lg text-xs font-bold">{crs}</span>
                             )) || <span className="text-xs text-slate-400 italic">No courses assigned</span>}
                          </div>
                       </div>
                    </div>
                 )}
             </div>

             {/* Modal Footer */}
             <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 rounded-b-[2.5rem]">
                <button 
                  onClick={() => setSelectedMember(null)}
                  className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-colors"
                >
                   Close Record File
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

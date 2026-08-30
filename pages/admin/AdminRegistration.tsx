import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';
import { WorkSurface } from '../../components/Layouts';
import {
  Avatar, Badge, Button, Card, Chip, Drawer, EmptyState, feeBilled, feePaid, Field, ghs, InlineNote, Input, NoResults,
  PageHeader, SectionHeading, Select, SkeletonTable, Tabs, Td, Th, type Tint,
} from '../../components/ui';

type Tab = 'student' | 'teacher' | 'parent' | 'roster';

const TYPE_TINT: Record<string, Tint> = { Student: 'blue', Teacher: 'lilac', Parent: 'peach' };

/** One-time credentials must be readable and copyable — never trapped in an alert(). */
const CredentialRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">{label}</p>
        <p className="mt-1 text-base font-bold tracking-[-0.01em] text-slate-900 dark:text-white break-all">{value}</p>
      </div>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
        className="size-9 shrink-0 rounded-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 hover:text-primary flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Icon name={copied ? 'check' : 'copy'} className="text-[16px]" />
      </button>
    </div>
  );
};

export const AdminRegistration: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('student');
  const [generatedId, setGeneratedId] = useState<string | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recentMembers, setRecentMembers] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [allParents, setAllParents] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [rosterSearch, setRosterSearch] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; password: string } | null>(null);
  const [memberExtraInfo, setMemberExtraInfo] = useState<{ attendance?: any; fees?: any[]; reports?: any[] }>({});

  const [allTeachers, setAllTeachers] = useState<any[]>([]);
  const [availableGrades, setAvailableGrades] = useState<any[]>([]);
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);

  const [studentForm, setStudentForm] = useState({ name: '', age: '', parentName: '', parentContact: '', classId: '', parentId: '' });
  const [teacherForm, setTeacherForm] = useState({
    name: '',
    email: '',
    qualification: '',
    subjects: ['Mathematics'],
    assignedClasses: [] as string[],
    assignedCourses: [] as string[],
  });
  const [parentForm, setParentForm] = useState({ name: '', email: '', contact: '' });
  // (class, course) pairs — replaces the old two flat lists, which multiplied out
  // into "teaches every one of their subjects in every one of their classes".
  const [teacherAssignments, setTeacherAssignments] = useState<{ classId: string; courseCode: string }[]>([]);
  // Which class this teacher is the CLASS TEACHER of — a different thing from the
  // classes they teach in. The class teacher is the one who merges every subject
  // teacher's marks into a report card, so it lives on the grade, not the user.
  const [classTeacherOf, setClassTeacherOf] = useState('');

  useEffect(() => {
    const getTime = (m: any) => {
      if (m.createdAt) {
        const parsed = new Date(m.createdAt).getTime();
        if (!Number.isNaN(parsed)) return parsed;
      }
      return Date.now();
    };

    const unsubStudents = firestoreService.getStudents((data) => {
      setAllStudents(data);
      setRecentMembers((prev) => {
        const rest = prev.filter((m) => m.type !== 'Student');
        return [...rest, ...data.map((s) => ({ ...s, type: 'Student' }))].sort((a, b) => getTime(b) - getTime(a)).slice(0, 10);
      });
    });
    const unsubTeachers = firestoreService.getTeachers((data) => {
      setAllTeachers(data);
      setRecentMembers((prev) => {
        const rest = prev.filter((m) => m.type !== 'Teacher');
        return [...rest, ...data.map((t) => ({ ...t, id: t.uid, type: 'Teacher' }))]
          .sort((a, b) => getTime(b) - getTime(a))
          .slice(0, 10);
      });
    });
    const unsubGrades = firestoreService.getGrades(setAvailableGrades);
    const unsubCourses = firestoreService.getCourses(setAvailableCourses);
    const unsubParents = firestoreService.getParents((data) => {
      setAllParents(data);
      setRecentMembers((prev) => {
        const rest = prev.filter((m) => m.type !== 'Parent');
        return [...rest, ...data.map((p) => ({ ...p, id: p.uid, type: 'Parent' }))]
          .sort((a, b) => getTime(b) - getTime(a))
          .slice(0, 10);
      });
    });

    setLoadingMembers(false);
    return () => {
      unsubStudents();
      unsubTeachers();
      unsubGrades();
      unsubCourses();
      unsubParents();
    };
  }, []);

  // Keep the open detail panel in step when a loginId lands a moment later.
  useEffect(() => {
    if (!selectedMember) return;
    const match = recentMembers.find((m) => m.id === selectedMember.id);
    if (match && match.loginId !== selectedMember.loginId) setSelectedMember(match);
  }, [recentMembers, selectedMember]);

  useEffect(() => {
    if (selectedMember?.type !== 'Student') {
      setMemberExtraInfo({});
      return;
    }
    const unsubAttendance = firestoreService.getStudentAttendanceSummary(selectedMember.id, selectedMember.parentId, (data) =>
      setMemberExtraInfo((prev) => ({ ...prev, attendance: data })),
    );
    const unsubFees = firestoreService.getFeesForStudent(selectedMember.id, (data) =>
      setMemberExtraInfo((prev) => ({ ...prev, fees: data })),
    );
    const unsubReports = firestoreService.pocketGetStudentReports(selectedMember.id, (data) =>
      setMemberExtraInfo((prev) => ({ ...prev, reports: data })),
    );
    return () => {
      unsubAttendance();
      unsubFees();
      unsubReports();
    };
  }, [selectedMember]);

  const log = (action: string, details: string) =>
    user
      ? firestoreService.logActivity({
          userId: user.uid,
          userEmail: user.email || '',
          userName: user.name || '',
          action,
          details,
          type: 'registration',
        })
      : Promise.resolve();

  const resetForm = () => {
    setStudentForm({ name: '', age: '', parentName: '', parentContact: '', classId: '', parentId: '' });
    setTeacherForm({ name: '', email: '', qualification: '', subjects: ['Mathematics'], assignedClasses: [], assignedCourses: [] });
    setParentForm({ name: '', email: '', contact: '' });
    setTeacherAssignments([]);
    setClassTeacherOf('');
    setParentSearch('');
  };

  // Naming the person who is about to lose the role: silently reassigning it would
  // strip their access to that class's report cards with nothing on screen to say so.
  const displacedClassTeacher = (() => {
    if (!classTeacherOf) return null;
    const target = availableGrades.find((g: any) => g.name === classTeacherOf);
    const holder = target?.classTeacherId;
    if (!holder || holder === editingId) return null;
    const person = allTeachers.find((t: any) => (t.uid || t.id) === holder);
    return person?.name || 'Another teacher';
  })();

  /**
   * Applies the class-teacher choice to grade_configs: clears whatever class this
   * teacher held before, then claims the new one. Done after the user record
   * exists, because the column carries a foreign key to users(uid).
   */
  const applyClassTeacher = async (teacherId: string, gradeName: string) => {
    const previous = availableGrades.filter((g: any) => g.classTeacherId === teacherId && g.name !== gradeName);
    for (const g of previous) {
      await firestoreService.createGradeConfig(g.id, {
        name: g.name,
        baseFee: g.baseFee,
        classTeacherId: null,
        updatedAt: new Date().toISOString(),
      });
    }
    if (!gradeName) return;
    const target = availableGrades.find((g: any) => g.name === gradeName);
    if (!target || target.classTeacherId === teacherId) return;
    await firestoreService.createGradeConfig(target.id, {
      name: target.name,
      baseFee: target.baseFee,
      classTeacherId: teacherId,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleRegister = async () => {
    setError(null);
    const validAssignments = teacherAssignments.filter((a) => a.classId && a.courseCode);
    if (activeTab === 'student' && !studentForm.parentId) {
      setError('Select a parent or guardian for this student. If they are not registered yet, use the Parent tab first.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        if (activeTab === 'student') {
          await firestoreService.updateStudent(editingId, { ...studentForm, grade: studentForm.classId });
          await log('Student Profile Update', `Updated student profile for ${studentForm.name} (ID/Class: ${studentForm.classId})`);
        } else if (activeTab === 'teacher') {
          await firestoreService.updateUser(editingId, { ...teacherForm });
          await firestoreService.setTeacherAssignments(editingId, validAssignments);
          await applyClassTeacher(editingId, classTeacherOf);
          await log(
            'Teacher Profile Update',
            `Updated teacher profile for ${teacherForm.name} (Email: ${teacherForm.email}); ${validAssignments.length} class/subject assignment(s)` +
              (classTeacherOf ? `; class teacher of ${classTeacherOf}` : '; not a class teacher'),
          );
        } else {
          await firestoreService.updateUser(editingId, { name: parentForm.name, email: parentForm.email });
          await log('Parent Profile Update', `Updated parent profile for ${parentForm.name}`);
        }
        setEditingId(null);
        resetForm();
        return;
      }

      let newMemberId = '';
      if (activeTab === 'student') {
        // Pre-calculate the login ID from a fresh document id so it is atomic.
        const studentId = firestoreService.generateId('students');
        newMemberId = `STU${new Date().getFullYear()}${studentId.slice(0, 4).toUpperCase()}`;
        await firestoreService.registerStudentWithId(studentId, { ...studentForm, grade: studentForm.classId, loginId: newMemberId });
        await log('Student Registration', `Registered new student ${studentForm.name} with Login ID ${newMemberId}`);
        setGeneratedPassword(null);
      } else if (activeTab === 'teacher') {
        const teacherId = firestoreService.generateId('users');
        newMemberId = `T${Math.floor(100 + Math.random() * 900)}`;
        const created = await firestoreService.registerTeacherWithId(teacherId, {
          ...teacherForm,
          role: 'Teacher',
          loginId: newMemberId,
          avatar: `https://picsum.photos/seed/${teacherId}/100`,
        });
        if (validAssignments.length) await firestoreService.setTeacherAssignments(teacherId, validAssignments);
        if (classTeacherOf) await applyClassTeacher(teacherId, classTeacherOf);
        await log(
          'Teacher Registration',
          `Registered new teacher ${teacherForm.name} (Login ID: ${newMemberId}) with ${validAssignments.length} class/subject assignment(s)` +
            (classTeacherOf ? `; class teacher of ${classTeacherOf}` : ''),
        );
        setGeneratedPassword(created?.temporaryPassword || null);
      } else {
        const parentId = firestoreService.generateId('users');
        newMemberId = `P${Math.floor(100 + Math.random() * 900)}`;
        const created = await firestoreService.registerParentWithId(parentId, {
          name: parentForm.name,
          email: parentForm.email,
          loginId: newMemberId,
        });
        await log('Parent Registration', `Registered new parent ${parentForm.name} (Login ID: ${newMemberId})`);
        setGeneratedPassword(created?.temporaryPassword || null);
      }

      setGeneratedId(newMemberId);
      resetForm();
    } catch (err) {
      console.error('Registration failed:', err);
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (member: any) => {
    setError(null);
    setEditingId(member.id || member.uid);
    if (member.type === 'Student') {
      setActiveTab('student');
      setStudentForm({
        name: member.name,
        age: member.age ? String(member.age) : '',
        parentName: member.parentName || '',
        parentContact: member.parentContact || '',
        classId: member.classId || '',
        parentId: member.parentId || '',
      });
    } else if (member.type === 'Parent') {
      setActiveTab('parent');
      setParentForm({ name: member.name, email: member.email || '', contact: '' });
    } else {
      setActiveTab('teacher');
      firestoreService
        .getTeacherAssignments({ teacherId: member.uid || member.id })
        .then((rows) => setTeacherAssignments(rows.map((r) => ({ classId: r.classId, courseCode: r.courseCode }))))
        .catch(() => setTeacherAssignments([]));
      setTeacherForm({
        name: member.name,
        email: member.email || '',
        qualification: member.qualification || '',
        subjects: member.subjects || ['Mathematics'],
        assignedClasses: member.assignedClasses || [],
        assignedCourses: member.assignedCourses || [],
      });
      const uid = member.uid || member.id;
      setClassTeacherOf(availableGrades.find((g: any) => g.classTeacherId === uid)?.name || '');
    }
    setSelectedMember(null);
  };

  const handleResetPassword = async (member: any) => {
    const uid = member.id || member.uid;
    if (!uid) return;
    if (!window.confirm(`Generate a new temporary password for ${member.name}? Their current password stops working immediately.`)) return;
    try {
      const result = await firestoreService.resetUserPassword(uid);
      await log('Password Reset', `Reset password for ${member.name} (${member.type})`);
      // Shown in a copyable panel rather than an alert() — this value is not recoverable.
      setResetResult({ name: member.name, password: result.temporaryPassword });
    } catch (err) {
      console.error('Failed to reset password:', err);
      setError('Could not reset that password. Try again.');
    }
  };

  const groupedStudents = useMemo(() => {
    const filtered = allStudents.filter((s) => (s.name || '').toLowerCase().includes(rosterSearch.toLowerCase()));
    const groups: Record<string, any[]> = {};
    filtered.forEach((student) => {
      const key = student.classId || 'Unassigned';
      (groups[key] ||= []).push(student);
    });
    return Object.keys(groups)
      .sort()
      .reduce((acc, key) => {
        acc[key] = groups[key].sort((a, b) => a.name.localeCompare(b.name));
        return acc;
      }, {} as Record<string, any[]>);
  }, [allStudents, rosterSearch]);

  const parentMatches = useMemo(() => {
    const q = parentSearch.toLowerCase();
    if (!q) return allParents.slice(0, 5);
    return allParents.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q)).slice(0, 5);
  }, [allParents, parentSearch]);

  const linkedParent = allParents.find((p) => p.uid === studentForm.parentId);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const canSubmit =
    activeTab === 'student'
      ? !!studentForm.name.trim() && !!studentForm.classId && !!studentForm.parentId
      : activeTab === 'teacher'
        ? !!teacherForm.name.trim() && !!teacherForm.email.trim()
        : !!parentForm.name.trim() && !!parentForm.email.trim();

  return (
    <WorkSurface>
      <PageHeader
        title="Registration"
        subtitle="Create accounts, issue credentials and browse the student directory"
        actions={
          <Tabs
            value={activeTab}
            onChange={(v) => {
              if (editingId) return;
              setActiveTab(v);
              setError(null);
            }}
            tabs={[
              { value: 'student', label: 'Student' },
              { value: 'teacher', label: 'Teacher' },
              { value: 'parent', label: 'Parent' },
              { value: 'roster', label: 'Roster' },
            ]}
          />
        }
      />

      {editingId && (
        <InlineNote tone="blue" icon="edit">
          Editing an existing record — tab switching is locked until you save or cancel.
        </InlineNote>
      )}
      {error && <InlineNote tone="blush" icon="priority_high">{error}</InlineNote>}

      {activeTab === 'roster' ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeading>Student directory ({allStudents.length})</SectionHeading>
            <div className="relative">
              <Icon name="search" className="text-[15px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder="Find a student"
                aria-label="Find a student"
                className="h-9 w-[260px] max-w-full pl-9"
              />
            </div>
          </div>

          {allStudents.length === 0 ? (
            <EmptyState icon="groups" title="No students registered yet" body="Register one on the Student tab and they appear here." />
          ) : Object.keys(groupedStudents).length === 0 ? (
            <NoResults title={`No students match “${rosterSearch}”`} onClear={() => setRosterSearch('')} clearLabel="Clear search" />
          ) : (
            Object.entries(groupedStudents).map(([className, list]) => (
              <Card key={className} pad={false}>
                <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{className}</p>
                  <Badge tone="blue">{list.length}</Badge>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <Th>Student</Th>
                        <Th>Login ID</Th>
                        <Th>Guardian</Th>
                        <Th className="text-right">Actions</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((s) => (
                        <tr key={s.id}>
                          <Td>
                            <button
                              type="button"
                              onClick={() => setSelectedMember({ ...s, type: 'Student' })}
                              className="flex items-center gap-2.5 min-w-0 text-left rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            >
                              <Avatar name={s.name} size={30} />
                              <span className="text-[12.5px] font-semibold text-slate-900 dark:text-white truncate">{s.name}</span>
                            </button>
                          </Td>
                          <Td className="text-slate-500">{s.loginId || '—'}</Td>
                          <Td className="text-slate-500">{s.parentId ? 'Linked' : <span className="text-ink-butter">Not linked</span>}</Td>
                          <Td className="text-right">
                            <button
                              type="button"
                              onClick={() => startEdit({ ...s, type: 'Student' })}
                              aria-label={`Edit ${s.name}`}
                              className="size-8 rounded-[10px] bg-slate-50 dark:bg-slate-900/40 text-slate-500 hover:text-primary inline-flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            >
                              <Icon name="edit" className="text-[15px]" />
                            </button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <Card className="flex flex-col gap-4 h-fit">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
                {editingId ? 'Edit' : 'New'} {activeTab}
              </p>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    resetForm();
                  }}
                  className="text-[11.5px] font-semibold text-slate-500 hover:text-primary rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Cancel edit
                </button>
              )}
            </div>

            {activeTab === 'student' && (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Full name">
                    <Input value={studentForm.name} onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })} />
                  </Field>
                  <Field label="Age">
                    <Input
                      type="number"
                      min={2}
                      max={25}
                      value={studentForm.age}
                      onChange={(e) => setStudentForm({ ...studentForm, age: e.target.value })}
                    />
                  </Field>
                </div>

                <Field label="Class">
                  <Select value={studentForm.classId} onChange={(e) => setStudentForm({ ...studentForm, classId: e.target.value })}>
                    <option value="">Choose a class…</option>
                    {availableGrades.map((g) => (
                      <option key={g.id} value={g.name}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <div className="h-px bg-slate-100 dark:bg-slate-800" />

                <div>
                  <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Link a parent</p>
                  <p className="mt-1 text-[11.5px] text-slate-500">
                    The parent sees this child&rsquo;s fees, attendance and reports. Required.
                  </p>
                </div>

                {linkedParent ? (
                  <div className="flex items-center gap-3 bg-tint-blue rounded-[14px] px-3.5 py-3">
                    <Avatar name={linkedParent.name} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold text-slate-900 dark:text-white truncate">{linkedParent.name}</p>
                      <p className="text-[10.5px] text-slate-500 truncate">{linkedParent.email || linkedParent.loginId}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStudentForm({ ...studentForm, parentId: '' })}
                      className="text-[11.5px] font-semibold text-primary rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Icon name="search" className="text-[15px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <Input
                        value={parentSearch}
                        onChange={(e) => setParentSearch(e.target.value)}
                        placeholder="Search registered parents"
                        aria-label="Search registered parents"
                        className="pl-9"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {parentMatches.length === 0 ? (
                        <p className="text-[11.5px] text-slate-400 py-1">
                          No parent matches. Register them on the Parent tab first.
                        </p>
                      ) : (
                        parentMatches.map((p) => (
                          <button
                            key={p.uid}
                            type="button"
                            onClick={() => setStudentForm({ ...studentForm, parentId: p.uid, parentName: p.name })}
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-[13px] bg-slate-50 dark:bg-slate-900/40 hover:bg-tint-blue text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          >
                            <Avatar name={p.name} size={30} tint="peach" />
                            <div className="min-w-0">
                              <p className="text-[12px] font-semibold text-slate-900 dark:text-white truncate">{p.name}</p>
                              <p className="text-[10.5px] text-slate-500 truncate">{p.email}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}

                <Field label="Guardian contact">
                  <Input
                    value={studentForm.parentContact}
                    onChange={(e) => setStudentForm({ ...studentForm, parentContact: e.target.value })}
                    placeholder="Phone number"
                  />
                </Field>
              </>
            )}

            {activeTab === 'teacher' && (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Full name">
                    <Input value={teacherForm.name} onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })} />
                  </Field>
                  <Field label="Email">
                    <Input
                      type="email"
                      value={teacherForm.email}
                      onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })}
                    />
                  </Field>
                </div>

                <Field label="Qualification">
                  <Input
                    value={teacherForm.qualification}
                    onChange={(e) => setTeacherForm({ ...teacherForm, qualification: e.target.value })}
                    placeholder="e.g. B.Ed Mathematics"
                  />
                </Field>

                <Field
                  label="What they teach"
                  hint="One row per subject per class. A teacher can take different subjects in different classes."
                >
                  <div className="flex flex-col gap-2">
                    {availableGrades.length === 0 || availableCourses.length === 0 ? (
                      <p className="text-[11.5px] text-slate-400">
                        Configure class levels and courses under School Settings first.
                      </p>
                    ) : (
                      <>
                        {teacherAssignments.map((a, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Select
                              value={a.classId}
                              aria-label={`Class for assignment ${i + 1}`}
                              onChange={(e) =>
                                setTeacherAssignments((prev) =>
                                  prev.map((x, j) => (j === i ? { ...x, classId: e.target.value } : x)),
                                )
                              }
                              className="flex-1"
                            >
                              <option value="">Class…</option>
                              {availableGrades.map((g) => (
                                <option key={g.id} value={g.name}>
                                  {g.name}
                                </option>
                              ))}
                            </Select>
                            <Select
                              value={a.courseCode}
                              aria-label={`Subject for assignment ${i + 1}`}
                              onChange={(e) =>
                                setTeacherAssignments((prev) =>
                                  prev.map((x, j) => (j === i ? { ...x, courseCode: e.target.value } : x)),
                                )
                              }
                              className="flex-1"
                            >
                              <option value="">Subject…</option>
                              {availableCourses.map((c) => (
                                <option key={c.id} value={c.code}>
                                  {c.name}
                                </option>
                              ))}
                            </Select>
                            <button
                              type="button"
                              onClick={() => setTeacherAssignments((prev) => prev.filter((_, j) => j !== i))}
                              aria-label={`Remove assignment ${i + 1}`}
                              className="size-9 shrink-0 rounded-[10px] bg-slate-50 dark:bg-slate-900/40 text-slate-500 hover:text-danger flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            >
                              <Icon name="delete" className="text-[15px]" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setTeacherAssignments((prev) => [...prev, { classId: '', courseCode: '' }])}
                          className="self-start flex items-center gap-1.5 text-[11.5px] font-semibold text-primary rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          <Icon name="add" className="text-[14px]" />
                          Add a class &amp; subject
                        </button>
                      </>
                    )}
                  </div>
                </Field>

                {teacherAssignments.length === 0 && (
                  <InlineNote tone="butter" icon="warning">
                    With nothing here they cannot enter results for anyone, and no class will expect a subject from them.
                  </InlineNote>
                )}

                <Field
                  label="Class teacher of"
                  hint="Optional, and separate from the list above. The class teacher merges every subject teacher's marks into a report card, adds remarks, and sends it to admin."
                >
                  <Select value={classTeacherOf} onChange={(e) => setClassTeacherOf(e.target.value)}>
                    <option value="">Not a class teacher</option>
                    {availableGrades.map((g) => (
                      <option key={g.id} value={g.name}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                {displacedClassTeacher && (
                  <InlineNote tone="peach" icon="warning">
                    {displacedClassTeacher} is currently the class teacher for {classTeacherOf}. Saving moves that role to{' '}
                    {teacherForm.name || 'this teacher'}, and {displacedClassTeacher} will lose access to that class&rsquo;s
                    report cards.
                  </InlineNote>
                )}
              </>
            )}

            {activeTab === 'parent' && (
              <>
                <Field label="Full name">
                  <Input value={parentForm.name} onChange={(e) => setParentForm({ ...parentForm, name: e.target.value })} />
                </Field>
                <Field label="Email" hint="Used to sign in, and where their receipts go.">
                  <Input type="email" value={parentForm.email} onChange={(e) => setParentForm({ ...parentForm, email: e.target.value })} />
                </Field>
                <Field label="Contact number">
                  <Input value={parentForm.contact} onChange={(e) => setParentForm({ ...parentForm, contact: e.target.value })} />
                </Field>
              </>
            )}

            <InlineNote icon="lock">
              Creating an account is written to the audit log with your name and the time.
            </InlineNote>

            <Button icon={editingId ? 'save' : 'person_add'} block loading={isSubmitting} disabled={!canSubmit} onClick={handleRegister}>
              {editingId ? 'Save changes' : `Create ${activeTab}`}
            </Button>
          </Card>

          <div className="flex flex-col gap-4">
            {generatedId && (
              <div className="bg-tint-mint rounded-panel p-5 flex flex-col gap-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="size-[26px] rounded-[9px] bg-success text-white flex items-center justify-center">
                    <Icon name="check" className="text-[15px]" strokeWidth={2.6} />
                  </span>
                  <p className="text-sm font-bold tracking-[-0.02em] text-ink-mint">Account created</p>
                </div>
                <p className="text-[11.5px] leading-relaxed text-ink-mint">
                  Give these to the person now. {generatedPassword ? 'The password is shown once and cannot be recovered.' : ''}
                </p>
                <div className="bg-surface-light dark:bg-surface-dark rounded-[14px] p-4 flex flex-col gap-3">
                  <CredentialRow label="Login ID" value={generatedId} />
                  {generatedPassword && (
                    <>
                      <div className="h-px bg-slate-100 dark:bg-slate-800" />
                      <CredentialRow label="Temporary password" value={generatedPassword} />
                    </>
                  )}
                </div>
                <Button
                  variant="secondary"
                  block
                  onClick={() => {
                    setGeneratedId(null);
                    setGeneratedPassword(null);
                  }}
                >
                  Done
                </Button>
              </div>
            )}

            <Card className="flex flex-col gap-3">
              <SectionHeading>Recently added</SectionHeading>
              {loadingMembers ? (
                <SkeletonTable rows={3} />
              ) : recentMembers.length === 0 ? (
                <p className="text-[11.5px] text-slate-400 leading-relaxed">Nobody registered yet.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {recentMembers.slice(0, 8).map((m) => (
                    <div key={`${m.type}-${m.id}`} className="flex items-center gap-2.5 px-3 py-2.5 rounded-[13px] bg-slate-50 dark:bg-slate-900/40">
                      <button
                        type="button"
                        onClick={() => setSelectedMember(m)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <Avatar name={m.name} size={30} tint={TYPE_TINT[m.type] ?? 'blue'} />
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-slate-900 dark:text-white truncate">{m.name}</p>
                          <p className="text-[10.5px] text-slate-500 truncate">
                            {m.type}
                            {m.loginId ? ` · ${m.loginId}` : ''}
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        aria-label={`Edit ${m.name}`}
                        className="size-8 shrink-0 rounded-[10px] bg-surface-light dark:bg-surface-dark text-slate-500 hover:text-primary flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <Icon name="edit" className="text-[15px]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Member detail */}
      <Drawer
        open={!!selectedMember}
        onClose={() => setSelectedMember(null)}
        title={selectedMember?.name ?? ''}
        subtitle={selectedMember ? `${selectedMember.type}${selectedMember.loginId ? ` · ${selectedMember.loginId}` : ''}` : undefined}
        footer={
          selectedMember && selectedMember.type !== 'Student' ? (
            <>
              <Button variant="secondary" block onClick={() => startEdit(selectedMember)}>
                Edit
              </Button>
              <Button variant="danger" block icon="key" onClick={() => handleResetPassword(selectedMember)}>
                Reset password
              </Button>
            </>
          ) : (
            <Button variant="secondary" block onClick={() => selectedMember && startEdit(selectedMember)}>
              Edit record
            </Button>
          )
        }
      >
        {selectedMember && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3.5">
              <Avatar name={selectedMember.name} size={52} tint={TYPE_TINT[selectedMember.type] ?? 'blue'} />
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-slate-900 dark:text-white truncate">{selectedMember.name}</p>
                <p className="text-[11.5px] text-slate-500 truncate">
                  {selectedMember.email || selectedMember.classId || selectedMember.type}
                </p>
              </div>
            </div>

            {selectedMember.type === 'Student' ? (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-tint-mint rounded-[14px] px-3.5 py-3">
                    <p className="text-[10.5px] text-slate-600 dark:text-slate-400">Attendance</p>
                    <p className="mt-1 text-lg font-bold text-ink-mint">
                      {memberExtraInfo.attendance ? `${Math.round(memberExtraInfo.attendance.rate)}%` : '—'}
                    </p>
                  </div>
                  <div className="bg-tint-blue rounded-[14px] px-3.5 py-3">
                    <p className="text-[10.5px] text-slate-600 dark:text-slate-400">Reports</p>
                    <p className="mt-1 text-lg font-bold text-ink-blue">{memberExtraInfo.reports?.length ?? 0}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white mb-2">Fees</p>
                  {!memberExtraInfo.fees?.length ? (
                    <p className="text-[11.5px] text-slate-400">Nothing billed yet.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {memberExtraInfo.fees.map((f: any) => {
                        const bal = Math.max(0, feeBilled(f) - feePaid(f));
                        return (
                          <div key={f.id} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/40 rounded-[13px] px-3.5 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] font-medium text-slate-900 dark:text-white truncate">{f.type || 'Fee'}</p>
                              <p className="text-[10.5px] text-slate-400">{f.term}</p>
                            </div>
                            <Badge tone={bal === 0 ? 'mint' : 'blush'}>{bal === 0 ? 'Paid' : ghs(bal)}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2.5">
                {selectedMember.qualification && (
                  <div className="bg-slate-50 dark:bg-slate-900/40 rounded-[13px] px-3.5 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">Qualification</p>
                    <p className="mt-1 text-[12.5px] text-slate-900 dark:text-white">{selectedMember.qualification}</p>
                  </div>
                )}
                {!!selectedMember.assignedClasses?.length && (
                  <div className="bg-slate-50 dark:bg-slate-900/40 rounded-[13px] px-3.5 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">Classes</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {selectedMember.assignedClasses.map((c: string) => (
                        <Badge key={c} tone="blue">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {!!selectedMember.assignedCourses?.length && (
                  <div className="bg-slate-50 dark:bg-slate-900/40 rounded-[13px] px-3.5 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">Courses</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {selectedMember.assignedCourses.map((c: string) => (
                        <Badge key={c} tone="lilac">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* One-time password after a reset */}
      <Drawer
        open={!!resetResult}
        onClose={() => setResetResult(null)}
        title="New temporary password"
        subtitle={resetResult?.name}
        footer={
          <Button block onClick={() => setResetResult(null)}>
            Done
          </Button>
        }
      >
        {resetResult && (
          <div className="flex flex-col gap-4">
            <InlineNote tone="blush" icon="warning">
              This is shown once and cannot be recovered. Their old password stopped working the moment you generated this.
            </InlineNote>
            <div className="bg-slate-50 dark:bg-slate-900/40 rounded-[14px] p-4">
              <CredentialRow label="Temporary password" value={resetResult.password} />
            </div>
            <InlineNote icon="lock">
              Hand it over in person or by a channel you trust. They will be asked to change it at first sign-in.
            </InlineNote>
          </div>
        )}
      </Drawer>
    </WorkSurface>
  );
};

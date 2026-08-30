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
  // Shown alongside the child's credentials when both were created together.
  const [parentCredentials, setParentCredentials] = useState<{ loginId: string; password: string | null; name: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recentMembers, setRecentMembers] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [allParents, setAllParents] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterView, setRosterView] = useState<'students' | 'teachers' | 'parents'>('students');
  const [parentSearch, setParentSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; password: string } | null>(null);
  const [memberExtraInfo, setMemberExtraInfo] = useState<{ attendance?: any; fees?: any[]; reports?: any[] }>({});

  const [allTeachers, setAllTeachers] = useState<any[]>([]);
  const [availableGrades, setAvailableGrades] = useState<any[]>([]);
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);

  const [studentForm, setStudentForm] = useState({
    name: '',
    dateOfBirth: '',
    parentName: '',
    parentContact: '',
    classId: '',
    parentId: '',
  });
  // When the guardian is not already registered, they are created from this same
  // form rather than sending the admin away to the Parent tab and back.
  const [newParent, setNewParent] = useState({ name: '', email: '', contact: '' });
  const [parentMode, setParentMode] = useState<'existing' | 'new'>('existing');
  const [teacherForm, setTeacherForm] = useState({
    name: '',
    email: '',
    qualification: '',
    location: '',
    contact: '',
    dateOfBirth: '',
    subjects: ['Mathematics'],
    assignedClasses: [] as string[],
    assignedCourses: [] as string[],
  });
  const [parentForm, setParentForm] = useState({ name: '', email: '', contact: '' });
  // One block per class, each holding every subject this teacher takes IN that class.
  // The API still stores flat (class, course) pairs — the grouping is a UI shape, so
  // adding a second subject to a class is a tick rather than a whole new row.
  const [teaching, setTeaching] = useState<{ classId: string; courseCodes: string[] }[]>([]);
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
    setStudentForm({ name: '', dateOfBirth: '', parentName: '', parentContact: '', classId: '', parentId: '' });
    setNewParent({ name: '', email: '', contact: '' });
    setParentMode('existing');
    setTeacherForm({ name: '', email: '', qualification: '', location: '', contact: '', dateOfBirth: '', subjects: ['Mathematics'], assignedClasses: [], assignedCourses: [] });
    setParentForm({ name: '', email: '', contact: '' });
    setTeaching([]);
    setClassTeacherOf('');
    setParentSearch('');
  };

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
    if (activeTab === 'student' && parentMode === 'existing' && !studentForm.parentId) {
      setError('Choose the guardian for this student, or switch to “Register a new parent”.');
      return;
    }
    if (activeTab === 'student' && parentMode === 'new' && !editingId) {
      if (!newParent.name.trim() || !newParent.email.trim()) {
        setError("Enter the new parent's name and email so their account can be created.");
        return;
      }
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
        // The guardian must exist before the child can point at them, so when the
        // admin is registering both at once the parent account is created first.
        let parentId = studentForm.parentId;
        let parentCreated: { loginId: string; password: string | null; name: string } | null = null;
        if (parentMode === 'new') {
          const newParentUid = firestoreService.generateId('users');
          const parentLoginId = `P${Math.floor(100 + Math.random() * 900)}`;
          const created = await firestoreService.registerParentWithId(newParentUid, {
            name: newParent.name,
            email: newParent.email,
            contact: newParent.contact,
            loginId: parentLoginId,
          });
          parentId = newParentUid;
          parentCreated = { loginId: parentLoginId, password: created?.temporaryPassword || null, name: newParent.name };
          await log('Parent Registration', `Registered new parent ${newParent.name} (Login ID: ${parentLoginId}) while registering a child`);
        }

        // Pre-calculate the login ID from a fresh document id so it is atomic.
        const studentId = firestoreService.generateId('students');
        newMemberId = `STU${new Date().getFullYear()}${studentId.slice(0, 4).toUpperCase()}`;
        await firestoreService.registerStudentWithId(studentId, {
          ...studentForm,
          parentId,
          parentName: parentCreated?.name || studentForm.parentName,
          parentContact: parentMode === 'new' ? newParent.contact : studentForm.parentContact,
          grade: studentForm.classId,
          loginId: newMemberId,
        });
        await log('Student Registration', `Registered new student ${studentForm.name} with Login ID ${newMemberId}`);
        setGeneratedPassword(null);
        setParentCredentials(parentCreated);
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
        // Dates arrive as full ISO timestamps; the date input needs just the day part.
        dateOfBirth: member.dateOfBirth ? String(member.dateOfBirth).slice(0, 10) : '',
        parentName: member.parentName || '',
        parentContact: member.parentContact || '',
        classId: member.classId || '',
        parentId: member.parentId || '',
      });
      setParentMode('existing');
    } else if (member.type === 'Parent') {
      setActiveTab('parent');
      setParentForm({ name: member.name, email: member.email || '', contact: '' });
    } else {
      setActiveTab('teacher');
      firestoreService
        .getTeacherAssignments({ teacherId: member.uid || member.id })
        .then((rows) => {
          // Collapse the stored pairs back into one block per class.
          const order: string[] = [];
          const byClass: Record<string, string[]> = {};
          rows.forEach((r) => {
            if (!(r.classId in byClass)) {
              byClass[r.classId] = [];
              order.push(r.classId);
            }
            if (r.courseCode) byClass[r.classId].push(r.courseCode);
          });
          setTeaching(order.map((classId) => ({ classId, courseCodes: byClass[classId] })));
        })
        .catch(() => setTeaching([]));
      setTeacherForm({
        name: member.name,
        email: member.email || '',
        qualification: member.qualification || '',
        location: member.location || '',
        contact: member.contact || '',
        dateOfBirth: member.dateOfBirth ? String(member.dateOfBirth).slice(0, 10) : '',
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
      // No client-side audit call here: the server writes that entry itself, so the
      // record survives a closed tab and cannot be skipped by the caller.
      // Shown in a copyable panel rather than an alert() — this value is not recoverable.
      setResetResult({ name: member.name, password: result.temporaryPassword });
      setError(null);
    } catch (err) {
      console.error('Failed to reset password:', err);
      setError(err instanceof Error ? err.message : 'Could not reset that password. Try again.');
    }
  };

  /**
   * Staff and guardians were previously reachable only through the "Recently added"
   * panel, which holds ten of each. An admin could not open — let alone reset the
   * password of — anyone registered before that, which is most of a real school.
   */
  const allPeopleEmpty = useMemo(
    () => (rosterView === 'teachers' ? allTeachers.length === 0 : allParents.length === 0),
    [rosterView, allTeachers, allParents],
  );

  const rosterPeople = useMemo(() => {
    const source = rosterView === 'teachers' ? allTeachers : allParents;
    const q = rosterSearch.trim().toLowerCase();
    const matches = (p: any) =>
      !q ||
      [p.name, p.email, p.loginId].some((v) => (v || '').toLowerCase().includes(q));
    return source
      .filter(matches)
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [rosterView, rosterSearch, allTeachers, allParents]);

  /** Flattened back to the (class, subject) pairs the API stores. */
  const teacherAssignments = useMemo(
    () =>
      teaching.flatMap((t) =>
        t.courseCodes.filter(Boolean).map((courseCode) => ({ classId: t.classId, courseCode })),
      ),
    [teaching],
  );

  const setTeachingClass = (i: number, classId: string) =>
    setTeaching((prev) => prev.map((t, j) => (j === i ? { ...t, classId } : t)));

  const toggleTeachingSubject = (i: number, code: string) =>
    setTeaching((prev) =>
      prev.map((t, j) =>
        j === i
          ? { ...t, courseCodes: t.courseCodes.includes(code) ? t.courseCodes.filter((c) => c !== code) : [...t.courseCodes, code] }
          : t,
      ),
    );

  /** Whole years, so the form shows what the record will actually say. */
  const ageFromDob = (dob: string): number | null => {
    if (!dob) return null;
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let years = now.getFullYear() - d.getFullYear();
    const before = now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
    if (before) years -= 1;
    return years >= 0 && years < 130 ? years : null;
  };

  const studentAge = ageFromDob(studentForm.dateOfBirth);

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
        subtitle="Create accounts, issue credentials and manage students, staff and guardians"
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11.5px] font-semibold text-slate-500 mr-0.5">Showing</span>
              {([
                { value: 'students', label: `Students (${allStudents.length})` },
                { value: 'teachers', label: `Teachers (${allTeachers.length})` },
                { value: 'parents', label: `Parents (${allParents.length})` },
              ] as const).map((v) => (
                <Chip
                  key={v.value}
                  active={rosterView === v.value}
                  onClick={() => {
                    setRosterView(v.value);
                    setRosterSearch('');
                  }}
                >
                  {v.label}
                </Chip>
              ))}
            </div>
            <div className="relative">
              <Icon name="search" className="text-[15px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder={rosterView === 'students' ? 'Find a student' : 'Name, email or login ID'}
                aria-label={`Find a ${rosterView === 'students' ? 'student' : rosterView.slice(0, -1)}`}
                className="h-9 w-[260px] max-w-full pl-9"
              />
            </div>
          </div>

          {/* Landing on the student list while looking for a password reset is the
              obvious wrong turn: students are the one group with no password at
              all, so the column they would look in is empty by design. */}
          {rosterView === 'students' && (
            <InlineNote icon="lock">
              Students sign in with their login ID alone and have no password. To issue a new password, switch to{' '}
              <button
                type="button"
                onClick={() => { setRosterView('teachers'); setRosterSearch(''); }}
                className="font-semibold text-primary underline underline-offset-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Teachers
              </button>{' '}
              or{' '}
              <button
                type="button"
                onClick={() => { setRosterView('parents'); setRosterSearch(''); }}
                className="font-semibold text-primary underline underline-offset-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Parents
              </button>
              .
            </InlineNote>
          )}

          {rosterView !== 'students' ? (
            allPeopleEmpty ? (
              <EmptyState
                icon="groups"
                title={`No ${rosterView} registered yet`}
                body={`Register one on the ${rosterView === 'teachers' ? 'Teacher' : 'Parent'} tab and they appear here.`}
              />
            ) : rosterPeople.length === 0 ? (
              <NoResults title={`No ${rosterView} match “${rosterSearch}”`} onClear={() => setRosterSearch('')} clearLabel="Clear search" />
            ) : (
              <Card pad={false}>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse min-w-[640px]">
                    <thead className="bg-slate-50 dark:bg-slate-900/40">
                      <tr>
                        <Th>{rosterView === 'teachers' ? 'Teacher' : 'Parent / guardian'}</Th>
                        <Th>Login ID</Th>
                        <Th>Email</Th>
                        <Th className="text-right">Actions</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {rosterPeople.map((p) => {
                        const type = rosterView === 'teachers' ? 'Teacher' : 'Parent';
                        const member = { ...p, id: p.uid || p.id, type };
                        return (
                          <tr key={member.id}>
                            <Td>
                              <button
                                type="button"
                                onClick={() => setSelectedMember(member)}
                                className="flex items-center gap-2.5 min-w-0 text-left rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                              >
                                <Avatar name={p.name} size={30} tint={TYPE_TINT[type] ?? 'blue'} />
                                <span className="text-[12.5px] font-semibold text-slate-900 dark:text-white truncate">{p.name}</span>
                              </button>
                            </Td>
                            <Td className="text-slate-500">{p.loginId || '—'}</Td>
                            <Td className="text-slate-500 truncate max-w-[220px]">{p.email || '—'}</Td>
                            <Td className="text-right">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEdit(member)}
                                  aria-label={`Edit ${p.name}`}
                                  className="h-8 px-3 rounded-[10px] bg-slate-50 dark:bg-slate-900/40 text-[11.5px] font-semibold text-slate-600 dark:text-slate-300 hover:text-primary inline-flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                >
                                  <Icon name="edit" className="text-[14px]" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleResetPassword(member)}
                                  aria-label={`Reset password for ${p.name}`}
                                  className="h-8 px-3 rounded-[10px] bg-tint-blush text-[11.5px] font-semibold text-ink-blush hover:brightness-95 inline-flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                >
                                  <Icon name="key" className="text-[14px]" />
                                  Reset password
                                </button>
                              </div>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )
          ) : allStudents.length === 0 ? (
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
                  {/* Date of birth rather than a typed age: an age entered once is
                      wrong within a year, and every register, report and transfer
                      form a school produces asks for the date anyway. */}
                  <Field
                    label="Date of birth"
                    hint={
                      studentForm.dateOfBirth
                        ? studentAge != null
                          ? `${studentAge} years old today`
                          : 'That date does not look right.'
                        : 'Age is worked out from this.'
                    }
                  >
                    <Input
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      value={studentForm.dateOfBirth}
                      onChange={(e) => setStudentForm({ ...studentForm, dateOfBirth: e.target.value })}
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

                <div className="flex gap-2">
                  <Chip active={parentMode === 'existing'} onClick={() => setParentMode('existing')}>
                    Choose an existing parent
                  </Chip>
                  <Chip
                    active={parentMode === 'new'}
                    onClick={() => {
                      setParentMode('new');
                      setStudentForm((f) => ({ ...f, parentId: '' }));
                    }}
                  >
                    Register a new parent
                  </Chip>
                </div>

                {parentMode === 'new' ? (
                  <>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field label="Parent full name">
                        <Input value={newParent.name} onChange={(e) => setNewParent({ ...newParent, name: e.target.value })} />
                      </Field>
                      <Field label="Parent email">
                        <Input
                          type="email"
                          value={newParent.email}
                          onChange={(e) => setNewParent({ ...newParent, email: e.target.value })}
                        />
                      </Field>
                    </div>
                    <Field label="Parent contact">
                      <Input
                        value={newParent.contact}
                        onChange={(e) => setNewParent({ ...newParent, contact: e.target.value })}
                        placeholder="Phone number"
                      />
                    </Field>
                    <InlineNote icon="info">
                      The parent account is created first, then the child is linked to it. You will get both sets of
                      credentials when you save.
                    </InlineNote>
                  </>
                ) : linkedParent ? (
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

                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Contact">
                    <Input
                      value={teacherForm.contact}
                      onChange={(e) => setTeacherForm({ ...teacherForm, contact: e.target.value })}
                      placeholder="Phone number"
                    />
                  </Field>
                  <Field label="Date of birth">
                    <Input
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      value={teacherForm.dateOfBirth}
                      onChange={(e) => setTeacherForm({ ...teacherForm, dateOfBirth: e.target.value })}
                    />
                  </Field>
                </div>

                <Field label="Location">
                  <Input
                    value={teacherForm.location}
                    onChange={(e) => setTeacherForm({ ...teacherForm, location: e.target.value })}
                    placeholder="Town or area of residence"
                  />
                </Field>

                <Field
                  label="Subject(s) taught"
                  hint="Pick a class, then tick every subject they take in it. A teacher can take different subjects in different classes."
                >
                  <div className="flex flex-col gap-2.5">
                    {availableGrades.length === 0 || availableCourses.length === 0 ? (
                      <p className="text-[11.5px] text-slate-400">
                        Configure class levels and courses under School Settings first.
                      </p>
                    ) : (
                      <>
                        {teaching.map((t, i) => (
                          <div
                            key={i}
                            className="rounded-[14px] border border-slate-200 dark:border-slate-700 p-3 flex flex-col gap-2.5"
                          >
                            <div className="flex items-center gap-2">
                              <Select
                                value={t.classId}
                                aria-label={`Class ${i + 1}`}
                                onChange={(e) => setTeachingClass(i, e.target.value)}
                                className="flex-1"
                              >
                                <option value="">Choose a class…</option>
                                {availableGrades.map((g) => (
                                  <option key={g.id} value={g.name}>
                                    {g.name}
                                  </option>
                                ))}
                              </Select>
                              <button
                                type="button"
                                onClick={() => setTeaching((prev) => prev.filter((_, j) => j !== i))}
                                aria-label={`Remove class ${i + 1}`}
                                className="size-9 shrink-0 rounded-[10px] bg-slate-50 dark:bg-slate-900/40 text-slate-500 hover:text-danger flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                              >
                                <Icon name="delete" className="text-[15px]" />
                              </button>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {availableCourses.map((c) => {
                                const on = t.courseCodes.includes(c.code);
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    aria-pressed={on}
                                    disabled={!t.classId}
                                    onClick={() => toggleTeachingSubject(i, c.code)}
                                    className={`px-3 py-1.5 rounded-full text-[11.5px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                                      focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                                        on
                                          ? 'bg-primary text-white'
                                          : 'bg-slate-50 dark:bg-slate-900/40 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                      }`}
                                  >
                                    {c.name}
                                  </button>
                                );
                              })}
                            </div>

                            {t.classId && t.courseCodes.length === 0 && (
                              <p className="text-[11px] text-ink-butter">
                                Tick at least one subject, or this class will be ignored.
                              </p>
                            )}
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => setTeaching((prev) => [...prev, { classId: '', courseCodes: [] }])}
                          className="self-start flex items-center gap-1.5 text-[11.5px] font-semibold text-primary rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          <Icon name="add" className="text-[14px]" />
                          Add a class
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
              {editingId
                ? 'This change is written to the audit log with your name and the time.'
                : 'Creating an account is written to the audit log with your name and the time.'}
            </InlineNote>

            <Button icon={editingId ? 'save' : 'person_add'} block loading={isSubmitting} disabled={!canSubmit} onClick={handleRegister}>
              {editingId ? 'Save changes' : `Create ${activeTab}`}
            </Button>

            {/* Reachable from here on purpose: editing locks the tab switcher, so an
                admin part-way through a record would otherwise have to cancel and
                start again just to issue a new password. */}
            {editingId && activeTab !== 'student' && (
              <>
                <div className="h-px bg-slate-100 dark:bg-slate-800" />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold text-slate-900 dark:text-white">Password</p>
                    <p className="text-[11px] text-slate-500">
                      Issues a new temporary one. Their current password stops working straight away.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    icon="key"
                    onClick={() =>
                      handleResetPassword({
                        id: editingId,
                        name: activeTab === 'teacher' ? teacherForm.name : parentForm.name,
                        type: activeTab === 'teacher' ? 'Teacher' : 'Parent',
                      })
                    }
                  >
                    Reset password
                  </Button>
                </div>
              </>
            )}
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

                {/* Registering a child and their guardian together produces two sets
                    of credentials, and both are shown once. Hiding the parent's here
                    would mean an account nobody can get into. */}
                {parentCredentials && (
                  <>
                    <p className="text-[11.5px] font-semibold text-ink-mint">
                      Guardian account — {parentCredentials.name}
                    </p>
                    <div className="bg-surface-light dark:bg-surface-dark rounded-[14px] p-4 flex flex-col gap-3">
                      <CredentialRow label="Login ID" value={parentCredentials.loginId} />
                      {parentCredentials.password && (
                        <>
                          <div className="h-px bg-slate-100 dark:bg-slate-800" />
                          <CredentialRow label="Temporary password" value={parentCredentials.password} />
                        </>
                      )}
                    </div>
                  </>
                )}

                <Button
                  variant="secondary"
                  block
                  onClick={() => {
                    setGeneratedId(null);
                    setGeneratedPassword(null);
                    setParentCredentials(null);
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
              Hand it over in person or by a channel you trust. It stays their password until it is reset again — there
              is no self-service password change yet, so treat this value as a real credential, not a stopgap.
            </InlineNote>
          </div>
        )}
      </Drawer>
    </WorkSurface>
  );
};

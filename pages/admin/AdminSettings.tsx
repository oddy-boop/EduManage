import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';
import { loadGradingScale } from '../../lib/grading';
import { WorkSurface } from '../../components/Layouts';
import {
  Badge, Button, Card, Drawer, EmptyState, Field, ghs, InlineNote, Input, PageHeader, SectionHeading, Select,
  SkeletonTable, StatTile, Tabs, Td, Th,
} from '../../components/ui';

interface GradeConfig {
  id: string;
  name: string;
  baseFee: number;
  classTeacherId?: string | null;
}

interface CourseConfig {
  id: string;
  name: string;
  code: string;
  department: string;
}

type Tab = 'grades' | 'courses' | 'grading' | 'system';
const TERMS = ['Term 1', 'Term 2', 'Term 3'];

export const AdminSettings: React.FC = () => {
  const { user } = useAuth();
  const [grades, setGrades] = useState<GradeConfig[]>([]);
  const [courses, setCourses] = useState<CourseConfig[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('grades');
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const [newGrade, setNewGrade] = useState({ name: '', baseFee: 0 });
  const [newCourse, setNewCourse] = useState({ name: '', code: '', department: '' });
  const [editingGrade, setEditingGrade] = useState<GradeConfig | null>(null);
  const [editingCourse, setEditingCourse] = useState<CourseConfig | null>(null);

  const [currentTerm, setCurrentTerm] = useState('Term 2');
  const [savingTerm, setSavingTerm] = useState(false);
  const [fromClass, setFromClass] = useState('');
  const [toClass, setToClass] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [arrearsPreview, setArrearsPreview] = useState<{ total: number; students: any[] } | null>(null);
  const [carrying, setCarrying] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Grading scale — the school's own bands, weighting and pass mark.
  const [scale, setScale] = useState<{ bands: any[]; caMax: number; examMax: number; passMark: number } | null>(null);
  const [savingScale, setSavingScale] = useState(false);

  // School identity — printed on every report card, so it belongs to the school,
  // not the codebase.
  const [school, setSchool] = useState({ school_name: '', school_address: '', school_phone: '', school_email: '' });
  const [savingSchool, setSavingSchool] = useState(false);

  useEffect(() => {
    const unsubGrades = firestoreService.getGrades((data) => setGrades(data as GradeConfig[]));
    const unsubCourses = firestoreService.getCourses((data) => {
      setCourses(data as CourseConfig[]);
      setLoading(false);
    });
    const unsubAudit = firestoreService.getAuditLogs(setAuditLogs);
    const unsubTeachers = firestoreService.getTeachers(setTeachers);

    firestoreService
      .getGradingScale()
      .then(setScale)
      .catch(() => setScale(null));

    firestoreService
      .getSystemSettings()
      .then((settings) => {
        if (settings?.current_term) setCurrentTerm(settings.current_term);
        setSchool({
          school_name: settings?.school_name || '',
          school_address: settings?.school_address || '',
          school_phone: settings?.school_phone || '',
          school_email: settings?.school_email || '',
        });
      })
      .catch((err) => console.error('Failed to load system settings:', err));

    return () => {
      unsubGrades();
      unsubCourses();
      unsubAudit();
      unsubTeachers();
    };
  }, []);

  const teacherName = (uid?: string | null) => teachers.find((t) => t.uid === uid)?.name || null;

  const log = (action: string, details: string) =>
    user
      ? firestoreService.logActivity({
          userId: user.uid,
          userEmail: user.email || '',
          userName: user.name || '',
          action,
          details,
          type: 'config_change',
        })
      : Promise.resolve();

  const handleAddGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGrade.name) return;
    setStatus(null);
    try {
      const id = newGrade.name.replace(/\s+/g, '-').toLowerCase();
      await firestoreService.createGradeConfig(id, { ...newGrade, updatedAt: new Date().toISOString() });
      await log('Add Grade Config', `Added/updated grade level configuration: ${newGrade.name} with Base Fee: GH₵${newGrade.baseFee}`);
      setNewGrade({ name: '', baseFee: 0 });
      setStatus({ tone: 'ok', text: `${id} saved.` });
    } catch (error) {
      console.error('Error adding grade:', error);
      setStatus({ tone: 'bad', text: 'Could not save that class level.' });
    }
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourse.name || !newCourse.code) return;
    setStatus(null);
    try {
      const id = newCourse.code.toUpperCase();
      await firestoreService.createCourseConfig(id, { ...newCourse, updatedAt: new Date().toISOString() });
      await log(
        'Add Course Config',
        `Added/updated course catalog configuration: ${newCourse.name} (${id}) under Department: ${newCourse.department || 'General'}`,
      );
      setNewCourse({ name: '', code: '', department: '' });
      setStatus({ tone: 'ok', text: `${id} saved.` });
    } catch (error) {
      console.error('Error adding course:', error);
      setStatus({ tone: 'bad', text: 'Could not save that course.' });
    }
  };

  const handleEditGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGrade) return;
    setStatus(null);
    try {
      await firestoreService.createGradeConfig(editingGrade.id, {
        name: editingGrade.name,
        baseFee: editingGrade.baseFee,
        classTeacherId: editingGrade.classTeacherId || null,
        updatedAt: new Date().toISOString(),
      });
      await log(
        'Edit Grade Config',
        `Edited grade level configuration: ${editingGrade.name} to Base Fee: GH₵${editingGrade.baseFee}${
          editingGrade.classTeacherId ? `, Class Teacher: ${teacherName(editingGrade.classTeacherId)}` : ''
        }`,
      );
      setEditingGrade(null);
      setStatus({ tone: 'ok', text: 'Class level updated.' });
    } catch (error) {
      console.error('Error updating grade config:', error);
      setStatus({ tone: 'bad', text: 'Could not update that class level.' });
    }
  };

  const handleEditCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse) return;
    setStatus(null);
    try {
      await firestoreService.createCourseConfig(editingCourse.id, {
        name: editingCourse.name,
        code: editingCourse.code,
        department: editingCourse.department,
        updatedAt: new Date().toISOString(),
      });
      await log('Edit Course Config', `Edited course config: ${editingCourse.name} (${editingCourse.code})`);
      setEditingCourse(null);
      setStatus({ tone: 'ok', text: 'Course updated.' });
    } catch (error) {
      console.error('Error updating course config:', error);
      setStatus({ tone: 'bad', text: 'Could not update that course.' });
    }
  };

  const handleDeleteGrade = async (id: string, name: string) => {
    if (!window.confirm(`Delete the configuration for ${name}? Students already in it keep their class label.`)) return;
    try {
      await firestoreService.deleteGradeConfig(id);
      await log('Delete Grade Config', `Deleted grade level configuration for ${name}`);
    } catch (error) {
      console.error('Error deleting grade config:', error);
      setStatus({ tone: 'bad', text: 'Could not delete that class level.' });
    }
  };

  const handleDeleteCourse = async (id: string, name: string) => {
    if (!window.confirm(`Delete the configuration for ${name}?`)) return;
    try {
      await firestoreService.deleteCourseConfig(id);
      await log('Delete Course Config', `Deleted course configuration for ${name}`);
    } catch (error) {
      console.error('Error deleting course config:', error);
      setStatus({ tone: 'bad', text: 'Could not delete that course.' });
    }
  };

  const handleSaveTerm = async () => {
    setSavingTerm(true);
    setStatus(null);
    try {
      await firestoreService.updateSystemSetting('current_term', currentTerm);
      await log('System Configuration Update', `Updated active academic term to ${currentTerm}`);
      setStatus({ tone: 'ok', text: `Active term is now ${currentTerm}.` });
    } catch (err) {
      console.error(err);
      setStatus({ tone: 'bad', text: 'Could not save the active term.' });
    } finally {
      setSavingTerm(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setStatus(null);
    if (newPassword.length < 8) {
      setStatus({ tone: 'bad', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus({ tone: 'bad', text: 'New password and confirmation do not match.' });
      return;
    }
    setChangingPassword(true);
    try {
      await firestoreService.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setStatus({ tone: 'ok', text: 'Password updated.' });
    } catch (err) {
      setStatus({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not change the password.' });
    } finally {
      setChangingPassword(false);
    }
  };

  /** Contiguity check mirroring the server's, so gaps are visible before saving. */
  const coverage = useMemo(() => {
    if (!scale?.bands?.length) return { gaps: [] as string[], ok: false };
    const sorted = [...scale.bands].sort((a, b) => Number(a.minScore) - Number(b.minScore));
    const gaps: string[] = [];
    if (Number(sorted[0].minScore) > 0) gaps.push(`0–${Number(sorted[0].minScore) - 1}`);
    for (let i = 1; i < sorted.length; i++) {
      const prevMax = Number(sorted[i - 1].maxScore);
      const min = Number(sorted[i].minScore);
      if (min > prevMax + 1) gaps.push(`${prevMax + 1}–${min - 1}`);
    }
    const last = Number(sorted[sorted.length - 1].maxScore);
    if (last < 100) gaps.push(`${last + 1}–100`);
    return { gaps, ok: gaps.length === 0 };
  }, [scale]);

  const setBand = (i: number, patch: any) =>
    setScale((prev) => (prev ? { ...prev, bands: prev.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) } : prev));

  const handleSaveScale = async () => {
    if (!scale) return;
    setSavingScale(true);
    setStatus(null);
    try {
      const saved = await firestoreService.setGradingScale(scale);
      setScale(saved);
      await loadGradingScale();
      await log('Grading Scale Update', `Updated the grading scale to ${scale.bands.length} band(s), CA ${scale.caMax} / exam ${scale.examMax}, pass mark ${scale.passMark}`);
      setStatus({ tone: 'ok', text: 'Grading scale saved. New report cards use it from now on.' });
    } catch (err) {
      setStatus({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not save the grading scale.' });
    } finally {
      setSavingScale(false);
    }
  };

  const handleSaveSchool = async () => {
    setSavingSchool(true);
    setStatus(null);
    try {
      await Promise.all(
        Object.entries(school).map(([key, value]) => firestoreService.updateSystemSetting(key, value.trim())),
      );
      await log('School Profile Update', `Updated school identity to "${school.school_name.trim() || '(unnamed)'}"`);
      setStatus({ tone: 'ok', text: 'School details saved. They appear on every report card from now on.' });
    } catch (err) {
      setStatus({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not save the school details.' });
    } finally {
      setSavingSchool(false);
    }
  };

  const previewArrears = async () => {
    setStatus(null);
    try {
      const res = await firestoreService.carryForwardArrears(currentTerm, true);
      setArrearsPreview({ total: res.total, students: res.students });
    } catch (err) {
      setStatus({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not check arrears.' });
    }
  };

  const handleCarryForward = async () => {
    if (!arrearsPreview || arrearsPreview.students.length === 0) return;
    if (
      !window.confirm(
        `Carry ${ghs(arrearsPreview.total)} of unpaid balances from earlier terms into ${currentTerm}, for ${arrearsPreview.students.length} student(s)? The original charges stay on record, marked as carried.`,
      )
    )
      return;
    setCarrying(true);
    setStatus(null);
    try {
      const res = await firestoreService.carryForwardArrears(currentTerm, false);
      await log(
        'Arrears Carried Forward',
        `Carried ${res.total} of unpaid balances into ${currentTerm} for ${res.carriedCount} student(s)`,
      );
      setArrearsPreview(null);
      setStatus({ tone: 'ok', text: `Carried ${ghs(res.total)} into ${currentTerm} for ${res.carriedCount} student(s).` });
    } catch (err) {
      setStatus({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not carry arrears forward.' });
    } finally {
      setCarrying(false);
    }
  };

  const handlePromote = async () => {
    setStatus(null);
    if (!fromClass || !toClass) {
      setStatus({ tone: 'bad', text: 'Pick both a starting and a destination class.' });
      return;
    }
    if (fromClass === toClass) {
      setStatus({ tone: 'bad', text: 'Starting and destination classes must be different.' });
      return;
    }
    if (
      !window.confirm(
        `Promote all students from ${fromClass} to ${toClass}? This moves them immediately and reassigns them to the teachers of ${toClass}.`,
      )
    )
      return;
    setPromoting(true);
    try {
      const res = await firestoreService.promoteStudents(fromClass, toClass);
      await log('Batch Promotion Executed', `Promoted ${res.promotedCount} students from class ${fromClass} to class ${toClass}`);
      setFromClass('');
      setToClass('');
      setStatus({ tone: 'ok', text: `${res.promotedCount} students promoted from ${fromClass} to ${toClass}.` });
    } catch (err) {
      console.error(err);
      setStatus({ tone: 'bad', text: 'Promotion failed. No students were moved.' });
    } finally {
      setPromoting(false);
    }
  };

  if (loading) {
    return (
      <WorkSurface>
        <div className="h-14 w-56 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <SkeletonTable rows={5} />
      </WorkSurface>
    );
  }

  return (
    <WorkSurface>
      <PageHeader
        title="School Settings"
        subtitle="Class levels, the course catalogue, and school-wide configuration"
        actions={
          status && (
            <span className={`text-[11.5px] flex items-center gap-1.5 ${status.tone === 'ok' ? 'text-ink-mint' : 'text-ink-blush'}`}>
              <Icon name={status.tone === 'ok' ? 'check_circle' : 'priority_high'} className="text-[14px]" />
              {status.text}
            </span>
          )
        }
      />

      <Tabs
        value={activeTab}
        onChange={(v) => {
          setActiveTab(v);
          setStatus(null);
        }}
        tabs={[
          { value: 'grades', label: 'Class levels' },
          { value: 'courses', label: 'Subjects & courses' },
          { value: 'grading', label: 'Grading scale' },
          { value: 'system', label: 'System' },
        ]}
      />

      {activeTab === 'grades' && (
        <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="flex flex-col gap-4 h-fit">
            <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">Add a class level</p>
            <form onSubmit={handleAddGrade} className="flex flex-col gap-4">
              <Field label="Class level name" hint="The id is derived from this, e.g. “Grade 7” → grade-7.">
                <Input value={newGrade.name} onChange={(e) => setNewGrade({ ...newGrade, name: e.target.value })} placeholder="e.g. Grade 7" />
              </Field>
              <Field label="Base tuition fee (GHS)">
                <Input
                  type="number"
                  min={0}
                  value={newGrade.baseFee || ''}
                  onChange={(e) => setNewGrade({ ...newGrade, baseFee: Number(e.target.value) || 0 })}
                  className="text-right"
                />
              </Field>
              <Button type="submit" icon="add" block disabled={!newGrade.name}>
                Add class level
              </Button>
            </form>
          </Card>

          <div className="flex flex-col gap-3">
            <SectionHeading>Configured class levels ({grades.length})</SectionHeading>
            {grades.length === 0 ? (
              <EmptyState icon="class" title="No class levels yet" body="Add one and it becomes selectable on registration, fees and reports." />
            ) : (
              <Card pad={false}>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-900/40">
                      <tr>
                        <Th>Class level</Th>
                        <Th>Class teacher</Th>
                        <Th className="text-right">Base fee</Th>
                        <Th className="text-right">Actions</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {grades.map((g) => (
                        <tr key={g.id}>
                          <Td>
                            <p className="text-[12.5px] font-semibold text-slate-900 dark:text-white">{g.name}</p>
                            <p className="text-[10.5px] text-slate-400">{g.id}</p>
                          </Td>
                          <Td>
                            {teacherName(g.classTeacherId) ?? <span className="text-slate-400 italic">Not assigned</span>}
                          </Td>
                          <Td className="text-right font-semibold text-slate-900 dark:text-white">{ghs(g.baseFee)}</Td>
                          <Td className="text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingGrade(g)}
                                aria-label={`Edit ${g.name}`}
                                className="size-8 rounded-[10px] bg-slate-50 dark:bg-slate-900/40 text-slate-500 hover:text-primary flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                              >
                                <Icon name="edit" className="text-[15px]" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteGrade(g.id, g.name)}
                                aria-label={`Delete ${g.name}`}
                                className="size-8 rounded-[10px] bg-slate-50 dark:bg-slate-900/40 text-slate-500 hover:text-danger flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                              >
                                <Icon name="delete" className="text-[15px]" />
                              </button>
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {activeTab === 'courses' && (
        <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="flex flex-col gap-4 h-fit">
            <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">Add a course</p>
            <form onSubmit={handleAddCourse} className="flex flex-col gap-4">
              <Field label="Course name">
                <Input value={newCourse.name} onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })} placeholder="e.g. Mathematics" />
              </Field>
              <Field label="Course code" hint="Uppercased and used as the id.">
                <Input value={newCourse.code} onChange={(e) => setNewCourse({ ...newCourse, code: e.target.value })} placeholder="e.g. MATH101" />
              </Field>
              <Field label="Department">
                <Input
                  value={newCourse.department}
                  onChange={(e) => setNewCourse({ ...newCourse, department: e.target.value })}
                  placeholder="e.g. Sciences"
                />
              </Field>
              <Button type="submit" icon="add" block disabled={!newCourse.name || !newCourse.code}>
                Add course
              </Button>
            </form>
          </Card>

          <div className="flex flex-col gap-3">
            <SectionHeading>Course catalogue ({courses.length})</SectionHeading>
            {courses.length === 0 ? (
              <EmptyState icon="menu_book" title="No courses yet" body="Courses here become assignable to teachers and appear on report cards." />
            ) : (
              <Card pad={false}>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-900/40">
                      <tr>
                        <Th>Course</Th>
                        <Th>Code</Th>
                        <Th>Department</Th>
                        <Th className="text-right">Actions</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {courses.map((c) => (
                        <tr key={c.id}>
                          <Td className="font-semibold text-slate-900 dark:text-white">{c.name}</Td>
                          <Td>
                            <Badge tone="blue">{c.code}</Badge>
                          </Td>
                          <Td className="text-slate-500">{c.department || 'General'}</Td>
                          <Td className="text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingCourse(c)}
                                aria-label={`Edit ${c.name}`}
                                className="size-8 rounded-[10px] bg-slate-50 dark:bg-slate-900/40 text-slate-500 hover:text-primary flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                              >
                                <Icon name="edit" className="text-[15px]" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCourse(c.id, c.name)}
                                aria-label={`Delete ${c.name}`}
                                className="size-8 rounded-[10px] bg-slate-50 dark:bg-slate-900/40 text-slate-500 hover:text-danger flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                              >
                                <Icon name="delete" className="text-[15px]" />
                              </button>
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {activeTab === 'grading' && (
        !scale ? (
          <SkeletonTable rows={5} />
        ) : (
          <div className="flex flex-col gap-4">
            <Card className="flex flex-col gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Assessment weighting</p>
                <p className="mt-1 text-[11.5px] text-slate-500">
                  How a subject total is made up. Teachers cannot enter an exam score above this maximum.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Continuous assessment" className="w-40">
                  <Input
                    type="number"
                    min={1}
                    value={scale.caMax}
                    onChange={(e) => setScale({ ...scale, caMax: Number(e.target.value) || 0 })}
                    className="text-right"
                  />
                </Field>
                <span className="text-base text-slate-300 pb-2.5">+</span>
                <Field label="Terminal exam" className="w-40">
                  <Input
                    type="number"
                    min={1}
                    value={scale.examMax}
                    onChange={(e) => setScale({ ...scale, examMax: Number(e.target.value) || 0 })}
                    className="text-right"
                  />
                </Field>
                <span className="text-base text-slate-300 pb-2.5">=</span>
                <Field label="Subject total" className="w-40">
                  <Input value={Number(scale.caMax) + Number(scale.examMax)} readOnly className="text-right bg-slate-50 dark:bg-slate-900/40 font-bold" />
                </Field>
                <Field label="Pass mark" className="w-40">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={scale.passMark}
                    onChange={(e) => setScale({ ...scale, passMark: Number(e.target.value) || 0 })}
                    className="text-right"
                  />
                </Field>
              </div>
            </Card>

            <Card className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Grading bands</p>
                  <p className="mt-1 text-[11.5px] text-slate-500">
                    Every mark from 0 to 100 must fall in exactly one band.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  icon="add"
                  onClick={() => setScale({ ...scale, bands: [...scale.bands, { label: '', minScore: 0, maxScore: 0, description: '', tone: 'blue' }] })}
                >
                  Add band
                </Button>
              </div>

              {coverage.ok ? (
                <InlineNote tone="mint" icon="check_circle">
                  0&ndash;100 is fully covered, with no gaps or overlaps.
                </InlineNote>
              ) : (
                <InlineNote tone="butter" icon="warning">
                  <span className="font-semibold">Marks {coverage.gaps.join(', ')} are not covered by any band.</span> A
                  student scoring in that range would print with no grade. Saving is blocked until it is fixed.
                </InlineNote>
              )}

              <div className="flex flex-col gap-1.5">
                <div className="hidden md:grid grid-cols-[90px_84px_84px_minmax(0,1fr)_120px_40px] gap-2.5 px-3 pb-1">
                  {['Label', 'From', 'To', 'Description on the report card', 'Colour', ''].map((h) => (
                    <span key={h} className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">{h}</span>
                  ))}
                </div>

                {[...scale.bands]
                  .map((b, i) => ({ b, i }))
                  .sort((x, y) => Number(y.b.minScore) - Number(x.b.minScore))
                  .map(({ b, i }) => (
                    <div key={i} className="grid grid-cols-2 md:grid-cols-[90px_84px_84px_minmax(0,1fr)_120px_40px] gap-2.5 items-center bg-slate-50 dark:bg-slate-900/40 rounded-[13px] p-2.5">
                      <Input value={b.label} onChange={(e) => setBand(i, { label: e.target.value })} aria-label="Band label" className="font-semibold" />
                      <Input type="number" min={0} max={100} value={b.minScore} onChange={(e) => setBand(i, { minScore: Number(e.target.value) })} aria-label="From" className="text-right" />
                      <Input type="number" min={0} max={100} value={b.maxScore} onChange={(e) => setBand(i, { maxScore: Number(e.target.value) })} aria-label="To" className="text-right" />
                      <Input value={b.description || ''} onChange={(e) => setBand(i, { description: e.target.value })} aria-label="Description" placeholder="e.g. Excellent" />
                      <Select value={b.tone || 'blue'} onChange={(e) => setBand(i, { tone: e.target.value })} aria-label="Colour">
                        <option value="mint">Green</option>
                        <option value="blue">Blue</option>
                        <option value="butter">Amber</option>
                        <option value="blush">Red</option>
                      </Select>
                      <button
                        type="button"
                        onClick={() => setScale({ ...scale, bands: scale.bands.filter((_, j) => j !== i) })}
                        aria-label={`Delete band ${b.label || i + 1}`}
                        className="size-9 justify-self-end rounded-[10px] bg-surface-light dark:bg-surface-dark text-slate-500 hover:text-danger flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <Icon name="delete" className="text-[15px]" />
                      </button>
                    </div>
                  ))}
              </div>

              <InlineNote tone="blush" icon="warning">
                Changing a live scale does not rewrite report cards already released &mdash; those keep the grade they were
                printed with. The new scale applies to every batch approved from now on, and the change is written to the
                audit log with your name.
              </InlineNote>

              <div className="flex justify-end">
                <Button icon="save" loading={savingScale} disabled={!coverage.ok} onClick={handleSaveScale}>
                  Save grading scale
                </Button>
              </div>
            </Card>
          </div>
        )
      )}

      {activeTab === 'system' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile tint="blue" icon="class" label="Class levels" value={grades.length} />
            <StatTile tint="lilac" icon="menu_book" label="Courses" value={courses.length} />
            <StatTile tint="mint" icon="school" label="Teaching staff" value={teachers.length} />
            <StatTile tint="peach" icon="history" label="Audit entries" value={auditLogs.length} />
          </div>

          <Card className="flex flex-col gap-4">
            <div>
              <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">School details</p>
              <p className="mt-1 text-[11.5px] text-slate-500">
                Printed at the top of every report card, on screen and in the PDF. Anything left blank is simply left off.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="School name">
                <Input
                  value={school.school_name}
                  onChange={(e) => setSchool({ ...school, school_name: e.target.value })}
                  placeholder="e.g. Riverside Academy"
                />
              </Field>
              <Field label="Address">
                <Input
                  value={school.school_address}
                  onChange={(e) => setSchool({ ...school, school_address: e.target.value })}
                  placeholder="e.g. 14 Independence Ave, Accra"
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={school.school_phone}
                  onChange={(e) => setSchool({ ...school, school_phone: e.target.value })}
                  placeholder="e.g. +233 30 000 0000"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={school.school_email}
                  onChange={(e) => setSchool({ ...school, school_email: e.target.value })}
                  placeholder="e.g. office@school.edu"
                />
              </Field>
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Preview: <span className="font-semibold text-slate-600 dark:text-slate-300">{school.school_name.trim() || 'Your school'}</span>
                {[school.school_address, school.school_phone, school.school_email].some((v) => v.trim()) && (
                  <>
                    {' — '}
                    {[school.school_address, school.school_phone, school.school_email].map((v) => v.trim()).filter(Boolean).join('  ·  ')}
                  </>
                )}
              </p>
              <Button icon="save" loading={savingSchool} onClick={handleSaveSchool}>
                Save school details
              </Button>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="flex flex-col gap-4">
              <div>
                <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">Active academic term</p>
                <p className="mt-1 text-[11.5px] text-slate-500">
                  Report entry, the assessment book and fees all default to this term.
                </p>
              </div>
              <Field label="Current term">
                <Select value={currentTerm} onChange={(e) => setCurrentTerm(e.target.value)}>
                  {TERMS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              <Button icon="save" loading={savingTerm} onClick={handleSaveTerm}>
                Save active term
              </Button>
            </Card>

            <Card className="flex flex-col gap-4">
              <div>
                <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">Batch promotion</p>
                <p className="mt-1 text-[11.5px] text-slate-500">Move every student from one class level to the next.</p>
              </div>
              <div className="flex items-end gap-3">
                <Field label="From" className="flex-1">
                  <Select value={fromClass} onChange={(e) => setFromClass(e.target.value)}>
                    <option value="">Choose…</option>
                    {grades.map((g) => (
                      <option key={g.id} value={g.name}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Icon name="arrow_forward" className="text-[18px] text-slate-400 mb-3" />
                <Field label="To" className="flex-1">
                  <Select value={toClass} onChange={(e) => setToClass(e.target.value)}>
                    <option value="">Choose…</option>
                    {grades.map((g) => (
                      <option key={g.id} value={g.name}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <InlineNote tone="blush" icon="warning">
                This moves students immediately and reassigns them to the destination class&rsquo;s teachers. It cannot be
                undone in one step.
              </InlineNote>
              <Button variant="danger" loading={promoting} disabled={!fromClass || !toClass} onClick={handlePromote}>
                Promote students
              </Button>
            </Card>

            <Card className="flex flex-col gap-4">
              <div>
                <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">Arrears</p>
                <p className="mt-1 text-[11.5px] text-slate-500">
                  Carry unpaid balances from earlier terms into <span className="font-semibold">{currentTerm}</span>, so
                  they stop hiding behind a term filter.
                </p>
              </div>

              {arrearsPreview === null ? (
                <Button variant="secondary" icon="history" onClick={previewArrears}>
                  Check for arrears
                </Button>
              ) : arrearsPreview.students.length === 0 ? (
                <InlineNote tone="mint" icon="check_circle">
                  Nothing outstanding from earlier terms. Nobody is in arrears.
                </InlineNote>
              ) : (
                <>
                  <div className="bg-tint-blush rounded-[14px] px-4 py-3.5">
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">To carry into {currentTerm}</p>
                    <p className="mt-1 text-xl font-bold tracking-[-0.03em] text-ink-blush">{ghs(arrearsPreview.total)}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      across {arrearsPreview.students.length} student{arrearsPreview.students.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                    {arrearsPreview.students.map((st: any) => (
                      <div key={st.studentId} className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl px-3 py-2">
                        <span className="text-[12px] text-slate-700 dark:text-slate-300 truncate">{st.studentName || st.studentId}</span>
                        <span className="text-[12px] font-semibold text-ink-blush shrink-0">{ghs(st.owed)}</span>
                      </div>
                    ))}
                  </div>
                  <InlineNote icon="info">
                    One arrears charge is raised per student in {currentTerm}. The charges it replaces stay on record,
                    marked as carried, so nobody is billed twice and the history stays auditable.
                  </InlineNote>
                  <div className="flex gap-2.5">
                    <Button variant="secondary" block onClick={() => setArrearsPreview(null)}>
                      Cancel
                    </Button>
                    <Button block icon="history" loading={carrying} onClick={handleCarryForward}>
                      Carry forward
                    </Button>
                  </div>
                </>
              )}
            </Card>

            <Card className="flex flex-col gap-4">
              <div>
                <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">Your password</p>
                <p className="mt-1 text-[11.5px] text-slate-500">At least 8 characters.</p>
              </div>
              <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
                <Field label="Current password">
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </Field>
                <Field label="New password">
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    invalid={newPassword.length > 0 && newPassword.length < 8}
                  />
                </Field>
                <Field
                  label="Confirm new password"
                  error={confirmPassword.length > 0 && confirmPassword !== newPassword ? 'Does not match.' : undefined}
                >
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    invalid={confirmPassword.length > 0 && confirmPassword !== newPassword}
                  />
                </Field>
                <Button type="submit" icon="key" loading={changingPassword} disabled={!currentPassword || !newPassword}>
                  Change password
                </Button>
              </form>
            </Card>

          </div>
        </div>
      )}

      {/* Edit drawers */}
      <Drawer
        open={!!editingGrade}
        onClose={() => setEditingGrade(null)}
        title="Edit class level"
        subtitle={editingGrade?.id}
        footer={
          <>
            <Button variant="secondary" block onClick={() => setEditingGrade(null)}>
              Cancel
            </Button>
            <Button block onClick={handleEditGrade}>
              Save changes
            </Button>
          </>
        }
      >
        {editingGrade && (
          <form onSubmit={handleEditGrade} className="flex flex-col gap-4">
            <Field label="Class level name">
              <Input value={editingGrade.name} onChange={(e) => setEditingGrade({ ...editingGrade, name: e.target.value })} />
            </Field>
            <Field label="Base tuition fee (GHS)">
              <Input
                type="number"
                min={0}
                value={editingGrade.baseFee}
                onChange={(e) => setEditingGrade({ ...editingGrade, baseFee: Number(e.target.value) || 0 })}
                className="text-right"
              />
            </Field>
            <Field label="Class teacher" hint="Whoever merges and submits this class's report cards.">
              <Select
                value={editingGrade.classTeacherId ?? ''}
                onChange={(e) => setEditingGrade({ ...editingGrade, classTeacherId: e.target.value || null })}
              >
                <option value="">Not assigned</option>
                {teachers.map((t) => (
                  <option key={t.uid} value={t.uid}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </form>
        )}
      </Drawer>

      <Drawer
        open={!!editingCourse}
        onClose={() => setEditingCourse(null)}
        title="Edit course"
        subtitle={editingCourse?.id}
        footer={
          <>
            <Button variant="secondary" block onClick={() => setEditingCourse(null)}>
              Cancel
            </Button>
            <Button block onClick={handleEditCourse}>
              Save changes
            </Button>
          </>
        }
      >
        {editingCourse && (
          <form onSubmit={handleEditCourse} className="flex flex-col gap-4">
            <Field label="Course name">
              <Input value={editingCourse.name} onChange={(e) => setEditingCourse({ ...editingCourse, name: e.target.value })} />
            </Field>
            <Field label="Course code">
              <Input value={editingCourse.code} onChange={(e) => setEditingCourse({ ...editingCourse, code: e.target.value })} />
            </Field>
            <Field label="Department">
              <Input
                value={editingCourse.department}
                onChange={(e) => setEditingCourse({ ...editingCourse, department: e.target.value })}
              />
            </Field>
          </form>
        )}
      </Drawer>
    </WorkSurface>
  );
};

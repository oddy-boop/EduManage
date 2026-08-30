import { getSessionToken, clearSession } from './AuthContext';

// Generic service to handle database operations via REST API
// Attaches the session token to every request and forces a re-login if the
// server reports the session is invalid or expired.
async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getSessionToken();
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    clearSession();
    window.location.reload();
  }
  return response;
}

const mockOnSnapshot = (url: string, callback: (data: any) => void) => {
  let active = true;
  let lastDataString = '';

  const fetchData = async () => {
    try {
      const response = await apiFetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const dataString = JSON.stringify(data);
      if (active && dataString !== lastDataString) {
        lastDataString = dataString;
        callback(data);
      }
    } catch (error) {
      console.error(`Snapshot fetch failed for ${url}:`, error);
    }
  };
  
  fetchData();
  const timer = setInterval(fetchData, 3000);
  
  return () => {
    active = false;
    clearInterval(timer);
  };
};

export const firestoreService = {
  // --- USER PROFILES ---
  async createUserProfile(uid: string, data: any) {
    const response = await apiFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, ...data })
    });
    if (!response.ok) throw new Error('Failed to create user profile');
    return await response.json();
  },

  // --- ATTENDANCE ---
  async markAttendance(data: { studentId: string; parentId?: string; classId: string; date: string; status: string }) {
    const response = await apiFetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to record attendance');
    return await response.json();
  },

  getAttendanceForClass(classId: string, callback: (data: any[]) => void) {
    return mockOnSnapshot(`/api/attendance?classId=${encodeURIComponent(classId)}`, callback);
  },

  // --- STUDENTS ---
  generateId(collectionName: string) {
    // Generate a Firestore-like unique random ID
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  },

  async registerStudent(studentData: any) {
    const response = await apiFetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(studentData)
    });
    if (!response.ok) throw new Error('Failed to register student');
    return await response.json();
  },

  async registerStudentWithId(studentId: string, studentData: any) {
    const response = await apiFetch(`/api/students/${encodeURIComponent(studentId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(studentData)
    });
    if (!response.ok) throw new Error('Failed to register student with ID');
    return await response.json();
  },

  getStudentsForParent(parentId: string, callback: (data: any[]) => void) {
    return mockOnSnapshot(`/api/students?parentId=${encodeURIComponent(parentId)}`, callback);
  },

  getStudentsForClass(classId: string, callback: (data: any[]) => void) {
    return mockOnSnapshot(`/api/students?classId=${encodeURIComponent(classId)}`, callback);
  },

  getStudentsByGrades(grades: string[], callback: (data: any[]) => void) {
    if (!grades || grades.length === 0) {
      callback([]);
      return () => {};
    }
    return mockOnSnapshot(`/api/students?grades=${encodeURIComponent(grades.join(','))}`, callback);
  },

  getStudents(callback: (data: any[]) => void) {
    return mockOnSnapshot('/api/students', callback);
  },

  async deleteStudent(studentId: string) {
    const response = await apiFetch(`/api/students/${encodeURIComponent(studentId)}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete student');
    return await response.json();
  },

  getGrades(callback: (data: any[]) => void) {
    return mockOnSnapshot('/api/grades', callback);
  },

  getCourses(callback: (data: any[]) => void) {
    return mockOnSnapshot('/api/courses', callback);
  },

  async updateStudent(studentId: string, data: any) {
    const response = await apiFetch(`/api/students/${encodeURIComponent(studentId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to update student');
    return await response.json();
  },

  async updateUser(userId: string, data: any) {
    const response = await apiFetch(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to update user profile');
    return await response.json();
  },

  async updateFee(feeId: string, data: any) {
    const response = await apiFetch(`/api/fees/${encodeURIComponent(feeId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to update fee record');
    return await response.json();
  },

  // --- ADMIN STATS ---
  async getGlobalStats() {
    const response = await apiFetch('/api/stats/global');
    if (!response.ok) throw new Error('Failed to fetch global stats');
    return await response.json();
  },

  getDistribution(callback: (data: any[]) => void) {
    return mockOnSnapshot('/api/stats/distribution', callback);
  },

  getAllAttendance(callback: (data: any[]) => void) {
    return mockOnSnapshot('/api/attendance', callback);
  },

  // --- ATTENDANCE SUMMARY ---
  getStudentAttendanceSummary(studentId: string, parentId: string, callback: (data: any) => void) {
    return mockOnSnapshot(`/api/attendance/summary?studentId=${encodeURIComponent(studentId)}&parentId=${encodeURIComponent(parentId)}`, callback);
  },

  // --- ACADEMIC RECORDS ---
  getStudentReports(studentId: string, parentId: string, callback: (data: any[]) => void) {
    return mockOnSnapshot(`/api/reports?studentId=${encodeURIComponent(studentId)}&parentId=${encodeURIComponent(parentId)}`, callback);
  },

  pocketGetStudentReports(studentId: string, callback: (data: any[]) => void) {
    return mockOnSnapshot(`/api/reports?studentId=${encodeURIComponent(studentId)}`, callback);
  },

  getReportsByStatus(status: string, callback: (data: any[]) => void) {
    return mockOnSnapshot(`/api/reports?status=${encodeURIComponent(status)}`, callback);
  },

  getAllReports(callback: (data: any[]) => void) {
    return mockOnSnapshot('/api/reports', callback);
  },

  async updateReportStatus(reportId: string, status: string) {
    const response = await apiFetch(`/api/reports/${encodeURIComponent(reportId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!response.ok) throw new Error('Failed to update report status');
    return await response.json();
  },

  async createReport(reportData: { studentId: string; parentId?: string; [key: string]: any }) {
    const response = await apiFetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportData)
    });
    if (!response.ok) throw new Error('Failed to create report card');
    return await response.json();
  },

  // --- ASSESSMENT BOOK ---
  getAssessments(params: { classId?: string; studentId?: string; term?: string }, callback: (data: any[]) => void) {
    const query = new URLSearchParams();
    if (params.classId) query.set('classId', params.classId);
    if (params.studentId) query.set('studentId', params.studentId);
    if (params.term) query.set('term', params.term);
    const qs = query.toString();
    return mockOnSnapshot(`/api/assessments${qs ? `?${qs}` : ''}`, callback);
  },

  async getAssessmentSummary(studentId: string, classId: string, term: string, caMax?: number) {
    const query = new URLSearchParams({ studentId, classId, term });
    if (caMax !== undefined) query.set('caMax', String(caMax));
    const response = await apiFetch(`/api/assessments/summary?${query.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch assessment summary');
    return await response.json();
  },

  async createAssessment(data: { studentId: string; classId: string; term: string; subject?: string; category: string; title?: string; score: number; maxScore?: number; date?: string }) {
    const response = await apiFetch('/api/assessments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create assessment entry');
    return await response.json();
  },

  async deleteAssessment(id: string) {
    const response = await apiFetch(`/api/assessments/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete assessment entry');
    return await response.json();
  },

  // --- SUBJECT REPORTS (Class Teacher merge workflow) ---
  getSubjectReports(params: { classId: string; term: string; subject?: string; studentId?: string }, callback: (data: any[]) => void) {
    const query = new URLSearchParams({ classId: params.classId, term: params.term });
    if (params.subject) query.set('subject', params.subject);
    if (params.studentId) query.set('studentId', params.studentId);
    return mockOnSnapshot(`/api/subjectReports?${query.toString()}`, callback);
  },

  async saveSubjectReport(data: { studentId: string; classId: string; term: string; subject: string; caScore: number; examScore: number; remarks?: string }) {
    const response = await apiFetch('/api/subjectReports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Failed to save subject report');
    return body;
  },

  async submitSubjectReports(classId: string, subject: string, term: string) {
    const response = await apiFetch('/api/subjectReports/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId, subject, term })
    });
    if (!response.ok) throw new Error('Failed to submit subject reports');
    return await response.json();
  },

  /**
   * Downloads a released report card as a PDF. The endpoint needs the session
   * token, so this cannot be a plain link — fetch it, then hand the blob to the
   * browser as a save.
   */
  async downloadReportPdf(reportId: string) {
    const response = await apiFetch(`/api/reports/${encodeURIComponent(reportId)}/pdf`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Could not download that report.');
    }

    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match?.[1] || 'report-card.pdf';

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Give the browser a moment to start the save before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },

  // --- ARREARS ---

  /** Pass dryRun to preview without writing anything. */
  async carryForwardArrears(toTerm: string, dryRun = false) {
    const response = await apiFetch('/api/fees/carry-forward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toTerm, dryRun }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Failed to carry arrears forward');
    return body as {
      toTerm: string;
      total: number;
      carriedCount?: number;
      dryRun?: boolean;
      students: { studentId: string; studentName: string; owed: number; rows: number }[];
    };
  },

  // --- GRADING SCALE ---

  async getGradingScale() {
    const response = await apiFetch('/api/gradingScale');
    if (!response.ok) throw new Error('Failed to fetch grading scale');
    return await response.json();
  },

  async setGradingScale(scale: { bands: any[]; caMax: number; examMax: number; passMark: number }) {
    const response = await apiFetch('/api/gradingScale', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scale),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Failed to save the grading scale');
    return body;
  },

  // --- TEACHER ASSIGNMENTS (which subject, in which class) ---

  /** A teacher may read only their own; an admin may pass a teacherId. */
  async getTeacherAssignments(params: { teacherId?: string; classId?: string } = {}) {
    const q = new URLSearchParams();
    if (params.teacherId) q.set('teacherId', params.teacherId);
    if (params.classId) q.set('classId', params.classId);
    const response = await apiFetch(`/api/teacherAssignments${q.toString() ? `?${q}` : ''}`);
    if (!response.ok) throw new Error('Failed to fetch teacher assignments');
    return (await response.json()) as { teacherId: string; classId: string; courseCode: string; subject: string }[];
  },

  /** Replaces the teacher's whole set. The server derives assignedClasses from it. */
  async setTeacherAssignments(teacherId: string, assignments: { classId: string; courseCode: string }[]) {
    const response = await apiFetch(`/api/teacherAssignments/${encodeURIComponent(teacherId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to save teacher assignments');
    }
    return await response.json();
  },

  async getSubjectMergeStatus(classId: string, term: string) {
    const response = await apiFetch(`/api/subjectReports/merge-status?classId=${encodeURIComponent(classId)}&term=${encodeURIComponent(term)}`);
    if (!response.ok) throw new Error('Failed to fetch merge status');
    return await response.json();
  },

  getMergedSubjectReports(classId: string, term: string, callback: (data: any[]) => void) {
    return mockOnSnapshot(`/api/subjectReports/merged?classId=${encodeURIComponent(classId)}&term=${encodeURIComponent(term)}`, callback);
  },

  async finalizeClassReports(classId: string, term: string, remarks: Record<string, string>) {
    const response = await apiFetch('/api/reports/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId, term, remarks })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Failed to finalize class reports');
    return body;
  },

  // --- SCHEDULE ---
  getClassSchedule(classId: string, callback: (data: any[]) => void) {
    return mockOnSnapshot(`/api/schedules?classId=${encodeURIComponent(classId)}`, callback);
  },

  async saveSchedule(data: { classId: string; day: string; subjects: any[] }) {
    const response = await apiFetch('/api/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to save schedule');
    return await response.json();
  },

  async deleteSchedule(scheduleId: string) {
    const response = await apiFetch(`/api/schedules/${encodeURIComponent(scheduleId)}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete schedule');
    return await response.json();
  },

  // --- ASSIGNMENTS ---
  getAssignments(classId: string, callback: (data: any[]) => void) {
    return mockOnSnapshot(`/api/assignments?classId=${encodeURIComponent(classId)}`, callback);
  },

  async createAssignment(assignmentData: any) {
    const response = await apiFetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assignmentData)
    });
    if (!response.ok) throw new Error('Failed to create assignment');
    return await response.json();
  },

  async updateAssignment(assignmentId: string, data: any) {
    const response = await apiFetch(`/api/assignments/${encodeURIComponent(assignmentId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to update assignment');
    return await response.json();
  },

  async deleteAssignment(assignmentId: string) {
    const response = await apiFetch(`/api/assignments/${encodeURIComponent(assignmentId)}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete assignment');
  },

  // --- TEACHERS ---
  async registerTeacher(teacherData: any) {
    const response = await apiFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...teacherData, role: 'Teacher' })
    });
    if (!response.ok) throw new Error('Failed to register teacher');
    return await response.json();
  },

  async registerTeacherWithId(teacherId: string, teacherData: any) {
    const response = await apiFetch(`/api/users/${encodeURIComponent(teacherId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...teacherData, role: 'Teacher' })
    });
    if (!response.ok) throw new Error('Failed to register teacher with ID');
    return await response.json();
  },

  getTeachers(callback: (data: any[]) => void) {
    return mockOnSnapshot('/api/users?role=Teacher', callback);
  },

  // --- PARENTS ---
  async registerParentWithId(parentId: string, parentData: any) {
    const response = await apiFetch(`/api/users/${encodeURIComponent(parentId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...parentData, role: 'Parent' })
    });
    if (!response.ok) throw new Error('Failed to register parent with ID');
    return await response.json();
  },

  getParents(callback: (data: any[]) => void) {
    return mockOnSnapshot('/api/users?role=Parent', callback);
  },

  async resetUserPassword(uid: string) {
    const response = await apiFetch(`/api/users/${encodeURIComponent(uid)}/reset-password`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error('Failed to reset password');
    return await response.json();
  },

  // --- FEES ---
  async createFee(feeData: any) {
    const response = await apiFetch('/api/fees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feeData)
    });
    if (!response.ok) throw new Error('Failed to create fee record');
    return await response.json();
  },

  getAllFees(callback: (data: any[]) => void) {
    return mockOnSnapshot('/api/fees', callback);
  },

  getFeesForParent(parentId: string, callback: (data: any[]) => void) {
    return mockOnSnapshot(`/api/fees?parentId=${encodeURIComponent(parentId)}`, callback);
  },

  getFeesForStudent(studentId: string, callback: (data: any[]) => void) {
    return mockOnSnapshot(`/api/fees?studentId=${encodeURIComponent(studentId)}`, callback);
  },

  // --- QUIZZES ---
  async saveQuiz(quizData: any) {
    const response = await apiFetch('/api/quizzes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quizData)
    });
    if (!response.ok) throw new Error('Failed to save quiz');
    return await response.json();
  },

  async createQuiz(quizData: any) {
    return this.saveQuiz(quizData);
  },

  async updateQuiz(quizId: string, data: any) {
    const response = await apiFetch(`/api/quizzes/${encodeURIComponent(quizId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to update quiz');
    return await response.json();
  },

  async deleteQuiz(quizId: string) {
    const response = await apiFetch(`/api/quizzes/${encodeURIComponent(quizId)}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete quiz');
    return await response.json();
  },

  onQuizzesChange(callback: (data: any[]) => void) {
    return mockOnSnapshot('/api/quizzes', callback);
  },

  onTeacherQuizzesChange(teacherId: string, callback: (data: any[]) => void) {
    return mockOnSnapshot(`/api/quizzes?teacherId=${encodeURIComponent(teacherId)}`, callback);
  },

  // --- QUIZ RESULTS ---
  async submitQuizResult(data: { quizId: string; studentId: string; studentName?: string; answers: Record<string, string> }) {
    const response = await fetch('/api/quizResults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const body = await response.json();
    if (!response.ok) {
      const err = new Error(body.error || 'Failed to submit quiz result') as Error & { code?: string };
      // Lets the quiz screen tell "you already sat this" apart from a network
      // failure, which need very different messages for a student mid-exam.
      err.code = body.code;
      throw err;
    }
    return body;
  },

  getQuizResults(quizId: string, callback: (data: any[]) => void) {
    return mockOnSnapshot(`/api/quizResults?quizId=${encodeURIComponent(quizId)}`, callback);
  },

  /** Clears one student's attempt so they can retake. Teacher (own quiz) or admin only. */
  async resetQuizAttempt(quizId: string, studentId: string) {
    const response = await apiFetch(
      `/api/quizResults/${encodeURIComponent(quizId)}/${encodeURIComponent(studentId)}`,
      { method: 'DELETE' },
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Failed to reset that attempt');
    return body;
  },

  // --- EVENTS ---
  async createEvent(eventData: any) {
    const response = await apiFetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData)
    });
    if (!response.ok) throw new Error('Failed to create event');
    return await response.json();
  },

  getAllEvents(callback: (data: any[]) => void) {
    return mockOnSnapshot('/api/events', callback);
  },

  getEventsByAudience(audience: string, callback: (data: any[]) => void) {
    return mockOnSnapshot(`/api/events?audience=${encodeURIComponent(audience)}`, callback);
  },

  // --- ANNOUNCEMENTS ---
  async createAnnouncement(announcementData: { title: string; content: string; audience: string }) {
    const response = await apiFetch('/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(announcementData)
    });
    if (!response.ok) throw new Error('Failed to create announcement');
    return await response.json();
  },

  getAnnouncements(audience: string | null, callback: (data: any[]) => void) {
    const url = audience ? `/api/announcements?audience=${encodeURIComponent(audience)}` : '/api/announcements';
    return mockOnSnapshot(url, callback);
  },

  async deleteAnnouncement(id: string) {
    const response = await apiFetch(`/api/announcements/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete announcement');
    return await response.json();
  },

  // --- AUDIT LOGS ---
  async logActivity(data: { userId: string; userEmail: string; userName: string; action: string; details: string; type: 'registration' | 'fee_update' | 'config_change' | 'other' }) {
    try {
      const response = await apiFetch('/api/audit_logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to log activity');
      return await response.json();
    } catch (err) {
      console.error("Failed to log activity:", err);
    }
  },

  getAuditLogs(callback: (data: any[]) => void) {
    return mockOnSnapshot('/api/audit_logs', callback);
  },

  // --- GRADE & COURSE CONFIG OPERATIONS ---
  async createGradeConfig(id: string, data: any) {
    const response = await apiFetch(`/api/gradeConfigs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create grade configuration');
    return await response.json();
  },

  async deleteGradeConfig(id: string) {
    const response = await apiFetch(`/api/gradeConfigs/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete grade configuration');
    return await response.json();
  },

  async createCourseConfig(id: string, data: any) {
    const response = await apiFetch(`/api/courseConfigs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create course configuration');
    return await response.json();
  },

  async deleteCourseConfig(id: string) {
    const response = await apiFetch(`/api/courseConfigs/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete course configuration');
    return await response.json();
  },

  async getSystemSettings() {
    const response = await apiFetch('/api/systemSettings');
    if (!response.ok) throw new Error('Failed to fetch system settings');
    return await response.json();
  },

  async updateSystemSetting(key: string, value: string) {
    const response = await apiFetch(`/api/systemSettings/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    if (!response.ok) throw new Error('Failed to update system setting');
    return await response.json();
  },

  async changePassword(currentPassword: string, newPassword: string) {
    const response = await apiFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to change password');
    return data;
  },

  async promoteStudents(fromClass: string, toClass: string) {
    const response = await apiFetch('/api/students/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromClass, toClass })
    });
    if (!response.ok) throw new Error('Failed to promote students');
    return await response.json();
  }
};

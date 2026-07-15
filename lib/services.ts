// Generic service to handle database operations via REST API
const mockOnSnapshot = (url: string, callback: (data: any) => void) => {
  let active = true;
  let lastDataString = '';
  
  const fetchData = async () => {
    try {
      const response = await fetch(url);
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
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, ...data })
    });
    if (!response.ok) throw new Error('Failed to create user profile');
    return await response.json();
  },

  // --- ATTENDANCE ---
  async markAttendance(data: { studentId: string; parentId?: string; classId: string; date: string; status: string }) {
    const response = await fetch('/api/attendance', {
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
    const response = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(studentData)
    });
    if (!response.ok) throw new Error('Failed to register student');
    return await response.json();
  },

  async registerStudentWithId(studentId: string, studentData: any) {
    const response = await fetch(`/api/students/${encodeURIComponent(studentId)}`, {
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

  getGrades(callback: (data: any[]) => void) {
    return mockOnSnapshot('/api/grades', callback);
  },

  getCourses(callback: (data: any[]) => void) {
    return mockOnSnapshot('/api/courses', callback);
  },

  async updateStudent(studentId: string, data: any) {
    const response = await fetch(`/api/students/${encodeURIComponent(studentId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to update student');
    return await response.json();
  },

  async updateUser(userId: string, data: any) {
    const response = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to update user profile');
    return await response.json();
  },

  async updateFee(feeId: string, data: any) {
    const response = await fetch(`/api/fees/${encodeURIComponent(feeId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to update fee record');
    return await response.json();
  },

  // --- ADMIN STATS ---
  async getGlobalStats() {
    const response = await fetch('/api/stats/global');
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
    const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!response.ok) throw new Error('Failed to update report status');
    return await response.json();
  },

  async createReport(reportData: { studentId: string; parentId?: string; [key: string]: any }) {
    const response = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportData)
    });
    if (!response.ok) throw new Error('Failed to create report card');
    return await response.json();
  },

  // --- SCHEDULE ---
  getClassSchedule(classId: string, callback: (data: any[]) => void) {
    return mockOnSnapshot(`/api/schedules?classId=${encodeURIComponent(classId)}`, callback);
  },

  // --- ASSIGNMENTS ---
  getAssignments(classId: string, callback: (data: any[]) => void) {
    return mockOnSnapshot(`/api/assignments?classId=${encodeURIComponent(classId)}`, callback);
  },

  async createAssignment(assignmentData: any) {
    const response = await fetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assignmentData)
    });
    if (!response.ok) throw new Error('Failed to create assignment');
    return await response.json();
  },

  async deleteAssignment(assignmentId: string) {
    const response = await fetch(`/api/assignments/${encodeURIComponent(assignmentId)}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete assignment');
  },

  // --- TEACHERS ---
  async registerTeacher(teacherData: any) {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...teacherData, role: 'Teacher' })
    });
    if (!response.ok) throw new Error('Failed to register teacher');
    return await response.json();
  },

  async registerTeacherWithId(teacherId: string, teacherData: any) {
    const response = await fetch(`/api/users/${encodeURIComponent(teacherId)}`, {
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

  // --- FEES ---
  async createFee(feeData: any) {
    const response = await fetch('/api/fees', {
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
    const response = await fetch('/api/quizzes', {
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

  onQuizzesChange(callback: (data: any[]) => void) {
    return mockOnSnapshot('/api/quizzes', callback);
  },

  // --- EVENTS ---
  async createEvent(eventData: any) {
    const response = await fetch('/api/events', {
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
    const response = await fetch('/api/announcements', {
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
    const response = await fetch(`/api/announcements/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete announcement');
    return await response.json();
  },

  // --- AUDIT LOGS ---
  async logActivity(data: { userId: string; userEmail: string; userName: string; action: string; details: string; type: 'registration' | 'fee_update' | 'config_change' | 'other' }) {
    try {
      const response = await fetch('/api/audit_logs', {
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
    const response = await fetch(`/api/gradeConfigs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create grade configuration');
    return await response.json();
  },

  async deleteGradeConfig(id: string) {
    const response = await fetch(`/api/gradeConfigs/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete grade configuration');
    return await response.json();
  },

  async createCourseConfig(id: string, data: any) {
    const response = await fetch(`/api/courseConfigs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create course configuration');
    return await response.json();
  },

  async deleteCourseConfig(id: string) {
    const response = await fetch(`/api/courseConfigs/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete course configuration');
    return await response.json();
  },

  async getSystemSettings() {
    const response = await fetch('/api/systemSettings');
    if (!response.ok) throw new Error('Failed to fetch system settings');
    return await response.json();
  },

  async updateSystemSetting(key: string, value: string) {
    const response = await fetch(`/api/systemSettings/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    if (!response.ok) throw new Error('Failed to update system setting');
    return await response.json();
  },

  async changePassword(uid: string, currentPassword: string, newPassword: string) {
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, currentPassword, newPassword })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to change password');
    return data;
  },

  async promoteStudents(fromClass: string, toClass: string) {
    const response = await fetch('/api/students/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromClass, toClass })
    });
    if (!response.ok) throw new Error('Failed to promote students');
    return await response.json();
  }
};

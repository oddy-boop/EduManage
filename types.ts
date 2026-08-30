
export enum UserRole {
  ADMIN = 'Admin',
  TEACHER = 'Teacher',
  PARENT = 'Parent',
  STUDENT = 'Student',
  GUEST = 'Guest'
}

export enum View {
  // Auth
  LOGIN = 'LOGIN',

  // Teacher Views
  TEACHER_DASHBOARD = 'TEACHER_DASHBOARD',
  TEACHER_QUIZ_CONFIG = 'TEACHER_QUIZ_CONFIG',
  TEACHER_QUIZ_SHARE = 'TEACHER_QUIZ_SHARE',
  TEACHER_QUIZ_RESULTS = 'TEACHER_QUIZ_RESULTS', // Added
  TEACHER_ASSESSMENT_BOOK = 'TEACHER_ASSESSMENT_BOOK',
  TEACHER_REPORT_ENTRY = 'TEACHER_REPORT_ENTRY',
  TEACHER_CLASS_REVIEW = 'TEACHER_CLASS_REVIEW',
  TEACHER_ASSIGNMENTS = 'TEACHER_ASSIGNMENTS',
  TEACHER_ATTENDANCE = 'TEACHER_ATTENDANCE',

  // Admin Views
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD',
  ADMIN_REGISTRATION = 'ADMIN_REGISTRATION',
  ADMIN_FEES = 'ADMIN_FEES',
  ADMIN_CALENDAR = 'ADMIN_CALENDAR',
  ADMIN_ATTENDANCE = 'ADMIN_ATTENDANCE',
  ADMIN_APPROVALS = 'ADMIN_APPROVALS',
  ADMIN_SETTINGS = 'ADMIN_SETTINGS',
  ADMIN_AUDIT_LOGS = 'ADMIN_AUDIT_LOGS',
  ADMIN_ANNOUNCEMENTS = 'ADMIN_ANNOUNCEMENTS',

  // Parent Views
  PARENT_DASHBOARD = 'PARENT_DASHBOARD',
  PARENT_FEES = 'PARENT_FEES',
  PARENT_ASSIGNMENTS = 'PARENT_ASSIGNMENTS',
  PARENT_REPORTS = 'PARENT_REPORTS',
  PARENT_REPORT_DETAIL = 'PARENT_REPORT_DETAIL',

  // Student Views
  STUDENT_QUIZ = 'STUDENT_QUIZ',
  
  // Guest
  GUEST = 'GUEST'
}

export interface User {
  name: string;
  role: UserRole;
  avatar: string;
}

// --- Domain models ---
// These mirror the camelCase shape the backend returns (server.js rowToCamel), not the
// database's snake_case column names.

export interface StaffOrParentUser {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  loginId?: string;
  assignedClasses?: string[];
  assignedCourses?: string[];
  qualification?: string;
  subjects?: string[];
  createdAt?: string;
  updatedAt?: string;
  temporaryPassword?: string; // only ever present in the response right after (re)creation
}

export interface Student {
  id: string;
  name: string;
  parentId: string | null;
  classId: string | null;
  grade: string | null;
  admissionNumber: string | null;
  age: number | null;
  parentName: string | null;
  parentContact: string | null;
  loginId: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Fee {
  id: string;
  studentId: string;
  parentId: string | null;
  studentName?: string;
  totalAmount: number;
  amountPaid: number;
  dueDate: string | null;
  status: 'paid' | 'pending' | 'overdue' | string;
  type: string | null;
  term?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendanceRecord {
  id: number;
  studentId: string;
  parentId: string | null;
  classId: string;
  date: string;
  status: 'present' | 'absent' | 'late' | string;
  recordedAt?: string;
}

export interface QuizQuestion {
  id: string;
  text: string;
  type: 'Multiple Choice' | 'Short Answer' | 'True/False' | string;
  options?: string[];
  correctAnswer?: string; // stripped by the server for anonymous/student requests
  points?: number;
}

export interface Quiz {
  id: string;
  teacherId: string;
  title: string;
  description: string | null;
  questions: QuizQuestion[];
  isPublished: boolean;
  createdAt?: string;
}

export interface QuizResult {
  id: string;
  quizId: string;
  studentId: string;
  studentName: string | null;
  score: number;
  totalQuestions: number;
  correctCount: number;
  answers: Record<string, string>;
  submittedAt: string;
}

export interface ReportCard {
  id: string;
  studentId: string;
  parentId: string | null;
  studentName?: string;
  classId?: string;
  term: string;
  grades: Record<string, { score: number; grade: string; remarks?: string }>;
  totalScore: number | null;
  grade: string | null;
  comments: string | null;
  status: 'pending' | 'published' | 'rejected' | 'approved' | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Assignment {
  id: string;
  classId: string;
  title: string;
  description: string | null;
  dueDate: string;
  createdAt?: string;
}

export interface SchoolEvent {
  id: string;
  title: string;
  date: string;
  type: 'exam' | 'meeting' | 'holiday' | string;
  description: string | null;
  audience: 'all' | 'teachers' | 'parents' | string;
  createdAt?: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  audience: 'all' | 'teachers' | 'parents' | string;
  createdAt?: string;
}

export interface GradeConfig {
  id: string;
  name: string;
  baseFee: number;
  classTeacherId?: string | null;
  updatedAt?: string;
}

export interface SubjectReport {
  id: string;
  studentId: string;
  teacherId: string;
  classId: string;
  term: string;
  subject: string;
  caScore: number;
  examScore: number;
  remarks: string | null;
  status: 'draft' | 'submitted';
  submittedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SubjectMergeStatus {
  subjects: { subject: string; submittedCount: number; totalStudents: number; complete: boolean }[];
  allComplete: boolean;
  totalStudents: number;
}

export interface MergedStudentSubjects {
  studentId: string;
  studentName: string;
  subjects: SubjectReport[];
}

export interface CourseConfig {
  id: string;
  name: string;
  code: string;
  department: string | null;
  updatedAt?: string;
}

export interface ClassSchedule {
  id: string;
  classId: string;
  day: string;
  subjects: any[];
}

export const ASSESSMENT_CATEGORIES = ['Test', 'Homework', 'Class Work', 'Project', 'Participation', 'Quiz'] as const;
export type AssessmentCategory = typeof ASSESSMENT_CATEGORIES[number];

export interface Assessment {
  id: string;
  studentId: string;
  teacherId: string;
  classId: string;
  term: string;
  subject: string | null;
  category: AssessmentCategory | string;
  title: string | null;
  score: number;
  maxScore: number;
  date: string;
  createdAt?: string;
}

export interface AssessmentSummary {
  caScore: number;
  entryCount: number;
  averagePercent: number;
}

export interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: string;
  details: string | null;
  type: 'registration' | 'fee_update' | 'config_change' | 'other' | string;
  timestamp: string;
}

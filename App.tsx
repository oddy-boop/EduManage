
import React, { useState, useEffect } from 'react';
import { Login } from './pages/Login';
import { UserRole, View } from './types';
import { TeacherLayout, AdminLayout, ParentLayout } from './components/Layouts';
import { useAuth } from './lib/AuthContext';
import { loadGradingScale } from './lib/grading';
import { TeacherDashboard } from './pages/teacher/TeacherDashboard';
import { TeacherQuizConfig } from './pages/teacher/TeacherQuizConfig';
import { TeacherQuizShare } from './pages/teacher/TeacherQuizShare';
import { TeacherQuizResults } from './pages/teacher/TeacherQuizResults';
import { TeacherAssessmentBook } from './pages/teacher/TeacherAssessmentBook';
import { TeacherClassReview } from './pages/teacher/TeacherClassReview';
import { TeacherReportEntry } from './pages/teacher/TeacherReportEntry';
import { TeacherAssignments } from './pages/teacher/TeacherAssignments';
import { TeacherAttendance } from './pages/teacher/TeacherAttendance';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminRegistration } from './pages/admin/AdminRegistration';
import { AdminFees } from './pages/admin/AdminFees';
import { AdminCalendar } from './pages/admin/AdminCalendar';
import { AdminAttendance } from './pages/admin/AdminAttendance';
import { AdminApprovals } from './pages/admin/AdminApprovals';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminAuditLogs } from './pages/admin/AdminAuditLogs';
import { AdminAnnouncements } from './pages/admin/AdminAnnouncements';
import { ParentDashboard } from './pages/parent/ParentDashboard';
import { ParentFees } from './pages/parent/ParentFees';
import { ParentAssignments } from './pages/parent/ParentAssignments';
import { ParentReports } from './pages/parent/ParentReports';
import { ParentReportDetail } from './pages/parent/ParentReportDetail';
import { StudentQuiz } from './pages/student/StudentQuiz';
import { GuestView } from './pages/GuestView';

/**
 * The quiz link the teacher shares is /join-quiz/<id>. There is no router in this
 * app, so without this the link simply rendered the staff login page and the QR
 * code led nowhere. It is checked before auth because a student taking a quiz has
 * no portal account to be logged into.
 */
const isQuizLink = () => /^\/join-quiz\/[^/]+/.test(window.location.pathname);

const App: React.FC = () => {
  const { user, loading } = useAuth();
  const [quizLink] = useState(isQuizLink);
  const [role, setRole] = useState<UserRole | null>(null);
  const [currentView, setCurrentView] = useState<View>(View.LOGIN);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [selectedChild, setSelectedChild] = useState<any>(null);

  // Pull the school's configured grading scale once signed in, so entry screens
  // and report cards show the same letters the server will store.
  useEffect(() => {
    if (user) loadGradingScale();
  }, [user?.uid]);

  useEffect(() => {
    if (user) {
      if (role !== user.role) {
        setRole(user.role);
      }
      
      // Auto-navigate ONLY if we are at the LOGIN screen
      if (currentView === View.LOGIN) {
        switch (user.role) {
          case UserRole.TEACHER: setCurrentView(View.TEACHER_DASHBOARD); break;
          case UserRole.ADMIN: setCurrentView(View.ADMIN_DASHBOARD); break;
          case UserRole.PARENT: setCurrentView(View.PARENT_DASHBOARD); break;
          case UserRole.STUDENT: setCurrentView(View.STUDENT_QUIZ); break;
          case UserRole.GUEST: setCurrentView(View.GUEST); break;
          default: setCurrentView(View.LOGIN);
        }
      }
    } else {
      if (role !== null) setRole(null);
      if (currentView !== View.LOGIN) setCurrentView(View.LOGIN);
    }
  }, [user, role, currentView]);

  // Checked ahead of the session gate: a student on a shared quiz link is not a
  // portal user, and must not be bounced to the staff login screen.
  if (quizLink) {
    return <StudentQuiz />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const handleNavigation = (view: View) => {
    setCurrentView(view);
  };

  if (!role || currentView === View.LOGIN) {
    return <Login />;
  }

  if (role === UserRole.TEACHER) {
    return (
      <TeacherLayout onNavigate={handleNavigation} currentView={currentView} role={role}>
        {currentView === View.TEACHER_DASHBOARD && <TeacherDashboard onNavigate={handleNavigation} />}
        {currentView === View.TEACHER_QUIZ_CONFIG && <TeacherQuizConfig onNavigate={handleNavigation} />}
        {currentView === View.TEACHER_QUIZ_SHARE && <TeacherQuizShare onNavigate={handleNavigation} />}
        {currentView === View.TEACHER_QUIZ_RESULTS && <TeacherQuizResults onNavigate={handleNavigation} />}
        {currentView === View.TEACHER_ASSESSMENT_BOOK && <TeacherAssessmentBook />}
        {currentView === View.TEACHER_REPORT_ENTRY && <TeacherReportEntry />}
        {currentView === View.TEACHER_CLASS_REVIEW && <TeacherClassReview />}
        {currentView === View.TEACHER_ASSIGNMENTS && <TeacherAssignments />}
        {currentView === View.TEACHER_ATTENDANCE && <TeacherAttendance />}
      </TeacherLayout>
    );
  }

  if (role === UserRole.ADMIN) {
    return (
      <AdminLayout onNavigate={handleNavigation} currentView={currentView} role={role}>
        {currentView === View.ADMIN_DASHBOARD && <AdminDashboard onNavigate={handleNavigation} />}
        {currentView === View.ADMIN_REGISTRATION && <AdminRegistration />}
        {currentView === View.ADMIN_FEES && <AdminFees />}
        {currentView === View.ADMIN_ATTENDANCE && <AdminAttendance />}
        {currentView === View.ADMIN_CALENDAR && <AdminCalendar />}
        {currentView === View.ADMIN_APPROVALS && <AdminApprovals />}
        {currentView === View.ADMIN_SETTINGS && <AdminSettings />}
        {currentView === View.ADMIN_AUDIT_LOGS && <AdminAuditLogs />}
        {currentView === View.ADMIN_ANNOUNCEMENTS && <AdminAnnouncements />}
      </AdminLayout>
    );
  }

  if (role === UserRole.PARENT) {
    return (
      <ParentLayout onNavigate={handleNavigation} currentView={currentView} role={role}>
        {currentView === View.PARENT_DASHBOARD && <ParentDashboard onNavigate={handleNavigation} />}
        {currentView === View.PARENT_FEES && <ParentFees />}
        {currentView === View.PARENT_ASSIGNMENTS && <ParentAssignments />}
        {currentView === View.PARENT_REPORTS && (
          <ParentReports 
            onNavigate={(view: View, report: any, child: any) => {
              if (report) setSelectedReport(report);
              if (child) setSelectedChild(child);
              handleNavigation(view);
            }} 
          />
        )}
        {currentView === View.PARENT_REPORT_DETAIL && (
          <ParentReportDetail 
            onNavigate={handleNavigation} 
            report={selectedReport} 
            child={selectedChild} 
          />
        )}
      </ParentLayout>
    );
  }

  // Student view is standalone typically
  if (role === UserRole.STUDENT || currentView === View.STUDENT_QUIZ) {
    return <StudentQuiz />;
  }

  if (role === UserRole.GUEST || currentView === View.GUEST) {
    return <GuestView />;
  }

  return <div>Unknown Role</div>;
};

export default App;

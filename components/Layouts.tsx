import React from 'react';
import { Icon } from './Icon';
import { View } from '../types';
import { useAuth } from '../lib/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
  onNavigate: (view: View) => void;
  currentView: View;
  role: string;
}

export const TeacherLayout: React.FC<LayoutProps> = ({ children, onNavigate, currentView, role }) => {
  const { user, signOut } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  
  return (
    <div className="flex h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 overflow-hidden font-display">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-surface-light dark:bg-surface-dark border-r border-slate-200 dark:border-slate-800 flex flex-col h-full shrink-0 transition-transform lg:translate-x-0 lg:static ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-slate-100 dark:border-slate-800/50 flex justify-between items-center">
          <div className="flex gap-3 items-center">
            <div className="bg-primary aspect-square rounded-xl size-10 flex items-center justify-center text-white shadow-lg shadow-primary/20">
              <Icon name="school" className="text-[24px]" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-tight">EduManage</h1>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">Teacher Portal</p>
            </div>
          </div>
          <button className="lg:hidden text-slate-400" onClick={() => setIsSidebarOpen(false)}>
            <Icon name="close" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
          <NavItem 
            icon="dashboard" 
            label="Dashboard" 
            active={currentView === View.TEACHER_DASHBOARD} 
            onClick={() => { onNavigate(View.TEACHER_DASHBOARD); setIsSidebarOpen(false); }} 
          />
          <NavItem 
            icon="link" 
            label="Quiz URL" 
            active={currentView === View.TEACHER_QUIZ_CONFIG || currentView === View.TEACHER_QUIZ_SHARE} 
            onClick={() => { onNavigate(View.TEACHER_QUIZ_CONFIG); setIsSidebarOpen(false); }} 
          />
          <NavItem 
            icon="leaderboard" 
            label="Quiz Results" 
            active={currentView === View.TEACHER_QUIZ_RESULTS} 
            onClick={() => { onNavigate(View.TEACHER_QUIZ_RESULTS); setIsSidebarOpen(false); }} 
          />
          <NavItem 
            icon="analytics" 
            label="Report Generation" 
            active={currentView === View.TEACHER_REPORT_ENTRY} 
            onClick={() => { onNavigate(View.TEACHER_REPORT_ENTRY); setIsSidebarOpen(false); }} 
          />
          <NavItem 
            icon="assignment" 
            label="Assignments" 
            active={currentView === View.TEACHER_ASSIGNMENTS} 
            onClick={() => { onNavigate(View.TEACHER_ASSIGNMENTS); setIsSidebarOpen(false); }} 
          />
          <NavItem 
            icon="how_to_reg" 
            label="Attendance" 
            active={currentView === View.TEACHER_ATTENDANCE} 
            onClick={() => { onNavigate(View.TEACHER_ATTENDANCE); setIsSidebarOpen(false); }} 
          />
        </nav>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 dark:bg-slate-900/50">
            <div className="relative">
              <div className="bg-center bg-no-repeat bg-cover rounded-full size-10 ring-2 ring-white dark:ring-slate-700 shadow-sm" style={{ backgroundImage: `url(${user?.avatar || 'https://picsum.photos/seed/user/200'})` }}></div>
              <div className="absolute bottom-0 right-0 size-3 bg-green-500 border-2 border-white dark:border-slate-800 rounded-full"></div>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user?.name || 'Teacher'}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">Math Dept. Head</span>
            </div>
            <button onClick={() => signOut()} className="text-slate-400 hover:text-red-500 transition-colors">
              <Icon name="logout" className="text-lg" />
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <Header role="Teacher" onMenuClick={() => setIsSidebarOpen(true)} />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export const AdminLayout: React.FC<LayoutProps> = ({ children, onNavigate, currentView }) => {
  const { user, signOut } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  
  return (
    <div className="flex h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 overflow-hidden font-display">
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-[#1a202c] border-r border-slate-200 dark:border-slate-800 flex flex-col h-full shrink-0 transition-transform lg:translate-x-0 lg:static ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Icon name="school" className="text-2xl" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-none text-slate-900 dark:text-white">Admin Portal</h1>
              <span className="text-xs text-slate-500 dark:text-slate-400">School Admin</span>
            </div>
          </div>
          <button className="lg:hidden text-slate-400" onClick={() => setIsSidebarOpen(false)}>
            <Icon name="close" />
          </button>
        </div>
        <nav className="flex-1 px-4 flex flex-col gap-2 overflow-y-auto">
          <NavItem icon="dashboard" label="Dashboard" active={currentView === View.ADMIN_DASHBOARD} onClick={() => { onNavigate(View.ADMIN_DASHBOARD); setIsSidebarOpen(false); }} />
          <NavItem icon="person_add" label="Registration" active={currentView === View.ADMIN_REGISTRATION} onClick={() => { onNavigate(View.ADMIN_REGISTRATION); setIsSidebarOpen(false); }} />
          <NavItem icon="payments" label="School Fees" active={currentView === View.ADMIN_FEES} onClick={() => { onNavigate(View.ADMIN_FEES); setIsSidebarOpen(false); }} />
          <NavItem icon="calendar_month" label="Academic Calendar" active={currentView === View.ADMIN_CALENDAR} onClick={() => { onNavigate(View.ADMIN_CALENDAR); setIsSidebarOpen(false); }} />
          <NavItem icon="fact_check" label="Report Approvals" active={currentView === View.ADMIN_APPROVALS} onClick={() => { onNavigate(View.ADMIN_APPROVALS); setIsSidebarOpen(false); }} />
          <NavItem icon="campaign" label="Announcements" active={currentView === View.ADMIN_ANNOUNCEMENTS} onClick={() => { onNavigate(View.ADMIN_ANNOUNCEMENTS); setIsSidebarOpen(false); }} />
          <NavItem icon="history" label="Audit Logs" active={currentView === View.ADMIN_AUDIT_LOGS} onClick={() => { onNavigate(View.ADMIN_AUDIT_LOGS); setIsSidebarOpen(false); }} />
          <NavItem icon="settings" label="School Settings" active={currentView === View.ADMIN_SETTINGS} onClick={() => { onNavigate(View.ADMIN_SETTINGS); setIsSidebarOpen(false); }} />
        </nav>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-cover bg-center" style={{ backgroundImage: `url(${user?.avatar || 'https://picsum.photos/seed/admin/200'})` }}></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{user?.name || 'Administrator'}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Administrator</p>
            </div>
            <button onClick={() => signOut()} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <Header role="Admin" onMenuClick={() => setIsSidebarOpen(true)} />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export const ParentLayout: React.FC<LayoutProps> = ({ children, onNavigate, currentView }) => {
  const { user, signOut } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  
  return (
    <div className="flex h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 overflow-hidden font-display">
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between p-6 h-full transition-transform lg:translate-x-0 lg:static ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col gap-8">
          <div className="flex items-center justify-between lg:justify-start gap-3 px-2">
            <div className="flex items-center gap-3">
              <div className="bg-primary rounded-lg p-2 text-white flex items-center justify-center">
                <Icon name="school" className="text-2xl" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-[#0e121b] dark:text-white text-lg font-bold leading-tight">Parent Portal</h1>
                <p className="text-[#4e6797] dark:text-slate-400 text-xs font-normal">Global Academy</p>
              </div>
            </div>
            <button className="lg:hidden text-slate-400" onClick={() => setIsSidebarOpen(false)}>
              <Icon name="close" />
            </button>
          </div>
          <nav className="flex flex-col gap-2">
            <NavItem icon="dashboard" label="Dashboard" active={currentView === View.PARENT_DASHBOARD} onClick={() => { onNavigate(View.PARENT_DASHBOARD); setIsSidebarOpen(false); }} />
            <NavItem icon="payments" label="School Fees" active={currentView === View.PARENT_FEES} onClick={() => { onNavigate(View.PARENT_FEES); setIsSidebarOpen(false); }} />
            <NavItem icon="assignment" label="Assignments" active={currentView === View.PARENT_ASSIGNMENTS} onClick={() => { onNavigate(View.PARENT_ASSIGNMENTS); setIsSidebarOpen(false); }} />
            <NavItem icon="description" label="Reports" active={currentView === View.PARENT_REPORTS} onClick={() => { onNavigate(View.PARENT_REPORTS); setIsSidebarOpen(false); }} />
          </nav>
        </div>
        <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-10 h-10 rounded-full bg-cover bg-center" style={{ backgroundImage: `url(${user?.avatar || 'https://picsum.photos/seed/parent/200'})` }}></div>
            <div className="flex flex-col flex-1 overflow-hidden">
              <p className="text-sm font-semibold text-[#0e121b] dark:text-white truncate">{user?.name || 'Parent User'}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Guardian</p>
            </div>
            <button onClick={() => signOut()} className="text-slate-400 hover:text-red-500">
              <Icon name="logout" className="text-lg" />
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden bg-background-light dark:bg-background-dark">
        <Header role="Parent" onMenuClick={() => setIsSidebarOpen(true)} />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

const NavItem: React.FC<{ icon: string; label: string; active?: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-left transition-all ${active ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-primary dark:hover:text-white'}`}
  >
    <Icon name={icon} className={`text-[22px] ${active ? 'fill-1' : ''}`} />
    <span className="text-sm font-medium">{label}</span>
  </button>
);

const Header: React.FC<{ role: string; onMenuClick?: () => void }> = ({ role, onMenuClick }) => (
  <header className="h-16 flex items-center justify-between px-4 lg:px-8 bg-surface-light dark:bg-surface-dark border-b border-slate-200 dark:border-slate-800 shrink-0">
    <div className="flex items-center gap-4">
      {onMenuClick && (
        <button 
          onClick={onMenuClick}
          className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Icon name="menu" className="text-[24px]" />
        </button>
      )}
      <h2 className="text-base lg:text-lg font-semibold text-slate-800 dark:text-white truncate">Dashboard Overview</h2>
    </div>
    <div className="flex items-center gap-2 lg:gap-6">
      <div className="flex items-center gap-2">
        <button className="relative p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
          <Icon name="notifications" className="text-[24px]" />
          <span className="absolute top-2 right-2.5 size-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
        </button>
        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <div className="size-6 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Icon name="account_circle" className="text-[16px]" />
          </div>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Account</span>
        </button>
      </div>
    </div>
  </header>
);

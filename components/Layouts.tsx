import React, { useState } from 'react';
import { Icon } from './Icon';
import { View } from '../types';
import { useAuth } from '../lib/AuthContext';
import { Avatar, Drawer } from './ui';
import { useNotifications, type Notification } from '../lib/useNotifications';
import { useTheme, type Theme } from '../lib/theme';
import { ChangePasswordDrawer } from './ChangePassword';
import { SignaturePad } from './SignaturePad';

/* ---------------------------------------------------------------------------
   Shells

   Two, as approved:
     Overview     rail + content + right profile/calendar column  (dashboards)
     WorkSurface  rail + full-width content                       (tables, forms)

   Below `lg` the rail is replaced by a 5-item bottom tab bar rather than the
   old off-canvas drawer — a teacher marking a register one-handed should not
   have to open a drawer to change screen.
   --------------------------------------------------------------------------- */

interface NavEntry {
  icon: string;
  label: string;
  view: View;
  /** Other views that should keep this entry lit. */
  also?: View[];
  count?: number;
}

interface LayoutProps {
  children: React.ReactNode;
  onNavigate: (view: View) => void;
  currentView: View;
  role: string;
}

const TEACHER_NAV: NavEntry[] = [
  { icon: 'dashboard', label: 'Dashboard', view: View.TEACHER_DASHBOARD },
  { icon: 'link', label: 'Quiz URL', view: View.TEACHER_QUIZ_CONFIG, also: [View.TEACHER_QUIZ_SHARE] },
  { icon: 'leaderboard', label: 'Quiz Results', view: View.TEACHER_QUIZ_RESULTS },
  { icon: 'fact_check', label: 'Assessment Book', view: View.TEACHER_ASSESSMENT_BOOK },
  { icon: 'analytics', label: 'Report Generation', view: View.TEACHER_REPORT_ENTRY },
  { icon: 'task_alt', label: 'Class Teacher Review', view: View.TEACHER_CLASS_REVIEW },
  { icon: 'assignment', label: 'Assignments', view: View.TEACHER_ASSIGNMENTS },
  { icon: 'how_to_reg', label: 'Attendance', view: View.TEACHER_ATTENDANCE },
];

const ADMIN_NAV: NavEntry[] = [
  { icon: 'dashboard', label: 'Dashboard', view: View.ADMIN_DASHBOARD },
  { icon: 'person_add', label: 'Registration', view: View.ADMIN_REGISTRATION },
  { icon: 'payments', label: 'School Fees', view: View.ADMIN_FEES },
  { icon: 'how_to_reg', label: 'Attendance', view: View.ADMIN_ATTENDANCE },
  { icon: 'calendar_month', label: 'Academic Calendar', view: View.ADMIN_CALENDAR },
  { icon: 'fact_check', label: 'Report Approvals', view: View.ADMIN_APPROVALS },
  { icon: 'campaign', label: 'Announcements', view: View.ADMIN_ANNOUNCEMENTS },
  { icon: 'history', label: 'Audit Logs', view: View.ADMIN_AUDIT_LOGS },
  { icon: 'settings', label: 'School Settings', view: View.ADMIN_SETTINGS },
];

const PARENT_NAV: NavEntry[] = [
  { icon: 'dashboard', label: 'Dashboard', view: View.PARENT_DASHBOARD },
  { icon: 'payments', label: 'School Fees', view: View.PARENT_FEES },
  { icon: 'assignment', label: 'Assignments', view: View.PARENT_ASSIGNMENTS },
  { icon: 'description', label: 'Reports', view: View.PARENT_REPORTS, also: [View.PARENT_REPORT_DETAIL] },
];

const isActive = (entry: NavEntry, current: View) =>
  entry.view === current || (entry.also?.includes(current) ?? false);

/* --- Rail ----------------------------------------------------------------- */

const RailItem: React.FC<{ entry: NavEntry; active: boolean; onClick: () => void }> = ({ entry, active, onClick }) => (
  <button
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={`w-full flex items-center gap-[11px] px-3 py-[9px] rounded-xl text-[13px] tracking-[-0.005em] transition-colors
      focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white ${
        active
          ? 'bg-white text-primary font-semibold shadow-rail'
          : 'text-white/[0.78] font-medium hover:bg-white/[0.14] hover:text-white'
      }`}
  >
    <Icon name={entry.icon} className="text-[18px]" />
    <span className="truncate">{entry.label}</span>
    {entry.count ? (
      <span className="ml-auto bg-white text-primary text-[10.5px] font-bold px-[7px] py-px rounded-full">
        {entry.count}
      </span>
    ) : null}
  </button>
);

const TONE: Record<Notification['tone'], { dot: string; tint: string }> = {
  urgent: { dot: 'bg-danger', tint: 'bg-tint-blush' },
  warn: { dot: 'bg-warning', tint: 'bg-tint-butter' },
  good: { dot: 'bg-success', tint: 'bg-tint-mint' },
  info: { dot: 'bg-primary', tint: 'bg-tint-blue' },
};

/** The list itself, so the rail popover and the mobile sheet stay in step. */
const NotificationList: React.FC<{
  items: Notification[];
  loading: boolean;
  onPick: (v: View) => void;
}> = ({ items, loading, onPick }) => {
  if (loading) return <p className="px-2.5 py-4 text-[11.5px] text-slate-400">Checking…</p>;
  if (items.length === 0) {
    return (
      <div className="px-2.5 py-5 text-center">
        <Icon name="check_circle" className="text-[22px] text-success" />
        <p className="mt-1.5 text-[12px] font-semibold text-slate-900 dark:text-white">You are all caught up</p>
        <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">Nothing is waiting on you right now.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {items.map((n) => (
        <button
          key={n.id}
          onClick={() => n.view && onPick(n.view)}
          className={`text-left rounded-[13px] px-3 py-2.5 transition-colors ${TONE[n.tone].tint} hover:brightness-[0.98] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary`}
        >
          <div className="flex items-start gap-2.5">
            <span className={`size-[7px] rounded-full mt-1.5 shrink-0 ${TONE[n.tone].dot}`} />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-slate-900 dark:text-white leading-snug">{n.title}</p>
              {n.body && <p className="mt-1 text-[10.5px] text-slate-600 dark:text-slate-400 leading-relaxed">{n.body}</p>}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

/** Rail notifications. Everything shown is derived from live data — see useNotifications. */
const NotificationsButton: React.FC<{ onNavigate: (v: View) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { items, loading, count } = useNotifications(user ? { uid: user.uid, role: user.role, name: user.name } : null);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="w-full flex items-center gap-[11px] px-3 py-[9px] rounded-xl text-[13px] font-medium text-white/[0.78] hover:bg-white/[0.14] hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
      >
        <Icon name="notifications" className="text-[18px]" />
        Notifications
        {count > 0 && (
          <span className="ml-auto bg-white text-primary text-[10.5px] font-bold px-[7px] py-px rounded-full">{count}</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 bottom-full mb-2 w-[300px] max-h-[420px] overflow-y-auto z-50 rounded-panel bg-surface-light dark:bg-surface-dark shadow-panel ring-1 ring-slate-200 dark:ring-slate-700 p-2">
          <p className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Needs your attention
          </p>

          <NotificationList
            items={items}
            loading={loading}
            onPick={(v) => {
              onNavigate(v);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
};

/* --- Theme toggle --------------------------------------------------------- */

const THEME_OPTIONS: { value: Theme; icon: string; label: string }[] = [
  { value: 'light', icon: 'sun', label: 'Light' },
  { value: 'dark', icon: 'moon', label: 'Dark' },
  { value: 'system', icon: 'monitor', label: 'Match system' },
];

/**
 * Three states rather than a two-way switch: "match system" is a distinct choice,
 * and collapsing it into on/off silently freezes the app in whichever mode the
 * user happened to be in when they first touched the control.
 */
export const ThemeToggle: React.FC<{ variant?: 'rail' | 'plain' }> = ({ variant = 'rail' }) => {
  const { theme, setTheme } = useTheme();
  const onRail = variant === 'rail';

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`flex gap-1 p-[3px] rounded-xl ${
        onRail ? 'bg-white/[0.12]' : 'bg-slate-100 dark:bg-slate-800'
      }`}
    >
      {THEME_OPTIONS.map((o) => {
        const on = theme === o.value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            title={o.label}
            onClick={() => setTheme(o.value)}
            className={`flex-1 flex items-center justify-center py-[7px] rounded-[9px] transition-colors
              focus-visible:outline-2 focus-visible:outline-offset-1
              ${
                onRail
                  ? on
                    ? 'bg-white text-primary focus-visible:outline-white'
                    : 'text-white/[0.66] hover:text-white hover:bg-white/[0.1] focus-visible:outline-white'
                  : on
                    ? 'bg-primary text-white focus-visible:outline-primary'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus-visible:outline-primary'
              }`}
          >
            <Icon name={o.icon} className="text-[16px]" />
            <span className="sr-only">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
};

const Rail: React.FC<{
  portal: string;
  nav: NavEntry[];
  currentView: View;
  onNavigate: (v: View) => void;
}> = ({ portal, nav, currentView, onNavigate }) => {
  const { user, signOut } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  const [signing, setSigning] = useState(false);
  // Only the two roles that actually sign a report card.
  const canSign = user?.role === 'Teacher' || user?.role === 'Admin';
  const footerItem =
    'w-full flex items-center gap-[11px] px-3 py-[9px] rounded-xl text-[13px] font-medium text-white/[0.78] hover:bg-white/[0.14] hover:text-white transition-colors';

  /*
   * Three regions, not one long flex column. The rail used to space every child by
   * 22px and rely on the viewport being tall enough; once notifications, the theme
   * control, a signature entry and a password entry were added, the last item —
   * Sign out — fell off the bottom of a laptop screen with no way to reach it.
   * The nav scrolls; the account block is pinned and always visible.
   */
  return (
    <aside className="hidden lg:flex w-64 shrink-0 bg-primary flex-col px-3.5 pt-6 pb-5">
      <div className="shrink-0 flex items-center gap-[11px] px-2 mb-5">
        <div className="size-9 rounded-[11px] bg-white flex items-center justify-center text-primary">
          <Icon name="school" className="text-[20px]" />
        </div>
        <div className="flex flex-col gap-px min-w-0">
          <span className="text-[15px] font-bold text-white tracking-[-0.02em]">EduManage</span>
          <span className="text-[10px] font-medium text-white/60 uppercase tracking-[0.09em] truncate">{portal}</span>
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[3px] rail-scroll">
        {nav.map((e) => (
          <RailItem key={e.view} entry={e} active={isActive(e, currentView)} onClick={() => onNavigate(e.view)} />
        ))}
      </nav>

      <div className="shrink-0 flex flex-col gap-1.5 pt-3 mt-3 border-t border-white/[0.18]">
        <NotificationsButton onNavigate={onNavigate} />

        <div className="px-0.5 py-1">
          <ThemeToggle />
        </div>

        {/* Available in every portal, not just the admin's School Settings page:
            a teacher or parent handed a temporary password had no way to replace it. */}
        {canSign && (
          <button onClick={() => setSigning(true)} className={footerItem}>
            <Icon name="edit" className="text-[18px]" />
            My signature
          </button>
        )}

        <button onClick={() => setChangingPassword(true)} className={footerItem}>
          <Icon name="key" className="text-[18px]" />
          Change password
        </button>

        <button onClick={() => signOut()} className={footerItem}>
          <Icon name="logout" className="text-[18px]" />
          Sign out
        </button>
      </div>

      <ChangePasswordDrawer open={changingPassword} onClose={() => setChangingPassword(false)} />

      <Drawer open={signing} onClose={() => setSigning(false)} title="My signature" width={440}>
        <SignaturePad />
      </Drawer>
    </aside>
  );
};

/* --- Mobile bottom tabs --------------------------------------------------- */

/**
 * Below `lg` the blue rail is hidden, and everything that lived only in it went
 * with it: notifications, the theme control, change password — and sign out, which
 * meant a teacher on a phone could not leave their own session. Four nav tabs plus
 * a "More" sheet puts all of it back within reach.
 */
const MobileTabs: React.FC<{ nav: NavEntry[]; currentView: View; onNavigate: (v: View) => void }> = ({
  nav,
  currentView,
  onNavigate,
}) => {
  const { user, signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [signing, setSigning] = useState(false);
  const canSign = user?.role === 'Teacher' || user?.role === 'Admin';
  const { items, loading: notifsLoading, count } = useNotifications(
    user ? { uid: user.uid, role: user.role, name: user.name } : null,
  );

  const tabs = nav.slice(0, 4);
  const overflow = nav.slice(4);
  const inOverflow = overflow.some((e) => isActive(e, currentView));

  const tabClass = (on: boolean) =>
    `flex-1 min-h-14 flex flex-col items-center justify-center gap-1 rounded-xl text-[10px] transition-colors ${
      on ? 'text-primary font-semibold' : 'text-slate-400 font-medium'
    }`;

  return (
    <>
      <nav className="lg:hidden shrink-0 bg-surface-light dark:bg-surface-dark border-t border-slate-100 dark:border-slate-800 flex px-1.5 pt-1 pb-2.5">
        {tabs.map((e) => {
          const on = isActive(e, currentView);
          return (
            <button
              key={e.view}
              onClick={() => onNavigate(e.view)}
              aria-current={on ? 'page' : undefined}
              className={tabClass(on)}
            >
              <Icon name={e.icon} className="text-[22px]" />
              <span className="truncate max-w-full px-0.5">{e.label.split(' ')[0]}</span>
            </button>
          );
        })}
        <button onClick={() => setMoreOpen(true)} aria-label="More" className={`relative ${tabClass(inOverflow)}`}>
          <Icon name="menu" className="text-[22px]" />
          {count > 0 && (
            <span className="absolute top-1.5 right-[22%] min-w-[15px] h-[15px] px-1 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
              {count}
            </span>
          )}
          <span className="truncate max-w-full px-0.5">More</span>
        </button>
      </nav>

      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} title="More" width={320}>
        <div className="flex flex-col gap-5">
          {overflow.length > 0 && (
            <div className="flex flex-col gap-1">
              {overflow.map((e) => (
                <button
                  key={e.view}
                  onClick={() => {
                    onNavigate(e.view);
                    setMoreOpen(false);
                  }}
                  aria-current={isActive(e, currentView) ? 'page' : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${
                    isActive(e, currentView)
                      ? 'bg-tint-blue text-ink-blue font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40'
                  }`}
                >
                  <Icon name={e.icon} className="text-[19px]" />
                  {e.label}
                </button>
              ))}
            </div>
          )}

          <div>
            <p className="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Needs your attention
            </p>
            <NotificationList
              items={items}
              loading={notifsLoading}
              onPick={(v) => {
                onNavigate(v);
                setMoreOpen(false);
              }}
            />
          </div>

          <div>
            <p className="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">Appearance</p>
            <ThemeToggle variant="plain" />
          </div>

          <div className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">Account</p>
            {canSign && (
              <button
                onClick={() => {
                  setMoreOpen(false);
                  setSigning(true);
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
              >
                <Icon name="edit" className="text-[19px]" />
                My signature
              </button>
            )}
            <button
              onClick={() => {
                setMoreOpen(false);
                setChangingPassword(true);
              }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
            >
              <Icon name="key" className="text-[19px]" />
              Change password
            </button>
            <button
              onClick={() => {
                setMoreOpen(false);
                signOut();
              }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-ink-blush hover:bg-tint-blush transition-colors"
            >
              <Icon name="logout" className="text-[19px]" />
              Sign out
            </button>
          </div>
        </div>
      </Drawer>

      <ChangePasswordDrawer open={changingPassword} onClose={() => setChangingPassword(false)} />

      <Drawer open={signing} onClose={() => setSigning(false)} title="My signature" width={360}>
        <SignaturePad />
      </Drawer>
    </>
  );
};

/* --- Shell ---------------------------------------------------------------- */

const AppLayout: React.FC<LayoutProps & { portal: string; nav: NavEntry[] }> = ({
  children,
  onNavigate,
  currentView,
  portal,
  nav,
}) => (
  <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display">
    <Rail portal={portal} nav={nav} currentView={currentView} onNavigate={onNavigate} />
    <div className="flex-1 min-w-0 flex flex-col">
      <main className="flex-1 overflow-y-auto">{children}</main>
      <MobileTabs nav={nav} currentView={currentView} onNavigate={onNavigate} />
    </div>
  </div>
);

export const TeacherLayout: React.FC<LayoutProps> = (p) => (
  <AppLayout {...p} portal="Teacher Portal" nav={TEACHER_NAV} />
);
export const AdminLayout: React.FC<LayoutProps> = (p) => <AppLayout {...p} portal="Admin Portal" nav={ADMIN_NAV} />;
export const ParentLayout: React.FC<LayoutProps> = (p) => (
  <AppLayout {...p} portal="Parent Portal" nav={PARENT_NAV} />
);

/* --- The two content shells ----------------------------------------------- */

/** Registers, tables, forms. Full width — no right column. */
export const WorkSurface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="p-5 md:p-[26px] lg:px-[30px] flex flex-col gap-4 max-w-[1600px]">{children}</div>
);

/** Dashboards. Content plus the profile / calendar column. */
export const Overview: React.FC<{ children: React.ReactNode; aside?: React.ReactNode }> = ({ children, aside }) => (
  <div className="flex flex-col xl:flex-row max-w-[1600px]">
    <div className="flex-1 min-w-0 p-5 md:p-[26px] lg:pl-[30px] flex flex-col gap-5">{children}</div>
    {aside && (
      <aside className="w-full xl:w-[312px] shrink-0 bg-surface-light dark:bg-surface-dark xl:border-l border-slate-100 dark:border-slate-800 p-5 md:p-[26px] flex flex-col gap-5">
        {aside}
      </aside>
    )}
  </div>
);

/* --- Right-column furniture ----------------------------------------------- */

export const ProfileCard: React.FC<{ name: string; role: string; tint?: 'blue' | 'lilac' | 'peach' }> = ({
  name,
  role,
  tint = 'blue',
}) => (
  <div className="flex flex-col items-center gap-2">
    <Avatar name={name} tint={tint} size={74} online />
    <div className="text-center">
      <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">{name}</p>
      <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">{role}</p>
    </div>
  </div>
);

export type CalendarEvent = { date: string; type: 'exam' | 'event' | 'holiday' | 'fees' };

const EVENT_STYLE: Record<CalendarEvent['type'], string> = {
  exam: 'bg-tint-butter text-ink-butter font-semibold',
  event: 'bg-tint-mint text-ink-mint font-semibold',
  holiday: 'bg-tint-blush text-ink-blush font-semibold',
  fees: 'bg-tint-blush text-ink-blush font-semibold',
};

/** Monday-start month grid. Real dates — no hardcoded September. */
export const MiniCalendar: React.FC<{ events?: CalendarEvent[]; today?: Date }> = ({ events = [], today }) => {
  const now = today ?? new Date();
  const [cursor, setCursor] = React.useState(new Date(now.getFullYear(), now.getMonth(), 1));

  const byDay = React.useMemo(() => {
    const m = new Map<string, CalendarEvent['type']>();
    for (const e of events) {
      const d = new Date(e.date);
      if (!Number.isNaN(d.getTime())) m.set(d.toDateString(), e.type);
    }
    return m;
  }, [events]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  // getDay() is Sunday-based; shift so Monday is column 0.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);

  const cells = Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - lead + i));
  const weeks = cells.length / 7;
  // Drop a trailing all-next-month week so short months do not render a dead row.
  const visible = cells.slice(0, cells[35].getMonth() === month || weeks === 5 ? 42 : 35);

  const step = (delta: number) => setCursor(new Date(year, month + delta, 1));

  return (
    <div className="bg-slate-50 dark:bg-slate-900/40 rounded-panel p-3.5 pb-3">
      <div className="flex items-center justify-between px-1 pb-2.5">
        <button onClick={() => step(-1)} aria-label="Previous month" className="text-slate-400 hover:text-slate-600 p-1">
          <Icon name="chevron_left" className="text-[16px]" />
        </button>
        <span className="text-[12.5px] font-semibold text-slate-900 dark:text-white">
          {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <button onClick={() => step(1)} aria-label="Next month" className="text-slate-400 hover:text-slate-600 p-1">
          <Icon name="chevron_right" className="text-[16px]" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 justify-items-center">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d, i) => (
          <span
            key={d}
            className={`text-[10px] font-semibold pb-1 ${i === 5 ? 'text-orange-500' : i === 6 ? 'text-danger' : 'text-slate-400'}`}
          >
            {d}
          </span>
        ))}
        {visible.map((d) => {
          const outside = d.getMonth() !== month;
          const isToday = d.toDateString() === now.toDateString();
          const evt = byDay.get(d.toDateString());
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          return (
            <span
              key={d.toISOString()}
              className={`text-[11.5px] font-medium size-7 flex items-center justify-center rounded-lg ${
                outside
                  ? 'text-slate-300 dark:text-slate-700'
                  : isToday
                    ? 'bg-primary text-white font-semibold'
                    : evt
                      ? EVENT_STYLE[evt]
                      : weekend
                        ? d.getDay() === 0
                          ? 'text-danger'
                          : 'text-orange-500'
                        : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {d.getDate()}
            </span>
          );
        })}
      </div>

      <div className="flex items-center gap-3 px-1 pt-3 mt-2 border-t border-slate-200 dark:border-slate-800">
        {(
          [
            ['exam', 'Exam', 'bg-warning'],
            ['event', 'Event', 'bg-event'],
            ['holiday', 'Holiday', 'bg-holiday'],
          ] as const
        ).map(([k, label, dot]) => (
          <span key={k} className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
            <span className={`size-[7px] rounded-full ${dot}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
};

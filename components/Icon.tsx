import React from 'react';
import {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, Award, BadgeCheck, Banknote, Bell, BookOpen,
  Calendar, CalendarDays, ChartColumn, ChartLine, ChartPie, Check, ChevronDown, ChevronLeft,
  ChevronRight, ChevronsUpDown, CircleAlert, CircleCheck, CircleHelp, CirclePlus, CircleUser,
  CircleX, ClipboardCheck, ClipboardList, Clock, Copy, CreditCard, Download, Eye, FileText, Flag,
  FolderOpen, GraduationCap, GripVertical, Headset, History, Home, IdCard, Inbox, Info, KeyRound,
  LayoutDashboard, Lightbulb, Link2, Loader, LoaderCircle, Lock, LogOut, Mail, Medal, Megaphone,
  Menu, MoreVertical, Pencil, Percent, Plus, Presentation, Printer, QrCode, Quote, RefreshCw, Rocket,
  Save, School, Search, Send, Settings, ShieldCheck, SlidersHorizontal, SquareCheck, Table,
  Trash2, TrendingUp, TriangleAlert, Trophy, Undo2, User, UserCheck, UserPlus, Users, Wallet,
  WifiOff, X, Zap, Sun, Moon, Monitor, RotateCcw, EyeOff,
  type LucideIcon,
} from 'lucide-react';

/**
 * Icon
 *
 * The app previously rendered Material Symbols as a webfont glyph. This maps
 * every name already in use onto a lucide component, so no calling page has to
 * change — `<Icon name="dashboard" className="text-[24px]" />` still works.
 *
 * The trick that makes that true: the SVG is sized in `em`, so the existing
 * `text-[20px]` / `text-2xl` classes scattered through the pages keep controlling
 * icon size exactly as they did when it was a font glyph.
 */
const REGISTRY: Record<string, LucideIcon> = {
  account_circle: CircleUser,
  add: Plus,
  add_task: ClipboardCheck,
  analytics: ChartLine,
  arrow_back: ArrowLeft,
  arrow_forward: ArrowRight,
  arrow_forward_ios: ChevronRight,
  assignment: ClipboardList,
  auto_stories: BookOpen,
  badge: IdCard,
  bolt: Zap,
  calendar_month: Calendar,
  calendar_today: CalendarDays,
  campaign: Megaphone,
  cancel: CircleX,
  check: Check,
  check_circle: CircleCheck,
  chevron_left: ChevronLeft,
  chevron_right: ChevronRight,
  class: BookOpen,
  close: X,
  co_present: Presentation,
  credit_card: CreditCard,
  delete: Trash2,
  description: FileText,
  download: Download,
  east: ArrowRight,
  edit: Pencil,
  emoji_events: Trophy,
  event: Calendar,
  fact_check: ClipboardCheck,
  family_restroom: Users,
  file_download: Download,
  format_quote: Quote,
  groups: Users,
  history: History,
  home: Home,
  info: Info,
  key: KeyRound,
  lock: Lock,
  logout: LogOut,
  mail: Mail,
  menu: Menu,
  menu_book: BookOpen,
  military_tech: Medal,
  monitoring: Activity,
  no_sim: WifiOff,
  notifications: Bell,
  payments: CreditCard,
  pending: Clock,
  pending_actions: Clock,
  person: User,
  person_add: UserPlus,
  picture_as_pdf: FileText,
  priority_high: CircleAlert,
  print: Printer,
  quiz: CircleHelp,
  rocket_launch: Rocket,
  save: Save,
  schedule: Clock,
  school: GraduationCap,
  search: Search,
  settings: Settings,
  settings_system_daydream: Settings,
  support_agent: Headset,
  sync: RefreshCw,
  table_chart: Table,
  task_alt: CircleCheck,
  tips_and_updates: Lightbulb,
  trending_up: TrendingUp,
  tune: SlidersHorizontal,
  undo: Undo2,
  verified: BadgeCheck,
  verified_user: ShieldCheck,
  visibility: Eye,
  warning: TriangleAlert,
  west: ArrowLeft,

  /* Names introduced by the redesign */
  dashboard: LayoutDashboard,
  how_to_reg: UserCheck,
  leaderboard: ChartColumn,
  link: Link2,
  copy: Copy,
  qr: QrCode,
  wallet: Wallet,
  banknote: Banknote,
  percent: Percent,
  pie: ChartPie,
  drag: GripVertical,
  more: MoreVertical,
  send: Send,
  flag: Flag,
  checkbox: SquareCheck,
  chevron_down: ChevronDown,
  chevron_updown: ChevronsUpDown,
  circle_x: CircleX,
  circle_plus: CirclePlus,
  inbox: Inbox,
  folder_open: FolderOpen,
  spinner: LoaderCircle,
  loading: Loader,
  award: Award,
  offline: WifiOff,
  arrow_up_right: ArrowUpRight,
  school_cap: School,
  sun: Sun,
  moon: Moon,
  monitor: Monitor,
  reset: RotateCcw,
  visibility_off: EyeOff,
};

interface IconProps {
  name: string;
  className?: string;
  /** Kept for API compatibility with the old Material Symbols `fill` axis. */
  fill?: boolean;
  strokeWidth?: number;
}

export const Icon: React.FC<IconProps> = ({ name, className = '', fill = false, strokeWidth }) => {
  const Glyph = REGISTRY[name];

  if (!Glyph) {
    console.warn(`[Icon] no mapping for "${name}"`);
    return <span className={`inline-block ${className}`} style={{ width: '1em', height: '1em' }} aria-hidden />;
  }

  return (
    <Glyph
      className={`inline-block shrink-0 align-[-0.15em] ${className}`}
      width="1em"
      height="1em"
      strokeWidth={strokeWidth ?? (fill ? 2.4 : 1.7)}
      absoluteStrokeWidth={false}
      aria-hidden
      focusable={false}
    />
  );
};

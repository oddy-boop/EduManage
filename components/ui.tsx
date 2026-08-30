import React from 'react';
import { Icon } from './Icon';

/* ---------------------------------------------------------------------------
   EduManage UI primitives

   Every value here comes from the approved design canvas. Screens compose these
   rather than restating Tailwind strings, so a change to a radius or a tint
   happens once. Nothing in this file fetches or knows about the domain.
   --------------------------------------------------------------------------- */

export type Tint = 'blue' | 'peach' | 'mint' | 'butter' | 'blush' | 'lilac' | 'plain';

const TINT_BG: Record<Tint, string> = {
  blue: 'bg-tint-blue',
  peach: 'bg-tint-peach',
  mint: 'bg-tint-mint',
  butter: 'bg-tint-butter',
  blush: 'bg-tint-blush',
  lilac: 'bg-tint-lilac',
  plain: 'bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800',
};

const TINT_INK: Record<Tint, string> = {
  blue: 'text-ink-blue',
  peach: 'text-ink-peach',
  mint: 'text-ink-mint',
  butter: 'text-ink-butter',
  blush: 'text-ink-blush',
  lilac: 'text-ink-lilac',
  plain: 'text-slate-600 dark:text-slate-300',
};

export const tintInk = (t: Tint) => TINT_INK[t];

/* --- Page furniture ------------------------------------------------------- */

export const PageHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, subtitle, breadcrumb, actions }) => (
  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
    <div className="flex flex-col gap-1.5">
      {breadcrumb}
      <h1 className="text-2xl md:text-[26px] font-bold tracking-[-0.03em] text-slate-900 dark:text-white">
        {title}
      </h1>
      {subtitle && <p className="text-[12.5px] text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
  </div>
);

/** Greeting header — "Hi, Sarah" with the name in brand blue. */
export const Greeting: React.FC<{ name: string; subtitle?: React.ReactNode; actions?: React.ReactNode }> = ({
  name,
  subtitle,
  actions,
}) => (
  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl md:text-[26px] font-bold tracking-[-0.03em] text-slate-900 dark:text-white">
        Hi, <span className="text-primary">{name}</span>
      </h1>
      {subtitle && <p className="text-[12.5px] text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
  </div>
);

export const SectionHeading: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({
  children,
  action,
}) => (
  <div className="flex items-center justify-between">
    <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-white">{children}</h2>
    {action}
  </div>
);

/* --- Buttons -------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white shadow-primary hover:bg-primary-deep',
  secondary:
    'bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700',
  danger: 'bg-danger text-white hover:brightness-95',
  success: 'bg-success text-white hover:brightness-95',
  ghost: 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    icon?: string;
    block?: boolean;
    loading?: boolean;
  }
> = ({ variant = 'primary', icon, block, loading, children, className = '', disabled, ...rest }) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={`h-[38px] px-[18px] rounded-control text-[12.5px] font-semibold inline-flex items-center justify-center gap-[7px]
      transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
      disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
      ${BUTTON_VARIANT[variant]} ${block ? 'w-full' : ''} ${className}`}
  >
    {loading ? <Icon name="spinner" className="text-[16px] animate-spin" /> : icon && <Icon name={icon} className="text-[16px]" />}
    {children}
  </button>
);

/* --- Surfaces ------------------------------------------------------------- */

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement> & { pad?: boolean }> = ({
  pad = true,
  className = '',
  children,
  ...rest
}) => (
  <div
    {...rest}
    className={`bg-surface-light dark:bg-surface-dark rounded-panel shadow-card ${pad ? 'p-5' : ''} ${className}`}
  >
    {children}
  </div>
);

export const TintCard: React.FC<React.HTMLAttributes<HTMLDivElement> & { tint?: Tint }> = ({
  tint = 'blue',
  className = '',
  children,
  ...rest
}) => (
  <div {...rest} className={`${TINT_BG[tint]} rounded-panel p-5 ${className}`}>
    {children}
  </div>
);

/** The 4-up pastel metric tile used across every dashboard. */
export const StatTile: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: string;
  tint?: Tint;
  badge?: React.ReactNode;
  onClick?: () => void;
}> = ({ label, value, icon, tint = 'blue', badge, onClick }) => (
  <div
    onClick={onClick}
    className={`${TINT_BG[tint]} rounded-tile p-4 flex flex-col gap-2.5 ${
      onClick ? 'cursor-pointer transition-transform hover:-translate-y-0.5' : ''
    }`}
  >
    <div className="flex items-start justify-between">
      {icon && (
        <div className={`size-[30px] rounded-[10px] bg-white dark:bg-slate-900/50 flex items-center justify-center ${TINT_INK[tint]}`}>
          <Icon name={icon} className="text-[16px]" />
        </div>
      )}
      {badge}
    </div>
    <div>
      <p className="text-2xl font-bold tracking-[-0.03em] text-slate-900 dark:text-white">{value}</p>
      <p className="mt-0.5 text-[11.5px] text-slate-600 dark:text-slate-400">{label}</p>
    </div>
  </div>
);

/* --- Small pieces --------------------------------------------------------- */

export const Badge: React.FC<{ tone?: Tint; children: React.ReactNode; className?: string }> = ({
  tone = 'blue',
  children,
  className = '',
}) => (
  <span
    className={`text-[10.5px] font-semibold px-[11px] py-1 rounded-full whitespace-nowrap ${TINT_BG[tone]} ${TINT_INK[tone]} ${className}`}
  >
    {children}
  </span>
);

export const Chip: React.FC<{ active?: boolean; onClick?: () => void; children: React.ReactNode }> = ({
  active,
  onClick,
  children,
}) => (
  <button
    onClick={onClick}
    className={`text-xs font-medium px-[15px] py-[7px] rounded-[10px] transition-colors whitespace-nowrap
      focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        active
          ? 'bg-primary border border-primary text-white font-semibold'
          : 'bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300'
      }`}
  >
    {children}
  </button>
);

export const Avatar: React.FC<{ name?: string; tint?: Tint; size?: number; online?: boolean }> = ({
  name = '',
  tint = 'blue',
  size = 34,
  online,
}) => {
  const initials =
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?';
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={`rounded-full font-bold flex items-center justify-center ${TINT_BG[tint]} ${TINT_INK[tint]}`}
        style={{ width: size, height: size, fontSize: Math.max(9, size * 0.34) }}
      >
        {initials}
      </span>
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full bg-success border-2 border-white dark:border-slate-800"
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </span>
  );
};

export const ProgressBar: React.FC<{ value: number; tone?: 'primary' | 'success' | 'warning' | 'danger'; className?: string }> = ({
  value,
  tone = 'primary',
  className = '',
}) => {
  const bg = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tone];
  return (
    <div className={`h-[7px] rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden ${className}`}>
      <div className={`h-full rounded-full ${bg}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
};

/* --- Form controls -------------------------------------------------------- */

export const Field: React.FC<{ label?: React.ReactNode; hint?: React.ReactNode; error?: string; children: React.ReactNode; className?: string }> = ({
  label,
  hint,
  error,
  children,
  className = '',
}) => (
  <div className={`flex flex-col gap-[7px] ${className}`}>
    {label && <span className="text-[11.5px] font-medium text-slate-700 dark:text-slate-300">{label}</span>}
    {children}
    {error ? (
      <span className="text-[11px] text-danger flex items-center gap-1.5">
        <Icon name="priority_high" className="text-[13px]" />
        {error}
      </span>
    ) : (
      hint && <span className="text-[11px] text-slate-400">{hint}</span>
    )}
  </div>
);

const CONTROL =
  'h-10 rounded-control border bg-surface-light dark:bg-surface-dark px-3.5 text-[12.5px] text-slate-900 dark:text-white ' +
  'placeholder:text-slate-400 transition-shadow focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12';

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }> = ({
  invalid,
  className = '',
  ...rest
}) => (
  <input
    {...rest}
    className={`${CONTROL} ${invalid ? 'border-danger' : 'border-slate-200 dark:border-slate-700'} ${className}`}
  />
);

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className = '', ...rest }) => (
  <textarea
    {...rest}
    className={`rounded-control border border-slate-200 dark:border-slate-700 bg-surface-light dark:bg-surface-dark p-3.5 text-[12.5px] leading-relaxed text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12 ${className}`}
  />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', children, ...rest }) => (
  <select
    {...rest}
    className={`${CONTROL} border-slate-200 dark:border-slate-700 appearance-none bg-no-repeat pr-9 ${className}`}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6.5 9.5L12 15l5.5-5.5'/%3E%3C/svg%3E\")",
      backgroundPosition: 'right 12px center',
      backgroundSize: '15px',
    }}
  >
    {children}
  </select>
);

/** Present / Late / Absent — and every other exclusive small choice. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  toneFor,
  className = '',
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T | null;
  onChange: (v: T) => void;
  toneFor?: (v: T) => 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const TONE = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' };
  return (
    <div className={`flex gap-1 bg-slate-50 dark:bg-slate-900/60 p-[3px] rounded-xl ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        const tone = toneFor?.(o.value) ?? 'primary';
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex-1 text-center text-[11.5px] font-semibold py-[7px] rounded-[9px] transition-colors
              focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary
              ${on ? `${TONE[tone]} text-white` : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-[14px]">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`text-[12.5px] px-4 py-[9px] rounded-[11px] transition-colors whitespace-nowrap
            focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
              t.value === value
                ? 'bg-surface-light dark:bg-slate-700 text-primary dark:text-white font-semibold shadow-sm'
                : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-700'
            }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* --- Tables --------------------------------------------------------------- */

export const TableShell: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-surface-light dark:bg-surface-dark rounded-surface shadow-panel overflow-hidden ${className}`}>
    <div className="overflow-x-auto">{children}</div>
  </div>
);

export const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ className = '', children, ...rest }) => (
  <th
    {...rest}
    className={`text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400 text-left px-5 py-3.5 whitespace-nowrap ${className}`}
  >
    {children}
  </th>
);

export const Td: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ className = '', children, ...rest }) => (
  <td {...rest} className={`px-5 py-3 text-xs text-slate-700 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 ${className}`}>
    {children}
  </td>
);

/* --- States --------------------------------------------------------------- */

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton rounded-lg bg-slate-200/70 dark:bg-slate-700/50 ${className}`} />
);

/** Matches the shape of what is coming, so the layout does not jump. */
export const SkeletonTable: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <Card pad={false} className="p-5">
    <div className="flex gap-2.5 mb-3">
      <Skeleton className="h-[52px] flex-1" />
      <Skeleton className="h-[52px] flex-1" />
      <Skeleton className="h-[52px] flex-1" />
      <Skeleton className="h-[52px] flex-1" />
    </div>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-2.5 py-2.5 border-t border-slate-100 dark:border-slate-800">
        <Skeleton className="size-[30px] rounded-full" />
        <div className="flex-1 flex flex-col gap-1.5">
          <Skeleton className="h-2.5 w-1/2" />
          <Skeleton className="h-2 w-1/3" />
        </div>
        <Skeleton className="h-[18px] w-12 rounded-full" />
      </div>
    ))}
  </Card>
);

/**
 * "Nothing yet" — data has never existed. Offers the way to create it.
 * Never use this when a filter is the reason the list is empty.
 */
export const EmptyState: React.FC<{
  icon?: string;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ icon = 'inbox', title, body, action }) => (
  <div className="bg-slate-50 dark:bg-slate-900/40 rounded-2xl px-6 py-10 flex flex-col items-center gap-3 text-center">
    <div className="size-[52px] rounded-2xl bg-tint-blue flex items-center justify-center text-ink-blue">
      <Icon name={icon} className="text-[26px]" />
    </div>
    <div>
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
      {body && <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400 max-w-[280px]">{body}</p>}
    </div>
    {action}
  </div>
);

/** A filter excluded everything. Offers to widen — never to create. */
export const NoResults: React.FC<{ title: string; body?: React.ReactNode; onClear?: () => void; clearLabel?: string }> = ({
  title,
  body,
  onClear,
  clearLabel = 'Clear filters',
}) => (
  <div className="bg-slate-50 dark:bg-slate-900/40 rounded-2xl px-6 py-9 flex flex-col items-center gap-2.5 text-center">
    <div className="size-[46px] rounded-[15px] bg-surface-light dark:bg-surface-dark flex items-center justify-center text-slate-400">
      <Icon name="search" className="text-[22px]" />
    </div>
    <div>
      <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white">{title}</p>
      {body && <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">{body}</p>}
    </div>
    {onClear && (
      <div className="mt-1">
        <Chip onClick={onClear}>{clearLabel}</Chip>
      </div>
    )}
  </div>
);

/** Say what failed in the user's words. Always offer retry. Never a status code. */
export const ErrorState: React.FC<{ title: string; body?: React.ReactNode; onRetry?: () => void; secondary?: React.ReactNode }> = ({
  title,
  body,
  onRetry,
  secondary,
}) => (
  <div className="bg-tint-blush rounded-2xl px-6 py-9 flex flex-col items-center gap-2.5 text-center">
    <div className="size-[46px] rounded-[15px] bg-surface-light dark:bg-surface-dark flex items-center justify-center text-ink-blush">
      <Icon name="warning" className="text-[23px]" />
    </div>
    <div>
      <p className="text-[13.5px] font-semibold text-ink-blush">{title}</p>
      {body && <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-blush/85 max-w-[280px]">{body}</p>}
    </div>
    <div className="flex gap-2 mt-1">
      {onRetry && (
        <Button variant="danger" onClick={onRetry}>
          Try again
        </Button>
      )}
      {secondary}
    </div>
  </div>
);

/** A role that cannot see something is not an error to apologise for. */
export const NotAllowed: React.FC<{ title: string; body?: React.ReactNode }> = ({ title, body }) => (
  <div className="bg-slate-50 dark:bg-slate-900/40 rounded-2xl p-5 flex items-start gap-3.5">
    <div className="size-[38px] rounded-[13px] bg-surface-light dark:bg-surface-dark flex items-center justify-center text-slate-500 shrink-0">
      <Icon name="lock" className="text-[19px]" />
    </div>
    <div>
      <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{title}</p>
      {body && <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">{body}</p>}
    </div>
  </div>
);

/** Showing something old beats showing nothing — as long as you say it is old. */
export const StaleBanner: React.FC<{ children: React.ReactNode; onRefresh?: () => void }> = ({ children, onRefresh }) => (
  <div className="flex items-center gap-2.5 bg-tint-butter rounded-control px-3.5 py-3">
    <Icon name="sync" className="text-[16px] text-ink-butter shrink-0" />
    <span className="text-[11.5px] text-ink-butter flex-1 leading-relaxed">{children}</span>
    {onRefresh && (
      <button onClick={onRefresh} className="text-[11.5px] font-semibold text-ink-butter hover:underline">
        Refresh
      </button>
    )}
  </div>
);

export const InlineNote: React.FC<{ tone?: Tint; icon?: string; children: React.ReactNode }> = ({
  tone = 'plain',
  icon = 'info',
  children,
}) => (
  <div className={`flex items-start gap-2.5 rounded-control px-3.5 py-3 ${TINT_BG[tone]}`}>
    <Icon name={icon} className={`text-[16px] shrink-0 mt-px ${TINT_INK[tone]}`} />
    <p className={`text-[11.5px] leading-relaxed ${tone === 'plain' ? 'text-slate-600 dark:text-slate-400' : TINT_INK[tone]}`}>
      {children}
    </p>
  </div>
);

/* --- Drawer --------------------------------------------------------------- */

export const Drawer: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}> = ({ open, onClose, title, subtitle, footer, children, width = 408 }) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/32" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-50 bg-surface-light dark:bg-surface-dark shadow-drawer flex flex-col max-w-full"
        style={{ width }}
      >
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
          <div>
            <p className="text-[17px] font-bold tracking-[-0.025em] text-slate-900 dark:text-white">{title}</p>
            {subtitle && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="size-[30px] rounded-[9px] bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-700"
          >
            <Icon name="close" className="text-[16px]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex gap-2.5">{footer}</div>}
      </aside>
    </>
  );
};

/* --- Parent portal: child switcher ---------------------------------------- */

/** Used by all four parent screens, so it lives here rather than four times over. */
export const ChildSwitcher: React.FC<{
  children: { id: string; name: string; classId?: string; grade?: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
}> = ({ children: kids, activeId, onSelect }) => {
  if (kids.length <= 1) return null;
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
      {kids.map((c) => {
        const on = c.id === activeId;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            aria-pressed={on}
            className={`flex items-center gap-2.5 rounded-2xl py-2.5 pl-2.5 pr-4 shrink-0 transition-all ${
              on ? 'bg-primary shadow-primary' : 'bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Avatar name={c.name} size={34} tint={on ? 'blue' : 'lilac'} />
            <div className="text-left">
              <p className={`text-[13px] font-semibold ${on ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{c.name}</p>
              <p className={`text-[10.5px] ${on ? 'text-white/70' : 'text-slate-500'}`}>{c.classId || c.grade || '—'}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
};

/** Money helper shared by the fee screens. */
export const ghs = (n: number) => `GHS ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/** A fee row's billed amount — the API uses `totalAmount` on some rows, `amount` on others. */
export const feeBilled = (f: any) => parseFloat(f?.totalAmount ?? f?.amount ?? 0) || 0;
export const feePaid = (f: any) => parseFloat(f?.amountPaid ?? 0) || 0;

/** A row superseded by an arrears carry-forward. Kept for audit, owed no longer. */
export const isCarried = (f: any) => (f?.status ?? '') === 'carried_forward';

/** A carry-forward row: debt from an earlier term, re-raised in this one. */
export const isArrears = (f: any) => !!f?.isArrears;

/**
 * What a row still owes. Returns 0 for a carried row so the same debt is never
 * counted twice — it now lives in the arrears row that replaced it.
 */
export const feeOutstanding = (f: any) => (isCarried(f) ? 0 : Math.max(0, feeBilled(f) - feePaid(f)));

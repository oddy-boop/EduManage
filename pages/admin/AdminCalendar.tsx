import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { WorkSurface } from '../../components/Layouts';
import { Button, Card, Chip, Field, InlineNote, Input, PageHeader, Select, SkeletonTable, type Tint } from '../../components/ui';

const TYPES = [
  { value: 'event', label: 'General event', tint: 'mint' as Tint, dot: 'bg-event' },
  { value: 'exam', label: 'Examination', tint: 'butter' as Tint, dot: 'bg-exam' },
  { value: 'holiday', label: 'Holiday / break', tint: 'blush' as Tint, dot: 'bg-holiday' },
];

const AUDIENCES = [
  { value: 'all', label: 'All (teachers & parents)' },
  { value: 'teachers', label: 'Teachers only' },
  { value: 'parents', label: 'Parents & students only' },
];

const typeMeta = (t: string) => TYPES.find((x) => x.value === t) ?? TYPES[0];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const AdminCalendar: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', date: '', type: 'event', audience: 'all' });
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Monday-start, to match the mini calendar in the dashboards.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
  const monthLabel = firstOfMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };
  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  useEffect(() => {
    const unsub = firestoreService.getAllEvents((data) => {
      setEvents(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<number, any[]>();
    events.forEach((ev) => {
      const d = new Date(ev.date);
      if (Number.isNaN(d.getTime())) return;
      if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) return;
      const list = m.get(d.getDate()) ?? [];
      list.push(ev);
      m.set(d.getDate(), list);
    });
    return m;
  }, [events, viewYear, viewMonth]);

  const handleAddEvent = async () => {
    if (!newEvent.title.trim() || !newEvent.date) {
      setError('A title and a date are both required.');
      return;
    }
    setIsAdding(true);
    setError(null);
    try {
      await firestoreService.createEvent(newEvent);
      setNewEvent({ title: '', date: '', type: 'event', audience: 'all' });
    } catch (err) {
      console.error('Failed to create event:', err);
      setError('Could not add that event. Try again.');
    } finally {
      setIsAdding(false);
    }
  };

  const upcoming = useMemo(
    () =>
      events
        .filter((e) => {
          const d = new Date(e.date);
          return !Number.isNaN(d.getTime()) && d.getTime() >= new Date().setHours(0, 0, 0, 0);
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 5),
    [events],
  );

  return (
    <WorkSurface>
      <PageHeader
        title="Academic Calendar"
        subtitle="Events, exams and holidays — each published to a chosen audience"
        actions={
          <Button variant="secondary" onClick={goToToday}>
            Today
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_372px]">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={goToPrevMonth}
                aria-label="Previous month"
                className="size-8 rounded-[10px] border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Icon name="chevron_left" className="text-[16px]" />
              </button>
              <p className="text-[17px] font-bold tracking-[-0.025em] text-slate-900 dark:text-white">{monthLabel}</p>
              <button
                type="button"
                onClick={goToNextMonth}
                aria-label="Next month"
                className="size-8 rounded-[10px] border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Icon name="chevron_right" className="text-[16px]" />
              </button>
            </div>
            <div className="hidden sm:flex gap-3.5">
              {TYPES.map((t) => (
                <span key={t.value} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className={`size-2.5 rounded-[3px] ${t.dot}`} />
                  {t.label.split(' ')[0]}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
              <span
                key={d}
                className={`text-[10.5px] font-semibold text-center pb-1 ${i === 5 ? 'text-orange-500' : i === 6 ? 'text-danger' : 'text-slate-400'}`}
              >
                {d}
              </span>
            ))}

            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={`blank-${i}`} className="min-h-[92px] rounded-[13px] bg-slate-50/60 dark:bg-slate-900/20" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayEvents = byDay.get(day) ?? [];
              const isToday =
                viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
              const dateStr = iso(new Date(viewYear, viewMonth, day));
              const selected = newEvent.date === dateStr;
              return (
                <div
                  key={day}
                  className={`relative min-h-[92px] rounded-[13px] p-2 flex flex-col gap-1.5 ${
                    isToday
                      ? 'bg-tint-blue outline outline-[1.5px] -outline-offset-[1.5px] outline-primary'
                      : selected
                        ? 'bg-tint-blue'
                        : 'bg-slate-50 dark:bg-slate-900/40'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className={`text-[11.5px] ${isToday ? 'font-bold text-primary' : 'text-slate-600 dark:text-slate-400'}`}>
                      {day}
                    </span>
                    {/* Always visible with a label — a hover-only affordance is
                        unreachable by keyboard and invisible on touch. */}
                    <button
                      type="button"
                      onClick={() => setNewEvent({ ...newEvent, date: dateStr })}
                      aria-label={`Add an event on ${monthLabel.split(' ')[0]} ${day}`}
                      className="size-6 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 text-primary hover:bg-primary hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                    >
                      <Icon name="add" className="text-[13px]" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    {dayEvents.slice(0, 2).map((ev, k) => {
                      const meta = typeMeta(ev.type);
                      return (
                        <span
                          key={ev.id ?? k}
                          title={ev.title}
                          className={`text-[9.5px] font-semibold text-white rounded-md px-1.5 py-[3px] truncate ${meta.dot}`}
                        >
                          {ev.title}
                        </span>
                      );
                    })}
                    {dayEvents.length > 2 && (
                      <span className="text-[9.5px] text-slate-400 px-1">+{dayEvents.length - 2} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">Add an event</p>

            <Field label="Title">
              <Input
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                placeholder="e.g. Science Fair"
              />
            </Field>

            <Field label="Date">
              <Input type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} />
            </Field>

            <Field label="Type">
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <Chip key={t.value} active={newEvent.type === t.value} onClick={() => setNewEvent({ ...newEvent, type: t.value })}>
                    {t.label}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Who sees it" hint="Decides which dashboards and calendars this appears on.">
              <Select value={newEvent.audience} onChange={(e) => setNewEvent({ ...newEvent, audience: e.target.value })}>
                {AUDIENCES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>

            {error && <InlineNote tone="blush" icon="priority_high">{error}</InlineNote>}

            <InlineNote icon="info">
              This is not a notification — nobody is alerted. It appears on the calendars of the audience you choose.
            </InlineNote>

            <div className="flex gap-2.5">
              <Button
                variant="secondary"
                block
                onClick={() => {
                  setNewEvent({ title: '', date: '', type: 'event', audience: 'all' });
                  setError(null);
                }}
              >
                Clear
              </Button>
              <Button block icon="add" loading={isAdding} onClick={handleAddEvent}>
                Add to calendar
              </Button>
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Coming up</p>
            {loading ? (
              <SkeletonTable rows={3} />
            ) : upcoming.length === 0 ? (
              <p className="text-[11.5px] text-slate-400 leading-relaxed">
                Nothing scheduled ahead. Add an exam, holiday or event and it appears on everyone&rsquo;s calendar.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {upcoming.map((ev, i) => {
                  const meta = typeMeta(ev.type);
                  const d = new Date(ev.date);
                  return (
                    <div key={ev.id ?? i} className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-[13px] px-3 py-2.5">
                      <span className={`w-1 self-stretch rounded-full ${meta.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-slate-900 dark:text-white truncate">{ev.title}</p>
                        <p className="text-[10.5px] text-slate-500">
                          {d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {ev.audience || 'all'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </WorkSurface>
  );
};

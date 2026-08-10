import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';

export const AdminCalendar: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', date: '', type: 'event', audience: 'all' });
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay(); // 0 = Sunday
  const monthLabel = firstOfMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  const goToPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else { setViewMonth(m => m - 1); }
  };
  const goToNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else { setViewMonth(m => m + 1); }
  };
  const goToToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); };

  useEffect(() => {
    // Subscribing to all events
    const unsub = firestoreService.getAllEvents((data) => {
      setEvents(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleAddEvent = async () => {
    if (!newEvent.title || !newEvent.date) return;
    try {
        await firestoreService.createEvent(newEvent);
        setIsAdding(false);
        setNewEvent({ title: '', date: '', type: 'event', audience: 'all' });
    } catch (e) {
        console.error("Failed to add event", e);
    }
  };

  if (loading) {
     return (
       <div className="flex items-center justify-center h-full">
         <Icon name="sync" className="animate-spin text-primary text-4xl" />
       </div>
     );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 h-full flex flex-col">
      <div className="flex justify-between items-center shrink-0">
         <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
               <span className="font-bold text-slate-900 dark:text-white">Admin Portal</span>
               <span>/</span>
               <span className="font-medium text-primary">Academic Calendar</span>
            </div>
            <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Calendar</h1>
            </div>
         </div>
         <div className="flex items-center gap-4">
             <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                 <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-red-500"></span> Holiday</span>
                 <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500"></span> Exam</span>
                 <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-green-500"></span> Event</span>
             </div>
             <button 
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
              >
                  <Icon name="event" /> Add Event
              </button>
         </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-8">
          {/* Calendar View Placeholder (Simplified for logic transition) */}
          <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{monthLabel}</h3>
                  <div className="flex items-center gap-2">
                      <button onClick={goToToday} className="px-3 py-1.5 text-[10px] font-black uppercase text-primary hover:bg-primary/5 rounded-lg">Today</button>
                      <button onClick={goToPrevMonth} className="size-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                          <Icon name="chevron_left" className="text-lg" />
                      </button>
                      <button onClick={goToNextMonth} className="size-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                          <Icon name="chevron_right" className="text-lg" />
                      </button>
                  </div>
              </div>
              <div className="grid grid-cols-7 mb-4 text-center border-b border-slate-100 dark:border-slate-700 pb-2">
                  {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                      <div key={day} className="text-[10px] font-black text-slate-400 py-2">{day}</div>
                  ))}
              </div>
              <div className="flex-1 grid grid-cols-7 gap-2">
                  {[...Array(leadingBlanks)].map((_, i) => (
                      <div key={`blank-${i}`} className="min-h-[80px]" />
                  ))}
                  {[...Array(daysInMonth)].map((_, i) => {
                      const day = i + 1;
                      const isToday = viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
                      const dayEvents = events.filter(e => {
                        const date = new Date(e.date);
                        return date.getFullYear() === viewYear && date.getMonth() === viewMonth && date.getDate() === day;
                      });

                      return (
                          <div key={day} className={`border rounded-lg p-2 min-h-[80px] hover:border-primary transition-all group relative ${isToday ? 'border-primary bg-primary/5' : 'border-slate-100 dark:border-slate-700/50'}`}>
                              <span className={`text-xs font-bold ${isToday ? 'text-primary' : 'text-slate-500'}`}>{day}</span>
                              <div className="mt-1 space-y-1">
                                {dayEvents.map((e, idx) => (
                                  <div
                                    key={idx}
                                    title={e.title}
                                    className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold truncate ${
                                      e.type === 'holiday' ? 'bg-red-50 text-red-600' :
                                      e.type === 'exam' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'
                                    }`}
                                  >
                                    {e.title}
                                  </div>
                                ))}
                              </div>
                              <button
                                onClick={() => {
                                  const date = new Date(viewYear, viewMonth, day);
                                  setNewEvent({ ...newEvent, date: date.toISOString().split('T')[0] });
                                  setIsAdding(true);
                                }}
                                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 size-5 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-primary"
                              >
                                <Icon name="add" className="text-[10px]" />
                              </button>
                          </div>
                      );
                  })}
              </div>
          </div>

          <div className="w-80 space-y-6 shrink-0">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
                  <h3 className="font-bold text-slate-900 dark:text-white mb-6">Upcoming Events</h3>
                  <div className="space-y-6">
                      {events.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0,5).map((evt, i) => (
                          <div key={i} className="flex gap-4 group">
                              <div className="flex flex-col items-center justify-center size-12 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shrink-0">
                                  <span className="text-[10px] font-black text-primary uppercase">{new Date(evt.date).toLocaleString('default', { month: 'short' })}</span>
                                  <span className="text-lg font-black text-slate-900 dark:text-white leading-none">{new Date(evt.date).getDate()}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-primary transition-colors">{evt.title}</h4>
                                  <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2 mt-1">
                                    <span className={`size-1.5 rounded-full ${
                                      evt.type === 'holiday' ? 'bg-red-500' : 
                                      evt.type === 'exam' ? 'bg-amber-500' : 'bg-green-500'
                                    }`}></span>
                                    {evt.type}
                                  </p>
                              </div>
                          </div>
                      ))}
                      {events.length === 0 && (
                        <div className="text-center py-8 text-slate-400 italic text-xs">No upcoming events scheduled.</div>
                      )}
                  </div>
              </div>

              <div className="bg-primary text-white rounded-xl p-6 shadow-lg">
                  <h3 className="font-bold mb-2">School-wide Sync</h3>
                  <p className="text-[10px] text-blue-100 opacity-80 leading-relaxed">Changes made to the academic calendar are instantly pushed to Parent and Teacher dashboards.</p>
              </div>
          </div>
      </div>

      {isAdding && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-8 border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">Create New Event</h3>
                      <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-red-500"><Icon name="close" /></button>
                  </div>
                  <div className="space-y-4">
                      <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase">Event Title</label>
                          <input 
                            type="text" 
                            className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 ring-primary"
                            placeholder="e.g. Science Fair"
                            value={newEvent.title}
                            onChange={(e) => setNewEvent({...newEvent, title: e.target.value})}
                          />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase">Date</label>
                            <input 
                                type="date" 
                                className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 ring-primary"
                                value={newEvent.date}
                                onChange={(e) => setNewEvent({...newEvent, date: e.target.value})}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase">Type</label>
                            <select 
                                className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 ring-primary"
                                value={newEvent.type}
                                onChange={(e) => setNewEvent({...newEvent, type: e.target.value})}
                            >
                                <option value="event">General Event</option>
                                <option value="holiday">Holiday / Break</option>
                                <option value="exam">Examination</option>
                            </select>
                          </div>
                      </div>
                      <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase">Audience Visibility</label>
                          <select 
                              className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 ring-primary font-bold"
                              value={newEvent.audience}
                              onChange={(e) => setNewEvent({...newEvent, audience: e.target.value})}
                          >
                              <option value="all">All (Teachers & Parents)</option>
                              <option value="teachers">Teachers Only</option>
                              <option value="parents">Parents & Students Only</option>
                          </select>
                      </div>
                      <button 
                        onClick={handleAddEvent}
                        className="w-full py-4 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 mt-4 transition-all"
                      >
                          Add to Calendar
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

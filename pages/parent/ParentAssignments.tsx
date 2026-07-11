import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';

export const ParentAssignments: React.FC = () => {
  const { user } = useAuth();
  const [activeChild, setActiveChild] = useState<any>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = firestoreService.getStudentsForParent(user.uid, (data) => {
      setChildren(data);
      if (data.length > 0 && !activeChild) {
        setActiveChild(data[0]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user, activeChild]);

  useEffect(() => {
    if (!activeChild?.id) return;
    const unsub = firestoreService.getAssignments(activeChild.classId, setAssignments);
    return () => unsub();
  }, [activeChild]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Icon name="sync" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <span>Parent Portal</span>
            <Icon name="chevron_right" className="text-xs" />
            <span>Assignments</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Assignments</h1>
          <p className="text-slate-500 text-sm mt-1">Track tasks for {activeChild?.name}.</p>
        </div>
        
        {/* Child Selector for Multi-child Parents */}
        {children.length > 1 && (
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg self-start">
             {children.map(child => (
               <button 
                 key={child.id}
                 onClick={() => setActiveChild(child)}
                 className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                   activeChild?.id === child.id ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500'
                 }`}
               >
                 {child.name}
               </button>
             ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50 dark:bg-slate-700/30 text-xs font-bold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-700">
          <div className="col-span-5 md:col-span-4">Subject</div>
          <div className="hidden md:block col-span-3">Title</div>
          <div className="col-span-3 md:col-span-2">Due Date</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2 md:col-span-1 text-right">Action</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {assignments.length > 0 ? assignments.map((item, i) => (
            <div key={item.id || i} className="grid grid-cols-12 gap-4 px-6 py-5 items-center hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
              <div className="col-span-5 md:col-span-4 flex items-center gap-4">
                <div className={`size-10 rounded-lg flex items-center justify-center shrink-0 bg-blue-100 text-blue-600 dark:bg-opacity-20`}>
                  <Icon name="assignment" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.subject}</p>
                  <p className="text-xs text-slate-500 truncate">{item.classId}</p>
                </div>
              </div>
              <div className="hidden md:block col-span-3 text-sm text-slate-600 dark:text-slate-300">
                {item.title}
              </div>
              <div className="col-span-3 md:col-span-2">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{item.dueDate?.toDate ? item.dueDate.toDate().toLocaleDateString() : 'No date'}</p>
                <p className={`text-[10px] font-bold text-slate-400`}>Official Deadline</p>
              </div>
              <div className="col-span-2">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-opacity-20`}>
                  ASSIGNED
                </span>
              </div>
              <div className="col-span-2 md:col-span-1 text-right">
                <button className="text-primary hover:text-blue-700 font-bold text-xs whitespace-nowrap">
                  View Details
                </button>
              </div>
            </div>
          )) : (
            <div className="p-12 text-center text-slate-400 text-sm">
              No assignments found for this class.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

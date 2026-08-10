import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { View } from '../../types';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';
import { exportToCSV } from '../../lib/exportUtils';

interface ParentReportsProps {
  onNavigate: (view: View, report?: any, child?: any) => void;
}

export const ParentReports: React.FC<ParentReportsProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [children, setChildren] = useState<any[]>([]);
  const [activeChild, setActiveChild] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
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
    if (!activeChild?.id || !user?.uid) return;
    const unsub = firestoreService.getStudentReports(activeChild.id, user.uid, setReports);
    return () => unsub();
  }, [activeChild, user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Icon name="sync" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <span>Parent Portal</span>
            <Icon name="chevron_right" className="text-xs" />
            <span>Academic Management</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Reports History</h1>
          <p className="text-slate-500 text-sm mt-1">{activeChild?.name} • Grade {activeChild?.classId} • Student ID: {activeChild?.id}</p>
        </div>

        {/* Child Selector */}
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {reports.length > 0 ? reports.map((report, i) => (
          <div key={report.id || i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 relative overflow-hidden group hover:border-primary/50 transition-colors">
             {i === 0 && (
                 <span className="absolute top-0 right-0 bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">LATEST</span>
             )}
             
             <div className="flex justify-between items-start mb-4">
                 <div className="size-12 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-primary flex items-center justify-center">
                     <Icon name="verified" className={i === 0 ? 'text-2xl' : 'text-xl opacity-50'} />
                 </div>
                 <Icon name="check_circle" className="text-green-500 text-sm" />
             </div>

             <h3 className="text-xl font-bold text-slate-900 dark:text-white">{report.term}</h3>
             <p className="text-xs text-slate-500 mb-6">{report.session || 'Academic Year'}</p>

             <div className="flex items-end gap-2 mb-6">
                 <div>
                     <p className="text-[10px] font-bold uppercase text-slate-400">Status</p>
                     <span className="inline-block px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold rounded uppercase">{report.status}</span>
                 </div>
                 <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-2"></div>
                  <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Total Score</p>
                      <p className="text-xl font-black text-slate-900 dark:text-white">{report.totalScore ? `${report.totalScore} / 100` : 'N/A'}</p>
                  </div>
             </div>

             <div className="flex gap-3">
                 <button 
                    onClick={() => onNavigate(View.PARENT_REPORT_DETAIL, report, activeChild)}
                    className="flex-1 bg-primary text-white py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
                 >
                     <Icon name="visibility" className="text-lg" /> Details
                 </button>
                 <button
                    onClick={() => exportToCSV([report], `${activeChild?.name || 'student'}_${report.term}_report.csv`)}
                    className="aspect-square bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                 >
                     <Icon name="download" />
                 </button>
             </div>
          </div>
        )) : (
          <div className="col-span-full py-20 text-center">
            <Icon name="history" className="text-6xl text-slate-200 dark:text-slate-700 mb-4 mx-auto" />
            <p className="text-slate-500 font-medium italic">No report history found for this student.</p>
          </div>
        )}
      </div>

      <div className="flex items-start gap-4 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
        <Icon name="info" className="text-primary mt-0.5" />
        <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Historical Data Notice</h4>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">These reports are official school records. If you notice any discrepancies in the archived data, please contact the Registrar's Office.</p>
        </div>
      </div>
    </div>
  );
};

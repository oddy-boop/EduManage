import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';

export const AdminApprovals: React.FC = () => {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [activeReport, setActiveReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    // Reports with 'pending' status need admin approval
    const unsub = firestoreService.getReportsByStatus('pending', (data) => {
      setSubmissions(data);
      if (data.length > 0 && !activeReport) {
        setActiveReport(data[0]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [activeReport]);

  const handleAction = async (reportId: string, status: 'published' | 'rejected') => {
    try {
      setActionLoading(true);
      await firestoreService.updateReportStatus(reportId, status);
      if (activeReport?.id === reportId) {
        setActiveReport(null);
      }
    } catch (error) {
      console.error("Failed to update report status:", error);
    } finally {
      setActionLoading(false);
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
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
             <span className="font-bold text-slate-900 dark:text-white">Admin Portal</span>
             <span>/</span>
             <span className="font-medium text-primary">Report Card Approvals</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Approval Queue</h1>
          <p className="text-xs text-slate-500 mt-1">Review and approve report cards submitted for the current term.</p>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
          {/* List - Left Side */}
          <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
              <div className="grid grid-cols-12 gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold uppercase text-slate-500">
                  <div className="col-span-4">Student ID</div>
                  <div className="col-span-3">Term</div>
                  <div className="col-span-2">Grade</div>
                  <div className="col-span-1">Status</div>
                  <div className="col-span-2 text-right">Actions</div>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                  {submissions.length > 0 ? submissions.map((row, i) => (
                      <div 
                        key={row.id || i} 
                        onClick={() => setActiveReport(row)}
                        className={`grid grid-cols-12 gap-4 p-4 items-center cursor-pointer transition-colors ${activeReport?.id === row.id ? 'bg-blue-50/50 dark:bg-blue-900/10 border-l-4 border-l-primary' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30 border-l-4 border-l-transparent'}`}
                      >
                          <div className="col-span-4 text-sm font-bold text-slate-900 dark:text-white truncate">
                              {row.studentId}
                          </div>
                          <div className="col-span-3 text-sm text-slate-600 dark:text-slate-300">{row.term}</div>
                          <div className="col-span-2 text-xs font-black text-primary bg-primary/10 px-2 py-1 rounded w-fit">{row.grade}</div>
                          <div className="col-span-1">
                              <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{row.status}</span>
                          </div>
                          <div className="col-span-2 text-right">
                              <button className="text-xs font-bold text-primary hover:underline">Review Card</button>
                          </div>
                      </div>
                  )) : (
                    <div className="p-12 text-center text-slate-400">
                       <Icon name="check_circle" className="text-4xl mb-2 mx-auto" />
                       <p className="text-sm italic">Queue clear. No pending reports.</p>
                    </div>
                  )}
              </div>
          </div>

          {/* Review Panel - Right Side */}
          {activeReport ? (
            <div className="w-[480px] bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl flex flex-col shrink-0">
                <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/20">
                    <div className="flex items-center gap-4">
                        <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center shadow-sm">
                           <Icon name="person" className="text-primary" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Reviewing: {activeReport.studentId}</h3>
                            <p className="text-xs text-slate-500">{activeReport.term} Progress Report</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-center border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-bold uppercase text-slate-400">Final Grade</p>
                            <p className="text-2xl font-black text-slate-900 dark:text-white">{activeReport.grade}</p>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-center border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-bold uppercase text-slate-400">Total Score</p>
                            <p className="text-2xl font-black text-slate-900 dark:text-white">{activeReport.totalScore ? `${activeReport.totalScore} / 100` : '--'}</p>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Teacher's Comments</h4>
                        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-sm italic text-slate-600 dark:text-slate-300 leading-relaxed">
                            {activeReport.comments || 'No comments provided.'}
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 space-y-3">
                    <div className="flex gap-3">
                        <button 
                          disabled={actionLoading}
                          onClick={() => handleAction(activeReport.id, 'rejected')}
                          className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-red-500 font-bold rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Icon name="undo" className="text-sm" /> Reject
                        </button>
                        <button 
                          disabled={actionLoading}
                          onClick={() => handleAction(activeReport.id, 'published')}
                          className="flex-1 py-3 bg-primary text-white font-bold rounded-lg shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Icon name={actionLoading ? 'sync' : 'check_circle'} className={`text-sm ${actionLoading ? 'animate-spin' : ''}`} /> 
                            {actionLoading ? 'Publishing...' : 'Approve & Release'}
                        </button>
                    </div>
                </div>
            </div>
          ) : (
             <div className="w-[480px] flex items-center justify-center bg-slate-50 dark:bg-slate-900/30 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                <div className="text-center p-8">
                   <Icon name="fact_check" className="text-6xl text-slate-200 dark:text-slate-700 mb-4 mx-auto" />
                   <p className="text-slate-400 font-medium italic">Select a report from the queue to start reviewing.</p>
                </div>
             </div>
          )}
      </div>
    </div>
  );
};

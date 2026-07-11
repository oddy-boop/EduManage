import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { exportToCSV } from '../../lib/exportUtils';

export const AdminAuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');

  useEffect(() => {
    // Subscribing to audit logs in real-time
    const unsub = firestoreService.getAuditLogs((data) => {
      setLogs(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Type matching
      const matchesType = selectedType === 'all' || log.type === selectedType;
      
      // Search matching
      const query = searchTerm.toLowerCase();
      const matchesSearch = 
        (log.userName || '').toLowerCase().includes(query) ||
        (log.userEmail || '').toLowerCase().includes(query) ||
        (log.action || '').toLowerCase().includes(query) ||
        (log.details || '').toLowerCase().includes(query);

      return matchesType && matchesSearch;
    });
  }, [logs, searchTerm, selectedType]);

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    let date: Date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
    
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getTypeBadgeStyles = (type: string) => {
    switch (type) {
      case 'registration':
        return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800';
      case 'fee_update':
        return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800';
      case 'config_change':
        return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    }
  };

  const handleExport = () => {
    const formattedData = filteredLogs.map(log => ({
      Timestamp: formatTimestamp(log.timestamp),
      User: log.userName || 'Unknown',
      Email: log.userEmail || '',
      Action: log.action || '',
      Details: log.details || '',
      Category: log.type || 'other'
    }));
    exportToCSV(formattedData, `audit_logs_export_${new Date().toISOString().slice(0,10)}.csv`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Icon name="sync" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
             <span className="font-bold text-slate-900 dark:text-white">Admin Portal</span>
             <span>/</span>
             <span className="font-medium text-primary">System Monitoring</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Audit Logs</h1>
          <p className="text-sm text-slate-500 mt-1">
            Track user events, registrations, tuition fee configuration revisions, and general academic policy updates.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
           <button 
             onClick={handleExport}
             className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
           >
               <Icon name="download" /> Export logs
           </button>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          <div className="relative flex-1">
              <Icon name="search" className="absolute left-3 top-2.5 text-slate-400 text-sm" />
              <input 
                type="text" 
                placeholder="Search by action, details, user name or email..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 w-full focus:ring-primary focus:border-primary outline-none text-slate-900 dark:text-white" 
              />
          </div>
          <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase shrink-0">Category:</span>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-primary outline-none"
              >
                <option value="all">All Categories</option>
                <option value="registration">Registrations</option>
                <option value="fee_update">Fee Updates</option>
                <option value="config_change">Config Changes</option>
                <option value="other">Other</option>
              </select>
          </div>
      </div>

      {/* Logs Table Container */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100 dark:border-slate-800">
                      <tr>
                          <th className="px-6 py-4 w-48">Timestamp</th>
                          <th className="px-6 py-4 w-52">User Activity By</th>
                          <th className="px-6 py-4 w-44">Action / Event</th>
                          <th className="px-6 py-4">Detailed Description</th>
                          <th className="px-6 py-4 w-36">Category</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                      {filteredLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/10 transition-colors text-sm">
                              <td className="px-6 py-4 text-xs text-slate-500 font-medium whitespace-nowrap">
                                  {formatTimestamp(log.timestamp)}
                              </td>
                              <td className="px-6 py-4">
                                  <div className="flex flex-col">
                                      <span className="font-bold text-slate-900 dark:text-white leading-snug">{log.userName || 'System'}</span>
                                      <span className="text-xs text-slate-400 font-medium">{log.userEmail || 'system_triggered'}</span>
                                  </div>
                              </td>
                              <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">
                                  {log.action}
                              </td>
                              <td className="px-6 py-4 text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                                  {log.details}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`inline-block px-2.5 py-1 text-[10px] font-bold uppercase rounded-md border ${getTypeBadgeStyles(log.type)}`}>
                                      {log.type === 'config_change' ? 'Config' :
                                       log.type === 'fee_update' ? 'Fees' :
                                       log.type === 'registration' ? 'Registrations' : 'Other'}
                                  </span>
                              </td>
                          </tr>
                      ))}
                      {filteredLogs.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-16 text-center text-slate-400 dark:text-slate-500 italic">
                              No matching audit logs found. Try refining your filters or search terms.
                          </td>
                        </tr>
                      )}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  );
};

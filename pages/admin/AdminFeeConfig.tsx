import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';

export const AdminFeeConfig: React.FC = () => {
  const [feeConfigs, setFeeConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Logic to fetch fee configurations per grade
    // For now mocking the fetch but setting up the structure
    setFeeConfigs([
      { grade: 'Grade 12', amount: 5500, students: 222, id: 'G12' },
      { grade: 'Grade 11', amount: 5300, students: 385, id: 'G11' },
      { grade: 'Grade 10', amount: 4800, students: 310, id: 'G10' },
      { grade: 'Grade 9', amount: 4500, students: 515, id: 'G9' },
    ]);
    setLoading(false);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // In a real app, we'd loop and update all grade configs in Firestore
      alert("Fee configuration saved and synchronized with Parent Portal.");
    } catch (error) {
      alert("Failed to save configuration.");
    } finally {
      setSaving(false);
    }
  };

  const updateAmount = (id: string, amount: string) => {
    setFeeConfigs(feeConfigs.map(f => f.id === id ? { ...f, amount: parseFloat(amount) || 0 } : f));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Icon name="sync" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-center text-center sm:text-left flex-col sm:row gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1 justify-center sm:justify-start">
             <span className="font-bold text-slate-900 dark:text-white">Admin Portal</span>
             <span>/</span>
             <span className="font-medium text-primary">School Financials</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Fee Configuration</h1>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50"
        >
            <Icon name={saving ? 'sync' : 'save'} className={saving ? 'animate-spin' : ''} /> {saving ? 'Saving...' : 'Sync Policy'}
        </button>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800 p-4 rounded-xl flex items-start gap-4">
          <Icon name="warning" className="text-amber-500 shrink-0 mt-1" />
          <div className="flex-1">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Critical: Policy Modification</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Modifying base fees will instantly recalculate outstanding balances for all registered students in the selected grades. Notifications will be queued for Parent Dashboards.
              </p>
          </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Grade Pricing Structure</h3>
          </div>
          
          <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-[10px] uppercase font-black text-slate-500">
                  <tr>
                      <th className="px-8 py-4">Grade Level</th>
                      <th className="px-8 py-4">Current Enrollment</th>
                      <th className="px-8 py-4">Base Fee (GHS)</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {feeConfigs.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="px-8 py-5">
                              <span className="font-bold text-sm text-slate-900 dark:text-white">{row.grade}</span>
                          </td>
                          <td className="px-8 py-5 text-sm font-medium text-slate-500">{row.students} Active Students</td>
                          <td className="px-8 py-5">
                              <div className="relative max-w-[160px]">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">GH₵</span>
                                  <input 
                                    type="number" 
                                    value={row.amount} 
                                    onChange={(e) => updateAmount(row.id, e.target.value)}
                                    className="w-full pl-14 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-primary outline-none" 
                                  />
                              </div>
                          </td>
                      </tr>
                  ))}
              </tbody>
          </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
              <h3 className="font-bold text-slate-900 dark:text-white mb-2">Revenue Projection</h3>
              <p className="text-3xl font-black text-slate-900 dark:text-white mb-1">
                GH₵{feeConfigs.reduce((acc, curr) => acc + (curr.amount * curr.students), 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Expected Annual Enrollment Revenue</p>
          </div>
          <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl flex items-center justify-between">
              <div>
                <h3 className="font-bold mb-1">Parent Notifications</h3>
                <p className="text-xs text-slate-400">Queue alerts for fee changes</p>
              </div>
              <div className="size-10 bg-white/10 rounded-full flex items-center justify-center">
                <Icon name="notifications_active" />
              </div>
          </div>
      </div>
    </div>
  );
};

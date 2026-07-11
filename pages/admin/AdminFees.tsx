import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { exportToCSV } from '../../lib/exportUtils';
import { useAuth } from '../../lib/AuthContext';

export const AdminFees: React.FC = () => {
  const { user } = useAuth();
  const [fees, setFees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTerm, setFilterTerm] = useState('All');
  
  const [editingFee, setEditingFee] = useState<any | null>(null);
  const [newPaidAmount, setNewPaidAmount] = useState<number>(0);
  const [newStatus, setNewStatus] = useState<string>('pending');
  const [updating, setUpdating] = useState<boolean>(false);

  // New Fee Creation States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [feeType, setFeeType] = useState('Tuition Fee');
  const [selectedTerm, setSelectedTerm] = useState('Term 2');
  const [feeAmount, setFeeAmount] = useState(0);
  const [dueDate, setDueDate] = useState('');
  const [initialStatus, setInitialStatus] = useState('pending');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    // Subscribing to all fees for admin dashboard
    const unsub = firestoreService.getAllFees((data) => {
      setFees(data);
      setLoading(false);
    });

    // Subscribing to students list for dropdown lookup
    const unsubStudents = firestoreService.getStudents((data) => {
      setStudents(data);
    });

    return () => {
      unsub();
      unsubStudents();
    };
  }, []);

  const uniqueClasses = useMemo(() => {
    const list = students.map(s => s.classId || 'Unassigned');
    return Array.from(new Set(list)).filter(c => c !== 'Unassigned').sort();
  }, [students]);

  const filteredStudentsForSelector = useMemo(() => {
    if (!selectedClass) return [];
    return students
      .filter(s => s.classId === selectedClass)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, selectedClass]);

  const handleUpdateFee = async () => {
    if (!editingFee) return;
    setUpdating(true);
    try {
      await firestoreService.updateFee(editingFee.id, {
        amountPaid: newPaidAmount,
        status: newStatus
      });
      
      if (user) {
        await firestoreService.logActivity({
          userId: user.uid,
          userEmail: user.email || '',
          userName: user.name || '',
          action: 'Fee Record Update',
          details: `Updated fee record for student ${editingFee.studentName || 'Unknown'} (${editingFee.studentId || ''}). Paid Amount set to GH₵${newPaidAmount}, Status set to ${newStatus}`,
          type: 'fee_update'
        });
      }
      setEditingFee(null);
    } catch (err) {
      console.error("Failed to update fee:", err);
      alert("Failed to update fee: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUpdating(false);
    }
  };

  const handleCreateFee = async () => {
    if (!selectedStudentId || feeAmount <= 0 || !feeType.trim()) {
      alert("Please fill in all required fields.");
      return;
    }
    setCreating(true);
    try {
      const selectedStudent = students.find(s => s.id === selectedStudentId);
      await firestoreService.createFee({
        studentId: selectedStudentId,
        parentId: selectedStudent?.parentId || null,
        totalAmount: feeAmount,
        amountPaid: initialStatus === 'paid' ? feeAmount : 0,
        status: initialStatus,
        type: feeType,
        term: selectedTerm,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      });

      if (user) {
        await firestoreService.logActivity({
          userId: user.uid,
          userEmail: user.email || '',
          userName: user.name || '',
          action: 'Fee Record Creation',
          details: `Recorded new ${feeType} for student ${selectedStudent?.name || 'Unknown'} (${selectedStudentId}) for ${selectedTerm}. Amount: GH₵${feeAmount}, Status: ${initialStatus}`,
          type: 'fee_update'
        });
      }

      // Reset creation form
      setSelectedClass('');
      setSelectedStudentId('');
      setFeeType('Tuition Fee');
      setFeeAmount(0);
      setDueDate('');
      setSelectedTerm('Term 2');
      setInitialStatus('pending');
      setShowCreateModal(false);
    } catch (err) {
      console.error("Failed to create fee:", err);
      alert("Failed to record fee: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCreating(false);
    }
  };

  const filteredFees = useMemo(() => {
    return fees.filter(fee => {
      const matchesSearch = fee.studentName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            fee.studentId?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTerm = filterTerm === 'All' || fee.term === filterTerm;
      return matchesSearch && matchesTerm;
    });
  }, [fees, searchTerm, filterTerm]);

  const stats = useMemo(() => {
    const totalCollected = filteredFees.reduce((sum, f) => sum + (parseFloat(f.amountPaid) || 0), 0);
    const totalOutstanding = filteredFees.reduce((sum, f) => sum + ((parseFloat(f.totalAmount) || 0) - (parseFloat(f.amountPaid) || 0)), 0);
    const overdueStudents = filteredFees.filter(f => f.status === 'overdue').length;
    const overdueAmount = filteredFees.filter(f => f.status === 'overdue').reduce((sum, f) => sum + ((parseFloat(f.totalAmount) || 0) - (parseFloat(f.amountPaid) || 0)), 0);

    return {
      totalCollected,
      totalOutstanding,
      overdueStudents,
      overdueAmount
    };
  }, [filteredFees]);

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
             <span className="font-medium text-primary">Fees & Financial Reports</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">School Fees</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
           <div className="relative">
               <Icon name="search" className="absolute left-3 top-2.5 text-slate-400 text-sm" />
               <input 
                 type="text" 
                 placeholder="Search student or ID..." 
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
                 className="pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 w-full md:w-60 focus:ring-primary focus:border-primary outline-none" 
               />
           </div>

           {/* Term Filter */}
           <select 
             value={filterTerm}
             onChange={(e) => setFilterTerm(e.target.value)}
             className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:ring-primary focus:border-primary outline-none font-bold text-slate-700 dark:text-slate-200"
           >
             <option value="All">All Terms</option>
             <option value="Term 1">Term 1</option>
             <option value="Term 2">Term 2</option>
             <option value="Term 3">Term 3</option>
           </select>

           <button 
             onClick={() => setShowCreateModal(true)}
             className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-indigo-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:from-primary/95 hover:to-indigo-700 transition-all shrink-0"
           >
               <Icon name="add" /> Record Fee
           </button>
           <button 
             onClick={() => exportToCSV(filteredFees, 'fee_records_export.csv')}
             className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shrink-0"
           >
               <Icon name="download" /> Export
           </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
              <div className="size-12 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 flex items-center justify-center">
                  <Icon name="payments" />
              </div>
              <div>
                  <p className="text-xs font-bold uppercase text-slate-500">Collected</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">GH₵{stats.totalCollected.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
              </div>
          </div>
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
              <div className="size-12 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center">
                  <Icon name="pending" />
              </div>
              <div>
                  <p className="text-xs font-bold uppercase text-slate-500">Outstanding</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">GH₵{stats.totalOutstanding.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
              </div>
          </div>
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
              <div className="size-12 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 flex items-center justify-center">
                  <Icon name="warning" />
              </div>
              <div>
                  <p className="text-xs font-bold uppercase text-slate-500">Overdue Total</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">GH₵{stats.overdueAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                  <p className="text-[10px] text-red-500 font-bold">{stats.overdueStudents} students</p>
              </div>
          </div>
      </div>

      {/* Main Content Grid */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-[10px] uppercase font-bold text-slate-500">
                  <tr>
                      <th className="px-6 py-4">Student</th>
                      <th className="px-6 py-4">ID</th>
                      <th className="px-6 py-4">Term</th>
                      <th className="px-6 py-4">Total Amount</th>
                      <th className="px-6 py-4">Paid</th>
                      <th className="px-6 py-4">Balance</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredFees.map((row, i) => (
                      <tr key={row.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-6 py-4">
                              <span className="font-bold text-sm text-slate-900 dark:text-white">{row.studentName || 'Student'}</span>
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-500">{row.studentId}</td>
                          <td className="px-6 py-4 text-xs font-bold text-slate-600 dark:text-slate-400">{row.term || 'Term 2'}</td>
                          <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400">GH₵{(parseFloat(row.totalAmount) || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400">GH₵{(parseFloat(row.amountPaid) || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          <td className="px-6 py-4 text-xs font-bold text-slate-900 dark:text-white">GH₵{((parseFloat(row.totalAmount) || 0) - (parseFloat(row.amountPaid) || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          <td className="px-6 py-4">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                row.status === 'paid' ? 'bg-green-100 text-green-700' :
                                row.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {row.status}
                              </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => {
                                  setEditingFee(row);
                                  setNewPaidAmount(parseFloat(row.amountPaid) || 0);
                                  setNewStatus(row.status || 'pending');
                                }}
                                className="text-xs font-bold text-primary hover:underline font-display"
                              >
                                Update
                              </button>
                          </td>
                      </tr>
                  ))}
                  {filteredFees.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-400 italic">No fee records found.</td>
                    </tr>
                  )}
              </tbody>
          </table>
      </div>

      {/* Record New Fee Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">Record Student Fee</h3>
                <p className="text-xs text-slate-500 mt-0.5">Issue new invoice registry to accounts ledger.</p>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="size-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-650 transition-colors"
              >
                <Icon name="close" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto flex-grow">
              {/* Select Grade/Class */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Select Grade / Class</label>
                <select
                  value={selectedClass}
                  onChange={(e) => {
                    setSelectedClass(e.target.value);
                    setSelectedStudentId('');
                  }}
                  className="w-full mt-1 p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                >
                  <option value="">-- Choose Class --</option>
                  {uniqueClasses.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>

              {/* Select Student */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Select Student</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  disabled={!selectedClass}
                  className="w-full mt-1 p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none disabled:opacity-50"
                >
                  <option value="">-- Choose Student --</option>
                  {filteredStudentsForSelector.map(student => (
                    <option key={student.id} value={student.id}>{student.name} ({student.loginId})</option>
                  ))}
                </select>
              </div>

              {/* Select Academic Term */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Academic Term</label>
                <select
                  value={selectedTerm}
                  onChange={(e) => setSelectedTerm(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                >
                  <option value="Term 1">Term 1</option>
                  <option value="Term 2">Term 2</option>
                  <option value="Term 3">Term 3</option>
                </select>
              </div>

              {/* Fee Description */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Fee Description</label>
                <input 
                  type="text" 
                  value={feeType}
                  onChange={(e) => setFeeType(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none" 
                  placeholder="e.g. Tuition Fee"
                />
              </div>

              {/* Fee Amount */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Total Fee Amount (GHS)</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">GH₵</span>
                  <input 
                    type="number" 
                    value={feeAmount || ''}
                    onChange={(e) => setFeeAmount(parseFloat(e.target.value) || 0)}
                    className="w-full pl-14 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none" 
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Due Date</label>
                <input 
                  type="date" 
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none" 
                />
              </div>

              {/* Initial Status */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Payment Status</label>
                <select
                  value={initialStatus}
                  onChange={(e) => setInitialStatus(e.target.value)}
                  className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 shrink-0">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateFee}
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-indigo-600 text-white rounded-lg text-xs font-bold shadow-lg shadow-primary/20 hover:from-primary/95 hover:to-indigo-700 transition-all disabled:opacity-50"
              >
                <Icon name={creating ? 'sync' : 'save'} className={creating ? 'animate-spin' : ''} />
                {creating ? 'Recording...' : 'Record Fee'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingFee && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">Update Fee Status</h3>
                <p className="text-xs text-slate-550 mt-0.5">Student: {editingFee.studentName || 'Unknown'} ({editingFee.term || 'Term 2'})</p>
              </div>
              <button 
                onClick={() => setEditingFee(null)}
                className="size-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-655 transition-colors"
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-grow">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Total Fee Amount</label>
                <div className="text-xl font-black text-slate-900 dark:text-white">
                  GH₵{(parseFloat(editingFee.totalAmount) || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Amount Paid (GHS)</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">GH₵</span>
                  <input 
                    type="number" 
                    value={newPaidAmount}
                    onChange={(e) => setNewPaidAmount(parseFloat(e.target.value) || 0)}
                    className="w-full pl-14 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Payment Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            </div>
            <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 shrink-0">
              <button 
                onClick={() => setEditingFee(null)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-655 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpdateFee}
                disabled={updating}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                <Icon name={updating ? 'sync' : 'save'} className={updating ? 'animate-spin' : ''} />
                {updating ? 'Updating...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

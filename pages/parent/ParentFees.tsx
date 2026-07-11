import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';

interface GradeConfig {
  id: string;
  name: string;
  baseFee: number;
}

export const ParentFees: React.FC = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [activeStudentId, setActiveStudentId] = useState<string>('');
  const [fees, setFees] = useState<any[]>([]);
  const [grades, setGrades] = useState<GradeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTerm, setSelectedTerm] = useState<string>('Term 2');

  useEffect(() => {
    if (!user) return;
    
    // Subscribe to students that belong to this parent profile
    const unsubStudents = firestoreService.getStudentsForParent(user.uid, (data) => {
      setStudents(data);
      if (data.length > 0 && !activeStudentId) {
        setActiveStudentId(data[0].id);
      }
    });

    // Subscribe to grades configs to show base rates
    const unsubGrades = firestoreService.getGrades((data) => {
      setGrades(data as GradeConfig[]);
    });

    return () => {
      unsubStudents();
      unsubGrades();
    };
  }, [user]);

  useEffect(() => {
    if (!activeStudentId) return;

    // Subscribe to active fees for this student
    const unsubFees = firestoreService.getFeesForStudent(activeStudentId, (data) => {
      setFees(data);
      setLoading(false);
    });

    return () => {
      unsubFees();
    };
  }, [activeStudentId]);

  // Derived metrics
  const activeStudent = students.find(s => s.id === activeStudentId);
  
  const studentGradeConfig = useMemo(() => {
    if (!activeStudent || !activeStudent.classId) return null;
    return grades.find(g => g.name.toLowerCase() === activeStudent.classId.toLowerCase());
  }, [activeStudent, grades]);

  const studentFees = useMemo(() => {
    return fees.filter(f => f.studentId === activeStudentId);
  }, [fees, activeStudentId]);

  // Filter fees belonging to selected term
  const currentTermFees = useMemo(() => {
    return studentFees.filter(f => (f.term || 'Term 2') === selectedTerm);
  }, [studentFees, selectedTerm]);

  const stats = useMemo(() => {
    return {
      totalFees: currentTermFees.reduce((sum, f) => sum + (parseFloat(f.amount || f.totalAmount) || 0), 0),
      paidFees: currentTermFees.reduce((sum, f) => sum + (parseFloat(f.amountPaid) || 0), 0),
      outstanding: currentTermFees.reduce((sum, f) => sum + ((parseFloat(f.amount || f.totalAmount) || 0) - (parseFloat(f.amountPaid) || 0)), 0)
    };
  }, [currentTermFees]);

  // Calculate arrears (unpaid balances from OTHER terms)
  const arrears = useMemo(() => {
    const priorFees = studentFees.filter(f => (f.term || 'Term 2') !== selectedTerm);
    return priorFees.reduce((sum, f) => {
      const balance = (parseFloat(f.amount || f.totalAmount) || 0) - (parseFloat(f.amountPaid) || 0);
      return sum + (balance > 0 ? balance : 0);
    }, 0);
  }, [studentFees, selectedTerm]);

  const { totalFees, paidFees, outstanding } = stats;

  if (loading && students.length > 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Icon name="sync" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header and Selectors */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
             <span className="font-bold text-slate-900 dark:text-white">Parent Portal</span>
             <span>/</span>
             <span className="font-medium text-primary">Accounts & Fees</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Student Fees Statement</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Child Selector */}
          {students.length > 1 && (
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50 w-fit">
              {students.map(s => (
                <button 
                  key={s.id}
                  onClick={() => setActiveStudentId(s.id)}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeStudentId === s.id ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500'}`}
                >
                  {s.name.split(' ')[0]}
                </button>
              ))}
            </div>
          )}

          {/* Term Selector */}
          <select 
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:ring-primary focus:border-primary outline-none font-bold text-slate-700 dark:text-slate-200"
          >
            <option value="Term 1">Term 1</option>
            <option value="Term 2">Term 2</option>
            <option value="Term 3">Term 3</option>
          </select>
        </div>
      </div>

      {/* Arrears Notice Warning Banner */}
      {arrears > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-250 dark:border-amber-900/40 p-4 rounded-xl flex items-start gap-3.5 shadow-sm">
          <Icon name="warning" className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Arrears Notice: Outstanding Prior Balance</h4>
            <p className="text-xs text-slate-550 dark:text-slate-400 mt-1 leading-relaxed font-semibold">
              Your account has a carry-over balance of <span className="font-bold text-amber-600">GH₵{arrears.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span> from previous academic terms. Please settle all prior balances to prevent enrollment locks.
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Grade Policy Rate</p>
          <p className="text-3xl font-black text-slate-900 dark:text-white">
            {studentGradeConfig ? `GH₵${studentGradeConfig.baseFee.toLocaleString()}` : 'N/A'}
          </p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Annual Base Rate</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Total Set Fees</p>
          <p className="text-3xl font-black text-slate-900 dark:text-white">GH₵{totalFees.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Amount Paid</p>
          <p className="text-3xl font-black text-green-600">GH₵{paidFees.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-xl border border-blue-100 dark:border-blue-800 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2">Balance Due</p>
              <p className="text-3xl font-black text-primary">GH₵{outstanding.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
            </div>
            <Icon name="priority_high" className="text-primary bg-white dark:bg-slate-800 rounded-full p-1" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Breakdown & History */}
        <div className="lg:col-span-2 space-y-8">
          {/* Fee Breakdown */}
          <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Fee Breakdown</h3>
              <span className="text-xs font-medium text-slate-500">{selectedTerm} Invoices</span>
            </div>
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs uppercase text-slate-500 font-semibold">
                <tr>
                  <th className="px-6 py-4">Component</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                  <th className="px-6 py-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {currentTermFees.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-500 italic">No fee records found for this term.</td>
                  </tr>
                )}
                {currentTermFees.map((fee) => (
                  <tr key={fee.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-slate-900 dark:text-white text-sm uppercase">{fee.type}</p>
                      <p className="text-xs text-slate-550 mt-0.5">{fee.description || 'General educational services'}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-900 dark:text-white text-sm">GH₵{parseFloat(fee.amount || fee.totalAmount).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`inline-block px-2 py-1 rounded-md text-[10px] font-bold uppercase ${fee.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {fee.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-700">
                <tr>
                  <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">Total Term Fees</td>
                  <td className="px-6 py-4 text-right font-black text-slate-900 dark:text-white">GH₵{totalFees.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </section>

          {/* Transaction History */}
          <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Transaction History</h3>
              <a href="#" className="text-sm font-bold text-primary hover:underline">View All</a>
            </div>
            <div className="p-2">
              {currentTermFees.filter(f => f.status === 'paid').map((fee) => (
                <div key={fee.id} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 rounded-lg transition-colors cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="size-10 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 flex items-center justify-center">
                      <Icon name="credit_card" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-900 dark:text-white uppercase">TRX-{fee.id.slice(0, 8)}</p>
                      <p className="text-xs text-slate-500">Paid via Card • {fee.createdAt?.toDate ? fee.createdAt.toDate().toLocaleDateString() : 'Recently'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-slate-900 dark:text-white">GH₵{parseFloat(fee.amount || fee.totalAmount).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    <Icon name="download" className="text-slate-400 hover:text-primary" />
                  </div>
                </div>
              ))}
              {currentTermFees.filter(f => f.status === 'paid').length === 0 && (
                <div className="p-4 text-center text-xs text-slate-500 italic">No transaction history for this term.</div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Payment Widget */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-6">Payment Summary</h3>
            <div className="space-y-3 pb-6 border-b border-dashed border-slate-200 dark:border-slate-700">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium text-slate-900 dark:text-white">GH₵{outstanding.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Late Fee</span>
                <span className="font-medium text-green-600">GH₵0.00</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Taxes (VAT)</span>
                <span className="font-medium text-slate-900 dark:text-white">GH₵0.00</span>
              </div>
            </div>
            <div className="flex justify-between items-center py-4">
              <span className="font-bold text-slate-900 dark:text-white">Total Payable</span>
              <span className="text-2xl font-black text-primary">GH₵{outstanding.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
            
            <div className="space-y-4 mt-2">
              <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">Select Payment Method</p>
              <div className="grid grid-cols-3 gap-2">
                <button className="flex flex-col items-center justify-center p-3 border-2 border-primary bg-primary/5 rounded-lg text-primary">
                  <Icon name="credit_card" className="mb-1" />
                  <span className="text-[10px] font-bold">Card</span>
                </button>
                <button className="flex flex-col items-center justify-center p-3 border border-slate-200 dark:border-slate-700 hover:border-slate-300 rounded-lg text-slate-500">
                  <Icon name="account_balance" className="mb-1" />
                  <span className="text-[10px] font-bold">Bank</span>
                </button>
                <button className="flex flex-col items-center justify-center p-3 border border-slate-200 dark:border-slate-700 hover:border-slate-300 rounded-lg text-slate-500">
                  <Icon name="qr_code" className="mb-1" />
                  <span className="text-[10px] font-bold">UPI</span>
                </button>
              </div>
              <button 
                onClick={async () => {
                  if (currentTermFees.length > 0) {
                    const pendingFee = currentTermFees.find(f => f.status !== 'paid');
                    if (pendingFee) {
                      try {
                        await firestoreService.updateFee(pendingFee.id, {
                          status: 'paid',
                          amountPaid: parseFloat(pendingFee.amount || pendingFee.totalAmount),
                          paidAt: new Date().toISOString()
                        });
                        alert('Payment processed successfully!');
                      } catch (err) {
                        console.error(err);
                        alert('Payment failed. Please try again.');
                      }
                    } else {
                      alert('All fees for this term are already paid!');
                    }
                  }
                }}
                className="w-full py-3 bg-primary text-white font-bold rounded-lg shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
              >
                Proceed to Pay <Icon name="arrow_forward" />
              </button>
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400">
                <Icon name="lock" className="text-xs" />
                SECURE SSL ENCRYPTED PAYMENT
              </div>
            </div>
          </div>

          <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-xl">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-1">Need help?</h4>
            <p className="text-xs text-slate-550 leading-relaxed mb-3">If you find any discrepancy in the fee structure or have issues with the payment, please contact the finance office.</p>
            <a href="mailto:finance@edumanage.com" className="text-xs font-bold text-primary flex items-center gap-1">
              <Icon name="mail" className="text-sm" /> finance@edumanage.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';
import { exportToCSV } from '../../lib/exportUtils';
import { WorkSurface } from '../../components/Layouts';
import {
  Avatar, Badge, Button, Card, Chip, Drawer, EmptyState, feeBilled, feeOutstanding, feePaid, Field, ghs, InlineNote,
  Input, isArrears, isCarried, NoResults, PageHeader, ProgressBar, Select, SkeletonTable, Td, Th,
} from '../../components/ui';

const TERMS = ['Term 1', 'Term 2', 'Term 3'];
const STATUSES = ['pending', 'partial', 'paid'];

export const AdminFees: React.FC = () => {
  const { user } = useAuth();
  const [fees, setFees] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTerm, setFilterTerm] = useState('All');
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [arrearsOnly, setArrearsOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Record-payment drawer
  const [editingFee, setEditingFee] = useState<any | null>(null);
  const [newPaidAmount, setNewPaidAmount] = useState<number>(0);
  const [newStatus, setNewStatus] = useState<string>('pending');
  const [updating, setUpdating] = useState(false);

  // New-fee drawer
  const [showCreate, setShowCreate] = useState(false);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [feeType, setFeeType] = useState('Tuition Fee');
  const [selectedTerm, setSelectedTerm] = useState('Term 2');
  const [feeAmount, setFeeAmount] = useState(0);
  const [dueDate, setDueDate] = useState('');
  const [initialStatus, setInitialStatus] = useState('pending');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const unsub = firestoreService.getAllFees((data) => {
      setFees(data);
      setLoading(false);
    });
    const unsubStudents = firestoreService.getStudents(setStudents);
    return () => {
      unsub();
      unsubStudents();
    };
  }, []);

  const classes = useMemo(
    () => Array.from(new Set(students.map((s) => s.classId).filter(Boolean))).sort(),
    [students],
  );

  const classStudents = useMemo(() => {
    if (!selectedClass) return [];
    return students.filter((s) => s.classId === selectedClass).sort((a, b) => a.name.localeCompare(b.name));
  }, [students, selectedClass]);

  const openPayment = (fee: any) => {
    setEditingFee(fee);
    setNewPaidAmount(feePaid(fee));
    setNewStatus(fee.status || 'pending');
    setError(null);
  };

  const handleUpdateFee = async () => {
    if (!editingFee) return;
    setUpdating(true);
    setError(null);
    try {
      await firestoreService.updateFee(editingFee.id, { amountPaid: newPaidAmount, status: newStatus });
      if (user) {
        await firestoreService.logActivity({
          userId: user.uid,
          userEmail: user.email || '',
          userName: user.name || '',
          action: 'Fee Record Update',
          details: `Updated fee record for student ${editingFee.studentName || 'Unknown'} (${editingFee.studentId || ''}). Paid Amount set to GH₵${newPaidAmount}, Status set to ${newStatus}`,
          type: 'fee_update',
        });
      }
      setEditingFee(null);
    } catch (err) {
      console.error('Failed to update fee:', err);
      setError(`Could not update that record. ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleCreateFee = async () => {
    if (!selectedStudentId || feeAmount <= 0 || !feeType.trim()) {
      setError('Pick a student, a fee type and an amount above zero.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const selectedStudent = students.find((s) => s.id === selectedStudentId);
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
          type: 'fee_update',
        });
      }
      setSelectedClass('');
      setSelectedStudentId('');
      setFeeType('Tuition Fee');
      setFeeAmount(0);
      setDueDate('');
      setSelectedTerm('Term 2');
      setInitialStatus('pending');
      setShowCreate(false);
    } catch (err) {
      console.error('Failed to create fee:', err);
      setError(`Could not record that fee. ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreating(false);
    }
  };

  // Superseded rows are audit history — counting them would double the debt.
  const live = useMemo(() => fees.filter((f) => !isCarried(f)), [fees]);

  const totals = useMemo(
    () =>
      live.reduce(
        (acc, f) => {
          acc.billed += feeBilled(f);
          acc.paid += feePaid(f);
          if (isArrears(f)) acc.arrears += feeOutstanding(f);
          return acc;
        },
        { billed: 0, paid: 0, arrears: 0 },
      ),
    [live],
  );
  const outstanding = Math.max(0, totals.billed - totals.paid);
  const rate = totals.billed > 0 ? (totals.paid / totals.billed) * 100 : 0;

  const visible = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return live.filter((f) => {
      if (filterTerm !== 'All' && f.term !== filterTerm) return false;
      if (arrearsOnly && !isArrears(f)) return false;
      if (outstandingOnly && feeOutstanding(f) <= 0) return false;
      if (!q) return true;
      return (
        (f.studentName || '').toLowerCase().includes(q) ||
        (f.studentId || '').toLowerCase().includes(q) ||
        (f.type || '').toLowerCase().includes(q)
      );
    });
  }, [live, searchTerm, filterTerm, outstandingOnly, arrearsOnly]);

  if (loading) {
    return (
      <WorkSurface>
        <div className="h-14 w-56 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <SkeletonTable rows={6} />
      </WorkSurface>
    );
  }

  return (
    <WorkSurface>
      <PageHeader
        title="School Fees"
        subtitle={`${fees.length} fee record${fees.length === 1 ? '' : 's'} across all classes`}
        actions={
          <>
            <Button
              variant="secondary"
              icon="file_download"
              disabled={visible.length === 0}
              onClick={() =>
                exportToCSV(
                  visible.map((f) => ({
                    Student: f.studentName || f.studentId,
                    Term: f.term,
                    Type: f.type,
                    Billed: feeBilled(f),
                    Paid: feePaid(f),
                    Balance: feeBilled(f) - feePaid(f),
                    Status: f.status,
                  })),
                  `fees_${new Date().toISOString().slice(0, 10)}.csv`,
                )
              }
            >
              Export ledger
            </Button>
            <Button icon="add" onClick={() => { setShowCreate(true); setError(null); }}>
              Record fee
            </Button>
          </>
        }
      />

      {error && !editingFee && !showCreate && <InlineNote tone="blush" icon="priority_high">{error}</InlineNote>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-tile p-4">
          <p className="text-[11.5px] text-slate-500">Expected</p>
          <p className="mt-1.5 text-2xl font-bold tracking-[-0.03em] text-slate-900 dark:text-white">{ghs(totals.billed)}</p>
        </div>
        <div className="bg-tint-mint rounded-tile p-4">
          <p className="text-[11.5px] text-slate-600 dark:text-slate-400">Collected</p>
          <p className="mt-1.5 text-2xl font-bold tracking-[-0.03em] text-ink-mint">{ghs(totals.paid)}</p>
        </div>
        <div className="bg-tint-blush rounded-tile p-4">
          <p className="text-[11.5px] text-slate-600 dark:text-slate-400">Outstanding</p>
          <p className="mt-1.5 text-2xl font-bold tracking-[-0.03em] text-ink-blush">{ghs(outstanding)}</p>
        </div>
        <div className="bg-tint-butter rounded-tile p-4">
          <p className="text-[11.5px] text-slate-600 dark:text-slate-400">Of which arrears</p>
          <p className="mt-1.5 text-2xl font-bold tracking-[-0.03em] text-ink-butter">{ghs(totals.arrears)}</p>
          <p className="mt-1 text-[10.5px] text-slate-500">Carried from earlier terms</p>
        </div>
        <div className="bg-tint-blue rounded-tile p-4">
          <p className="text-[11.5px] text-slate-600 dark:text-slate-400">Collection rate</p>
          <p className="mt-1.5 text-2xl font-bold tracking-[-0.03em] text-ink-blue">{Math.round(rate)}%</p>
          <ProgressBar value={rate} className="mt-2" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={filterTerm === 'All'} onClick={() => setFilterTerm('All')}>
            All terms
          </Chip>
          {TERMS.map((t) => (
            <Chip key={t} active={filterTerm === t} onClick={() => setFilterTerm(t)}>
              {t}
            </Chip>
          ))}
          <span className="hidden md:block w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
          <Chip active={outstandingOnly} onClick={() => setOutstandingOnly((v) => !v)}>
            Outstanding only
          </Chip>
          <Chip active={arrearsOnly} onClick={() => setArrearsOnly((v) => !v)}>
            Arrears only
          </Chip>
        </div>
        <div className="relative">
          <Icon name="search" className="text-[15px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search student or fee type"
            aria-label="Search fee records"
            className="h-9 w-[260px] max-w-full pl-9"
          />
        </div>
      </div>

      {live.length === 0 ? (
        <EmptyState
          icon="payments"
          title="No fees recorded yet"
          body="Record a fee against a student and it appears here, and on that parent's portal."
          action={<Button icon="add" onClick={() => setShowCreate(true)}>Record fee</Button>}
        />
      ) : visible.length === 0 ? (
        <NoResults
          title={searchTerm ? `Nothing matches “${searchTerm}”` : 'Nothing in this filter'}
          body={`${live.length} fee records in total.`}
          onClear={() => {
            setSearchTerm('');
            setFilterTerm('All');
            setOutstandingOnly(false);
            setArrearsOnly(false);
          }}
        />
      ) : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[860px]">
              <thead className="bg-slate-50 dark:bg-slate-900/40">
                <tr>
                  <Th>Student</Th>
                  <Th>Type</Th>
                  <Th>Term</Th>
                  <Th className="text-right">Billed</Th>
                  <Th className="text-right">Paid</Th>
                  <Th className="text-right">Balance</Th>
                  <Th className="text-right">Status</Th>
                  <Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((f) => {
                  const billed = feeBilled(f);
                  const paid = feePaid(f);
                  const bal = Math.max(0, billed - paid);
                  const settled = bal === 0;
                  return (
                    <tr key={f.id} className={!settled && paid === 0 ? 'bg-tint-blush/40' : undefined}>
                      <Td>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar name={f.studentName || f.studentId || '?'} size={30} />
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-semibold text-slate-900 dark:text-white truncate">
                              {f.studentName || 'Unknown student'}
                            </p>
                            <p className="text-[10.5px] text-slate-400 truncate">{f.studentId}</p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span>{f.type || '—'}</span>
                          {isArrears(f) && <Badge tone="blush">Arrears</Badge>}
                        </div>
                      </Td>
                      <Td className="text-slate-500">{f.term || '—'}</Td>
                      <Td className="text-right">{ghs(billed)}</Td>
                      <Td className="text-right font-semibold text-slate-900 dark:text-white">{paid ? ghs(paid) : '—'}</Td>
                      <Td className={`text-right font-semibold ${settled ? 'text-slate-300' : 'text-ink-blush'}`}>
                        {settled ? '—' : ghs(bal)}
                      </Td>
                      <Td className="text-right">
                        <Badge tone={settled ? 'mint' : paid > 0 ? 'peach' : 'blush'}>
                          {settled ? 'Paid' : paid > 0 ? 'Partial' : f.status || 'Outstanding'}
                        </Badge>
                      </Td>
                      <Td className="text-right">
                        <button
                          type="button"
                          onClick={() => openPayment(f)}
                          aria-label={`Record a payment for ${f.studentName || f.studentId}`}
                          className="text-[11.5px] font-semibold text-primary hover:underline rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          Record payment
                        </button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
            <span className="text-[11.5px] text-slate-500">
              Showing <span className="font-semibold text-slate-900 dark:text-white">{visible.length}</span> of {live.length} records
            </span>
          </div>
        </Card>
      )}

      {/* Record payment */}
      <Drawer
        open={!!editingFee}
        onClose={() => setEditingFee(null)}
        title="Record payment"
        subtitle={editingFee ? `${editingFee.studentName || editingFee.studentId} · ${editingFee.term || ''}` : undefined}
        footer={
          <>
            <Button variant="secondary" block onClick={() => setEditingFee(null)}>
              Cancel
            </Button>
            <Button block loading={updating} onClick={handleUpdateFee}>
              Save record
            </Button>
          </>
        }
      >
        {editingFee && (
          <div className="flex flex-col gap-4">
            <div className="bg-tint-blush rounded-[14px] px-4 py-3.5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">Outstanding balance</p>
                <p className="mt-1 text-xl font-bold tracking-[-0.03em] text-ink-blush">
                  {ghs(Math.max(0, feeBilled(editingFee) - newPaidAmount))}
                </p>
              </div>
              <Badge tone="blush">{editingFee.type || 'Fee'}</Badge>
            </div>

            <Field label="Amount paid in total" hint={`Billed ${ghs(feeBilled(editingFee))}`}>
              <Input
                type="number"
                min={0}
                inputMode="decimal"
                value={newPaidAmount}
                onChange={(e) => setNewPaidAmount(Number(e.target.value) || 0)}
              />
            </Field>

            <div className="flex gap-2">
              <Chip onClick={() => setNewPaidAmount(feeBilled(editingFee) / 2)}>Half</Chip>
              <Chip onClick={() => { setNewPaidAmount(feeBilled(editingFee)); setNewStatus('paid'); }}>Full balance</Chip>
            </div>

            <Field label="Status">
              <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>

            {error && <InlineNote tone="blush" icon="priority_high">{error}</InlineNote>}

            <InlineNote icon="lock">
              Recording a payment writes an audit log entry against your name and updates what the parent sees immediately.
            </InlineNote>
          </div>
        )}
      </Drawer>

      {/* New fee */}
      <Drawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Record a fee"
        subtitle="Raises a new charge against one student"
        footer={
          <>
            <Button variant="secondary" block onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button block loading={creating} onClick={handleCreateFee}>
              Record fee
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Class">
            <Select
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setSelectedStudentId('');
              }}
            >
              <option value="">Choose a class…</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Student" hint={!selectedClass ? 'Pick a class first.' : undefined}>
            <Select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)} disabled={!selectedClass}>
              <option value="">Choose a student…</option>
              {classStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Fee type">
            <Input value={feeType} onChange={(e) => setFeeType(e.target.value)} placeholder="e.g. Tuition Fee" />
          </Field>

          <div className="flex gap-3">
            <Field label="Amount (GHS)" className="flex-1">
              <Input
                type="number"
                min={0}
                inputMode="decimal"
                value={feeAmount || ''}
                onChange={(e) => setFeeAmount(Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Term" className="flex-1">
              <Select value={selectedTerm} onChange={(e) => setSelectedTerm(e.target.value)}>
                {TERMS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex gap-3">
            <Field label="Due date" className="flex-1">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Initial status" className="flex-1">
              <Select value={initialStatus} onChange={(e) => setInitialStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {error && <InlineNote tone="blush" icon="priority_high">{error}</InlineNote>}

          <InlineNote icon="info">
            Marking it paid on creation records the full amount as already received. The parent sees this charge immediately.
          </InlineNote>
        </div>
      </Drawer>
    </WorkSurface>
  );
};

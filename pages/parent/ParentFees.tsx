import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';
import { exportToCSV } from '../../lib/exportUtils';
import { WorkSurface } from '../../components/Layouts';
import {
  Badge, Button, Card, ChildSwitcher, EmptyState, feeBilled, feeOutstanding, feePaid, ghs, InlineNote, isArrears,
  isCarried, PageHeader, ProgressBar, SkeletonTable, StatTile, Td, Th,
} from '../../components/ui';

export const ParentFees: React.FC = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [activeStudentId, setActiveStudentId] = useState<string>('');
  const [fees, setFees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubStudents = firestoreService.getStudentsForParent(user.uid, (data) => {
      setStudents(data);
      setActiveStudentId((prev) => prev || data[0]?.id || '');
      setLoading(false);
    });
    return () => unsubStudents();
  }, [user?.uid]);

  useEffect(() => {
    if (!activeStudentId) return;
    const unsubFees = firestoreService.getFeesForStudent(activeStudentId, setFees);
    return () => unsubFees();
  }, [activeStudentId]);

  const activeStudent = students.find((s) => s.id === activeStudentId);

  // Rows superseded by a carry-forward are hidden: the money they represent now
  // sits in the arrears row that replaced them, and showing both would read as
  // owing it twice.
  const live = useMemo(() => fees.filter((f) => !isCarried(f)), [fees]);

  const totals = useMemo(
    () =>
      live.reduce(
        (acc, f) => {
          acc.billed += feeBilled(f);
          acc.paid += feePaid(f);
          if (isArrears(f)) acc.arrears += feeOutstanding(f);
          else acc.thisTerm += feeOutstanding(f);
          return acc;
        },
        { billed: 0, paid: 0, arrears: 0, thisTerm: 0 },
      ),
    [live],
  );
  const balance = totals.arrears + totals.thisTerm;
  const pct = totals.billed > 0 ? (totals.paid / totals.billed) * 100 : 0;

  if (loading) {
    return (
      <WorkSurface>
        <div className="h-14 w-56 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <SkeletonTable rows={4} />
      </WorkSurface>
    );
  }

  if (students.length === 0) {
    return (
      <WorkSurface>
        <PageHeader title="School Fees" />
        <EmptyState
          icon="family_restroom"
          title="No children linked to your account"
          body="The school office links a parent account to each child. Contact them if one is missing."
        />
      </WorkSurface>
    );
  }

  return (
    <WorkSurface>
      <PageHeader
        title="School Fees"
        subtitle={activeStudent ? `${activeStudent.name} · ${activeStudent.classId || activeStudent.grade || ''}` : undefined}
        actions={
          <>
            <Button
              variant="secondary"
              icon="file_download"
              disabled={live.length === 0}
              onClick={() =>
                exportToCSV(
                  live.map((f) => ({
                    Item: f.type || f.description || 'Fee',
                    Billed: feeBilled(f),
                    Paid: feePaid(f),
                    Status: f.status,
                  })),
                  `fees_${activeStudent?.name || 'student'}.csv`,
                )
              }
            >
              Export
            </Button>
            {balance > 0 && <Button icon="payments">Pay {ghs(balance)}</Button>}
          </>
        }
      />

      <ChildSwitcher children={students} activeId={activeStudentId} onSelect={setActiveStudentId} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile tint="plain" icon="description" label="Total billed" value={ghs(totals.billed)} />
        <StatTile tint="mint" icon="check_circle" label="Paid to date" value={ghs(totals.paid)} />
        <StatTile
          tint={totals.thisTerm > 0 ? 'peach' : 'mint'}
          icon="payments"
          label="Owing this term"
          value={ghs(totals.thisTerm)}
        />
        <StatTile
          tint={totals.arrears > 0 ? 'blush' : 'plain'}
          icon="history"
          label="Brought forward"
          value={ghs(totals.arrears)}
        />
      </div>

      {totals.arrears > 0 && (
        <InlineNote tone="blush" icon="history">
          <span className="font-semibold">{ghs(totals.arrears)} is unpaid from an earlier term</span> and has been carried
          into this one. It is included in the balance below, not charged twice.
        </InlineNote>
      )}

      {live.length === 0 ? (
        <EmptyState
          icon="payments"
          title="No fees billed yet"
          body={`Once the school office raises an invoice for ${activeStudent?.name || 'your child'}, it will appear here with what has been paid.`}
        />
      ) : (
        <Card pad={false}>
          <div className="p-5 pb-4">
            <div className="flex items-center justify-between gap-4 mb-3">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">What the fee covers</p>
              <span className="text-[11.5px] text-slate-500">
                {Math.round(pct)}% settled{balance > 0 ? ` · ${ghs(balance)} outstanding` : ''}
              </span>
            </div>
            <ProgressBar value={pct} tone={balance > 0 ? 'warning' : 'success'} className="h-2.5" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-900/40">
                <tr>
                  <Th>Item</Th>
                  <Th className="text-right">Billed</Th>
                  <Th className="text-right">Paid</Th>
                  <Th className="text-right">Balance</Th>
                  <Th className="text-right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {live.map((f) => {
                  const billed = feeBilled(f);
                  const paid = feePaid(f);
                  const owing = Math.max(0, billed - paid);
                  const settled = owing === 0;
                  return (
                    <tr key={f.id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <p className="text-[12.5px] font-medium text-slate-900 dark:text-white">{f.type || 'Fee'}</p>
                          {isArrears(f) && <Badge tone="blush">Arrears</Badge>}
                        </div>
                        {f.description && <p className="mt-0.5 text-[10.5px] text-slate-400">{f.description}</p>}
                      </Td>
                      <Td className="text-right">{ghs(billed)}</Td>
                      <Td className="text-right font-semibold text-slate-900 dark:text-white">{paid ? ghs(paid) : '—'}</Td>
                      <Td className={`text-right font-semibold ${settled ? 'text-slate-300' : 'text-ink-peach'}`}>
                        {settled ? '—' : ghs(owing)}
                      </Td>
                      <Td className="text-right">
                        <Badge tone={settled ? 'mint' : paid > 0 ? 'peach' : 'blush'}>
                          {settled ? 'Paid' : paid > 0 ? 'Partial' : f.status || 'Outstanding'}
                        </Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 dark:bg-slate-900/40">
                  <Td className="font-semibold text-slate-900 dark:text-white">Total</Td>
                  <Td className="text-right font-bold text-slate-900 dark:text-white">{ghs(totals.billed)}</Td>
                  <Td className="text-right font-bold text-ink-mint">{ghs(totals.paid)}</Td>
                  <Td className="text-right font-bold text-ink-peach">{balance ? ghs(balance) : '—'}</Td>
                  <Td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      <InlineNote icon="info">
        Receipts are issued by the school office. If a payment you have made is missing here, contact them with your
        transaction reference rather than paying again.
      </InlineNote>
    </WorkSurface>
  );
};

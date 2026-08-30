import React, { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/AuthContext';
import { firestoreService } from '../../lib/services';
import { View } from '../../types';
import { WorkSurface } from '../../components/Layouts';
import { Badge, Button, Card, ChildSwitcher, EmptyState, InlineNote, PageHeader, SkeletonTable } from '../../components/ui';

interface ParentReportsProps {
  onNavigate: (view: View, report?: any, child?: any) => void;
}

const STEPS = [
  'Subject teachers enter exam marks and remarks.',
  'The class teacher reviews the whole class and submits.',
  'The head teacher approves and releases the batch.',
  'You see it here, the same day.',
];

export const ParentReports: React.FC<ParentReportsProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [children, setChildren] = useState<any[]>([]);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (reportId: string) => {
    setError(null);
    setDownloading(reportId);
    try {
      await firestoreService.downloadReportPdf(reportId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download that report.');
    } finally {
      setDownloading(null);
    }
  };

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = firestoreService.getStudentsForParent(user.uid, (data) => {
      setChildren(data);
      setActiveChildId((prev) => prev ?? data[0]?.id ?? null);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  const activeChild = children.find((c) => c.id === activeChildId) ?? null;

  useEffect(() => {
    if (!activeChild?.id || !user?.uid) return;
    const unsub = firestoreService.getStudentReports(activeChild.id, user.uid, setReports);
    return () => unsub();
  }, [activeChild?.id, user?.uid]);

  const released = reports.filter((r) => r.status === 'published');

  if (loading) {
    return (
      <WorkSurface>
        <div className="h-14 w-48 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <SkeletonTable rows={3} />
      </WorkSurface>
    );
  }

  if (children.length === 0) {
    return (
      <WorkSurface>
        <PageHeader title="Reports" />
        <EmptyState icon="family_restroom" title="No children linked to your account" body="Contact the school office if one is missing." />
      </WorkSurface>
    );
  }

  return (
    <WorkSurface>
      <PageHeader title="Reports" subtitle="Report cards appear here once the head teacher has approved them" />

      <ChildSwitcher children={children} activeId={activeChildId} onSelect={setActiveChildId} />

      {error && <InlineNote tone="blush" icon="priority_high">{error}</InlineNote>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-2.5">
          {released.length === 0 ? (
            <EmptyState
              icon="description"
              title="No report cards released yet"
              body={`Once ${activeChild?.name || 'your child'}'s teachers finish entering marks and the head teacher approves them, the card appears here.`}
            />
          ) : (
            released.map((report) => (
              <Card key={report.id} className="flex flex-col sm:flex-row sm:items-center gap-4 p-5">
                <div className="w-[54px] h-[66px] rounded-[9px] bg-tint-blue border border-[#c7d7fb] dark:border-slate-700 flex flex-col gap-[3px] p-[7px_6px] shrink-0">
                  <span className="h-1 rounded-sm bg-primary w-[70%]" />
                  <span className="h-[3px] rounded-sm bg-[#c7d7fb]" />
                  <span className="h-[3px] rounded-sm bg-[#c7d7fb]" />
                  <span className="h-[3px] rounded-sm bg-[#c7d7fb] w-[80%]" />
                  <span className="h-[3px] rounded-sm bg-[#c7d7fb]" />
                  <span className="h-[3px] rounded-sm bg-[#c7d7fb] w-[60%]" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
                      {report.term}
                      {report.session ? ` · ${report.session}` : ''}
                    </p>
                    <Badge tone="mint">Released</Badge>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-2.5">
                    {report.totalScore != null && (
                      <span className="text-[11.5px] text-slate-500">
                        Average <span className="font-bold text-slate-900 dark:text-white">{Math.round(report.totalScore)}%</span>
                      </span>
                    )}
                    <span className="text-[11.5px] text-slate-500">
                      Class <span className="font-bold text-slate-900 dark:text-white">{activeChild?.classId || '—'}</span>
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="secondary"
                    icon="file_download"
                    loading={downloading === report.id}
                    onClick={() => download(report.id)}
                  >
                    PDF
                  </Button>
                  <Button onClick={() => onNavigate(View.PARENT_REPORT_DETAIL, report, activeChild)}>Open report</Button>
                </div>
              </Card>
            ))
          )}

          {reports.length > released.length && (
            <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-panel p-5 flex items-center gap-4">
              <span className="size-10 rounded-[13px] bg-slate-50 dark:bg-slate-900/40 text-slate-400 flex items-center justify-center shrink-0">
                <Icon name="schedule" className="text-[20px]" />
              </span>
              <div>
                <p className="text-[13.5px] font-semibold text-slate-500">
                  {reports.length - released.length} report{reports.length - released.length === 1 ? '' : 's'} not yet released
                </p>
                <p className="mt-1 text-[11.5px] text-slate-400 leading-relaxed">
                  Marks are in, but the head teacher has not approved the batch. Nothing for you to do.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-tint-blue rounded-panel p-5 flex flex-col gap-3 h-fit">
          <p className="text-[13.5px] font-semibold text-ink-blue">How report cards work</p>
          <div className="flex flex-col gap-3 mt-1">
            {STEPS.map((s, i) => (
              <div key={i} className="flex gap-2.5">
                <span
                  className={`size-[22px] rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
                    i === STEPS.length - 1 ? 'bg-primary text-white' : 'bg-white dark:bg-slate-900/50 text-ink-blue'
                  }`}
                >
                  {i + 1}
                </span>
                <p className="text-[11.5px] leading-relaxed text-ink-blue">{s}</p>
              </div>
            ))}
          </div>
          <InlineNote tone="blue" icon="info">
            A released card is fixed. If something looks wrong, contact the class teacher rather than waiting for it to change.
          </InlineNote>
        </div>
      </div>
    </WorkSurface>
  );
};

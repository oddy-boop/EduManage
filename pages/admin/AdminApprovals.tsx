import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { WorkSurface } from '../../components/Layouts';
import {
  Avatar, Badge, Button, Card, Drawer, EmptyState, InlineNote, PageHeader, SkeletonTable, StatTile, Td, Th,
} from '../../components/ui';
import { firestoreService as svc } from '../../lib/services';
import { PASS_MARK, SUBJECT_MAX, gradeFor, useGradingScale } from '../../lib/grading';

interface Batch {
  key: string;
  classId: string;
  term: string;
  reports: any[];
  average: number;
  belowPass: number;
}

export const AdminApprovals: React.FC = () => {
  useGradingScale(); // re-render if an admin changes the scale while this is open
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);
  // Subject marks a teacher has submitted and can no longer edit. The app told
  // teachers to "ask an Admin to reopen it" long before an admin could actually do so.
  const [locked, setLocked] = useState<any[]>([]);
  const [reopening, setReopening] = useState<string | null>(null);

  /**
   * report.grades arrives in two shapes depending on which workflow wrote it:
   *   { Mathematics: { ca, exam, score, remarks } }   — finalized by a class teacher
   *   { Mathematics: { grade, score, remarks } }      — older rows, no CA/exam split
   * Render whichever is present rather than assuming.
   */
  const subjectRows = (r: any) =>
    Object.entries(r?.grades || {}).map(([subject, v]: [string, any]) => {
      const ca = v?.ca != null ? Number(v.ca) : null;
      const exam = v?.exam != null ? Number(v.exam) : null;
      const total = v?.score != null ? Number(v.score) : ca != null && exam != null ? ca + exam : null;
      return { subject, ca, exam, total, remarks: v?.remarks || '' };
    });

  const downloadPreview = async (reportId: string) => {
    setDownloading(true);
    setStatus(null);
    try {
      await svc.downloadReportPdf(reportId);
    } catch (err) {
      setStatus({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not download that report.' });
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    const unsub = firestoreService.getReportsByStatus('pending', (data) => {
      setSubmissions(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  /**
   * A class teacher finalises a whole CLASS at once, so that is the unit an admin
   * approves. The queue used to be a flat list of individual students, which meant
   * releasing one class took as many clicks as it had pupils.
   */
  const batches = useMemo<Batch[]>(() => {
    const map = new Map<string, any[]>();
    submissions.forEach((r) => {
      const key = `${r.classId || 'Unassigned'}|${r.term || 'Unknown term'}`;
      (map.get(key) ?? map.set(key, []).get(key)!).push(r);
    });
    return [...map.entries()]
      .map(([key, reports]) => {
        const [classId, term] = key.split('|');
        const scored = reports.filter((r) => r.totalScore != null);
        return {
          key,
          classId,
          term,
          reports: [...reports].sort((a, b) => (a.studentName || '').localeCompare(b.studentName || '')),
          average: scored.length ? Math.round((scored.reduce((a, r) => a + Number(r.totalScore), 0) / scored.length) * 10) / 10 : 0,
          belowPass: reports.filter((r) => r.totalScore != null && Number(r.totalScore) < PASS_MARK).length,
        };
      })
      .sort((a, b) => a.classId.localeCompare(b.classId) || a.term.localeCompare(b.term));
  }, [submissions]);

  useEffect(() => {
    setActiveKey((prev) => (prev && batches.some((b) => b.key === prev) ? prev : batches[0]?.key ?? null));
  }, [batches]);

  const active = batches.find((b) => b.key === activeKey) ?? null;

  const act = async (reports: any[], next: 'published' | 'rejected', label: string) => {
    const verb = next === 'published' ? 'Approve and release' : 'Return to the class teacher';
    if (!window.confirm(`${verb} ${label}? ${next === 'published' ? 'Parents will see it immediately.' : ''}`)) return;
    setActing(true);
    setStatus(null);
    try {
      const results = await Promise.allSettled(reports.map((r) => firestoreService.updateReportStatus(r.id, next)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        setStatus({ tone: 'bad', text: `${reports.length - failed} of ${reports.length} went through. ${failed} failed — try again.` });
      } else {
        setStatus({
          tone: 'ok',
          text: next === 'published'
            ? `Released ${reports.length} report${reports.length === 1 ? '' : 's'}. Parents can see them now.`
            : `Returned ${reports.length} report${reports.length === 1 ? '' : 's'} to the class teacher.`,
        });
      }
    } catch (error) {
      console.error('Failed to update report status:', error);
      setStatus({ tone: 'bad', text: 'That did not go through. Nothing was changed — try again.' });
    } finally {
      setActing(false);
    }
  };

  const loadLocked = () => {
    firestoreService
      .getLockedSubjectReports()
      .then(setLocked)
      .catch(() => setLocked([]));
  };

  useEffect(loadLocked, []);

  const handleReopen = async (row: any) => {
    if (
      !window.confirm(
        `Reopen ${row.subject} for ${row.classId} (${row.term})?\n\n${row.entryCount} entr${row.entryCount === 1 ? 'y' : 'ies'} become editable by the teacher again. If this class has already been finalised, the class teacher must finalise it again for the change to reach the report cards.`,
      )
    )
      return;
    setReopening(`${row.classId}||${row.subject}`);
    setStatus(null);
    try {
      const res = await firestoreService.reopenSubjectReports(row.classId, row.subject, row.term);
      setStatus({ tone: 'ok', text: `${res.reopenedCount} entr${res.reopenedCount === 1 ? 'y' : 'ies'} reopened for ${row.subject}.` });
      loadLocked();
    } catch (error) {
      setStatus({ tone: 'bad', text: error instanceof Error ? error.message : 'Could not reopen those marks.' });
    } finally {
      setReopening(null);
    }
  };

  if (loading) {
    return (
      <WorkSurface>
        <div className="h-14 w-64 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <SkeletonTable rows={4} />
      </WorkSurface>
    );
  }

  return (
    <WorkSurface>
      <PageHeader
        title="Report Approvals"
        subtitle={
          batches.length
            ? `${submissions.length} report${submissions.length === 1 ? '' : 's'} across ${batches.length} class ${batches.length === 1 ? 'batch' : 'batches'}`
            : undefined
        }
        actions={
          status && (
            <span className={`text-[11.5px] flex items-center gap-1.5 ${status.tone === 'ok' ? 'text-ink-mint' : 'text-ink-blush'}`}>
              <Icon name={status.tone === 'ok' ? 'check_circle' : 'priority_high'} className="text-[14px]" />
              {status.text}
            </span>
          )
        }
      />

      {locked.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Locked subject marks</p>
            <p className="mt-1 text-[11.5px] text-slate-500 leading-relaxed">
              Submitting seals a subject so a teacher cannot quietly revise a mark. Reopening is how a genuine mistake gets
              corrected — it is recorded in the audit log.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[560px]">
              <thead className="bg-slate-50 dark:bg-slate-900/40">
                <tr>
                  <Th>Class</Th>
                  <Th>Subject</Th>
                  <Th>Term</Th>
                  <Th>Submitted by</Th>
                  <Th className="text-right w-24">Entries</Th>
                  <Th className="text-right w-32">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {locked.map((row) => {
                  const key = `${row.classId}||${row.subject}`;
                  return (
                    <tr key={`${key}||${row.term}`}>
                      <Td className="font-semibold text-slate-900 dark:text-white">{row.classId}</Td>
                      <Td>{row.subject}</Td>
                      <Td className="text-slate-500">{row.term}</Td>
                      <Td className="text-slate-500">{row.teacherName || '—'}</Td>
                      <Td className="text-right">{row.entryCount}</Td>
                      <Td className="text-right">
                        <Button
                          variant="secondary"
                          className="h-8 px-3 text-[11.5px]"
                          icon="undo"
                          loading={reopening === key}
                          onClick={() => handleReopen(row)}
                        >
                          Reopen
                        </Button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {batches.length === 0 ? (
        <EmptyState
          icon="fact_check"
          title="Nothing waiting on you"
          body="When class teachers finalise a class, its report cards queue here as one batch. Released cards reach parents the same day."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Class folders */}
          <div className="flex flex-col gap-2.5">
            {batches.map((b) => {
              const on = b.key === activeKey;
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setActiveKey(b.key)}
                  aria-current={on ? 'true' : undefined}
                  className={`text-left rounded-tile p-4 flex items-center gap-3.5 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    on
                      ? 'bg-surface-light dark:bg-surface-dark border-2 border-primary shadow-card'
                      : 'bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-primary text-white' : 'bg-tint-peach text-ink-peach'}`}>
                    <Icon name="folder_open" className="text-[20px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">{b.classId}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {b.term} · {b.reports.length} report{b.reports.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  {b.belowPass > 0 && <Badge tone="blush">{b.belowPass}</Badge>}
                </button>
              );
            })}
          </div>

          {/* Batch detail */}
          {active && (
            <Card pad={false} className="flex flex-col overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
                <p className="text-[17px] font-bold tracking-[-0.025em] text-slate-900 dark:text-white">
                  {active.classId} — {active.term}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Finalised by the class teacher and waiting for release. Open a student to see every subject before you
                  approve.
                </p>
              </div>

              <div className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatTile tint="blue" icon="groups" label="Report cards" value={active.reports.length} />
                <StatTile tint="mint" icon="analytics" label="Class average" value={active.average || '—'} />
                <StatTile tint={active.belowPass ? 'blush' : 'plain'} icon="priority_high" label={`Below ${PASS_MARK}`} value={active.belowPass} />
              </div>

              {active.belowPass > 0 && (
                <div className="px-6 pb-4">
                  <InlineNote tone="blush" icon="warning">
                    {active.belowPass} student{active.belowPass === 1 ? '' : 's'} finished below the pass mark. Worth a look
                    before these reach parents.
                  </InlineNote>
                </div>
              )}

              <div className="px-6 pb-2 overflow-x-auto">
                <table className="w-full border-collapse min-w-[560px]">
                  <thead>
                    <tr>
                      <Th className="px-0">Student</Th>
                      <Th className="text-right">Total</Th>
                      <Th className="text-center">Grade</Th>
                      <Th>Class teacher&rsquo;s remark</Th>
                      <Th className="text-right px-0">Action</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.reports.map((r) => {
                      const band = r.totalScore != null ? gradeFor(Number(r.totalScore)) : null;
                      const low = r.totalScore != null && Number(r.totalScore) < PASS_MARK;
                      return (
                        <tr key={r.id} className={low ? 'bg-tint-blush' : undefined}>
                          <Td className="px-0">
                            <button
                              type="button"
                              onClick={() => setDetail(r)}
                              className="flex items-center gap-2.5 min-w-0 text-left rounded group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            >
                              <Avatar name={r.studentName || r.studentId} size={30} />
                              <span className="text-[12.5px] font-medium text-slate-900 dark:text-white truncate group-hover:text-primary">
                                {r.studentName || r.studentId}
                              </span>
                              <Icon name="chevron_right" className="text-[15px] text-slate-300 shrink-0" />
                            </button>
                          </Td>
                          <Td className="text-right font-semibold text-slate-900 dark:text-white">
                            {r.totalScore != null ? `${r.totalScore} / ${SUBJECT_MAX}` : '—'}
                          </Td>
                          <Td className="text-center">
                            {band ? <Badge tone={band.tone}>{band.label}</Badge> : <span className="text-slate-300">—</span>}
                          </Td>
                          <Td className="text-slate-500 max-w-[260px] truncate">{r.comments || '—'}</Td>
                          <Td className="text-right px-0">
                            <button
                              type="button"
                              disabled={acting}
                              onClick={() => act([r], 'rejected', `${r.studentName || 'this report'}`)}
                              className="text-[11.5px] font-semibold text-ink-blush hover:underline rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
                            >
                              Return
                            </button>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-auto px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex flex-wrap items-center justify-between gap-4">
                <p className="text-[11.5px] text-slate-500 max-w-[380px] leading-relaxed">
                  Approving releases all {active.reports.length} card{active.reports.length === 1 ? '' : 's'} in{' '}
                  {active.classId} to parents immediately.
                </p>
                <div className="flex items-center gap-2.5">
                  <Button
                    variant="secondary"
                    icon="undo"
                    disabled={acting}
                    onClick={() => act(active.reports, 'rejected', `all ${active.reports.length} reports in ${active.classId}`)}
                    className="text-ink-blush border-[#f7ccd6]"
                  >
                    Return whole class
                  </Button>
                  <Button
                    variant="success"
                    icon="check"
                    loading={acting}
                    onClick={() => act(active.reports, 'published', `all ${active.reports.length} reports in ${active.classId}`)}
                  >
                    Approve &amp; release {active.reports.length}
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.studentName || detail?.studentId || ''}
        subtitle={detail ? `${detail.classId || ''} · ${detail.term || ''}` : undefined}
        width={520}
        footer={
          detail && (
            <>
              <Button variant="secondary" icon="file_download" block loading={downloading} onClick={() => downloadPreview(detail.id)}>
                Download PDF
              </Button>
              <Button
                variant="success"
                icon="check"
                block
                disabled={acting}
                onClick={() => {
                  const r = detail;
                  setDetail(null);
                  act([r], 'published', r.studentName || 'this report');
                }}
              >
                Approve this one
              </Button>
            </>
          )
        }
      >
        {detail && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-tint-blue rounded-[14px] px-3.5 py-3">
                <p className="text-[10.5px] text-slate-600 dark:text-slate-400">Average</p>
                <p className="mt-1 text-lg font-bold text-ink-blue">
                  {detail.totalScore != null ? `${detail.totalScore}` : '—'}
                </p>
              </div>
              <div className="bg-tint-mint rounded-[14px] px-3.5 py-3">
                <p className="text-[10.5px] text-slate-600 dark:text-slate-400">Grade</p>
                <p className="mt-1 text-lg font-bold text-ink-mint">
                  {detail.totalScore != null ? (gradeFor(Number(detail.totalScore))?.label ?? detail.grade ?? '—') : '—'}
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/40 rounded-[14px] px-3.5 py-3">
                <p className="text-[10.5px] text-slate-600 dark:text-slate-400">Subjects</p>
                <p className="mt-1 text-lg font-bold text-slate-700 dark:text-slate-300">{subjectRows(detail).length}</p>
              </div>
            </div>

            {subjectRows(detail).length === 0 ? (
              <InlineNote tone="butter" icon="warning">
                This report has no subject scores recorded. Worth returning it rather than releasing an empty card.
              </InlineNote>
            ) : (
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white mb-2">Subject by subject</p>
                <div className="rounded-[14px] overflow-hidden border border-slate-100 dark:border-slate-800">
                  <div className="grid grid-cols-[minmax(0,1fr)_46px_46px_50px_54px] gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-900/40 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                    <span>Subject</span>
                    <span className="text-right">CA</span>
                    <span className="text-right">Exam</span>
                    <span className="text-right">Total</span>
                    <span className="text-center">Grade</span>
                  </div>
                  {subjectRows(detail).map((row) => {
                    const band = row.total != null ? gradeFor(row.total) : null;
                    return (
                      <div
                        key={row.subject}
                        className="grid grid-cols-[minmax(0,1fr)_46px_46px_50px_54px] gap-2 px-3 py-2.5 items-center border-t border-slate-100 dark:border-slate-800"
                      >
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-slate-900 dark:text-white truncate">{row.subject}</p>
                          {row.remarks && <p className="text-[10.5px] text-slate-400 truncate">{row.remarks}</p>}
                        </div>
                        <span className="text-[11.5px] text-slate-600 dark:text-slate-400 text-right">{row.ca ?? '—'}</span>
                        <span className="text-[11.5px] text-slate-600 dark:text-slate-400 text-right">{row.exam ?? '—'}</span>
                        <span className="text-[12px] font-semibold text-slate-900 dark:text-white text-right">{row.total ?? '—'}</span>
                        <span className="text-center">
                          {band ? <Badge tone={band.tone}>{band.label}</Badge> : <span className="text-slate-300 text-[11px]">—</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-white mb-1.5">Class teacher&rsquo;s remark</p>
              <p className="text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-400">
                {detail.comments || 'No remark was recorded.'}
              </p>
            </div>
          </div>
        )}
      </Drawer>
    </WorkSurface>
  );
};

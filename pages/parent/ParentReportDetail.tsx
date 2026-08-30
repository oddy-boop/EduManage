import React from 'react';
import { Icon } from '../../components/Icon';
import { View } from '../../types';
import { WorkSurface } from '../../components/Layouts';
import { Badge, Button, Card, EmptyState, InlineNote, PageHeader } from '../../components/ui';
import { firestoreService } from '../../lib/services';
import { CA_MAX, EXAM_MAX, GRADE_BANDS, SUBJECT_MAX, gradeFor } from '../../lib/grading';

interface ParentReportDetailProps {
  onNavigate: (view: View) => void;
  report?: any;
  child?: any;
}

const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  #printable-report, #printable-report * { visibility: visible; }
  #printable-report {
    position: absolute; left: 0; top: 0; width: 100%;
    padding: 0 !important; box-shadow: none !important; border: none !important;
    background: white !important; color: black !important;
    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
  }
  @page { margin: 14mm; }
}`;

/** A row of the subject table, whichever shape the API produced. */
interface Row {
  label: string;
  ca: number | null;
  exam: number | null;
  total: number | null;
  remark: string;
}

export const ParentReportDetail: React.FC<ParentReportDetailProps> = ({ onNavigate, report, child }) => {
  const [school, setSchool] = React.useState<Record<string, string>>({});
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    firestoreService.getSystemSettings().then(setSchool).catch(() => setSchool({}));
  }, []);

  const download = async () => {
    if (!report?.id) return;
    setDownloadError(null);
    setDownloading(true);
    try {
      await firestoreService.downloadReportPdf(report.id);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Could not download that report.');
    } finally {
      setDownloading(false);
    }
  };

  if (!report || !child) {
    return (
      <WorkSurface>
        <PageHeader title="Report card" />
        <EmptyState
          icon="description"
          title="No report selected"
          body="Pick a released report card from the Reports list to view it."
          action={<Button onClick={() => onNavigate(View.PARENT_REPORTS)}>Back to reports</Button>}
        />
      </WorkSurface>
    );
  }

  const studentName = child.name || 'Student';
  // Match the PDF: the admission number is the school's record identifier, the login
  // ID is the fallback, and the internal database key is never shown to a parent.
  const admissionNo = (child.admissionNumber || '').trim();
  const idLabel = admissionNo ? 'Admission No.' : 'Student ID';
  const studentId = admissionNo || (child.loginId || '').trim() || '—';
  const studentClass = child.classId || 'Unassigned';
  const termName = report.term || 'Current Term';
  const session = report.session || '';
  const totalScore: number | null = report.totalScore ?? null;
  const comments = report.comments || 'No comments were recorded for this report.';
  const overallBand = totalScore != null ? gradeFor(totalScore) : null;

  /**
   * report.grades comes in two shapes depending on which teacher workflow wrote it:
   *   subject-keyed    { Mathematics: { ca, exam, score, grade, remarks } }
   *   component-keyed  { ca: 38, exam: 54 }
   * Render whatever is actually present rather than assuming one.
   */
  const raw = Object.entries(report.grades || {}) as [string, any][];
  const componentKeyed = raw.length > 0 && raw.every(([, v]) => typeof v === 'number');

  const rows: Row[] = componentKeyed
    ? [
        {
          label: report.subject || 'Overall',
          ca: Number(report.grades.ca ?? 0),
          exam: Number(report.grades.exam ?? 0),
          total: Number(report.grades.ca ?? 0) + Number(report.grades.exam ?? 0),
          remark: report.remarks || '',
        },
      ]
    : raw.map(([subject, v]) => {
        const ca = v?.ca != null ? Number(v.ca) : null;
        const exam = v?.exam != null ? Number(v.exam) : null;
        const total = v?.score != null ? Number(v.score) : ca != null && exam != null ? ca + exam : null;
        return { label: subject, ca, exam, total, remark: v?.remarks || '' };
      });

  const printed = rows.filter((r) => r.total != null);
  const average = printed.length ? printed.reduce((a, r) => a + (r.total ?? 0), 0) / printed.length : totalScore;

  return (
    <WorkSurface>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <PageHeader
        breadcrumb={
          <button
            onClick={() => onNavigate(View.PARENT_REPORTS)}
            className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-500 hover:text-primary w-fit"
          >
            <Icon name="arrow_back" className="text-[14px]" />
            All reports
          </button>
        }
        title="Report card"
        subtitle={`${studentName} · ${termName}${session ? ` · ${session}` : ''}`}
        actions={
          <>
            <Button variant="secondary" icon="print" onClick={() => window.print()}>
              Print
            </Button>
            <Button icon="file_download" loading={downloading} onClick={download}>
              Download PDF
            </Button>
          </>
        }
      />

      {downloadError && <InlineNote tone="blush" icon="priority_high">{downloadError}</InlineNote>}

      <Card id="printable-report" className="p-6 md:p-10 max-w-[900px]">
        {/* Masthead */}
        <div className="flex items-center gap-4 pb-4 border-b-[3px] border-primary">
          <div className="size-14 rounded-[15px] bg-primary text-white flex items-center justify-center shrink-0">
            <Icon name="school" className="text-[32px]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[22px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
              {school.school_name?.trim() || 'Your school'}
            </p>
            {/* Only configured details are printed. An unset field shows nothing
                rather than a bracketed placeholder on a document parents keep. */}
            {[school.school_address, school.school_phone, school.school_email].some((v) => v?.trim()) && (
              <p className="mt-0.5 text-[13px] text-slate-500">
                {[school.school_address, school.school_phone, school.school_email]
                  .map((v) => v?.trim())
                  .filter(Boolean)
                  .join('  ·  ')}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[15px] font-bold text-primary tracking-[0.02em]">TERMINAL REPORT</p>
            <p className="mt-0.5 text-[13px] text-slate-500">
              {termName}
              {session ? ` · ${session}` : ''}
            </p>
          </div>
        </div>

        {/* Student block */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-900/40 rounded-[14px] p-4 md:p-5 mt-5">
          {[
            ['Student', studentName],
            ['Class', studentClass],
            [idLabel, studentId],
            ['Overall average', average != null ? `${Math.round(average)}%` : '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs font-semibold uppercase tracking-[0.07em] text-slate-400">{label}</p>
              <p className="mt-1 text-base font-semibold text-slate-900 dark:text-white">{value}</p>
            </div>
          ))}
        </div>

        {/* Subjects */}
        <div className="mt-5 rounded-xl overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-primary text-white">
                <th className="text-left text-xs font-semibold uppercase tracking-[0.05em] px-3 py-3">Subject</th>
                <th className="text-right text-xs font-semibold uppercase tracking-[0.05em] px-3 py-3 w-20">CA {CA_MAX}</th>
                <th className="text-right text-xs font-semibold uppercase tracking-[0.05em] px-3 py-3 w-20">Exam {EXAM_MAX}</th>
                <th className="text-right text-xs font-semibold uppercase tracking-[0.05em] px-3 py-3 w-16">Total</th>
                <th className="text-center text-xs font-semibold uppercase tracking-[0.05em] px-3 py-3 w-20">Grade</th>
                <th className="text-left text-xs font-semibold uppercase tracking-[0.05em] px-3 py-3">Remark</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400 italic border-b border-slate-200 dark:border-slate-700">
                    No subject scores were recorded for this report.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const band = r.total != null ? gradeFor(r.total) : null;
                  return (
                    <tr key={r.label} className={i % 2 ? 'bg-slate-50 dark:bg-slate-900/40' : ''}>
                      <td className="px-3 py-2.5 text-[15px] font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700">
                        {r.label}
                      </td>
                      <td className="px-3 py-2.5 text-[15px] text-right text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                        {r.ca ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[15px] text-right text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                        {r.exam ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[15px] text-right font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700">
                        {r.total ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-center border-b border-slate-200 dark:border-slate-700">
                        {band ? <Badge tone={band.tone}>{band.label}</Badge> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                        {r.remark || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <div className="bg-tint-blue rounded-xl px-4 py-3.5">
            <p className="text-xs font-semibold uppercase tracking-[0.07em] text-ink-blue">Subjects</p>
            <p className="mt-1 text-2xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white">{printed.length}</p>
          </div>
          <div className="bg-tint-mint rounded-xl px-4 py-3.5">
            <p className="text-xs font-semibold uppercase tracking-[0.07em] text-ink-mint">Average</p>
            <p className="mt-1 text-2xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
              {average != null ? `${Math.round(average)}%` : '—'}
            </p>
          </div>
          <div className="bg-tint-butter rounded-xl px-4 py-3.5">
            <p className="text-xs font-semibold uppercase tracking-[0.07em] text-ink-butter">Overall grade</p>
            <p className="mt-1 text-2xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
              {overallBand?.label ?? report.grade ?? '—'}
            </p>
          </div>
        </div>

        {/* Grading key — reads from the shared scale, so entry and card agree. */}
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.07em] text-slate-400 mb-2">Grading key</p>
          <div className="flex flex-wrap gap-4">
            {GRADE_BANDS.map((b) => (
              <span key={b.label} className="text-[13px] text-slate-600 dark:text-slate-400">
                <span className={`font-bold ${b.tone === 'mint' ? 'text-ink-mint' : b.tone === 'blue' ? 'text-ink-blue' : b.tone === 'butter' ? 'text-ink-butter' : 'text-ink-blush'}`}>
                  {b.label}
                </span>{' '}
                {b.minScore}–{b.maxScore} {b.description}
              </span>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] text-slate-400">Subject totals are out of {SUBJECT_MAX}.</p>
        </div>

        {/* Remarks */}
        <div className="mt-5 border-l-[3px] border-primary pl-3.5 py-0.5">
          <p className="text-xs font-semibold uppercase tracking-[0.07em] text-slate-400">Class teacher&rsquo;s remark</p>
          <p className="mt-1.5 text-base leading-relaxed text-slate-800 dark:text-slate-200">{comments}</p>
        </div>

        {/* Signatures */}
        <div className="flex flex-col sm:flex-row gap-6 mt-8">
          {['Class teacher', 'Head teacher', 'Parent / guardian'].map((l) => (
            <div key={l} className="flex-1">
              <div className="h-8 border-b border-slate-400" />
              <p className="mt-1.5 text-[13px] text-slate-500">{l}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-5 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500">
            Status: <span className="font-semibold text-slate-700 dark:text-slate-300">{report.status || 'pending'}</span>
          </p>
          <p className="text-xs text-slate-400">Approved and released via EduManage · ref {report.id}</p>
        </div>
      </Card>
    </WorkSurface>
  );
};

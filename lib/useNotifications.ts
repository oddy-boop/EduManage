import { useEffect, useState } from 'react';
import { UserRole, View } from '../types';
import { firestoreService } from './services';

export interface Notification {
  id: string;
  tone: 'info' | 'warn' | 'urgent' | 'good';
  title: string;
  body?: string;
  /** Where clicking it should take you. */
  view?: View;
}

/**
 * Notifications are DERIVED from data the app already has — there is no
 * notifications table, and inventing one would mean writing rows nobody reads.
 * Everything here is a live fact: a queue with items in it, a subject still
 * missing, a fee still owed. If there is nothing true to say, it says nothing.
 */

/** Takes the first value from one of the polling subscriptions, then unsubscribes. */
function once<T>(subscribe: (cb: (data: T) => void) => () => void, timeoutMs = 8000): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false;
    let unsub = () => {};
    const finish = (v: T | null) => {
      if (done) return;
      done = true;
      try { unsub(); } catch { /* ignore */ }
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    unsub = subscribe((data) => {
      clearTimeout(timer);
      finish(data);
    });
  });
}

export function useNotifications(user: { uid: string; role: UserRole; name?: string } | null) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setItems([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const out: Notification[] = [];

    (async () => {
      setLoading(true);
      try {
        const settings = await firestoreService.getSystemSettings().catch(() => null);
        const term = settings?.current_term || 'Term 2';

        if (user.role === UserRole.ADMIN) {
          const reports = (await once<any[]>((cb) => firestoreService.getAllReports(cb))) || [];
          const pending = reports.filter((r) => r.status === 'pending').length;
          if (pending > 0) {
            out.push({
              id: 'admin-approvals',
              tone: 'urgent',
              title: `${pending} report ${pending === 1 ? 'batch' : 'batches'} awaiting release`,
              body: 'Class teachers have submitted these. Parents cannot see them until you approve.',
              view: View.ADMIN_APPROVALS,
            });
          }

          const fees = (await once<any[]>((cb) => firestoreService.getAllFees(cb))) || [];
          const owing = fees.reduce(
            (a, f) => a + Math.max(0, (parseFloat(f.totalAmount ?? f.amount ?? 0) || 0) - (parseFloat(f.amountPaid ?? 0) || 0)),
            0,
          );
          if (owing > 0) {
            out.push({
              id: 'admin-fees',
              tone: 'info',
              title: `GHS ${Math.round(owing).toLocaleString()} in fees outstanding`,
              body: 'Across all classes and terms.',
              view: View.ADMIN_FEES,
            });
          }
        }

        if (user.role === UserRole.TEACHER) {
          // Classes where this teacher is the class teacher — the ones whose
          // report cards they are responsible for merging and submitting.
          const grades = (await once<any[]>((cb) => firestoreService.getGrades(cb))) || [];
          const myClasses = grades.filter((g: any) => g.classTeacherId === user.uid);

          for (const g of myClasses) {
            const status = await firestoreService.getSubjectMergeStatus(g.name, term).catch(() => null);
            if (!status) continue;
            const missing = status.subjects.filter((s: any) => !s.complete);

            if (status.subjects.length === 0) {
              out.push({
                id: `class-${g.id}-nosubjects`,
                tone: 'warn',
                title: `No subjects are assigned to ${g.name}`,
                body: 'Nobody is expected to submit results for this class, so it can never be finalized.',
                view: View.TEACHER_CLASS_REVIEW,
              });
            } else if (missing.length === 0) {
              out.push({
                id: `class-${g.id}-ready`,
                tone: 'good',
                title: `${g.name} is ready to finalize`,
                body: `All ${status.subjects.length} subjects are in. Add your remarks and send to admin.`,
                view: View.TEACHER_CLASS_REVIEW,
              });
            } else {
              out.push({
                id: `class-${g.id}-waiting`,
                tone: 'info',
                title: `${g.name}: waiting on ${missing.length} of ${status.subjects.length} subjects`,
                body: `Still to come — ${missing.map((s: any) => s.subject).join(', ')}.`,
                view: View.TEACHER_CLASS_REVIEW,
              });
            }
          }

          // Their own subject entry, per class they teach in.
          const assignments = await firestoreService.getTeacherAssignments().catch(() => []);
          for (const a of assignments) {
            const [students, rows] = await Promise.all([
              once<any[]>((cb) => firestoreService.getStudentsForClass(a.classId, cb)),
              once<any[]>((cb) =>
                firestoreService.getSubjectReports({ classId: a.classId, subject: a.subject, term }, cb),
              ),
            ]);
            const total = students?.length ?? 0;
            const submitted = (rows || []).filter((r: any) => r.status === 'submitted').length;
            if (total > 0 && submitted < total) {
              out.push({
                id: `subject-${a.classId}-${a.courseCode}`,
                tone: submitted === 0 ? 'warn' : 'info',
                title: `${a.subject} for ${a.classId}: ${submitted} of ${total} submitted`,
                body: 'The class teacher cannot finalize until every student is in.',
                view: View.TEACHER_REPORT_ENTRY,
              });
            }
          }
        }

        if (user.role === UserRole.PARENT) {
          const children = (await once<any[]>((cb) => firestoreService.getStudentsForParent(user.uid, cb))) || [];
          for (const child of children) {
            const fees = (await once<any[]>((cb) => firestoreService.getFeesForStudent(child.id, cb))) || [];
            const owing = fees.reduce(
              (a, f) => a + Math.max(0, (parseFloat(f.totalAmount ?? f.amount ?? 0) || 0) - (parseFloat(f.amountPaid ?? 0) || 0)),
              0,
            );
            if (owing > 0) {
              out.push({
                id: `fees-${child.id}`,
                tone: 'urgent',
                title: `GHS ${Math.round(owing).toLocaleString()} outstanding for ${child.name}`,
                view: View.PARENT_FEES,
              });
            }

            const reports = (await once<any[]>((cb) => firestoreService.getStudentReports(child.id, user.uid, cb))) || [];
            const released = reports.filter((r: any) => r.status === 'published').length;
            if (released > 0) {
              out.push({
                id: `reports-${child.id}`,
                tone: 'good',
                title: `${released} report ${released === 1 ? 'card' : 'cards'} available for ${child.name}`,
                view: View.PARENT_REPORTS,
              });
            }
          }
        }
      } finally {
        if (!cancelled) {
          setItems(out);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, user?.role]);

  return { items, loading, count: items.length };
}

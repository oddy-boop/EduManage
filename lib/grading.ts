import { useEffect, useState } from 'react';

/**
 * Grading scale — mirrors whatever the administrator has configured.
 *
 * The server owns this (School Settings › Grading scale) and is the authority:
 * it computes the grade actually stored on a report. This module holds the same
 * scale so the UI shows the same letter it will store.
 *
 * The exported values are ES module *live bindings*: importers automatically see
 * the loaded scale once `loadGradingScale()` resolves. The values below are the
 * defaults used until then, and if the fetch ever fails.
 */

export interface GradeBand {
  label: string;
  minScore: number;
  maxScore: number;
  description: string;
  /** Which pastel token pair the badge wears. */
  tone: 'mint' | 'blue' | 'butter' | 'blush';
}

export let CA_MAX = 40;
export let EXAM_MAX = 60;
export let SUBJECT_MAX = 100;
export let PASS_MARK = 45;

export let GRADE_BANDS: GradeBand[] = [
  { label: 'A1', minScore: 80, maxScore: 100, description: 'Excellent', tone: 'mint' },
  { label: 'B2', minScore: 70, maxScore: 79, description: 'Very good', tone: 'blue' },
  { label: 'B3', minScore: 65, maxScore: 69, description: 'Good', tone: 'blue' },
  { label: 'C4', minScore: 50, maxScore: 64, description: 'Credit', tone: 'butter' },
  { label: 'D7', minScore: 45, maxScore: 49, description: 'Pass', tone: 'butter' },
  { label: 'F9', minScore: 0, maxScore: 44, description: 'Fail', tone: 'blush' },
];

const listeners = new Set<() => void>();
let version = 0;

function apply(scale: { bands: GradeBand[]; caMax: number; examMax: number; passMark: number }) {
  if (Array.isArray(scale.bands) && scale.bands.length) {
    GRADE_BANDS = [...scale.bands].sort((a, b) => b.minScore - a.minScore);
  }
  if (Number.isFinite(scale.caMax)) CA_MAX = scale.caMax;
  if (Number.isFinite(scale.examMax)) EXAM_MAX = scale.examMax;
  if (Number.isFinite(scale.passMark)) PASS_MARK = scale.passMark;
  SUBJECT_MAX = CA_MAX + EXAM_MAX;
  version += 1;
  listeners.forEach((l) => l());
}

/** Fetches the configured scale. Safe to call more than once. */
export async function loadGradingScale(): Promise<void> {
  const { firestoreService } = await import('./services');
  try {
    apply(await firestoreService.getGradingScale());
  } catch {
    /* keep the defaults — a missing scale must not stop anyone grading */
  }
}

/** Re-renders a component when the scale changes (an admin saving a new one). */
export function useGradingScale() {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force(version);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return { bands: GRADE_BANDS, caMax: CA_MAX, examMax: EXAM_MAX, subjectMax: SUBJECT_MAX, passMark: PASS_MARK };
}

/** Returns null when a score falls outside every band — a gap the admin must fix. */
export function gradeFor(total: number): GradeBand | null {
  const n = Number(total);
  if (!Number.isFinite(n)) return null;
  return GRADE_BANDS.find((b) => n >= b.minScore && n <= b.maxScore) ?? null;
}

/**
 * Clamp an entered exam mark. Keeps 2 decimal places — half marks are real, and
 * rounding them away here would quietly change a student's score.
 */
export function clampExam(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(EXAM_MAX, Math.max(0, Math.round(n * 100) / 100));
}

/**
 * Coerces before testing. Postgres returns NUMERIC as a string, so a prefilled
 * mark can arrive as "50.00" — and Number.isFinite('50.00') is false, which made
 * a valid score report "Enter a number" and blocked submission.
 */
export function examError(value: unknown): string | null {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n)) return 'Enter a number';
  if (n < 0) return 'Cannot be negative';
  if (n > EXAM_MAX) return `Exam cannot exceed ${EXAM_MAX}`;
  return null;
}

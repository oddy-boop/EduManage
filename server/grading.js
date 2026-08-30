/**
 * Grading scale — loaded from the database, owned by the administrator.
 *
 * This used to be a hardcoded table here AND a different hardcoded table on the
 * client, so a report card displayed one grade and stored another. Both sides now
 * read the same rows from grade_bands, and the server stays the authority: it
 * computes the grade that is actually persisted on a report.
 */

let cache = null;

export const DEFAULT_BANDS = [
  { label: 'A1', minScore: 80, maxScore: 100, description: 'Excellent', tone: 'mint', sortOrder: 1 },
  { label: 'B2', minScore: 70, maxScore: 79, description: 'Very good', tone: 'blue', sortOrder: 2 },
  { label: 'B3', minScore: 65, maxScore: 69, description: 'Good', tone: 'blue', sortOrder: 3 },
  { label: 'C4', minScore: 50, maxScore: 64, description: 'Credit', tone: 'butter', sortOrder: 4 },
  { label: 'D7', minScore: 45, maxScore: 49, description: 'Pass', tone: 'butter', sortOrder: 5 },
  { label: 'F9', minScore: 0, maxScore: 44, description: 'Fail', tone: 'blush', sortOrder: 6 },
];

export function invalidateScaleCache() {
  cache = null;
}

export async function loadScale(pool) {
  if (cache) return cache;

  const bandsRes = await pool.query(
    'SELECT label, min_score, max_score, description, tone, sort_order FROM grade_bands ORDER BY min_score DESC'
  );
  const settingsRes = await pool.query(
    "SELECT key, value FROM system_settings WHERE key IN ('ca_max','exam_max','pass_mark')"
  );
  const settings = Object.fromEntries(settingsRes.rows.map(r => [r.key, Number(r.value)]));

  cache = {
    bands: bandsRes.rows.length
      ? bandsRes.rows.map(r => ({
          label: r.label,
          minScore: Number(r.min_score),
          maxScore: Number(r.max_score),
          description: r.description || '',
          tone: r.tone || 'blue',
          sortOrder: r.sort_order,
        }))
      : DEFAULT_BANDS,
    caMax: Number.isFinite(settings.ca_max) ? settings.ca_max : 40,
    examMax: Number.isFinite(settings.exam_max) ? settings.exam_max : 60,
    passMark: Number.isFinite(settings.pass_mark) ? settings.pass_mark : 45,
  };
  return cache;
}

/** Null when a score falls outside every band — a coverage gap, not a grade. */
export function gradeForIn(bands, total) {
  const n = Number(total);
  if (!Number.isFinite(n)) return null;
  return bands.find(b => n >= b.minScore && n <= b.maxScore) || null;
}

export async function calculateGrade(pool, total) {
  const { bands } = await loadScale(pool);
  return gradeForIn(bands, total)?.label ?? null;
}

/**
 * Rejects a scale that would print a blank grade. Every mark 0..100 must land in
 * exactly one band — no gaps, no overlaps.
 */
export function validateBands(bands) {
  if (!Array.isArray(bands) || bands.length === 0) return 'Add at least one grading band.';

  for (const b of bands) {
    if (!b || typeof b.label !== 'string' || !b.label.trim()) return 'Every band needs a label.';
    const min = Number(b.minScore);
    const max = Number(b.maxScore);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return `Band ${b.label} needs numeric bounds.`;
    if (min < 0 || max > 100) return `Band ${b.label} must sit between 0 and 100.`;
    if (min > max) return `Band ${b.label} has its lower bound above its upper bound.`;
  }

  const sorted = [...bands].sort((a, b) => Number(a.minScore) - Number(b.minScore));
  if (Number(sorted[0].minScore) !== 0) return `Marks below ${sorted[0].minScore} are not covered by any band.`;
  if (Number(sorted[sorted.length - 1].maxScore) !== 100) {
    return `Marks above ${sorted[sorted.length - 1].maxScore} are not covered by any band.`;
  }

  for (let i = 1; i < sorted.length; i++) {
    const prevMax = Number(sorted[i - 1].maxScore);
    const min = Number(sorted[i].minScore);
    if (min <= prevMax) return `${sorted[i - 1].label} and ${sorted[i].label} overlap.`;
    if (min > prevMax + 1) return `Marks ${prevMax + 1}–${min - 1} are not covered by any band.`;
  }

  return null;
}

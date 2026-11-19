/** Stable factor keys (not display names) are also the keys in options.ratings. */
export type Priority = { factor: string; weight: number; excluded?: boolean };
export type CandidateOption = { id: string; name: string; ratings: Record<string, unknown> };
export type RankedOption = CandidateOption & {
  score: number; rank: number; is_recommended: boolean; reason: string; trade_off: string;
};

function validateRows(rows: readonly Priority[]) {
  const keys = new Set<string>();
  for (const row of rows) {
    if (!row.factor.trim() || keys.has(row.factor) || !Number.isFinite(row.weight) ||
      row.weight < 0 || row.weight > 100 || (row.excluded && row.weight !== 0)) {
      throw new Error('Priorities need unique factor keys and weights between 0 and 100.');
    }
    keys.add(row.factor);
  }
}

/** Largest remainder allocation: deterministic integer points, always exactly 100. */
export function normalizePriorities(rows: readonly Priority[]): Priority[] {
  validateRows(rows);
  const active = rows.filter(row => !row.excluded);
  if (!active.length) throw new Error('Keep at least one priority factor.');
  const total = active.reduce((sum, row) => sum + row.weight, 0);
  const shares = active.map(row => total ? row.weight / total * 100 : 100 / active.length);
  const points = shares.map(Math.floor);
  const order = shares.map((value, i) => ({ i, remainder: value - points[i] }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  const remaining = 100 - points.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remaining; i++) points[order[i].i]++;
  return active.map((row, i) => ({ factor: row.factor, weight: points[i] }));
}

export function validatePriorityTotal(rows: readonly Priority[]): void {
  validateRows(rows);
  if (!rows.some(row => !row.excluded) || rows.some(row => !Number.isInteger(row.weight)) ||
    rows.reduce((sum, row) => sum + row.weight, 0) !== 100) {
    throw new Error('Distribute exactly 100 whole points across your factors.');
  }
}

/** Missing overrides inherit; explicit zero overrides do not. Exclusions persist removals. */
export function mergePriorities(universal: readonly Priority[], task: readonly Priority[] = []): Priority[] {
  validateRows(universal); validateRows(task);
  const merged = new Map(universal.map(row => [row.factor, row]));
  for (const row of task) merged.set(row.factor, row);
  return normalizePriorities([...merged.values()]);
}

// Ratings use 0–100, higher is better for EVERY factor (including cost).
// Missing/non-numeric ratings earn zero; out-of-range numeric ratings are clamped.
function rating(option: CandidateOption, factor: string): number {
  const value = option.ratings[factor];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}
function knownRating(option: CandidateOption, factor: string) {
  return typeof option.ratings[factor] === 'number' && Number.isFinite(option.ratings[factor]);
}
const compareKey = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** No IO and no mutation. Rank on full precision, round only the displayed score. */
export function scoreOptions(options: readonly CandidateOption[], weights: readonly Priority[], labels: Record<string, string> = {}): RankedOption[] {
  const effective = normalizePriorities(weights);
  if (new Set(options.map(option => option.id)).size !== options.length) throw new Error('Option IDs must be unique.');
  const ranked = options.map(option => ({ option, score: effective.reduce((sum, row) => sum + rating(option, row.factor) * row.weight / 100, 0) }))
    .sort((a, b) => b.score - a.score || compareKey(a.option.id, b.option.id));
  return ranked.slice(0, 3).map(({ option, score }, index) => {
    const contributions = effective.filter(row => row.weight > 0)
      .map(row => ({ ...row, contribution: rating(option, row.factor) * row.weight }))
      .sort((a, b) => b.contribution - a.contribution || compareKey(a.factor, b.factor));
    const strongest = contributions[0];
    const gaps = effective.filter(row => row.weight > 0).map(row => {
      const bestAlternative = options.filter(other => other.id !== option.id)
        .reduce((best, other) => Math.max(best, rating(other, row.factor)), 0);
      return { ...row, gap: (bestAlternative - rating(option, row.factor)) * row.weight };
    }).sort((a, b) => b.gap - a.gap || compareKey(a.factor, b.factor));
    const missing = effective.filter(row => row.weight > 0 && !knownRating(option, row.factor));
    const label = (factor: string) => labels[factor] || factor;
    const tied = ranked.filter(item => Math.abs(item.score - score) < 1e-10).length > 1;
    let reason = strongest.contribution > 0
      ? `${label(strongest.factor)} contributes most to its fit with your priorities.`
      : 'Available ratings show no positive fit with your priorities yet.';
    if (index === 0) reason = `${tied ? 'Tied for the best fit with your priorities.' : 'Best overall fit with your priorities.'} ${reason}`;
    const trade_off = missing.length
      ? `${label(missing[0].factor)} is unrated and counted as zero. Check it before choosing.`
      : gaps[0].gap > 0
        ? `Another option rates better on ${label(gaps[0].factor)}.`
        : 'It matches or beats the other choices on every rated factor. Consider anything the ratings do not cover.';
    return { ...option, score: Math.round(score * 100) / 100, rank: index + 1, is_recommended: index === 0, reason, trade_off };
  });
}

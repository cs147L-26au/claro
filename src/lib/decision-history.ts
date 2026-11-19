import type { Decision } from './model';

function savedTime(decision: Decision) {
  const time = Date.parse(decision.createdAt);
  return Number.isFinite(time) ? time : 0;
}

/** Keep the timeline tied to when a choice was made, even after later edits. */
export function decisionsByDate(decisions: readonly Decision[]): Decision[] {
  return [...decisions].sort((a, b) => savedTime(b) - savedTime(a) || a.id.localeCompare(b.id));
}

export function decisionSummary(decision: Decision): string {
  return (decision.choice.trim() || decision.title.trim()).replace(/\s+/g, ' ');
}

export function decisionDate(decision: Decision): string {
  const date = new Date(decision.createdAt);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Earlier';
}

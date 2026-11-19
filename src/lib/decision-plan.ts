import type { Factor } from './model.ts';
import { validDate } from './model.ts';

export type PlanResource = { label: string; kind: 'link' | 'email' | 'phone' | 'text'; value: string; sourceUrl: string };
export type PlanAction = { title: string; details: string; resources: PlanResource[] };
export type PlanDay = { day: number; actions: PlanAction[] };
export type PlanSource = { title: string; url: string };
export type PlanRecommendation = {
  name: string; headline: string; reason: string; tradeoff: string; website: string;
  contacts: PlanResource[]; specs: { label: string; value: string; sourceUrl: string }[];
};
export type ReadyDecisionPlan = {
  status: 'ready'; questions: string[]; recommendation: PlanRecommendation;
  durationDays: number; scheduleReason: string; days: PlanDay[]; sources: PlanSource[]; assumptions: string[];
};
export type ClarificationDecisionPlan = {
  status: 'needs_info'; questions: string[]; recommendation: null;
  durationDays: 0; scheduleReason: string; days: []; sources: PlanSource[]; assumptions: string[];
};
export type DecisionPlan = ReadyDecisionPlan | ClarificationDecisionPlan;
export type PlanFactor = Pick<Factor, 'id' | 'name' | 'description' | 'weight'>;
export type DecisionPlanInput = {
  title: string; description: string; dueDate: string; startDate: string;
  factors: PlanFactor[]; context: string;
};

const invalid = () => new Error('The recommendation was incomplete. Please try again.');
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) throw invalid();
  return value.trim();
}
function list(value: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw invalid();
  return value;
}
export function planWebUrl(value: unknown, optional = false): string {
  const address = text(value, 2048, optional);
  if (!address && optional) return '';
  try {
    const parsed = new URL(address);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password ||
        !parsed.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/i.test(parsed.hostname)) throw invalid();
    return parsed.href;
  } catch { throw invalid(); }
}

function resource(value: unknown): PlanResource {
  const item = object(value);
  const kind = item.kind;
  if (!['link', 'email', 'phone', 'text'].includes(kind as string)) throw invalid();
  const raw = text(item.value, kind === 'link' ? 2048 : 500);
  if (kind === 'email' && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(raw)) throw invalid();
  if (kind === 'phone' && (!/^[+()\d .-]{5,40}$/.test(raw) || raw.replace(/\D/g, '').length < 5)) throw invalid();
  return { label: text(item.label, 80), kind: kind as PlanResource['kind'],
    value: kind === 'link' ? planWebUrl(raw) : raw, sourceUrl: planWebUrl(item.sourceUrl, true) };
}

/** Validate every field before a recommendation can be displayed or scheduled. */
export function parseDecisionPlan(value: unknown): DecisionPlan {
  const plan = object(value);
  const sources = list(plan.sources, 0, 12).map(value => {
    const source = object(value); return { title: text(source.title, 160), url: planWebUrl(source.url) };
  });
  if (new Set(sources.map(source => source.url)).size !== sources.length) throw invalid();
  const assumptions = list(plan.assumptions, 0, 5).map(item => text(item, 300));
  const scheduleReason = text(plan.scheduleReason, 400, plan.status === 'needs_info');
  if (plan.status === 'needs_info') {
    if (plan.recommendation !== null || plan.durationDays !== 0 || !Array.isArray(plan.days) || plan.days.length) throw invalid();
    return { status: 'needs_info', questions: list(plan.questions, 1, 3).map(item => text(item, 240)),
      recommendation: null, durationDays: 0, scheduleReason, days: [], sources, assumptions };
  }
  if (plan.status !== 'ready' || !Number.isInteger(plan.durationDays) || (plan.durationDays as number) < 1 ||
      (plan.durationDays as number) > 30 || !sources.length || !Array.isArray(plan.questions) || plan.questions.length) throw invalid();
  const rec = object(plan.recommendation);
  const recommendation: PlanRecommendation = {
    name: text(rec.name, 120), headline: text(rec.headline, 180), reason: text(rec.reason, 700),
    tradeoff: text(rec.tradeoff, 400), website: planWebUrl(rec.website),
    contacts: list(rec.contacts, 1, 4).map(resource),
    specs: list(rec.specs, 0, 6).map(value => {
      const spec = object(value); return { label: text(spec.label, 80), value: text(spec.value, 300), sourceUrl: planWebUrl(spec.sourceUrl) };
    }),
  };
  const durationDays = plan.durationDays as number;
  const days = list(plan.days, durationDays, durationDays).map((value, index) => {
    const day = object(value);
    if (day.day !== index + 1) throw invalid();
    return { day: index + 1, actions: list(day.actions, 1, 2).map(value => {
      const action = object(value);
      const parsed = { title: text(action.title, 120), details: text(action.details, 700), resources: list(action.resources, 0, 4).map(resource) };
      if (planActionNotes(parsed).length > 2000) throw invalid();
      return parsed;
    }) };
  });
  const known = new Set(sources.map(source => source.url));
  const resources = [...recommendation.contacts, ...days.flatMap(day => day.actions.flatMap(action => action.resources))];
  if (!known.has(recommendation.website) || recommendation.specs.some(spec => !known.has(spec.sourceUrl)) ||
      resources.some(item => (item.sourceUrl && !known.has(item.sourceUrl)) || (item.kind === 'link' && !known.has(item.value)))) throw invalid();
  return { status: 'ready', questions: [], recommendation, durationDays, scheduleReason, days, sources, assumptions };
}

/** The entire action detail/resources payload is kept on its calendar item. */
export function planActionNotes(action: PlanAction): string {
  const resources = action.resources.map(item => `${item.label}: ${item.value}${item.sourceUrl && item.sourceUrl !== item.value ? `\nSource: ${item.sourceUrl}` : ''}`);
  return action.details + (resources.length ? `\n\n${resources.join('\n\n')}` : '');
}

/** Date-only arithmetic is independent of daylight-saving time and host timezone. */
export function addPlanDays(startDate: string, offset: number): string {
  if (!startDate || !validDate(startDate) || !Number.isInteger(offset) || offset < 0 || offset > 365) throw new Error('Choose a valid plan start date.');
  const date = new Date(`${startDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** Stable input snapshot: a color or schedule-date change does not rerun supplier research. */
export function planInputKey(input: Omit<DecisionPlanInput, 'startDate'>): string {
  return JSON.stringify({ title: input.title.trim(), description: input.description.trim(), dueDate: input.dueDate,
    factors: input.factors.map(({ id, name, description, weight }) => ({ id, name: name.trim(), description: description.trim(), weight }))
      .sort((a, b) => a.id.localeCompare(b.id)), context: input.context.trim() });
}

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

export class DecisionPlanValidationError extends Error {
  readonly category: 'contact' | 'schedule' | 'sources' | 'content';
  readonly path: string;
  readonly code: string;
  constructor(path: string, code: string) {
    const category = /source|website/i.test(path) || code === 'missing_source' ? 'sources'
      : path.includes('contacts') || code === 'invalid_contact' ? 'contact'
        : path.startsWith('days') || path === 'durationDays' ? 'schedule' : 'content';
    const messages = {
      contact: 'The contact details were incomplete. Please try again.',
      schedule: 'The daily plan was incomplete. Please try again.',
      sources: 'The source links were incomplete. Please try again.',
      content: 'The recommendation details were incomplete. Please try again.',
    };
    super(messages[category]);
    this.name = 'DecisionPlanValidationError';
    this.category = category;
    this.path = path;
    this.code = code;
  }
}
const invalid = (path: string, code = 'invalid_shape') => new DecisionPlanValidationError(path, code);
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(path, 'invalid_type');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, path: string, empty = false): string {
  if (typeof value !== 'string') throw invalid(path, 'invalid_type');
  if (value.length > max) throw invalid(path, 'too_long');
  if (!empty && !value.trim()) throw invalid(path, 'missing_text');
  return value.trim();
}
function list(value: unknown, min: number, max: number, path: string): unknown[] {
  if (!Array.isArray(value)) throw invalid(path, 'invalid_type');
  if (value.length < min || value.length > max) throw invalid(path, 'invalid_count');
  return value;
}
export function planWebUrl(value: unknown, optional = false, path = 'sources.url'): string {
  const address = text(value, 2048, path, optional);
  if (!address && optional) return '';
  try {
    const parsed = new URL(address);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password ||
        !parsed.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/i.test(parsed.hostname)) throw invalid(path, 'invalid_url');
    return parsed.href;
  } catch { throw invalid(path, 'invalid_url'); }
}

function resource(value: unknown, path: string): PlanResource {
  const item = object(value, path);
  const kind = item.kind;
  if (!['link', 'email', 'phone', 'text'].includes(kind as string)) throw invalid(`${path}.kind`, 'invalid_type');
  const raw = text(item.value, kind === 'link' ? 2048 : 500, `${path}.value`);
  if (kind === 'email' && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(raw)) throw invalid(`${path}.value`, 'invalid_contact');
  if (kind === 'phone' && (!/^[+()\d .-]{5,40}$/.test(raw) || raw.replace(/\D/g, '').length < 5)) throw invalid(`${path}.value`, 'invalid_contact');
  return { label: text(item.label, 80, `${path}.label`), kind: kind as PlanResource['kind'],
    value: kind === 'link' ? planWebUrl(raw, false, `${path}.value`) : raw,
    sourceUrl: planWebUrl(item.sourceUrl, true, `${path}.sourceUrl`) };
}

/** Validate every field before a recommendation can be displayed or scheduled. */
export function parseDecisionPlan(value: unknown): DecisionPlan {
  const plan = object(value, 'plan');
  const sources = list(plan.sources, 0, 12, 'sources').map((value, index) => {
    const path = `sources[${index}]`;
    const source = object(value, path);
    return { title: text(source.title, 160, `${path}.title`), url: planWebUrl(source.url, false, `${path}.url`) };
  });
  if (new Set(sources.map(source => source.url)).size !== sources.length) throw invalid('sources', 'duplicate_source');
  const assumptions = list(plan.assumptions, 0, 5, 'assumptions').map((item, index) => text(item, 300, `assumptions[${index}]`));
  const scheduleReason = text(plan.scheduleReason, 400, 'scheduleReason', plan.status === 'needs_info');
  if (plan.status === 'needs_info') {
    if (plan.recommendation !== null || plan.durationDays !== 0 || !Array.isArray(plan.days) || plan.days.length) throw invalid('plan', 'invalid_clarification');
    return { status: 'needs_info', questions: list(plan.questions, 1, 3, 'questions').map((item, index) => text(item, 240, `questions[${index}]`)),
      recommendation: null, durationDays: 0, scheduleReason, days: [], sources, assumptions };
  }
  if (plan.status !== 'ready') throw invalid('status', 'invalid_status');
  if (!Number.isInteger(plan.durationDays) || (plan.durationDays as number) < 1 ||
      (plan.durationDays as number) > 30) throw invalid('durationDays', 'invalid_duration');
  if (!sources.length) throw invalid('sources', 'missing_source');
  list(plan.questions, 0, 0, 'questions');
  const rec = object(plan.recommendation, 'recommendation');
  const recommendation: PlanRecommendation = {
    name: text(rec.name, 120, 'recommendation.name'), headline: text(rec.headline, 180, 'recommendation.headline'),
    reason: text(rec.reason, 700, 'recommendation.reason'), tradeoff: text(rec.tradeoff, 400, 'recommendation.tradeoff'),
    website: planWebUrl(rec.website, false, 'recommendation.website'),
    contacts: list(rec.contacts, 1, 4, 'recommendation.contacts').map((item, index) => resource(item, `recommendation.contacts[${index}]`)),
    specs: list(rec.specs, 0, 6, 'recommendation.specs').map((value, index) => {
      const path = `recommendation.specs[${index}]`;
      const spec = object(value, path);
      return { label: text(spec.label, 80, `${path}.label`), value: text(spec.value, 300, `${path}.value`),
        sourceUrl: planWebUrl(spec.sourceUrl, false, `${path}.sourceUrl`) };
    }),
  };
  const durationDays = plan.durationDays as number;
  const days = list(plan.days, durationDays, durationDays, 'days').map((value, index) => {
    const dayPath = `days[${index}]`;
    const day = object(value, dayPath);
    if (day.day !== index + 1) throw invalid(`${dayPath}.day`, 'non_consecutive_days');
    return { day: index + 1, actions: list(day.actions, 1, 2, `${dayPath}.actions`).map((value, actionIndex) => {
      const path = `${dayPath}.actions[${actionIndex}]`;
      const action = object(value, path);
      const parsed = { title: text(action.title, 120, `${path}.title`), details: text(action.details, 700, `${path}.details`),
        resources: list(action.resources, 0, 4, `${path}.resources`).map((item, resourceIndex) => resource(item, `${path}.resources[${resourceIndex}]`)) };
      if (planActionNotes(parsed).length > 2000) throw invalid(path, 'action_notes_too_long');
      return parsed;
    }) };
  });
  const known = new Set(sources.map(source => source.url));
  const resources = [...recommendation.contacts, ...days.flatMap(day => day.actions.flatMap(action => action.resources))];
  if (!known.has(recommendation.website)) throw invalid('recommendation.website', 'missing_source');
  if (recommendation.specs.some(spec => !known.has(spec.sourceUrl))) throw invalid('recommendation.specs.sourceUrl', 'missing_source');
  if (resources.some(item => (item.sourceUrl && !known.has(item.sourceUrl)) || (item.kind === 'link' && !known.has(item.value))))
    throw invalid('resources.sourceUrl', 'missing_source');
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

import { colors, validDate, validateFactors } from './model.ts';
import type { Factor } from './model.ts';

export type DecisionBrief = { title: string; description: string; dueDate: string };
export type DecisionSuggestion = { summary: string; factors: (Factor & { reason: string })[] };

export function validateDecisionBrief(brief: DecisionBrief): DecisionBrief {
  if (!brief.title.trim() || brief.title.length > 120) throw new Error('Give your decision a name (up to 120 characters).');
  if (brief.description.trim().length < 15 || brief.description.length > 2000)
    throw new Error('Add a little more detail (15–2,000 characters) so Claro can understand your decision.');
  if (!validDate(brief.dueDate)) throw new Error('Use a real date in YYYY-MM-DD format, or leave it empty.');
  return { title: brief.title.trim(), description: brief.description.trim(), dueDate: brief.dueDate };
}

export function parseDecisionSuggestion(value: unknown): DecisionSuggestion {
  const invalid = () => new Error('The response was incomplete. Please try again.');
  if (!value || typeof value !== 'object') throw invalid();
  const { summary, factors } = value as Record<string, unknown>;
  if (typeof summary !== 'string' || !summary.trim() || summary.length > 1200 ||
      !Array.isArray(factors) || factors.length < 3 || factors.length > 6) throw invalid();
  const bounded = (text: unknown, max: number): text is string => typeof text === 'string' && !!text.trim() && text.length <= max;
  const parsed = factors.map((f, index) => {
    if (!f || typeof f.id !== 'string' || f.id.length > 80 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(f.id) ||
        !bounded(f.name, 40) || !bounded(f.description, 140) || !bounded(f.reason, 800)) throw invalid();
    return { id: f.id, name: f.name.trim(), description: f.description.trim(), weight: f.weight,
      reason: f.reason.trim(), color: colors[index] };
  });
  if (!validateFactors(parsed) || new Set(parsed.map(f => f.name.replace(/\s+/g, ' ').toLowerCase())).size !== parsed.length) throw invalid();
  return { summary: summary.trim(), factors: parsed };
}

/** No credentials or account data are needed by this client. Only the decision brief is sent. */
export async function requestDecisionPriorities(baseUrl: string, brief: DecisionBrief, {
  signal, fetchImpl = fetch, timeoutMs = 35000,
}: { signal?: AbortSignal; fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<DecisionSuggestion> {
  const input = validateDecisionBrief(brief);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/decision-priorities`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: controller.signal,
    });
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new Error('The response was unreadable. Please try again.'); }
    if (!response.ok) {
      const message = (body as { error?: unknown } | null)?.error;
      throw new Error(typeof message === 'string' && message.length <= 1000 ? message : 'Recommendations are unavailable. Please try again.');
    }
    return parseDecisionSuggestion(body);
  } catch (error) {
    if (signal?.aborted) throw new Error('Request canceled. Your details are still here.');
    if (controller.signal.aborted) throw new Error('The request took too long. Please try again.');
    if (error instanceof TypeError) throw new Error('Cannot reach Claro. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

import { parseDecisionPlan } from './decision-plan.ts';
import type { DecisionPlan, DecisionPlanInput } from './decision-plan.ts';

export async function requestDecisionPlan(baseUrl: string, input: DecisionPlanInput, signal?: AbortSignal): Promise<DecisionPlan> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 120000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/decision-plan`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: controller.signal,
    });
    let result;
    try { result = await response.json(); }
    catch { throw new Error('Could not read the recommendation. Please try again.'); }
    if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'Could not prepare a recommendation. Please try again.');
    return parseDecisionPlan(result);
  } catch (e) {
    if (signal?.aborted) throw new Error('Recommendation canceled.');
    if (controller.signal.aborted) throw new Error('Research is taking longer than expected. Please try again.');
    if (e instanceof TypeError) throw new Error('Cannot reach Claro right now. Please try again shortly.');
    throw e;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

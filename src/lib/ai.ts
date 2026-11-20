import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Factor, validateFactors } from './model';
import { DecisionBrief, requestDecisionPriorities } from './decision-ai';
import type { DecisionPlanInput } from './decision-plan';
import { requestDecisionPlan } from './decision-plan-client';
import { resolveApiUrl } from './api-url';
export type Suggestion = { summary: string; factors: { id: string; weight: number; reason: string }[] };
function apiUrl() {
  return resolveApiUrl({
    configuredUrl: process.env.EXPO_PUBLIC_API_URL,
    development: __DEV__,
    platform: Platform.OS,
    browserHostname: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hostname : undefined,
    expoHostUri: Constants.expoConfig?.hostUri,
  });
}
export function suggestDecisionPriorities(brief: DecisionBrief, signal?: AbortSignal) {
  return requestDecisionPriorities(apiUrl(), brief, { signal });
}
export function generateTaskDecisionPlan(input: DecisionPlanInput, signal?: AbortSignal) {
  return requestDecisionPlan(apiUrl(), input, signal);
}
export async function suggestPriorities(context: string, factors: Factor[]): Promise<Suggestion> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(`${apiUrl()}/api/priorities`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, factors: factors.map(({ id, name, description, weight }) => ({ id, name, description, weight })) }),
      signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Recommendations are unavailable. Please try again.');
    if (!body || typeof body.summary !== 'string' || !Array.isArray(body.factors) || body.factors.length !== factors.length ||
      new Set(body.factors.map((f: { id: string }) => f.id)).size !== factors.length ||
      !body.factors.every((f: { id: string; reason: string }) => factors.some(x => x.id === f.id) && typeof f.reason === 'string') ||
      !validateFactors(factors.map(f => ({ ...f, weight: body.factors.find((r: { id: string }) => r.id === f.id)?.weight })))) {
      throw new Error('The response was incomplete. Please try again.');
    }
    return body;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The request took too long. Please try again.');
    if (error instanceof TypeError) throw new Error('Cannot reach Claro. Check your connection and try again.');
    throw error;
  } finally { clearTimeout(timeout); }
}

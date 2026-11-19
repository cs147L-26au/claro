import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Factor, validateFactors } from './model';
import { DecisionBrief, requestDecisionPriorities } from './decision-ai';
import type { DecisionPlanInput } from './decision-plan';
import { requestDecisionPlan } from './decision-plan-client';
export type Suggestion = { summary: string; factors: { id: string; weight: number; reason: string }[] };
function apiUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (configured) return configured;
  if (!__DEV__) throw new Error('Recommendations are not connected in this build. Please try again once the service is available.');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host || (Platform.OS === 'android' ? '10.0.2.2' : 'localhost')}:8787`;
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
    if (!response.ok) throw new Error(body.error || 'AI is unavailable right now. Please try again.');
    if (!body || typeof body.summary !== 'string' || !Array.isArray(body.factors) || body.factors.length !== factors.length ||
      new Set(body.factors.map((f: { id: string }) => f.id)).size !== factors.length ||
      !body.factors.every((f: { id: string; reason: string }) => factors.some(x => x.id === f.id) && typeof f.reason === 'string') ||
      !validateFactors(factors.map(f => ({ ...f, weight: body.factors.find((r: { id: string }) => r.id === f.id)?.weight })))) {
      throw new Error('The AI response was incomplete. Your priorities have not changed. Please try again.');
    }
    return body;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('AI took too long to respond. Please try again.');
    if (error instanceof TypeError) throw new Error('Cannot reach the AI service. Start npm run api on your computer and check that both devices are on the same Wi-Fi.');
    throw error;
  } finally { clearTimeout(timeout); }
}

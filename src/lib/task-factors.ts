import { colors, normalize, rebalance, uid, validateFactors } from './model.ts';
import type { Factor } from './model.ts';

const factorName = (name: string) => name.trim().replace(/\s+/g, ' ');
const nameKey = (name: string) => factorName(name).toLocaleLowerCase();

export function hasTaskFactor(factors: Factor[], factor: Pick<Factor, 'id' | 'name'>): boolean {
  return factors.some(current => current.id === factor.id || nameKey(current.name) === nameKey(factor.name));
}

function checkName(name: string, factors: Factor[], exceptId?: string) {
  const cleaned = factorName(name);
  if (!cleaned || cleaned.length > 40) throw new Error('Use a factor name of 1–40 characters.');
  if (factors.some(factor => factor.id !== exceptId && nameKey(factor.name) === nameKey(cleaned)))
    throw new Error('This factor is already on your list.');
  return cleaned;
}

export function parseFactorWeight(value: string): number {
  if (!/^\d{1,3}$/.test(value.trim())) throw new Error('Use a whole percentage from 0 to 100.');
  const weight = Number(value.trim());
  if (weight > 100) throw new Error('Use a whole percentage from 0 to 100.');
  return weight;
}

function checked(factors: Factor[]) {
  if (!validateFactors(factors)) throw new Error('Keep 2–8 factors with a total of 100%.');
  return factors;
}

export function addTaskFactor(factors: Factor[], factor: Factor): Factor[] {
  if (factors.length >= 8) throw new Error('You can use up to 8 factors.');
  if (hasTaskFactor(factors, factor)) throw new Error('This factor is already on your list.');
  const name = checkName(factor.name, factors);
  if (!Number.isInteger(factor.weight) || factor.weight < 0 || factor.weight > 100)
    throw new Error('Use a whole percentage from 0 to 100.');
  return checked(rebalance([...factors, { ...factor, name }], factor.id, factor.weight));
}

export function addCustomTaskFactor(factors: Factor[], name: string, weight: number): Factor[] {
  return addTaskFactor(factors, {
    id: uid(), name, weight, description: '',
    color: colors.find(color => !factors.some(factor => factor.color === color)) || colors[0],
  });
}

export function editTaskFactor(factors: Factor[], id: string, name: string, weight: number): Factor[] {
  if (!factors.some(factor => factor.id === id)) throw new Error('This factor is no longer on your list.');
  const cleaned = checkName(name, factors, id);
  if (!Number.isInteger(weight) || weight < 0 || weight > 100)
    throw new Error('Use a whole percentage from 0 to 100.');
  return checked(rebalance(factors.map(factor => factor.id === id ? { ...factor, name: cleaned } : factor), id, weight));
}

export function removeTaskFactor(factors: Factor[], id: string): Factor[] {
  if (factors.length <= 2) throw new Error('Keep at least 2 factors.');
  return checked(normalize(factors.filter(factor => factor.id !== id)));
}

export type Factor = { id: string; name: string; description: string; weight: number; color: string };
export type Decision = {
  id: string; title: string; category: string; choice: string; notes: string;
  alternatives: string[]; reviewDate: string; status: 'active' | 'archived';
  createdAt: string; updatedAt: string; priorities: Factor[];
};
export type Task = { id: string; title: string; notes: string; dueDate: string; done: boolean };
export type AppData = { version: 1; factors: Factor[]; decisions: Decision[]; tasks: Task[] };
export const colors = ['#A8B79B', '#CBD8B4', '#EEC4A2', '#D3C4DF', '#B6D6D1', '#E7D38C', '#B8CADC', '#DCAFB1'];
export const defaultFactors: Factor[] = [
  { id: 'cost', name: 'Cost', description: 'Total cost and long-term value', weight: 30, color: colors[0] },
  { id: 'quality', name: 'Quality', description: 'Product or service performance', weight: 30, color: colors[1] },
  { id: 'delivery', name: 'Delivery', description: 'Speed and consistency of delivery', weight: 10, color: colors[2] },
  { id: 'reliability', name: 'Reliability', description: 'Dependability and risk of disruption', weight: 20, color: colors[3] },
  { id: 'sustainability', name: 'Sustainability', description: 'Environmental and ethical impact', weight: 10, color: colors[4] },
];
export const initialData: AppData = { version: 1, factors: defaultFactors, decisions: [], tasks: [] };
export function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }

// Largest-remainder allocation keeps every displayed share an integer and the sum exact.
export function normalize(factors: Factor[], total = 100): Factor[] {
  if (!factors.length) return [];
  const sum = factors.reduce((n, f) => n + Math.max(0, f.weight), 0);
  const shares = factors.map(f => sum ? Math.max(0, f.weight) / sum * total : total / factors.length);
  const values = shares.map(Math.floor);
  const order = shares.map((n, i) => ({ i, remainder: n - values[i] })).sort((a, b) => b.remainder - a.remainder);
  for (let i = 0, left = total - values.reduce((a, b) => a + b, 0); i < left; i++) values[order[i % order.length].i]++;
  return factors.map((f, i) => ({ ...f, weight: values[i] }));
}
export function rebalance(factors: Factor[], id: string, value: number): Factor[] {
  if (!factors.some(f => f.id === id)) return factors;
  const weight = Math.min(100, Math.max(0, Math.round(value)));
  if (factors.length === 1) return factors.map(f => ({ ...f, weight: 100 }));
  const rest = normalize(factors.filter(f => f.id !== id), 100 - weight);
  return factors.map(f => f.id === id ? { ...f, weight } : rest.find(r => r.id === f.id)!);
}
export function validDate(value: string): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function dateLabel(value: string) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date set';
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function validateFactors(value: unknown): value is Factor[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) return false;
  return new Set(value.map(f => f?.id)).size === value.length && value.every(f => f &&
    typeof f.id === 'string' && !!f.id && typeof f.name === 'string' && !!f.name.trim() &&
    typeof f.description === 'string' && typeof f.color === 'string' && /^#[0-9a-f]{6}$/i.test(f.color) &&
    Number.isInteger(f.weight) && f.weight >= 0 && f.weight <= 100) && value.reduce((n, f) => n + f.weight, 0) === 100;
}
export function parseStoredData(raw: string): AppData {
  const d = JSON.parse(raw);
  const strings = (o: Record<string, unknown>, keys: string[]) => keys.every(k => typeof o[k] === 'string');
  if (d?.version !== 1 || !validateFactors(d.factors) || !Array.isArray(d.decisions) || !Array.isArray(d.tasks) ||
    !d.decisions.every((v: Decision) => v && strings(v, ['id', 'title', 'category', 'choice', 'notes', 'reviewDate', 'createdAt', 'updatedAt']) &&
      ['active', 'archived'].includes(v.status) && validDate(v.reviewDate) && validateFactors(v.priorities) && Array.isArray(v.alternatives) && v.alternatives.every(a => typeof a === 'string')) ||
    !d.tasks.every((v: Task) => v && strings(v, ['id', 'title', 'notes', 'dueDate']) && validDate(v.dueDate) && typeof v.done === 'boolean')) {
    throw new Error('Your saved data could not be read. It has been kept on this device.');
  }
  return d;
}

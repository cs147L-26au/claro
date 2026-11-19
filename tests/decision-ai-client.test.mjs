import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecisionSuggestion, requestDecisionPriorities, validateDecisionBrief } from '../src/lib/decision-ai.ts';
import { rebalance } from '../src/lib/model.ts';

const brief = { title: 'Choose a coffee supplier', description: 'Weekly deliveries before opening, good coffee, and a tight budget.', dueDate: '' };
const suggestion = { summary: 'Balance quality with dependable deliveries. Exact quotes are still needed.', factors: [
  { id: 'coffee-quality', name: 'Coffee quality', description: 'Taste and consistency', weight: 45, reason: 'Preserve the experience your regular customers expect.' },
  { id: 'delivery-fit', name: 'Delivery fit', description: 'Weekly arrivals before opening', weight: 35, reason: 'Late deliveries would disrupt service.' },
  { id: 'budget-fit', name: 'Budget fit', description: 'Total landed cost', weight: 20, reason: 'Compare the full cost against your budget.' },
] };

test('decision brief is validated before a request; only entered decision details are sent', async () => {
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    assert.equal(url, 'http://localhost:8787/api/decision-priorities');
    assert.deepEqual(JSON.parse(options.body), brief);
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' });
    return Response.json(suggestion);
  };
  for (const invalid of [{ ...brief, title: '' }, { ...brief, description: 'short' }, { ...brief, dueDate: '2026-02-30' }]) {
    await assert.rejects(requestDecisionPriorities('http://localhost:8787', invalid, { fetchImpl }));
  }
  assert.equal(calls, 0);
  const result = await requestDecisionPriorities('http://localhost:8787/', { ...brief, title: `  ${brief.title} ` }, { fetchImpl });
  assert.equal(result.factors.length, 3);
  assert.equal(result.factors[0].name, 'Coffee quality');
  assert.match(result.factors[0].color, /^#[0-9A-Fa-f]{6}$/);
  assert.equal(calls, 1);
  assert.throws(() => validateDecisionBrief({ ...brief, title: 'x'.repeat(121) }));
});

test('malformed analysis cannot enter the review or persistence flow', () => {
  for (const result of [null, {}, { ...suggestion, summary: '' }, { ...suggestion, factors: [] },
    { ...suggestion, factors: [suggestion.factors[0], suggestion.factors[0], suggestion.factors[2]] },
    { ...suggestion, factors: suggestion.factors.map((f, i) => i === 0 ? { ...f, weight: 44 } : f) },
    { ...suggestion, factors: suggestion.factors.map((f, i) => i === 0 ? { ...f, reason: '' } : f) },
    { ...suggestion, factors: suggestion.factors.map((f, i) => i === 0 ? { ...f, id: 'bad_id' } : f) },
    { ...suggestion, factors: suggestion.factors.map((f, i) => i === 0 ? { ...f, name: 'Delivery  fit' } : f) },
  ]) assert.throws(() => parseDecisionSuggestion(result), /incomplete/);
});

test('review sliders preserve tailored factors and explanations while rebalancing to 100', () => {
  const result = parseDecisionSuggestion(suggestion);
  const adjusted = rebalance(result.factors, 'budget-fit', 60);
  assert.deepEqual(adjusted.map(f => f.weight), [23, 17, 60]);
  assert.deepEqual(adjusted.map(f => f.id), result.factors.map(f => f.id));
  assert.equal(adjusted[0].reason, suggestion.factors[0].reason);
  assert.equal(result.factors[2].weight, 20);
});

test('service errors, invalid JSON, timeouts and cancellation remain recoverable', async () => {
  await assert.rejects(requestDecisionPriorities('http://localhost', brief, {
    fetchImpl: async () => Response.json({ error: 'AI is not connected yet.' }, { status: 503 }),
  }), /not connected/);
  await assert.rejects(requestDecisionPriorities('http://localhost', brief, {
    fetchImpl: async () => new Response('not json'),
  }), /unreadable/);
  await assert.rejects(requestDecisionPriorities('http://localhost', brief, {
    fetchImpl: async () => { throw new TypeError('fetch failed'); },
  }), /Cannot reach/);
  const hangingFetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException('aborted', 'AbortError'));
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
  await assert.rejects(requestDecisionPriorities('http://localhost', brief, { fetchImpl: hangingFetch, timeoutMs: 5 }), /too long/);
  const controller = new AbortController();
  const pending = requestDecisionPriorities('http://localhost', brief, { fetchImpl: hangingFetch, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /canceled/);
});

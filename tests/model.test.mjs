import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultFactors, initialData, normalize, rebalance, parseStoredData, validDate } from '../src/lib/model.ts';

test('every slider position preserves the requested share and an exact total of 100', () => {
  for (const selected of defaultFactors) for (let weight = 0; weight <= 100; weight++) {
    const next = rebalance(defaultFactors, selected.id, weight);
    assert.equal(next.find(f => f.id === selected.id).weight, weight);
    assert.equal(next.reduce((n, f) => n + f.weight, 0), 100);
    assert.ok(next.every(f => Number.isInteger(f.weight) && f.weight >= 0));
  }
});
test('rebalancing away from 100% distributes the remaining share even when other weights are zero', () => {
  const concentrated = rebalance(defaultFactors, 'cost', 100);
  const next = rebalance(concentrated, 'cost', 20);
  assert.deepEqual(next.map(f => f.weight), [20, 20, 20, 20, 20]);
});
test('removing a factor and rounding still preserves total', () => {
  assert.equal(normalize(defaultFactors.slice(1)).reduce((n, f) => n + f.weight, 0), 100);
  assert.deepEqual(normalize(defaultFactors.slice(0, 3).map(f => ({ ...f, weight: 0 }))).map(f => f.weight), [34, 33, 33]);
});
test('invalid calendar dates are rejected', () => {
  for (const value of ['2026-02-29', '2026-04-31', '2026-13-02', 'tomorrow']) assert.equal(validDate(value), false);
  for (const value of ['', '2028-02-29', '2026-11-19']) assert.equal(validDate(value), true);
});
test('saved decisions round-trip with their original priority snapshot', () => {
  const decision = { id: 'd1', title: 'Coffee supplier', category: 'Suppliers', choice: 'Local roaster', notes: 'Reliable delivery', alternatives: ['Wholesale'], reviewDate: '2026-11-19', status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), priorities: defaultFactors };
  const saved = { ...initialData, decisions: [decision], factors: rebalance(defaultFactors, 'cost', 75) };
  const restored = parseStoredData(JSON.stringify(saved));
  assert.equal(restored.factors[0].weight, 75);
  assert.equal(restored.decisions[0].priorities[0].weight, 30);
});
test('corrupt and incompatible storage is rejected instead of silently reset', () => {
  for (const raw of ['{', '{}', JSON.stringify({ ...initialData, version: 2 }), JSON.stringify({ ...initialData, tasks: [{}] })]) assert.throws(() => parseStoredData(raw));
});

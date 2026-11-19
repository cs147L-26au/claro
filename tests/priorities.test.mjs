import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePriorities, normalizePriorities, scoreOptions, validatePriorityTotal } from '../src/lib/priorities/logic.ts';
import { defaultFactors, normalize, rebalance } from '../src/lib/model.ts';

const universal = defaultFactors.map(f => ({ factor: f.id, weight: f.weight }));
const total = rows => rows.reduce((sum, row) => sum + row.weight, 0);
const candidate = (id, ratings = {}) => ({ id, name: `Option ${id}`, ratings });

test('all slider positions, additions, removals, and reset preserve exactly 100 points', () => {
  for (const factor of defaultFactors) for (let point = 0; point <= 100; point++) {
    const factors = rebalance(defaultFactors, factor.id, point);
    assert.equal(total(factors), 100);
    assert.equal(total(normalize(factors.slice(1))), 100);
    assert.equal(total([...factors, { ...factor, id: 'extra', weight: 0 }]), 100);
  }
  assert.equal(total(defaultFactors), 100);
});
test('no task overrides falls back to universal without mutating inputs', () => {
  const original = structuredClone(universal);
  assert.deepEqual(mergePriorities(universal), universal);
  assert.deepEqual(universal, original);
});
test('per-factor overrides retain universal fallbacks and renormalize to 100', () => {
  const result = mergePriorities(universal, [{ factor: 'cost', weight: 70 }]);
  assert.deepEqual(result.map(f => f.weight), [50, 22, 7, 14, 7]);
  assert.equal(total(result), 100);
});
test('zero overrides win, exclusions remove, and new factors join the effective set', () => {
  const result = mergePriorities(universal, [
    { factor: 'cost', weight: 0 }, { factor: 'quality', weight: 0, excluded: true }, { factor: 'local', weight: 20 },
  ]);
  assert.equal(result.find(f => f.factor === 'cost').weight, 0);
  assert.equal(result.some(f => f.factor === 'quality'), false);
  assert.ok(result.some(f => f.factor === 'local'));
  assert.equal(total(result), 100);
});
test('all-zero input and rounding produce deterministic whole points', () => {
  assert.deepEqual(normalizePriorities(['a', 'b', 'c'].map(factor => ({ factor, weight: 0 }))).map(f => f.weight), [34, 33, 33]);
  for (let count = 1; count <= 16; count++) {
    assert.equal(total(normalizePriorities(Array.from({ length: count }, (_, i) => ({ factor: `${i}`, weight: (i * 7) % 100 })))), 100);
  }
});
test('bad totals, duplicate keys, non-finite and negative weights are rejected', () => {
  for (const rows of [[], [{ factor: 'cost', weight: 99 }], [{ factor: 'cost', weight: NaN }],
    [{ factor: 'cost', weight: -1 }], [{ factor: 'cost', weight: Infinity }],
    [{ factor: 'a', weight: 50.5 }, { factor: 'b', weight: 49.5 }],
    [{ factor: 'a', weight: 50 }, { factor: 'a', weight: 50 }]]) assert.throws(() => validatePriorityTotal(rows));
});
test('weighted scores change order when either priority set changes', () => {
  const options = [candidate('a', { cost: 100, quality: 0 }), candidate('b', { cost: 0, quality: 100 })];
  const weights = [{ factor: 'cost', weight: 70 }, { factor: 'quality', weight: 30 }];
  assert.equal(scoreOptions(options, weights)[0].id, 'a');
  assert.equal(scoreOptions(options, [{ factor: 'cost', weight: 20 }, { factor: 'quality', weight: 80 }])[0].id, 'b');
  assert.equal(scoreOptions(options, mergePriorities(weights, [{ factor: 'cost', weight: 0 }]))[0].id, 'b');
  assert.equal(scoreOptions(options, weights)[0].score, 70);
});
test('ties use stable option IDs regardless of input order, with exactly one recommendation', () => {
  const options = ['d', 'b', 'a', 'c'].map(id => candidate(id, { cost: 75 }));
  const result = scoreOptions(options, [{ factor: 'cost', weight: 100 }]);
  assert.deepEqual(result.map(o => o.id), ['a', 'b', 'c']);
  assert.deepEqual(scoreOptions([...options].reverse(), [{ factor: 'cost', weight: 100 }]), result);
  assert.equal(result.filter(o => o.is_recommended).length, 1);
  assert.match(result[0].reason, /Tied/);
});
test('returns exactly three choices or fewer only when fewer candidates exist', () => {
  for (let count = 0; count < 10; count++) {
    const result = scoreOptions(Array.from({ length: count }, (_, i) => candidate(`${i}`)), universal);
    assert.equal(result.length, Math.min(count, 3));
    assert.deepEqual(result.map(o => o.rank), Array.from({ length: Math.min(count, 3) }, (_, i) => i + 1));
    assert.equal(result.filter(o => o.is_recommended).length, count ? 1 : 0);
    assert.ok(result.every(o => o.reason && o.trade_off));
  }
});
test('missing and invalid ratings count as zero, numeric ratings clamp, reasons flag missing evidence', () => {
  const result = scoreOptions([candidate('a', { cost: 200, quality: '90' }), candidate('b', { cost: -10, quality: NaN })],
    [{ factor: 'cost', weight: 50 }, { factor: 'quality', weight: 50 }], { cost: 'Affordability', quality: 'Quality' });
  assert.equal(result[0].score, 50); assert.equal(result[1].score, 0);
  assert.match(result[0].reason, /Affordability/); assert.match(result[0].trade_off, /Quality is unrated/);
});
test('main trade-off identifies the largest weighted deficit against other options', () => {
  const result = scoreOptions([candidate('a', { cost: 100, quality: 50 }), candidate('b', { cost: 10, quality: 90 })],
    [{ factor: 'cost', weight: 70 }, { factor: 'quality', weight: 30 }], { quality: 'Quality' });
  assert.match(result[0].trade_off, /Quality/);
});

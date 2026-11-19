import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDecisionPriorities, validateDecisionRequest, validateDecisionResult } from '../server/decision-priorities.mjs';
import { createApi } from '../server/index.mjs';

const input = {
  title: 'Choose a coffee supplier',
  description: 'We run a small cafe, need weekly deliveries, and have a tight budget without sacrificing taste.',
  dueDate: '2026-12-01',
};
const result = {
  summary: 'Balance coffee quality with costs and dependable deliveries. Supplier quotes are not yet available.',
  factors: [
    { id: 'coffee-quality', name: 'Coffee quality', description: 'Taste and consistency of the beans', weight: 40, reason: 'Taste matters to returning cafe customers.' },
    { id: 'total-cost', name: 'Total cost', description: 'Beans, shipping, and minimum order costs', weight: 35, reason: 'The stated budget is tight.' },
    { id: 'delivery-reliability', name: 'Delivery reliability', description: 'Consistency of weekly deliveries', weight: 25, reason: 'Reliable deliveries help prevent stockouts.' },
  ],
};
const completion = (value = result) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] });

test('decision request validates details and real dates before contacting Groq', async () => {
  for (const body of [null, {}, { ...input, title: '   ' }, { ...input, title: 'x'.repeat(121) },
    { ...input, description: 'Too short' }, { ...input, description: ' '.repeat(15) },
    { ...input, description: 'x'.repeat(2001) }, { ...input, dueDate: null },
    { ...input, dueDate: '2026-02-29' }, { ...input, dueDate: '2026-04-31' },
    { ...input, dueDate: '2026-1-01' }, { ...input, dueDate: 'not-a-date' }]) {
    let called = false;
    await assert.rejects(generateDecisionPriorities(body, { key: 'test', fetchImpl: async () => { called = true; return completion(); } }), e => e.status === 400);
    assert.equal(called, false);
  }
  assert.deepEqual(validateDecisionRequest({ ...input, title: ` ${input.title} `, description: ` ${input.description} ` }), input);
  assert.equal(validateDecisionRequest({ ...input, dueDate: '' }).dueDate, '');
  assert.equal(validateDecisionRequest({ ...input, dueDate: '2028-02-29' }).dueDate, '2028-02-29');
});

test('missing decision AI key fails without a fabricated suggestion or a provider call', async () => {
  let called = false;
  await assert.rejects(generateDecisionPriorities(input, { key: '', fetchImpl: async () => { called = true; return completion(); } }), e => e.status === 503 && /Groq API key/.test(e.message));
  assert.equal(called, false);
});

test('decision generation sends only decision details and requests new criteria with a strict schema', async () => {
  const actual = await generateDecisionPriorities({ ...input, accountId: 'do-not-send', factors: ['unrelated'] }, {
    key: 'test-only', model: 'test-model', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer test-only');
      assert.ok(options.signal instanceof AbortSignal);
      const request = JSON.parse(options.body);
      assert.equal(request.model, 'test-model');
      assert.equal(request.response_format.json_schema.strict, true);
      const schema = request.response_format.json_schema.schema;
      assert.equal(schema.additionalProperties, false);
      assert.equal(schema.properties.factors.items.additionalProperties, false);
      assert.deepEqual(schema.properties.factors.items.required, ['id', 'name', 'description', 'weight', 'reason']);
      assert.deepEqual(JSON.parse(request.messages[1].content), input);
      assert.match(request.messages[0].content, /Do not choose an option or generate action items yet/);
      return completion();
    },
  });
  assert.deepEqual(actual, result);
});

test('decision results reject malformed criteria, duplicate names, unsafe IDs, and invalid allocations', () => {
  const first = result.factors[0];
  const changedFirst = overrides => ({ ...result, factors: [{ ...first, ...overrides }, ...result.factors.slice(1)] });
  const invalid = [null, {}, { ...result, summary: '' }, { ...result, summary: 'x'.repeat(1201) },
    { ...result, factors: result.factors.slice(0, 2) }, { ...result, factors: Array(7).fill(first) },
    { ...result, factors: [null, ...result.factors.slice(1)] },
    changedFirst({ id: result.factors[1].id }), changedFirst({ id: 'Invalid ID' }),
    changedFirst({ id: 'a'.repeat(81) }), changedFirst({ id: 'a--b' }),
    changedFirst({ name: `  ${result.factors[1].name.toUpperCase()}  ` }),
    changedFirst({ name: ' ' }), changedFirst({ name: 'x'.repeat(41) }),
    changedFirst({ description: '' }), changedFirst({ description: 'x'.repeat(141) }),
    changedFirst({ reason: ' ' }), changedFirst({ reason: 'x'.repeat(801) }),
    changedFirst({ weight: 39 }), changedFirst({ weight: 40.5 }), changedFirst({ weight: '40' }),
    changedFirst({ weight: -1 }), changedFirst({ weight: 101 }),
  ];
  for (const value of invalid) assert.throws(() => validateDecisionResult(value), e => e.status === 502);
  assert.deepEqual(validateDecisionResult({ ...result, extra: 'omitted', factors: result.factors.map(f => ({ ...f, color: '#ff0000' })) }), result);
});

test('decision provider failures are classified without leaking provider response text', async () => {
  for (const [upstream, status] of [[429, 429], [401, 503], [403, 503], [400, 502], [500, 502]]) {
    await assert.rejects(generateDecisionPriorities(input, {
      key: 'test', fetchImpl: async () => new Response('private provider diagnostics', { status: upstream }),
    }), e => e.status === status && !e.message.includes('private'));
  }
  for (const name of ['TimeoutError', 'AbortError', 'TypeError']) {
    await assert.rejects(generateDecisionPriorities(input, { key: 'test', fetchImpl: async () => { throw Object.assign(new Error('private'), { name }); } }),
      e => e.status === 504 && !e.message.includes('private') && (name === 'TypeError' || /too long/.test(e.message)));
  }
});

test('decision generation rejects malformed or truncated provider completions', async () => {
  for (const response of [
    () => new Response('not JSON'),
    () => Response.json({ choices: [] }),
    () => Response.json({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(result) } }] }),
    () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'not JSON' } }] }),
    () => completion({ ...result, factors: [] }),
  ]) await assert.rejects(generateDecisionPriorities(input, { key: 'test', fetchImpl: async () => response() }), e => e.status === 502);
});

test('decision HTTP route shares origin, JSON, body-size, and rate protections with the existing route', async t => {
  let generated = 0;
  const server = createApi({
    generate: async () => ({ old: true }),
    generateDecision: async body => { validateDecisionRequest(body); generated++; return result; },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const url = `${base}/api/decision-priorities`;
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8081' }, body: JSON.stringify(input) };
  assert.equal((await fetch(url, { ...options, headers: { ...options.headers, Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await fetch(url)).status, 405);
  assert.equal((await fetch(url, { ...options, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'http://localhost:8081' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8081');
  const response = await fetch(url, options);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), result);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await fetch(url, { ...options, body: '{' })).status, 400);
  assert.equal((await fetch(url, { ...options, body: JSON.stringify({ ...input, dueDate: '2026-02-30' }) })).status, 400);
  assert.equal((await fetch(url, { ...options, body: JSON.stringify({ ...input, description: 'x'.repeat(17000) }) })).status, 413);
  assert.equal(generated, 1);
  assert.deepEqual(await (await fetch(`${base}/api/priorities`, options)).json(), { old: true });
  for (let i = 0; i < 5; i++) assert.equal((await fetch(url, options)).status, 200);
  const limited = await fetch(url, options);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
});

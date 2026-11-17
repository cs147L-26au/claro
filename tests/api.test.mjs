import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePriorities, validateRequest, validateResult } from '../server/priorities.mjs';
import { createApi } from '../server/index.mjs';

const input = { context: 'I run a cafe and value quality above cost.', factors: [
  { id: 'cost', name: 'Cost', description: 'Value', weight: 50 },
  { id: 'quality', name: 'Quality', description: 'Performance', weight: 50 },
] };
const result = { summary: 'Emphasize quality.', factors: [{ id: 'cost', weight: 30, reason: 'Keep spending in check.' }, { id: 'quality', weight: 70, reason: 'Quality matters most to this cafe.' }] };
test('invalid input is rejected before contacting the provider', async () => {
  let called = false;
  await assert.rejects(generatePriorities({ ...input, context: 'short' }, { key: 'test', fetchImpl: () => { called = true; } }), e => e.status === 400);
  assert.equal(called, false);
  assert.throws(() => validateRequest({ ...input, factors: [input.factors[0], input.factors[0]] }));
});
test('missing credentials returns actionable configuration error', async () => {
  await assert.rejects(generatePriorities(input, { key: '' }), e => e.status === 503 && /Groq/.test(e.message));
});
test('provider call uses strict schema and returns validated suggestions', async () => {
  const actual = await generatePriorities(input, { key: 'test-only', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    const request = JSON.parse(options.body);
    assert.equal(request.response_format.json_schema.strict, true);
    assert.equal(request.model, 'openai/gpt-oss-20b');
    assert.equal(request.messages.length, 2);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] });
  } });
  assert.deepEqual(actual, result);
});
test('rate limits and provider authorization errors do not leak upstream responses', async () => {
  for (const [upstream, status] of [[429, 429], [401, 503], [500, 502]]) {
    await assert.rejects(generatePriorities(input, { key: 'test', fetchImpl: async () => new Response('secret upstream diagnostics', { status: upstream }) }), e => e.status === status && !e.message.includes('secret'));
  }
});
test('malformed, truncated, duplicate, unknown, and non-totaling suggestions are rejected', async () => {
  for (const factors of [[], [result.factors[0], result.factors[0]], [{ ...result.factors[0], id: 'unknown' }, result.factors[1]], [{ ...result.factors[0], weight: 10 }, result.factors[1]], [{ ...result.factors[0], weight: -30 }, { ...result.factors[1], weight: 130 }]]) {
    assert.throws(() => validateResult({ ...result, factors }, input.factors));
  }
  for (const choice of [{ finish_reason: 'length', message: { content: JSON.stringify(result) } }, { finish_reason: 'stop', message: { content: 'not JSON' } }]) {
    await assert.rejects(generatePriorities(input, { key: 'test', fetchImpl: async () => Response.json({ choices: [choice] }) }), e => e.status === 502);
  }
});
test('HTTP API accepts JSON, rejects invalid origins, and limits repeated requests', async t => {
  const server = createApi({ generate: async body => { validateRequest(body); return result; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/priorities`;
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) };
  assert.equal((await fetch(url, { ...options, headers: { ...options.headers, Origin: 'https://untrusted.example' } })).status, 403);
  const response = await fetch(url, options); assert.equal(response.status, 200); assert.deepEqual(await response.json(), result);
  assert.equal((await fetch(url, { ...options, body: '{' })).status, 400);
  for (let i = 0; i < 8; i++) await fetch(url, options);
  assert.equal((await fetch(url, options)).status, 429);
});

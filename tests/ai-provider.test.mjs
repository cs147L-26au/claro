import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiStatus, generateStructuredResult, resolveAiProvider } from '../server/ai-provider.mjs';
import { generatePriorities } from '../server/priorities.mjs';
import { generateDecisionPriorities } from '../server/decision-priorities.mjs';
import { createApi } from '../server/index.mjs';

const universalInput = { context: 'Our cafe needs high quality coffee within a limited budget.', factors: [
  { id: 'cost', name: 'Cost', description: 'Total expenses', weight: 50 },
  { id: 'quality', name: 'Quality', description: 'Taste and consistency', weight: 50 },
] };
const universalResult = { summary: 'Keep quality and cost in balance.', factors: [
  { id: 'cost', weight: 40, reason: 'Keep spending within your budget.' },
  { id: 'quality', weight: 60, reason: 'Consistent coffee matters to customers.' },
] };
const decisionInput = { title: 'Choose a coffee supplier', description: 'We need weekly coffee deliveries on a limited budget.', dueDate: '' };
const decisionResult = { summary: 'Prioritize dependable service and cost. Supplier quotes are not yet available.', factors: [
  { id: 'cost', name: 'Cost', description: 'Total expenses', weight: 40, reason: 'The budget is limited.' },
  { id: 'quality', name: 'Quality', description: 'Taste and consistency', weight: 35, reason: 'Customers expect consistent coffee.' },
  { id: 'reliability', name: 'Reliability', description: 'Dependable weekly delivery', weight: 25, reason: 'Stock must arrive weekly.' },
] };
const structuredRequest = { schemaName: 'cancellation_check',
  schema: { type: 'object', properties: {}, additionalProperties: false, required: [] }, messages: [], maxTokens: 10 };
const providerOptions = { provider: 'openai', key: 'test-only' };
const isCanceled = error => error.status === 499 && /canceled/.test(error.message);

test('runtime selection prefers OpenAI, falls back to Groq only when no OpenAI key is configured', () => {
  const env = { OPENAI_API_KEY: 'openai-test-only', GROQ_API_KEY: 'groq-test-only', GROQ_MODEL: 'groq-custom' };
  const openai = resolveAiProvider({}, env);
  assert.equal(openai.id, 'openai');
  assert.equal(openai.model, 'gpt-4.1-mini');
  assert.equal(openai.key, 'openai-test-only');
  assert.equal(openai.endpoint, 'https://api.openai.com/v1/chat/completions');
  const groq = resolveAiProvider({}, { ...env, OPENAI_API_KEY: '  ' });
  assert.equal(groq.id, 'groq');
  assert.equal(groq.model, 'groq-custom');
  assert.equal(groq.key, 'groq-test-only');
  assert.equal(resolveAiProvider({}, { ...env, OPENAI_MODEL: 'openai-custom' }).model, 'openai-custom');
  assert.equal(resolveAiProvider({ key: 'injected-test-only' }, env).id, 'groq');
  assert.equal(resolveAiProvider({ provider: 'groq' }, env).id, 'groq');
  assert.equal(resolveAiProvider({ provider: 'openai', key: 'injected-test-only', model: 'override' }, env).model, 'override');
  assert.throws(() => resolveAiProvider({ provider: 'unknown' }, env), e => e.status === 503);
});

test('health status identifies the active provider and model without exposing credentials', () => {
  assert.deepEqual(aiStatus({ OPENAI_API_KEY: 'test-private', GROQ_API_KEY: 'another-private' }), {
    configured: true, provider: 'OpenAI', model: 'gpt-4.1-mini',
  });
  assert.deepEqual(aiStatus({ GROQ_API_KEY: 'test-private' }), {
    configured: true, provider: 'Groq', model: 'openai/gpt-oss-20b',
  });
  assert.deepEqual(aiStatus({}), { configured: false, provider: null, model: null });
});

test('both priority endpoints support OpenAI strict JSON requests and their own result validators', async () => {
  for (const [generate, input, result, schemaName] of [
    [generatePriorities, universalInput, universalResult, 'claro_priorities'],
    [generateDecisionPriorities, decisionInput, decisionResult, 'claro_decision_priorities'],
  ]) {
    const actual = await generate(input, { provider: 'openai', key: 'test-only', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer test-only');
      const request = JSON.parse(options.body);
      assert.equal(request.model, 'gpt-4.1-mini');
      assert.equal(request.response_format.type, 'json_schema');
      assert.equal(request.response_format.json_schema.name, schemaName);
      assert.equal(request.response_format.json_schema.strict, true);
      assert.deepEqual(JSON.parse(request.messages[1].content), input);
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] });
    } });
    assert.deepEqual(actual, result);
    await assert.rejects(generate(input, { provider: 'openai', key: 'test-only', fetchImpl: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ summary: 'Invalid', factors: [] }) } }] }) }), e => e.status === 502);
  }
});

test('OpenAI errors are sanitized and never automatically send the same data to another provider', async () => {
  for (const [upstream, expected] of [[401, 503], [403, 503], [429, 429], [500, 502]]) {
    let calls = 0;
    await assert.rejects(generateDecisionPriorities(decisionInput, { provider: 'openai', key: 'test-only', fetchImpl: async url => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/chat/completions');
      return new Response('sensitive upstream response', { status: upstream });
    } }), e => e.status === expected && !e.message.includes('sensitive') && (upstream === 500 || e.message.includes('OpenAI')));
    assert.equal(calls, 1);
  }
  await assert.rejects(generateDecisionPriorities(decisionInput, { provider: 'openai', key: '', fetchImpl: async () => assert.fail('Missing keys must not call the provider') }), e => e.status === 503 && e.message.includes('OPENAI_API_KEY'));
  await assert.rejects(generateDecisionPriorities(decisionInput, { provider: 'openai', key: 'test-only', fetchImpl: async () => { throw new TypeError('private diagnostics'); } }), e => e.status === 504 && e.message.includes('OpenAI') && !e.message.includes('private'));
});

test('already canceled requests never contact the provider', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(generateStructuredResult(structuredRequest, {
    ...providerOptions, signal: controller.signal,
    fetchImpl: async () => assert.fail('Canceled requests must not call the provider'),
  }), isCanceled);
});

test('caller cancellation reaches an in-flight provider request', async () => {
  const controller = new AbortController();
  await assert.rejects(generateStructuredResult(structuredRequest, {
    ...providerOptions, signal: controller.signal,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      controller.abort();
    }),
  }), isCanceled);
});

test('caller cancellation during response-body reading is not an unreadable-response error', async () => {
  const controller = new AbortController();
  await assert.rejects(generateStructuredResult(structuredRequest, {
    ...providerOptions, signal: controller.signal,
    fetchImpl: async () => ({ status: 200, ok: true, json: async () => {
      controller.abort();
      throw new DOMException('private cancellation details', 'AbortError');
    } }),
  }), error => isCanceled(error) && !error.message.includes('private'));
});

test('timeout during response-body reading remains a sanitized timeout error', async () => {
  await assert.rejects(generateStructuredResult(structuredRequest, {
    ...providerOptions,
    fetchImpl: async () => ({ status: 200, ok: true, json: async () => {
      throw new DOMException('private timeout details', 'TimeoutError');
    } }),
  }), error => error.status === 504 && /too long/.test(error.message) && !error.message.includes('private'));
});

test('HTTP health reports the selected provider using only public status fields', async t => {
  const server = createApi();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, ...aiStatus() });
});

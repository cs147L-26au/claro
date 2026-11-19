import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createPriorityService } from '../src/lib/priorities/service.ts';
import { defaultFactors } from '../src/lib/model.ts';

function fixture(count = 501) {
  const requests = [];
  let signedIn = true;
  let failedPage = false;
  const tasks = Array.from({ length: count }, (_, i) => ({ id: String(i).padStart(4, '0'), user_id: 'alice', title: `Decision ${i}`, done: i === 0 }));
  const universal = defaultFactors.map(({ id, ...factor }, sort_order) => ({ ...factor, factor: id, sort_order, user_id: 'alice', weight: id === 'quality' ? 100 : 0 }));
  const rows = tasks.flatMap(task => defaultFactors.map(({ id, ...f }, sort_order) => ({
    ...f, factor: id, sort_order, task_id: task.id, user_id: 'alice', inherited: task.id !== '0000',
    excluded: task.id === '0000' && id === 'quality',
    weight: task.id === '0000' ? (id === 'cost' ? 100 : 0) : f.weight,
  })));
  const client = createClient('https://example.supabase.co', 'test-only-key', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
      const url = new URL(String(input)); requests.push({ url, method: init.method });
      const start = Number(url.searchParams.get('offset') || 0);
      const source = url.pathname.endsWith('/tasks') ? tasks : url.pathname.endsWith('/task_priorities') ? rows : universal;
      if (failedPage && start === 500) return new Response(JSON.stringify({ message: 'Could not read next page' }), { status: 503 });
      return new Response(JSON.stringify(source.slice(start, start + 500)), { headers: { 'content-type': 'application/json' } });
    } },
  });
  client.auth.getUser = async () => ({ data: { user: signedIn ? { id: 'alice' } : null }, error: null });
  return { service: createPriorityService(client), requests, signOut: () => { signedIn = false; }, fail: () => { failedPage = true; } };
}

test('saved task gallery pages account-scoped reads, includes completed tasks and uses the shared effective merge', async () => {
  const f = fixture();
  const result = await f.service.getSavedTaskPriorities();
  assert.equal(result.length, 501);
  const custom = result.find(item => item.task.id === '0000');
  assert.equal(custom.task.done, true); assert.equal(custom.mode, 'custom');
  assert.equal(custom.effective.find(factor => factor.id === 'cost').weight, 100);
  assert.equal(custom.effective.some(factor => factor.id === 'quality'), false);
  const following = result.find(item => item.task.id === '0001');
  assert.equal(following.mode, 'universal');
  assert.equal(following.effective.find(factor => factor.id === 'quality').weight, 100);
  assert.ok(result.every(item => item.effective.reduce((sum, factor) => sum + factor.weight, 0) === 100));
  assert.equal(f.requests.length, 9); // 2 task pages + 6 priority pages + 1 universal read.
  assert.ok(f.requests.every(request => request.method === 'GET' && request.url.searchParams.get('user_id') === 'eq.alice'));
});

test('saved task gallery returns an empty account without inventing tasks', async () => {
  assert.deepEqual(await fixture(0).service.getSavedTaskPriorities(), []);
});

test('saved task gallery rejects signed-out access and does not silently omit failed pages', async () => {
  const signedOut = fixture(); signedOut.signOut();
  await assert.rejects(signedOut.service.getSavedTaskPriorities(), /Sign in/);
  assert.equal(signedOut.requests.length, 0);
  const failed = fixture(); failed.fail();
  await assert.rejects(failed.service.getSavedTaskPriorities(), { message: 'Could not read next page' });
});

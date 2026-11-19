import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createAccountDataService, taskToRow, taskFromRow, decisionToRow, decisionFromRow } from '../src/lib/account-data.ts';
import { defaultFactors, initialData } from '../src/lib/model.ts';

const task = { id: 'task', title: 'Get quotes', notes: 'Two suppliers', dueDate: '2026-12-01', done: false };
const decision = { id: 'decision', title: 'Supplier', category: 'Business', choice: 'A', notes: '', alternatives: ['B'],
  reviewDate: '', status: 'active', createdAt: '2026-11-18T10:00:00Z', updatedAt: '2026-11-18T10:00:00Z', priorities: defaultFactors };
test('task and decision contracts round-trip dates, completion, and priority snapshots', () => {
  assert.deepEqual(taskFromRow({ ...taskToRow(task), user_id: 'alice' }), task);
  assert.deepEqual(decisionFromRow({ ...decisionToRow(decision), user_id: 'alice' }), decision);
  assert.equal(taskToRow({ ...task, dueDate: '' }).due_date, null);
  assert.equal(decisionToRow(decision).review_date, null);
});
function fixture() {
  const requests = [];
  let actor = 'alice';
  let taskCount = 1;
  const client = createClient('https://example.supabase.co', 'test-only-key', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
      let body = null;
      if (url.pathname.endsWith('/tasks')) {
        const offset = Number(url.searchParams.get('offset') || 0);
        body = Array.from({ length: taskCount }, (_, i) => ({ ...taskToRow(task), id: `task-${i}`, user_id: actor })).slice(offset, offset + 500);
      }
      if (url.pathname.endsWith('/decisions')) body = [{ ...decisionToRow(decision), user_id: actor }];
      if (url.pathname.endsWith('/universal_priorities')) body = defaultFactors.map(({ id, ...f }, i) => ({ ...f, factor: id, user_id: actor, sort_order: i }));
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    } },
  });
  client.auth.getUser = async () => ({ data: { user: { id: actor } }, error: null });
  return { service: createAccountDataService(client, 'alice'), requests, switchAccount: () => { actor = 'bob'; }, manyTasks: () => { taskCount = 501; } };
}
test('loads all account data from Supabase with ownership filters and pagination', async () => {
  const f = fixture(); f.manyTasks();
  const data = await f.service.load();
  assert.equal(data.tasks.length, 501); assert.equal(data.decisions.length, 1);
  assert.deepEqual(data.factors, defaultFactors);
  assert.ok(f.requests.every(r => r.url.searchParams.get('user_id') === 'eq.alice'));
});
test('writes only changed rows, binds the account server-side, and imports without overwriting', async () => {
  const f = fixture();
  const original = { ...initialData, tasks: [task], decisions: [decision] };
  await f.service.saveChanges(original, { ...original, tasks: [{ ...task, done: true }] });
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].body.p_tasks[0].done, true);
  assert.deepEqual(f.requests[0].body.p_decisions, []);
  assert.equal(f.requests[0].body.p_expected_user_id, 'alice');
  await f.service.saveChanges(original, original);
  assert.equal(f.requests.length, 1);
  await f.service.importRecords(original);
  assert.equal(f.requests[1].body.p_import_only, true);
  assert.equal(f.requests[1].body.p_decisions[0].priorities.length, 5);
});
test('old-account calls fail before network writes; deletions and priority changes are explicit', async () => {
  const f = fixture();
  const original = { ...initialData, tasks: [task] };
  await assert.rejects(f.service.saveChanges(original, { ...original, tasks: [] }), /completion or archive/);
  await assert.rejects(f.service.saveChanges(original, { ...original, factors: [] }), /Priorities editor/);
  f.switchAccount();
  await assert.rejects(f.service.load(), /account changed/);
  await assert.rejects(f.service.saveChanges(initialData, original), /account changed/);
  assert.equal(f.requests.length, 0);
});

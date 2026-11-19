import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createPriorityService } from '../src/lib/priorities/service.ts';
import { defaultFactors, normalize } from '../src/lib/model.ts';

function fixture() {
  const requests = [];
  let taskVisible = true;
  let signedIn = true;
  let failSave = false;
  let overrides = [];
  let universal = defaultFactors.map(({ id, ...factor }, i) => ({ ...factor, factor: id, sort_order: i, user_id: 'alice' }));
  let options = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, task_id: 'task', name: id, ratings: { cost: 100 - 20 * i, quality: 20 * i } }));
  const client = createClient('https://example.supabase.co', 'test-only-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined });
      let body;
      let status = 200;
      if (url.pathname.endsWith('/tasks')) body = taskVisible ? { id: 'task', user_id: 'alice', title: 'Supplier' } : null;
      else if (url.pathname.endsWith('/universal_priorities')) body = universal;
      else if (url.pathname.endsWith('/task_priorities')) body = overrides;
      else if (url.pathname.endsWith('/rpc/create_task_with_priorities')) body = JSON.parse(init.body).p_task.id;
      else if (url.pathname.endsWith('/options')) {
        const offset = Number(url.searchParams.get('offset') || 0);
        const limit = Number(url.searchParams.get('limit') || options.length);
        body = options.slice(offset, offset + limit);
      } else if (url.pathname.endsWith('/rpc/save_priorities')) {
        const payload = JSON.parse(init.body);
        if (failSave) { status = 400; body = { message: 'Database rejected save' }; }
        else {
          const rows = payload.p_factors.map((f, sort_order) => ({ ...f, user_id: 'alice', sort_order }));
          if (payload.p_task_id) overrides = rows.map(f => ({ ...f, task_id: 'task' })); else universal = rows;
          body = null;
        }
      } else throw new Error(`Unexpected request ${url}`);
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    } },
  });
  // Isolate server-verified identity from network transport tests (RLS is exercised in PostgreSQL).
  client.auth.getUser = async () => ({ data: { user: signedIn ? { id: 'alice' } : null }, error: null });
  return { service: createPriorityService(client), requests,
    setTaskVisible: value => { taskVisible = value; }, setSignedIn: value => { signedIn = value; },
    setFailSave: value => { failSave = value; }, setOptions: value => { options = value; },
    seedStartingCopy: () => { overrides = universal.map(f => ({ ...f, task_id: 'task', excluded: false, inherited: true })); } };
}

test('stored starting copies follow live universal weights until explicitly customized', async () => {
  const f = fixture(); f.seedStartingCopy();
  const original = await f.service.taskSnapshot('task');
  assert.equal(original.mode, 'universal'); assert.deepEqual(original.startingCopy, defaultFactors);
  const changed = defaultFactors.map(row => ({ ...row, weight: row.id === 'quality' ? 100 : 0 }));
  await f.service.saveUniversalPriorities(changed);
  assert.deepEqual(await f.service.getEffectivePriorities('task'), changed);
  assert.equal((await f.service.rankOptions('task'))[0].id, 'd');
  const custom = defaultFactors.map(row => ({ ...row, weight: row.id === 'cost' ? 100 : 0 }));
  await f.service.saveTaskPriorities('task', custom);
  assert.equal((await f.service.taskSnapshot('task')).mode, 'custom');
  assert.equal((await f.service.rankOptions('task'))[0].id, 'a');
  await f.service.revertTaskToUniversal('task');
  assert.equal((await f.service.rankOptions('task'))[0].id, 'd');
});

test('new-task API commits task and optional factors in one request bound to the originating account', async () => {
  const f = fixture();
  const task = { id: 'new', title: 'Choose supplier', notes: 'Organic beans', dueDate: '', done: false };
  assert.equal(await f.service.createTaskWithPriorities(task, defaultFactors, 'alice'), task.id);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].body.p_expected_user_id, 'alice');
  assert.equal(f.requests[0].body.p_factors.length, 5);
  assert.deepEqual(f.requests[0].body.p_task, { id: 'new', title: task.title, notes: task.notes, due_date: null });
  await f.service.createTaskWithPriorities({ ...task, id: 'universal' });
  assert.equal('p_factors' in f.requests[1].body, false);
  await assert.rejects(f.service.createTaskWithPriorities(task, defaultFactors, 'bob'), /account changed/);
  assert.equal(f.requests.length, 2);
});

test('Supabase client reads account-scoped priorities and task-owned options; ranking is read-only', async () => {
  const f = fixture();
  assert.deepEqual(await f.service.getUniversalPriorities(), defaultFactors);
  assert.deepEqual(await f.service.getEffectivePriorities('task'), defaultFactors);
  const ranks = await f.service.rankOptions('task');
  assert.equal(ranks.length, 3); assert.equal(ranks[0].is_recommended, true);
  assert.ok(f.requests.every(r => r.method === 'GET'));
  assert.ok(f.requests.filter(r => /tasks$|priorities$/.test(r.url.pathname)).every(r => r.url.searchParams.get('user_id') === 'eq.alice'));
  assert.ok(f.requests.filter(r => /options$/.test(r.url.pathname)).every(r => r.url.searchParams.get('task_id') === 'eq.task'));
});
test('save and revert use one atomic RPC each, with removal tombstones and stable factor keys', async () => {
  const f = fixture();
  const factors = normalize(defaultFactors.slice(1).map(row => row.id === 'quality' ? { ...row, name: 'Craftsmanship' } : row));
  await f.service.saveTaskPriorities('task', factors);
  const write = f.requests.find(r => r.method === 'POST');
  assert.equal(write.body.p_task_id, 'task');
  assert.ok(write.body.p_factors.some(row => row.factor === 'cost' && row.excluded && row.weight === 0));
  assert.equal(write.body.p_factors.find(row => row.factor === 'quality').name, 'Craftsmanship');
  const snapshot = await f.service.taskSnapshot('task');
  assert.equal(snapshot.mode, 'custom'); assert.deepEqual(snapshot.effective, factors);
  await f.service.revertTaskToUniversal('task');
  assert.equal((await f.service.taskSnapshot('task')).mode, 'universal');
  assert.deepEqual(await f.service.getEffectivePriorities('task'), defaultFactors);
  assert.equal(f.requests.filter(r => r.method === 'POST').length, 2);
});
test('auth, task ownership, invalid totals, and database errors are surfaced without false success', async () => {
  const f = fixture();
  f.setSignedIn(false);
  await assert.rejects(f.service.getUniversalPriorities(), /Sign in/);
  assert.equal(f.requests.length, 0);
  f.setSignedIn(true); f.setTaskVisible(false);
  await assert.rejects(f.service.rankOptions('task'), /not available/);
  assert.ok(!f.requests.some(r => /options$/.test(r.url.pathname)));
  await assert.rejects(f.service.saveUniversalPriorities(defaultFactors.slice(1)), /exactly 100/);
  f.setFailSave(true);
  await assert.rejects(f.service.saveUniversalPriorities(defaultFactors), { message: 'Database rejected save' });
});
test('ranking evaluates every candidate beyond the first Supabase page', async () => {
  const f = fixture();
  f.setOptions(Array.from({ length: 501 }, (_, i) => ({ id: String(i).padStart(3, '0'), task_id: 'task', name: `Choice ${i}`, ratings: { cost: i === 500 ? 100 : 0 } })));
  const ranks = await f.service.rankOptions('task');
  assert.equal(ranks[0].id, '500');
  assert.equal(f.requests.filter(r => /options$/.test(r.url.pathname)).length, 2);
});

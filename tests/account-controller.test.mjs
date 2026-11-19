import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountController } from '../src/lib/account-controller.ts';
import { initialData } from '../src/lib/model.ts';

const task = id => ({ id, title: id, notes: '', dueDate: '', done: false });
test('remote writes and refreshes serialize; rapid saves retain both tasks', async () => {
  let server = structuredClone(initialData), screen;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let writes = 0;
  const controller = createAccountController({
    load: async () => structuredClone(server),
    saveChanges: async (_before, after) => { if (++writes === 1) await gate; server = structuredClone(after); },
    importRecords: async () => {},
  }, data => { screen = data; }, () => {});
  await controller.refresh();
  const a = controller.save(data => ({ ...data, tasks: [...data.tasks, task('a')] }));
  const refresh = controller.refresh();
  const b = controller.save(data => ({ ...data, tasks: [...data.tasks, task('b')] }));
  assert.equal(screen.tasks.length, 0);
  release(); await Promise.all([a, b, refresh]);
  assert.deepEqual(screen.tasks.map(t => t.id), ['a', 'b']);
  assert.deepEqual(server, screen);
});
test('failed save keeps prior state, and a later save can recover', async () => {
  let screen, fail = true, server = structuredClone(initialData);
  const controller = createAccountController({ load: async () => server,
    saveChanges: async (_before, after) => { if (fail) throw new Error('Network failed'); server = after; }, importRecords: async () => {} },
  data => { screen = data; }, () => {});
  await controller.refresh();
  await assert.rejects(controller.save(data => ({ ...data, tasks: [task('a')] })), /Network/);
  assert.equal(screen.tasks.length, 0);
  fail = false;
  await controller.save(data => ({ ...data, tasks: [task('b')] }));
  assert.equal(screen.tasks[0].id, 'b');
});
test('a committed save remains successful when its follow-up refresh fails', async () => {
  let reads = 0, screen, warning;
  const controller = createAccountController({
    load: async () => { if (++reads > 1) throw new Error('Refresh failed'); return initialData; },
    saveChanges: async () => {}, importRecords: async () => {},
  }, data => { screen = data; }, e => { warning = e; });
  await controller.refresh();
  await controller.save(data => ({ ...data, tasks: [task('saved')] }));
  assert.equal(screen.tasks[0].id, 'saved'); assert.match(warning.message, /Refresh failed/);
});
test('sign-out invalidates late reads and prevents queued writes from the old account', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let published = 0, writes = 0;
  const controller = createAccountController({ load: async () => { await gate; return initialData; },
    saveChanges: async () => { writes++; }, importRecords: async () => {} }, () => { published++; }, () => {});
  const refresh = controller.refresh();
  const save = controller.save(data => data);
  controller.dispose(); release();
  const results = await Promise.allSettled([refresh, save]);
  assert.ok(results.every(r => r.status === 'rejected'));
  assert.equal(writes, 0); assert.equal(published, 0);
});

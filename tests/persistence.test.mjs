import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommitQueue } from '../src/lib/persistence.ts';

test('concurrent decision saves retain both records after delayed persistence', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let disk = []; let screen = []; let writes = 0;
  const queue = createCommitQueue([], async next => {
    if (++writes === 1) await gate;
    disk = JSON.parse(JSON.stringify(next));
  }, next => { screen = next; });
  const first = queue.commit(records => [...records, { id: 'first' }]);
  const second = queue.commit(records => [...records, { id: 'second' }]);
  assert.deepEqual(screen, []);
  release(); await Promise.all([first, second]);
  assert.deepEqual(disk.map(d => d.id), ['first', 'second']);
  assert.deepEqual(screen, disk);
});
test('storage failure does not show a false success and a later save can recover', async () => {
  let disk = ['original']; let screen = disk; let fail = true;
  const queue = createCommitQueue(disk, async next => {
    if (fail) throw new Error('Storage full');
    disk = next;
  }, next => { screen = next; });
  await assert.rejects(queue.commit(records => [...records, 'failed']));
  assert.deepEqual(screen, ['original']); assert.deepEqual(disk, ['original']);
  fail = false;
  await queue.commit(records => [...records, 'saved']);
  assert.deepEqual(screen, ['original', 'saved']); assert.deepEqual(disk, screen);
});

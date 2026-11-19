import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { defaultFactors } from '../src/lib/model.ts';

const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
test('account migration persists tasks and decisions with RLS, snapshots, atomicity and safe imports', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;`);
    const setup = await readFile(new URL('../supabase/setup.sql', import.meta.url), 'utf8');
    for (const name of ['202611180001_setting_priorities.sql', '202611180002_account_data.sql', '202611190001_task_priority_defaults.sql']) {
      const migration = await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
      assert.ok(setup.includes(migration.replace(/^begin;\s*/, '').replace(/\s*commit;\s*$/, '')), 'Regenerate supabase/setup.sql after migration edits');
    }
    await db.exec(setup);
    await db.exec(`insert into auth.users values ('${alice}'), ('${bob}'); set role authenticated;`);
    let actor = alice;
    const login = async id => { actor = id; await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]); };
    const save = (tasks = [], decisions = [], importing = false, expected = actor) => db.query(
      'select save_app_records($1::jsonb, $2::jsonb, $3, $4::uuid)', [JSON.stringify(tasks), JSON.stringify(decisions), importing, expected]);
    const task = { id: 'task-a', title: 'Supplier', notes: 'Get quotes', due_date: '2026-12-01', done: false };
    const decision = { id: 'decision-a', title: 'Coffee', category: 'Suppliers', choice: 'Roaster A', notes: 'Quality',
      alternatives: ['Roaster B'], review_date: '2027-01-01', status: 'active', created_at: '2026-11-18T12:00:00Z',
      updated_at: '2026-11-18T12:00:00Z', priorities: defaultFactors };
    await login(alice);
    await save([task], [decision]);
    assert.equal((await db.query('select * from tasks')).rows[0].notes, 'Get quotes');
    assert.equal((await db.query('select * from decisions')).rows[0].choice, 'Roaster A');
    // New cloud tasks can immediately have priorities and options.
    await db.query('select save_priorities($1::jsonb, $2, $3::uuid)', [JSON.stringify(defaultFactors.map(({ id, ...f }) => ({ ...f, factor: id }))), task.id, alice]);
    assert.equal((await db.query('select * from task_priorities')).rows.length, 5);
    await save([{ ...task, done: true }], [{ ...decision, status: 'archived', priorities: [...defaultFactors].reverse() }]);
    const saved = (await db.query('select * from decisions')).rows[0];
    assert.equal(saved.status, 'archived'); assert.deepEqual(saved.priorities, defaultFactors);
    assert.equal((await db.query('select done from tasks')).rows[0].done, true);
    // Import is repeatable and never overwrites newer cloud data.
    await save([task], [decision], true); await save([task], [decision], true);
    assert.equal((await db.query('select done from tasks')).rows[0].done, true);
    assert.equal((await db.query('select count(*)::integer as count from decisions')).rows[0].count, 1);
    // Failure in the second table rolls back the first table's edit.
    await assert.rejects(save([{ ...task, done: false }], [{ ...decision, id: 'invalid', priorities: [] }]), /check constraint/);
    assert.equal((await db.query('select done from tasks')).rows[0].done, true);
    await assert.rejects(save([{ ...task, due_date: '2026-02-30' }]), /date/);
    await login(bob);
    assert.equal((await db.query('select * from tasks')).rows.length, 0);
    assert.equal((await db.query('select * from decisions')).rows.length, 0);
    await assert.rejects(save([{ ...task, id: 'new-id' }], [], false, alice), /account changed/);
    // A colliding global ID must never be reassigned or overwrite the other account.
    await assert.rejects(save([task], [decision]), /could not be saved/);
    await assert.rejects(save([task], [decision], true), /could not be saved/);
    assert.equal((await db.query('select * from tasks')).rows.length, 0);
    assert.equal((await db.query('select * from decisions')).rows.length, 0);
    await assert.rejects(db.query('insert into decisions(id,user_id,title,choice,priorities) values ($1,$2,$3,$4,$5)',
      ['forged', alice, 'Forged', 'No', JSON.stringify(defaultFactors)]), /row-level security/);
    await login(alice);
    assert.equal((await db.query('select count(*)::integer as count from decisions')).rows[0].count, 1);
    await db.exec('reset role; set role anon;'); await login('');
    await assert.rejects(db.query('select * from decisions'), /permission denied/);
    await assert.rejects(save([], [], false, alice), /permission denied/);
  } finally { await db.close(); }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { defaultFactors } from '../src/lib/model.ts';

const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
const defaults = defaultFactors.map(({ id, ...f }) => ({ ...f, factor: id }));

test('migration executes; account RLS, seed, validation and atomic RPC work in PostgreSQL', async () => {
  const db = new PGlite();
  try {
    // Supabase supplies these auth primitives in production.
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values ('${alice}');
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/202611180001_setting_priorities.sql', import.meta.url), 'utf8'));
    await db.exec(`insert into auth.users values ('${bob}')`);
    assert.deepEqual((await db.query('select user_id, sum(weight)::integer as total, count(*)::integer as count from universal_priorities group by user_id order by user_id')).rows,
      [{ user_id: alice, total: 100, count: 5 }, { user_id: bob, total: 100, count: 5 }]);
    await db.exec(`insert into tasks values ('alice-task', '${alice}', 'Alice task'), ('bob-task', '${bob}', 'Bob task');
      insert into options values ('a', 'alice-task', 'Alice option', '{}'), ('b', 'bob-task', 'Bob option', '{}');
      set role authenticated;`);
    const login = async id => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    const save = (factors, task = null) => db.query('select public.save_priorities($1::jsonb, $2::text)', [JSON.stringify(factors), task]);
    await login(alice);
    assert.equal((await db.query('select * from universal_priorities')).rows.length, 5);
    assert.deepEqual((await db.query('select id from tasks')).rows.map(r => r.id), ['alice-task']);
    assert.deepEqual((await db.query('select id from options')).rows.map(r => r.id), ['a']);
    await assert.rejects(db.query(`insert into tasks values ('stolen', '${bob}', 'Invalid')`), /row-level security/);
    await assert.rejects(db.query(`insert into options values ('stolen', 'bob-task', 'Invalid', '{}')`), /row-level security/);
    await assert.rejects(db.query('update universal_priorities set weight = 99'), /permission denied/);
    await assert.rejects(save(defaults, 'bob-task'), /Task not found/);
    await assert.rejects(save(defaults, 'missing'), /Task not found/);
    await assert.rejects(save(defaults.map((f, i) => ({ ...f, weight: i ? f.weight : 29 }))), /100 whole points/);
    await assert.rejects(save(defaults.map((f, i) => ({ ...f, weight: i === 0 ? 30.5 : i === 1 ? 29.5 : f.weight }))), /100 whole points/);
    // A constraint failure after DELETE must roll the whole transaction back.
    await assert.rejects(save(defaults.map((f, i) => ({ ...f, color: i ? f.color : 'invalid' }))), /check constraint/);
    assert.equal((await db.query('select sum(weight)::integer as total from universal_priorities')).rows[0].total, 100);
    assert.equal((await db.query('select * from universal_priorities')).rows.length, 5);
    const custom = defaults.map(f => ({ ...f, weight: f.factor === 'cost' ? 80 : f.factor === 'quality' ? 20 : 0 }));
    await save(custom, 'alice-task');
    assert.equal((await db.query('select sum(weight)::integer as total from task_priorities')).rows[0].total, 100);
    await login(bob);
    assert.equal((await db.query('select * from task_priorities')).rows.length, 0);
    await assert.rejects(save([], 'alice-task'), /Task not found/);
    await login(alice);
    await save([], 'alice-task');
    assert.equal((await db.query('select * from task_priorities')).rows.length, 0);
    await assert.rejects(save([]), /100 whole points/);
    await save(defaults);
    // Even an unrelated permissive policy cannot bypass the restrictive task guards.
    await db.exec('reset role; create policy unrelated_open_tasks on tasks for all to authenticated using (true) with check (true); set role authenticated;');
    assert.deepEqual((await db.query('select id from tasks')).rows.map(r => r.id), ['alice-task']);
    await db.exec('reset role; set role anon;');
    await login('');
    await assert.rejects(save(defaults), /permission denied/);
    await assert.rejects(db.query('select * from universal_priorities'), /permission denied/);
  } finally { await db.close(); }
});

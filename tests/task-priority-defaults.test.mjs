import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { defaultFactors, normalize } from '../src/lib/model.ts';
import { effectiveFactors } from '../src/lib/priorities/service.ts';

const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
const rows = factors => factors.map(({ id, ...f }) => ({ ...f, factor: id }));
test('task defaults migration preserves overrides, seeds copies, and creates tasks atomically with RLS', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;`);
    for (const name of ['202611180001_setting_priorities.sql', '202611180002_account_data.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    await db.exec(`insert into auth.users values ('${alice}'), ('${bob}');
      insert into tasks(id,user_id,title) values ('old','${alice}','Existing universal task'),('custom','${alice}','Existing custom task');
      set role authenticated;`);
    const login = id => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await login(alice);
    await db.query('select save_priorities($1::jsonb, $2)', [JSON.stringify(rows(defaultFactors)), 'custom']);
    await db.exec('reset role');
    await db.exec(await readFile(new URL('../supabase/migrations/202611190001_task_priority_defaults.sql', import.meta.url), 'utf8'));
    assert.equal((await db.query("select count(*)::int as n from task_priorities where task_id='old' and inherited")).rows[0].n, 5);
    assert.equal((await db.query("select count(*)::int as n from task_priorities where task_id='custom' and not inherited")).rows[0].n, 5);
    await db.exec('set role authenticated'); await login(alice);
    const create = (id, factors = null, expected = alice) => db.query('select create_task_with_priorities($1::jsonb, $2::uuid, $3::jsonb)',
      [JSON.stringify({ id, title: 'Choose supplier', notes: 'Need reliable deliveries' }), expected, factors && JSON.stringify(rows(factors))]);
    await create('new-universal');
    assert.deepEqual((await db.query("select sum(weight)::int as total, bool_and(inherited) as inherited from task_priorities where task_id='new-universal'")).rows[0], { total: 100, inherited: true });
    const custom = normalize(defaultFactors.slice(1));
    await create('new-custom', custom);
    const saved = (await db.query("select * from task_priorities where task_id='new-custom'")).rows;
    assert.ok(saved.every(f => !f.inherited));
    assert.equal(saved.reduce((sum, f) => sum + f.weight, 0), 100);
    assert.ok(saved.find(f => f.factor === 'cost').excluded);
    // Decision-specific AI criteria can replace every universal criterion without
    // losing their names, descriptions, colors, order, or user-adjusted weights.
    const generated = [
      { id: 'storage-fit', name: 'Storage fit', description: 'Fits the cafe’s limited cold storage.', weight: 45, color: '#A8B79B' },
      { id: 'payment-flexibility', name: 'Payment flexibility', description: 'Payment terms support weekly cash flow.', weight: 35, color: '#EEC4A2' },
      { id: 'minimum-order', name: 'Minimum order', description: 'Order sizes match a small cafe’s demand.', weight: 20, color: '#B6D6D1' },
    ];
    await create('generated-priorities', generated);
    const generatedRows = (await db.query("select * from task_priorities where task_id='generated-priorities' order by sort_order")).rows;
    const universalRows = (await db.query('select * from universal_priorities order by sort_order')).rows;
    assert.deepEqual(effectiveFactors(universalRows, generatedRows), generated);
    assert.deepEqual(generatedRows.filter(f => !f.excluded).map(f => ({
      id: f.factor, name: f.name, description: f.description, weight: f.weight, color: f.color,
    })), generated);
    assert.ok(generatedRows.every(f => !f.inherited));
    assert.deepEqual(generatedRows.filter(f => f.excluded).map(f => f.factor).sort(), defaultFactors.map(f => f.id).sort());
    assert.ok(generatedRows.filter(f => f.excluded).every(f => f.weight === 0));
    await assert.rejects(create('invalid', defaultFactors.slice(1)), /100 whole points/);
    assert.equal((await db.query("select count(*)::int as n from tasks where id='invalid'")).rows[0].n, 0);
    await assert.rejects(create('switched', null, bob), /account changed/);
    // A plain task insert from the teammate's flow also receives a universal copy.
    await db.query('insert into tasks(id,user_id,title) values ($1,$2,$3)', ['plain', alice, 'Teammate flow']);
    assert.equal((await db.query("select count(*)::int as n from task_priorities where task_id='plain' and inherited")).rows[0].n, 5);
    await login(bob);
    assert.equal((await db.query('select * from task_priorities')).rows.length, 0);
    await assert.rejects(create('forged'), /account changed/);
    await db.exec('reset role; set role anon;'); await login('');
    await assert.rejects(create('anonymous'), /permission denied/);
  } finally { await db.close(); }
});

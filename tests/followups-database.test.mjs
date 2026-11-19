import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { defaultFactors } from '../src/lib/model.ts';

test('follow-ups persist separately, enforce owner links, and isolate account reads and writes', async () => {
  const db = new PGlite();
  const alice = '00000000-0000-4000-8000-000000000001';
  const bob = '00000000-0000-4000-8000-000000000002';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;`);
    for (const name of ['202611180001_setting_priorities', '202611180002_account_data', '202611190001_task_priority_defaults', '202611190002_post_decision_tasks']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'));
    }
    await db.exec(`insert into auth.users values ('${alice}'), ('${bob}');`);
    for (const [id, user] of [['a', alice], ['b', bob]]) {
      await db.query('insert into decisions(id,user_id,title,choice,priorities) values ($1,$2,$3,$4,$5)', [id, user, 'Supplier', 'Chosen supplier', JSON.stringify(defaultFactors)]);
    }
    await db.exec('set role authenticated');
    const login = id => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await login(alice);
    await db.query("insert into post_decision_tasks(id,user_id,decision_id,title,due_date) values ('step',$1,'a','Contact supplier','2026-12-01')", [alice]);
    assert.equal((await db.query('select * from tasks')).rows.length, 0, 'follow-ups never become decision tasks');
    await db.exec("update post_decision_tasks set done=true where id='step'");
    assert.equal((await db.query('select done from post_decision_tasks')).rows[0].done, true);
    await assert.rejects(db.query("insert into post_decision_tasks(user_id,decision_id,title,due_date) values ($1,'b','Forged link','2026-12-01')", [alice]), /foreign key/);
    await assert.rejects(db.query("insert into post_decision_tasks(user_id,decision_id,title,due_date) values ($1,'b','Forged owner','2026-12-01')", [bob]), /row-level security/);
    await assert.rejects(db.query("insert into post_decision_tasks(user_id,decision_id,title) values ($1,'a','Missing date')", [alice]), /not-null/);
    await login(bob);
    assert.equal((await db.query('select * from post_decision_tasks')).rows.length, 0);
    assert.equal((await db.query("update post_decision_tasks set done=false where id='step' returning id")).rows.length, 0);
    await db.exec('reset role; set role anon'); await login('');
    await assert.rejects(db.query('select * from post_decision_tasks'), /permission denied/);
  } finally { await db.close(); }
});

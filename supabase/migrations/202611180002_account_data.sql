begin;

alter table public.tasks
  add column notes text not null default '',
  add column due_date date,
  add column done boolean not null default false;
alter table public.tasks add constraint claro_task_title check (length(btrim(title)) between 1 and 120);
alter table public.tasks add constraint claro_task_notes check (length(notes) <= 2000);

-- Immutable snapshots preserve the priorities used when the decision was made.
create function public.claro_valid_snapshot(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare item jsonb; total numeric := 0; keys text[] := '{}';
begin
  if value is null or jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) < 1 or jsonb_array_length(value) > 32 then return false; end if;
  for item in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(item) <> 'object' or
      jsonb_typeof(item->'id') is distinct from 'string' or length(btrim(item->>'id')) = 0 or
      item->>'id' = any(keys) or
      jsonb_typeof(item->'name') is distinct from 'string' or length(btrim(item->>'name')) = 0 or
      jsonb_typeof(item->'description') is distinct from 'string' or
      jsonb_typeof(item->'color') is distinct from 'string' or (item->>'color') !~ '^#[0-9a-fA-F]{6}$' or
      jsonb_typeof(item->'weight') is distinct from 'number' then return false; end if;
    if (item->>'weight')::numeric not between 0 and 100 or
      (item->>'weight')::numeric <> trunc((item->>'weight')::numeric) then return false; end if;
    total := total + (item->>'weight')::numeric;
    keys := array_append(keys, item->>'id');
  end loop;
  return total = 100;
end;
$$;

create table public.decisions (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  category text not null default 'Business',
  choice text not null check (length(btrim(choice)) between 1 and 300),
  notes text not null default '' check (length(notes) <= 3000),
  alternatives text[] not null default '{}',
  review_date date,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  priorities jsonb not null check (public.claro_valid_snapshot(priorities))
);
create index claro_decisions_user_updated_idx on public.decisions(user_id, updated_at desc);
alter table public.decisions enable row level security;
create policy claro_decisions_owner on public.decisions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy claro_decisions_guard on public.decisions as restrictive for all to public
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.decisions from anon;
grant select, insert, update, delete on public.decisions to authenticated;

-- One request commits changed records only; unrelated records are never replaced/deleted.
-- SECURITY INVOKER keeps RLS in force, even for IDs that collide with another account.
create function public.save_app_records(p_tasks jsonb default '[]', p_decisions jsonb default '[]', p_import_only boolean default false, p_expected_user_id uuid default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in to save your data.' using errcode = '42501'; end if;
  if p_expected_user_id is distinct from actor then raise exception 'Your account changed. Reopen the screen before saving.' using errcode = '42501'; end if;
  if p_tasks is null or p_decisions is null or jsonb_typeof(p_tasks) <> 'array' or jsonb_typeof(p_decisions) <> 'array' then
    raise exception 'Expected arrays of tasks and decisions.';
  end if;
  insert into public.tasks(id, user_id, title, notes, due_date, done)
    select t.id, actor, t.title, coalesce(t.notes, ''), t.due_date, coalesce(t.done, false)
    from jsonb_to_recordset(p_tasks) as t(id text, title text, notes text, due_date date, done boolean)
  on conflict (id) do update set title = excluded.title, notes = excluded.notes,
    due_date = excluded.due_date, done = excluded.done
  where public.tasks.user_id = actor and not p_import_only;
  if (select count(*) from public.tasks where user_id = actor and id in
    (select item->>'id' from jsonb_array_elements(p_tasks) item)) <> jsonb_array_length(p_tasks) then
    raise exception 'A task could not be saved to this account.' using errcode = '42501';
  end if;
  insert into public.decisions(id, user_id, title, category, choice, notes, alternatives, review_date, status, created_at, updated_at, priorities)
    select d.id, actor, d.title, coalesce(d.category, 'Business'), d.choice, coalesce(d.notes, ''),
      coalesce(d.alternatives, '{}'), d.review_date, coalesce(d.status, 'active'), coalesce(d.created_at, now()),
      coalesce(d.updated_at, now()), d.priorities
    from jsonb_to_recordset(p_decisions) as d(id text, title text, category text, choice text, notes text,
      alternatives text[], review_date date, status text, created_at timestamptz, updated_at timestamptz, priorities jsonb)
  on conflict (id) do update set title = excluded.title, category = excluded.category, choice = excluded.choice,
    notes = excluded.notes, alternatives = excluded.alternatives, review_date = excluded.review_date,
    status = excluded.status, updated_at = now()
  where public.decisions.user_id = actor and not p_import_only;
  if (select count(*) from public.decisions where user_id = actor and id in
    (select item->>'id' from jsonb_array_elements(p_decisions) item)) <> jsonb_array_length(p_decisions) then
    raise exception 'A decision could not be saved to this account.' using errcode = '42501';
  end if;
  -- created_at and priorities are intentionally immutable on updates through this API.
end;
$$;
revoke all on function public.save_app_records(jsonb, jsonb, boolean, uuid) from public, anon;
grant execute on function public.save_app_records(jsonb, jsonb, boolean, uuid) to authenticated;

commit;

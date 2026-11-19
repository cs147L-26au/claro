begin;

-- Integration contracts only. The task/option teams own all creation and generation flows.
-- Text IDs preserve Claro's existing local task IDs and also accept UUID strings.
create table if not exists public.tasks (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null
);
create table if not exists public.options (
  id text primary key default gen_random_uuid()::text,
  task_id text not null references public.tasks(id) on delete cascade,
  name text not null,
  ratings jsonb not null default '{}'::jsonb check (jsonb_typeof(ratings) = 'object')
);
create index if not exists claro_tasks_user_idx on public.tasks(user_id);
create index if not exists claro_options_task_idx on public.options(task_id);

create table public.universal_priorities (
  user_id uuid not null references auth.users(id) on delete cascade,
  factor text not null check (length(factor) between 1 and 80 and factor = btrim(factor)),
  weight integer not null check (weight between 0 and 100),
  sort_order integer not null check (sort_order >= 0),
  name text not null check (length(btrim(name)) between 1 and 40),
  description text not null default '' check (length(description) <= 140),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  primary key (user_id, factor),
  unique (user_id, sort_order)
);
create table public.task_priorities (
  task_id text not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  factor text not null check (length(factor) between 1 and 80 and factor = btrim(factor)),
  weight integer not null check (weight between 0 and 100),
  sort_order integer not null check (sort_order >= 0),
  name text not null check (length(btrim(name)) between 1 and 40),
  description text not null default '' check (length(description) <= 140),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  -- A removal must not silently reappear through universal fallback.
  excluded boolean not null default false check (not excluded or weight = 0),
  primary key (task_id, user_id, factor)
);
create index claro_task_priorities_user_idx on public.task_priorities(user_id);

alter table public.tasks enable row level security;
alter table public.options enable row level security;
alter table public.universal_priorities enable row level security;
alter table public.task_priorities enable row level security;

create policy claro_tasks_owner on public.tasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Restrictive guards also protect against unrelated permissive policies if contracts exist.
create policy claro_tasks_guard on public.tasks as restrictive for all to public
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy claro_options_owner on public.options for all to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid())))
  with check (exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid())));
create policy claro_options_guard on public.options as restrictive for all to public
  using (exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid())))
  with check (exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid())));
create policy claro_universal_owner on public.universal_priorities for select to authenticated
  using (user_id = (select auth.uid()));
create policy claro_task_priorities_owner on public.task_priorities for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid())
  ));

-- Complete sets are replaced atomically through this RPC, never delete-then-insert over HTTP.
-- SECURITY DEFINER is limited to the current authenticated account and owned task.
create function public.save_priorities(p_factors jsonb, p_task_id text default null, p_expected_user_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  active_count integer;
begin
  if actor is null then raise exception 'Sign in to save priorities.' using errcode = '42501'; end if;
  if p_expected_user_id is not null and p_expected_user_id <> actor then
    raise exception 'Your account changed. Reopen the screen before saving.' using errcode = '42501';
  end if;
  -- Serialize saves/reverts for the account, including the first save (no rows yet).
  perform 1 from auth.users where id = actor for update;
  if p_task_id is not null and not exists (
    select 1 from public.tasks where id = p_task_id and user_id = actor
  ) then raise exception 'Task not found in your account.' using errcode = '42501'; end if;
  if p_factors is null or jsonb_typeof(p_factors) <> 'array' then
    raise exception 'Expected a priority array.';
  end if;
  -- Empty task overrides mean follow universal. Universal can never be empty.
  if p_task_id is not null and jsonb_array_length(p_factors) = 0 then
    delete from public.task_priorities where task_id = p_task_id and user_id = actor;
    return;
  end if;
  select count(*) into active_count from jsonb_array_elements(p_factors) f
    where not coalesce((f->>'excluded')::boolean, false);
  if active_count < 2 or active_count > 8 or
    (select sum((f->>'weight')::numeric) from jsonb_array_elements(p_factors) f) is distinct from 100::numeric or
    exists (select 1 from jsonb_array_elements(p_factors) f where
      jsonb_typeof(f->'weight') is distinct from 'number' or
      (f->>'weight')::numeric <> trunc((f->>'weight')::numeric) or
      (f->>'weight')::numeric not between 0 and 100 or
      (coalesce((f->>'excluded')::boolean, false) and ((f->>'weight')::numeric <> 0 or p_task_id is null))) or
    (select count(distinct f->>'factor') from jsonb_array_elements(p_factors) f) <> jsonb_array_length(p_factors) or
    (select count(distinct lower(btrim(f->>'name'))) from jsonb_array_elements(p_factors) f
      where not coalesce((f->>'excluded')::boolean, false)) <> active_count then
    raise exception 'Use 2–8 unique factors with exactly 100 whole points.';
  end if;
  if p_task_id is null then
    delete from public.universal_priorities where user_id = actor;
    insert into public.universal_priorities(user_id, factor, weight, sort_order, name, description, color)
      select actor, f->>'factor', (f->>'weight')::integer, ordinality::integer - 1,
        btrim(f->>'name'), coalesce(f->>'description', ''), f->>'color'
      from jsonb_array_elements(p_factors) with ordinality as rows(f, ordinality);
  else
    delete from public.task_priorities where task_id = p_task_id and user_id = actor;
    insert into public.task_priorities(task_id, user_id, factor, weight, sort_order, name, description, color, excluded)
      select p_task_id, actor, f->>'factor', (f->>'weight')::integer, ordinality::integer - 1,
        btrim(f->>'name'), coalesce(f->>'description', ''), f->>'color', coalesce((f->>'excluded')::boolean, false)
      from jsonb_array_elements(p_factors) with ordinality as rows(f, ordinality);
  end if;
end;
$$;
revoke all on function public.save_priorities(jsonb, text, uuid) from public, anon;
grant execute on function public.save_priorities(jsonb, text, uuid) to authenticated;
revoke all on public.universal_priorities, public.task_priorities from anon, authenticated;
grant select on public.universal_priorities, public.task_priorities to authenticated;
-- The task/option teams can populate their own contracts; this feature only reads them.
grant select, insert, update, delete on public.tasks, public.options to authenticated;

create function public.seed_claro_priorities() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.universal_priorities(user_id, factor, weight, sort_order, name, description, color) values
    (new.id, 'cost', 30, 0, 'Cost', 'Total cost and long-term value', '#A8B79B'),
    (new.id, 'quality', 30, 1, 'Quality', 'Product or service performance', '#CBD8B4'),
    (new.id, 'delivery', 10, 2, 'Delivery', 'Speed and consistency of delivery', '#EEC4A2'),
    (new.id, 'reliability', 20, 3, 'Reliability', 'Dependability and risk of disruption', '#D3C4DF'),
    (new.id, 'sustainability', 10, 4, 'Sustainability', 'Environmental and ethical impact', '#B6D6D1');
  return new;
end;
$$;
revoke all on function public.seed_claro_priorities() from public, anon, authenticated;
create trigger claro_seed_priorities after insert on auth.users
  for each row execute function public.seed_claro_priorities();

-- Existing accounts receive defaults only if they have no priorities.
insert into public.universal_priorities(user_id, factor, weight, sort_order, name, description, color)
select u.id, d.* from auth.users u cross join (values
  ('cost', 30, 0, 'Cost', 'Total cost and long-term value', '#A8B79B'),
  ('quality', 30, 1, 'Quality', 'Product or service performance', '#CBD8B4'),
  ('delivery', 10, 2, 'Delivery', 'Speed and consistency of delivery', '#EEC4A2'),
  ('reliability', 20, 3, 'Reliability', 'Dependability and risk of disruption', '#D3C4DF'),
  ('sustainability', 10, 4, 'Sustainability', 'Environmental and ethical impact', '#B6D6D1')
) d(factor, weight, sort_order, name, description, color)
where not exists (select 1 from public.universal_priorities p where p.user_id = u.id);

commit;

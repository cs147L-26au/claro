begin;

-- Preserve a starting copy without freezing a task that still follows universal priorities.
-- Existing task rows remain explicit overrides.
alter table public.task_priorities add column inherited boolean not null default false;

create function public.seed_claro_task_priorities() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.task_priorities(task_id, user_id, factor, weight, sort_order, name, description, color, inherited)
    select new.id, new.user_id, factor, weight, sort_order, name, description, color, true
    from public.universal_priorities where user_id = new.user_id;
  return new;
end;
$$;
revoke all on function public.seed_claro_task_priorities() from public, anon, authenticated;
create trigger claro_seed_task_priorities after insert on public.tasks
  for each row execute function public.seed_claro_task_priorities();

-- Backfill only tasks with no saved priorities; never overwrite custom balances.
insert into public.task_priorities(task_id, user_id, factor, weight, sort_order, name, description, color, inherited)
  select t.id, t.user_id, p.factor, p.weight, p.sort_order, p.name, p.description, p.color, true
  from public.tasks t join public.universal_priorities p on p.user_id = t.user_id
  where not exists (select 1 from public.task_priorities tp where tp.task_id = t.id);

-- Task teams may call this instead of a plain insert when collecting priorities before save.
-- The task and optional overrides commit together, before option generation starts.
create function public.create_task_with_priorities(p_task jsonb, p_expected_user_id uuid, p_factors jsonb default null)
returns text language plpgsql security invoker set search_path = '' as $$
declare actor uuid := auth.uid(); task_key text := p_task->>'id'; overrides jsonb;
begin
  if actor is null or actor is distinct from p_expected_user_id then
    raise exception 'Your account changed. Reopen the screen before saving.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_task) is distinct from 'object' or task_key is null or length(btrim(task_key)) = 0 then
    raise exception 'Expected a task with an ID.';
  end if;
  insert into public.tasks(id, user_id, title, notes, due_date, done)
    values (task_key, actor, p_task->>'title', coalesce(p_task->>'notes', ''), nullif(p_task->>'due_date', '')::date, false);
  if p_factors is not null then
    if jsonb_typeof(p_factors) <> 'array' or jsonb_array_length(p_factors) = 0 then
      raise exception 'Custom priorities must contain factors.';
    end if;
    -- Omitted universal factors are explicit exclusions, matching the existing editor.
    select p_factors || coalesce(jsonb_agg(jsonb_build_object(
      'factor', p.factor, 'weight', 0, 'name', p.name, 'description', p.description, 'color', p.color, 'excluded', true
    )), '[]'::jsonb) into overrides from public.universal_priorities p
    where p.user_id = actor and not exists (select 1 from jsonb_array_elements(p_factors) f where f->>'factor' = p.factor);
    perform public.save_priorities(overrides, task_key, actor);
  end if;
  return task_key;
end;
$$;
revoke all on function public.create_task_with_priorities(jsonb, uuid, jsonb) from public, anon;
grant execute on function public.create_task_with_priorities(jsonb, uuid, jsonb) to authenticated;

commit;

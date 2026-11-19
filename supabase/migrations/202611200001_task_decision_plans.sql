begin;

-- The plan remains attached to its originating task; accepting it writes the
-- decision and every dated action in one transaction.
alter table public.tasks add constraint claro_tasks_id_user_unique unique (id, user_id);

create function public.claro_plan_text(value jsonb, min_length integer, max_length integer)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(value) = 'string' and length(value #>> '{}') <= max_length
    and length(btrim(value #>> '{}')) >= min_length, false);
$$;

create function public.claro_plan_url(value jsonb, optional boolean default false)
returns boolean language sql immutable set search_path = '' as $$
  select public.claro_plan_text(value, case when optional then 0 else 1 end, 2048)
    and ((optional and (value #>> '{}') = '') or ((value #>> '{}') ~ '^https?://[^/@[:space:]]+\.[^/@[:space:]]+(/|$)'
      and (value #>> '{}') !~* '^https?://(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)'));
$$;

create function public.claro_plan_resource(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare kind text := value->>'kind';
begin
  if jsonb_typeof(value) is distinct from 'object' or
    not public.claro_plan_text(value->'label', 1, 80) or
    kind is null or kind not in ('link', 'email', 'phone', 'text') or
    not public.claro_plan_text(value->'value', 1, case when kind = 'link' then 2048 else 500 end) or
    not public.claro_plan_url(value->'sourceUrl', true) then return false; end if;
  if kind = 'link' and not public.claro_plan_url(value->'value') then return false; end if;
  if kind = 'email' and (value->>'value') !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' then return false; end if;
  if kind = 'phone' and ((value->>'value') !~ '^[+()0-9 .-]{5,40}$' or
    length(regexp_replace(value->>'value', '[^0-9]', '', 'g')) < 5) then return false; end if;
  return true;
end;
$$;

create function public.claro_plan_action_notes(action jsonb)
returns text language sql immutable set search_path = '' as $$
  select (action->>'details') || coalesce(E'\n\n' || string_agg(
    (resource->>'label') || ': ' || (resource->>'value') ||
    case when resource->>'sourceUrl' <> '' and resource->>'sourceUrl' <> resource->>'value'
      then E'\nSource: ' || (resource->>'sourceUrl') else '' end, E'\n\n' order by ordinality), '')
  from jsonb_array_elements(action->'resources') with ordinality as items(resource, ordinality);
$$;

create function public.claro_valid_decision_plan(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare rec jsonb; item jsonb; resource jsonb; day_value jsonb; action jsonb;
  day_number integer := 0; duration integer; source_urls text[] := '{}';
begin
  if value is null or jsonb_typeof(value) is distinct from 'object' or length(value::text) > 250000 or
    value->>'status' is distinct from 'ready' or jsonb_typeof(value->'questions') is distinct from 'array' or
    jsonb_array_length(value->'questions') <> 0 or
    jsonb_typeof(value->'durationDays') is distinct from 'number' or
    (value->>'durationDays')::numeric <> trunc((value->>'durationDays')::numeric) then return false; end if;
  duration := (value->>'durationDays')::integer;
  if duration not between 1 and 30 or not public.claro_plan_text(value->'scheduleReason', 1, 400) or
    jsonb_typeof(value->'sources') is distinct from 'array' or jsonb_array_length(value->'sources') not between 1 and 12 or
    jsonb_typeof(value->'assumptions') is distinct from 'array' or jsonb_array_length(value->'assumptions') > 5 or
    jsonb_typeof(value->'days') is distinct from 'array' or jsonb_array_length(value->'days') <> duration then return false; end if;
  for item in select * from jsonb_array_elements(value->'sources') loop
    if not public.claro_plan_text(item->'title', 1, 160) or not public.claro_plan_url(item->'url') or
      item->>'url' = any(source_urls) then return false; end if;
    source_urls := array_append(source_urls, item->>'url');
  end loop;
  for item in select * from jsonb_array_elements(value->'assumptions') loop
    if not public.claro_plan_text(item, 1, 300) then return false; end if;
  end loop;
  rec := value->'recommendation';
  if jsonb_typeof(rec) is distinct from 'object' or
    not public.claro_plan_text(rec->'name', 1, 120) or not public.claro_plan_text(rec->'headline', 1, 180) or
    not public.claro_plan_text(rec->'reason', 1, 700) or not public.claro_plan_text(rec->'tradeoff', 1, 400) or
    not public.claro_plan_url(rec->'website') or not (rec->>'website' = any(source_urls)) or
    jsonb_typeof(rec->'contacts') is distinct from 'array' or jsonb_array_length(rec->'contacts') not between 1 and 4 or
    jsonb_typeof(rec->'specs') is distinct from 'array' or jsonb_array_length(rec->'specs') > 6 then return false; end if;
  for resource in select * from jsonb_array_elements(rec->'contacts') loop
    if not public.claro_plan_resource(resource) or
      (resource->>'sourceUrl' <> '' and not (resource->>'sourceUrl' = any(source_urls))) or
      (resource->>'kind' = 'link' and not (resource->>'value' = any(source_urls))) then return false; end if;
  end loop;
  for item in select * from jsonb_array_elements(rec->'specs') loop
    if not public.claro_plan_text(item->'label', 1, 80) or not public.claro_plan_text(item->'value', 1, 300) or
      not public.claro_plan_url(item->'sourceUrl') or not (item->>'sourceUrl' = any(source_urls)) then return false; end if;
  end loop;
  for day_value in select * from jsonb_array_elements(value->'days') loop
    day_number := day_number + 1;
    if jsonb_typeof(day_value->'day') is distinct from 'number' or
      (day_value->>'day')::numeric <> day_number or
      jsonb_typeof(day_value->'actions') is distinct from 'array' or jsonb_array_length(day_value->'actions') not between 1 and 2 then return false; end if;
    for action in select * from jsonb_array_elements(day_value->'actions') loop
      if not public.claro_plan_text(action->'title', 1, 120) or not public.claro_plan_text(action->'details', 1, 700) or
        jsonb_typeof(action->'resources') is distinct from 'array' or jsonb_array_length(action->'resources') > 4 then return false; end if;
      for resource in select * from jsonb_array_elements(action->'resources') loop
        if not public.claro_plan_resource(resource) or
          (resource->>'sourceUrl' <> '' and not (resource->>'sourceUrl' = any(source_urls))) or
          (resource->>'kind' = 'link' and not (resource->>'value' = any(source_urls))) then return false; end if;
      end loop;
      -- Never truncate information the owner needs to execute a step.
      if length(public.claro_plan_action_notes(action)) > 2000 then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create table public.task_decision_plans (
  task_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  input_key text not null check (length(input_key) between 1 and 20000),
  input jsonb not null check (jsonb_typeof(input) = 'object'),
  priorities jsonb not null check (public.claro_valid_snapshot(priorities) and jsonb_array_length(priorities) between 2 and 8),
  plan jsonb not null check (public.claro_valid_decision_plan(plan)),
  status text not null default 'draft' check (status in ('draft', 'accepted')),
  decision_id text,
  start_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade,
  foreign key (decision_id, user_id) references public.decisions(id, user_id),
  check ((status = 'draft' and decision_id is null and start_date is null) or
    (status = 'accepted' and decision_id is not null and start_date is not null))
);
create index claro_task_decision_plans_user on public.task_decision_plans(user_id, status, task_id);
alter table public.task_decision_plans enable row level security;
create policy claro_task_decision_plans_owner on public.task_decision_plans for select to authenticated
  using (user_id = (select auth.uid()));
create policy claro_task_decision_plans_guard on public.task_decision_plans as restrictive for all to public
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.task_decision_plans from anon, authenticated;
grant select on public.task_decision_plans to authenticated;

-- Match the client's effective merge and largest-remainder normalization. The
-- snapshot is sorted by factor ID so presentation order does not create staleness.
create function public.claro_plan_current_priorities(p_task_id text, p_user_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  with overrides as (
    select * from public.task_priorities where task_id = p_task_id and user_id = p_user_id and not inherited
  ), merged as (
    select coalesce(o.factor, u.factor) as factor, coalesce(o.weight, u.weight) as weight,
      coalesce(o.name, u.name) as name, coalesce(o.description, u.description) as description,
      coalesce(o.color, u.color) as color, coalesce(o.excluded, false) as excluded,
      coalesce(u.sort_order, 2147483647) as universal_order, o.sort_order as override_order
    from (select * from public.universal_priorities where user_id = p_user_id) u
    full join overrides o on o.factor = u.factor
  ), shares as (
    select *, case when sum(weight) over () > 0 then weight::double precision / sum(weight) over () * 100
      else 100::double precision / count(*) over () end as share from merged where not excluded
  ), allocated as (
    select *, floor(share) as whole, row_number() over (order by share - floor(share) desc, universal_order,
      override_order nulls first, factor collate "C") as rank,
      100 - sum(floor(share)) over () as leftover from shares
  ) select coalesce(jsonb_agg(jsonb_build_object('id', factor, 'name', name, 'description', description,
    'color', color, 'weight', whole::integer + case when rank <= leftover then 1 else 0 end)
    order by factor collate "C"), '[]'::jsonb) from allocated;
$$;

create function public.claro_plan_snapshot_ordered(value jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_agg(jsonb_build_object('id', item->>'id', 'name', item->>'name', 'description', item->>'description',
    'color', item->>'color', 'weight', (item->>'weight')::integer) order by (item->>'id') collate "C")
  from jsonb_array_elements(value) item;
$$;

create function public.save_task_decision_plan(p_task_id text, p_input_key text, p_input jsonb, p_priorities jsonb,
  p_plan jsonb, p_expected_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); task_record public.tasks; saved public.task_decision_plans;
begin
  if actor is null or actor is distinct from p_expected_user_id then
    raise exception 'Your account changed. Reopen the screen before saving.' using errcode = '42501'; end if;
  -- Same account lock as save_priorities: no weight changes during validation.
  perform 1 from auth.users where id = actor for update;
  select * into task_record from public.tasks where id = p_task_id and user_id = actor for update;
  if not found then raise exception 'Task not found in your account.' using errcode = '42501'; end if;
  if p_input_key is null or length(p_input_key) not between 1 and 20000 or
    jsonb_typeof(p_input) is distinct from 'object' or
    not public.claro_plan_text(p_input->'title', 1, 120) or not public.claro_plan_text(p_input->'description', 0, 2000) or
    not public.claro_plan_text(p_input->'context', 0, 4000) or not public.claro_plan_text(p_input->'dueDate', 0, 10) or
    not public.claro_valid_snapshot(p_priorities) or jsonb_array_length(p_priorities) not between 2 and 8 or
    not public.claro_valid_decision_plan(p_plan) then raise exception 'The decision plan is incomplete. Please generate it again.'; end if;
  if task_record.title is distinct from p_input->>'title' or task_record.notes is distinct from p_input->>'description' or
    coalesce(task_record.due_date::text, '') is distinct from p_input->>'dueDate' or
    public.claro_plan_current_priorities(p_task_id, actor) is distinct from public.claro_plan_snapshot_ordered(p_priorities) then
    raise exception 'This task or its priorities changed. Generate a fresh recommendation.'; end if;
  select * into saved from public.task_decision_plans where task_id = p_task_id and user_id = actor for update;
  if found and saved.status = 'accepted' then raise exception 'This plan is already on your calendar.'; end if;
  insert into public.task_decision_plans(task_id, user_id, input_key, input, priorities, plan)
    values (p_task_id, actor, p_input_key, p_input, p_priorities, p_plan)
    on conflict (task_id) do update set input_key = excluded.input_key, input = excluded.input,
      priorities = excluded.priorities, plan = excluded.plan, updated_at = now()
    where public.task_decision_plans.user_id = actor and public.task_decision_plans.status = 'draft'
    returning * into saved;
  if not found then raise exception 'This plan could not be saved to your account.' using errcode = '42501'; end if;
  return to_jsonb(saved);
end;
$$;

create function public.accept_task_decision_plan(p_task_id text, p_input_key text, p_start_date date, p_expected_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); task_record public.tasks; saved public.task_decision_plans;
  decision_key text; day_value jsonb; action jsonb; action_number integer; day_number integer;
  final_date date; decision_notes text;
begin
  if actor is null or actor is distinct from p_expected_user_id then
    raise exception 'Your account changed. Reopen the screen before saving.' using errcode = '42501'; end if;
  perform 1 from auth.users where id = actor for update;
  select * into task_record from public.tasks where id = p_task_id and user_id = actor for update;
  if not found then raise exception 'Task not found in your account.' using errcode = '42501'; end if;
  select * into saved from public.task_decision_plans where task_id = p_task_id and user_id = actor for update;
  if not found then raise exception 'Generate and save a recommendation first.'; end if;
  if p_input_key is distinct from saved.input_key then raise exception 'The recommendation changed. Reopen it before continuing.'; end if;
  if saved.status = 'accepted' then
    return jsonb_build_object('decisionId', saved.decision_id, 'startDate', saved.start_date::text, 'alreadyAccepted', true);
  end if;
  if p_start_date is null or not isfinite(p_start_date) or
    p_start_date not between date '0001-01-01' and date '9999-12-01' then
    raise exception 'Choose a valid plan start date.'; end if;
  if task_record.title is distinct from saved.input->>'title' or task_record.notes is distinct from saved.input->>'description' or
    coalesce(task_record.due_date::text, '') is distinct from saved.input->>'dueDate' or
    public.claro_plan_current_priorities(p_task_id, actor) is distinct from public.claro_plan_snapshot_ordered(saved.priorities) then
    raise exception 'This task or its priorities changed. Generate a fresh recommendation.'; end if;
  final_date := p_start_date + (saved.plan->>'durationDays')::integer - 1;
  if task_record.due_date is not null and final_date > task_record.due_date then
    raise exception 'This plan finishes after your deadline. Update the deadline or generate a shorter plan.'; end if;
  decision_key := 'task-plan-' || md5(actor::text || ':' || p_task_id);
  decision_notes := (saved.plan #>> '{recommendation,reason}') || E'\n\n' || (saved.plan #>> '{recommendation,website}');
  -- The complete tradeoff remains in the immutable plan even when a long URL
  -- leaves insufficient room in the legacy decision's 3,000-character notes.
  if length(decision_notes) + 2 + length(saved.plan #>> '{recommendation,tradeoff}') <= 3000 then
    decision_notes := decision_notes || E'\n\n' || (saved.plan #>> '{recommendation,tradeoff}');
  end if;
  insert into public.decisions(id, user_id, title, category, choice, notes, alternatives, review_date, priorities)
    values (decision_key, actor, task_record.title, 'Business', saved.plan #>> '{recommendation,headline}',
      decision_notes, '{}', final_date, saved.priorities);
  for day_value in select * from jsonb_array_elements(saved.plan->'days') loop
    day_number := (day_value->>'day')::integer; action_number := 0;
    for action in select * from jsonb_array_elements(day_value->'actions') loop
      action_number := action_number + 1;
      insert into public.post_decision_tasks(id, user_id, decision_id, title, notes, due_date)
        values (decision_key || '-' || day_number || '-' || action_number, actor, decision_key, action->>'title',
          public.claro_plan_action_notes(action), p_start_date + day_number - 1);
    end loop;
  end loop;
  update public.task_decision_plans set status = 'accepted', decision_id = decision_key,
    start_date = p_start_date, updated_at = now() where task_id = p_task_id and user_id = actor;
  return jsonb_build_object('decisionId', decision_key, 'startDate', p_start_date::text, 'alreadyAccepted', false);
end;
$$;

-- Only RPCs can mutate plans or accept them. Helpers have no public execution.
revoke all on function public.claro_plan_text(jsonb, integer, integer), public.claro_plan_url(jsonb, boolean),
  public.claro_plan_resource(jsonb), public.claro_plan_action_notes(jsonb), public.claro_valid_decision_plan(jsonb),
  public.claro_plan_current_priorities(text, uuid), public.claro_plan_snapshot_ordered(jsonb) from public, anon, authenticated;
revoke all on function public.save_task_decision_plan(text, text, jsonb, jsonb, jsonb, uuid),
  public.accept_task_decision_plan(text, text, date, uuid) from public, anon;
grant execute on function public.save_task_decision_plan(text, text, jsonb, jsonb, jsonb, uuid),
  public.accept_task_decision_plan(text, text, date, uuid) to authenticated;

commit;

begin;

-- Follow-ups are distinct from public.tasks, which represent decisions to make.
alter table public.decisions add constraint claro_decisions_id_user_unique unique (id, user_id);
create table public.post_decision_tasks (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision_id text not null,
  title text not null check (length(btrim(title)) between 1 and 120),
  notes text not null default '' check (length(notes) <= 2000),
  due_date date not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (decision_id, user_id) references public.decisions(id, user_id) on delete cascade
);
create index claro_post_decision_tasks_date on public.post_decision_tasks(user_id, due_date, id);
alter table public.post_decision_tasks enable row level security;
create policy claro_followups_owner on public.post_decision_tasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy claro_followups_guard on public.post_decision_tasks as restrictive for all to public
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.post_decision_tasks from anon;
grant select, insert, update, delete on public.post_decision_tasks to authenticated;

commit;

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.client_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  product text not null default '',
  geography text not null default '',
  audience text not null default '',
  offer text not null default '',
  proof text not null default '',
  restrictions text not null default '',
  language text not null default 'Русский',
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists client_projects_workspace_updated_idx on public.client_projects(workspace_id, updated_at desc);

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.workspace_members where workspace_id = target_workspace and user_id = auth.uid()) $$;

create or replace function public.ensure_workspace()
returns uuid language plpgsql security definer set search_path = public
as $$
declare target uuid;
begin
  select workspace_id into target from public.workspace_members where user_id = auth.uid() order by joined_at limit 1;
  if target is null then
    insert into public.workspaces(name, created_by) values ('RocketPeak Workspace', auth.uid()) returning id into target;
    insert into public.workspace_members(workspace_id, user_id) values (target, auth.uid());
  end if;
  return target;
end $$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.client_projects enable row level security;

create policy "workspaces_member_read" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy "members_member_read" on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "projects_member_all" on public.client_projects for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

grant select on public.workspaces, public.workspace_members to authenticated;
grant select, insert, update on public.client_projects to authenticated;
grant execute on function public.ensure_workspace() to authenticated;


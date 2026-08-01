create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.workspace_invites enable row level security;
create policy "workspace_invites_member_read" on public.workspace_invites for select to authenticated using (public.is_workspace_member(workspace_id));
grant select on public.workspace_invites to authenticated;

create or replace function public.create_workspace_invite()
returns text language plpgsql security definer set search_path = public
as $$
declare target uuid; raw_token text;
begin
  target := public.ensure_workspace();
  raw_token := upper(substr(encode(gen_random_bytes(9), 'hex'), 1, 12));
  insert into public.workspace_invites(workspace_id, token_hash, created_by)
  values (target, encode(digest(raw_token, 'sha256'), 'hex'), auth.uid());
  return raw_token;
end $$;

create or replace function public.join_workspace_by_invite(raw_token text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare invite public.workspace_invites%rowtype; personal uuid;
begin
  select * into invite from public.workspace_invites
  where token_hash = encode(digest(upper(trim(raw_token)), 'sha256'), 'hex') and used_at is null and expires_at > now()
  for update;
  if invite.id is null then raise exception 'invite_invalid'; end if;

  select wm.workspace_id into personal from public.workspace_members wm
  where wm.user_id = auth.uid()
    and (select count(*) from public.workspace_members x where x.workspace_id = wm.workspace_id) = 1
    and not exists(select 1 from public.client_projects p where p.workspace_id = wm.workspace_id)
  order by wm.joined_at limit 1;
  if personal is not null and personal <> invite.workspace_id then
    delete from public.workspace_members where workspace_id = personal and user_id = auth.uid();
    delete from public.workspaces where id = personal and created_by = auth.uid();
  end if;

  insert into public.workspace_members(workspace_id, user_id) values (invite.workspace_id, auth.uid()) on conflict do nothing;
  update public.workspace_invites set used_at = now(), used_by = auth.uid() where id = invite.id;
  return invite.workspace_id;
end $$;

grant execute on function public.create_workspace_invite() to authenticated;
grant execute on function public.join_workspace_by_invite(text) to authenticated;

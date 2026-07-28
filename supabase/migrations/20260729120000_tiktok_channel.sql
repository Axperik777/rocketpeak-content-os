alter table public.posts
  add column if not exists tiktok_caption text not null default '',
  add column if not exists tiktok_privacy text not null default 'SELF_ONLY';

alter table public.posts drop constraint if exists posts_tiktok_privacy_check;
alter table public.posts add constraint posts_tiktok_privacy_check
  check (tiktok_privacy in ('SELF_ONLY', 'MUTUAL_FOLLOW_FRIENDS', 'PUBLIC_TO_EVERYONE'));

alter table public.posts drop constraint if exists posts_channels_check;
alter table public.posts add constraint posts_channels_check
  check (channels <@ array['Facebook', 'Instagram', 'TikTok']::text[]);

alter table public.publication_jobs drop constraint if exists publication_jobs_channel_check;
alter table public.publication_jobs add constraint publication_jobs_channel_check
  check (channel in ('Facebook', 'Instagram', 'TikTok'));

alter table public.publication_controls
  add column if not exists enabled_channels text[] not null default '{}';

alter table public.publication_controls drop constraint if exists publication_controls_enabled_channels_check;
alter table public.publication_controls add constraint publication_controls_enabled_channels_check
  check (enabled_channels <@ array['Facebook', 'Instagram', 'TikTok']::text[]);

create table if not exists public.tiktok_connections (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'pending', 'connected', 'expired', 'revoked', 'error')),
  open_id text,
  display_name text,
  access_token_ciphertext bytea,
  access_token_iv bytea,
  refresh_token_ciphertext bytea,
  refresh_token_iv bytea,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  last_verified_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tiktok_connections enable row level security;
revoke all on public.tiktok_connections from public, anon, authenticated;
grant select, insert, update, delete on public.tiktok_connections to service_role;

create table if not exists public.tiktok_oauth_states (
  state_hash text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.tiktok_oauth_states enable row level security;
revoke all on public.tiktok_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on public.tiktok_oauth_states to service_role;

create or replace function public.get_tiktok_connection_status()
returns table (
  status text,
  open_id text,
  display_name text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  granted_scopes text[],
  last_verified_at timestamptz,
  last_error_code text,
  last_error_message text
)
language sql security definer stable set search_path = ''
as $$
  select c.status, c.open_id, c.display_name, c.access_token_expires_at,
    c.refresh_token_expires_at, c.granted_scopes, c.last_verified_at,
    c.last_error_code, c.last_error_message
  from public.tiktok_connections c where c.owner_id = auth.uid();
$$;

revoke all on function public.get_tiktok_connection_status() from public, anon;
grant execute on function public.get_tiktok_connection_status() to authenticated;

create or replace function public.enqueue_publication(p_post_id uuid, p_channel text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  target_post public.posts%rowtype;
  existing_job_id uuid;
  new_job_id uuid;
  gate_enabled boolean;
  allowed_channels text[];
begin
  if p_channel not in ('Facebook', 'Instagram', 'TikTok') then raise exception 'unsupported_channel'; end if;

  select * into target_post from public.posts
  where id = p_post_id and owner_id = auth.uid();
  if not found then raise exception 'post_not_found'; end if;
  if target_post.status <> 'approved' or target_post.approved_version <> target_post.version then raise exception 'post_not_approved'; end if;
  if not (p_channel = any(target_post.channels)) then raise exception 'channel_not_selected'; end if;

  select publication_enabled, enabled_channels into gate_enabled, allowed_channels
  from public.publication_controls where owner_id = auth.uid();
  if coalesce(gate_enabled, false) = false or not (p_channel = any(coalesce(allowed_channels, '{}'))) then
    raise exception 'publication_disabled';
  end if;

  if p_channel in ('Instagram', 'TikTok') and not exists (
    select 1 from public.media_assets where post_id = target_post.id
      and owner_id = auth.uid() and validation_status = 'ready'
  ) then raise exception 'channel_requires_validated_media'; end if;

  if p_channel = 'TikTok' and not exists (
    select 1 from public.media_assets where post_id = target_post.id
      and owner_id = auth.uid() and validation_status = 'ready' and mime_type = 'video/mp4'
  ) then raise exception 'tiktok_requires_mp4_video'; end if;

  select id into existing_job_id from public.publication_jobs
  where post_id = target_post.id and post_version = target_post.version and channel = p_channel;
  if existing_job_id is not null then return existing_job_id; end if;

  insert into public.publication_jobs(owner_id, post_id, post_version, channel, idempotency_key, run_after)
  values(auth.uid(), target_post.id, target_post.version, p_channel,
    target_post.id::text || ':' || target_post.version::text || ':' || lower(p_channel), target_post.scheduled_at)
  returning id into new_job_id;

  insert into public.audit_log(owner_id, actor_id, entity_type, entity_id, action, metadata)
  values(auth.uid(), auth.uid(), 'publication_job', new_job_id::text, 'queued',
    jsonb_build_object('post_id', target_post.id, 'version', target_post.version, 'channel', p_channel));
  return new_job_id;
end;
$$;

revoke all on function public.enqueue_publication(uuid, text) from public, anon;
grant execute on function public.enqueue_publication(uuid, text) to authenticated;

create or replace function public.claim_publication_jobs(p_limit integer default 10)
returns setof public.publication_jobs
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with candidates as (
    select job.id from public.publication_jobs job
    join public.publication_controls control on control.owner_id = job.owner_id
    where job.state = 'pending' and job.run_after <= now()
      and control.publication_enabled = true
      and job.channel = any(control.enabled_channels)
    order by job.run_after, job.created_at limit greatest(1, least(p_limit, 50))
    for update of job skip locked
  )
  update public.publication_jobs job set state = 'processing', updated_at = now()
  from candidates where job.id = candidates.id returning job.*;
end;
$$;

revoke all on function public.claim_publication_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_publication_jobs(integer) to service_role;

comment on table public.tiktok_connections is
  'Server-only TikTok OAuth tokens encrypted with AES-GCM. Tokens must never be returned to clients or logs.';

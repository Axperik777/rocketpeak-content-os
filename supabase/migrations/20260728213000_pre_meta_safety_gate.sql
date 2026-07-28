alter table public.media_assets
  add column if not exists validation_status text not null default 'client_checked',
  add column if not exists validation_error text,
  add column if not exists validated_at timestamptz;

alter table public.media_assets
  drop constraint if exists media_assets_validation_status_check;
alter table public.media_assets
  add constraint media_assets_validation_status_check
  check (validation_status in ('client_checked', 'processing', 'ready', 'failed'));

alter table public.media_assets
  drop constraint if exists media_assets_supported_mime_check;
alter table public.media_assets
  add constraint media_assets_supported_mime_check
  check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'));

create unique index if not exists media_assets_owner_post_checksum_idx
  on public.media_assets (owner_id, post_id, checksum_sha256);

create table if not exists public.publication_controls (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  publication_enabled boolean not null default false,
  disabled_reason text not null default 'Meta API is not connected',
  updated_at timestamptz not null default now()
);

alter table public.publication_controls enable row level security;

drop policy if exists "publication_controls_owner_read" on public.publication_controls;
create policy "publication_controls_owner_read" on public.publication_controls
for select to authenticated using (owner_id = auth.uid());

revoke all on public.publication_controls from anon, authenticated;
grant select on public.publication_controls to authenticated;

create or replace function public.enqueue_publication(p_post_id uuid, p_channel text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_post public.posts%rowtype;
  existing_job_id uuid;
  new_job_id uuid;
  gate_enabled boolean;
begin
  if p_channel not in ('Facebook', 'Instagram') then
    raise exception 'unsupported_channel';
  end if;

  select * into target_post
  from public.posts
  where id = p_post_id and owner_id = auth.uid();

  if not found then raise exception 'post_not_found'; end if;
  if target_post.status <> 'approved' or target_post.approved_version <> target_post.version then
    raise exception 'post_not_approved';
  end if;
  if not (p_channel = any(target_post.channels)) then raise exception 'channel_not_selected'; end if;

  select publication_enabled into gate_enabled
  from public.publication_controls
  where owner_id = auth.uid();

  if coalesce(gate_enabled, false) = false then raise exception 'publication_disabled'; end if;

  if p_channel = 'Instagram' and not exists (
    select 1 from public.media_assets
    where post_id = target_post.id
      and owner_id = auth.uid()
      and validation_status = 'ready'
  ) then
    raise exception 'instagram_requires_validated_media';
  end if;

  select id into existing_job_id
  from public.publication_jobs
  where post_id = target_post.id
    and post_version = target_post.version
    and channel = p_channel;

  if existing_job_id is not null then return existing_job_id; end if;

  insert into public.publication_jobs (
    owner_id, post_id, post_version, channel, idempotency_key, run_after
  ) values (
    auth.uid(), target_post.id, target_post.version, p_channel,
    target_post.id::text || ':' || target_post.version::text || ':' || lower(p_channel),
    target_post.scheduled_at
  ) returning id into new_job_id;

  insert into public.audit_log (owner_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    auth.uid(), auth.uid(), 'publication_job', new_job_id::text, 'queued',
    jsonb_build_object('post_id', target_post.id, 'version', target_post.version, 'channel', p_channel)
  );

  return new_job_id;
end;
$$;

revoke all on function public.enqueue_publication(uuid, text) from public, anon;
grant execute on function public.enqueue_publication(uuid, text) to authenticated;

insert into public.publication_controls (owner_id)
select id from auth.users
on conflict (owner_id) do nothing;

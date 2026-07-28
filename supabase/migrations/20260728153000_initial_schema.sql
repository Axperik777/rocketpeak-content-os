create extension if not exists pgcrypto;

create type public.content_status as enum ('draft', 'review', 'approved', 'skipped');
create type public.publication_state as enum ('pending', 'processing', 'published', 'failed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'editor' check (role in ('owner', 'editor', 'reviewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_accounts (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  account_type text not null check (account_type in ('facebook_page', 'instagram_business')),
  meta_page_id text,
  instagram_business_id text,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, meta_page_id),
  unique (owner_id, instagram_business_id)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  scheduled_at timestamptz not null,
  timezone text not null default 'Asia/Tbilisi',
  pillar text not null default '',
  title text not null,
  hook text not null,
  format text not null,
  account_id text references public.content_accounts(id) on delete restrict,
  channels text[] not null default array['Facebook']::text[],
  status public.content_status not null default 'draft',
  facebook_caption text not null default '',
  instagram_caption text not null default '',
  cta text not null default '',
  destination_url text not null default '',
  approved_version integer,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(channels) > 0),
  check (channels <@ array['Facebook', 'Instagram']::text[]),
  check (destination_url = '' or destination_url ~ '^https://'),
  check (
    (status = 'approved' and approved_version = version and approved_at is not null)
    or (status <> 'approved' and approved_version is null and approved_at is null)
  )
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  width integer,
  height integer,
  duration_seconds numeric,
  checksum_sha256 text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, storage_path)
);

create table public.publication_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  post_version integer not null check (post_version > 0),
  channel text not null check (channel in ('Facebook', 'Instagram')),
  state public.publication_state not null default 'pending',
  idempotency_key text not null unique,
  run_after timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  locked_at timestamptz,
  published_at timestamptz,
  remote_post_id text,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, post_version, channel)
);

create table public.publication_attempts (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.publication_jobs(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  result text not null check (result in ('started', 'succeeded', 'failed', 'rate_limited')),
  http_status integer,
  error_code text,
  error_message text,
  response_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (job_id, attempt_number)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index posts_owner_schedule_idx on public.posts (owner_id, scheduled_at);
create index posts_owner_status_idx on public.posts (owner_id, status);
create index publication_jobs_ready_idx on public.publication_jobs (state, run_after) where state = 'pending';
create index audit_log_owner_created_idx on public.audit_log (owner_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger content_accounts_set_updated_at before update on public.content_accounts
for each row execute function public.set_updated_at();
create trigger posts_set_updated_at before update on public.posts
for each row execute function public.set_updated_at();
create trigger publication_jobs_set_updated_at before update on public.publication_jobs
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.content_accounts enable row level security;
alter table public.posts enable row level security;
alter table public.media_assets enable row level security;
alter table public.publication_jobs enable row level security;
alter table public.publication_attempts enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "accounts_owner_all" on public.content_accounts for all to authenticated
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "posts_owner_all" on public.posts for all to authenticated
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "media_owner_all" on public.media_assets for all to authenticated
using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "jobs_owner_read" on public.publication_jobs for select to authenticated using (owner_id = auth.uid());
create policy "attempts_owner_read" on public.publication_attempts for select to authenticated using (owner_id = auth.uid());
create policy "audit_owner_read" on public.audit_log for select to authenticated using (owner_id = auth.uid());

revoke all on public.publication_jobs from anon, authenticated;
revoke all on public.publication_attempts from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;
grant select on public.publication_jobs to authenticated;
grant select on public.publication_attempts to authenticated;
grant select on public.audit_log to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-media',
  'content-media',
  false,
  104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
)
on conflict (id) do nothing;

create policy "media_objects_owner_read" on storage.objects for select to authenticated
using (bucket_id = 'content-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media_objects_owner_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'content-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media_objects_owner_update" on storage.objects for update to authenticated
using (bucket_id = 'content-media' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'content-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media_objects_owner_delete" on storage.objects for delete to authenticated
using (bucket_id = 'content-media' and (storage.foldername(name))[1] = auth.uid()::text);

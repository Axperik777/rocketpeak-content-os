create table if not exists public.meta_connections (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'pending', 'connected', 'expired', 'revoked', 'error')),
  page_id text,
  page_name text,
  instagram_account_id text,
  instagram_username text,
  token_ciphertext bytea,
  token_iv bytea,
  token_expires_at timestamptz,
  granted_permissions text[] not null default '{}',
  last_verified_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_connections_token_pair_check check (
    (token_ciphertext is null and token_iv is null)
    or (token_ciphertext is not null and token_iv is not null)
  )
);

alter table public.meta_connections enable row level security;
revoke all on public.meta_connections from public, anon, authenticated;

create table if not exists public.meta_oauth_states (
  state_hash text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.meta_oauth_states enable row level security;
revoke all on public.meta_oauth_states from public, anon, authenticated;

create or replace function public.get_meta_connection_status()
returns table (
  status text,
  page_id text,
  page_name text,
  instagram_account_id text,
  instagram_username text,
  token_expires_at timestamptz,
  granted_permissions text[],
  last_verified_at timestamptz,
  last_error_code text,
  last_error_message text
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    connection.status,
    connection.page_id,
    connection.page_name,
    connection.instagram_account_id,
    connection.instagram_username,
    connection.token_expires_at,
    connection.granted_permissions,
    connection.last_verified_at,
    connection.last_error_code,
    connection.last_error_message
  from public.meta_connections as connection
  where connection.owner_id = auth.uid();
$$;

revoke all on function public.get_meta_connection_status() from public, anon;
grant execute on function public.get_meta_connection_status() to authenticated;

comment on table public.meta_connections is
  'Server-only Meta connection store. token_ciphertext must be encrypted before insert and must never be returned to clients or logs.';
comment on table public.meta_oauth_states is
  'Single-use hashed OAuth states. Raw state values must never be persisted.';

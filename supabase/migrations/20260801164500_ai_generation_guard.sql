create table if not exists public.ai_generation_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ai_generation_owner_day_idx on public.ai_generation_requests(owner_id, created_at desc);
alter table public.ai_generation_requests enable row level security;
create policy "ai_requests_owner_read" on public.ai_generation_requests for select to authenticated using (owner_id = auth.uid());
revoke all on public.ai_generation_requests from anon, authenticated;
grant select on public.ai_generation_requests to authenticated;

create or replace function public.reserve_ai_generation(p_daily_limit integer default 12)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_owner uuid := auth.uid();
begin
  if current_owner is null then raise exception 'unauthorized'; end if;
  perform pg_advisory_xact_lock(hashtext(current_owner::text));
  if (select count(*) from public.ai_generation_requests where owner_id = current_owner and created_at >= date_trunc('day', now())) >= greatest(1, least(p_daily_limit, 50)) then
    return false;
  end if;
  insert into public.ai_generation_requests(owner_id) values (current_owner);
  return true;
end;
$$;

revoke all on function public.reserve_ai_generation(integer) from public, anon;
grant execute on function public.reserve_ai_generation(integer) to authenticated;
comment on function public.reserve_ai_generation(integer) is 'Atomically enforces a conservative daily AI generation budget per authenticated owner.';

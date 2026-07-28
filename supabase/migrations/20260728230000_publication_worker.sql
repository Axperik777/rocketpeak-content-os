alter table public.publication_controls
  add column if not exists provider_mode text not null default 'mock'
    check (provider_mode in ('mock', 'meta'));

create or replace function public.claim_publication_jobs(p_limit integer default 10)
returns setof public.publication_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select job.id
    from public.publication_jobs job
    join public.publication_controls control on control.owner_id = job.owner_id
    where job.state = 'pending'
      and job.run_after <= now()
      and control.publication_enabled = true
    order by job.run_after
    for update of job skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.publication_jobs job
  set state = 'processing', locked_at = now(), attempt_count = attempt_count + 1
  from due
  where job.id = due.id
  returning job.*;
end;
$$;

create or replace function public.finish_publication_job(
  p_job_id uuid,
  p_succeeded boolean,
  p_remote_post_id text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_retryable boolean default false
)
returns public.publication_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.publication_jobs%rowtype;
  next_state public.publication_state;
  next_run timestamptz;
begin
  select * into job from public.publication_jobs where id = p_job_id for update;
  if not found or job.state <> 'processing' then raise exception 'job_not_processing'; end if;

  if p_succeeded then
    next_state := 'published';
    next_run := job.run_after;
  elsif p_retryable and job.attempt_count < 4 then
    next_state := 'pending';
    next_run := now() + make_interval(mins => power(2, job.attempt_count)::integer);
  else
    next_state := 'failed';
    next_run := job.run_after;
  end if;

  update public.publication_jobs
  set state = next_state,
      run_after = next_run,
      locked_at = null,
      published_at = case when p_succeeded then now() else null end,
      remote_post_id = case when p_succeeded then p_remote_post_id else null end,
      last_error_code = case when p_succeeded then null else p_error_code end,
      last_error_message = case when p_succeeded then null else left(p_error_message, 500) end
  where id = p_job_id returning * into job;

  insert into public.publication_attempts(owner_id, job_id, attempt_number, result, error_code, error_message)
  values (job.owner_id, job.id, job.attempt_count,
    case when p_succeeded then 'succeeded' when p_error_code = 'rate_limited' then 'rate_limited' else 'failed' end,
    case when p_succeeded then null else p_error_code end,
    case when p_succeeded then null else left(p_error_message, 500) end);

  insert into public.audit_log(owner_id, entity_type, entity_id, action, metadata)
  values (job.owner_id, 'publication_job', job.id::text, job.state::text,
    jsonb_build_object('attempt', job.attempt_count, 'channel', job.channel));
  return job;
end;
$$;

revoke all on function public.claim_publication_jobs(integer) from public, anon, authenticated;
revoke all on function public.finish_publication_job(uuid, boolean, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_publication_jobs(integer) to service_role;
grant execute on function public.finish_publication_job(uuid, boolean, text, text, text, boolean) to service_role;

comment on function public.claim_publication_jobs(integer) is 'Server worker only. Claims due jobs atomically with SKIP LOCKED.';
comment on function public.finish_publication_job(uuid, boolean, text, text, text, boolean) is 'Server worker only. Completes or retries a claimed job without exposing tokens.';

alter table public.publication_attempts drop constraint if exists publication_attempts_job_id_attempt_number_key;
alter table public.publication_attempts add constraint publication_attempts_job_attempt_result_key unique (job_id, attempt_number, result);

create or replace function public.mark_publication_job_processing(p_job_id uuid, p_remote_post_id text)
returns public.publication_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare job public.publication_jobs%rowtype;
begin
  update public.publication_jobs
  set state = 'processing', remote_post_id = p_remote_post_id, locked_at = null,
      last_error_code = null, last_error_message = null
  where id = p_job_id and state = 'processing'
  returning * into job;
  if not found then raise exception 'job_not_processing'; end if;

  insert into public.publication_attempts(owner_id, job_id, attempt_number, result, response_metadata)
  values (job.owner_id, job.id, job.attempt_count, 'started', jsonb_build_object('remote_post_id', p_remote_post_id));
  insert into public.audit_log(owner_id, entity_type, entity_id, action, metadata)
  values (job.owner_id, 'publication_job', job.id::text, 'provider_processing', jsonb_build_object('channel', job.channel));
  return job;
end;
$$;

revoke all on function public.mark_publication_job_processing(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_publication_job_processing(uuid, text) to service_role;
comment on function public.mark_publication_job_processing(uuid, text) is 'Stores an asynchronous provider id without falsely marking the post as published.';

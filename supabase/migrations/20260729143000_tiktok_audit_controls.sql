alter table public.posts
  alter column tiktok_privacy drop default,
  alter column tiktok_privacy set default '',
  add column if not exists tiktok_allow_comment boolean not null default false,
  add column if not exists tiktok_allow_duet boolean not null default false,
  add column if not exists tiktok_allow_stitch boolean not null default false,
  add column if not exists tiktok_commercial_content boolean not null default false,
  add column if not exists tiktok_your_brand boolean not null default false,
  add column if not exists tiktok_branded_content boolean not null default false,
  add column if not exists tiktok_music_consent boolean not null default false;

alter table public.posts drop constraint if exists posts_tiktok_privacy_check;
alter table public.posts add constraint posts_tiktok_privacy_check
  check (tiktok_privacy in ('', 'SELF_ONLY', 'FOLLOWER_OF_CREATOR', 'MUTUAL_FOLLOW_FRIENDS', 'PUBLIC_TO_EVERYONE'));

alter table public.posts add constraint posts_tiktok_commercial_selection_check
  check (not tiktok_commercial_content or tiktok_your_brand or tiktok_branded_content);

alter table public.posts add constraint posts_tiktok_branded_privacy_check
  check (not tiktok_branded_content or tiktok_privacy <> 'SELF_ONLY');

comment on column public.posts.tiktok_privacy is 'TikTok visibility selected manually by the creator. Empty means no selection.';
comment on column public.posts.tiktok_music_consent is 'Explicit acknowledgement captured before the post can be approved.';

create or replace function public.validate_tiktok_publication_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_post public.posts%rowtype;
begin
  if new.channel <> 'TikTok' then return new; end if;
  select * into target_post from public.posts where id = new.post_id and owner_id = new.owner_id;
  if not found then raise exception 'post_not_found'; end if;
  if coalesce(target_post.tiktok_privacy, '') = '' then raise exception 'tiktok_privacy_required'; end if;
  if target_post.tiktok_music_consent is not true then raise exception 'tiktok_music_consent_required'; end if;
  if target_post.tiktok_commercial_content and not (target_post.tiktok_your_brand or target_post.tiktok_branded_content) then
    raise exception 'tiktok_commercial_selection_required';
  end if;
  if target_post.tiktok_branded_content and target_post.tiktok_privacy = 'SELF_ONLY' then
    raise exception 'tiktok_branded_content_cannot_be_private';
  end if;
  return new;
end;
$$;

drop trigger if exists publication_jobs_validate_tiktok on public.publication_jobs;
create trigger publication_jobs_validate_tiktok
before insert on public.publication_jobs
for each row execute function public.validate_tiktok_publication_job();

revoke all on function public.validate_tiktok_publication_job() from public, anon, authenticated;

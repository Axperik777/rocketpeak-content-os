alter table public.posts drop constraint if exists posts_channels_check;
alter table public.posts drop constraint if exists posts_channels_check1;

alter table public.posts add constraint posts_channels_check
  check (channels <@ array['Facebook', 'Instagram', 'TikTok']::text[]);

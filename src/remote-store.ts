import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Channel, Post, Status } from './content-store'

type PostRow = {
  id: string
  owner_id: string
  version: number
  scheduled_at: string
  timezone: string
  pillar: string
  title: string
  hook: string
  format: string
  account_id: string
  channels: string[]
  status: Status
  facebook_caption: string
  instagram_caption: string
  tiktok_caption: string
  tiktok_privacy: Post['tiktokPrivacy']
  cta: string
  destination_url: string
  approved_version: number | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

const accountSeeds = [
  { id: 'page-rocketpeak', display_name: 'RocketPeak', account_type: 'facebook_page' },
  { id: 'page-arsen', display_name: 'Arsen', account_type: 'facebook_page' },
  { id: 'page-ad-lumeo', display_name: 'Ad Lumeo', account_type: 'facebook_page' },
]

function localDateTime(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tbilisi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` }
}

function fromRow(row: PostRow): Post {
  const scheduled = localDateTime(row.scheduled_at)
  return {
    id: row.id,
    version: row.version,
    scheduledDate: scheduled.date,
    scheduledTime: scheduled.time,
    timezone: 'Asia/Tbilisi',
    pillar: row.pillar,
    title: row.title,
    hook: row.hook,
    format: row.format,
    accountId: row.account_id,
    channels: row.channels as Channel[],
    status: row.status,
    facebookCaption: row.facebook_caption,
    instagramCaption: row.instagram_caption,
    tiktokCaption: row.tiktok_caption ?? row.instagram_caption,
    tiktokPrivacy: row.tiktok_privacy ?? 'SELF_ONLY',
    cta: row.cta,
    destinationUrl: row.destination_url,
    approval: row.approved_version && row.approved_at ? { version: row.approved_version, approvedAt: row.approved_at } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRow(post: Post, ownerId: string) {
  return {
    id: post.id,
    owner_id: ownerId,
    version: post.version,
    scheduled_at: `${post.scheduledDate}T${post.scheduledTime}:00+04:00`,
    timezone: post.timezone,
    pillar: post.pillar,
    title: post.title,
    hook: post.hook,
    format: post.format,
    account_id: post.accountId,
    channels: post.channels,
    status: post.status,
    facebook_caption: post.facebookCaption,
    instagram_caption: post.instagramCaption,
    tiktok_caption: post.tiktokCaption,
    tiktok_privacy: post.tiktokPrivacy,
    cta: post.cta,
    destination_url: post.destinationUrl,
    approved_version: post.approval?.version ?? null,
    approved_at: post.approval?.approvedAt ?? null,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
  }
}

export async function prepareUser(user: User) {
  if (!supabase) throw new Error('Supabase не настроен')
  const profile = await supabase.from('profiles').upsert({ id: user.id, display_name: user.email ?? 'Owner', role: 'owner' })
  if (profile.error) throw profile.error
  const accounts = await supabase.from('content_accounts').upsert(accountSeeds.map((account) => ({ ...account, owner_id: user.id, enabled: false })))
  if (accounts.error) throw accounts.error
}

export async function loadRemotePosts(ownerId: string) {
  if (!supabase) throw new Error('Supabase не настроен')
  const result = await supabase.from('posts').select('*').eq('owner_id', ownerId).order('scheduled_at')
  if (result.error) throw result.error
  return (result.data as PostRow[]).map(fromRow)
}

export async function saveRemotePosts(ownerId: string, posts: Post[]) {
  if (!supabase) throw new Error('Supabase не настроен')
  const existing = await supabase.from('posts').select('id').eq('owner_id', ownerId)
  if (existing.error) throw existing.error
  const currentIds = new Set(posts.map((post) => post.id))
  const removedIds = existing.data.map((row) => row.id as string).filter((id) => !currentIds.has(id))
  if (removedIds.length) {
    const removed = await supabase.from('posts').delete().eq('owner_id', ownerId).in('id', removedIds)
    if (removed.error) throw removed.error
  }
  if (!posts.length) return
  const saved = await supabase.from('posts').upsert(posts.map((post) => toRow(post, ownerId)))
  if (saved.error) throw saved.error
}

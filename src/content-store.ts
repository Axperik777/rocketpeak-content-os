export type Channel = 'Facebook' | 'Instagram' | 'TikTok'
export type Status = 'draft' | 'review' | 'approved' | 'skipped'
export type TikTokPrivacy = 'SELF_ONLY' | 'MUTUAL_FOLLOW_FRIENDS' | 'PUBLIC_TO_EVERYONE'

export type Approval = {
  version: number
  approvedAt: string
}

export type Post = {
  id: string
  version: number
  scheduledDate: string
  scheduledTime: string
  timezone: 'Asia/Tbilisi'
  pillar: string
  title: string
  hook: string
  format: string
  accountId: string
  channels: Channel[]
  status: Status
  facebookCaption: string
  instagramCaption: string
  tiktokCaption: string
  tiktokPrivacy: TikTokPrivacy
  cta: string
  destinationUrl: string
  approval: Approval | null
  createdAt: string
  updatedAt: string
}

export type ContentPlan = {
  schemaVersion: 2
  exportedAt: string
  timezone: 'Asia/Tbilisi'
  posts: Post[]
}

export const maxPostsPerDay = 3

export function getScheduleError(posts: Post[], candidate: Post) {
  const activePosts = posts.filter((post) => post.id !== candidate.id && post.status !== 'skipped')
  const postsOnDate = activePosts.filter((post) => post.scheduledDate === candidate.scheduledDate)
  if (postsOnDate.some((post) => post.scheduledTime === candidate.scheduledTime)) {
    return 'На это время уже запланирована публикация. Выберите другое время.'
  }
  if (postsOnDate.length >= maxPostsPerDay) {
    return `На эту дату уже запланировано ${maxPostsPerDay} публикации. Перенесите материал на другой день.`
  }
  return ''
}

const storageKeyV1 = 'rocketpeak-content-os:v1:posts'
const storageKeyV2 = 'rocketpeak-content-os:v2:plan'
const validStatuses = new Set<Status>(['draft', 'review', 'approved', 'skipped'])
const validChannels = new Set<Channel>(['Facebook', 'Instagram', 'TikTok'])
const accountIds = new Set(['page-rocketpeak', 'page-arsen', 'page-ad-lumeo'])

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `post-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function nowIso() {
  return new Date().toISOString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function normalizeAccountId(value: unknown) {
  if (typeof value === 'string' && accountIds.has(value)) return value
  if (value === 'Arsen') return 'page-arsen'
  if (value === 'Ad Lumeo') return 'page-ad-lumeo'
  return 'page-rocketpeak'
}

function normalizeChannels(value: unknown): Channel[] {
  if (!Array.isArray(value)) return ['Facebook']
  const channels = value.filter((item): item is Channel => typeof item === 'string' && validChannels.has(item as Channel))
  return channels.length ? [...new Set(channels)] : ['Facebook']
}

function normalizeLegacyDate(value: unknown) {
  if (typeof value === 'string' && isoDatePattern.test(value)) return value
  if (typeof value !== 'string') return ''
  const match = value.trim().match(/^(\d{1,2})\s+(июл|авг)$/i)
  if (!match) return ''
  const month = match[2].toLowerCase() === 'июл' ? '07' : '08'
  return `2026-${month}-${match[1].padStart(2, '0')}`
}

function parsePost(value: unknown): Post | null {
  if (!isRecord(value)) return null
  const id = normalizeText(value.id)
  const scheduledDate = normalizeText(value.scheduledDate)
  const scheduledTime = normalizeText(value.scheduledTime)
  const status = normalizeText(value.status) as Status
  const version = typeof value.version === 'number' && Number.isInteger(value.version) && value.version > 0 ? value.version : 1
  if (!id || !isoDatePattern.test(scheduledDate) || !timePattern.test(scheduledTime) || !validStatuses.has(status)) return null
  const approvalValue = value.approval
  const approval = isRecord(approvalValue) && typeof approvalValue.version === 'number' && typeof approvalValue.approvedAt === 'string'
    ? { version: approvalValue.version, approvedAt: approvalValue.approvedAt }
    : null

  return {
    id,
    version,
    scheduledDate,
    scheduledTime,
    timezone: 'Asia/Tbilisi',
    pillar: normalizeText(value.pillar),
    title: normalizeText(value.title),
    hook: normalizeText(value.hook),
    format: normalizeText(value.format),
    accountId: normalizeAccountId(value.accountId),
    channels: normalizeChannels(value.channels),
    status,
    facebookCaption: normalizeText(value.facebookCaption),
    instagramCaption: normalizeText(value.instagramCaption),
    tiktokCaption: normalizeText(value.tiktokCaption, normalizeText(value.instagramCaption)),
    tiktokPrivacy: ['SELF_ONLY', 'MUTUAL_FOLLOW_FRIENDS', 'PUBLIC_TO_EVERYONE'].includes(normalizeText(value.tiktokPrivacy))
      ? normalizeText(value.tiktokPrivacy) as TikTokPrivacy : 'SELF_ONLY',
    cta: normalizeText(value.cta),
    destinationUrl: normalizeText(value.destinationUrl),
    approval: status === 'approved' && approval?.version === version ? approval : null,
    createdAt: normalizeText(value.createdAt, nowIso()),
    updatedAt: normalizeText(value.updatedAt, nowIso()),
  }
}

function migrateLegacyPost(value: unknown): Post | null {
  if (!isRecord(value)) return null
  const createdAt = nowIso()
  const legacyStatus = normalizeText(value.status)
  const status: Status = legacyStatus === 'approved' ? 'approved' : legacyStatus === 'review' ? 'review' : legacyStatus === 'skipped' ? 'skipped' : 'draft'
  const title = normalizeText(value.title)
  const hook = normalizeText(value.hook)
  const version = 1
  return {
    id: createId(),
    version,
    scheduledDate: normalizeLegacyDate(value.date) || '2026-07-28',
    scheduledTime: timePattern.test(normalizeText(value.time)) ? normalizeText(value.time) : '12:00',
    timezone: 'Asia/Tbilisi',
    pillar: normalizeText(value.pillar, 'Без рубрики'),
    title,
    hook,
    format: normalizeText(value.format, 'Статичный пост'),
    accountId: normalizeAccountId(value.target),
    channels: normalizeChannels(value.channels),
    status,
    facebookCaption: hook,
    instagramCaption: hook,
    tiktokCaption: hook,
    tiktokPrivacy: 'SELF_ONLY',
    cta: '',
    destinationUrl: '',
    approval: status === 'approved' ? { version, approvedAt: createdAt } : null,
    createdAt,
    updatedAt: createdAt,
  }
}

export function createDraftPost(): Post {
  const createdAt = nowIso()
  return {
    id: createId(),
    version: 1,
    scheduledDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tbilisi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
    scheduledTime: '12:00',
    timezone: 'Asia/Tbilisi',
    pillar: '',
    title: '',
    hook: '',
    format: 'Статичный пост',
    accountId: 'page-rocketpeak',
    channels: ['Facebook', 'Instagram'],
    status: 'draft',
    facebookCaption: '',
    instagramCaption: '',
    tiktokCaption: '',
    tiktokPrivacy: 'SELF_ONLY',
    cta: '',
    destinationUrl: '',
    approval: null,
    createdAt,
    updatedAt: createdAt,
  }
}

export function createSeedPosts(): Post[] {
  const rows = [
    ['2026-07-28', '19:00', 'Экономика', 'Почему дешёвый лид может оказаться самым дорогим', 'CPL падает. Продаж больше не становится. Значит, оптимизировали не ту метрику.', 'page-rocketpeak', ['Facebook', 'Instagram'], 'review', 'Карусель'],
    ['2026-07-29', '12:30', 'Система', 'CTR → CR → CPA → продажа → ROI', 'Реклама не заканчивается на заявке. После неё начинается проверка экономики.', 'page-rocketpeak', ['Facebook', 'Instagram'], 'draft', 'Статичный пост'],
    ['2026-07-30', '18:00', 'Диагностика', 'Когда проблема не в рекламе, а в оффере', 'Хороший трафик на слабое предложение не спасёт конверсию.', 'page-rocketpeak', ['Facebook'], 'draft', 'Текст + фото'],
    ['2026-07-31', '13:00', 'Подготовка', 'Что проверяем до запуска кампании', 'Пять вещей, которые дешевле исправить до первого потраченного доллара.', 'page-rocketpeak', ['Facebook', 'Instagram'], 'approved', 'Карусель'],
    ['2026-08-01', '19:30', 'Позиция', 'Почему красивый креатив не всегда продаёт', 'Креатив может нравиться всем и не давать качественных заявок.', 'page-arsen', ['Facebook'], 'draft', 'Экспертный пост'],
    ['2026-08-02', '14:00', 'Креатив', 'Как креатив влияет на качество заявки', 'Хук определяет не только CTR. Он заранее фильтрует аудиторию.', 'page-rocketpeak', ['Instagram'], 'draft', 'Reels'],
    ['2026-08-03', '18:30', 'Продажи', 'Почему отдел продаж теряет рекламные заявки', 'Иногда CPA растёт не в кабинете, а в первые десять минут после лида.', 'page-arsen', ['Facebook', 'Instagram'], 'draft', 'Карусель'],
  ] as const
  const createdAt = nowIso()
  return rows.map(([scheduledDate, scheduledTime, pillar, title, hook, accountId, channels, status, format]) => ({
    id: createId(), version: 1, scheduledDate, scheduledTime, timezone: 'Asia/Tbilisi', pillar, title, hook, format, accountId,
    channels: [...channels] as Channel[], status, facebookCaption: hook, instagramCaption: hook, tiktokCaption: hook, tiktokPrivacy: 'SELF_ONLY', cta: '', destinationUrl: '',
    approval: status === 'approved' ? { version: 1, approvedAt: createdAt } : null, createdAt, updatedAt: createdAt,
  }))
}

export function createPlan(posts: Post[]): ContentPlan {
  return { schemaVersion: 2, exportedAt: nowIso(), timezone: 'Asia/Tbilisi', posts }
}

export function parsePlan(value: unknown): ContentPlan | null {
  if (!isRecord(value) || value.schemaVersion !== 2 || !Array.isArray(value.posts)) return null
  const posts = value.posts.map(parsePost)
  if (posts.some((post) => post === null)) return null
  return createPlan(posts as Post[])
}

export function loadPlan(): { posts: Post[]; message?: string } {
  try {
    const savedV2 = window.localStorage.getItem(storageKeyV2)
    if (savedV2) {
      const parsed = parsePlan(JSON.parse(savedV2))
      if (parsed) return { posts: parsed.posts }
      return { posts: createSeedPosts(), message: 'Сохранённые данные повреждены. Загружен безопасный стартовый план.' }
    }
    const savedV1 = window.localStorage.getItem(storageKeyV1)
    if (savedV1) {
      const raw = JSON.parse(savedV1)
      if (Array.isArray(raw)) {
        const migrated = raw.map(migrateLegacyPost).filter((post): post is Post => post !== null)
        if (migrated.length) return { posts: migrated, message: 'Локальные данные обновлены до схемы v2.' }
      }
    }
  } catch {
    return { posts: createSeedPosts(), message: 'Не удалось прочитать локальные данные. Загружен безопасный стартовый план.' }
  }
  return { posts: createSeedPosts() }
}

export function savePlan(posts: Post[]) {
  window.localStorage.setItem(storageKeyV2, JSON.stringify(createPlan(posts)))
}

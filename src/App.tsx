import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Database,
  Download,
  Eye,
  MessageCircle,
  FileText,
  Camera,
  LayoutList,
  LockKeyhole,
  Pencil,
  PlugZap,
  Plus,
  ShieldCheck,
  SkipForward,
  Trash2,
  Upload,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { createDraftPost, createPlan, getScheduleError, loadPlan, parsePlan, savePlan, type Channel, type Post, type Status } from './content-store'
import { AuthScreen } from './AuthScreen'
import { loadRemotePosts, prepareUser, saveRemotePosts } from './remote-store'
import { deleteMediaAsset, loadMediaAssets, uploadMediaAsset, type MediaAsset } from './media-store'
import { supabase } from './supabase'

type View = 'queue' | 'calendar' | 'accounts' | 'settings'
type Filter = 'all' | 'review' | 'draft' | 'ready' | 'skipped'

type Account = {
  id: string
  name: string
  initials: string
  kind: 'Личный профиль' | 'Facebook Page'
  role: string
  api: 'Требует проверки активов' | 'Только вручную' | 'Отключена'
  state: 'active' | 'manual' | 'off'
  note: string
}

const accounts: Account[] = [
  { id: 'king-ad-lumeo', name: 'AD Lumeo', initials: 'AL', kind: 'Личный профиль', role: 'Владелец доступов / king', api: 'Только вручную', state: 'manual', note: 'Управляет страницами. Автоматизацию и публикацию с личного профиля не используем.' },
  { id: 'page-rocketpeak', name: 'RocketPeak', initials: 'RP', kind: 'Facebook Page', role: 'Основная страница агентства', api: 'Требует проверки активов', state: 'active', note: 'Главный канал. До подключения нужно подтвердить Page ID, задачи пользователя и связанный Instagram.' },
  { id: 'page-arsen', name: 'Arsen', initials: 'AR', kind: 'Facebook Page', role: 'Экспертная страница', api: 'Требует проверки активов', state: 'active', note: 'Страница экспертного контента. До подключения нужно подтвердить Page ID и задачи пользователя.' },
  { id: 'page-ad-lumeo', name: 'Ad Lumeo', initials: 'AD', kind: 'Facebook Page', role: 'Дополнительная страница', api: 'Требует проверки активов', state: 'active', note: 'Роль не определена. В первую API-версию не включать без отдельного решения.' },
  { id: 'page-barmaglot', name: 'Barmaglot Tbilisi', initials: 'BT', kind: 'Facebook Page', role: 'Клиентский актив', api: 'Отключена', state: 'off', note: 'Деактивирована. В контур RocketPeak не включаем.' },
]

const viewMeta: Record<View, { label: string; title: string; description: string; icon: LucideIcon }> = {
  queue: { label: 'Очередь', title: 'Рабочая очередь', description: 'Проверьте материал и примите одно решение.', icon: LayoutList },
  calendar: { label: 'Календарь', title: 'План публикаций', description: 'Неделя без конфликтов и случайных выходов.', icon: CalendarDays },
  accounts: { label: 'Аккаунты', title: 'Карта Meta-активов', description: 'Кто есть кто и что разрешено подключать.', icon: UsersRound },
  settings: { label: 'Подключения', title: 'Безопасные подключения', description: 'Только официальные API и ручное подтверждение.', icon: PlugZap },
}

const statusLabels: Record<Status, string> = { draft: 'Черновик', review: 'Нужно решение', approved: 'Согласовано', skipped: 'Пропущено' }
const validViews: View[] = ['queue', 'calendar', 'accounts', 'settings']
const initialPlan = loadPlan()

function getInitialView(): View {
  const hash = window.location.hash.slice(1) as View
  return validViews.includes(hash) ? hash : 'queue'
}

function Mark() {
  return <div className="mark" aria-label="RocketPeak"><span>R</span><span>P</span><i /></div>
}

function ChannelIcon({ channel }: { channel: Channel }) {
  return <span className="channel" title={channel}>{channel === 'Facebook' ? <MessageCircle /> : <Camera />}<span>{channel}</span></span>
}

function accountName(accountId: string) {
  return accounts.find((account) => account.id === accountId)?.name ?? 'Неизвестный аккаунт'
}

function formatPostDate(post: Post) {
  const date = new Date(`${post.scheduledDate}T12:00:00`)
  return {
    day: new Intl.DateTimeFormat('ru-RU', { day: 'numeric', timeZone: post.timezone }).format(date),
    month: new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: post.timezone }).format(date).replace('.', ''),
    full: new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: post.timezone }).format(date),
  }
}

function safeHostname(value: string) {
  if (!value) return 'ссылка не задана'
  try {
    return new URL(value).hostname
  } catch {
    return 'ссылка требует исправления'
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [remoteReady, setRemoteReady] = useState(false)
  const [syncState, setSyncState] = useState<'local' | 'syncing' | 'synced' | 'error'>('local')
  const [view, setView] = useState<View>(getInitialView)
  const [filter, setFilter] = useState<Filter>('all')
  const [posts, setPosts] = useState<Post[]>(initialPlan.posts)
  const [notice, setNotice] = useState(initialPlan.message ?? '')
  const [captionExpanded, setCaptionExpanded] = useState(false)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [selectedPostId, setSelectedPostId] = useState<string | null>(initialPlan.posts[0]?.id ?? null)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([])
  const [mediaBusy, setMediaBusy] = useState(false)
  const noticeTimer = useRef<number | undefined>(undefined)
  const editingOriginal = useRef<Post | null>(null)
  const isNewDraft = useRef(false)
  const importInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    savePlan(posts)
  }, [posts])

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthReady(true)
      if (!nextSession) setRemoteReady(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    setSyncState('syncing')
    Promise.all([prepareUser(session.user), loadRemotePosts(session.user.id), loadMediaAssets(session.user.id)])
      .then(async ([, remotePosts, remoteMedia]) => {
        if (cancelled) return
        if (remotePosts.length) setPosts(remotePosts)
        else await saveRemotePosts(session.user.id, initialPlan.posts)
        setMediaAssets(remoteMedia)
        if (!cancelled) {
          setRemoteReady(true)
          setSyncState('synced')
        }
      })
      .catch(() => {
        if (!cancelled) setSyncState('error')
      })
    return () => { cancelled = true }
  }, [session?.user.id])

  useEffect(() => {
    if (!session || !remoteReady) return
    setSyncState('syncing')
    const timer = window.setTimeout(() => {
      saveRemotePosts(session.user.id, posts)
        .then(() => setSyncState('synced'))
        .catch(() => setSyncState('error'))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [posts, remoteReady, session?.user.id])

  useEffect(() => {
    if (!session || !remoteReady || !supabase || new URLSearchParams(window.location.search).get('edgeProbe') !== '1') return
    let cancelled = false
    supabase.functions.invoke('validate-media', { body: { probe: true } })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || data?.status !== 'ok' || data?.authenticated !== true) setNotice('Серверный валидатор недоступен.')
        else setNotice('Серверный валидатор работает и принимает только авторизованные запросы.')
      })
    return () => { cancelled = true }
  }, [remoteReady, session])

  const hasUnsavedChanges = useMemo(() => editingPost !== null && JSON.stringify(editingPost) !== JSON.stringify(editingOriginal.current), [editingPost])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => {
    if (!editingPost) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeEditor()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [editingPost, hasUnsavedChanges])

  useEffect(() => {
    const handleHashChange = () => {
      const nextView = window.location.hash.slice(1) as View
      if (validViews.includes(nextView)) setView(nextView)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => () => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
  }, [])

  const stats = useMemo(() => ({
    review: posts.filter((post) => post.status === 'review').length,
    approved: posts.filter((post) => post.status === 'approved').length,
    draft: posts.filter((post) => post.status === 'draft').length,
  }), [posts])

  const visiblePosts = useMemo(() => posts.filter((post) => {
    if (filter === 'all') return post.status !== 'skipped'
    if (filter === 'ready') return post.status === 'approved'
    return post.status === filter
  }).sort((a, b) => `${a.scheduledDate}T${a.scheduledTime}`.localeCompare(`${b.scheduledDate}T${b.scheduledTime}`)), [filter, posts])

  const selectedPost = useMemo(() => posts.find((post) => post.id === selectedPostId) ?? visiblePosts[0] ?? posts[0] ?? null, [posts, selectedPostId, visiblePosts])
  const selectedMedia = useMemo(() => mediaAssets.find((asset) => asset.postId === selectedPost?.id) ?? null, [mediaAssets, selectedPost?.id])
  const editingMedia = useMemo(() => mediaAssets.filter((asset) => asset.postId === editingPost?.id), [editingPost?.id, mediaAssets])

  const showNotice = (message: string) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    setNotice(message)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3200)
  }

  const openView = (nextView: View) => {
    setView(nextView)
    window.history.replaceState(null, '', `#${nextView}`)
  }

  const changeStatus = (id: string, status: Status) => {
    const changedAt = new Date().toISOString()
    setPosts((current) => current.map((post) => post.id === id ? {
      ...post,
      status,
      updatedAt: changedAt,
      approval: status === 'approved' ? { version: post.version, approvedAt: changedAt } : null,
    } : post))
    showNotice(status === 'approved' ? 'Согласовано. Автопубликация остаётся выключенной.' : 'Статус обновлён локально.')
  }

  const createDraft = () => {
    const draft = createDraftPost()
    openView('queue')
    setFilter('draft')
    editingOriginal.current = { ...draft, channels: [...draft.channels] }
    isNewDraft.current = true
    setFormErrors({})
    setEditingPost(draft)
  }

  const openEditor = (post: Post) => {
    const copy = { ...post, channels: [...post.channels] }
    editingOriginal.current = copy
    isNewDraft.current = false
    setFormErrors({})
    setEditingPost(copy)
  }

  const closeEditor = () => {
    if (hasUnsavedChanges && !window.confirm('Закрыть редактор без сохранения изменений?')) return
    editingOriginal.current = null
    isNewDraft.current = false
    setEditingPost(null)
    setFormErrors({})
  }

  const savePost = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingPost) return
    const errors: Record<string, string> = {}
    if (!editingPost.title.trim()) errors.title = 'Укажите тему публикации.'
    if (!editingPost.hook.trim()) errors.hook = 'Добавьте хук.'
    if (!editingPost.pillar.trim()) errors.pillar = 'Укажите рубрику.'
    if (!editingPost.format.trim()) errors.format = 'Укажите формат.'
    if (!editingPost.scheduledDate) errors.scheduledDate = 'Выберите дату.'
    if (!editingPost.scheduledTime) errors.scheduledTime = 'Выберите время.'
    if (editingPost.scheduledDate && editingPost.scheduledTime) {
      const scheduleError = getScheduleError(posts, editingPost)
      if (scheduleError) errors.scheduledDate = scheduleError
    }
    if (editingPost.channels.length === 0) errors.channels = 'Выберите хотя бы один канал.'
    if (editingPost.destinationUrl && !/^https:\/\//i.test(editingPost.destinationUrl)) errors.destinationUrl = 'Ссылка должна начинаться с https://.'
    if (Object.keys(errors).length) {
      setFormErrors(errors)
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      showNotice('Исправьте отмеченные поля.')
      return
    }
    const original = editingOriginal.current
    const creating = isNewDraft.current
    const changedAt = new Date().toISOString()
    const cleaned: Post = {
      ...editingPost,
      title: editingPost.title.trim(),
      hook: editingPost.hook.trim(),
      pillar: editingPost.pillar.trim(),
      format: editingPost.format.trim(),
      facebookCaption: editingPost.facebookCaption.trim(),
      instagramCaption: editingPost.instagramCaption.trim(),
      cta: editingPost.cta.trim(),
      destinationUrl: editingPost.destinationUrl.trim(),
      version: creating ? editingPost.version : (original?.version ?? editingPost.version) + 1,
      status: 'draft',
      approval: null,
      updatedAt: changedAt,
    }
    setPosts((current) => creating ? [cleaned, ...current] : current.map((post) => post.id === cleaned.id ? cleaned : post))
    setSelectedPostId(cleaned.id)
    editingOriginal.current = null
    isNewDraft.current = false
    setEditingPost(null)
    setFormErrors({})
    showNotice(original?.status === 'approved' ? 'Изменения сохранены. Прежнее согласование аннулировано.' : 'Материал сохранён как черновик.')
  }

  const exportPlan = () => {
    const blob = new Blob([JSON.stringify(createPlan(posts), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'rocketpeak-content-plan.json'
    link.click()
    URL.revokeObjectURL(url)
    showNotice('Контент-план выгружен в JSON.')
  }

  const importPlan = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed = parsePlan(JSON.parse(await file.text()))
      if (!parsed) throw new Error('invalid schema')
      if (!window.confirm(`Заменить текущий план импортом из ${parsed.posts.length} материалов? Перед заменой рекомендуется сделать экспорт.`)) return
      setPosts(parsed.posts)
      setSelectedPostId(parsed.posts[0]?.id ?? null)
      showNotice('План импортирован и проверен по схеме v2.')
    } catch {
      showNotice('Импорт отклонён: файл не соответствует схеме Content OS v2.')
    }
  }

  const deletePost = async (post: Post) => {
    if (!window.confirm(`Удалить черновик «${post.title || 'Без названия'}»?`)) return
    const attached = mediaAssets.filter((asset) => asset.postId === post.id)
    try {
      await Promise.all(attached.map(deleteMediaAsset))
      setMediaAssets((current) => current.filter((asset) => asset.postId !== post.id))
    } catch {
      showNotice('Не удалось удалить прикреплённые файлы. Материал сохранён.')
      return
    }
    setPosts((current) => current.filter((item) => item.id !== post.id))
    if (selectedPostId === post.id) setSelectedPostId(null)
    showNotice('Черновик удалён.')
  }

  const updateEditingPost = (patch: Partial<Post>) => {
    setEditingPost((current) => current ? { ...current, ...patch } : current)
  }

  const updateEditingChannel = (channel: Channel, checked: boolean) => {
    setEditingPost((current) => current ? {
      ...current,
      channels: checked ? [...new Set([...current.channels, channel])] : current.channels.filter((item) => item !== channel),
    } : current)
  }

  const uploadMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !session || !editingPost || isNewDraft.current) return
    setMediaBusy(true)
    try {
      const asset = await uploadMediaAsset(session.user.id, editingPost.id, file)
      setMediaAssets((current) => [...current, asset])
      showNotice('Медиа загружено в приватное хранилище.')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Не удалось загрузить медиа.')
    } finally {
      setMediaBusy(false)
    }
  }

  const removeMedia = async (asset: MediaAsset) => {
    if (!window.confirm('Удалить этот файл без возможности восстановления?')) return
    setMediaBusy(true)
    try {
      await deleteMediaAsset(asset)
      setMediaAssets((current) => current.filter((item) => item.id !== asset.id))
      showNotice('Медиа удалено.')
    } catch {
      showNotice('Не удалось удалить медиа.')
    } finally {
      setMediaBusy(false)
    }
  }

  const activeMeta = viewMeta[view]
  const todayLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Asia/Tbilisi' }).format(new Date())

  if (!authReady) return <main className="auth-screen"><div className="auth-loading">Проверяем защищённую сессию…</div></main>
  if (!session) return <AuthScreen />

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">Перейти к содержимому</a>
      <aside className="sidebar">
        <div className="brand"><Mark /><div><strong>CONTENT OS</strong><span>RocketPeak workspace</span></div></div>
        <nav aria-label="Основная навигация">
          {(Object.keys(viewMeta) as View[]).map((id) => {
            const ItemIcon = viewMeta[id].icon
            return <a href={`#${id}`} aria-current={view === id ? 'page' : undefined} className={view === id ? 'active' : ''} onClick={() => setView(id)} key={id}><ItemIcon /><span>{viewMeta[id].label}</span>{id === 'queue' && stats.review > 0 && <b>{stats.review}</b>}</a>
          })}
        </nav>
        <div className="safety-card"><ShieldCheck /><div><strong>Безопасный режим</strong><span>Публикация только после подтверждения</span></div></div>
        <div className={`sidebar-foot sync-${syncState}`}><span className="live-dot" />{syncState === 'synced' ? 'Синхронизировано' : syncState === 'syncing' ? 'Синхронизация…' : syncState === 'error' ? 'Ошибка синхронизации' : 'Локальный режим'}</div>
      </aside>

      <main id="workspace">
        <header className="topbar">
          <div className="page-title"><span className="eyebrow">ROCKETPEAK · {todayLabel.toUpperCase()} · ТБИЛИСИ</span><h1>{activeMeta.title}</h1><p>{activeMeta.description}</p></div>
          <div className="top-actions"><input ref={importInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={importPlan} /><button className="button secondary" onClick={() => importInput.current?.click()}><Upload />Импорт</button><button className="button secondary" onClick={exportPlan}><Download />Экспорт</button><button className="button secondary" onClick={() => supabase?.auth.signOut()}>Выйти</button><button className="button primary" onClick={createDraft}><Plus />Новый материал</button></div>
        </header>

        {notice && <div className="toast" role="status"><CheckCircle2 />{notice}</div>}

        {view === 'queue' && <>
          <section className="control-strip" aria-label="Текущий статус">
            <div className="next-action"><span className="step-index">СЕЙЧАС</span><div><strong>{stats.review ? 'Проверьте материал перед публикацией' : 'Очередь согласована'}</strong><p>{stats.review ? 'Решение займёт меньше минуты. Без него публикации не будет.' : 'Можно переходить к подготовке следующей недели.'}</p></div><button onClick={() => setFilter('review')} disabled={!stats.review}>Показать <ChevronRight /></button></div>
            <div className="metric"><span>Черновики</span><b>{stats.draft}</b><small>требуют подготовки</small></div>
            <div className="metric metric--signal"><span>Нужно решение</span><b>{stats.review}</b><small>приоритет сейчас</small></div>
            <div className="metric metric--ready"><span>Готово</span><b>{stats.approved}</b><small>подтверждено</small></div>
          </section>

          <section className="work-grid">
            <div className="queue-panel panel">
              <div className="section-head"><div><span className="eyebrow">БЛИЖАЙШИЕ ПУБЛИКАЦИИ</span><h2>Материалы</h2></div><button className="text-button" onClick={() => openView('calendar')}>Открыть календарь <ChevronRight /></button></div>
              <div className="filters" aria-label="Фильтр материалов">
                {([['all','Все'],['review','Нужно решение'],['draft','Черновики'],['ready','Готово'],['skipped','Пропущено']] as [Filter,string][]).map(([id,label]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}{id === 'review' && stats.review > 0 && <b>{stats.review}</b>}</button>)}
              </div>
              <div className="post-list">
                {visiblePosts.length === 0 && <div className="empty-state"><CheckCircle2 /><h3>Здесь всё разобрано</h3><p>Выберите другой фильтр или создайте новый материал.</p></div>}
                {visiblePosts.map((post) => { const postDate = formatPostDate(post); return <article className={`post-row post-row--${post.status} ${selectedPost?.id === post.id ? 'post-row--selected' : ''}`} key={post.id}>
                  <div className="date-block"><strong>{postDate.day}</strong><span>{postDate.month}</span><small>{post.scheduledTime}</small></div>
                  <div className="post-body"><div className="post-meta"><span>{post.pillar}</span><i>{post.format}</i><em className={`status status--${post.status}`}>{statusLabels[post.status]}</em></div><h3>{post.title}</h3><p>{post.hook}</p><div className="route"><b>{accountName(post.accountId)}</b>{post.channels.map((channel) => <ChannelIcon channel={channel} key={channel} />)}<small>v{post.version}</small></div></div>
                  <div className="row-actions"><button onClick={() => { setSelectedPostId(post.id); setCaptionExpanded(false) }}><Eye />Превью</button>{post.status === 'review' ? <><button className="approve" onClick={() => changeStatus(post.id, 'approved')}><Check />Согласовать</button><button onClick={() => openEditor(post)}><Pencil />Исправить</button><button onClick={() => changeStatus(post.id, 'skipped')}><SkipForward />Пропустить</button></> : post.status === 'skipped' ? <button onClick={() => changeStatus(post.id, 'draft')}><FileText />Вернуть</button> : <><button onClick={() => openEditor(post)}><Pencil />Редактировать</button>{post.status === 'draft' && <button onClick={() => deletePost(post)}><Trash2 />Удалить</button>}<button onClick={() => changeStatus(post.id, 'review')}><FileText />На проверку</button></>}</div>
                </article> })}
              </div>
            </div>

            <aside className="preview-column">{selectedPost ? <>
              <div className="preview-head"><div><span>ПРЕВЬЮ · {accountName(selectedPost.accountId).toUpperCase()}</span><strong>{formatPostDate(selectedPost).full} · {selectedPost.scheduledTime}</strong></div><em><Clock3 />{statusLabels[selectedPost.status]} · v{selectedPost.version}</em></div>
              <div className={`creative-preview ${selectedMedia ? 'creative-preview--media' : ''}`}>{selectedMedia && (selectedMedia.mimeType.startsWith('image/') ? <img src={selectedMedia.signedUrl} alt="Загруженный креатив" /> : <video src={selectedMedia.signedUrl} controls preload="metadata" />)}<div className="creative-overlay"><Mark /><span className="preview-label">{selectedPost.pillar.toUpperCase()}</span><h3>{selectedPost.title || 'БЕЗ НАЗВАНИЯ'}</h3><p>{selectedPost.hook || 'Добавьте хук в редакторе материала.'}</p><div className="preview-foot"><b>{selectedPost.channels.join(' · ').toUpperCase()}</b><span>{safeHostname(selectedPost.destinationUrl)}</span></div></div></div>
              <div className="caption-preview"><span>ТЕКСТ ПУБЛИКАЦИИ</span><p>{captionExpanded ? (selectedPost.facebookCaption || selectedPost.instagramCaption || selectedPost.hook) : (selectedPost.facebookCaption || selectedPost.instagramCaption || selectedPost.hook).slice(0, 150)}</p>{selectedPost.cta && <strong className="preview-cta">CTA: {selectedPost.cta}</strong>}<button aria-expanded={captionExpanded} onClick={() => setCaptionExpanded((current) => !current)}>{captionExpanded ? 'Свернуть текст' : 'Посмотреть весь текст'} <ChevronRight /></button></div>
            </> : <div className="empty-state"><Eye /><h3>Выберите материал</h3><p>Превью будет связано с выбранной версией.</p></div>}</aside>
          </section>
        </>}

        {view === 'calendar' && <section className="calendar-view panel"><div className="section-head"><div><span className="eyebrow">БЛИЖАЙШИЕ ДАТЫ</span><h2>Календарный план</h2></div><div className="legend"><span><i className="dot draft" />Черновик</span><span><i className="dot review" />Нужно решение</span><span><i className="dot approved" />Готово</span></div></div><div className="calendar-grid">{[...posts].sort((a,b) => `${a.scheduledDate}T${a.scheduledTime}`.localeCompare(`${b.scheduledDate}T${b.scheduledTime}`)).map((post) => <article key={post.id}><div className="calendar-day"><span>{new Intl.DateTimeFormat('ru-RU',{weekday:'short',timeZone:post.timezone}).format(new Date(`${post.scheduledDate}T12:00:00`)).toUpperCase()}</span><strong>{formatPostDate(post).full}</strong></div><div className={`calendar-post ${post.status}`}><small>{post.scheduledTime} · {post.format}</small><h3>{post.title}</h3><p>{accountName(post.accountId)}</p><div>{post.channels.map((channel) => <ChannelIcon channel={channel} key={channel} />)}</div></div></article>)}</div></section>}

        {view === 'accounts' && <section className="accounts-view">
          <div className="explainer"><div className="explainer-icon"><ShieldCheck /></div><div><span className="eyebrow">КЛАССИФИКАЦИЯ</span><h2>Личный профиль не равен странице</h2><p><b>AD Lumeo</b> — личный профиль-владелец, в баерском сленге «king». RocketPeak, Arsen и Ad Lumeo — Facebook Pages. Автоматизацию личного профиля не используем.</p></div></div>
          <div className="account-grid">{accounts.map((account) => <article className={`account-card account-card--${account.state}`} key={account.id}><div className="account-head"><div className="account-avatar">{account.initials}</div><div><span>{account.kind}</span><h2>{account.name}</h2></div><em>{account.api}</em></div><div className="account-role"><span>НАЗНАЧЕНИЕ</span><strong>{account.role}</strong></div><p>{account.note}</p><button disabled={account.state !== 'active'} onClick={() => showNotice(`${account.name}: подключение будет доступно после проверки Business Manager.`)}>{account.state === 'active' ? <>Подготовить подключение <ChevronRight /></> : account.state === 'manual' ? <><LockKeyhole />Только вручную</> : 'Не подключать'}</button></article>)}</div>
        </section>}

        {view === 'settings' && <section className="settings-view">
          <div className="risk-banner"><ShieldCheck /><div><strong>Контур с низким риском</strong><p>Не обещает отсутствие проверок Meta, но исключает опасные сценарии: cookies, автоклики, действия от личного профиля и массовую активность.</p></div><span>SAFE MODE</span></div>
          {[
            { icon: PlugZap, step: '01', title: 'Meta Graph API', text: 'Официальное подключение Facebook Pages и профессионального Instagram.', state: 'Ждёт проверки активов' },
            { icon: Bot, step: '02', title: 'Telegram-согласование', text: 'Получать превью и принимать решение без входа в интерфейс.', state: 'Ждёт токен бота' },
            { icon: Database, step: '03', title: 'Хранилище медиа', text: 'Приватные изображения и видео с временными HTTPS-ссылками и RLS по владельцу.', state: 'Подключено · Supabase Storage' },
          ].map((item) => { const ConnectionIcon = item.icon; return <div className="connection-card" key={item.step}><div className="connection-icon"><ConnectionIcon /></div><div><span>ШАГ {item.step}</span><h2>{item.title}</h2><p>{item.text}</p></div><em>{item.state}</em><button disabled>Пока недоступно</button></div> })}
          <div className="guardrails panel"><div><span className="eyebrow">ПРАВИЛА СИСТЕМЫ</span><h2>Что разрешено и что заблокировано</h2><p>Эти ограничения остаются включёнными и после подключения API.</p></div><ul><li><CheckCircle2 /><span><b>Разрешено</b> Ручное подтверждение каждой публикации</span></li><li><CheckCircle2 /><span><b>Разрешено</b> Защита от дублей и журнал действий</span></li><li><CheckCircle2 /><span><b>Разрешено</b> Консервативное расписание без всплесков</span></li><li><CircleAlert /><span><b>Заблокировано</b> Автолайки, подписки и массовые комментарии</span></li><li><LockKeyhole /><span><b>Заблокировано</b> Пароли, cookies и браузерные автоклики</span></li></ul></div>
          <div className="legal-readiness panel">
            <div><span className="eyebrow">META APP REVIEW</span><h2>Публичные документы готовы</h2><p>Адреса можно указывать в настройках Meta App. Токены в браузере и репозитории не хранятся.</p></div>
            <ul>
              <li><CheckCircle2 /><a href="./privacy.html" target="_blank" rel="noreferrer">Политика конфиденциальности</a></li>
              <li><CheckCircle2 /><a href="./terms.html" target="_blank" rel="noreferrer">Условия использования</a></li>
              <li><CheckCircle2 /><a href="./data-deletion.html" target="_blank" rel="noreferrer">Инструкция удаления данных</a></li>
              <li><LockKeyhole /><span>OAuth и публикация останутся выключенными до проверки Meta-активов.</span></li>
            </ul>
          </div>
        </section>}
        {editingPost && <div className="editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor() }}>
          <form className="post-editor" onSubmit={savePost} role="dialog" aria-modal="true" aria-labelledby="editor-title">
            <div className="editor-head"><div><span className="eyebrow">ВЕРСИЯ {editingPost.version}</span><h2 id="editor-title">Материал</h2></div><button type="button" onClick={closeEditor} aria-label="Закрыть редактор">×</button></div>
            <label className="field field--wide"><span>Тема публикации</span><input name="title" autoComplete="off" aria-invalid={Boolean(formErrors.title)} aria-describedby={formErrors.title ? 'error-title' : undefined} value={editingPost.title} onChange={(event) => updateEditingPost({ title: event.target.value })} placeholder="Что аудитория должна понять…" />{formErrors.title && <small className="field-error" id="error-title">{formErrors.title}</small>}</label>
            <label className="field field--wide"><span>Хук</span><textarea name="hook" autoComplete="off" rows={3} aria-invalid={Boolean(formErrors.hook)} aria-describedby={formErrors.hook ? 'error-hook' : undefined} value={editingPost.hook} onChange={(event) => updateEditingPost({ hook: event.target.value })} placeholder="Первый тезис, который остановит скролл…" />{formErrors.hook && <small className="field-error" id="error-hook">{formErrors.hook}</small>}</label>
            <label className="field"><span>Рубрика</span><input name="pillar" autoComplete="off" aria-invalid={Boolean(formErrors.pillar)} value={editingPost.pillar} onChange={(event) => updateEditingPost({ pillar: event.target.value })} />{formErrors.pillar && <small className="field-error">{formErrors.pillar}</small>}</label>
            <label className="field"><span>Формат</span><input name="format" autoComplete="off" aria-invalid={Boolean(formErrors.format)} value={editingPost.format} onChange={(event) => updateEditingPost({ format: event.target.value })} />{formErrors.format && <small className="field-error">{formErrors.format}</small>}</label>
            <label className="field"><span>Дата</span><input name="scheduledDate" type="date" autoComplete="off" aria-invalid={Boolean(formErrors.scheduledDate)} value={editingPost.scheduledDate} onInput={(event) => updateEditingPost({ scheduledDate: event.currentTarget.value })} />{formErrors.scheduledDate && <small className="field-error">{formErrors.scheduledDate}</small>}</label>
            <label className="field"><span>Время · Тбилиси</span><input name="scheduledTime" type="time" autoComplete="off" aria-invalid={Boolean(formErrors.scheduledTime)} value={editingPost.scheduledTime} onInput={(event) => updateEditingPost({ scheduledTime: event.currentTarget.value })} />{formErrors.scheduledTime && <small className="field-error">{formErrors.scheduledTime}</small>}</label>
            <label className="field"><span>Аккаунт</span><select name="accountId" autoComplete="off" value={editingPost.accountId} onChange={(event) => updateEditingPost({ accountId: event.target.value })}>{accounts.filter((account) => account.state === 'active').map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
            <fieldset className="field channel-field" aria-invalid={Boolean(formErrors.channels)}><legend>Каналы</legend>{(['Facebook', 'Instagram'] as Channel[]).map((channel) => <label key={channel}><input name="channels" type="checkbox" checked={editingPost.channels.includes(channel)} onChange={(event) => updateEditingChannel(channel, event.target.checked)} />{channel}</label>)}{formErrors.channels && <small className="field-error">{formErrors.channels}</small>}</fieldset>
            <label className="field field--wide"><span>Текст Facebook</span><textarea name="facebookCaption" autoComplete="off" rows={4} value={editingPost.facebookCaption} onChange={(event) => updateEditingPost({ facebookCaption: event.target.value })} placeholder="Полный текст для Facebook…" /></label>
            <label className="field field--wide"><span>Текст Instagram</span><textarea name="instagramCaption" autoComplete="off" rows={4} value={editingPost.instagramCaption} onChange={(event) => updateEditingPost({ instagramCaption: event.target.value })} placeholder="Полный текст для Instagram…" /></label>
            <label className="field"><span>CTA</span><input name="cta" autoComplete="off" value={editingPost.cta} onChange={(event) => updateEditingPost({ cta: event.target.value })} placeholder="Получить аудит…" /></label>
            <label className="field"><span>HTTPS-ссылка</span><input name="destinationUrl" type="url" inputMode="url" autoComplete="off" aria-invalid={Boolean(formErrors.destinationUrl)} value={editingPost.destinationUrl} onChange={(event) => updateEditingPost({ destinationUrl: event.target.value })} placeholder="https://rocket-peak.com/…" />{formErrors.destinationUrl && <small className="field-error">{formErrors.destinationUrl}</small>}</label>
            <section className="media-field field--wide" aria-label="Медиа публикации">
              <div><span>МЕДИА</span><small>JPG, PNG, WebP до 10 МБ · MP4, MOV до 100 МБ</small></div>
              {isNewDraft.current ? <p>Сначала сохраните новый материал, затем откройте его и загрузите файл.</p> : <label className={`media-upload ${mediaBusy ? 'is-busy' : ''}`}><Upload />{mediaBusy ? 'Загрузка…' : 'Загрузить файл'}<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" onChange={uploadMedia} disabled={mediaBusy} /></label>}
              {editingMedia.length > 0 && <div className="media-list">{editingMedia.map((asset) => <article key={asset.id}>{asset.mimeType.startsWith('image/') ? <img src={asset.signedUrl} alt="Прикреплённый креатив" /> : <video src={asset.signedUrl} preload="metadata" />}<div><strong>{asset.mimeType.startsWith('image/') ? 'Изображение' : 'Видео'}</strong><span>{asset.width}×{asset.height} · {(asset.sizeBytes / 1024 / 1024).toFixed(1)} МБ{asset.durationSeconds ? ` · ${asset.durationSeconds.toFixed(1)} сек` : ''}</span><em>{asset.validationStatus === 'ready' ? 'Серверная проверка пройдена' : asset.validationStatus === 'failed' ? 'Файл отклонён' : 'Ожидает серверной проверки'}</em></div><button type="button" onClick={() => removeMedia(asset)} disabled={mediaBusy} aria-label="Удалить медиа"><Trash2 /></button></article>)}</div>}
            </section>
            {editingOriginal.current?.status === 'approved' && <div className="approval-warning field--wide"><CircleAlert /><span>После сохранения версия увеличится, а прежнее согласование будет аннулировано.</span></div>}
            <div className="editor-actions"><span>{hasUnsavedChanges ? 'Есть несохранённые изменения' : 'Изменений нет'}</span><button type="button" className="button secondary" onClick={closeEditor}>Отмена</button><button className="button primary" type="submit"><Check />Сохранить черновик</button></div>
          </form>
        </div>}
        <footer className="app-footer"><span>RocketPeak Content OS</span><nav aria-label="Юридические документы"><a href="./privacy.html">Конфиденциальность</a><a href="./terms.html">Условия</a><a href="./data-deletion.html">Удаление данных</a></nav><a href="mailto:developers@rocket-peak.com">developers@rocket-peak.com</a></footer>
      </main>
    </div>
  )
}

export default App

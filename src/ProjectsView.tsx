import { useEffect, useState } from 'react'
import { ArrowUpRight, CheckCircle2, FolderPlus, HardDrive, LoaderCircle, Plus, RefreshCw, ShieldCheck, WifiOff, X } from 'lucide-react'
import { createProject, loadProjects, type ClientProject } from './project-store'
import { ensureLocalProject, getLocalCompanionStatus, type LocalCompanionStatus } from './local-companion'

const emptyProject = { name: '', product: '', geography: '', audience: '', offer: '', proof: '', restrictions: '', language: 'Русский' }

export function ProjectsView({ onOpenProject }: { onOpenProject: (projectId: string) => void }) {
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(emptyProject)
  const [local, setLocal] = useState<LocalCompanionStatus>({ online: false })

  useEffect(() => {
    Promise.all([loadProjects(), getLocalCompanionStatus()]).then(async ([items, companion]) => {
      setProjects(items); setLocal(companion)
      if (companion.online) await Promise.allSettled(items.map(ensureLocalProject))
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Не удалось загрузить проекты')).finally(() => setLoading(false))
  }, [])

  async function synchronize(project: ClientProject) {
    try { const path = await ensureLocalProject(project); setMessage(`Папки готовы: ${path}`); setLocal((current) => ({ ...current, online: true })) }
    catch { setError('Локальный помощник не отвечает. Откройте приложение через ярлык RocketPeak Content OS и повторите.') }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    if (draft.name.trim().length < 2) { setError('Укажите название проекта.'); return }
    setSaving(true)
    try {
      const project = await createProject({ ...draft, name: draft.name.trim() })
      setProjects((current) => [project, ...current])
      try { const path = await ensureLocalProject(project); setMessage(`Проект создан. Рабочая папка: ${path}`) }
      catch { setError('Проект сохранён в общей базе, но локальная папка не создана. Запустите приложение через ярлык и нажмите «Создать папки».') }
      setDraft(emptyProject); setEditing(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось создать проект') }
    finally { setSaving(false) }
  }

  return <section className="projects-view">
    <div className="workspace-intro"><div><span className="eyebrow">КЛИЕНТСКАЯ РАБОТА</span><h2>Один проект — одна рабочая папка</h2><p>Бриф, лендинг, креативы и тексты автоматически раскладываются по назначению.</p></div><button className="button primary" onClick={() => setEditing(true)}><Plus />Новый проект</button></div>
    <div className={`local-companion-state ${local.online ? 'online' : 'offline'}`}>{local.online ? <CheckCircle2 /> : <WifiOff />}<div><strong>{local.online ? 'Локальные папки подключены' : 'Локальные папки недоступны'}</strong><span>{local.online ? local.root : 'Запустите приложение через ярлык на рабочем столе'}</span></div>{!local.online && <button onClick={async () => setLocal(await getLocalCompanionStatus())}><RefreshCw />Проверить</button>}</div>
    {error && <div className="workspace-error" role="alert">{error}</div>}
    {message && <div className="workspace-success" role="status">{message}</div>}
    {loading ? <div className="workspace-loading"><LoaderCircle />Загружаем проекты…</div> : projects.length === 0 ? <div className="project-empty"><FolderPlus /><h3>Создайте первый проект</h3><p>После сохранения приложение создаст структуру папок в `MARKETING\Проекты`.</p><button className="button primary" onClick={() => setEditing(true)}>Создать проект</button></div> : <div className="project-grid">{projects.map((project) => <article className="project-tile" key={project.id}><div className="project-index">{project.name.slice(0,2).toUpperCase()}</div><span>{project.geography || 'География не задана'} · {project.language}</span><h3>{project.name}</h3><p>{project.product || 'Добавьте продукт и постоянный контекст проекта.'}</p><dl><div><dt>Оффер</dt><dd>{project.offer || 'Не задан'}</dd></div><div><dt>Аудитория</dt><dd>{project.audience || 'Не задана'}</dd></div></dl><div className="project-tile-actions"><button onClick={() => onOpenProject(project.id)}>Открыть проект <ArrowUpRight /></button><button className="folder-button" onClick={() => synchronize(project)}><HardDrive />Создать папки</button></div></article>)}</div>}
    {editing && <div className="workspace-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false) }}><form className="project-form" onSubmit={submit}><div className="project-form-head"><div><span className="eyebrow">НОВЫЙ ПРОЕКТ</span><h2>Создать проект и папки</h2></div><button type="button" aria-label="Закрыть" onClick={() => setEditing(false)}><X /></button></div><label>Название проекта<input value={draft.name} onChange={(e) => setDraft({...draft,name:e.target.value})} autoFocus /></label><div className="project-form-grid"><label>Продукт<textarea value={draft.product} onChange={(e) => setDraft({...draft,product:e.target.value})} /></label><label>География<input value={draft.geography} onChange={(e) => setDraft({...draft,geography:e.target.value})} /></label><label>Аудитория<textarea value={draft.audience} onChange={(e) => setDraft({...draft,audience:e.target.value})} /></label><label>Оффер<textarea value={draft.offer} onChange={(e) => setDraft({...draft,offer:e.target.value})} /></label><label>Доказательства<textarea value={draft.proof} onChange={(e) => setDraft({...draft,proof:e.target.value})} /></label><label>Ограничения<textarea value={draft.restrictions} onChange={(e) => setDraft({...draft,restrictions:e.target.value})} /></label></div><label>Язык<input value={draft.language} onChange={(e) => setDraft({...draft,language:e.target.value})} /></label><div className="project-form-note"><ShieldCheck />Создаст запись в общей базе и локальную структуру папок. Клиентский проект не публикуется автоматически.</div><div className="project-form-actions"><button type="button" className="button secondary" onClick={() => setEditing(false)}>Отмена</button><button className="button primary" disabled={saving}>{saving ? 'Создаём…' : 'Создать проект'}</button></div></form></div>}
  </section>
}

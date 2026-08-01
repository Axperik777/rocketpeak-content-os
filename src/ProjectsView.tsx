import { useEffect, useState } from 'react'
import { ArrowUpRight, FolderPlus, LoaderCircle, Plus, ShieldCheck, X } from 'lucide-react'
import { createProject, loadProjects, type ClientProject } from './project-store'

const emptyProject = { name: '', product: '', geography: '', audience: '', offer: '', proof: '', restrictions: '', language: 'Русский' }

export function ProjectsView({ onOpenCreative }: { onOpenCreative: (projectId?: string) => void }) {
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(emptyProject)

  useEffect(() => { loadProjects().then(setProjects).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Не удалось загрузить проекты')).finally(() => setLoading(false)) }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('')
    if (draft.name.trim().length < 2) { setError('Укажите название проекта.'); return }
    try { const project = await createProject({ ...draft, name: draft.name.trim() }); setProjects((current) => [project, ...current]); setDraft(emptyProject); setEditing(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось создать проект') }
  }

  return <section className="projects-view">
    <div className="workspace-intro"><div><span className="eyebrow">КЛИЕНТСКАЯ РАБОТА</span><h2>Контекст хранится один раз</h2><p>Оффер, аудитория, доказательства и ограничения доступны в каждом новом креативе. Ничего отсюда не публикуется автоматически.</p></div><button className="button primary" onClick={() => setEditing(true)}><Plus />Новый проект</button></div>
    {error && <div className="workspace-error" role="alert">{error}</div>}
    {loading ? <div className="workspace-loading"><LoaderCircle />Загружаем проекты…</div> : projects.length === 0 ? <div className="project-empty"><FolderPlus /><h3>Создайте первый проект</h3><p>Заполните только постоянный контекст клиента. Креативные задачи будут создаваться внутри проекта.</p><button className="button primary" onClick={() => setEditing(true)}>Создать проект</button></div> : <div className="project-grid">{projects.map((project) => <article className="project-tile" key={project.id}><div className="project-index">{project.name.slice(0,2).toUpperCase()}</div><span>{project.geography || 'География не задана'} · {project.language}</span><h3>{project.name}</h3><p>{project.product || 'Добавьте продукт и постоянный контекст проекта.'}</p><dl><div><dt>Оффер</dt><dd>{project.offer || 'Не задан'}</dd></div><div><dt>Аудитория</dt><dd>{project.audience || 'Не задана'}</dd></div></dl><button onClick={() => onOpenCreative(project.id)}>Создать креатив <ArrowUpRight /></button></article>)}</div>}
    {editing && <div className="workspace-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false) }}><form className="project-form" onSubmit={submit}><div className="project-form-head"><div><span className="eyebrow">НОВЫЙ ПРОЕКТ</span><h2>Рабочий контекст клиента</h2></div><button type="button" aria-label="Закрыть" onClick={() => setEditing(false)}><X /></button></div><label>Название проекта<input value={draft.name} onChange={(e) => setDraft({...draft,name:e.target.value})} autoFocus /></label><div className="project-form-grid"><label>Продукт<textarea value={draft.product} onChange={(e) => setDraft({...draft,product:e.target.value})} /></label><label>География<input value={draft.geography} onChange={(e) => setDraft({...draft,geography:e.target.value})} /></label><label>Аудитория<textarea value={draft.audience} onChange={(e) => setDraft({...draft,audience:e.target.value})} /></label><label>Оффер<textarea value={draft.offer} onChange={(e) => setDraft({...draft,offer:e.target.value})} /></label><label>Доказательства<textarea value={draft.proof} onChange={(e) => setDraft({...draft,proof:e.target.value})} /></label><label>Ограничения<textarea value={draft.restrictions} onChange={(e) => setDraft({...draft,restrictions:e.target.value})} /></label></div><label>Язык<input value={draft.language} onChange={(e) => setDraft({...draft,language:e.target.value})} /></label><div className="project-form-note"><ShieldCheck />Клиентский проект изолирован от очереди автопубликации.</div><div className="project-form-actions"><button type="button" className="button secondary" onClick={() => setEditing(false)}>Отмена</button><button className="button primary">Создать проект</button></div></form></div>}
  </section>
}

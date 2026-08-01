import { useEffect, useState } from 'react'
import { ArrowLeft, FileImage, LayoutDashboard, LoaderCircle, NotebookTabs, Palette, ShieldCheck } from 'lucide-react'
import { loadProjects, type ClientProject } from './project-store'
import { CreativeLab } from './CreativeLab'
import { LibraryView } from './LibraryView'

type ProjectTab = 'overview' | 'brief' | 'creative' | 'files'

export function ProjectWorkspace({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const [project, setProject] = useState<ClientProject>()
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<ProjectTab>('overview')
  useEffect(() => { loadProjects().then((items) => setProject(items.find((item) => item.id === projectId))).finally(() => setLoading(false)) }, [projectId])
  if (loading) return <div className="workspace-loading"><LoaderCircle />Открываем проект…</div>
  if (!project) return <div className="project-empty"><h3>Проект не найден</h3><button className="button secondary" onClick={onBack}>Вернуться к проектам</button></div>

  const tabs: { id: ProjectTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'Обзор', icon: LayoutDashboard }, { id: 'brief', label: 'Бриф', icon: NotebookTabs },
    { id: 'creative', label: 'Креативы', icon: Palette }, { id: 'files', label: 'Файлы', icon: FileImage },
  ]
  return <section className="project-workspace">
    <button className="project-back" onClick={onBack}><ArrowLeft />Все проекты</button>
    <div className="project-masthead"><div className="project-monogram">{project.name.slice(0,2).toUpperCase()}</div><div><span>КЛИЕНТСКИЙ ПРОЕКТ</span><h2>{project.name}</h2><p>{project.product || 'Описание продукта ещё не заполнено'}</p></div><div className="no-publish"><ShieldCheck /><span><strong>Без автопубликации</strong>Только подготовка и экспорт файлов</span></div></div>
    <nav className="project-tabs" aria-label="Разделы проекта">{tabs.map(({id,label,icon:Icon}) => <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}><Icon />{label}</button>)}</nav>
    {tab === 'overview' && <div className="project-overview"><div className="project-next"><span className="eyebrow">СЛЕДУЮЩИЙ ШАГ</span><h3>Соберите первую креативную гипотезу</h3><p>Контекст проекта уже будет подставлен. Останется выбрать цель, аудиторию, угол и формат.</p><button className="button primary" onClick={() => setTab('creative')}>Перейти к креативам</button></div><div className="project-facts"><h3>Основа проекта</h3><dl><div><dt>География</dt><dd>{project.geography || 'Не задана'}</dd></div><div><dt>Аудитория</dt><dd>{project.audience || 'Не задана'}</dd></div><div><dt>Оффер</dt><dd>{project.offer || 'Не задан'}</dd></div><div><dt>Язык</dt><dd>{project.language}</dd></div></dl></div></div>}
    {tab === 'brief' && <div className="project-brief-view"><div><span>ПРОДУКТ</span><p>{project.product || 'Не заполнено'}</p></div><div><span>АУДИТОРИЯ</span><p>{project.audience || 'Не заполнено'}</p></div><div><span>ОФФЕР</span><p>{project.offer || 'Не заполнено'}</p></div><div><span>ДОКАЗАТЕЛЬСТВА</span><p>{project.proof || 'Не заполнено'}</p></div><div><span>ОГРАНИЧЕНИЯ</span><p>{project.restrictions || 'Не заполнено'}</p></div></div>}
    {tab === 'creative' && <CreativeLab initialProjectId={project.id} lockedProject />}
    {tab === 'files' && <LibraryView projectName={project.name} />}
  </section>
}

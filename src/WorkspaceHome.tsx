import { ArrowRight, FolderKanban, RadioTower } from 'lucide-react'

export function WorkspaceHome({ open }: { open: (view: 'projects' | 'queue') => void }) {
  return <section className="workspace-home"><div className="home-command"><span className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span><h2>Выберите проект.<br/>Дальше всё внутри.</h2><p>Клиентские проекты предназначены для подготовки и экспорта креативов. RocketPeak — отдельный проект с контентом, аккаунтами и официальными подключениями.</p></div><div className="home-routes home-routes--two"><button onClick={() => open('projects')}><FolderKanban /><span>КЛИЕНТЫ</span><strong>Клиентские проекты</strong><p>Бриф, генерация креативов, референсы, версии и файлы.</p><ArrowRight /></button><button onClick={() => open('queue')}><RadioTower /><span>СОБСТВЕННЫЙ ПРОЕКТ</span><strong>RocketPeak</strong><p>Креативы, контент-план, публикации, аккаунты и подключения.</p><ArrowRight /></button></div></section>
}

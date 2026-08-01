import { Archive, FileImage, Search } from 'lucide-react'

export function LibraryView({ projectName }: { projectName?: string }) {
  return <section className="library-view"><div className="library-toolbar"><div><span className="eyebrow">АРХИВ ПРОЕКТА</span><h2>Файлы и версии</h2><p>{projectName ? `Исходники, референсы и готовые варианты проекта «${projectName}».` : 'Исходники, референсы и готовые варианты собраны по проектам.'}</p></div><label><Search /><input placeholder="Поиск по файлам" /></label></div><div className="library-empty"><div className="library-stack"><FileImage /><Archive /></div><h3>Файлов пока нет</h3><p>Первый сохранённый результат из генератора появится здесь автоматически.</p></div></section>
}

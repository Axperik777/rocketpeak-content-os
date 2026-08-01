import { Archive, FileImage, Search } from 'lucide-react'

export function LibraryView() {
  return <section className="library-view"><div className="library-toolbar"><div><span className="eyebrow">ЕДИНЫЙ АРХИВ</span><h2>Файлы и версии</h2><p>Исходники, референсы и готовые варианты будут собраны по проектам.</p></div><label><Search /><input placeholder="Поиск по проекту или файлу" /></label></div><div className="library-empty"><div className="library-stack"><FileImage /><Archive /></div><h3>Библиотека пока пустая</h3><p>Первый сохранённый результат из креативной лаборатории появится здесь автоматически.</p></div></section>
}

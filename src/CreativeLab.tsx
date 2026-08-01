import { useEffect, useState } from 'react'
import { FileImage, LoaderCircle, Sparkles, Upload } from 'lucide-react'
import { loadProjects, type ClientProject } from './project-store'

export function CreativeLab({ initialProjectId }: { initialProjectId?: string }) {
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [projectId, setProjectId] = useState(initialProjectId ?? '')
  const [loading, setLoading] = useState(true)
  useEffect(() => { loadProjects().then((items) => { setProjects(items); setProjectId((current) => current || items[0]?.id || '') }).finally(() => setLoading(false)) }, [])
  const project = projects.find((item) => item.id === projectId)

  return <section className="creative-lab">
    <div className="lab-rail"><span className="eyebrow">CREATIVE LAB</span><h2>Новая гипотеза</h2><p>Сначала выберите проект. Постоянный контекст подставится автоматически, а референс будет влиять только на эту генерацию.</p><div className="lab-steps"><span className="active">01 Проект</span><span>02 Задача</span><span>03 Варианты</span><span>04 Экспорт</span></div></div>
    <div className="lab-workspace">
      {loading ? <div className="workspace-loading"><LoaderCircle />Загружаем контекст…</div> : <>
        <label className="lab-field">Проект<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Выберите проект</option>{projects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        {project ? <div className="context-strip"><span>КОНТЕКСТ ПОДКЛЮЧЁН</span><strong>{project.name}</strong><p>{[project.product, project.geography, project.audience].filter(Boolean).join(' · ') || 'Заполните контекст проекта.'}</p></div> : <div className="context-strip context-strip--empty"><strong>Сначала создайте проект</strong><p>Без продукта, аудитории и оффера результат будет случайным и слабым.</p></div>}
        <div className="lab-grid"><label className="lab-field">Что нужно сделать<textarea placeholder="Например: 3 статичных креатива для холодной аудитории с упором на потерю заявок…" disabled={!project} /></label><label className="reference-drop"><Upload /><strong>Добавить референс</strong><span>JPG, PNG, WebP или MP4</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" disabled={!project} /></label></div>
        <div className="lab-controls"><label className="lab-field">Формат<select disabled={!project}><option>Статичный креатив 1:1</option><option>Stories / Reels 9:16</option><option>Видео-сценарий</option><option>Только тексты объявлений</option></select></label><label className="lab-field">Канал<select disabled={!project}><option>Meta Ads</option><option>TikTok Ads</option><option>Google Ads</option></select></label></div>
        <button className="generate-button" disabled={!project} title="Станет доступно после подключения активного AI-биллинга"><Sparkles />Подготовить варианты<span>Ручной запуск · без публикации</span></button>
        <div className="lab-output-empty"><FileImage /><div><strong>Здесь появятся варианты</strong><p>Каждый вариант будет сохранён с версией, автором и исходным референсом.</p></div></div>
      </>}
    </div>
  </section>
}

import { ArrowUpRight, CalendarClock, Check, FolderKanban, FolderPlus, RadioTower, Sparkles } from 'lucide-react'

export function WorkspaceHome({ open }: { open: (view: 'projects' | 'queue') => void }) {
  return <section className="workspace-home workspace-home--premium">
    <div className="home-welcome">
      <div>
        <span className="home-kicker"><span /> Рабочий центр</span>
        <h2>Вся работа начинается<br />с проекта.</h2>
        <p>Выберите контур: клиентская работа с креативами или собственный контент RocketPeak.</p>
      </div>
      <button className="home-primary-action" onClick={() => open('projects')}>
        <FolderPlus />
        <span><small>Быстрое действие</small><strong>Создать проект</strong></span>
        <ArrowUpRight />
      </button>
    </div>

    <div className="home-workspaces" aria-label="Рабочие пространства">
      <button className="workspace-choice workspace-choice--client" onClick={() => open('projects')}>
        <div className="choice-top"><span className="choice-icon"><FolderKanban /></span><span className="choice-badge">Клиенты</span></div>
        <div className="choice-copy"><h3>Клиентские проекты</h3><p>Бриф, референсы, генерация креативов, тексты и готовые файлы.</p></div>
        <ol><li><Check />Создать проект</li><li><Check />Заполнить бриф</li><li><Check />Собрать и экспортировать</li></ol>
        <span className="choice-link">Открыть проекты <ArrowUpRight /></span>
      </button>

      <button className="workspace-choice workspace-choice--rocket" onClick={() => open('queue')}>
        <div className="choice-top"><span className="choice-icon"><RadioTower /></span><span className="choice-badge">Свой проект</span></div>
        <div className="choice-copy"><h3>RocketPeak</h3><p>Креативы, контент-план, согласование и публикации в одном контуре.</p></div>
        <ol><li><Sparkles />Подготовить материал</li><li><CalendarClock />Выбрать дату</li><li><Check />Одобрить публикацию</li></ol>
        <span className="choice-link">Перейти в RocketPeak <ArrowUpRight /></span>
      </button>
    </div>

    <div className="home-principle">
      <span>Как устроена работа</span>
      <p><b>Клиентские проекты</b> хранят результат в папках на компьютере. <b>RocketPeak</b> дополнительно управляет контентом и официальными подключениями.</p>
    </div>
  </section>
}

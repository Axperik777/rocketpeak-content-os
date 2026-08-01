import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, FileImage, LoaderCircle, Sparkles, Upload } from 'lucide-react'
import { loadProjects, type ClientProject } from './project-store'

type Brief = {
  goal: 'leads' | 'sales' | 'audit'
  stage: 'cold' | 'warm' | 'hot'
  awareness: 'problem' | 'solution' | 'product'
  angle: 'pain' | 'outcome' | 'mechanism' | 'proof'
  proof: 'case' | 'numbers' | 'process' | 'none'
  tone: 'direct' | 'expert' | 'bold' | 'calm'
  visual: 'editorial' | 'ugc' | 'product' | 'contrast'
  format: 'static' | 'story' | 'script' | 'copy'
  channel: 'meta' | 'tiktok' | 'google'
  quantity: '3' | '5' | '8'
}

const defaults: Brief = { goal: 'leads', stage: 'cold', awareness: 'problem', angle: 'pain', proof: 'process', tone: 'direct', visual: 'editorial', format: 'static', channel: 'meta', quantity: '5' }

const copy = {
  goal: { leads: 'Получить заявки', sales: 'Получить продажи', audit: 'Записать на аудит' },
  stage: { cold: 'Холодная', warm: 'Тёплая', hot: 'Горячая' },
  awareness: { problem: 'Осознаёт проблему', solution: 'Ищет решение', product: 'Сравнивает продукты' },
  angle: { pain: 'Через потерю / боль', outcome: 'Через желаемый результат', mechanism: 'Через механизм', proof: 'Через доказательство' },
  proof: { case: 'Кейс клиента', numbers: 'Подтверждённые цифры', process: 'Показать процесс', none: 'Без доказательства' },
  tone: { direct: 'Прямо и жёстко', expert: 'Экспертно', bold: 'Провокационно', calm: 'Спокойно и премиально' },
  visual: { editorial: 'Редакционный', ugc: 'Нативный / UGC', product: 'Продуктовый', contrast: 'Контраст до/после' },
  format: { static: 'Статика 1:1', story: 'Stories / Reels 9:16', script: 'Видео-сценарий', copy: 'Только тексты' },
  channel: { meta: 'Meta Ads', tiktok: 'TikTok Ads', google: 'Google Ads' },
  quantity: { '3': '3 варианта', '5': '5 вариантов', '8': '8 вариантов' },
} as const

function Choice<K extends keyof Brief>({ name, value, options, onChange }: { name: K; value: Brief[K]; options: Record<string, string>; onChange: (value: Brief[K]) => void }) {
  return <div className="brief-options" role="radiogroup">{Object.entries(options).map(([id, label]) => <button type="button" role="radio" aria-checked={value === id} className={value === id ? 'selected' : ''} onClick={() => onChange(id as Brief[K])} key={id}>{value === id && <Check />}{label}</button>)}</div>
}

export function CreativeLab({ initialProjectId }: { initialProjectId?: string }) {
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [projectId, setProjectId] = useState(initialProjectId ?? '')
  const [loading, setLoading] = useState(true)
  const [brief, setBrief] = useState<Brief>(defaults)
  useEffect(() => { loadProjects().then((items) => { setProjects(items); setProjectId((current) => current || items[0]?.id || '') }).finally(() => setLoading(false)) }, [])
  const project = projects.find((item) => item.id === projectId)
  const set = <K extends keyof Brief>(key: K, value: Brief[K]) => setBrief((current) => ({ ...current, [key]: value }))
  const direction = useMemo(() => {
    const opening = brief.stage === 'cold' ? 'Остановить скролл знакомой ситуацией, не начинать с бренда.' : brief.stage === 'warm' ? 'Связать знакомую проблему с конкретным методом решения.' : 'Снять последнее возражение и дать прямой повод действовать сейчас.'
    const argument = brief.angle === 'pain' ? 'Показать цену бездействия без запугивания.' : brief.angle === 'outcome' ? 'Сделать результат конкретным и визуально представимым.' : brief.angle === 'mechanism' ? 'Объяснить, почему подход работает иначе.' : 'Начать с проверяемого факта или демонстрации.'
    return { opening, argument }
  }, [brief.stage, brief.angle])

  return <section className="creative-brief">
    {loading ? <div className="workspace-loading"><LoaderCircle />Загружаем контекст…</div> : <>
      <div className="brief-main">
        <div className="brief-lead"><span className="eyebrow">УПРАВЛЯЕМЫЙ БРИФ</span><h2>Соберите сильную гипотезу</h2><p>Вы выбираете стратегию. Система превращает ответы в точное задание для текста и визуала.</p></div>

        <section className="brief-section"><div className="brief-number">01</div><div><h3>Контекст проекта</h3><p>Постоянные данные клиента подставляются во все варианты.</p><label className="brief-select"><span>Проект</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Выберите проект</option>{projects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{project && <div className="brief-context"><strong>{project.name}</strong><span>{[project.product, project.geography, project.audience].filter(Boolean).join(' · ') || 'Контекст проекта нужно дополнить'}</span></div>}</div></section>

        <section className="brief-section"><div className="brief-number">02</div><div><h3>Какой бизнес-результат нужен?</h3><p>От цели зависит CTA, сила оффера и способ закрытия возражений.</p><Choice name="goal" value={brief.goal} options={copy.goal} onChange={(value) => set('goal', value)} /></div></section>

        <section className="brief-section"><div className="brief-number">03</div><div><h3>Кому показываем?</h3><p>Температура определяет, сколько контекста нужно до оффера.</p><Choice name="stage" value={brief.stage} options={copy.stage} onChange={(value) => set('stage', value)} /><div className="dependent-question"><span>Что человек уже понимает?</span><Choice name="awareness" value={brief.awareness} options={copy.awareness} onChange={(value) => set('awareness', value)} /></div></div></section>

        <section className="brief-section"><div className="brief-number">04</div><div><h3>На чём строим внимание?</h3><p>Один ведущий угол на серию. Так варианты тестируют идею, а не случайный набор отличий.</p><Choice name="angle" value={brief.angle} options={copy.angle} onChange={(value) => set('angle', value)} /><div className="dependent-question"><span>Чем подтверждаем обещание?</span><Choice name="proof" value={brief.proof} options={copy.proof} onChange={(value) => set('proof', value)} /></div></div></section>

        <section className="brief-section"><div className="brief-number">05</div><div><h3>Как это должно ощущаться?</h3><p>Тон отвечает за текст, визуальный язык — за первое впечатление в ленте.</p><span className="brief-subtitle">Тон коммуникации</span><Choice name="tone" value={brief.tone} options={copy.tone} onChange={(value) => set('tone', value)} /><span className="brief-subtitle">Визуальный язык</span><Choice name="visual" value={brief.visual} options={copy.visual} onChange={(value) => set('visual', value)} /></div></section>

        <section className="brief-section"><div className="brief-number">06</div><div><h3>Что отдаём на выходе?</h3><div className="brief-triple"><label className="brief-select"><span>Формат</span><select value={brief.format} onChange={(e) => set('format', e.target.value as Brief['format'])}>{Object.entries(copy.format).map(([id,label]) => <option value={id} key={id}>{label}</option>)}</select></label><label className="brief-select"><span>Канал</span><select value={brief.channel} onChange={(e) => set('channel', e.target.value as Brief['channel'])}>{Object.entries(copy.channel).map(([id,label]) => <option value={id} key={id}>{label}</option>)}</select></label><label className="brief-select"><span>Количество</span><select value={brief.quantity} onChange={(e) => set('quantity', e.target.value as Brief['quantity'])}>{Object.entries(copy.quantity).map(([id,label]) => <option value={id} key={id}>{label}</option>)}</select></label></div><label className="reference-drop"><Upload /><strong>Добавить референс</strong><span>Система возьмёт композиционный принцип, но не будет копировать материал.</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" disabled={!project} /></label></div></section>
      </div>

      <aside className="brief-summary"><div className="summary-sticky"><span className="eyebrow">НАПРАВЛЕНИЕ ГЕНЕРАЦИИ</span><h3>{project?.name || 'Выберите проект'}</h3><div className="summary-tags"><span>{copy.goal[brief.goal]}</span><span>{copy.stage[brief.stage]}</span><span>{copy.channel[brief.channel]}</span></div><div className="summary-rule"><small>Первый экран</small><p>{direction.opening}</p></div><div className="summary-rule"><small>Аргумент</small><p>{direction.argument}</p></div><dl><div><dt>Угол</dt><dd>{copy.angle[brief.angle]}</dd></div><div><dt>Доказательство</dt><dd>{copy.proof[brief.proof]}</dd></div><div><dt>Стиль</dt><dd>{copy.visual[brief.visual]}</dd></div><div><dt>Выход</dt><dd>{copy.quantity[brief.quantity]} · {copy.format[brief.format]}</dd></div></dl><button className="brief-generate" disabled={!project}><Sparkles />Сгенерировать пакет<ChevronRight /></button><small className="summary-note">Создаст версии в библиотеке. Ничего не публикуется.</small></div><div className="brief-preview"><FileImage /><span>Превью появится после генерации</span></div></aside>
    </>}
  </section>
}

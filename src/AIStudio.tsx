import { useMemo, useState } from 'react'
import { ArrowRight, BrainCircuit, Check, CircleAlert, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react'
import { supabase } from './supabase'

export type GeneratedDraft = {
  pillar: string
  title: string
  hook: string
  format: string
  facebookCaption: string
  instagramCaption: string
  tiktokCaption: string
  cta: string
  visualDirection: string
  riskNotes: string[]
}

type Brief = {
  objective: string
  audience: string
  offer: string
  proof: string
  tone: string
}

const initialBrief: Brief = {
  objective: 'Получить обращения на аудит рекламы и воронки',
  audience: 'Владельцы бизнеса и руководители маркетинга с действующей рекламой',
  offer: 'Диагностика рекламы, оффера, посадочной страницы и обработки заявок',
  proof: 'Использовать только подтверждённые факты из брифа. Не придумывать цифры и кейсы.',
  tone: 'Прямой, экспертный, без инфобизнесовых обещаний',
}

export function AIStudio({ onAddDrafts }: { onAddDrafts: (drafts: GeneratedDraft[]) => Promise<void> }) {
  const [brief, setBrief] = useState(initialBrief)
  const [drafts, setDrafts] = useState<GeneratedDraft[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [state, setState] = useState<'idle' | 'generating' | 'ready' | 'saving' | 'error'>('idle')
  const [error, setError] = useState('')
  const selectedCount = selected.size
  const completeness = useMemo(() => Object.values(brief).filter((value) => value.trim()).length, [brief])

  const updateBrief = (field: keyof Brief, value: string) => setBrief((current) => ({ ...current, [field]: value }))

  const generate = async () => {
    if (!supabase || completeness < 5) {
      setError(completeness < 5 ? 'Заполните все поля брифа.' : 'Supabase не подключён.')
      setState('error')
      return
    }
    setState('generating')
    setError('')
    const { data, error: invokeError } = await supabase.functions.invoke('generate-content', { body: { brief, count: 3 } })
    let failure = data
    if (invokeError && !failure && 'context' in invokeError && invokeError.context instanceof Response) {
      failure = await invokeError.context.json().catch(() => null)
    }
    if (invokeError || !Array.isArray(data?.drafts) || data.drafts.length !== 3) {
      setError(failure?.error === 'openai_not_configured'
        ? 'AI подготовлен, но серверный ключ OpenAI ещё не добавлен.'
        : failure?.error === 'daily_limit_reached'
          ? 'Дневной лимит генераций исчерпан. Это защищает бюджет и аккаунт от всплесков.'
          : failure?.upstreamCode === 'insufficient_quota'
            ? 'На API OpenAI не подключён баланс. Добавьте способ оплаты и лимит расходов в Platform OpenAI.'
            : failure?.upstreamCode === 'model_not_found'
              ? 'Выбранная модель OpenAI недоступна этому проекту. Нужно сменить модель или доступ проекта.'
              : failure?.upstreamCode === 'invalid_api_key'
                ? 'Серверный ключ OpenAI недействителен. Создайте новый ключ для текущего проекта.'
                : failure?.upstreamCode && failure.upstreamCode !== 'unknown'
                  ? `OpenAI отклонил запрос: ${failure.upstreamCode}. Черновики не изменены.`
          : 'Генерация не завершена. Черновики и очередь публикаций не изменены.')
      setState('error')
      return
    }
    setDrafts(data.drafts)
    setSelected(new Set([0, 1, 2]))
    setState('ready')
  }

  const addSelected = async () => {
    const chosen = drafts.filter((_, index) => selected.has(index))
    if (!chosen.length) return
    setState('saving')
    try {
      await onAddDrafts(chosen)
      setDrafts([])
      setSelected(new Set())
      setState('idle')
    } catch {
      setError('Не удалось сохранить пакет. Очередь не изменена.')
      setState('error')
    }
  }

  const toggle = (index: number) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    return next
  })

  return <section className="ai-studio" aria-label="AI-студия контента">
    <div className="ai-command panel">
      <div className="ai-command__intro">
        <span className="ai-orbit" aria-hidden="true"><BrainCircuit /><i /><i /><i /></span>
        <div><span className="eyebrow">ROCKETPEAK INTELLIGENCE</span><h2>Один бриф. Три решения.</h2><p>Система создаёт пакет на день, разделяет тексты по платформам и оставляет финальное решение за вами.</p></div>
      </div>
      <div className="ai-signal"><span><i className="live-dot" />Контур генерации</span><strong>{completeness}/5</strong><small>параметров готово</small></div>
    </div>

    <div className="ai-workbench">
      <form className="ai-brief panel" onSubmit={(event) => { event.preventDefault(); void generate() }}>
        <div className="section-head"><div><span className="eyebrow">УПРАВЛЯЮЩИЙ БРИФ</span><h2>Что должен сделать контент</h2></div><span className="ai-secure"><Check />Только черновики</span></div>
        <label><span>Цель</span><textarea rows={2} value={brief.objective} onChange={(event) => updateBrief('objective', event.target.value)} /></label>
        <label><span>Аудитория</span><textarea rows={2} value={brief.audience} onChange={(event) => updateBrief('audience', event.target.value)} /></label>
        <label><span>Оффер</span><textarea rows={2} value={brief.offer} onChange={(event) => updateBrief('offer', event.target.value)} /></label>
        <label><span>Факты и ограничения</span><textarea rows={2} value={brief.proof} onChange={(event) => updateBrief('proof', event.target.value)} /></label>
        <label><span>Тон</span><input value={brief.tone} onChange={(event) => updateBrief('tone', event.target.value)} /></label>
        {error && <div className="ai-error" role="alert"><CircleAlert />{error}</div>}
        <button className="button primary ai-generate" disabled={state === 'generating' || state === 'saving'}>
          {state === 'generating' ? <><LoaderCircle className="spin" />Проектируем пакет…</> : drafts.length ? <><RefreshCw />Создать другие варианты</> : <><Sparkles />Создать 3 материала</>}
        </button>
      </form>

      <div className="ai-results panel">
        <div className="section-head"><div><span className="eyebrow">ПАКЕТ НА ДЕНЬ</span><h2>{drafts.length ? 'Варианты готовы к отбору' : 'Здесь появятся решения'}</h2></div>{drafts.length > 0 && <strong className="ai-count">{selectedCount}/3</strong>}</div>
        {drafts.length === 0 ? <div className="ai-empty"><BrainCircuit /><strong>AI не публикует сам</strong><p>Сначала создаются версии. Затем вы выбираете нужные и отправляете их в обычную очередь согласования.</p></div> : <div className="ai-draft-list">
          {drafts.map((draft, index) => <article className={selected.has(index) ? 'is-selected' : ''} key={`${draft.title}-${index}`}>
            <button type="button" className="ai-select" onClick={() => toggle(index)} aria-pressed={selected.has(index)}><span>{selected.has(index) ? <Check /> : index + 1}</span></button>
            <div className="ai-draft-main"><span>{draft.pillar} · {draft.format}</span><h3>{draft.title}</h3><p>{draft.hook}</p><small>{draft.visualDirection}</small></div>
            <div className="ai-platforms"><b>FB</b><b>IG</b><b>TT</b>{draft.riskNotes.length > 0 && <em title={draft.riskNotes.join('\n')}>Проверить {draft.riskNotes.length}</em>}</div>
          </article>)}
        </div>}
        {drafts.length > 0 && <button type="button" className="button primary ai-commit" onClick={() => void addSelected()} disabled={!selectedCount || state === 'saving'}>{state === 'saving' ? <LoaderCircle className="spin" /> : <ArrowRight />}Добавить {selectedCount} в очередь</button>}
      </div>
    </div>
  </section>
}

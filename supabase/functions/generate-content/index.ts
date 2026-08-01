import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const safetyIdentifier = async (userId: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`rocketpeak:${userId}`))
  return `rp_${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32)}`
}

const draftSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    drafts: {
      type: 'array', minItems: 3, maxItems: 3,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          pillar: { type: 'string' }, title: { type: 'string' }, hook: { type: 'string' }, format: { type: 'string' },
          facebookCaption: { type: 'string' }, instagramCaption: { type: 'string' }, tiktokCaption: { type: 'string' },
          cta: { type: 'string' }, visualDirection: { type: 'string' }, riskNotes: { type: 'array', items: { type: 'string' } },
        },
        required: ['pillar', 'title', 'hook', 'format', 'facebookCaption', 'instagramCaption', 'tiktokCaption', 'cta', 'visualDirection', 'riskNotes'],
      },
    },
  }, required: ['drafts'],
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiKey) return json({ error: 'openai_not_configured' }, 503)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !publishableKey) return json({ error: 'server_not_configured' }, 500)
  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'unauthorized' }, 401)
  const client = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError || !user) return json({ error: 'unauthorized' }, 401)

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return json({ error: 'invalid_json' }, 400) }
  const brief = typeof body.brief === 'object' && body.brief !== null ? body.brief as Record<string, unknown> : {}
  const normalized = {
    objective: text(brief.objective, 500), audience: text(brief.audience, 500), offer: text(brief.offer, 700),
    proof: text(brief.proof, 700), tone: text(brief.tone, 300),
  }
  if (Object.values(normalized).some((value) => !value)) return json({ error: 'brief_incomplete' }, 400)
  const reservation = await client.rpc('reserve_ai_generation', { p_daily_limit: 12 })
  if (reservation.error) return json({ error: 'generation_guard_unavailable' }, 503)
  if (reservation.data !== true) return json({ error: 'daily_limit_reached' }, 429)

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_CONTENT_MODEL') ?? 'gpt-5.6-terra',
      reasoning: { effort: 'low' },
      safety_identifier: await safetyIdentifier(user.id),
      instructions: `Ты редактор performance-маркетингового агентства RocketPeak. Создай ровно три существенно разных материала на один день. Пиши по-русски, прямо и профессионально. Каждый материал должен иметь собственную роль в воронке: диагностика проблемы, объяснение механизма, коммерческое действие. Не придумывай цифры, отзывы, клиентов, результаты или гарантии. Если доказательства не даны, отметь это в riskNotes. Facebook допускает развёрнутый аргумент, Instagram должен быть плотнее и визуальнее, TikTok — короткий разговорный хук и подпись без неподтверждённых трендов. Не добавляй водяные знаки и указания обходить правила площадок.`,
      input: JSON.stringify(normalized),
      text: { format: { type: 'json_schema', name: 'rocketpeak_content_batch', strict: true, schema: draftSchema } },
    }),
  })
  const result = await response.json()
  if (!response.ok) {
    const upstreamError = typeof result?.error === 'object' && result.error !== null ? result.error : {}
    return json({
      error: 'generation_failed',
      upstreamCode: text(upstreamError.code ?? upstreamError.type, 120) || 'unknown',
      requestId: response.headers.get('x-request-id'),
    }, response.status >= 500 ? 502 : 400)
  }
  const output = result.output_text ?? result.output?.flatMap((item: Record<string, unknown>) => Array.isArray(item.content) ? item.content : []).find((item: Record<string, unknown>) => item.type === 'output_text')?.text
  if (typeof output !== 'string') return json({ error: 'invalid_model_output' }, 502)
  try {
    const parsed = JSON.parse(output)
    if (!Array.isArray(parsed.drafts) || parsed.drafts.length !== 3) throw new Error('invalid_count')
    return json({ drafts: parsed.drafts, model: result.model, responseId: result.id })
  } catch {
    return json({ error: 'invalid_model_output' }, 502)
  }
})

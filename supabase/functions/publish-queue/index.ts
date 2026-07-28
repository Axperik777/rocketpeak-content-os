import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const workerSecret = Deno.env.get('PUBLICATION_WORKER_SECRET')
  if (!workerSecret || request.headers.get('x-worker-secret') !== workerSecret) return json({ error: 'unauthorized' }, 401)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json({ error: 'server_not_configured' }, 500)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const claimed = await admin.rpc('claim_publication_jobs', { p_limit: 10 })
  if (claimed.error) return json({ error: 'claim_failed' }, 500)

  const results = []
  for (const job of claimed.data ?? []) {
    // Meta mode remains unreachable until the owner explicitly enables the gate
    // and configures verified credentials. Mock mode proves queue semantics only.
    const remotePostId = `mock_${job.channel.toLowerCase()}_${job.id}`
    const finished = await admin.rpc('finish_publication_job', {
      p_job_id: job.id,
      p_succeeded: true,
      p_remote_post_id: remotePostId,
      p_error_code: null,
      p_error_message: null,
      p_retryable: false,
    })
    results.push({ jobId: job.id, ok: !finished.error, remotePostId })
  }
  return json({ mode: 'mock', claimed: results.length, results })
})

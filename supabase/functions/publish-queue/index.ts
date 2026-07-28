import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptToken, encryptToken } from '../_shared/token-crypto.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const retryableCodes = new Set(['rate_limit_exceeded', 'internal_error', 'server_error'])

async function refreshTikTokToken(admin: ReturnType<typeof createClient>, connection: Record<string, unknown>) {
  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY')
  const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET')
  if (!clientKey || !clientSecret) throw new Error('tiktok_not_configured')
  const refreshToken = await decryptToken(String(connection.refresh_token_ciphertext), String(connection.refresh_token_iv))
  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }) })
  const token = await response.json()
  if (!response.ok || !token.access_token) throw new Error(token.error ?? 'tiktok_refresh_failed')
  const access = await encryptToken(token.access_token)
  const refresh = await encryptToken(token.refresh_token ?? refreshToken)
  const now = Date.now()
  const updated = { access_token_ciphertext: access.ciphertext, access_token_iv: access.iv, refresh_token_ciphertext: refresh.ciphertext, refresh_token_iv: refresh.iv, access_token_expires_at: new Date(now + token.expires_in * 1000).toISOString(), refresh_token_expires_at: new Date(now + token.refresh_expires_in * 1000).toISOString(), granted_scopes: String(token.scope ?? '').split(',').filter(Boolean), updated_at: new Date().toISOString() }
  const saved = await admin.from('tiktok_connections').update(updated).eq('owner_id', connection.owner_id)
  if (saved.error) throw new Error('tiktok_token_store_failed')
  return token.access_token as string
}

async function tiktokAccessToken(admin: ReturnType<typeof createClient>, ownerId: string) {
  const result = await admin.from('tiktok_connections').select('*').eq('owner_id', ownerId).eq('status', 'connected').maybeSingle()
  if (result.error || !result.data) throw new Error('tiktok_not_connected')
  if (new Date(result.data.access_token_expires_at).getTime() < Date.now() + 5 * 60 * 1000) return refreshTikTokToken(admin, result.data)
  return decryptToken(result.data.access_token_ciphertext, result.data.access_token_iv)
}

async function uploadInChunks(uploadUrl: string, bytes: Uint8Array, chunkSize: number) {
  for (let start = 0; start < bytes.byteLength; start += chunkSize) {
    const end = Math.min(start + chunkSize, bytes.byteLength)
    const response = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(end - start), 'Content-Range': `bytes ${start}-${end - 1}/${bytes.byteLength}` }, body: bytes.slice(start, end) })
    if (!response.ok) throw new Error(`tiktok_upload_${response.status}`)
  }
}

async function publishTikTok(admin: ReturnType<typeof createClient>, job: Record<string, unknown>) {
  const [postResult, mediaResult] = await Promise.all([
    admin.from('posts').select('tiktok_caption,tiktok_privacy').eq('id', job.post_id).eq('owner_id', job.owner_id).single(),
    admin.from('media_assets').select('storage_path,size_bytes').eq('post_id', job.post_id).eq('owner_id', job.owner_id).eq('mime_type', 'video/mp4').eq('validation_status', 'ready').order('created_at').limit(1).single(),
  ])
  if (postResult.error) throw new Error('post_not_found')
  if (mediaResult.error) throw new Error('tiktok_requires_mp4_video')
  const accessToken = await tiktokAccessToken(admin, String(job.owner_id))
  const creator = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' }, body: '{}' })
  const creatorData = await creator.json()
  const privacy = postResult.data.tiktok_privacy
  if (!creator.ok || creatorData.error?.code !== 'ok') throw new Error(creatorData.error?.code ?? 'tiktok_creator_query_failed')
  if (!creatorData.data?.privacy_level_options?.includes(privacy)) throw new Error('tiktok_privacy_unavailable')

  const signed = await admin.storage.from('content-media').createSignedUrl(mediaResult.data.storage_path, 600)
  if (signed.error) throw new Error('media_sign_failed')
  const mediaResponse = await fetch(signed.data.signedUrl)
  if (!mediaResponse.ok) throw new Error('media_download_failed')
  const bytes = new Uint8Array(await mediaResponse.arrayBuffer())
  const chunkSize = Math.min(bytes.byteLength, 10 * 1024 * 1024)
  const initialized = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ post_info: { title: String(postResult.data.tiktok_caption).slice(0, 2200), privacy_level: privacy, disable_duet: false, disable_comment: false, disable_stitch: false }, source_info: { source: 'FILE_UPLOAD', video_size: bytes.byteLength, chunk_size: chunkSize, total_chunk_count: Math.ceil(bytes.byteLength / chunkSize) } }) })
  const initData = await initialized.json()
  if (!initialized.ok || initData.error?.code !== 'ok') throw new Error(initData.error?.code ?? 'tiktok_init_failed')
  await uploadInChunks(initData.data.upload_url, bytes, chunkSize)
  return initData.data.publish_id as string
}

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
    try {
      const remotePostId = job.channel === 'TikTok' ? await publishTikTok(admin, job) : `mock_${job.channel.toLowerCase()}_${job.id}`
      const finished = await admin.rpc('finish_publication_job', { p_job_id: job.id, p_succeeded: true, p_remote_post_id: remotePostId, p_error_code: null, p_error_message: null, p_retryable: false })
      results.push({ jobId: job.id, channel: job.channel, ok: !finished.error, remotePostId })
    } catch (error) {
      const code = error instanceof Error ? error.message : 'unknown_error'
      const retryable = retryableCodes.has(code) || code.startsWith('tiktok_upload_5')
      await admin.rpc('finish_publication_job', { p_job_id: job.id, p_succeeded: false, p_remote_post_id: null, p_error_code: code, p_error_message: code, p_retryable: retryable })
      results.push({ jobId: job.id, channel: job.channel, ok: false, error: code, retryable })
    }
  }
  return json({ claimed: results.length, results })
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigin = Deno.env.get('APP_ORIGIN') ?? 'https://axperik777.github.io'
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function startsWith(bytes: Uint8Array, expected: number[]) {
  return expected.every((value, index) => bytes[index] === value)
}

function asciiIncludes(bytes: Uint8Array, value: string) {
  return new TextDecoder('latin1').decode(bytes).includes(value)
}

function validateSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === 'image/jpeg') return startsWith(bytes, [0xff, 0xd8, 0xff])
  if (mimeType === 'image/png') return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (mimeType === 'image/webp') return asciiIncludes(bytes.slice(0, 16), 'RIFF') && asciiIncludes(bytes.slice(0, 16), 'WEBP')
  if (mimeType === 'video/mp4' || mimeType === 'video/quicktime') {
    const probe = bytes.slice(0, Math.min(bytes.length, 8 * 1024 * 1024))
    return asciiIncludes(probe, 'ftyp') && asciiIncludes(probe, 'moov') && asciiIncludes(probe, 'mdat')
      && (asciiIncludes(probe, 'avc1') || asciiIncludes(probe, 'avc3'))
  }
  return false
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'server_not_configured' }, 500)

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)

  const body = await request.json().catch(() => null) as { assetId?: string; probe?: boolean } | null
  if (body?.probe === true) return json({ status: 'ok', authenticated: true })
  if (!body?.assetId) return json({ error: 'asset_id_required' }, 400)

  const admin = createClient(supabaseUrl, serviceKey)
  const assetResult = await admin.from('media_assets').select('*').eq('id', body.assetId).eq('owner_id', userData.user.id).single()
  if (assetResult.error || !assetResult.data) return json({ error: 'asset_not_found' }, 404)

  const asset = assetResult.data
  await admin.from('media_assets').update({ validation_status: 'processing', validation_error: null }).eq('id', asset.id)

  const downloaded = await admin.storage.from('content-media').download(asset.storage_path)
  if (downloaded.error || !downloaded.data) {
    await admin.from('media_assets').update({ validation_status: 'failed', validation_error: 'storage_download_failed' }).eq('id', asset.id)
    return json({ error: 'storage_download_failed' }, 422)
  }

  const bytes = new Uint8Array(await downloaded.data.arrayBuffer())
  const digest = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
  let error = ''
  if (bytes.byteLength !== Number(asset.size_bytes)) error = 'size_mismatch'
  else if (digest !== asset.checksum_sha256) error = 'checksum_mismatch'
  else if (!validateSignature(bytes, asset.mime_type)) error = asset.mime_type.startsWith('video/') ? 'unsupported_video_container_or_codec' : 'invalid_file_signature'

  const validationStatus = error ? 'failed' : 'ready'
  const updated = await admin.from('media_assets').update({
    validation_status: validationStatus,
    validation_error: error || null,
    validated_at: error ? null : new Date().toISOString(),
  }).eq('id', asset.id)
  if (updated.error) return json({ error: 'status_update_failed' }, 500)

  return json({ assetId: asset.id, status: validationStatus, error: error || null })
})

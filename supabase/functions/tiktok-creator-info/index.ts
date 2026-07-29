import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const encoder = new TextEncoder()
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function hexBytes(value: string) {
  const hex = value.startsWith('\\x') ? value.slice(2) : value
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16))
}

async function tokenKey() {
  const encoded = Deno.env.get('TOKEN_ENCRYPTION_KEY')
  if (!encoded) throw new Error('token_key_missing')
  const raw = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
}

async function decrypt(ciphertext: string, iv: string) {
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexBytes(iv) }, await tokenKey(), hexBytes(ciphertext))
  return new TextDecoder().decode(clear)
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!url || !anonKey || !serviceKey || !authorization) return json({ error: 'unauthorized' }, 401)

  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const userResult = await authClient.auth.getUser()
  if (userResult.error || !userResult.data.user) return json({ error: 'unauthorized' }, 401)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const connection = await admin.from('tiktok_connections').select('access_token_ciphertext,access_token_iv,status').eq('owner_id', userResult.data.user.id).maybeSingle()
  if (connection.error || !connection.data || connection.data.status !== 'connected') return json({ error: 'tiktok_not_connected' }, 409)

  const accessToken = await decrypt(connection.data.access_token_ciphertext, connection.data.access_token_iv)
  const response = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' }, body: '{}',
  })
  const payload = await response.json()
  if (!response.ok || payload.error?.code !== 'ok') return json({ error: payload.error?.code ?? 'creator_info_failed' }, 502)
  const data = payload.data ?? {}
  return json({
    nickname: data.creator_nickname,
    username: data.creator_username,
    avatarUrl: data.creator_avatar_url,
    privacyOptions: data.privacy_level_options ?? [],
    commentDisabled: data.comment_disabled === true,
    duetDisabled: data.duet_disabled === true,
    stitchDisabled: data.stitch_disabled === true,
    maxVideoDurationSec: data.max_video_post_duration_sec,
  })
})

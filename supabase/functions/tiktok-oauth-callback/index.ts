import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const encoder = new TextEncoder()
function bytesToPostgresHex(bytes: Uint8Array) {
  return `\\x${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
async function encryptionKey() {
  const encoded = Deno.env.get('TOKEN_ENCRYPTION_KEY')
  if (!encoded) throw new Error('token_encryption_key_missing')
  const raw = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
  if (raw.byteLength !== 32) throw new Error('token_encryption_key_invalid')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])
}
async function encryptToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), encoder.encode(value))
  return { ciphertext: bytesToPostgresHex(new Uint8Array(ciphertext)), iv: bytesToPostgresHex(iv) }
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const html = (message: string, status = 200) => new Response(`<!doctype html><meta charset="utf-8"><title>RocketPeak</title><body style="font:16px system-ui;background:#10130f;color:#f5f4ef;padding:40px"><h1>${message}</h1><p>Эту вкладку можно закрыть.</p></body>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })

Deno.serve(async (request) => {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const state = requestUrl.searchParams.get('state')
  if (!code || !state) return html('TikTok не передал код авторизации.', 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY')
  const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET')
  if (!supabaseUrl || !serviceKey || !clientKey || !clientSecret) return html('TikTok пока не настроен.', 503)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const stateHash = await sha256(state)
  const stored = await admin.from('tiktok_oauth_states').select('*').eq('state_hash', stateHash).is('used_at', null).gt('expires_at', new Date().toISOString()).maybeSingle()
  if (stored.error || !stored.data) return html('Ссылка авторизации истекла или уже использована.', 400)

  await admin.from('tiktok_oauth_states').update({ used_at: new Date().toISOString() }).eq('state_hash', stateHash).is('used_at', null)
  const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, code, grant_type: 'authorization_code', redirect_uri: stored.data.redirect_uri }),
  })
  const token = await tokenResponse.json()
  if (!tokenResponse.ok || !token.access_token || !token.refresh_token) return html('TikTok отклонил обмен токена.', 400)

  const access = await encryptToken(token.access_token)
  const refresh = await encryptToken(token.refresh_token)
  const now = Date.now()
  const saved = await admin.from('tiktok_connections').upsert({
    owner_id: stored.data.owner_id,
    status: 'connected',
    open_id: token.open_id,
    access_token_ciphertext: access.ciphertext,
    access_token_iv: access.iv,
    refresh_token_ciphertext: refresh.ciphertext,
    refresh_token_iv: refresh.iv,
    access_token_expires_at: new Date(now + token.expires_in * 1000).toISOString(),
    refresh_token_expires_at: new Date(now + token.refresh_expires_in * 1000).toISOString(),
    granted_scopes: String(token.scope ?? '').split(',').filter(Boolean),
    last_verified_at: new Date().toISOString(),
    last_error_code: null,
    last_error_message: null,
    updated_at: new Date().toISOString(),
  })
  if (saved.error) return html('Не удалось сохранить подключение TikTok.', 500)

  await admin.from('publication_controls').update({ publication_enabled: true, enabled_channels: ['TikTok'], disabled_reason: 'Meta remains disabled; TikTok enabled after OAuth', updated_at: new Date().toISOString() }).eq('owner_id', stored.data.owner_id)
  return html('TikTok подключён к RocketPeak Content OS.')
})

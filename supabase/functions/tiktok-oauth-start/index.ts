import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sha256 } from '../_shared/token-crypto.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY')
  const redirectUri = Deno.env.get('TIKTOK_REDIRECT_URI')
  if (!supabaseUrl || !anonKey || !serviceKey || !clientKey || !redirectUri) return json({ error: 'tiktok_not_configured' }, 503)

  const authorization = request.headers.get('Authorization') ?? ''
  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: userData, error: userError } = await authClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)

  const rawState = crypto.randomUUID() + crypto.randomUUID()
  const stateHash = await sha256(rawState)
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const stored = await admin.from('tiktok_oauth_states').insert({
    state_hash: stateHash,
    owner_id: userData.user.id,
    redirect_uri: redirectUri,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  })
  if (stored.error) return json({ error: 'state_store_failed' }, 500)

  const query = new URLSearchParams({
    client_key: clientKey,
    response_type: 'code',
    scope: 'user.info.basic,video.publish',
    redirect_uri: redirectUri,
    state: rawState,
  })
  return json({ authorizationUrl: `https://www.tiktok.com/v2/auth/authorize/?${query}` })
})

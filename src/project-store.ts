import { supabase } from './supabase'

export type ClientProject = {
  id: string
  workspaceId: string
  name: string
  product: string
  geography: string
  audience: string
  offer: string
  proof: string
  restrictions: string
  language: string
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

type ProjectRow = {
  id: string; workspace_id: string; name: string; product: string; geography: string; audience: string
  offer: string; proof: string; restrictions: string; language: string; created_by: string; updated_by: string
  created_at: string; updated_at: string; archived_at: string | null
}

const mapProject = (row: ProjectRow): ClientProject => ({
  id: row.id, workspaceId: row.workspace_id, name: row.name, product: row.product,
  geography: row.geography, audience: row.audience, offer: row.offer, proof: row.proof,
  restrictions: row.restrictions, language: row.language, createdBy: row.created_by,
  updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at, archivedAt: row.archived_at,
})

export async function loadProjects(): Promise<ClientProject[]> {
  if (!supabase) return []
  const { data: workspaceId, error: workspaceError } = await supabase.rpc('ensure_workspace')
  if (workspaceError) throw workspaceError
  const { data, error } = await supabase.from('client_projects').select('*').eq('workspace_id', workspaceId).is('archived_at', null).order('updated_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as ProjectRow[]).map(mapProject)
}

export async function createProject(input: Pick<ClientProject, 'name' | 'product' | 'geography' | 'audience' | 'offer' | 'proof' | 'restrictions' | 'language'>): Promise<ClientProject> {
  if (!supabase) throw new Error('Supabase не настроен')
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Сессия не найдена')
  const { data: workspaceId, error: workspaceError } = await supabase.rpc('ensure_workspace')
  if (workspaceError) throw workspaceError
  const { data, error } = await supabase.from('client_projects').insert({ workspace_id: workspaceId, ...input, created_by: auth.user.id, updated_by: auth.user.id }).select('*').single()
  if (error) throw error
  return mapProject(data as ProjectRow)
}

export async function createWorkspaceInvite(): Promise<string> {
  if (!supabase) throw new Error('Supabase не настроен')
  const { data, error } = await supabase.rpc('create_workspace_invite')
  if (error) throw error
  return String(data)
}

export async function joinWorkspace(code: string): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен')
  const { error } = await supabase.rpc('join_workspace_by_invite', { raw_token: code })
  if (error) throw new Error(error.message.includes('invite_invalid') ? 'Код недействителен или истёк.' : error.message)
}

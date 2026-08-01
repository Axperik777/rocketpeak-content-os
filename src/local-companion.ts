import type { ClientProject } from './project-store'

const endpoint = ['127.0.0.1', 'localhost'].includes(window.location.hostname)
  ? `${window.location.origin}/api`
  : 'http://127.0.0.1:43121'

export type LocalCompanionStatus = { online: boolean; root?: string; host?: string }

export async function getLocalCompanionStatus(): Promise<LocalCompanionStatus> {
  try {
    const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(1400) })
    if (!response.ok) return { online: false }
    const data = await response.json() as { root?: string; host?: string }
    return { online: true, root: data.root, host: data.host }
  } catch { return { online: false } }
}

export async function ensureLocalProject(project: ClientProject): Promise<string> {
  const response = await fetch(`${endpoint}/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project) })
  const data = await response.json() as { path?: string; error?: string }
  if (!response.ok || !data.path) throw new Error(data.error ?? 'local_companion_unavailable')
  return data.path
}

export type PublicationState = 'pending' | 'processing' | 'published' | 'failed'

export type PublicationJob = {
  id: string
  idempotencyKey: string
  runAfter: string
  state: PublicationState
  attemptCount: number
  remotePostId: string | null
  lastErrorCode: string | null
}

export type ProviderResult =
  | { ok: true; remotePostId: string; final?: boolean }
  | { ok: false; code: string; retryable: boolean }

export function createPublicationJob(id: string, postId: string, version: number, channel: string, runAfter: string): PublicationJob {
  return { id, idempotencyKey: `${postId}:${version}:${channel.toLowerCase()}`, runAfter, state: 'pending', attemptCount: 0, remotePostId: null, lastErrorCode: null }
}

export function claimDueJobs(jobs: PublicationJob[], now: string, limit = 10) {
  const seen = new Set<string>()
  return jobs
    .filter((job) => job.state === 'pending' && job.runAfter <= now)
    .filter((job) => {
      if (seen.has(job.idempotencyKey)) return false
      seen.add(job.idempotencyKey)
      return true
    })
    .slice(0, limit)
    .map((job) => ({ ...job, state: 'processing' as const, attemptCount: job.attemptCount + 1 }))
}

export function finishJob(job: PublicationJob, result: ProviderResult, now: string, maxAttempts = 4): PublicationJob {
  if (result.ok && result.final === false) return { ...job, state: 'processing', remotePostId: result.remotePostId, lastErrorCode: null }
  if (result.ok) return { ...job, state: 'published', remotePostId: result.remotePostId, lastErrorCode: null }
  if (result.retryable && job.attemptCount < maxAttempts) {
    const delayMinutes = 2 ** job.attemptCount
    return { ...job, state: 'pending', runAfter: new Date(Date.parse(now) + delayMinutes * 60_000).toISOString(), lastErrorCode: result.code }
  }
  return { ...job, state: 'failed', lastErrorCode: result.code }
}

import { describe, expect, it } from 'vitest'
import { claimDueJobs, createPublicationJob, finishJob } from './publication-engine'

describe('publication queue', () => {
  const now = '2026-08-10T12:00:00.000Z'

  it('processes three posts scheduled for one day', () => {
    const jobs = ['09:00', '13:00', '18:00'].map((time, index) => createPublicationJob(String(index), `post-${index}`, 1, 'Facebook', `2026-08-10T${time}:00.000Z`))
    expect(claimDueJobs(jobs, '2026-08-10T23:00:00.000Z')).toHaveLength(3)
  })

  it('claims only one duplicate idempotency key', () => {
    const first = createPublicationJob('1', 'post-1', 1, 'Facebook', now)
    const duplicate = { ...first, id: '2' }
    expect(claimDueJobs([first, duplicate], now)).toHaveLength(1)
  })

  it('publishes a successful job with a remote id', () => {
    const [claimed] = claimDueJobs([createPublicationJob('1', 'post-1', 1, 'Facebook', now)], now)
    expect(finishJob(claimed, { ok: true, remotePostId: 'mock_post_1' }, now)).toMatchObject({ state: 'published', remotePostId: 'mock_post_1' })
  })

  it('keeps asynchronous provider uploads in processing until confirmed', () => {
    const now = '2026-08-01T10:00:00.000Z'
    const [claimed] = claimDueJobs([createPublicationJob('job-async', 'post-async', 1, 'TikTok', now)], now)
    expect(finishJob(claimed, { ok: true, remotePostId: 'publish-123', final: false }, now)).toMatchObject({ state: 'processing', remotePostId: 'publish-123' })
  })

  it('retries a temporary error and then succeeds', () => {
    const [claimed] = claimDueJobs([createPublicationJob('1', 'post-1', 1, 'Facebook', now)], now)
    const retry = finishJob(claimed, { ok: false, code: 'rate_limited', retryable: true }, now)
    expect(retry).toMatchObject({ state: 'pending', attemptCount: 1, lastErrorCode: 'rate_limited' })
    const [claimedAgain] = claimDueJobs([retry], retry.runAfter)
    expect(finishJob(claimedAgain, { ok: true, remotePostId: 'mock_post_1' }, retry.runAfter).state).toBe('published')
  })

  it('stops retrying permanent errors', () => {
    const [claimed] = claimDueJobs([createPublicationJob('1', 'post-1', 1, 'Instagram', now)], now)
    expect(finishJob(claimed, { ok: false, code: 'invalid_media', retryable: false }, now).state).toBe('failed')
  })
})

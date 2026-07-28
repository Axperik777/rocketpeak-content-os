import { describe, expect, it } from 'vitest'
import { createDraftPost, getScheduleError, type Post } from './content-store'

function post(id: string, date: string, time: string, status: Post['status'] = 'draft'): Post {
  return { ...createDraftPost(), id, scheduledDate: date, scheduledTime: time, status }
}

describe('daily schedule capacity', () => {
  it('allows three posts on one day', () => {
    const existing = [post('1', '2026-08-10', '09:00'), post('2', '2026-08-10', '13:00')]
    expect(getScheduleError(existing, post('3', '2026-08-10', '18:00'))).toBe('')
  })

  it('blocks the fourth post on one day', () => {
    const existing = [post('1', '2026-08-10', '09:00'), post('2', '2026-08-10', '13:00'), post('3', '2026-08-10', '18:00')]
    expect(getScheduleError(existing, post('4', '2026-08-10', '21:00'))).toContain('3 публикации')
  })

  it('blocks duplicate time slots', () => {
    expect(getScheduleError([post('1', '2026-08-10', '09:00')], post('2', '2026-08-10', '09:00'))).toContain('уже запланирована')
  })

  it('does not count skipped posts', () => {
    const existing = [post('1', '2026-08-10', '09:00'), post('2', '2026-08-10', '13:00'), post('3', '2026-08-10', '18:00', 'skipped')]
    expect(getScheduleError(existing, post('4', '2026-08-10', '21:00'))).toBe('')
  })

  it('does not count the edited post against itself', () => {
    const edited = post('1', '2026-08-10', '09:00')
    expect(getScheduleError([edited], edited)).toBe('')
  })
})

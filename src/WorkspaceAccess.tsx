import { useState } from 'react'
import { Check, Copy, UserPlus, UsersRound } from 'lucide-react'
import { createWorkspaceInvite, joinWorkspace } from './project-store'

export function WorkspaceAccess() {
  const [invite, setInvite] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [message, setMessage] = useState('')
  async function makeInvite() { try { setInvite(await createWorkspaceInvite()); setMessage('Код действует 24 часа и используется один раз.') } catch { setMessage('Не удалось создать приглашение.') } }
  async function join() { try { await joinWorkspace(joinCode); setMessage('Рабочее пространство подключено. Обновите страницу.'); setJoinCode('') } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось присоединиться.') } }
  async function copy() { await navigator.clipboard.writeText(invite); setMessage('Код скопирован.') }
  return <div className="workspace-access panel"><div><span className="eyebrow">СОВМЕСТНАЯ РАБОТА</span><h2>Два человека, один архив</h2><p>Участники имеют одинаковый доступ к проектам. В коде нет пароля и доступа к вашему аккаунту.</p></div><div className="access-actions"><button className="button secondary" onClick={makeInvite}><UserPlus />Создать код</button>{invite && <button className="invite-code" onClick={copy} title="Скопировать"><strong>{invite}</strong><Copy /></button>}<div className="join-control"><UsersRound /><input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="Код приглашения" maxLength={12}/><button onClick={join} disabled={joinCode.length !== 12}><Check />Войти</button></div>{message && <small>{message}</small>}</div></div>
}

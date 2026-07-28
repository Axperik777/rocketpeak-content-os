import { useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { isSupabaseConfigured, supabase } from './supabase'

export function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (mode: 'signin' | 'signup') => {
    if (!supabase || !email || password.length < 8) {
      setMessage('Укажите email и пароль минимум из 8 символов.')
      return
    }
    setBusy(true)
    setMessage('')
    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href.split('#')[0] } })
    setBusy(false)
    if (result.error) setMessage(result.error.message)
    else if (mode === 'signup' && !result.data.session) setMessage('Проверьте почту и подтвердите регистрацию.')
  }

  return <main className="auth-screen">
    <section className="auth-card">
      <div className="auth-mark"><LockKeyhole /></div>
      <span>ROCKETPEAK CONTENT OS</span>
      <h1>Вход в рабочее пространство</h1>
      <p>Контент-план синхронизируется через защищённую базу Supabase.</p>
      {!isSupabaseConfigured ? <div className="auth-error">Подключение Supabase не настроено.</div> : <>
        <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label><span>Пароль</span><input type="password" autoComplete="current-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {message && <div className="auth-message" role="status">{message}</div>}
        <div className="auth-actions"><button disabled={busy} onClick={() => submit('signin')}>Войти</button><button disabled={busy} className="secondary" onClick={() => submit('signup')}>Создать аккаунт</button></div>
      </>}
    </section>
  </main>
}

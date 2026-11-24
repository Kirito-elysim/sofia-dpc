import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api, type Me } from '../api'

export default function Login() {
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    try {
      const me = await api<Me>('/auth/login', { method: 'POST', body: JSON.stringify({ username: f.get('email'), password: f.get('password') }) })
      qc.setQueryData(['me'], me)
    } catch {
      setError('Identifiants invalides.')
    }
  }
  return (
    <form onSubmit={submit} className="mx-auto mt-32 flex w-80 flex-col gap-3 rounded-xl bg-white p-6 shadow">
      <h1 className="text-lg font-bold">Connexion</h1>
      <input name="email" type="email" required placeholder="E-mail" autoComplete="username" className="rounded border border-slate-300 px-3 py-2" />
      <input name="password" type="password" required placeholder="Mot de passe" autoComplete="current-password" className="rounded border border-slate-300 px-3 py-2" />
      {error && <p role="alert" className="text-sm text-cancelled">{error}</p>}
      <button className="rounded-lg bg-primary px-3 py-2 font-medium text-white">Se connecter</button>
    </form>
  )
}

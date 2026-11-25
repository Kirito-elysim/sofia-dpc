import {useState, type FormEvent} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {api, type Me} from '../api'

export default function ChangePassword() {
  const client=useQueryClient()
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields=new FormData(event.currentTarget)
    const password=fields.get('password')
    if(password!==fields.get('confirm')) {setError('Les mots de passe doivent correspondre.');return}
    setBusy(true)
    try {
      const me=await api<Me>('/auth/change-password',{method:'POST',body:JSON.stringify({password})})
      client.setQueryData(['me'],me)
    } catch(e) {setError(e instanceof Error?e.message:'Enregistrement impossible.')}
    finally {setBusy(false)}
  }
  return <main className="user-create"><section className="uc-card" style={{maxWidth:560,margin:'8vh auto'}}><h1>Première connexion</h1><p>Remplacez votre mot de passe temporaire pour accéder à Sofia.</p>
    <form className="uc-fields" onSubmit={submit}>
      <label className="uc-wide">Nouveau mot de passe<input required type="password" name="password" autoComplete="new-password" minLength={12}/><small>12 caractères minimum.</small></label>
      <label className="uc-wide">Confirmer le mot de passe<input required type="password" name="confirm" autoComplete="new-password"/></label>
      {error&&<p className="uc-wide" role="alert">{error}</p>}
      <button className="page-add uc-wide" disabled={busy}>Enregistrer et accéder à Sofia</button>
    </form></section></main>
}

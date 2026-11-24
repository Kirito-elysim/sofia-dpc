import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { EyeOff } from 'lucide-react'
import { api, type Me } from '../api'
import './login.css'

const rememberKey = 'sofia.login.email'
const features = [
  ['calendar','Planification des classes'],
  ['video','Suivi en temps réel'],
  ['people','Relances automatiques (SMS / Mail)'],
  ['certificate','Attestations et conformité DPC'],
]
function img(name:string, alt='') {return <img src={'/login/'+name+'.png'} alt={alt}/>}
function rememberedEmail() {
  try { return localStorage.getItem(rememberKey) ?? '' } catch { return '' }
}
export default function Login() {
  const qc=useQueryClient()
  const [email,setEmail]=useState(rememberedEmail)
  const [remember,setRemember]=useState(Boolean(email))
  const [visible,show]=useState(false)
  const [message,notify]=useState('')
  const [pending,busy]=useState(false)
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if(pending)return
    const password=new FormData(e.currentTarget).get('password')
    busy(true);notify('')
    try {
      const me=await api<Me>('/auth/login',{method:'POST',body:JSON.stringify({username:email.trim(),password})})
      try {if(remember)localStorage.setItem(rememberKey,email.trim());else localStorage.removeItem(rememberKey)} catch { /* Browser storage may be disabled. */ }
      qc.setQueryData(['me'],me)
    } catch {notify('Connexion impossible. Vérifiez vos identifiants et réessayez.')} finally {busy(false)}
  }
  return <main className="login-screen"><aside className="login-intro">
    {img('whiteLogo','SOFIA · Classes virtuelles DPC')}
    <h2>Gestion de vos<br/>classes virtuelles DPC</h2>
    <p>Planifiez, suivez et pilotez vos sessions de formation<br className="login-wide"/> en toute simplicité.</p>
    <ul>{features.map(([asset,label])=><li key={asset}>{img(asset)}{label}</li>)}</ul>
  </aside><section className="login-card" aria-labelledby="login-heading">
    <div className="login-mark">{img('blueLogo','SOFIA · Classes virtuelles DPC')}</div>
    <h1 id="login-heading">Connexion à la plateforme</h1><p className="login-subtitle">Accédez à la gestion de vos classes virtuelles</p>
    <form onSubmit={submit}>
      <label htmlFor="login-email">Adresse email *</label><div className="login-field">{img('email')}<input id="login-email" name="email" type="email" autoComplete="username" required placeholder="votre.email@domaine.fr" value={email} onChange={e=>setEmail(e.target.value)}/></div>
      <label htmlFor="login-password">Mot de passe *</label><div className="login-field">{img('lock')}<input id="login-password" name="password" type={visible?'text':'password'} autoComplete="current-password" required placeholder="Votre mot de passe"/><button type="button" aria-label={visible?'Masquer le mot de passe':'Afficher le mot de passe'} aria-pressed={visible} onClick={()=>show(!visible)}>{visible?<EyeOff/>:img('eye')}</button></div>
      <div className="login-options"><label title="Mémoriser mon adresse email sur cet appareil"><input type="checkbox" checked={remember} onChange={e=>{setRemember(e.target.checked);if(!e.target.checked){try{localStorage.removeItem(rememberKey)}catch{ /* optional storage */ }}}}/>Se souvenir de moi</label><button type="button" onClick={()=>notify('Pour réinitialiser votre mot de passe, contactez votre administrateur SOFIA ou STUDIO PHOCEA.')}>Mot de passe oublié ?</button></div>
      <button className="login-submit" disabled={pending}>{img('login')}{pending?'Connexion en cours…':'Se connecter'}</button>
    </form>
    <div className="login-or"><span/>ou<span/></div>
    <button className="login-google" type="button" onClick={()=>notify('La connexion Google n’est pas configurée. Utilisez votre adresse email et votre mot de passe Sofia.')}><img src="/login/google.svg" alt=""/>Se connecter avec Google</button>
    {message&&<p className="login-message" role="status">{message}</p>}
    <footer>Accès réservé aux équipes SOFIA et STUDIO PHOCEA<div><b>SOFIA</b><b>STUDIO PHOCEA</b></div></footer>
  </section></main>
}

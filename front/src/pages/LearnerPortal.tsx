import {useEffect,useRef,useState,type FormEvent} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {CalendarDays,Download,ExternalLink,FileText,Link2,LogOut,Mail,Video} from 'lucide-react'
import {api,ApiError} from '../api'
import {day} from './sessionModel'
import './learner-portal.css'

type Portal={firstName:string;lastName:string;email:string;formations:{
  id:number;session:string;formation:string;organization:string;accessStartsOn:string;accessEndsOn:string;open:boolean
  resources:{id:number;title:string;url?:string|null}[];classes:{classId:number;date:string;label:string;start:string;end:string;joinUrl?:string|null}[]}[]}

/** Space of a PS, reached with the one-time link received by e-mail. Separate from the team's application. */
export default function LearnerPortal(){
  const cache=useQueryClient()
  // The token travels in the fragment and leaves the address bar as soon as it is read.
  const [token]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('token'))
  const used=useRef(false)
  const signIn=useMutation({mutationFn:(value:string)=>api('/portal/session',{method:'POST',body:JSON.stringify({token:value})}),onSuccess:()=>cache.resetQueries({queryKey:['portal']})})
  useEffect(()=>{
    if(!token||used.current)return
    used.current=true
    window.history.replaceState(null,'',window.location.pathname)
    signIn.mutate(token)
  },[token,signIn])
  const me=useQuery({queryKey:['portal'],queryFn:()=>api<Portal>('/portal/me'),enabled:!token||signIn.isSuccess||signIn.isError})
  const signOut=useMutation({mutationFn:()=>api('/portal/session',{method:'DELETE'}),onSuccess:()=>cache.resetQueries({queryKey:['portal']})})
  const signedOut=me.error instanceof ApiError&&me.error.status===401
  return <div className="lp">
    <header><img src="/catalog/sofia-navigation-logo.png" alt="SOFIA – Classes virtuelles DPC"/>
      {me.data&&!signedOut&&<button type="button" onClick={()=>signOut.mutate()}><LogOut aria-hidden="true"/>Déconnexion</button>}</header>
    <main>
      {signIn.error&&signedOut&&<p role="alert" className="lp-alert">{signIn.error.message}</p>}
      {signedOut?<AskLink/>:me.error?<p role="alert" className="lp-alert">{me.error.message}</p>:!me.data?<p role="status">Chargement de votre espace…</p>:<>
        <h1>Bonjour {me.data.firstName}</h1>
        {!me.data.formations.length&&<p>Vous n’êtes inscrit à aucune formation pour le moment.</p>}
        {me.data.formations.map(f=><article key={f.id} aria-label={f.formation}>
          <h2>{f.formation}</h2><p className="lp-meta">{f.organization} · {f.session}</p>
          <p className={f.open?'lp-access open':'lp-access'}><CalendarDays aria-hidden="true"/>{f.open?'Accès ouvert':'Accès fermé'} · du {day(f.accessStartsOn)} au {day(f.accessEndsOn)}</p>
          {f.open&&<>
            <h3><Video aria-hidden="true"/>Classes virtuelles</h3>
            {f.classes.length?<ul>{f.classes.map(c=><li key={c.classId+c.label}><span>{day(c.date)} · {c.label} ({c.start}–{c.end})</span>
              {c.joinUrl?<a className="lp-join" href={c.joinUrl} target="_blank" rel="noreferrer">Rejoindre</a>:<small>Lien communiqué avant la classe</small>}</li>)}</ul>:<p className="lp-meta">Aucune classe planifiée.</p>}
            <h3><FileText aria-hidden="true"/>Ressources</h3>
            {f.resources.length?<ul>{f.resources.map(r=><li key={r.id}>{r.url?<Link2 aria-hidden="true"/>:<FileText aria-hidden="true"/>}<span>{r.title}</span>
              <a href={r.url??'/api/portal/resources/'+r.id+'/file'} target={r.url?'_blank':undefined} rel="noreferrer">{r.url?<ExternalLink aria-hidden="true"/>:<Download aria-hidden="true"/>}{r.url?'Ouvrir':'Télécharger'}</a></li>)}</ul>:<p className="lp-meta">Aucune ressource pour le moment.</p>}
          </>}
        </article>)}
      </>}
    </main>
  </div>
}

function AskLink(){
  const [email,setEmail]=useState('')
  const ask=useMutation({mutationFn:()=>api('/portal/links',{method:'POST',body:JSON.stringify({email})})})
  return <article className="lp-ask"><h1>Votre espace de formation</h1>
    <p>Saisissez l’adresse e-mail utilisée pour votre inscription : vous recevrez un lien de connexion, sans mot de passe.</p>
    {ask.isSuccess?<p role="status" className="lp-sent">Si cette adresse correspond à une inscription, un lien vient de lui être envoyé. Il est valable 30 minutes.</p>
    :<form onSubmit={(e:FormEvent)=>{e.preventDefault();if(!ask.isPending)ask.mutate()}}><label>Adresse e-mail<input type="email" required maxLength={180} value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <button disabled={ask.isPending}><Mail aria-hidden="true"/>Recevoir mon lien</button></form>}
    {ask.error&&<p role="alert" className="lp-alert">{ask.error.message}</p>}
  </article>
}

import {useState,type FormEvent} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {ArrowLeft,CalendarDays,CalendarPlus,GraduationCap,Link2,Save,Trash2,UsersRound,Video} from 'lucide-react'
import {Link,useNavigate,useParams} from 'react-router-dom'
import {api} from '../api'
import {ConfirmDialog,OrgBadges} from '../components/list/List'
import {StatusBadge} from '../components/Badges'
import {Resources} from '../components/Resources'
import {day,type FormationRef,type Org,type Session,type SessionFormation} from './sessionModel'
import './formation-wizard.css'
import './sessions.css'

const patch=(url:string,body:object)=>api(url,{method:'PATCH',body:JSON.stringify(body),headers:{'Content-Type':'application/merge-patch+json'}})

export default function SessionSheet({canWrite,canReadLearners=false}:{canWrite:boolean;canReadLearners?:boolean}){
  const {id}=useParams()
  const item=useQuery({queryKey:['sessions',id],queryFn:()=>api<Session>('/sessions/'+id),enabled:!!id})
  const orgs=useQuery({queryKey:['organizations'],queryFn:()=>api<Org[]>('/organizations')})
  if(item.error||orgs.error)return <p role="alert">{(item.error??orgs.error)?.message}</p>
  if(!orgs.data||(id&&!item.data))return <p role="status">Chargement de la session…</p>
  return <main className="tw ss">
    <header className="tw-header"><CalendarDays/><div><h1>{item.data?.name??'Créer une session'}</h1><p>{item.data?'Du '+day(item.data.startsOn)+' au '+day(item.data.endsOn):'Définissez la période, puis rattachez les formations.'}</p></div>
      <Link className="ss-back" to="/sessions"><ArrowLeft/>Retour aux sessions</Link></header>
    <Details key={item.data?JSON.stringify([item.data.name,item.data.startsOn,item.data.endsOn,item.data.organization.id]):'new'} session={item.data} orgs={orgs.data} canWrite={canWrite}/>
    {item.data&&<Formations session={item.data} orgs={orgs.data} canWrite={canWrite} canReadLearners={canReadLearners}/>}
  </main>
}

function Details({session,orgs,canWrite}:{session?:Session;orgs:Org[];canWrite:boolean}){
  const cache=useQueryClient(),navigate=useNavigate()
  const [data,set]=useState({name:session?.name??'',organization:String(session?.organization.id??(orgs.length===1?orgs[0].id:'')),startsOn:session?.startsOn??'',endsOn:session?.endsOn??''})
  const update=(key:keyof typeof data,value:string)=>{set(old=>({...old,[key]:value}));save.reset()}
  const invalid=!!data.startsOn&&!!data.endsOn&&data.endsOn<data.startsOn
  const save=useMutation({mutationFn:()=>{
    const body={...data,name:data.name.trim(),organization:'/api/organizations/'+data.organization}
    return (session?patch('/sessions/'+session.id,body):api('/sessions',{method:'POST',body:JSON.stringify(body)})) as Promise<Session>
  },onSuccess:async result=>{await cache.invalidateQueries({queryKey:['sessions']});if(!session)navigate('/sessions/'+result.id,{replace:true})}})
  const attached=!!session?.sessionFormations.length
  return <section className="tw-card"><h2><CalendarDays/>Période de la session</h2>
    <form onSubmit={(e:FormEvent)=>{e.preventDefault();if(!invalid&&!save.isPending)save.mutate()}}><fieldset disabled={!canWrite} className="tw-fields">
      <div><label>Libellé <em>*</em><input required maxLength={150} placeholder="Ex. Novembre 2026" value={data.name} onChange={e=>update('name',e.target.value)}/></label></div>
      <div><label>Organisme <em>*</em><select required disabled={attached} value={data.organization} onChange={e=>update('organization',e.target.value)}><option value="">Choisir un organisme</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        {attached&&<small className="tw-field-help">Retirez les formations pour changer d’organisme.</small>}</div>
      <div><label>Date de début <em>*</em><input type="date" required value={data.startsOn} onChange={e=>update('startsOn',e.target.value)}/></label></div>
      <div><label>Date de fin <em>*</em><input type="date" required min={data.startsOn} aria-invalid={invalid} value={data.endsOn} onChange={e=>update('endsOn',e.target.value)}/></label></div>
    </fieldset>
    {invalid&&<p role="alert" className="ss-error">La date de fin précède la date de début.</p>}
    {save.error&&<p role="alert" className="ss-error">{save.error.message}</p>}
    {save.isSuccess&&session&&<p role="status">Session enregistrée.</p>}
    {canWrite&&<button className="primary" disabled={invalid||save.isPending}><Save/>{session?'Enregistrer la session':'Créer la session'}</button>}
    </form>
  </section>
}

function Formations({session,orgs,canWrite,canReadLearners}:{session:Session;orgs:Org[];canWrite:boolean;canReadLearners:boolean}){
  const cache=useQueryClient()
  const formations=useQuery({queryKey:['formations'],queryFn:()=>api<FormationRef[]>('/formations'),enabled:canWrite})
  const [chosen,choose]=useState('')
  const org=session.organization.id
  const taken=new Set(session.sessionFormations.map(f=>f.formation.id))
  const available=(formations.data??[]).filter(f=>f.active&&!taken.has(f.id)&&[f.organization,...(f.additionalOrganizations??[])].some(o=>o.id===org))
  const attach=useMutation({mutationFn:(f:FormationRef)=>api('/session-formations',{method:'POST',body:JSON.stringify({session:'/api/sessions/'+session.id,formation:'/api/formations/'+f.id,capacity:f.defaultCapacity})}),
    onSuccess:()=>{choose('');return cache.invalidateQueries({queryKey:['sessions']})}})
  const own=orgs.find(o=>o.id===org)??session.organization
  return <section className="tw-card"><h2><GraduationCap/>Formations de la session ({session.sessionFormations.length})</h2>
    <OrgBadges organizations={[own]}/>
    {canWrite&&<div className="ss-attach"><label>Formation à rattacher<select value={chosen} onChange={e=>{choose(e.target.value);attach.reset()}}><option value="">Choisir une formation publiée</option>{available.map(f=><option key={f.id} value={f.id}>{f.title}{f.reference?' — '+f.reference:''}</option>)}</select></label>
      <button type="button" className="primary" disabled={!chosen||attach.isPending} onClick={()=>{const f=available.find(x=>String(x.id)===chosen);if(f)attach.mutate(f)}}><Link2/>Rattacher</button>
      {formations.data&&!available.length&&<small>Aucune autre formation publiée n’est portée par {own.name}.</small>}
      {attach.error&&<p role="alert" className="ss-error">{attach.error.message}</p>}</div>}
    {!session.sessionFormations.length&&<p className="tw-none">Aucune formation rattachée pour le moment.</p>}
    {session.sessionFormations.map(f=><Attached key={f.id+JSON.stringify([f.capacity,f.fundingNumbers,f.accessStartsOn,f.accessEndsOn])} item={f} session={session} canWrite={canWrite} canReadLearners={canReadLearners}/>)}
  </section>
}

const numberLabels:Record<string,string>={ANDPC:'N° de session DPC',FIFPL:'N° de session FIFPL',Personnel:'Référence de session (financement personnel)'}

function Attached({item,session,canWrite,canReadLearners}:{item:SessionFormation;session:Session;canWrite:boolean;canReadLearners:boolean}){
  const cache=useQueryClient()
  const [capacity,setCapacity]=useState(String(item.capacity))
  // An empty object comes back as [] from the API.
  const [numbers,setNumbers]=useState<Record<string,string>>(()=>({...(Array.isArray(item.fundingNumbers)?{}:item.fundingNumbers)}))
  const [start,setStart]=useState(item.accessStartsOn??''),[end,setEnd]=useState(item.accessEndsOn??'')
  const [removing,setRemoving]=useState(false),[resources,openResources]=useState(false)
  const refresh=()=>cache.invalidateQueries({queryKey:['sessions']})
  const save=useMutation({mutationFn:()=>patch('/session-formations/'+item.id,{capacity:Number(capacity),
    fundingNumbers:Object.fromEntries(Object.entries(numbers).filter(([,v])=>v.trim())),accessStartsOn:start||null,accessEndsOn:end||null}),onSuccess:refresh})
  const remove=useMutation({mutationFn:()=>api('/session-formations/'+item.id,{method:'DELETE'}),onSuccess:()=>{setRemoving(false);return refresh()}})
  const from=start||session.startsOn,to=end||session.endsOn
  const title=item.formation.title
  return <article className="ss-formation" aria-label={title}>
    <header><div><h3>{title}</h3>{item.formation.reference&&<small>Réf. : {item.formation.reference}</small>}</div>
      <span className="ss-access">Accès du {day(from)} au {day(to)} · {start||end?'dates propres à cette formation':'hérité de la session'}</span></header>
    <form onSubmit={(e:FormEvent)=>{e.preventDefault();save.mutate()}}><fieldset disabled={!canWrite} className="tw-fields">
      <div><label>Capacité (PS) <em>*</em><input type="number" min="1" required value={capacity} onChange={e=>setCapacity(e.target.value)}/></label></div>
      {item.formation.fundingTypes.map(type=><div key={type}><label>{numberLabels[type]??'N° de session '+type}<input maxLength={100} value={numbers[type]??''} onChange={e=>setNumbers({...numbers,[type]:e.target.value})}/></label></div>)}
      <div><label>Début d’accès<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><small className="tw-field-help">Vide : début de la session.</small></div>
      <div><label>Fin d’accès<input type="date" min={from} value={end} onChange={e=>setEnd(e.target.value)}/></label><small className="tw-field-help">Vide : fin de la session. Peut la dépasser.</small></div>
    </fieldset>
    {save.error&&<p role="alert" className="ss-error">{save.error.message}</p>}{save.isSuccess&&<p role="status">Enregistré.</p>}
    {canWrite&&<footer><button type="submit" className="primary" aria-label={'Enregistrer '+title} disabled={save.isPending}><Save/>Enregistrer</button>
      <button type="button" aria-label={'Retirer '+title} onClick={()=>{remove.reset();setRemoving(true)}}><Trash2/>Retirer</button></footer>}
    </form>
    <div className="ss-classes"><h4><UsersRound/>Inscriptions<small>{item.registeredCount??0} / {item.capacity} PS</small></h4>
      {canReadLearners&&<Link className="ss-plan" to={'/sessions/'+session.id+'/formations/'+item.id}><UsersRound/>Gérer les inscriptions et la présence</Link>}</div>
    <div className="ss-classes"><h4><Video/>Classes virtuelles ({item.classes?.length??0}){!!item.classes?.length&&<small>toutes à suivre</small>}</h4>
      {item.classes?.length?<ul>{item.classes.map(c=><li key={c.id}><Link to={'/classes/'+c.id}>{day(c.date)}{c.reference?' · '+c.reference:''}</Link><StatusBadge status={c.status}/></li>)}</ul>:<p className="tw-none">Aucune classe virtuelle planifiée.</p>}
      {canWrite&&(item.formation.active?<Link className="ss-plan" to="/classes/new" state={{sessionFormationId:item.id}}><CalendarPlus/>Planifier une classe virtuelle</Link>:<p className="tw-none">Publiez la formation pour planifier une classe.</p>)}</div>
    {/* Loaded when opened: a session may hold many formations. */}
    <details className="ss-classes" onToggle={e=>openResources(e.currentTarget.open)}><summary>Ressources pour les apprenants</summary>{resources&&<Resources owner={'/session-formations/'+item.id} canWrite={canWrite} note="En plus de celles de la formation, pour cette session seulement."/>}</details>
    {removing&&<ConfirmDialog title="Retirer la formation" pending={remove.isPending} error={remove.error?.message} onCancel={()=>setRemoving(false)} onConfirm={()=>remove.mutate()}>
      <p>« {title} » ne fera plus partie de la session « {session.name} ».</p></ConfirmDialog>}
  </article>
}

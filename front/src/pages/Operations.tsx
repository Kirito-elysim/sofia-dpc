import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { LiveClasses } from './LiveClasses'
import { api } from '../api'

type Page<T> = {entries:T[];next:number|null}
type Learner={id:number;first_name:string;last_name:string;email:string}
type AuditEntry={id:number;at:string;author:string|null;action:string;entity:string|null;entityId:number|null}
const panel='mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white p-4'
const button='rounded-lg border border-blue-200 px-3 py-2 text-blue-700 disabled:opacity-50'
const instant=(s:string)=>new Date(s.replace(' ','T')).toLocaleString('fr-FR')

export function Directory({audit=false}:{audit?:boolean}){
  const [search,setSearch]=useState(''),[pages,setPages]=useState<number[]>([0])
  const before=pages[pages.length-1]
  const result=useQuery({queryKey:['directory',audit,search,before],queryFn:()=>api<Page<Learner|AuditEntry>>((audit?'/audit':'/learners')+'?'+new URLSearchParams({before:String(before),q:search}))})
  const next=result.data?.next
  return <section><h1 className="text-2xl font-bold">{audit?'Journal d’audit':'Apprenants (PS)'}</h1>
    {!audit&&<input className="mt-4 rounded-lg border bg-white p-2" aria-label="Rechercher un apprenant" placeholder="Nom ou adresse e-mail" value={search} onChange={e=>{setSearch(e.target.value);setPages([0])}}/>}
    <div className={panel}>{result.isLoading&&<p>Chargement…</p>}{result.error&&<p role="alert">{result.error.message}</p>}
    {result.data&&<table className="w-full text-left"><thead><tr>{(audit?['Date','Auteur','Action','Élément']:['Apprenant','E-mail']).map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{result.data.entries.map(r=><tr key={r.id} className="border-t border-slate-100">{'action' in r?<><td className="p-2">{instant(r.at)}</td><td>{r.author??'Système'}</td><td>{r.action}</td><td>{r.entity} {r.entityId}</td></>:<><td className="p-2"><Link className="text-blue-700" to={'/learners/'+r.id}>{r.first_name} {r.last_name}</Link></td><td>{r.email}</td></>}</tr>)}</tbody></table>}
    {result.data?.entries.length===0&&<p>Aucun résultat.</p>}</div><div className="mt-3 flex gap-2"><button className={button} disabled={pages.length===1} onClick={()=>setPages(pages.slice(0,-1))}>Précédent</button><button className={button} disabled={!next} onClick={()=>next&&setPages([...pages,next])}>Suivant</button></div></section>
}

type Sheet={name:string;email:string;phone:string|null;classes:{id:number;classId:number;title:string;date:string;status:string;classStatus:string}[];messages:{id:number;at:string;channel:string;kind:string;status:string;author:string|null;title:string}[]}
export function LearnerSheet({canRemind}:{canRemind:boolean}){
  const {id}=useParams()
  const sheet=useQuery({queryKey:['learner',id],queryFn:()=>api<Sheet>('/learners/'+id)})
  const remind=useMutation({mutationFn:(enrollment:number)=>api('/enrollments/'+enrollment+'/relance',{method:'POST'})})
  if(!sheet.data)return <p>{sheet.error?.message??'Chargement…'}</p>
  const s=sheet.data
  return <section><Link to="/learners">← Apprenants</Link><h1 className="mt-3 text-2xl font-bold">{s.name}</h1><p>{s.email} {s.phone&&<a href={'tel:'+s.phone}>{s.phone}</a>}</p>
    <div className={panel}><h2 className="font-bold">Classes et inscriptions</h2>{s.classes.map(c=><div key={c.id} className="flex items-center gap-3 border-b py-2"><Link to={'/classes/'+c.classId}>{c.title}</Link><span>{c.date}</span><span>{c.status==='ACTIVE'?'Inscrit':'Inscription annulée'}</span>{canRemind&&c.status==='ACTIVE'&&['PLANNED','IN_PROGRESS'].includes(c.classStatus)&&<button className={button} disabled={remind.isPending} onClick={()=>remind.mutate(c.id)}>Relancer par mail</button>}</div>)}{remind.isSuccess&&<p role="status">Relance mise en file d’envoi.</p>}{remind.error&&<p role="alert">{remind.error.message}</p>}</div>
    <div className={panel}><h2 className="font-bold">Historique des communications</h2>{s.messages.length===0&&<p>Aucun envoi enregistré.</p>}{s.messages.map(m=><p key={m.id} className="border-b py-2">{instant(m.at)} · {m.channel} · {m.kind==='MANUAL_REMINDER'?'Relance manuelle':m.kind==='ENROLLMENT_CONFIRMATION'?'Confirmation d’inscription':m.kind} · {m.title} · {m.status==='SENT'?'Accepté par le transport':m.status==='FAILED'?'Échec':m.status} · {m.author??'Système'}</p>)}</div></section>
}

type PresenceEvent={id:number;at:string;event:'JOIN'|'LEAVE';role:'TRAINER'|'LEARNER'|'UNKNOWN';title:string;label:string;name:string|null}
type LearnerPresence = {
  slotId: number; enrollmentId: number; title: string; label: string; name: string
  status: 'CONNECTED' | 'DISCONNECTED' | 'EXPECTED'; seconds: number; awaySeconds: number | null
}

function AttendanceSummary() {
  const { data, error, isLoading } = useQuery({
    queryKey: ['live-learner-presence'],
    queryFn: () => api<LearnerPresence[]>('/live-presence/learners'),
    refetchInterval: 5000,
  })
  return <div className={panel}>
    <h2 className="mb-3 font-semibold">Présence des apprenants par créneau en cours</h2>
    {error && <p role="alert">{error.message}</p>}
    {isLoading && <p>Chargement…</p>}
    {data?.length === 0 && <p>Aucun apprenant attendu sur les créneaux en cours.</p>}
    {data && data.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left">
      <thead><tr><th>Apprenant</th><th>Classe et créneau</th><th>Statut Zoom</th><th>Présence cumulée</th></tr></thead>
      <tbody>{data.map(row => <tr className="border-t" key={row.slotId + '-' + row.enrollmentId}>
        <td className="py-2">{row.name}</td><td>{row.title} · {row.label}</td>
        <td className={(row.awaySeconds ?? 0) > 600 ? 'font-bold text-red-700' : ''}>
          {row.status === 'CONNECTED' ? 'Connecté' : row.status === 'EXPECTED' ? 'Attendu' :
            'Déconnecté depuis ' + Math.floor((row.awaySeconds ?? 0) / 60) + ' min'}
        </td><td>{Math.floor(row.seconds / 60)} min</td>
      </tr>)}</tbody>
    </table></div>}
  </div>
}

export function LivePresence({canSend}:{canSend:boolean}){
  const query=useQuery({queryKey:['live-presence'],queryFn:()=>api<PresenceEvent[]>('/live-presence'),refetchInterval:5000})
  return <section><h1 className="text-2xl font-bold">Suivi en direct</h1><LiveClasses canSend={canSend}/><details className="mt-5"><summary>Détail des présences et historique Zoom</summary><AttendanceSummary/><div className={panel}><h2 className="mb-3 font-semibold">Dernières connexions et déconnexions Zoom</h2>{query.error&&<p role="alert">{query.error.message}</p>}{query.isLoading&&<p>Chargement…</p>}{query.data?.length===0&&<p>Aucun événement de présence reçu.</p>}{query.data?.map(e=><p key={e.id} className="border-t py-2">{instant(e.at)} · {e.title} · {e.label} · {e.role==='TRAINER'?'Formateur':e.role==='LEARNER'?'Apprenant':'Identité à vérifier'} {e.name} · {e.event==='JOIN'?'Connexion':'Déconnexion'}</p>)}</div></details></section>
}

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, Building2, Pause, GraduationCap, Users, Search, LayoutGrid, List, MapPin, Mail, Phone, Pencil, Trash2, FileText, Award, Calendar, CirclePause, MoreHorizontal, Power, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import './organizations.css'
import './organization-list.css'

type Org = {id:number; name:string; code:string; active:boolean; emailFrom:string; siret:string|null; andpcNumber:string|null}
type Summary = {id:number; total:number; learners:number; global_learners:number; address:string; zip:string; city:string; phone:string; email:string; created:string|null; has_logo:boolean}
const icon = (name:string) => <img className="oa-icon" alt="" src={'/organizations/'+name+'.png'}/>

function Modal({kind,title,onClose,children}:{kind:string,title:string,onClose:()=>void,children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const dialog=ref.current!;dialog.showModal();return ()=>dialog.close()},[])
  return <dialog ref={ref} className={'oa-dialog '+kind} aria-label={title} onCancel={e=>{e.preventDefault();onClose()}}>
    <header>{icon(kind==='drawer'?'drawer':'trash')}<h2>{title}</h2><button type="button" onClick={onClose} aria-label="Fermer"><X/></button></header>{children}</dialog>
}

export default function Organizations({canWrite}:{canWrite:boolean}) {
  const navigate=useNavigate()
  const qc=useQueryClient()
  const list=useQuery({queryKey:['organizations'],queryFn:()=>api<Org[]>('/organizations')})
  const summary=useQuery({queryKey:['organization-summaries'],queryFn:()=>api<Summary[]>('/organization-summaries')})
  const details=new Map(summary.data?.map(s=>[Number(s.id),s]))
  const rows=list.data??[]
  const [search,searchFor]=useState(''),[status,setStatus]=useState('')
  const [page,setPage]=useState(1),[compact,setCompact]=useState(false)
  const [menu,setMenu]=useState<number|null>(null)
  const [deleting,confirmDelete]=useState<Org|null>(null)
  const change=useMutation({mutationFn:({id,method,body}:{id?:number;method:string;body?:object})=>api('/organizations'+(id?'/'+id:''),{method,body:JSON.stringify(body),headers:method==='PATCH'?{'Content-Type':'application/merge-patch+json'}:{}}),
    onSuccess:()=>{confirmDelete(null);void qc.invalidateQueries()}})
  const close=()=>{if(!change.isPending){confirmDelete(null);change.reset()}}
  const toggle=(o:Org)=>change.mutate({id:o.id,method:'PATCH',body:{active:!o.active}})
  const ordered=rows.filter(o=>(o.name+' '+o.code).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())&&(!status||String(o.active)===status))
  const last=Math.max(1,Math.ceil(ordered.length/10)),current=Math.min(page,last),shown=ordered.slice((current-1)*10,current*10)
  const err=change.error&&<p role="alert">{change.error.message}</p>
  const actions=(o:Org)=><><Link to={`/settings/organizations/${o.id}/edit`}><Pencil/>Modifier</Link><button disabled={change.isPending} onClick={()=>{setMenu(null);toggle(o)}}><CirclePause/>{o.active?'Désactiver':'Activer'}</button><button aria-label={'Supprimer '+o.name} onClick={()=>{setMenu(null);change.reset();confirmDelete(o)}}><Trash2/></button></>
  const stats=[
    {label:'Organismes actifs',value:list.data&&rows.filter(o=>o.active).length,Icon:Building2},
    {label:'Organisme'+(rows.filter(o=>!o.active).length>1?'s inactifs':' inactif'),value:list.data&&rows.filter(o=>!o.active).length,Icon:Pause},
    {label:'Classes rattachées',value:summary.data?.reduce((n,s)=>n+Number(s.total),0),Icon:GraduationCap},
    {label:'Apprenants au total',value:summary.data&&Number(summary.data[0]?.global_learners??0),Icon:Users},
  ]
  return <section className="org-directory">
    <div className="oa catalog"><header className="oa-title"><img className="oa-icon" src="/organizations/building.png" alt=""/><div><h1>Organismes</h1><p>Gérez les organismes de formation (DPC) de votre plateforme.</p></div>{canWrite&&<button className="blue page-add" onClick={()=>navigate('/settings/organizations/new')}><Plus/>Ajouter un organisme</button>}</header></div>
    <div className="od-stats">{stats.map(({label,value,Icon})=><div key={label}><i><Icon/></i><div><strong>{value??'—'}</strong>{label}</div></div>)}</div>
    <div className="od-filters"><label><Search/><input aria-label="Rechercher un organisme" placeholder="Rechercher un organisme..." value={search} onChange={e=>{searchFor(e.target.value);setPage(1)}}/></label><label>Statut : <select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Tous les statuts</option><option value="true">Actif</option><option value="false">Inactif</option></select></label><div>{[LayoutGrid,List].map((Icon,i)=><button key={i} aria-label={i?'Vue liste':'Vue cartes'} aria-pressed={compact===Boolean(i)} onClick={()=>setCompact(Boolean(i))}><Icon/></button>)}</div></div>
    {list.isError&&<p role="alert">{list.error.message}</p>}{summary.isError&&<p role="alert">{summary.error.message}</p>}{!deleting&&err}
    <div className={'od-cards'+(compact?' compact':'')}>{shown.map(o=>{
      const m=details.get(o.id),logo=m?.has_logo&&canWrite?`/api/organization-profiles/${o.id}/documents/logo`:({'SOFIA':'/organizations/sofia-card.png','STUDIO PHOCEA':'/organizations/phocea-card.png'} as Record<string,string>)[o.name.toUpperCase()]
      return <article key={o.id}><div className="od-main"><div className="od-logo">{logo?<img src={logo} alt={o.name}/>:<Building2/>}</div><div className="od-body"><h2>{o.name}<small className={o.active?'active':''}>●  {o.active?'Actif':'Inactif'}</small></h2><div className="od-fields">{[[Building2,'Code',o.code],[FileText,'SIRET',o.siret],[Award,'N° ANDPC',o.andpcNumber],[Calendar,'Créé le',m?.created&&new Date(m.created.replace(' ','T')).toLocaleDateString('fr-FR')]].map(([I,label,value])=>{const Icon=I as typeof Calendar;return <div key={String(label)}><Icon/><span>{String(label)}<b>{String(value||'—')}</b></span></div>})}<aside><span><GraduationCap/><b>{m?.total??'—'}</b> classes</span><span><Users/><b>{m?.learners??'—'}</b> apprenants</span></aside></div></div></div>
      {canWrite&&<div className="od-menu"><button aria-label={'Actions pour '+o.name} aria-expanded={menu===o.id} onClick={()=>setMenu(menu===o.id?null:o.id)}><MoreHorizontal/></button>{menu===o.id&&<div className="od-actions">{actions(o)}</div>}</div>}
      <footer><span><MapPin/>{[m?.address,[m?.zip,m?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')||'—'}</span><span><Mail/>{m?.email||o.emailFrom||'—'}</span><span><Phone/>{m?.phone||'—'}</span>{canWrite&&<div className="od-actions">{actions(o)}</div>}</footer></article>
    })}</div>
    {list.isLoading?<p>Chargement…</p>:!shown.length&&!list.isError&&<p>Aucun organisme ne correspond à votre recherche.</p>}
    <div className="od-pages">{ordered.length?(current-1)*10+1:0} à {Math.min(current*10,ordered.length)} sur {ordered.length} organismes.<div><button aria-label="Précédent" disabled={current===1} onClick={()=>setPage(current-1)}><ChevronLeft/></button><b>{current}</b><button aria-label="Suivant" disabled={current===last} onClick={()=>setPage(current+1)}><ChevronRight/></button></div></div>
    {deleting&&<Modal kind="confirm" title="Supprimer Organisme ?" onClose={close}><p>Cette action est tracée dans le journal d’audit.</p><div className="oa-caution">{icon('alert')}<div><strong>{details.has(deleting.id)?'Cet organisme est utilisé dans '+details.get(deleting.id)?.total+' classes':deleting.name}</strong> (en cours ou passées).<p>Il est recommandé de le désactiver plutôt que de le supprimer.</p></div></div>{err}<footer><button onClick={close}>Annuler</button>{deleting.active&&<button disabled={change.isPending} onClick={()=>toggle(deleting)}><Power/>Désactiver</button>}<button className="danger" disabled={change.isPending} onClick={()=>change.mutate({id:deleting.id,method:'DELETE'})}>{icon('delete')}Supprimer</button></footer></Modal>}
  </section>
}

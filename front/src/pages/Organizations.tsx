import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, Building2, Pause, GraduationCap, Users, Search, LayoutGrid, List, MapPin, Mail, Phone, Pencil, Trash2, FileText, Award, Calendar, CirclePause, MoreHorizontal, Power, TriangleAlert, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { establishmentNumber } from './organizationFields'
import './organizations.css'
import './organization-list.css'

type Org = {id:number; name:string; code:string; active:boolean; emailFrom:string; siret:string|null; andpcNumber:string|null}
type DraftRow = {id:number; name:string|null; step:number; updated_at:string}
type Summary = {id:number; total:number; learners:number; global_learners:number; address:string; zip:string; city:string; phone:string; email:string; created:string|null; has_logo:boolean}
function ConfirmDelete({title,onClose,children}:{title:string,onClose:()=>void,children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const dialog=ref.current!;dialog.showModal();return ()=>dialog.close()},[])
  return <dialog ref={ref} className="oa-dialog od-dialog confirm" aria-label={title} onCancel={e=>{e.preventDefault();onClose()}}>
    <header><Trash2 className="od-dialog-icon" aria-hidden="true"/><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Fermer"><X/></button></header>{children}</dialog>
}

export default function Organizations({canWrite}:{canWrite:boolean}) {
  const navigate=useNavigate()
  const qc=useQueryClient()
  const list=useQuery({queryKey:['organizations'],queryFn:()=>api<Org[]>('/organizations')})
  const summary=useQuery({queryKey:['organization-summaries'],queryFn:()=>api<Summary[]>('/organization-summaries')})
  const drafts=useQuery({queryKey:['organization-drafts'],queryFn:()=>api<DraftRow[]>('/organization-profiles/drafts'),enabled:canWrite})
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
  const shownDrafts=(!status||status==='draft') ? (drafts.data??[]).filter(d=> (d.name?.trim()||'Organisme sans nom').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) : []
  const last=Math.max(1,Math.ceil(ordered.length/10)),current=Math.min(page,last),shown=ordered.slice((current-1)*10,current*10)
  const linkedClasses=Number(deleting ? details.get(deleting.id)?.total : 0) || 0
  const err=change.error&&<p role="alert">{change.error.message}</p>
  const actions=(o:Org)=><><Link to={`/settings/organizations/${o.id}/edit`}><Pencil/>Modifier</Link><button disabled={change.isPending} onClick={()=>{setMenu(null);toggle(o)}}><CirclePause/>{o.active?'Désactiver':'Activer'}</button><button className="od-delete" aria-label={'Supprimer '+o.name} onClick={()=>{setMenu(null);change.reset();confirmDelete(o)}}><Trash2/></button></>
  const stats=[
    {label:'Organismes actifs',value:list.data&&rows.filter(o=>o.active).length,Icon:Building2},
    {label:'Organisme'+(rows.filter(o=>!o.active).length>1?'s inactifs':' inactif'),value:list.data&&rows.filter(o=>!o.active).length,Icon:Pause},
    {label:'Classes rattachées',value:summary.data?.reduce((n,s)=>n+Number(s.total),0),Icon:GraduationCap},
    {label:'Apprenants au total',value:summary.data&&Number(summary.data[0]?.global_learners??0),Icon:Users},
  ]
  return <section className="org-directory">
    <div className="oa catalog"><header className="oa-title"><Building2 aria-hidden="true"/><div><h1>Organismes</h1><p>Gérez les organismes de formation (DPC) de votre plateforme.</p></div>{canWrite&&<button className="blue page-add" onClick={()=>navigate('/settings/organizations/new')}><Plus/>Ajouter un organisme</button>}</header></div>
    <div className="od-stats">{stats.map(({label,value,Icon})=><div key={label}><i><Icon/></i><div><strong>{value??'—'}</strong>{label}</div></div>)}</div>
    <div className="od-filters"><label><Search/><input aria-label="Rechercher un organisme" placeholder="Rechercher un organisme..." value={search} onChange={e=>{searchFor(e.target.value);setPage(1)}}/></label><label>Statut : <select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Tous les statuts</option><option value="true">Actif</option><option value="false">Inactif</option>{canWrite&&<option value="draft">Brouillon</option>}</select></label><div>{[LayoutGrid,List].map((Icon,i)=><button key={i} aria-label={i?'Vue liste':'Vue cartes'} aria-pressed={compact===Boolean(i)} onClick={()=>setCompact(Boolean(i))}><Icon/></button>)}</div></div>
    {list.isError&&<p role="alert">{list.error.message}</p>}{summary.isError&&<p role="alert">{summary.error.message}</p>}{!deleting&&err}
    {drafts.isError&&<p role="alert">{drafts.error.message}</p>}
    {shownDrafts.length>0&&<section className="od-drafts" aria-label="Brouillons">
      {shownDrafts.map(d=><article key={d.id}>
        <FileText aria-hidden="true"/>
        <h2>{d.name?.trim()||'Organisme sans nom'}</h2>
        <span className="org-draft-status">Brouillon</span>
        <Link to={'/settings/organizations/new?draft='+d.id}><Pencil aria-hidden="true"/>Reprendre</Link>
      </article>)}
    </section>}
    <div className={'od-cards'+(compact?' compact':'')}>{shown.map(o=>{
      const m=details.get(o.id),logo=m?.has_logo&&canWrite?`/api/organization-profiles/${o.id}/documents/logo`:({'SOFIA':'/organizations/sofia-card.png','STUDIO PHOCEA':'/organizations/phocea-card.png'} as Record<string,string>)[o.name.toUpperCase()]
      return <article key={o.id}><div className="od-main"><div className="od-logo">{logo?<img src={logo} alt={o.name}/>:<Building2/>}</div><div className="od-body"><h2>{o.name}<small className={o.active?'active':''}>●  {o.active?'Actif':'Inactif'}</small></h2><div className="od-fields">{[[Building2,'Code',o.code],[FileText,establishmentNumber.label,o.siret],[Award,'N° ANDPC',o.andpcNumber],[Calendar,'Créé le',m?.created&&new Date(m.created.replace(' ','T')).toLocaleDateString('fr-FR')]].map(([I,label,value])=>{const Icon=I as typeof Calendar;return <div key={String(label)}><Icon/><span>{String(label)}<b>{String(value||'—')}</b></span></div>})}<aside><span><GraduationCap/><b>{m?.total??'—'}</b> classes</span><span><Users/><b>{m?.learners??'—'}</b> apprenants</span></aside></div></div></div>
      {canWrite&&<div className="od-menu"><button aria-label={'Actions pour '+o.name} aria-expanded={menu===o.id} onClick={()=>setMenu(menu===o.id?null:o.id)}><MoreHorizontal/></button>{menu===o.id&&<div className="od-actions">{actions(o)}</div>}</div>}
      <footer><span><MapPin/>{[m?.address,[m?.zip,m?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')||'—'}</span><span><Mail/>{m?.email||o.emailFrom||'—'}</span><span><Phone/>{m?.phone||'—'}</span>{canWrite&&<div className="od-actions">{actions(o)}</div>}</footer></article>
    })}</div>
    {list.isLoading?<p>Chargement…</p>:!shown.length&&!shownDrafts.length&&!drafts.isLoading&&!list.isError&&<p>Aucun organisme ne correspond à votre recherche.</p>}
    {status!=='draft'&&<div className="od-pages">{ordered.length?(current-1)*10+1:0} à {Math.min(current*10,ordered.length)} sur {ordered.length} organismes.<div><button aria-label="Précédent" disabled={current===1} onClick={()=>setPage(current-1)}><ChevronLeft/></button><b>{current}</b><button aria-label="Suivant" disabled={current===last} onClick={()=>setPage(current+1)}><ChevronRight/></button></div></div>}
    {deleting&&<ConfirmDelete title={`Supprimer ${deleting.name} ?`} onClose={close}><p>L’organisme sera retiré de la liste et conservé dans l’historique. Cette action est tracée dans le journal d’audit.</p>{linkedClasses > 0 && <div className="oa-caution"><TriangleAlert aria-hidden="true"/><div><strong>{linkedClasses} {linkedClasses === 1 ? 'classe rattachée' : 'classes rattachées'}</strong><p>Les classes et leur historique seront conservés.</p></div></div>}{err}<footer><button onClick={close}>Annuler</button>{deleting.active&&<button disabled={change.isPending} onClick={()=>toggle(deleting)}><Power/>Désactiver</button>}<button className="danger" disabled={change.isPending} onClick={()=>change.mutate({id:deleting.id,method:'DELETE'})}><Trash2 aria-hidden="true"/><span>Supprimer</span></button></footer></ConfirmDelete>}
  </section>
}

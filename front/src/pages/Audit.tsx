import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { FileText, List, ChartColumn, RotateCcw, Download, Search, ArrowUpDown, CheckCircle, CircleX, Pencil, LogIn, Plus, Trash2, Activity } from 'lucide-react'
import { api } from '../api'
import './admin-workspace.css'

type Entry = {id:number;at:string;author:string|null;action:string;entity:string|null;entityId:number|null;ip:string|null}
type Page = {entries:Entry[];next:number|null}
const labels:Record<string,string>={CREATE:'Création',UPDATE:'Modification',DELETE:'Suppression',LOGIN_SUCCESS:'Connexion',LOGIN_FAILURE:'Échec de connexion',MANUAL_REMINDER:'Relance manuelle',ZOOM_PROVISION:'Configuration Zoom'}
const actionName=(r:Entry)=>labels[r.action]??r.action
const actor=(r:Entry)=>r.author??'Système'
const resource=(r:Entry)=>[r.entity,r.entityId].filter(Boolean).join(' · ')||'—'
const status=(r:Entry)=>r.action==='LOGIN_FAILURE'?'Échec':'Succès'
const date=(r:Entry)=>new Date(r.at.includes('T')?r.at:r.at.replace(' ','T')).toLocaleString('fr-FR')
const columns=[['Date',(r:Entry)=>r.at],['Utilisateur',actor],['Action',actionName],['Ressource',resource],['Adresse IP',(r:Entry)=>r.ip??'—'],['Statut',status]] as const

async function loadAudit(){
  const rows:Entry[]=[]
  let cursor:number|null=null
  do {
    const page:Page=await api('/audit'+(cursor?'?before='+cursor:''))
    rows.push(...page.entries)
    cursor=page.next
  } while(cursor)
  return rows
}
export function Choice({label,value,options,onChange}:{label:string;value:string;options:string[];onChange:(v:string)=>void}){
  return <label>{label}<select value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o}>{o}</option>)}</select></label>
}
export default function Audit(){
  const {data=[],isLoading,error}=useQuery({queryKey:['audit-events'],queryFn:loadAudit})
  const initial=['','7 derniers jours','Tous les utilisateurs','Toutes les actions','Tous les statuts']
  const [filters,setFilters]=useState(initial),[page,setPage]=useState(1),[limit,setLimit]=useState(10),[stats,setStats]=useState(false)
  const [sort,setSort]=useState({key:0,dir:-1})
  const change=(i:number,v:string)=>{setFilters(filters.map((s,n)=>i===n?v:s));setPage(1)}
  const [openedAt]=useState(()=>Date.now())
  const days=parseInt(filters[1])
  const rows=data.filter(r=>(!days||Date.parse(r.at)>=openedAt-days*86400000)&&
    [actor(r),actionName(r),resource(r),r.ip].join(' ').toLocaleLowerCase().includes(filters[0].toLocaleLowerCase())&&
    [actor(r),actionName(r),status(r)].every((v,i)=>filters[i+2]===initial[i+2]||filters[i+2]===v))
    .sort((a,b)=>sort.dir*columns[sort.key][1](a).localeCompare(columns[sort.key][1](b),'fr',{numeric:true}))
  const pages=Math.max(1,Math.ceil(rows.length/limit)),current=Math.min(page,pages)
  const visible=rows.slice((current-1)*limit,current*limit)
  function download(){
    const values=[columns.map(c=>c[0]),...rows.map(r=>[date(r),actor(r),actionName(r),resource(r),r.ip??'',status(r)])]
    const csv=values.map(row=>row.map(v=>'"'+v.replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"').join(';')).join('\r\n')
    const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}))
    const a=document.createElement('a');a.href=url;a.download='journal-audit.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  return <section className="ad-work audit-work"><header><FileText/><div><h1>Journal d’audit</h1><p>Historique des actions réalisées sur la plateforme (traçabilité, sécurité et conformité).</p></div></header>
    <div className="ad-panel ad-filters"><label className="ad-search"><Search/><input aria-label="Recherche" placeholder="Rechercher une action, un utilisateur, une ressource…" value={filters[0]} onChange={e=>change(0,e.target.value)}/></label>
    {[[initial[1],'30 derniers jours','Toute la période'],[initial[2],...new Set(data.map(actor))],[initial[3],...new Set(data.map(actionName))],[initial[4],'Succès','Échec']].map((options,i)=><Choice key={i} label={['Période','Utilisateur','Action','Statut'][i]} value={filters[i+1]} options={options} onChange={v=>change(i+1,v)}/>)}</div>
    <div className="ad-toolbar"><button className={!stats?'primary':''} onClick={()=>setStats(false)}><List/>Liste des événements</button><button className={stats?'primary':''} onClick={()=>setStats(true)}><ChartColumn/>Statistiques</button><span/><button onClick={()=>{setFilters(initial);setPage(1)}}><RotateCcw/>Réinitialiser</button><button className="primary" onClick={download}><Download/>Exporter (CSV)</button></div>
    {error&&<p role="alert">{error.message}</p>}{isLoading&&<p>Chargement du journal…</p>}
    {stats?<div className="ad-panel"><h2>Événements par action</h2>{[...new Set(rows.map(actionName))].map(a=><p key={a}>{a} · {rows.filter(r=>actionName(r)===a).length}</p>)}</div>:<div className="ad-table"><table><thead><tr><th/>{columns.map(([name],key)=><th key={name}><button onClick={()=>setSort({key,dir:sort.key===key?-sort.dir:1})}>{name}<ArrowUpDown/></button></th>)}</tr></thead><tbody>{visible.map(r=>{const Icon=r.action.startsWith('LOGIN')?LogIn:r.action==='UPDATE'?Pencil:r.action==='DELETE'?Trash2:r.action==='CREATE'?Plus:Activity
    return <tr key={r.id}><td><Icon/></td><td>{date(r)}</td><td><b className="ad-avatar">{actor(r).slice(0,2).toUpperCase()}</b>{actor(r)}</td><td><b className="ad-chip"><Icon/>{actionName(r)}</b></td><td>{resource(r)}</td><td>{r.ip??'—'}</td><td><b className={'ad-chip '+(status(r)==='Succès'?'green':'red')}>{status(r)==='Succès'?<CheckCircle/>:<CircleX/>}{status(r)}</b></td></tr>})}</tbody></table></div>}
    {!isLoading&&!error&&!rows.length&&<p>Aucun événement pour ces filtres.</p>}
    {!stats&&<footer className="ad-toolbar">{visible.length} résultats sur {rows.length}<span/><select aria-label="Résultats par page" value={limit} onChange={e=>{setLimit(+e.target.value);setPage(1)}}>{[10,25,50].map(n=><option value={n} key={n}>{n} par page</option>)}</select><button disabled={current===1} onClick={()=>setPage(current-1)}>‹</button>{[...new Set([1,current,pages])].sort((a,b)=>a-b).map(n=><button className={n===current?'primary':''} key={n} onClick={()=>setPage(n)}>{n}</button>)}<button disabled={current===pages} onClick={()=>setPage(current+1)}>›</button></footer>}
  </section>
}

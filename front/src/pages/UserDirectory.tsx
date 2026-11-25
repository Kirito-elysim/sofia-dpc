import {Link,useNavigate} from 'react-router-dom'
import {ActivationActionIcon,ActivationStatusIcon} from '../components/ActivationIcons'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, ChevronRight, Plus, SearchX, RotateCcw, Pencil, Trash2, LogIn, Crown, Shield, ClipboardCheck, Eye, type LucideIcon } from 'lucide-react'
import { api, impersonate } from '../api'
import './users.css'

type Row = Record<string, any> & {id:number}
type Option = {value:string;label:string}
const roleIcons:Record<string,LucideIcon>={ROLE_SUPER_ADMIN:Crown,ROLE_ADMIN:Shield,ROLE_SUIVI:ClipboardCheck,ROLE_LECTURE:Eye}
const icon=(name:string)=><img alt="" src={'/'+name+'.png'}/>
type Org = {id:number;name:string;code:string}
function memberships(row:Row):Org[] {
  return row.organizations?.length ? row.organizations : row.organization ? [row.organization] : []
}
function lastLogin(value:string|null){
  if(!value)return '—'
  const date=new Date(value),today=new Date(),yesterday=new Date()
  yesterday.setDate(today.getDate()-1)
  const day=date.toDateString()===today.toDateString()?'Aujourd’hui':date.toDateString()===yesterday.toDateString()?'Hier':'Le '+date.toLocaleDateString('fr-FR',{day:'numeric',month:'short'})
  return day+' à '+date.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})
}
export default function UserDirectory({rows:accounts,roles}:{rows:Row[];roles:Option[]}){
  const navigate=useNavigate()
  // Trainer-only accounts are managed from the trainer sheet.
  const rows=accounts.filter(r=>r.role!=='ROLE_FORMATEUR')
  const qc=useQueryClient()
  const orgs=useQuery({queryKey:['organizations'],queryFn:()=>api<{id:number;name:string}[]>('/organizations')})
  const [query,search]=useState(''),[org,setOrg]=useState(''),[role,setRole]=useState(''),[status,setStatus]=useState('')
  const [page,setPage]=useState(1),[size,setSize]=useState(10),[checked,select]=useState<number[]>([]),[sort,setSort]=useState({key:'id',dir:1})
  const update=useMutation({mutationFn:(r:Row)=>api('/users/'+r.id,{method:'PATCH',headers:{'Content-Type':'application/merge-patch+json'},body:JSON.stringify({active:!r.active})}),onSuccess:()=>qc.invalidateQueries({queryKey:['users']})})
  const borrow=useMutation({mutationFn:impersonate})
  const roleName=(r:Row)=>roles.find(o=>o.value===(r.assignedRole??r.role))?.label??r.role
  const value=(r:Row,k:string)=>k==='organization'?memberships(r).map(o=>o.name).join(', '):k==='role'?roleName(r):r[k]
  const filtered=rows.filter(r=>(!org||memberships(r).some(o=>String(o.id)===org))&&(!role||(r.assignedRole??r.role)===role)&&(!status||String(r.active)===status)&&(r.name+' '+r.email).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  filtered.sort((a,b)=>String(value(a,sort.key)??'').localeCompare(String(value(b,sort.key)??''),'fr',{numeric:true})*sort.dir)
  const last=Math.max(1,Math.ceil(filtered.length/size)),current=Math.min(last,page),shown=filtered.slice((current-1)*size,current*size)
  const reset=()=>{search('');setOrg('');setRole('');setStatus('');setPage(1)}
  const filters=[{label:'Organisme',image:'catalog/filterOrg',all:'Tous les organismes',value:org,set:setOrg,options:orgs.data?.map(o=>({value:String(o.id),label:o.name}))??[]},{label:'Rôle',image:'planning/trainer',all:'Tous les rôles',value:role,set:setRole,options:roles},{label:'Statut',image:'organizations/education',all:'Tous les statuts',value:status,set:setStatus,options:[{value:'true',label:'Actif'},{value:'false',label:'Inactif'}]}]
  return <section className="oa user-directory"><header className="oa-title">{icon('users/heading')}<div><h1>Utilisateurs ({rows.length})</h1><p>Gérez les utilisateurs, leurs rôles et leurs accès à la plateforme.</p></div><Link className="blue page-add" to="/settings/users/new"><Plus/>Ajouter un utilisateur</Link></header>
    <div className="user-filters"><label>{icon('organizations/search')}<input aria-label="Rechercher un utilisateur" placeholder="Rechercher un utilisateur…" value={query} onChange={e=>{search(e.target.value);setPage(1)}}/></label>{filters.map(f=><label key={f.label}>{f.label}{icon(f.image)}<select value={f.value} onChange={e=>{f.set(e.target.value);setPage(1)}}><option value="">{f.all}</option>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select><ChevronDown className="user-filter-chevron" aria-hidden="true"/></label>)}<button className="user-filter-reset" type="button" onClick={reset}><RotateCcw aria-hidden="true"/>Réinitialiser</button></div>
    {(update.error||borrow.error)&&<p role="alert">{(update.error||borrow.error)?.message}</p>}
    {filtered.length>0&&<div className="oa-table"><div className="oa-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Sélectionner la page" checked={shown.length>0&&shown.every(r=>checked.includes(r.id))} onChange={e=>select(e.target.checked?[...new Set([...checked,...shown.map(r=>r.id)])]:checked.filter(id=>!shown.some(r=>r.id===id)))}/></th>{Object.entries({name:'Nom',email:'Email',role:'Rôle',organization:'Organisme',lastLoginAt:'Dernière connexion',active:'Statut'}).map(([key,label])=><th key={key}><button onClick={()=>setSort({key,dir:key===sort.key?-sort.dir:1})}>{label}{icon('organizations/sort')}</button></th>)}<th>Actions</th></tr></thead>
    <tbody>{shown.map(r=>{const RoleIcon=roleIcons[r.role]??Eye; return <tr key={r.id}><td><input aria-label={'Sélectionner '+r.name} type="checkbox" checked={checked.includes(r.id)} onChange={()=>select(checked.includes(r.id)?checked.filter(id=>id!==r.id):[...checked,r.id])}/></td><td><strong>{r.name}</strong></td><td>{r.email}</td><td><span className={'role-pill '+r.role}><RoleIcon aria-hidden="true"/>{roleName(r)}</span></td><td>{r.role==='ROLE_SUPER_ADMIN'?'Tous':memberships(r).length?memberships(r).map(o=><span key={o.id} className={'org org'+(o.code?.includes('PHO')?1:0)}>{o.name}</span>):'—'}</td><td>{lastLogin(r.lastLoginAt)}</td><td><b className={'oa-state '+(r.active?'on':'')}><ActivationStatusIcon active={r.active}/>{r.active?'Actif':'Inactif'}</b></td><td><div className="oa-actions directory-row-actions"><button onClick={()=>navigate('/settings/users/'+r.id+'/edit')}><Pencil aria-hidden="true"/>Modifier</button><button className={r.active?'neutral':'green'} disabled={update.isPending} onClick={()=>update.mutate(r)}><ActivationActionIcon active={r.active}/>{r.active?'Désactiver':'Activer'}</button><button disabled className="red" title="Les comptes sont conservés pour le journal d’audit"><Trash2 aria-hidden="true"/>Supprimer</button><button disabled={!r.active||r.role==='ROLE_SUPER_ADMIN'||borrow.isPending} onClick={()=>borrow.mutate(r.id)} aria-label={'Se connecter en tant que '+r.name} title={r.role==='ROLE_SUPER_ADMIN'?'Impossible pour un super admin':!r.active?'Compte désactivé':'Se connecter en tant que'}><LogIn aria-hidden="true"/></button></div></td></tr>})}</tbody></table></div>
    <footer>{filtered.length} résultats sur {rows.length}<select aria-label="Résultats par page" value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1)}}>{[10,25,50].map(n=><option value={n} key={n}>{n} par page</option>)}</select><button disabled={current===1} onClick={()=>setPage(current-1)} aria-label="Précédent"><ChevronLeft/></button><b>{current}</b><button disabled={current===last} onClick={()=>setPage(current+1)} aria-label="Suivant"><ChevronRight/></button></footer></div>}
    {filtered.length===0&&<section className="oa-empty"><div className="user-empty-icon"><SearchX aria-hidden="true"/></div><div><h2>Aucun résultat pour ce filtre</h2><p>Aucun utilisateur ne correspond à vos critères de recherche.</p><button onClick={reset}><RotateCcw aria-hidden="true"/>Réinitialiser les filtres</button></div></section>}
  </section>
}

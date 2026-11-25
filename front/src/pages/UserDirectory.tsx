import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { api } from '../api'
import './users.css'

type Row = Record<string, any> & {id:number}
type Option = {value:string;label:string}
const roleIcons:Record<string,string>={ROLE_SUPER_ADMIN:'crown',ROLE_ADMIN:'admin',ROLE_FORMATEUR:'trainer',ROLE_SUIVI:'reader',ROLE_LECTURE:'reader'}
const icon=(name:string)=><img alt="" src={'/'+name+'.png'}/>
function lastLogin(value:string|null){
  if(!value)return '—'
  const date=new Date(value),today=new Date(),yesterday=new Date()
  yesterday.setDate(today.getDate()-1)
  const day=date.toDateString()===today.toDateString()?'Aujourd’hui':date.toDateString()===yesterday.toDateString()?'Hier':'Le '+date.toLocaleDateString('fr-FR',{day:'numeric',month:'short'})
  return day+' à '+date.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})
}
export default function UserDirectory({rows,open,roles}:{rows:Row[];open:(row:Row|'new')=>void;roles:Option[]}){
  const qc=useQueryClient()
  const orgs=useQuery({queryKey:['organizations'],queryFn:()=>api<{id:number;name:string}[]>('/organizations')})
  const [query,search]=useState(''),[org,setOrg]=useState(''),[role,setRole]=useState(''),[status,setStatus]=useState('')
  const [page,setPage]=useState(1),[size,setSize]=useState(10),[checked,select]=useState<number[]>([]),[sort,setSort]=useState({key:'id',dir:1})
  const update=useMutation({mutationFn:(r:Row)=>api('/users/'+r.id,{method:'PATCH',headers:{'Content-Type':'application/merge-patch+json'},body:JSON.stringify({active:!r.active})}),onSuccess:()=>qc.invalidateQueries({queryKey:['users']})})
  const roleName=(r:Row)=>roles.find(o=>o.value===r.role)?.label??r.role
  const value=(r:Row,k:string)=>k==='organization'?r.organization?.name:k==='role'?roleName(r):r[k]
  const filtered=rows.filter(r=>(!org||String(r.organization?.id)===org)&&(!role||r.role===role)&&(!status||String(r.active)===status)&&(r.name+' '+r.email).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  filtered.sort((a,b)=>String(value(a,sort.key)??'').localeCompare(String(value(b,sort.key)??''),'fr',{numeric:true})*sort.dir)
  const last=Math.max(1,Math.ceil(filtered.length/size)),current=Math.min(last,page),shown=filtered.slice((current-1)*size,current*size)
  const reset=()=>{search('');setOrg('');setRole('');setStatus('');setPage(1)}
  const filters=[{label:'Organisme',image:'catalog/filterOrg',all:'Tous les organismes',value:org,set:setOrg,options:orgs.data?.map(o=>({value:String(o.id),label:o.name}))??[]},{label:'Rôle',image:'planning/trainer',all:'Tous les rôles',value:role,set:setRole,options:roles},{label:'Statut',image:'organizations/education',all:'Tous les statuts',value:status,set:setStatus,options:[{value:'true',label:'Actif'},{value:'false',label:'Inactif'}]}]
  return <section className="oa user-directory"><header className="oa-title">{icon('users/heading')}<div><h1>Utilisateurs ({rows.length})</h1><p>Gérez les utilisateurs, leurs rôles et leurs accès à la plateforme.</p></div><button className="blue page-add" onClick={()=>open('new')}><Plus/>Ajouter un utilisateur</button></header>
    <div className="user-filters"><label>{icon('organizations/search')}<input aria-label="Rechercher un utilisateur" placeholder="Rechercher un utilisateur…" value={query} onChange={e=>{search(e.target.value);setPage(1)}}/></label>{filters.map(f=><label key={f.label}>{f.label}{icon(f.image)}<select value={f.value} onChange={e=>{f.set(e.target.value);setPage(1)}}><option value="">{f.all}</option>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>)}<button onClick={reset}>{icon('organizations/reset')}Réinitialiser</button></div>
    {update.error&&<p role="alert">{update.error.message}</p>}
    <div className="oa-table"><div className="oa-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Sélectionner la page" checked={shown.length>0&&shown.every(r=>checked.includes(r.id))} onChange={e=>select(e.target.checked?[...new Set([...checked,...shown.map(r=>r.id)])]:checked.filter(id=>!shown.some(r=>r.id===id)))}/></th>{Object.entries({name:'Nom',email:'Email',role:'Rôle',organization:'Organisme',lastLoginAt:'Dernière connexion',active:'Statut'}).map(([key,label])=><th key={key}><button onClick={()=>setSort({key,dir:key===sort.key?-sort.dir:1})}>{label}{icon('organizations/sort')}</button></th>)}<th>Actions</th></tr></thead>
    <tbody>{shown.map(r=><tr key={r.id}><td><input aria-label={'Sélectionner '+r.name} type="checkbox" checked={checked.includes(r.id)} onChange={()=>select(checked.includes(r.id)?checked.filter(id=>id!==r.id):[...checked,r.id])}/></td><td><strong>{r.name}</strong></td><td>{r.email}</td><td><span className={'role-pill '+r.role}>{icon('users/'+(roleIcons[r.role]??'reader'))}{roleName(r)}</span></td><td>{r.organization?<span className={'org org'+(r.organization.code?.includes('PHO')?1:0)}>{r.organization.name}</span>:'—'}</td><td>{lastLogin(r.lastLoginAt)}</td><td><b className={'oa-state '+(r.active?'on':'')}>{icon('organizations/'+(r.active?'active':'inactive'))}{r.active?'Actif':'Inactif'}</b></td><td><div className="oa-actions"><button onClick={()=>open(r)}>{icon('organizations/edit')}Modifier</button><button className={r.active?'neutral':'green'} disabled={update.isPending} onClick={()=>update.mutate(r)}>{icon('organizations/power')}{r.active?'Désactiver':'Activer'}</button><button disabled className="red" title="Les comptes sont conservés pour le journal d’audit">{icon('organizations/delete')}Supprimer</button></div></td></tr>)}</tbody></table></div>
    <footer>{filtered.length} résultats sur {rows.length}<select aria-label="Résultats par page" value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1)}}>{[10,25,50].map(n=><option value={n} key={n}>{n} par page</option>)}</select><button disabled={current===1} onClick={()=>setPage(current-1)} aria-label="Précédent"><ChevronLeft/></button><b>{current}</b><button disabled={current===last} onClick={()=>setPage(current+1)} aria-label="Suivant"><ChevronRight/></button></footer></div>
    <section className="oa-empty">{icon('users/empty')}<div><h2>Aucun résultat pour ce filtre</h2><p>Aucun utilisateur ne correspond à vos critères de recherche.</p><button onClick={reset}>{icon('organizations/reset')}Réinitialiser les filtres</button></div></section>
  </section>
}

import {Picto,type PictoName} from '../components/Picto'
import {ActivationActionIcon,ActivationStatusIcon} from '../components/ActivationIcons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query'
import { ArrowUpDown, CalendarDays, Check, Clock, LogIn, Pencil, Plus, RotateCcw, SearchX, Trash2, X } from 'lucide-react'
import { api, impersonate, type Me, type VirtualClass } from '../api'
import { FieldInput, type Field } from '../components/CrudPage'
import { fromRow, toPayload } from '../components/crudValues'
import { useLocation, useNavigate } from 'react-router-dom'
import './organizations.css'
import './organization-list.css'
import './catalog.css'

type Row = Parameters<typeof fromRow>[1] & {id:number}
type Account = {userId:number;superAdmin:boolean;trainerId:number;staff:boolean;active:boolean}
type Org = {id:number;name:string;code?:string}
const activeField:Field={name:'active',label:'Actif',type:'checkbox'}
const topics:Record<string,PictoName>={'Métabolisme':'heart','Cardiologie':'activity','Infectiologie':'pill'}
const notes=[
  ['Filtres rapides et recherche globale pour retrouver une formation en un clic.','Actions contextuelles : modifier, activer/désactiver, supprimer directement depuis la liste.','Gestion par lots possible (sélection multiple) pour activer, désactiver ou supprimer plusieurs formations.'],
  ['Souhaitez-vous gérer une catégorisation multi-niveaux (thématique > sous-thématique) ?','Faut-il tracer l’historique des modifications (qui, quand, quoi) sur chaque formation ?','Prévoyez-vous des versions de formation (ex. V1, V2) ou une simple mise à jour ?']
]
function Dialog({drawer,title,close,children,trainer}:{drawer?:boolean,title:string,close:()=>void,children:ReactNode,trainer:boolean}){
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const d=ref.current!;d.showModal();return ()=>d.close()},[])
  return <dialog ref={ref} className={'oa-dialog cat-dialog '+(drawer?'drawer':'confirm')} onCancel={e=>{e.preventDefault();close()}} aria-label={title}><header><Picto name={drawer?(trainer?'trainer':'training'):'trash'} className="oa-icon"/><h2>{title}</h2><button onClick={close} aria-label="Fermer"><X/></button></header>{children}</dialog>
}
export default function Catalog({path,title,fields,canWrite,defaults={}}:{path:string,title:string,fields:Field[],canWrite:boolean,defaults?:Record<string,unknown>}){
  const trainer=path==='trainers', noun=trainer?'un formateur':'une formation'
  const qc=useQueryClient()
  const list=useQuery({queryKey:[path],queryFn:()=>api<Row[]>('/'+path)})
  const orgs=useQuery({queryKey:['organizations'],queryFn:()=>api<Row[]>('/organizations')})
  const classes=useQuery({queryKey:['classes'],queryFn:()=>api<(VirtualClass & {training:{id:number}})[]>('/virtual-classes'),enabled:!trainer})
  const rows=list.data??[]
  const [org,setOrg]=useState(''),[status,setStatus]=useState(''),[topic,setTopic]=useState(''),[q,search]=useState('')
  const [checked,select]=useState<number[]>([]),[page,setPage]=useState(1),[size,setSize]=useState(10),[sort,order]=useState({key:'id',dir:1})
  const [editing,edit]=useState<Row|'new'|null>(null),[removing,remove]=useState<Row|null>(null),[values,setValues]=useState<Record<string,unknown>>({})
  const accounts=useQuery({queryKey:['trainer-accounts'],queryFn:()=>api<Account[]>('/trainer-accounts'),enabled:trainer&&canWrite})
  const me=useQuery({queryKey:['me'],queryFn:()=>api<Me>('/auth/me')})
  const superAdmin=trainer&&!!me.data?.roles.includes('ROLE_SUPER_ADMIN')
  const borrow=useMutation({mutationFn:impersonate})
  const navigate=useNavigate(),notice=(useLocation().state as {notice?:string}|null)?.notice
  const mutation=useMutation({mutationFn:({id,method,body}:{id?:number,method:string,body?:object})=>api('/'+path+(id?'/'+id:''),{method,body:JSON.stringify(body),headers:method==='PATCH'?{'Content-Type':'application/merge-patch+json'}:{}}),onSuccess:()=>{edit(null);remove(null);void qc.invalidateQueries()}})
  function open(row:Row|'new'){
    if(trainer){navigate('/settings/trainers/'+(row==='new'?'new':row.id+'/edit'));return}
    mutation.reset();setValues(fromRow([...fields,activeField],row==='new'?null:row,{active:true,...defaults}));edit(row)}
  function save() {
    const formFields = [...fields, activeField]
    const creating = editing === 'new'
    const body = toPayload(formFields, values, creating)
    if (editing && editing !== 'new') {
      const previous = fromRow(formFields, editing, { active: true, ...defaults })
      for (const field of formFields) {
        if (field.relation && JSON.stringify(values[field.name]) === JSON.stringify(previous[field.name])) {
          delete body[field.name]
        }
      }
    }
    mutation.mutate({method: creating ? 'POST' : 'PATCH', id: editing && editing !== 'new' ? editing.id : undefined, body})
  }
  function close(){if(!mutation.isPending){edit(null);remove(null);mutation.reset()}}
  function toggle(r:Row){mutation.mutate({id:r.id,method:'PATCH',body:{active:!r.active}})}
  const reset=()=>{setOrg('');setTopic('');setStatus('');search('');setPage(1)}
  const name=(r:Row)=>trainer?[r.civility,r.lastName,r.firstName].filter(Boolean).join(' '):String(r.title)
  const sessions=new Map<number,number>();for(const c of classes.data??[])sessions.set(c.training.id,(sessions.get(c.training.id)??0)+1)
  const memberships=(r:Row)=>(trainer?r.organizations??[]:r.organization?[r.organization]:[]) as Org[]
  const value=(r:Row,key:string)=>key==='name'?name(r):key==='organization'?memberships(r).map(o=>o.name).join(', '):key==='sessions'?sessions.get(r.id)??0:r[key]
  const filtered=rows.filter(r=>(!org||memberships(r).some(o=>String(o.id)===org))&&(!status||String(r.active)===status)&&(!topic||r.theme===topic)&&name(r).toLowerCase().includes(q.toLowerCase())).sort((a,b)=>String(value(a,sort.key)??'').localeCompare(String(value(b,sort.key)??''),'fr',{numeric:true})*sort.dir)
  const last=Math.max(1,Math.ceil(filtered.length/size)),current=Math.min(page,last),shown=filtered.slice((current-1)*size,current*size)
  const cols=trainer?[['name','Nom et prénom'],['organization','Organisme'],['specialty','Spécialité'],['email','Email'],['phone','Téléphone'],['active','Statut']]:[['name','Formation'],['organization','Organisme'],['theme','Thématique'],['totalDurationMin','Durée'],['sessions','Sessions'],['active','Statut']]
  const groups=[['Informations générales','title','organization','theme','reference'],['Paramètres','totalDurationMin','defaultCapacity','active']]
  const error=mutation.error&&<p role="alert" className="oa-error">{mutation.error.message}</p>
  const add=<button className="blue page-add" onClick={()=>open('new')}><Plus/>Ajouter {noun}</button>
  return <section className={'oa catalog '+(trainer?'trainer-catalog':'')}><header className="oa-title"><Picto name={trainer?'users':'training'} className="picto-heading"/><div><h1>{title}{!trainer&&' ('+rows.length+')'}</h1><p>{trainer?'Gérez les formateurs habilités à animer des classes virtuelles DPC.':'Gérez la liste des formations DPC proposées dans vos organismes.'}</p></div>{!trainer&&<><div className="cat-switch">Organisme {[[0,'Tous'],...(orgs.data??[]).filter(o=>o.active).map(o=>[o.id,o.name])].map(([id,label])=><button key={id} aria-pressed={org===String(id||'')} onClick={()=>setOrg(String(id||''))}>{id?<i className={String(label).includes('PHO')?'purple':''}/>:<Picto name="training"/>}{label}</button>)}</div></>}{canWrite&&add}</header>
  <div className="oa-filters"><label><Picto name="search" className="oa-icon"/><input aria-label="Recherche" placeholder={'Rechercher '+noun+'…'} value={q} onChange={e=>{search(e.target.value);setPage(1)}}/></label><label>Organisme<Picto name="building" className="oa-icon"/><select value={org} onChange={e=>{setOrg(e.target.value);setPage(1)}}><option value="">Tous les organismes</option>{orgs.data?.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>Statut<Picto name="done" className="oa-icon"/><select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Tous les statuts</option><option value="true">Actif</option><option value="false">Inactif</option></select></label>{!trainer&&<label>Thématique<Picto name="tag" className="oa-icon"/><select value={topic} onChange={e=>{setTopic(e.target.value);setPage(1)}}><option value="">Toutes les thématiques</option>{[...new Set(rows.map(r=>r.theme).filter(Boolean))].map(t=><option key={t}>{t}</option>)}</select></label>}<button onClick={reset}><RotateCcw/>Réinitialiser</button></div>
  {notice&&<p role="status" className="oa-info">{notice}</p>}{borrow.error&&<p role="alert">{borrow.error.message}</p>}{list.error&&<p role="alert">{list.error.message}</p>}{!editing&&!removing&&error}
  <section className="oa-table"><div className="oa-scroll"><table className="od-table"><thead><tr><th><input aria-label="Sélectionner la page" type="checkbox" checked={!!shown.length&&shown.every(r=>checked.includes(r.id))} onChange={e=>select(e.target.checked?[...new Set([...checked,...shown.map(r=>r.id)])]:checked.filter(id=>!shown.some(r=>r.id===id)))}/></th>{cols.map(([key,label])=><th key={key}><button onClick={()=>order({key,dir:key===sort.key?-sort.dir:1})}>{label}<ArrowUpDown/></button></th>)}{canWrite&&<th>Actions</th>}</tr></thead><tbody>{shown.map(r=><tr key={r.id}><td><input type="checkbox" aria-label={'Sélectionner '+name(r)} checked={checked.includes(r.id)} onChange={()=>select(checked.includes(r.id)?checked.filter(id=>id!==r.id):[...checked,r.id])}/></td><td><strong>{name(r)}</strong></td><td>{memberships(r).length?memberships(r).map(o=><span key={o.id} className={'org org'+(o.code?.includes('PHO')?1:0)}>{o.name}</span>):'—'}</td>{trainer?<><td>{r.specialty||'—'}</td><td>{r.email}</td><td>{r.phone||'—'}</td></>:<><td><span className="cat-topic"><Picto name={topics[String(r.theme)]??'brain'}/>{r.theme||'—'}</span></td><td><span className="oa-inline"><Clock/>{r.totalDurationMin?r.totalDurationMin/60+' h':'—'}</span></td><td><span className="oa-inline"><CalendarDays/>{classes.data?sessions.get(r.id)??0:'—'}</span></td></>}<td><b className={'oa-state '+(r.active?'on':'')}><ActivationStatusIcon active={r.active}/>{r.active?'Actif':'Inactif'}</b></td>{canWrite&&<td><div className="oa-actions directory-row-actions"><button aria-label={'Modifier '+name(r)} onClick={()=>open(r)}><Pencil/>Modifier</button><button className={r.active?'neutral':'green'} disabled={mutation.isPending} onClick={()=>toggle(r)}><ActivationActionIcon active={r.active}/>{r.active?'Désactiver':'Activer'}</button><button aria-label={'Supprimer '+name(r)} className="red" onClick={()=>{mutation.reset();remove(r)}}><Trash2/>Supprimer</button>{superAdmin&&(()=>{const a=accounts.data?.find(x=>x.trainerId===r.id),ok=!!a&&!a.superAdmin&&a.active&&(a.staff||!!r.active);return <button className="neutral" disabled={!ok||borrow.isPending} onClick={()=>borrow.mutate(a!.userId)} aria-label={'Se connecter en tant que '+name(r)} title={ok?'Se connecter en tant que':a?.superAdmin?'Impossible pour un super admin':'Aucun accès actif'}><LogIn/></button>})()}</div></td>}</tr>)}{!filtered.length&&list.data&&<tr className="cat-empty-row"><td colSpan={cols.length+(canWrite?2:1)}><div className="od-empty" role="status"><i><SearchX aria-hidden="true"/></i><h2>{rows.length?'Aucun résultat':trainer?'Aucun formateur':'Aucune formation'}</h2>{rows.length?<><p>Essayez un autre terme ou réinitialisez les filtres.</p><button type="button" onClick={reset}>Réinitialiser les filtres</button></>:canWrite&&<button type="button" onClick={()=>open('new')}>Ajouter {noun}</button>}</div></td></tr>}</tbody></table></div><footer>{list.isLoading?'Chargement…':filtered.length+' résultats sur '+rows.length}<select aria-label="Taille de page" value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1)}}>{[10,25,50].map(n=><option key={n} value={n}>{n} par page</option>)}</select><button disabled={current<=1} onClick={()=>setPage(current-1)}>‹</button><b>{current}</b><button disabled={current>=last} onClick={()=>setPage(current+1)}>›</button></footer></section>
  {!trainer&&<div className="oa-notes">{[0,1].map(i=><section key={i}><h3><Picto name={i?'help':'idea'}/>{i?'Questions ouvertes':'Points d’ergonomie'}</h3><ul>{notes[i].map(t=><li key={t}>{t}</li>)}</ul></section>)}</div>}
  {editing&&<Dialog drawer trainer={trainer} title={'Ajouter / Modifier '+noun} close={close}><form onSubmit={e=>{e.preventDefault();save()}}><div className="oa-form">{groups.map(([label,...names],i)=><section key={label}><h3>{['①','②','③'][i]}　{label}</h3><div className="cat-fields">{names.map(n=>{const f=[...fields,activeField].find(item=>item.name===n)!;return <label key={n} className={'field-'+n}>{f.label}{f.required&&' *'}{n==='comments'?<textarea maxLength={500} value={String(values[n]??'')} onChange={e=>setValues({...values,[n]:e.target.value})}/>:<FieldInput f={f} value={values[n]} onChange={v=>setValues({...values,[n]:v})} disabled={false}/>}</label>})}</div></section>)}{error}</div><footer><button type="button" onClick={close}>Annuler</button><button className="blue" disabled={mutation.isPending}><Check/>Enregistrer</button></footer></form></Dialog>}
  {removing&&<Dialog trainer={trainer} title={trainer?'Supprimer ce formateur ?':'Supprimer cette formation ?'} close={close}><p><b>{name(removing)}</b></p><p className="oa-info">Cette fiche sera retirée du catalogue. L’historique des classes et des attestations sera conservé.</p><p>Cette action est tracée dans le journal d’audit.</p>{error}<footer><button onClick={close}>Annuler</button><button disabled={mutation.isPending} onClick={()=>toggle(removing)}><ActivationActionIcon active={removing.active}/>{removing.active?'Désactiver':'Activer'}</button><button className="danger" disabled={mutation.isPending} onClick={()=>mutation.mutate({method:'DELETE',id:removing.id})}><Trash2/>Supprimer</button></footer></Dialog>}
  </section>
}

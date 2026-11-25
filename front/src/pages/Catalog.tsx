import {ActivationActionIcon,ActivationStatusIcon} from '../components/ActivationIcons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query'
import { ArrowUpDown, CalendarDays, Check, Clock, LogIn, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { api, impersonate, type Me, type VirtualClass } from '../api'
import { FieldInput, type Field } from '../components/CrudPage'
import { fromRow, toPayload } from '../components/crudValues'
import './organizations.css'
import './catalog.css'

type Row = Parameters<typeof fromRow>[1] & {id:number}
type Account = {userId:number;superAdmin:boolean;trainerId:number;staff:boolean;active:boolean}
const accessMessages:Record<string,string>={created:'Accès créé, invitation envoyée.',sent:'Nouveau mot de passe temporaire envoyé.',linked:'Formateur rattaché au compte existant : « Mes classes » est ajouté à ce compte.',enabled:'Accès activé.',disabled:'Accès désactivé.'}
async function grantAccess(id:number,active?:boolean){
  const toggle=active!==undefined
  const {result}=await api<{result:string}>('/trainers/'+id+'/access',toggle?{method:'PATCH',headers:{'Content-Type':'application/merge-patch+json'},body:JSON.stringify({active})}:{method:'POST'})
  return accessMessages[result]
}
function TrainerAccess({account,loading,active,busy,run}:{account?:Account,loading:boolean,active:boolean,busy:boolean,run:(active?:boolean)=>void}){
  if(loading)return <p>Chargement…</p>
  if(account?.staff)return <p>Rattaché à un compte de gestion. « Mes classes » est ouvert tant que la fiche est active.</p>
  if(!active)return <p>Fiche désactivée : aucun accès possible.</p>
  if(!account)return <><p>Aucun accès.</p><button type="button" disabled={busy} onClick={()=>run()}>Créer l’accès à Sofia</button></>
  return <><p>Compte formateur {account.active?'actif':'désactivé'}.</p>{account.active&&<button type="button" disabled={busy} onClick={()=>run()}>Renvoyer l’accès</button>} <button type="button" disabled={busy} onClick={()=>run(!account.active)}>{account.active?'Désactiver l’accès':'Activer l’accès'}</button></>
}
const activeField:Field={name:'active',label:'Actif',type:'checkbox'}
const picture=(name:string)=><img alt="" className="oa-icon" src={'/catalog/'+name+'.png'}/>
const topics:Record<string,string>={'Métabolisme':'heart','Cardiologie':'pulse','Infectiologie':'pill'}
const notes=[
  ['Filtres rapides et recherche globale pour retrouver une formation en un clic.','Actions contextuelles : modifier, activer/désactiver, supprimer directement depuis la liste.','Gestion par lots possible (sélection multiple) pour activer, désactiver ou supprimer plusieurs formations.'],
  ['Souhaitez-vous gérer une catégorisation multi-niveaux (thématique > sous-thématique) ?','Faut-il tracer l’historique des modifications (qui, quand, quoi) sur chaque formation ?','Prévoyez-vous des versions de formation (ex. V1, V2) ou une simple mise à jour ?'],
  ['Drawer latéral pour une édition rapide sans quitter la liste.','Alerte claire en cas d’élément utilisé, avec proposition de désactivation.','Filtres et recherche en en-tête pour retrouver rapidement un formateur.'],
  ['Souhaitez-vous une fiche formateur détaillée (historique des classes, taux de présence, documents) ?','Faut-il gérer des disponibilités / indisponibilités du formateur (calendrier ou plages) ?','Souhaitez-vous limiter l’affectation d’un formateur à un organisme (SOFIA ou STUDIO PHOCEA) ?','Les spécialités doivent-elles être une liste fixe ou libre ?']
]
function Dialog({drawer,title,close,children,trainer}:{drawer?:boolean,title:string,close:()=>void,children:ReactNode,trainer:boolean}){
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const d=ref.current!;d.showModal();return ()=>d.close()},[])
  return <dialog ref={ref} className={'oa-dialog cat-dialog '+(drawer?'drawer':'confirm')} onCancel={e=>{e.preventDefault();close()}} aria-label={title}><header>{drawer?picture(trainer?'trainer':'training'):<img src="/catalog/deleteTrainer.png" alt=""/>}<h2>{title}</h2><button onClick={close} aria-label="Fermer"><X/></button></header>{children}</dialog>
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
  const [createAccess,setCreateAccess]=useState(true),[notice,setNotice]=useState('')
  const access=useMutation({mutationFn:({id,active}:{id:number,active?:boolean})=>grantAccess(id,active),onSuccess:message=>{setNotice(message);void qc.invalidateQueries({queryKey:['trainer-accounts']})}})
  const mutation=useMutation({mutationFn:async({id,method,body,invite}:{id?:number,method:string,body?:object,invite?:boolean})=>{
    const saved=await api<Row>('/'+path+(id?'/'+id:''),{method,body:JSON.stringify(body),headers:method==='PATCH'?{'Content-Type':'application/merge-patch+json'}:{}})
    // The sheet is already saved: an access failure is reported, not thrown, so a retry cannot duplicate it.
    return invite?grantAccess(saved.id).catch((e:Error)=>'Fiche enregistrée, accès non créé : '+e.message):''
  },onSuccess:message=>{setNotice(message??'');edit(null);remove(null);void qc.invalidateQueries()}})
  function open(row:Row|'new'){mutation.reset();access.reset();setNotice('');setCreateAccess(true);setValues(fromRow([...fields,activeField],row==='new'?null:row,{active:true,...defaults}));edit(row)}
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
    mutation.mutate({invite: trainer && creating && createAccess && !!values.active, method: creating ? 'POST' : 'PATCH', id: editing && editing !== 'new' ? editing.id : undefined, body})
  }
  function close(){if(!mutation.isPending){edit(null);remove(null);mutation.reset()}}
  function toggle(r:Row){mutation.mutate({id:r.id,method:'PATCH',body:{active:!r.active}})}
  const reset=()=>{setOrg('');setTopic('');setStatus('');search('');setPage(1)}
  const name=(r:Row)=>trainer?[r.civility,r.lastName,r.firstName].filter(Boolean).join(' '):String(r.title)
  const sessions=new Map<number,number>();for(const c of classes.data??[])sessions.set(c.training.id,(sessions.get(c.training.id)??0)+1)
  const value=(r:Row,key:string)=>key==='name'?name(r):key==='organization'?r.organization?.name:key==='sessions'?sessions.get(r.id)??0:r[key]
  const filtered=rows.filter(r=>(!org||String(r.organization?.id)===org)&&(!status||String(r.active)===status)&&(!topic||r.theme===topic)&&name(r).toLowerCase().includes(q.toLowerCase())).sort((a,b)=>String(value(a,sort.key)??'').localeCompare(String(value(b,sort.key)??''),'fr',{numeric:true})*sort.dir)
  const last=Math.max(1,Math.ceil(filtered.length/size)),current=Math.min(page,last),shown=filtered.slice((current-1)*size,current*size)
  const cols=trainer?[['name','Nom et prénom'],['organization','Organisme'],['specialty','Spécialité'],['email','Email'],['phone','Téléphone'],['active','Statut']]:[['name','Formation'],['organization','Organisme'],['theme','Thématique'],['totalDurationMin','Durée'],['sessions','Sessions'],['active','Statut']]
  const groups=trainer?[['Informations générales','civility','lastName','firstName','email','phone'],['Organisme et spécialité','organization','specialty'],['Paramètres','active','comments','trainings']]:[['Informations générales','title','organization','theme','reference'],['Paramètres','totalDurationMin','defaultCapacity','active']]
  const error=mutation.error&&<p role="alert" className="oa-error">{mutation.error.message}</p>
  const add=<button className="blue page-add" onClick={()=>open('new')}><Plus/>Ajouter {noun}</button>
  return <section className={'oa catalog '+(trainer?'trainer-catalog':'')}><header className="oa-title">{picture(trainer?'trainers':'training')}<div><h1>{title}{!trainer&&' ('+rows.length+')'}</h1><p>{trainer?'Gérez les formateurs habilités à animer des classes virtuelles DPC.':'Gérez la liste des formations DPC proposées dans vos organismes.'}</p></div>{!trainer&&<><div className="cat-switch">Organisme {[[0,'Tous'],...(orgs.data??[]).filter(o=>o.active).map(o=>[o.id,o.name])].map(([id,label])=><button key={id} aria-pressed={org===String(id||'')} onClick={()=>setOrg(String(id||''))}>{id?<i className={String(label).includes('PHO')?'purple':''}/>:<img alt="" src="/catalog/training.png"/>}{label}</button>)}</div></>}{canWrite&&add}</header>
  <div className="oa-filters"><label><img className="oa-icon" src="/organizations/search.png" alt=""/><input aria-label="Recherche" placeholder={'Rechercher '+noun+'…'} value={q} onChange={e=>{search(e.target.value);setPage(1)}}/></label><label>Organisme{picture('filterOrg')}<select value={org} onChange={e=>{setOrg(e.target.value);setPage(1)}}><option value="">Tous les organismes</option>{orgs.data?.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>Statut<img className="oa-icon" src="/organizations/education.png" alt=""/><select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Tous les statuts</option><option value="true">Actif</option><option value="false">Inactif</option></select></label>{!trainer&&<label>Thématique{picture('filterTag')}<select value={topic} onChange={e=>{setTopic(e.target.value);setPage(1)}}><option value="">Toutes les thématiques</option>{[...new Set(rows.map(r=>r.theme).filter(Boolean))].map(t=><option key={t}>{t}</option>)}</select></label>}<button onClick={reset}><RotateCcw/>Réinitialiser</button></div>
  {notice&&!editing&&<p role="status" className="oa-info">{notice}</p>}{borrow.error&&<p role="alert">{borrow.error.message}</p>}{list.error&&<p role="alert">{list.error.message}</p>}{!editing&&!removing&&error}
  <section className="oa-table"><div className="oa-scroll"><table><thead><tr><th><input aria-label="Sélectionner la page" type="checkbox" checked={!!shown.length&&shown.every(r=>checked.includes(r.id))} onChange={e=>select(e.target.checked?[...new Set([...checked,...shown.map(r=>r.id)])]:checked.filter(id=>!shown.some(r=>r.id===id)))}/></th>{cols.map(([key,label])=><th key={key}><button onClick={()=>order({key,dir:key===sort.key?-sort.dir:1})}>{label}<ArrowUpDown/></button></th>)}{canWrite&&<th>Actions</th>}</tr></thead><tbody>{shown.map(r=><tr key={r.id}><td><input type="checkbox" aria-label={'Sélectionner '+name(r)} checked={checked.includes(r.id)} onChange={()=>select(checked.includes(r.id)?checked.filter(id=>id!==r.id):[...checked,r.id])}/></td><td><strong>{name(r)}</strong></td><td>{r.organization?<span className={'org org'+(r.organization.code.includes('PHO')?1:0)}>{r.organization.name}</span>:'—'}</td>{trainer?<><td>{r.specialty||'—'}</td><td>{r.email}</td><td>{r.phone||'—'}</td></>:<><td><span className="cat-topic">{picture(topics[r.theme]??'brain')}{r.theme||'—'}</span></td><td><span className="oa-inline"><Clock/>{r.totalDurationMin?r.totalDurationMin/60+' h':'—'}</span></td><td><span className="oa-inline"><CalendarDays/>{classes.data?sessions.get(r.id)??0:'—'}</span></td></>}<td><b className={'oa-state '+(r.active?'on':'')}><ActivationStatusIcon active={r.active}/>{r.active?'Actif':'Inactif'}</b></td>{canWrite&&<td><div className="oa-actions"><button aria-label={'Modifier '+name(r)} onClick={()=>open(r)}><Pencil/>{!trainer&&'Modifier'}</button>{!trainer&&<button className="neutral" disabled={mutation.isPending} onClick={()=>toggle(r)}><ActivationActionIcon active={r.active}/>{r.active?'Désactiver':'Activer'}</button>}<button aria-label={'Actions pour '+name(r)} className={trainer?'neutral':'red'} onClick={()=>{mutation.reset();remove(r)}}>{trainer?<MoreHorizontal/>:<><Trash2/>Supprimer</>}</button>{superAdmin&&(()=>{const a=accounts.data?.find(x=>x.trainerId===r.id),ok=!!a&&!a.superAdmin&&a.active&&(a.staff||!!r.active);return <button className="neutral" disabled={!ok||borrow.isPending} onClick={()=>borrow.mutate(a!.userId)} aria-label={'Se connecter en tant que '+name(r)} title={ok?'Se connecter en tant que':a?.superAdmin?'Impossible pour un super admin':'Aucun accès actif'}><LogIn/></button>})()}</div></td>}</tr>)}</tbody></table></div><footer>{list.isLoading?'Chargement…':filtered.length+' résultats sur '+rows.length}<select aria-label="Taille de page" value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1)}}>{[10,25,50].map(n=><option key={n} value={n}>{n} par page</option>)}</select><button disabled={current<=1} onClick={()=>setPage(current-1)}>‹</button><b>{current}</b><button disabled={current>=last} onClick={()=>setPage(current+1)}>›</button></footer></section>
  {(!trainer||!filtered.length)&&<div className="oa-empty"><img src="/organizations/empty.png" alt=""/><div><h2>Aucun résultat pour ce filtre</h2><p>{trainer?'Aucun formateur ne correspond':'Aucune formation ne correspond'} à vos critères de recherche.</p><button onClick={reset}><RotateCcw/>Réinitialiser les filtres</button></div></div>}
  <div className="oa-notes">{[0,1].map(i=><section key={i}><h3><img src={'/organizations/'+(i?'help':'idea')+'.png'} alt=""/>{i?'Questions ouvertes':trainer?'3 points d’ergonomie':'Points d’ergonomie'}</h3><ul>{notes[(trainer?2:0)+i].map(t=><li key={t}>{t}</li>)}</ul></section>)}</div>
  {editing&&<Dialog drawer trainer={trainer} title={'Ajouter / Modifier '+noun} close={close}><form onSubmit={e=>{e.preventDefault();save()}}><div className="oa-form">{groups.map(([label,...names],i)=><section key={label}><h3>{['①','②','③'][i]}　{label}</h3><div className="cat-fields">{names.map(n=>{const f=[...fields,activeField].find(item=>item.name===n)!;if(trainer&&n==='organization')return <fieldset className="cat-org-options" key={n}><legend>Organisme</legend>{orgs.data?.map(o=><label key={o.id}><input type="radio" name="trainer-organization" checked={String(values[n])===String(o.id)} onChange={()=>setValues({...values,[n]:String(o.id)})}/>{o.name}</label>)}</fieldset>
    if(trainer&&n==='active')return <label className="cat-active" key={n}>Statut <input type="checkbox" checked={!!values.active} onChange={e=>setValues({...values,active:e.target.checked})}/>{values.active?'Actif':'Désactivé'}<small>Le formateur pourra être affecté à de nouvelles classes.</small></label>
    if(trainer&&n==='trainings')return <details key={n}><summary>Formations assurées</summary><FieldInput f={f} value={values[n]} onChange={v=>setValues({...values,[n]:v})} disabled={false}/></details>
    return <label key={n} className={'field-'+n}>{f.label}{f.required&&' *'}{n==='comments'?<textarea maxLength={500} value={String(values[n]??'')} onChange={e=>setValues({...values,[n]:e.target.value})}/>:<FieldInput f={f} value={values[n]} onChange={v=>setValues({...values,[n]:v})} disabled={false}/>}</label>})}</div></section>)}{trainer&&<section className="cat-access"><h3>④　Accès à Sofia</h3>{editing==='new'?<label className="cat-active">Créer l’accès à Sofia <input type="checkbox" checked={createAccess&&!!values.active} disabled={!values.active} onChange={e=>setCreateAccess(e.target.checked)}/><small>Envoie une invitation à l’e-mail du formateur (accès « Mes classes »). Un compte existant avec cet e-mail est rattaché.</small></label>:<TrainerAccess account={accounts.data?.find(a=>a.trainerId===editing.id)} loading={accounts.isLoading} active={!!editing.active} busy={access.isPending} run={active=>access.mutate({id:editing.id,active})}/>}{notice&&<p role="status">{notice}</p>}{(access.error||accounts.error)&&<p role="alert" className="oa-error">{(access.error||accounts.error)?.message}</p>}</section>}{error}</div><footer><button type="button" onClick={close}>Annuler</button><button className="blue" disabled={mutation.isPending}><Check/>Enregistrer</button></footer></form></Dialog>}
  {removing&&<Dialog trainer={trainer} title={trainer?'Supprimer ce formateur ?':'Supprimer cette formation ?'} close={close}><p><b>{name(removing)}</b></p><p className="oa-info">Cette fiche sera retirée du catalogue. L’historique des classes et des attestations sera conservé.</p><p>Cette action est tracée dans le journal d’audit.</p>{error}<footer><button onClick={close}>Annuler</button><button disabled={mutation.isPending} onClick={()=>toggle(removing)}><ActivationActionIcon active={removing.active}/>{removing.active?'Désactiver':'Activer'}</button><button className="danger" disabled={mutation.isPending} onClick={()=>mutation.mutate({method:'DELETE',id:removing.id})}><Trash2/>Supprimer</button></footer></Dialog>}
  </section>
}

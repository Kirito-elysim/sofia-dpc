import {Picto,type PictoName} from '../components/Picto'
import {ActivationActionIcon} from '../components/ActivationIcons'
import {ActiveBadge,DataTable,DeleteAction,EditAction,EmptyState,Filters,IconAction,ListPage,OrgBadges,PageHeader,RowActions,SearchField,SelectField,ToggleAction} from '../components/list/List'
import type {Column} from '../components/list/types'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query'
import { Check, LogIn, Trash2, X } from 'lucide-react'
import { api, impersonate, type Me, type VirtualClass } from '../api'
import { FieldInput, type Field } from '../components/CrudPage'
import { fromRow, toPayload } from '../components/crudValues'
import { useLocation, useNavigate } from 'react-router-dom'
import './organizations.css'
import './catalog.css'

type Row = Parameters<typeof fromRow>[1] & {id:number}
type Account = {userId:number;superAdmin:boolean;trainerId:number;staff:boolean;active:boolean}
type Org = {id:number;name:string;code?:string;color?:string|null}
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
  const reset=()=>{setOrg('');setTopic('');setStatus('');search('')}
  const name=(r:Row)=>trainer?[r.civility,r.lastName,r.firstName].filter(Boolean).join(' '):String(r.title)
  const sessions=new Map<number,number>();for(const c of classes.data??[])sessions.set(c.training.id,(sessions.get(c.training.id)??0)+1)
  const memberships=(r:Row)=>(trainer?r.organizations??[]:r.organization?[r.organization]:[]) as Org[]
  const filtered=rows.filter(r=>(!org||memberships(r).some(o=>String(o.id)===org))&&(!status||String(r.active)===status)&&(!topic||r.theme===topic)&&name(r).toLowerCase().includes(q.toLowerCase()))
  const coloured=(r:Row)=>memberships(r).map(o=>({...o,...(orgs.data?.find(item=>item.id===o.id) as unknown as Org|undefined)}))
  const text=(value:unknown)=>String(value??'')
  const columns:Column<Row>[]=[
    {key:'name',label:trainer?'Nom et prénom':'Formation',sort:name,render:r=><strong>{name(r)}</strong>},
    {key:'organization',label:'Organisme',sort:r=>memberships(r).map(o=>o.name).join(', '),render:r=><OrgBadges organizations={coloured(r)}/>},
    ...(trainer?[
      {key:'specialty',label:'Spécialité',sort:(r:Row)=>text(r.specialty),render:(r:Row)=>text(r.specialty)||'—'},
      {key:'email',label:'Email',sort:(r:Row)=>text(r.email),render:(r:Row)=><span className="ls-clip" title={text(r.email)}>{text(r.email)}</span>},
      {key:'phone',label:'Téléphone',sort:(r:Row)=>text(r.phone),render:(r:Row)=>text(r.phone)||'—'},
    ]:[
      {key:'theme',label:'Thématique',sort:(r:Row)=>text(r.theme),render:(r:Row)=><span className="cat-topic"><Picto name={topics[text(r.theme)]??'brain'}/>{text(r.theme)||'—'}</span>},
      {key:'totalDurationMin',label:'Durée',sort:(r:Row)=>Number(r.totalDurationMin??0),render:(r:Row)=>r.totalDurationMin?Number(r.totalDurationMin)/60+' h':'—'},
      {key:'sessions',label:'Sessions',sort:(r:Row)=>sessions.get(r.id)??0,render:(r:Row)=>classes.data?sessions.get(r.id)??0:'—'},
    ]),
    {key:'active',label:'Statut',sort:r=>String(r.active),render:r=><ActiveBadge active={!!r.active}/>},
  ]
  const actions=(r:Row)=>{
    const account=accounts.data?.find(x=>x.trainerId===r.id),ok=!!account&&!account.superAdmin&&account.active&&(account.staff||!!r.active)
    return <RowActions>
      <EditAction aria-label={'Modifier '+name(r)} onClick={()=>open(r)}/>
      <ToggleAction active={!!r.active} disabled={mutation.isPending} onClick={()=>toggle(r)}/>
      <DeleteAction aria-label={'Supprimer '+name(r)} onClick={()=>{mutation.reset();remove(r)}}/>
      {superAdmin&&<IconAction icon={LogIn} disabled={!ok||borrow.isPending} onClick={()=>borrow.mutate(account!.userId)} aria-label={'Se connecter en tant que '+name(r)} title={ok?'Se connecter en tant que':account?.superAdmin?'Impossible pour un super admin':'Aucun accès actif'}/>}
    </RowActions>
  }
  const groups=[['Informations générales','title','organization','theme','reference'],['Paramètres','totalDurationMin','defaultCapacity','active']]
  const error=mutation.error&&<p role="alert" className="oa-error">{mutation.error.message}</p>
  return <ListPage>
    <PageHeader icon={trainer?'users':'training'} title={title} subtitle={trainer?'Gérez les formateurs qui animent les classes virtuelles DPC.':'Gérez la liste des formations DPC proposées dans vos organismes.'} add={canWrite?{label:'Ajouter '+noun,onClick:()=>open('new')}:undefined}/>
    <Filters onReset={reset}>
      <SearchField label={'Rechercher '+noun} value={q} onChange={search}/>
      <SelectField label="Organisme" icon="building" all="Tous les organismes" value={org} onChange={setOrg} options={(orgs.data??[]).map(o=>({value:String(o.id),label:String(o.name)}))}/>
      <SelectField label="Statut" icon="done" all="Tous les statuts" value={status} onChange={setStatus} options={[{value:'true',label:'Actif'},{value:'false',label:'Inactif'}]}/>
      {!trainer&&<SelectField label="Thématique" icon="tag" all="Toutes les thématiques" value={topic} onChange={setTopic} options={[...new Set(rows.map(r=>text(r.theme)).filter(Boolean))].map(t=>({value:t,label:t}))}/>}
    </Filters>
    {notice&&<p role="status">{notice}</p>}{borrow.error&&<p role="alert">{borrow.error.message}</p>}{list.error&&<p role="alert">{list.error.message}</p>}{!editing&&!removing&&error}
    <DataTable title={trainer?'Liste des formateurs':'Liste des formations'} rows={filtered} total={rows.length} loading={list.isLoading} filterKey={[q,org,status,topic].join('|')} rowKey={r=>r.id} rowName={name} columns={columns} actions={canWrite?actions:undefined}
      empty={rows.length?<EmptyState title="Aucun résultat pour ce filtre" text="Essayez un autre terme ou réinitialisez les filtres." action={{label:'Réinitialiser les filtres',onClick:reset}}/>:<EmptyState title={trainer?'Aucun formateur':'Aucune formation'} action={canWrite?{label:'Ajouter '+noun,onClick:()=>open('new')}:undefined}/>}/>
    <div className="oa catalog">
  {!trainer&&<div className="oa-notes">{[0,1].map(i=><section key={i}><h3><Picto name={i?'help':'idea'}/>{i?'Questions ouvertes':'Points d’ergonomie'}</h3><ul>{notes[i].map(t=><li key={t}>{t}</li>)}</ul></section>)}</div>}
  {editing&&<Dialog drawer trainer={trainer} title={'Ajouter / Modifier '+noun} close={close}><form onSubmit={e=>{e.preventDefault();save()}}><div className="oa-form">{groups.map(([label,...names],i)=><section key={label}><h3>{['①','②','③'][i]}　{label}</h3><div className="cat-fields">{names.map(n=>{const f=[...fields,activeField].find(item=>item.name===n)!;return <label key={n} className={'field-'+n}>{f.label}{f.required&&' *'}{n==='comments'?<textarea maxLength={500} value={String(values[n]??'')} onChange={e=>setValues({...values,[n]:e.target.value})}/>:<FieldInput f={f} value={values[n]} onChange={v=>setValues({...values,[n]:v})} disabled={false}/>}</label>})}</div></section>)}{error}</div><footer><button type="button" onClick={close}>Annuler</button><button className="blue" disabled={mutation.isPending}><Check/>Enregistrer</button></footer></form></Dialog>}
  {removing&&<Dialog trainer={trainer} title={trainer?'Supprimer ce formateur ?':'Supprimer cette formation ?'} close={close}><p><b>{name(removing)}</b></p><p className="oa-info">Cette fiche sera retirée du catalogue. L’historique des classes et des attestations sera conservé.</p><p>Cette action est tracée dans le journal d’audit.</p>{error}<footer><button onClick={close}>Annuler</button><button disabled={mutation.isPending} onClick={()=>toggle(removing)}><ActivationActionIcon active={removing.active}/>{removing.active?'Désactiver':'Activer'}</button><button className="danger" disabled={mutation.isPending} onClick={()=>mutation.mutate({method:'DELETE',id:removing.id})}><Trash2/>Supprimer</button></footer></Dialog>}
    </div>
  </ListPage>
}

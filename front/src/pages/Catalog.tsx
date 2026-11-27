import {Picto} from '../components/Picto'
import {ActivationActionIcon} from '../components/ActivationIcons'
import {ActiveBadge,DataTable,DeleteAction,DeletedBadge,EditAction,EmptyState,Filters,IconAction,ListPage,OrgBadges,PageHeader,RowActions,SearchField,SelectField,ToggleAction} from '../components/list/List'
import {useDeleted} from '../components/list/useDeleted'
import type {Column} from '../components/list/types'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query'
import { CalendarDays, LogIn, UserRound, Trash2, X } from 'lucide-react'
import { api, impersonate, type Me, type VirtualClass } from '../api'
import type { fromRow } from '../components/crudValues'
import { useLocation, useNavigate } from 'react-router-dom'
import './organizations.css'
import './catalog.css'
import {publicationLabel, publicationOptions} from './formationPublication'
import {durationLabel} from './formationFormat'
import {Archive, BookOpen, EyeOff, FileCheck2, FilePenLine} from 'lucide-react'

type Row = Parameters<typeof fromRow>[1] & {id:number}
type Account = {userId:number;superAdmin:boolean;trainerId:number;staff:boolean;active:boolean}
type Org = {id:number;name:string;code?:string;color?:string|null}
const fundingOptions = ['ANDPC', 'FIFPL', 'Personnel']
type AndpcCode = {year:number;code:string}
function codes(row:Row):AndpcCode[]{return ((row.andpcCodes ?? []) as Partial<AndpcCode>[]).filter((c):c is AndpcCode=>!!c.code)}
function Dialog({drawer,title,close,children,trainer}:{drawer?:boolean,title:string,close:()=>void,children:ReactNode,trainer:boolean}){
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const d=ref.current!;d.showModal();return ()=>d.close()},[])
  return <dialog ref={ref} className={'oa-dialog cat-dialog '+(drawer?'drawer':'confirm')} onCancel={e=>{e.preventDefault();close()}} aria-label={title}><header><Picto name={drawer?(trainer?'trainer':'formation'):'trash'} className="oa-icon"/><h2>{title}</h2><button onClick={close} aria-label="Fermer"><X/></button></header>{children}</dialog>
}
export default function Catalog({path,title,canWrite}:{path:string,title:string,canWrite:boolean}){
  const trainer=path==='trainers', noun=trainer?'un formateur':'une formation'
  const qc=useQueryClient()
  const list=useQuery({queryKey:[path],queryFn:()=>api<Row[]>('/'+path)})
  const orgs=useQuery({queryKey:['organizations'],queryFn:()=>api<Row[]>('/organizations')})
  const classes=useQuery({queryKey:['classes'],queryFn:()=>api<(VirtualClass & {formation:{id:number}})[]>('/virtual-classes'),enabled:!trainer})
  const rows=list.data??[]
  const [org,setOrg]=useState(''),[status,setStatus]=useState(''),[funding,setFunding]=useState(''),[q,search]=useState('')
  const [removing,remove]=useState<Row|null>(null)
  const accounts=useQuery({queryKey:['trainer-accounts'],queryFn:()=>api<Account[]>('/trainer-accounts'),enabled:trainer&&canWrite})
  const me=useQuery({queryKey:['me'],queryFn:()=>api<Me>('/auth/me')})
  const superAdmin=trainer&&!!me.data?.roles.includes('ROLE_SUPER_ADMIN')
  const borrow=useMutation({mutationFn:impersonate})
  const navigate=useNavigate(),notice=(useLocation().state as {notice?:string}|null)?.notice
  const mutation=useMutation({mutationFn:({id,method,body}:{id:number,method:string,body?:object})=>api('/'+path+'/'+id,{method,body:JSON.stringify(body),headers:method==='PATCH'?{'Content-Type':'application/merge-patch+json'}:{}}),onSuccess:()=>{remove(null);void qc.invalidateQueries()}})
  function open(row:Row|'new'){navigate('/settings/'+path+'/'+(row==='new'?'new':row.id+'/edit'))}
  function close(){if(!mutation.isPending){remove(null);mutation.reset()}}
  // A formation has a single state: « active » means published. Drafts are finished in the steps, archives in the sheet.
  function toggle(r:Row){mutation.mutate({id:r.id,method:'PATCH',body:trainer?{active:!r.active}:{publicationStatus:r.publicationStatus==='published'?'unpublished':'published'}})}
  const reset=()=>{setOrg('');setFunding('');setStatus('');search('')}
  const name=(r:Row)=>trainer?[r.civility,r.lastName,r.firstName].filter(Boolean).join(' '):String(r.title)
  const sessions=new Map<number,number>();for(const c of classes.data??[])sessions.set(c.formation.id,(sessions.get(c.formation.id)??0)+1)
  const memberships=(r:Row)=>(trainer?r.organizations??[]:r.organization?[r.organization,...(r.additionalOrganizations??[])]:[]) as Org[]
  const deleted=useDeleted<Row[]>(path,status)
  const source=deleted.viewing?deleted.data??[]:rows
  const filtered=source.filter(r=>(!org||memberships(r).some(o=>String(o.id)===org))&&(!status||deleted.viewing||String(r.active)===status||(!trainer&&r.publicationStatus===status))&&(!funding||r.fundingTypes?.includes(funding))&&(trainer?name(r):[name(r),r.reference,...codes(r).map(c=>c.code)].join(' ')).toLowerCase().includes(q.toLowerCase()))
  const coloured=(r:Row)=>memberships(r).map(o=>({...o,...(orgs.data?.find(item=>item.id===o.id) as unknown as Org|undefined)}))
  const text=(value:unknown)=>String(value??'')
  const columns:Column<Row>[]=[
    {key:'name',label:trainer?'Nom et prénom':'Formation',sort:name,render:r=>trainer?<strong>{name(r)}</strong>:<div className="formation-name">
      {r.thumbnail ? <img className="formation-thumbnail" src={r.thumbnail} alt="" loading="lazy"/> : <Picto name="book"/>}
      <div><strong>{name(r)}</strong>{r.reference&&<small>Réf. : {r.reference}</small>}</div></div>},
    {key:'organization',label:'Organisme',sort:r=>memberships(r).map(o=>o.name).join(', '),render:r=><OrgBadges organizations={coloured(r)}/>},
    ...(trainer?[
      {key:'specialty',label:'Spécialité',sort:(r:Row)=>text(r.specialty),render:(r:Row)=>text(r.specialty)||'—'},
      {key:'email',label:'Email',sort:(r:Row)=>text(r.email),render:(r:Row)=><span className="ls-clip" title={text(r.email)}>{text(r.email)}</span>},
      {key:'phone',label:'Téléphone',sort:(r:Row)=>text(r.phone),render:(r:Row)=>text(r.phone)||'—'},
    ]:[
      {key:'modality',label:'Type de programme',sort:(r:Row)=>text(r.modality),render:(r:Row)=>r.modality?<span className="formation-modality">{r.modality}</span>:'—'},
      {key:'funding',label:'Financement',sort:(r:Row)=>(r.fundingTypes??[]).join(),render:(r:Row)=>r.fundingTypes?.length?<div className="formation-funds">{r.fundingTypes.map((f:string)=><span key={f} data-fund={f}>{f}</span>)}</div>:'—'},
      {key:'audience',label:'Public',sort:(r:Row)=>text(r.audience),render:(r:Row)=>r.audience?<span className="formation-audience"><UserRound/>{r.audience}</span>:'—'},
      {key:'codes',label:'Codes ANDPC',sort:(r:Row)=>codes(r)[0]?.code??'',render:(r:Row)=><span title={codes(r).map(c=>c.year+' · '+c.code).join(', ')}>{codes(r)[0]?.code??'—'}{codes(r).length>1&&' +'+(codes(r).length-1)}</span>},
      {key:'totalDurationMin',label:'Durée',sort:(r:Row)=>Number(r.totalDurationMin??0),render:(r:Row)=>durationLabel(Number(r.totalDurationMin??0))||'—'},
      {key:'sessions',label:'Sessions',sort:(r:Row)=>sessions.get(r.id)??0,render:(r:Row)=>classes.data?<span className="formation-sessions"><CalendarDays/>{sessions.get(r.id)??0}</span>:'—'},
    ]),
    {key:'active',label:'Statut',sort:r=>trainer?String(r.active):publicationLabel(r.publicationStatus),render:r=>deleted.viewing?<DeletedBadge at={r.deletedAt as string}/>:trainer?<ActiveBadge active={!!r.active}/>:<div className="formation-status"><span data-publication={r.publicationStatus}>{publicationLabel(r.publicationStatus)}</span></div>},
  ]
  const actions=(r:Row)=>{
    const account=accounts.data?.find(x=>x.trainerId===r.id),ok=!!account&&!account.superAdmin&&account.active&&(account.staff||!!r.active)
    return <RowActions>
      <EditAction label={!trainer&&r.publicationStatus==='draft'?'Reprendre':'Modifier'} aria-label={(!trainer&&r.publicationStatus==='draft'?'Reprendre ':'Modifier ')+name(r)} onClick={()=>open(r)}/>
      {(trainer||['published','unpublished'].includes(String(r.publicationStatus)))&&<ToggleAction active={!!r.active} labels={trainer?undefined:['Dépublier','Publier']} disabled={mutation.isPending} onClick={()=>toggle(r)}/>}
      <DeleteAction disabled={!trainer&&sessions.has(r.id)} title={!trainer&&sessions.has(r.id)?'Suppression impossible : cette formation possède déjà une session.':undefined} aria-label={'Supprimer '+name(r)} onClick={()=>{mutation.reset();remove(r)}}/>
      {superAdmin&&<IconAction icon={LogIn} disabled={!ok||borrow.isPending} onClick={()=>borrow.mutate(account!.userId)} aria-label={'Se connecter en tant que '+name(r)} title={ok?'Se connecter en tant que':account?.superAdmin?'Impossible pour un super admin':'Aucun accès actif'}/>}
    </RowActions>
  }
  const error=mutation.error&&<p role="alert" className="oa-error">{mutation.error.message}</p>
  return <ListPage className={trainer?'':'formation-list'}>
    <PageHeader icon={trainer?'users':'book'} title={title} subtitle={trainer?'Gérez les formateurs qui animent les classes virtuelles DPC.':'Gérez la liste des formations DPC proposées dans vos organismes.'} add={canWrite?{label:trainer?'Ajouter un formateur':'Créer une formation',onClick:()=>open('new')}:undefined}/>
    {!trainer&&<div className="formation-stats" role="group" aria-label="Synthèse des formations">
      {[
        {value:'',label:'Formations',Icon:BookOpen,count:rows.length},
        {value:'published',label:'Publiées',Icon:FileCheck2,count:rows.filter(r=>r.publicationStatus==='published').length},
        {value:'draft',label:'Brouillons',Icon:FilePenLine,count:rows.filter(r=>r.publicationStatus==='draft').length},
        {value:'unpublished',label:'Non publiées',Icon:EyeOff,count:rows.filter(r=>r.publicationStatus==='unpublished').length},
        {value:'archived',label:'Archivées',Icon:Archive,count:rows.filter(r=>r.publicationStatus==='archived').length},
       ].map(({value,label,Icon,count})=>(
        <button key={label} type="button"
          aria-pressed={status===value && (!!value || !(org || funding || q))}
          onClick={()=>value ? setStatus(value) : reset()}>
          <Icon aria-hidden="true"/><span><strong>{list.data?count:'—'}</strong><span>{label}</span></span>
        </button>
      ))}
    </div>}
    <Filters onReset={reset}>
      <SearchField label={'Rechercher '+noun} value={q} onChange={search}/>
      <SelectField label="Organisme" icon="building" all={trainer?'Tous les organismes':'Organisme'} value={org} onChange={setOrg} options={(orgs.data??[]).map(o=>({value:String(o.id),label:String(o.name)}))}/>
      {!trainer&&<SelectField label="Financement" icon="tag" all="Financement" value={funding} onChange={setFunding} options={fundingOptions.map(label=>({value:label,label}))}/>}
      <SelectField label="Statut"  icon="done" all={trainer?'Tous les statuts':'Statut'} value={status} onChange={setStatus} options={[...(trainer?[]:publicationOptions),{value:'true',label:'Actif'},{value:'false',label:'Inactif'},...deleted.options]}/>

    </Filters>
    {notice&&<p role="status">{notice}</p>}{borrow.error&&<p role="alert">{borrow.error.message}</p>}{list.error&&<p role="alert">{list.error.message}</p>}{deleted.error&&<p role="alert">{deleted.error.message}</p>}{!removing&&error}
    <DataTable title={trainer?'Liste des formateurs':'Liste des formations'} rows={filtered} total={source.length} loading={list.isLoading||deleted.loading} filterKey={[q,org,status,funding].join('|')} rowKey={r=>r.id} rowName={name} columns={columns} actions={canWrite&&!deleted.viewing?actions:undefined}
      empty={source.length||deleted.viewing?<EmptyState title="Aucun résultat pour ce filtre" text="Essayez un autre terme ou réinitialisez les filtres." action={{label:'Réinitialiser les filtres',onClick:reset}}/>:<EmptyState title={trainer?'Aucun formateur':'Aucune formation'} action={canWrite?{label:'Ajouter '+noun,onClick:()=>open('new')}:undefined}/>}/>
    <div className="oa catalog">

  {removing&&<Dialog trainer={trainer} title={trainer?'Supprimer ce formateur ?':'Supprimer cette formation ?'} close={close}><p><b>{name(removing)}</b></p><p className="oa-info">Cette fiche sera retirée du catalogue. L’historique des classes et des attestations sera conservé.</p><p>Cette action est tracée dans le journal d’audit.</p>{error}<footer><button onClick={close}>Annuler</button><button disabled={mutation.isPending} onClick={()=>toggle(removing)}><ActivationActionIcon active={removing.active}/>{removing.active?'Désactiver':'Activer'}</button><button className="danger" disabled={mutation.isPending} onClick={()=>mutation.mutate({method:'DELETE',id:removing.id})}><Trash2/>Supprimer</button></footer></Dialog>}
    </div>
  </ListPage>
}

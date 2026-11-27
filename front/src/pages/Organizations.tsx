import {ActivationActionIcon,ActivationStatusIcon} from '../components/ActivationIcons'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Pause, GraduationCap, Users, LayoutGrid, List, MapPin, Mail, Phone, Pencil, Trash2, FileText, Award, Calendar, MoreHorizontal } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import {ActiveBadge,Badge,DataTable,DeleteAction,DeletedBadge,EditAction,EmptyState,Filters,ListHeading,ListPage,OrgBadges,PageHeader,Pagination,RowActions,SearchField,SelectField,ToggleAction,ViewToggle} from '../components/list/List'
import {useDeleted} from '../components/list/useDeleted'
import { OrganizationDeleteDialog } from './OrganizationDeleteDialog'
import { establishmentNumber } from './organizationFields'
import './organizations.css'
import './organization-list.css'

type Org = {id:number; name:string; code:string; active:boolean; emailFrom:string; siret:string|null; andpcNumber:string|null; color?:string|null; deletedAt?:string|null}
type DraftRow = {id:number; name:string|null; step:number; updated_at:string}
type TableRow = {key:string;name:string;org?:Org;draft?:DraftRow}
type Summary = {id:number; total:number; learners:number; global_learners:number; address:string; zip:string; city:string; phone:string; email:string; created:string|null; has_logo:boolean}
export default function Organizations({canWrite,canCreate=canWrite}:{canWrite:boolean;canCreate?:boolean}) {
  const navigate=useNavigate()
  const qc=useQueryClient()
  const list=useQuery({queryKey:['organizations'],queryFn:()=>api<Org[]>('/organizations')})
  const summary=useQuery({queryKey:['organization-summaries'],queryFn:()=>api<Summary[]>('/organization-summaries')})
  const drafts=useQuery({queryKey:['organization-drafts'],queryFn:()=>api<DraftRow[]>('/organization-profiles/drafts'),enabled:canCreate})
  const details=new Map(summary.data?.map(s=>[Number(s.id),s]))
  const rows=list.data??[]
  const [search,searchFor]=useState(''),[status,setStatus]=useState('')
  const [page,setPage]=useState(1),[size,setSize]=useState(10),[compact,setCompact]=useState(false)
  const [menu,setMenu]=useState<number|null>(null)
  const [deleting,confirmDelete]=useState<Org|null>(null)
  const change=useMutation({mutationFn:({id,method,body}:{id?:number;method:string;body?:object})=>api('/organizations'+(id?'/'+id:''),{method,body:JSON.stringify(body),headers:method==='PATCH'?{'Content-Type':'application/merge-patch+json'}:{}}),
    onSuccess:()=>{confirmDelete(null);void qc.invalidateQueries()}})
  const close=()=>{if(!change.isPending){confirmDelete(null);change.reset()}}
  const toggle=(o:Org)=>change.mutate({id:o.id,method:'PATCH',body:{active:!o.active}})
  const deleted=useDeleted<Org[]>('organizations',status)
  const source=deleted.viewing?deleted.data??[]:rows
  const asTable=compact||deleted.viewing
  const ordered=source.filter(o=>(o.name+' '+o.code).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())&&(!status||deleted.viewing||String(o.active)===status))
  const shownDrafts=(!status||status==='draft') ? (drafts.data??[]).filter(d=> (d.name?.trim()||'Organisme sans nom').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) : []
  const last=Math.max(1,Math.ceil(ordered.length/size)),current=Math.min(page,last),shown=ordered.slice((current-1)*size,current*size)
  const linkedClasses=Number(deleting ? details.get(deleting.id)?.total : 0) || 0
  const filtered=Boolean(search.trim()||status)
  const resetFilters=()=>{searchFor('');setStatus('');setPage(1)}
  const err=change.error&&<p role="alert">{change.error.message}</p>
  const actions=(o:Org)=><>
    <Link to={`/settings/organizations/${o.id}/edit`} aria-label={`Modifier ${o.name}`}><Pencil aria-hidden="true"/>Modifier</Link>
    <button disabled={change.isPending} onClick={()=>{setMenu(null);toggle(o)}}>
      <ActivationActionIcon active={o.active}/>{o.active?'Désactiver':'Activer'}
    </button>
    <button className="od-delete" aria-label={'Supprimer '+o.name} onClick={()=>{setMenu(null);change.reset();confirmDelete(o)}}>
      <Trash2 aria-hidden="true"/>
    </button>
  </>
  // One logo rule for the cards and the table: the uploaded document, else the bundled picture of the two organizations.
  const logoOf=(o:Org)=>details.get(o.id)?.has_logo&&canWrite?`/api/organization-profiles/${o.id}/documents/logo`:({'SOFIA':'/organizations/sofia-card.png','STUDIO PHOCEA':'/organizations/phocea-card.png'} as Record<string,string>)[o.name.toUpperCase()]
  const emailOf=(o:Org)=>details.get(o.id)?.email||o.emailFrom
  const draftName=(d:DraftRow)=>d.name?.trim()||'Organisme sans nom'
  const tableRows:TableRow[]=[...ordered.map(o=>({key:'org-'+o.id,name:o.name,org:o})),...shownDrafts.map(d=>({key:'draft-'+d.id,name:draftName(d),draft:d}))]
  const loading=list.isLoading||(canWrite&&drafts.isLoading)
  const failed=list.isError||drafts.isError
  const empty=failed?null:filtered?<EmptyState title="Aucun résultat pour ce filtre" text="Essayez un autre terme ou affichez tous les organismes." action={{label:'Réinitialiser les filtres',onClick:resetFilters}}/>
    :<EmptyState title="Aucun organisme" action={canCreate?{label:'Ajouter un organisme',onClick:()=>navigate('/settings/organizations/new')}:undefined}/>
  const views=<ViewToggle value={asTable?'table':'cards'} onChange={view=>setCompact(view==='table')} options={[{key:'cards',label:'Cartes',Icon:LayoutGrid},{key:'table',label:'Liste',Icon:List}]}/>
  const stats=[
    {label:'Organismes actifs',value:list.data&&rows.filter(o=>o.active).length,Icon:Building2},
    {label:'Organisme'+(rows.filter(o=>!o.active).length>1?'s inactifs':' inactif'),value:list.data&&rows.filter(o=>!o.active).length,Icon:Pause},
    {label:'Classes rattachées',value:summary.data?.reduce((n,s)=>n+Number(s.total),0),Icon:GraduationCap},
    {label:'Apprenants au total',value:summary.data&&Number(summary.data[0]?.global_learners??0),Icon:Users},
  ]
  return <ListPage className="org-directory">
    <PageHeader icon="building" title="Organismes" subtitle="Gérez les organismes de formation (DPC) de votre plateforme." add={canCreate?{label:'Ajouter un organisme',onClick:()=>navigate('/settings/organizations/new')}:undefined}/>
    <div className="od-stats">{stats.map(({label,value,Icon})=><div key={label}><i><Icon/></i><div><strong>{value??'—'}</strong>{label}</div></div>)}</div>
    <Filters onReset={resetFilters}>
      <SearchField label="Rechercher un organisme" value={search} onChange={value=>{searchFor(value);setPage(1)}}/>
      <SelectField label="Statut" icon="done" all="Tous les statuts" value={status} onChange={value=>{setStatus(value);setPage(1)}} options={[{value:'true',label:'Actif'},{value:'false',label:'Inactif'},...(canCreate?[{value:'draft',label:'Brouillon'}]:[]),...deleted.options]}/>
    </Filters>
    {list.isError&&<p role="alert">{list.error.message}</p>}{deleted.error&&<p role="alert">{deleted.error.message}</p>}{summary.isError&&<p role="alert">{summary.error.message}</p>}{!deleting&&err}
    {drafts.isError&&<p role="alert">{drafts.error.message}</p>}
    {!asTable&&<div className="ls-card"><ListHeading title="Liste des organismes" count={list.data&&rows.length} tools={views}/></div>}
    {!asTable&&shownDrafts.length>0&&<section className="od-drafts" aria-label="Brouillons">
      {shownDrafts.map(d=><article key={d.id}>
        <FileText aria-hidden="true"/>
        <h2>{d.name?.trim()||'Organisme sans nom'}</h2>
        <span className="org-draft-status">Brouillon</span>
        <Link to={'/settings/organizations/new?draft='+d.id}><Pencil aria-hidden="true"/>Reprendre</Link>
      </article>)}
    </section>}
    {asTable ? <DataTable title="Liste des organismes" tools={views} rows={tableRows} total={deleted.viewing?source.length:rows.length+(drafts.data?.length??0)} loading={loading||deleted.loading} filterKey={search+'|'+status} rowKey={r=>r.key} rowName={r=>r.name}
      columns={[
        {key:'name',label:'Organisme',sort:r=>r.name,render:r=>{const logo=r.org&&logoOf(r.org);return <span className="od-table-name"><i className={r.org?.color??(r.org?.code.includes('PHO')?'purple':r.org?'blue':'gray')}>{logo?<img src={logo} alt=""/>:<Building2 aria-hidden="true"/>}</i><strong className="ls-clip" title={r.name}>{r.name}</strong></span>}},
        {key:'code',label:'Code',sort:r=>r.org?.code??'',render:r=>r.org?<OrgBadges organizations={[{...r.org,name:r.org.code}]}/>:'—'},
        {key:'email',label:'Email',sort:r=>r.org?emailOf(r.org):'',render:r=>r.org?<span className="ls-clip" title={emailOf(r.org)}>{emailOf(r.org)}</span>:'—'},
        {key:'city',label:'Ville',sort:r=>(r.org&&details.get(r.org.id)?.city)||'',render:r=>(r.org&&details.get(r.org.id)?.city)||'—'},
        {key:'status',label:'Statut',sort:r=>r.org?String(r.org.active):'draft',render:r=>deleted.viewing?<DeletedBadge at={r.org?.deletedAt}/>:r.org?<ActiveBadge active={r.org.active}/>:<Badge tone="orange" icon={FileText}>Brouillon</Badge>},
        {key:'classes',label:'Classes',sort:r=>Number(r.org?details.get(r.org.id)?.total??0:0),render:r=>r.org?details.get(r.org.id)?.total??'—':'—'},
        {key:'learners',label:'Apprenants',sort:r=>Number(r.org?details.get(r.org.id)?.learners??0:0),render:r=>r.org?details.get(r.org.id)?.learners??'—':'—'},
      ]}
      actions={canWrite&&!deleted.viewing?({org,draft})=><RowActions>{org?<>
        <EditAction aria-label={'Modifier '+org.name} onClick={()=>navigate(`/settings/organizations/${org.id}/edit`)}/>
        <ToggleAction active={org.active} disabled={change.isPending} onClick={()=>toggle(org)}/>
        <DeleteAction aria-label={'Supprimer '+org.name} onClick={()=>{change.reset();confirmDelete(org)}}/>
      </>:<EditAction label="Reprendre" onClick={()=>navigate('/settings/organizations/new?draft='+draft!.id)}/>}</RowActions>:undefined}
      empty={empty}/>
    : shown.length>0&&<div className="od-cards">{shown.map(o=>{
      const m=details.get(o.id),logo=logoOf(o)
      return <article key={o.id}><div className="od-main"><div className="od-logo">{logo?<img src={logo} alt={o.name}/>:<Building2/>}</div><div className="od-body"><h2>{o.name}<small className={o.active?'active':''}><ActivationStatusIcon active={o.active}/>{o.active?'Actif':'Inactif'}</small></h2><div className="od-fields">{[[Building2,'Code',o.code],[FileText,establishmentNumber.label,o.siret],[Award,'N° ANDPC',o.andpcNumber],[Calendar,'Créé le',m?.created&&new Date(m.created.replace(' ','T')).toLocaleDateString('fr-FR')]].map(([I,label,value])=>{const Icon=I as typeof Calendar;return <div key={String(label)}><Icon/><span>{String(label)}<b>{String(value||'—')}</b></span></div>})}<aside><span><GraduationCap/><b>{m?.total??'—'}</b> classes</span><span><Users/><b>{m?.learners??'—'}</b> apprenants</span></aside></div></div></div>
      {canWrite&&<div className="od-menu"><button aria-label={'Actions pour '+o.name} aria-expanded={menu===o.id} onClick={()=>setMenu(menu===o.id?null:o.id)}><MoreHorizontal/></button>{menu===o.id&&<div className="od-actions">{actions(o)}</div>}</div>}
      <footer><span><MapPin/>{[m?.address,[m?.zip,m?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')||'—'}</span><span><Mail/>{m?.email||o.emailFrom||'—'}</span><span><Phone/>{m?.phone||'—'}</span>{canWrite&&<div className="od-actions">{actions(o)}</div>}</footer></article>
    })}</div>}
    {!asTable&&(loading?<p role="status">Chargement…</p>:!ordered.length&&!shownDrafts.length&&empty&&<div className="ls-card">{empty}</div>)}
    {!asTable&&ordered.length>0&&<div className="ls-card"><Pagination shown={ordered.length} total={rows.length} page={current} pages={last} size={size} onPage={setPage} onSize={next=>{setSize(next);setPage(1)}}/></div>}
    {deleting&&<OrganizationDeleteDialog name={deleting.name} linkedClasses={linkedClasses} pending={change.isPending}
      error={change.error?.message} onClose={close} onDelete={()=>change.mutate({id:deleting.id,method:'DELETE'})}
      onDeactivate={deleting.active?()=>toggle(deleting):undefined}/>}
  </ListPage>
}

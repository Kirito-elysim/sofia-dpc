import {ActivationActionIcon,ActivationStatusIcon} from '../components/ActivationIcons'
import {useEffect,useRef,useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {Link,useNavigate,useParams} from 'react-router-dom'
import {ArrowLeft,Award,Building2,CreditCard,FileText,Info,Mail,MapPin,MoreVertical,Save,Trash2} from 'lucide-react'
import {api,toApiError} from '../api'
import {OrganizationDocuments,type StoredDocument} from "./OrganizationDocuments"
import {establishmentNumber,organizationFormGroups} from './organizationFields'
import {OrganizationDeleteDialog} from './OrganizationDeleteDialog'
import {OrganizationFieldsForm} from './OrganizationFieldsForm'
import './organization-profile.css'

type Profile={organization:Record<string,string|boolean|null>;details:Record<string,string|boolean|null>;documents:StoredDocument[]}
const path='/settings/organizations'
const tabs=['Informations générales','Coordonnées','Facturation','Communications','Documents']
const icons=[Building2,MapPin,CreditCard,Mail,FileText]
export default function OrganizationProfile(){
  const {id}=useParams()
  const profile=useQuery({queryKey:['organization-profile',id],queryFn:()=>api<Profile>('/organization-profiles/'+id)})
  if(!profile.data)return <p role="status">{profile.error?.message??'Chargement de la fiche…'}</p>
  return <Editor key={id} id={id!} profile={profile.data}/>
}

function Editor({id,profile}:{id:string;profile:Profile}){
  const navigate=useNavigate(),client=useQueryClient()
  const [tab,setTab]=useState(0),[files,setFiles]=useState<Record<string,File>>({}),[menu,setMenu]=useState(false)
  const [removed,setRemoved]=useState<string[]>([])
  const [confirmDelete,setConfirmDelete]=useState(false)
  const summaries=useQuery({queryKey:['organization-summaries'],
    queryFn:()=>api<{id:number;total:number}[]>('/organization-summaries'),enabled:confirmDelete})
  const linkedClasses=summaries.data?.find(row=>String(row.id)===id)?.total
  const logo=useRef<HTMLImageElement>(null)
  const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(Object.entries({...profile.details,...profile.organization,active:profile.organization.active?'1':'0',color:profile.organization.color||'blue'}).map(([k,v])=>[k,typeof v==='boolean'?String(+v):String(v??'')])))
  const update=(key:string,value:string)=>setValues(v=>({...v,[key]:value}))
  const endpoint='/organization-profiles/'+id
  const initialLogo=profile.documents.some(d=>d.kind==='logo')?'/api'+endpoint+'/documents/logo':({'SOFIA':'/organizations/sofia-card.png','STUDIO PHOCEA':'/organizations/phocea-card.png'} as Record<string,string>)[String(profile.organization.name).toUpperCase()]
  useEffect(()=>{if(!files.logo||!logo.current)return;const url=URL.createObjectURL(files.logo);logo.current.src=url;return ()=>URL.revokeObjectURL(url)},[files.logo])
  const action=useMutation({mutationFn:async(operation:'save'|'delete'|'deactivate')=>{
    if(operation==='deactivate'){
      await api('/organizations/'+id,{method:'PATCH',headers:{'Content-Type':'application/merge-patch+json'},body:JSON.stringify({active:false})})
      return
    }
    if(operation==='delete'){await api('/organizations/'+id,{method:'DELETE'});return}
    const body=new FormData()
    Object.entries(values).forEach(([key,v])=>body.set(key,v))
    removed.forEach(key=>body.append('removedDocuments[]',key))
    Object.entries(files).forEach(([key,v])=>body.set(key,v))
    const r=await fetch('/api'+endpoint,{method:'POST',body})
    if(!r.ok)throw toApiError(r.status,await r.json().catch(()=>null))
  },onSuccess:async()=>{await Promise.all([['organizations'],['organization-summaries'],['organization-profile',id]].map(queryKey=>client.invalidateQueries({queryKey,refetchType:'none'})));navigate(path)}})
  const ActiveIcon=icons[tab],active=values.active==='1'
  return <section className="oe"><nav><Link to={path}><ArrowLeft aria-hidden="true"/>Organismes</Link></nav>
    <header><i><Building2/></i><div><h1>Modifier un organisme</h1><p>Mettez à jour les informations de l’organisme de formation.</p></div>
    <div className="oe-menu"><button aria-label="Autres actions" aria-expanded={menu} onClick={()=>setMenu(!menu)}><MoreVertical/></button>{menu&&<button onClick={()=>{update('active',active?'0':'1');setMenu(false)}}><ActivationActionIcon active={active}/>{active?'Désactiver':'Activer'} l’organisme</button>}</div>
    <button className="oe-danger" onClick={()=>{action.reset();setConfirmDelete(true)}}><Trash2/>Supprimer l’organisme</button></header>
    <div className="oe-tabs" aria-label="Rubriques de l’organisme">{tabs.map((t,i)=>{const Icon=icons[i];return <button key={t} aria-pressed={i===tab} onClick={()=>setTab(i)}><Icon/>{t}</button>})}</div>
    <form noValidate onSubmit={e=>{e.preventDefault();const invalid=e.currentTarget.querySelector<HTMLInputElement>('input:invalid,select:invalid,textarea:invalid');if(invalid){setTab(Number(invalid.closest('section[data-tab]')?.getAttribute('data-tab')));requestAnimationFrame(()=>invalid.reportValidity());return}action.mutate('save')}}>
    <div className="oe-columns" style={tab===4?{display:'none'}:undefined}><div className="oe-panel"><h2><i><ActiveIcon/></i>{tab===0?'Identification':tabs[tab]}</h2>
    {organizationFormGroups.map((group,i)=><section key={i} hidden={tab!==i} data-tab={i}><div className="ow-fields"><OrganizationFieldsForm group={group} formValues={values} update={update} editing/></div></section>)}
    </div>
    <aside className="oe-preview" data-color={values.color}><h2><i><Building2/></i>Aperçu de l’organisme</h2>
    {((initialLogo&&!removed.includes('logo'))||files.logo)&&<div className="oe-logo"><img ref={logo} src={initialLogo} alt=""/></div>}
    <div className="oe-preview-name"><strong>{values.name||'Organisme'}</strong><span className="oe-status" data-active={active}><ActivationStatusIcon active={active}/>{active?'Actif':'Inactif'}</span></div>
    <dl>{[[Building2,'Code',values.code],[Award,'N° ANDPC',values.andpcNumber],[FileText,establishmentNumber.label,values.siret]].map(([I,label,v])=>{const Icon=I as typeof Building2;return <div key={String(label)}><dt><Icon/>{String(label)}</dt><dd>{String(v||'—')}</dd></div>})}</dl></aside></div>
    {tab===4&&<OrganizationDocuments stored={profile.documents} files={files} removed={removed} root={'/api'+endpoint+'/documents'} onChange={(key,file)=>{
      setFiles(prev=>{const next={...prev};if(file)next[key]=file;else delete next[key];return next})
      setRemoved(prev=>file?prev.filter(k=>k!==key):[...new Set([...prev,key])])
    }}/>}
    {!confirmDelete&&action.error&&<p role="alert">{action.error.message}</p>}
    <footer><span><Info/>{tab===4?'5 Mo maximum par fichier.':'Les champs marqués d’un * sont obligatoires.'}</span><Link to={path}>Annuler</Link><button disabled={action.isPending}><Save/>{action.isPending?'Enregistrement…':'Enregistrer les modifications'}</button></footer></form>
    {confirmDelete&&<OrganizationDeleteDialog name={String(profile.organization.name)} linkedClasses={linkedClasses===undefined?undefined:Number(linkedClasses)} pending={action.isPending}
      error={action.error?.message} onClose={()=>{action.reset();setConfirmDelete(false)}} onDelete={()=>action.mutate('delete')}
      onDeactivate={profile.organization.active?()=>action.mutate('deactivate'):undefined}/>}
  </section>
}

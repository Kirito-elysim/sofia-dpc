import {useEffect,useRef,useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {Link,useNavigate,useParams} from 'react-router-dom'
import {Award,Building2,ChevronRight,Circle, CreditCard,FileText,Info,Mail,MapPin,MoreVertical,Save,Trash2} from 'lucide-react'
import {api,toApiError} from '../api'
import {OrganizationDocuments,type StoredDocument} from "./OrganizationDocuments"
import {establishmentNumber,fields,options,organizationColors,preferences,types} from './organizationFields'
import './organization-profile.css'

type Profile={organization:Record<string,string|boolean|null>;details:Record<string,string|boolean|null>;documents:StoredDocument[]}
const path='/settings/organizations'
const tabs=['Informations générales','Coordonnées','Facturation','Communications','Documents']
const icons=[Building2,MapPin,CreditCard,Mail,FileText]
const groups=[
  [['name','Nom de l’organisme'],['legalForm','Forme juridique'],['code','Code'],['andpcNumber','N° ANDPC'],['numberAPE','Code APE'],['siret',establishmentNumber.label],['numberFormationDPC','N° de déclaration d’activité'],['active','Statut'],['color','Couleur d’identification']],
  [...fields[1],['responsibleQuality','Responsable qualité']],
  [...fields[2],['tva','Taux de TVA (%)']],
  [...fields[3],['footer','Pied de page']],
]
const choices:Record<string,string[][]>={active:[['1','Actif'],['0','Inactif']],color:organizationColors}
const limits:Record<string,number>={name:100,code:20,andpcNumber:30,numberAPE:15,emailFrom:180,smsSender:11,footer:1000}

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
  const confirm=useRef<HTMLDialogElement>(null),logo=useRef<HTMLImageElement>(null)
  const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(Object.entries({...profile.details,...profile.organization,active:profile.organization.active?'1':'0',color:profile.organization.color||'blue'}).map(([k,v])=>[k,typeof v==='boolean'?String(+v):String(v??'')])))
  const update=(key:string,value:string)=>setValues(v=>({...v,[key]:value}))
  const endpoint='/organization-profiles/'+id
  const initialLogo=profile.documents.some(d=>d.kind==='logo')?'/api'+endpoint+'/documents/logo':({'SOFIA':'/organizations/sofia-card.png','STUDIO PHOCEA':'/organizations/phocea-card.png'} as Record<string,string>)[String(profile.organization.name).toUpperCase()]
  useEffect(()=>{if(!files.logo||!logo.current)return;const url=URL.createObjectURL(files.logo);logo.current.src=url;return ()=>URL.revokeObjectURL(url)},[files.logo])
  const action=useMutation({mutationFn:async(remove:boolean)=>{
    if(remove){await api('/organizations/'+id,{method:'DELETE'});return}
    const body=new FormData()
    Object.entries(values).forEach(([key,v])=>body.set(key,v))
    removed.forEach(key=>body.append('removedDocuments[]',key))
    Object.entries(files).forEach(([key,v])=>body.set(key,v))
    const r=await fetch('/api'+endpoint,{method:'POST',body})
    if(!r.ok)throw toApiError(r.status,await r.json().catch(()=>null))
  },onSuccess:async()=>{await Promise.all([['organizations'],['organization-summaries'],['organization-profile',id]].map(queryKey=>client.invalidateQueries({queryKey,refetchType:'none'})));navigate(path)}})
  const ActiveIcon=icons[tab],active=values.active==='1'
  function field([key,label]:string[]){
    const required=['name','code','emailFrom','active','andpcNumber'].includes(key)
    const props={name:key,value:values[key]??'',required,onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>update(key,key==='siret'?e.target.value.replace(/\s/g,''):e.target.value)}
    const list=choices[key]??options[key]?.map(v=>[v,v])
    return <label key={key}><span>{label}{required&&<em> *</em>}</span>{list?<select {...props}>{!choices[key]&&<option value="">Sélectionner…</option>}{values[key]&&!list.some(([v])=>v===values[key])&&<option>{values[key]}</option>}{list.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>:key==='footer'?<textarea {...props} maxLength={1000}/>:<input {...props} readOnly={key==='code'} maxLength={limits[key]} inputMode={key==='siret'?establishmentNumber.inputMode:undefined} type={types[key]??(key==='tva'?'number':'text')} pattern={key==='siret'?establishmentNumber.pattern:key==='smsSender'?'[A-Za-z0-9]{1,11}':undefined} {...(key==='tva'?{min:0,max:100,step:0.01}:{})}/>}</label>
  }
  return <section className="oe"><nav><Link to={path}>Organismes</Link><ChevronRight/> Modifier l’organisme</nav>
    <header><i><Building2/></i><div><h1>Modifier un organisme</h1><p>Mettez à jour les informations de l’organisme de formation.</p></div><b className={'oe-status '+(active?'on':'')}>●　{active?'Actif':'Inactif'}</b>
    <div className="oe-menu"><button aria-label="Autres actions" aria-expanded={menu} onClick={()=>setMenu(!menu)}><MoreVertical/></button>{menu&&<button onClick={()=>{update('active',active?'0':'1');setMenu(false)}}>{active?'Désactiver':'Activer'} l’organisme</button>}</div>
    <button className="oe-danger" onClick={()=>{action.reset();confirm.current?.showModal()}}><Trash2/>Supprimer l’organisme</button></header>
    <div className="oe-tabs" aria-label="Rubriques de l’organisme">{tabs.map((t,i)=>{const Icon=icons[i];return <button key={t} aria-pressed={i===tab} onClick={()=>setTab(i)}><Icon/>{t}</button>})}</div>
    <form noValidate onSubmit={e=>{e.preventDefault();const invalid=e.currentTarget.querySelector<HTMLInputElement>('input:invalid,select:invalid,textarea:invalid');if(invalid){setTab(Number(invalid.closest('section[data-tab]')?.getAttribute('data-tab')));requestAnimationFrame(()=>invalid.reportValidity());return}action.mutate(false)}}>
    <div className="oe-columns" style={tab===4?{display:'none'}:undefined}><div className="oe-panel"><h2><i><ActiveIcon/></i>{tab===0?'Identification':tabs[tab]}</h2>
    {groups.map((group,i)=><section key={i} hidden={tab!==i} data-tab={i}><div className="oe-grid">{group.map(field)}
    {i===2&&<label><span><input type="checkbox" checked={values.hasTva==='1'} onChange={e=>update('hasTva',e.target.checked?'1':'0')}/> Assujetti à la TVA</span></label>}
    {i===3&&preferences.map(([key,label])=><label key={key}><span><input type="checkbox" checked={values[key]==='1'} onChange={e=>update(key,e.target.checked?'1':'0')}/> {label}</span></label>)}</div>
    {i===0&&<details><summary>Informations complémentaires</summary><div className="oe-grid">{[['acronym','Sigle'],['numberAPE','Code APE / NAF']].map(field)}</div></details>}</section>)}
    </div>
    <aside><h2><i><Building2/></i>Aperçu de l’organisme</h2><div className="oe-logo">{(initialLogo&&!removed.includes('logo'))||files.logo?<img ref={logo} src={initialLogo} alt={values.name}/>:<strong>{values.name}</strong>}</div>
    <dl>{[[Building2,'Code',values.code],[Award,'N° ANDPC',values.andpcNumber],[FileText,establishmentNumber.label,values.siret],[Circle,'Statut',active?'Actif':'Inactif']].map(([I,label,v])=>{const Icon=I as typeof Building2;return <div key={String(label)}><dt><Icon/>{String(label)}</dt><dd>{String(v||'—')}</dd></div>})}</dl></aside></div>
    {tab===4&&<OrganizationDocuments stored={profile.documents} files={files} removed={removed} root={'/api'+endpoint+'/documents'} onChange={(key,file)=>{
      setFiles(prev=>{const next={...prev};if(file)next[key]=file;else delete next[key];return next})
      setRemoved(prev=>file?prev.filter(k=>k!==key):[...new Set([...prev,key])])
    }}/>}
    {action.error&&<p role="alert">{action.error.message}</p>}
    <footer><span><Info/>{tab===4?'5 Mo maximum par fichier.':'Les champs marqués d’un * sont obligatoires.'}</span><Link to={path}>Annuler</Link><button disabled={action.isPending}><Save/>{action.isPending?'Enregistrement…':'Enregistrer les modifications'}</button></footer></form>
    <dialog ref={confirm}><h2>Supprimer {profile.organization.name} ?</h2><p>L’organisme sera retiré de la liste et conservé dans l’historique.</p>{action.error&&<p role="alert">{action.error.message}</p>}<button disabled={action.isPending} onClick={()=>confirm.current?.close()}>Annuler</button> <button className="oe-danger" disabled={action.isPending} onClick={()=>action.mutate(true)}>Supprimer</button></dialog></section>
}

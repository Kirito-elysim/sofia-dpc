import {useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {useNavigate,useParams} from 'react-router-dom'
import {ArrowLeft,ArrowRight,CalendarCheck,Eye,FileText,GraduationCap,ImagePlus,Save,Upload} from 'lucide-react'
import {api} from '../api'
import {formationThumbnail} from './formationThumbnail'
import {TargetAudienceSelect} from './TargetAudienceSelect'
import {OrganizationPicker} from './FormParts'
import './formation-wizard.css'

const catalog='/settings/formations'
const steps=['Informations','Programme','Financements','Validation']
const fundingOptions=['ANDPC','FIFPL','Personnel']
type Org={id:number;name:string}
type Code={year:number;code:string}
type RecordData={
  id:number;organization:Org;additionalOrganizations?:Org[];targetAudience?:{id:number};customReference?:string;title:string;modality:string;orientation:string|null;description:string
  objectives:string;totalDurationMin:number
  thumbnail:string|null;fundingTypes:string[];andpcCodes:Code[]
}
export default function FormationWizard(){
  const {id}=useParams()
  const orgs=useQuery({queryKey:['organizations'],queryFn:()=>api<Org[]>('/organizations')})
  const item=useQuery({queryKey:['formation',id],queryFn:()=>api<RecordData>('/formations/'+id),enabled:!!id})
  if(orgs.error||item.error)return <p role="alert">{(orgs.error??item.error)?.message}</p>
  if(!orgs.data||(id&&!item.data))return <p role="status">Chargement de la formation…</p>
  return <Editor key={id??'new'} orgs={orgs.data} original={id?item.data:undefined}/>
}
function Editor({orgs,original:t}:{orgs:Org[];original?:RecordData}){
  const navigate=useNavigate(),cache=useQueryClient()
  const [step,go]=useState(0),[error,setError]=useState(''),[uploading,busy]=useState(false)
  const [data,set]=useState({
    title:t?.title??'',organizations:t?[t.organization,...(t.additionalOrganizations??[])].map(o=>String(o.id)):orgs.length===1?[String(orgs[0].id)]:[],
    modality:t?.modality??'Classe virtuelle',description:t?.description??'',orientation:t?.orientation??'',
    targetAudience:String(t?.targetAudience?.id??''),customReference:t?.customReference??'',
    hours:String(Math.floor((t?.totalDurationMin??0)/60)||''),minutes:String((t?.totalDurationMin??0)%60||''),
    objectives:t?.objectives??'',
    fundingTypes:t?.fundingTypes??[],andpcCodes:t?.andpcCodes??[],thumbnail:t?.thumbnail??null,
  })
  function update<K extends keyof typeof data>(key:K,value:typeof data[K]){set(old=>({...old,[key]:value}));setError('')}
  const duration=Number(data.hours)*60+Number(data.minutes)
  const save=useMutation({mutationFn:async(publish:boolean)=>{
    const {hours,minutes,organizations,targetAudience,customReference,...fields}=data
    const payload={...fields,title:data.title.trim(),organization:'/api/organizations/'+organizations[0],
      additionalOrganizations:organizations.slice(1).map(id=>'/api/organizations/'+id),
      targetAudience:targetAudience?'/api/target-audiences/'+targetAudience:null,customReference:customReference.trim()||null,
      totalDurationMin:(Number(hours)*60+Number(minutes))||null,
      andpcCodes:data.fundingTypes.includes('ANDPC')?data.andpcCodes.filter(c=>c.code.trim()):[],
      publicationStatus:publish?'published':'draft'}
    return api('/formations'+(t?'/'+t.id:''),{method:t?'PATCH':'POST',body:JSON.stringify(payload),
      headers:t?{'Content-Type':'application/merge-patch+json'}:{}})
  },onSuccess:(_,publish)=>{void cache.invalidateQueries({queryKey:['formations']});void cache.invalidateQueries({queryKey:['formation']});navigate(catalog,{state:{notice:publish?'Formation publiée.':'Brouillon enregistré.'}})}})
  function validate(draft:boolean){
    if(!data.title.trim()||!data.organizations.length){go(0);setError('Renseignez le titre et choisissez un organisme.');return false}
    if(!Number.isInteger(duration)||Number(data.hours)<0||Number(data.minutes)<0||Number(data.minutes)>59){go(0);setError('Vérifiez la durée de la formation.');return false}
    if(!draft&&(!data.targetAudience||duration<=0)){go(0);setError('Complétez le public cible et la durée.');return false}
    if(!draft&&step>=1&&!data.description.trim()){go(1);setError('Renseignez la description de la formation.');return false}
    if(data.fundingTypes.includes('ANDPC')&&data.andpcCodes.some(c=>c.code.trim()&&(!Number.isInteger(c.year)||c.year<1000||c.year>9999))){go(2);setError('Indiquez une année à quatre chiffres pour chaque code ANDPC.');return false}
    setError('');return true
  }
  function next(){if(validate(false))go(Math.min(step+1,steps.length-1))}
  const input=(key:'orientation'|'title'|'customReference'|'hours'|'minutes',label:string,numeric=false)=><label>{label}<input type={numeric?'number':'text'} min={numeric?0:undefined} max={key==='minutes'?59:undefined} maxLength={key==='title'||key==='orientation'||key==='customReference'?255:100} value={data[key]} onChange={e=>update(key,e.target.value)}/></label>
  const area=(key:'description'|'objectives',label:string)=><label>{label}<textarea rows={key==='description'?3:7} maxLength={5000} value={data[key]} onChange={e=>update(key,e.target.value)}/></label>
  const sections=[
    {label:'Informations générales',detail:[data.title,data.modality,data.customReference,orgs.filter(o=>data.organizations.includes(String(o.id))).map(o=>o.name).join(', '),duration+' min'].filter(Boolean).join(' · ')},
    {label:'Programme',detail:[data.orientation,data.description,data.objectives].filter(Boolean).join(' — ')},
    {label:'Financements',detail:[...data.fundingTypes,...(data.fundingTypes.includes('ANDPC')?data.andpcCodes.map(c=>c.year+' · '+c.code):[])].join(', ')||'Aucun financement sélectionné'},
  ]
  const checks=[
    {label:'Titre',section:0,done:!!data.title.trim()},
    {label:'Organisme',section:0,done:data.organizations.length>0},{label:'Public cible',section:0,done:!!data.targetAudience},
    {label:'Durée',section:0,done:duration>0},{label:'Visuel',section:0,done:!!data.thumbnail},
    {label:'Orientation',section:1,done:!!data.orientation.trim()},{label:'Description',section:1,done:!!data.description.trim()},
    {label:'Objectifs pédagogiques',section:1,done:!!data.objectives.trim()},{label:'Financements',section:2,done:data.fundingTypes.length>0},
  ]
  const completed=checks.filter(c=>c.done)
  const remaining=checks.filter(c=>!c.done)
  const percent=Math.round(100*completed.length/checks.length)
  return <main className="tw">
    <header className="tw-header"><GraduationCap/><div><h1>{t?'Reprendre le brouillon':'Créer une formation'}</h1><p>Renseignez les informations de votre formation.</p></div>
      <ol>{steps.map((label,i)=><li key={label} aria-current={i===step?'step':undefined}><button disabled={i>step||save.isPending} onClick={()=>go(i)}>{i+1}</button>{label}</li>)}</ol>
    </header>
    <div className="tw-layout"><div>
    <section className="tw-card"><h2><FileText/>{['Informations générales','Programme pédagogique','Financements','Résumé de la formation'][step]}</h2>
    {step===0&&<div className="tw-fields">
      <div className="wide">{input('title','Titre de la formation *')}<small>{data.title.length} / 255</small></div>
      {input('customReference','Slug ou référence')}<label>Type de programme<select value={data.modality} onChange={e=>update('modality',e.target.value)}>{['Classe virtuelle','À distance','Présentiel','Mixte'].map(v=><option key={v}>{v}</option>)}</select></label>
      <TargetAudienceSelect value={data.targetAudience} onChange={value=>update('targetAudience',value)}/>
      <div><b>Durée estimée *</b><div className="tw-duration">{input('hours','Heures',true)}{input('minutes','Minutes',true)}</div></div>
      <div><OrganizationPicker legend="Organismes *" hint={data.organizations.length>1?'Organisme porteur : '+(orgs.find(o=>String(o.id)===data.organizations[0])?.name??''):'Recherchez et sélectionnez un ou plusieurs organismes.'} value={data.organizations} onChange={value=>update('organizations',value)}/></div>
    </div>}
    {step===1&&<div className="tw-fields">
      <div className="wide">{input('orientation','Orientation')}</div>
      <div className="wide">{area('description','Description *')}</div>
      <div className="wide">{area('objectives','Objectifs pédagogiques')}</div>
    </div>}
    {step===2&&<><div className="tw-checks">{fundingOptions.map(v=><label key={v}><input type="checkbox" checked={data.fundingTypes.includes(v)} onChange={e=>update('fundingTypes',e.target.checked?[...data.fundingTypes,v]:data.fundingTypes.filter(f=>f!==v))}/>{v}</label>)}</div>
      {data.fundingTypes.includes('ANDPC')&&<><h3>Codes ANDPC</h3>{data.andpcCodes.map((c,i)=><div className="tw-code" key={i}><label>Année<input type="number" value={c.year||''} onChange={e=>update('andpcCodes',data.andpcCodes.map((v,j)=>i===j?{...v,year:Number(e.target.value)}:v))}/></label><label>Code<input value={c.code} maxLength={100} onChange={e=>update('andpcCodes',data.andpcCodes.map((v,j)=>i===j?{...v,code:e.target.value}:v))}/></label><button onClick={()=>update('andpcCodes',data.andpcCodes.filter((_,j)=>i!==j))}>Retirer</button></div>)}<button onClick={()=>update('andpcCodes',[...data.andpcCodes,{year:new Date().getFullYear(),code:''}])}>Ajouter un code</button></>}
    </>}
    {step===3&&<div className="tw-summary">
      {sections.map(({label,detail},index)=><article key={label}>
        <div><strong>{label}</strong><p>{detail}</p></div>
        <span>{checks.some(c=>c.section===index&&!c.done)?'À compléter':'Complet'}</span>
        <button aria-label={'Modifier '+label} onClick={()=>go(index)}>Modifier</button>
      </article>)}
      <article><div><strong>Publication</strong><p>La publication rend la formation disponible dans le catalogue.</p></div></article>
    </div>}
    </section>
    {step===0&&<section className="tw-card"><h2><ImagePlus/>Visuel de la formation</h2><label className="tw-upload"><Upload/>{uploading?'Chargement…':data.thumbnail?'Remplacer l’image':'Importer une image'}<span>JPEG, PNG ou WebP · 10 Mo maximum</span><input type="file" disabled={uploading||save.isPending} accept="image/jpeg,image/png,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;busy(true);try{update('thumbnail',await formationThumbnail(file))}catch(err){setError((err as Error).message)}finally{busy(false)}}}/></label></section>}
    </div><aside>{step!==3&&<section className="tw-card"><h2><Eye/>Aperçu de la formation</h2><div className="tw-picture">{data.thumbnail?<img src={data.thumbnail} alt="Visuel de la formation"/>:<ImagePlus/>}</div><h3>{data.title||'Titre de la formation'}</h3><div className="tw-tags"><span>{data.modality}</span></div><p>{data.description||'La description de votre formation apparaîtra ici.'}</p></section>}
    {step>=2&&<section className="tw-card"><h2><CalendarCheck/>Progression de configuration</h2>
      <strong>{percent} %</strong><progress aria-label="Progression de configuration" value={completed.length} max={checks.length}/>
      <p>{completed.length} éléments renseignés sur {checks.length}</p></section>}
    {step===3&&<section className="tw-card tw-review-checks">{[{label:'Terminé',items:completed},{label:'À compléter',items:remaining}].map(({label,items})=><div key={label}>
      <h3>{label} ({items.length})</h3><ul>{items.map(c=><li key={c.label}>{c.label}</li>)}</ul></div>)}</section>}
    {step<3&&<section className="tw-card"><h2><CalendarCheck/>Étapes suivantes</h2>{steps.slice(step+1).map((v,i)=><p className="tw-upcoming" key={v}><b>{step+i+2}</b>{v}</p>)}</section>}</aside></div>
    <footer>{(error||save.error)&&<p role="alert">{error||save.error?.message}</p>}<button disabled={save.isPending||uploading} onClick={()=>validate(true)&&save.mutate(false)}><Save/>Enregistrer le brouillon</button><button disabled={save.isPending} onClick={()=>step?go(step-1):navigate(catalog)}><ArrowLeft/>{step?'Précédent':'Annuler'}</button><button className="primary" disabled={save.isPending||uploading} onClick={()=>step===3?validate(false)&&save.mutate(true):next()}>{step===3?'Publier la formation':'Suivant'}<ArrowRight/></button></footer>
  </main>
}

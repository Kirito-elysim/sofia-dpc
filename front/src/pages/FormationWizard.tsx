import {useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {useNavigate,useParams} from 'react-router-dom'
import {ArrowLeft,ArrowRight,CalendarCheck,Clock,Euro,Eye,FileText,GraduationCap,ImagePlus,Save,Tag,Upload,Users} from 'lucide-react'
import {api} from '../api'
import {formationThumbnail} from './formationThumbnail'
import {TargetAudienceSelect} from './TargetAudienceSelect'
import {useTargetAudiences} from './useTargetAudiences'
import {durationLabel,priceLabel,referenceLabel} from './formationFormat'
import {OrganizationPicker} from './FormParts'
import {FundingRows} from './FundingRows'
import {useOpenFunding} from './useOpenFunding'
import {ReviewProgress,ReviewSummary} from './FormationReview'
import {compact,followPrice,fundings,isFilled,withPrice,type FundingKey,type FundingRow} from './fundings'
import './formation-wizard.css'

const catalog='/settings/formations'
const steps=['Informations','Programme','Financements','Validation']
const fieldHelp={
  title:'Titre affiché dans le catalogue.',
  acronym:'Court nom de la formation, ex. ETP. Laissé vide, le titre est utilisé.',
  orientation:'Indiquez l’orientation DPC ou le thème prioritaire.',
  description:'Présentez le contenu et l’intérêt de la formation.',
  objectives:'Précisez ce que les participants sauront faire à l’issue de la formation.',
  hours:'Heures entières.',
  minutes:'Minutes restantes, de 0 à 59.',
}
type Org={id:number;name:string;code?:string;color?:string|null;andpcNumber?:string|null}
type RecordData={
  id:number;organization:Org;additionalOrganizations?:Org[];targetAudience?:{id:number};acronym?:string|null;title:string;modality:string;orientation:string|null;description:string
  objectives:string;totalDurationMin:number;price?:string|null
  thumbnail:string|null;fundingTypes:string[];andpcCodes:FundingRow[];fifplCodes?:FundingRow[];personalPrices?:FundingRow[]
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
  const [publish,setPublish]=useState(true)
  const [data,set]=useState({
    title:t?.title??'',organizations:t?[t.organization,...(t.additionalOrganizations??[])].map(o=>String(o.id)):orgs.length===1?[String(orgs[0].id)]:[],
    modality:t?.modality??'Classe virtuelle',description:t?.description??'',orientation:t?.orientation??'',
    targetAudience:String(t?.targetAudience?.id??''),acronym:t?.acronym??'',
    hours:String(Math.floor((t?.totalDurationMin??0)/60)||''),minutes:String((t?.totalDurationMin??0)%60||''),
    objectives:t?.objectives??'',price:t?.price??'',
    fundingTypes:t?.fundingTypes??[],andpcCodes:followPrice(t?.andpcCodes,t?.price),fifplCodes:followPrice(t?.fifplCodes,t?.price),personalPrices:followPrice(t?.personalPrices,t?.price),thumbnail:t?.thumbnail??null,
  })
  function update<K extends keyof typeof data>(key:K,value:typeof data[K]){set(old=>({...old,[key]:value}));setError('')}
  const duration=Number(data.hours)*60+Number(data.minutes)
  const audiences=useTargetAudiences()
  const audience=audiences.data?.find(a=>String(a.id)===data.targetAudience)
  const audienceLabel=audience?[audience.name,audience.acronym&&'('+audience.acronym+')'].filter(Boolean).join(' '):''
  const reference=referenceLabel(data.acronym,data.title,audience)
  const selectedOrgs=data.organizations.flatMap(id=>orgs.filter(o=>String(o.id)===id))
  // Rows entered before they were tied to an organisation belong to the leading one.
  const ownerOf=(row:FundingRow)=>row.organization??Number(data.organizations[0])
  // What is saved: the filled lines of the selected fundings, at least the priced one of each organisation.
  const sent=(key:FundingKey):FundingRow[]=>!data.fundingTypes.includes(fundings.find(f=>f.key===key)!.type)?[]:selectedOrgs.flatMap(o=>{
    const own=data[key].filter(row=>ownerOf(row)===o.id)
    return (own.length?own:[{year:new Date().getFullYear()}]).map(row=>withPrice({...row,organization:o.id},data.price)).filter(isFilled).map(compact)
  })
  // ANDPC and FIFPL need a code for every organisation, on every line.
  const missing=fundings.filter(f=>f.columns.some(c=>c.key==='code')&&data.fundingTypes.includes(f.type)).flatMap(f=>{
    const names=selectedOrgs.filter(o=>{const rows=sent(f.key).filter(r=>r.organization===o.id);return !rows.length||rows.some(r=>!r.code?.trim())}).map(o=>o.name)
    return names.length?[{type:f.type,text:(f.type==='ANDPC'?'le numéro d’action DPC':'le code FIFPL')+' pour : '+names.join(', ')}]:[]
  })
  const panels=useOpenFunding(fundings.map(f=>f.type).filter(type=>data.fundingTypes.includes(type)))
  const allRows=()=>fundings.flatMap(f=>sent(f.key).map(row=>({funding:f,row})))
  const save=useMutation({mutationFn:async(status:'draft'|'unpublished'|'published')=>{
    const {hours,minutes,organizations,targetAudience,acronym,price,...fields}=data
    const payload={...fields,title:data.title.trim(),organization:'/api/organizations/'+organizations[0],
      additionalOrganizations:organizations.slice(1).map(id=>'/api/organizations/'+id),
      targetAudience:targetAudience?'/api/target-audiences/'+targetAudience:null,acronym:acronym.trim()||null,
      totalDurationMin:(Number(hours)*60+Number(minutes))||null,price:price||null,
      andpcCodes:sent('andpcCodes'),fifplCodes:sent('fifplCodes'),personalPrices:sent('personalPrices'),
      publicationStatus:status,...(status!=='draft'&&{active:status==='published'})}
    return api('/formations'+(t?'/'+t.id:''),{method:t?'PATCH':'POST',body:JSON.stringify(payload),
      headers:t?{'Content-Type':'application/merge-patch+json'}:{}})
  },onSuccess:(_,status)=>{void cache.invalidateQueries({queryKey:['formations']});void cache.invalidateQueries({queryKey:['formation']});navigate(catalog,{state:{notice:{published:'Formation publiée.',unpublished:'Formation créée, non publiée.',draft:'Brouillon enregistré.'}[status]}})}})
  function validate(draft:boolean){
    if(!data.title.trim()||!data.organizations.length){go(0);setError('Renseignez le titre et choisissez un organisme.');return false}
    if(!Number.isInteger(duration)||Number(data.hours)<0||Number(data.minutes)<0||Number(data.minutes)>59){go(0);setError('Vérifiez la durée de la formation.');return false}
    if(data.price&&!/^\d{1,8}(\.\d{1,2})?$/.test(data.price)){go(0);setError('Indiquez un prix positif, avec deux décimales au plus.');return false}
    if(!draft&&(!data.targetAudience||duration<=0)){go(0);setError('Complétez le public cible et la durée.');return false}
    if(!draft&&step>=1&&!data.description.trim()){go(1);setError('Renseignez la description de la formation.');return false}
    if(allRows().some(({row})=>!Number.isInteger(row.year)||row.year<1000||row.year>9999)){go(2);setError('Indiquez une année à quatre chiffres pour chaque financement.');return false}
    if(allRows().some(({funding,row})=>funding.columns.some(c=>c.numeric&&row[c.key]&&!/^\d{1,8}(\.\d{1,2})?$/.test(row[c.key]!)))){go(2);setError('Les montants et durées sont positifs, avec deux décimales au plus.');return false}
    if(!draft&&step>=2&&missing.length){go(2);panels.show(missing[0].type);setError('Indiquez '+missing.map(m=>m.text).join(' ; ')+'.');return false}
    setError('');return true
  }
  function next(){if(validate(false))go(Math.min(step+1,steps.length-1))}
  // Required fields carry a red asterisk, as on the organisation screen.
  const caption=(label:string)=>label.endsWith(' *')?<>{label.slice(0,-1)}<em>*</em></>:label
  const input=(key:'orientation'|'title'|'acronym'|'hours'|'minutes',label:string,numeric=false)=><div><label>{caption(label)}<input type={numeric?'number':'text'} min={numeric?0:undefined} max={key==='minutes'?59:undefined} maxLength={key==='title'||key==='orientation'||key==='acronym'?255:100} value={data[key]} aria-describedby={key+'-help'} onChange={e=>update(key,e.target.value)}/></label><small id={key+'-help'} className="tw-field-help">{fieldHelp[key]}</small></div>
  const area=(key:'description'|'objectives',label:string)=><div><label>{caption(label)}<textarea rows={key==='description'?3:7} maxLength={5000} value={data[key]} aria-describedby={key+'-help'} onChange={e=>update(key,e.target.value)}/></label><small id={key+'-help'} className="tw-field-help">{fieldHelp[key]}</small></div>
  const checks=[
    {label:'Titre',section:0,done:!!data.title.trim()},
    {label:'Organisme',section:0,done:data.organizations.length>0},{label:'Public cible',section:0,done:!!data.targetAudience},
    {label:'Durée',section:0,done:duration>0},{label:'Prix',section:0,done:!!data.price},{label:'Visuel',section:0,done:!!data.thumbnail},
    {label:'Orientation',section:1,done:!!data.orientation.trim()},{label:'Description',section:1,done:!!data.description.trim()},
    {label:'Objectifs pédagogiques',section:1,done:!!data.objectives.trim()},{label:'Financements',section:2,done:data.fundingTypes.length>0&&!missing.length},
  ]
  const completed=checks.filter(c=>c.done)
  const percent=Math.round(100*completed.length/checks.length)
  return <main className="tw">
    <header className="tw-header"><GraduationCap/><div><h1>{t?'Reprendre le brouillon':'Créer une formation'}</h1><p>Renseignez les informations de votre formation.</p></div>
      <ol>{steps.map((label,i)=><li key={label} aria-current={i===step?'step':undefined}><button disabled={i>step||save.isPending} onClick={()=>go(i)}>{i+1}</button>{label}</li>)}</ol>
    </header>
    <div className={step===3?'tw-layout review':'tw-layout'}><div>
    <section className="tw-card"><h2><FileText/>{['Informations générales','Programme pédagogique','Financements','Validation de la formation'][step]}</h2>
    {step===0&&<div className="tw-fields">
      <div className="wide">{input('title','Titre de la formation *')}<small>{data.title.length} / 255</small></div>
      {input('acronym','Acronyme de la formation')}<div><label>Type de programme<select value={data.modality} onChange={e=>update('modality',e.target.value)}>{['Classe virtuelle','À distance','Présentiel','Mixte'].map(v=><option key={v}>{v}</option>)}</select></label><small className="tw-field-help">Choisissez le format de la formation.</small></div>
      <div><TargetAudienceSelect value={data.targetAudience} onChange={value=>update('targetAudience',value)}/><small className="tw-field-help">Choisissez le public auquel s’adresse la formation. Le référentiel se gère dans Administration → Publics cibles.</small></div>
      <div><label>Référence<input readOnly value={reference} placeholder="Choisissez un public cible" aria-describedby="reference-help"/></label><small id="reference-help" className="tw-field-help">Créée automatiquement : acronyme du public cible, puis acronyme de la formation.</small></div>
      <div><b>{caption('Durée estimée *')}</b><div className="tw-duration">{input('hours','Heures',true)}{input('minutes','Minutes',true)}</div></div>
      <div><label>Prix de la formation (€)<input type="number" min="0" step="0.01" value={data.price} onChange={e=>update('price',e.target.value)}/></label><small className="tw-field-help">Indiquez le tarif de la formation en euros.</small></div>
      <div><OrganizationPicker legend={caption('Organismes *')} hint={data.organizations.length>1?'Organisme porteur : '+(orgs.find(o=>String(o.id)===data.organizations[0])?.name??''):'Sélectionnez un ou plusieurs organismes. Le premier devient l’organisme porteur.'} value={data.organizations} onChange={value=>update('organizations',value)}/></div>
    </div>}
    {step===1&&<div className="tw-fields">
      <div className="wide">{input('orientation','Orientation')}</div>
      <div className="wide">{area('description','Description *')}</div>
      <div className="wide">{area('objectives','Objectifs pédagogiques')}</div>
    </div>}
    {step===2&&<div className="tw-funding"><p className="tw-field-help">Sélectionnez les financements proposés pour cette formation. Chacun demande ses propres informations.</p>
      <div className="tw-funds">{fundings.map(({type,help})=><label key={type}><input type="checkbox" aria-label={type} checked={data.fundingTypes.includes(type)} onChange={e=>{update('fundingTypes',e.target.checked?[...data.fundingTypes,type]:data.fundingTypes.filter(f=>f!==type));if(e.target.checked)panels.show(type)}}/><span><strong>{type}</strong><small>{help}</small></span></label>)}</div>
      {!!data.fundingTypes.length&&<p className="tw-field-help">Les informations se saisissent pour chaque organisme et chaque année. Le prix HT reprend le prix de la première étape ; modifiez-le si besoin.</p>}
      {!!data.fundingTypes.length&&!selectedOrgs.length&&<p className="tw-warning">Choisissez d’abord un organisme.<button type="button" onClick={()=>go(0)}>Choisir un organisme</button></p>}
      {!!selectedOrgs.length&&fundings.filter(f=>data.fundingTypes.includes(f.type)).map(f=><FundingRows key={f.type} funding={f} open={panels.open===f.type} onToggle={()=>panels.toggle(f.type)} defaultPrice={data.price} orgs={selectedOrgs} rows={data[f.key]} onChange={rows=>update(f.key,rows)}/>)}
    </div>}
    {step===3&&<ReviewProgress checks={checks} edit={go} publish={publish} setPublish={setPublish}/>}
    </section>
    {step===0&&<section className="tw-card"><h2><ImagePlus/>Visuel de la formation</h2><label className="tw-upload"><Upload/>{uploading?'Chargement…':data.thumbnail?'Remplacer l’image':'Importer une image'}<span>JPEG, PNG ou WebP · 10 Mo maximum</span><input type="file" disabled={uploading||save.isPending} accept="image/jpeg,image/png,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;busy(true);try{update('thumbnail',await formationThumbnail(file))}catch(err){setError((err as Error).message)}finally{busy(false)}}}/></label></section>}
    </div><aside>{step!==3&&<section className="tw-card"><h2><Eye/>Aperçu de la formation</h2><div className="tw-picture">{data.thumbnail?<img src={data.thumbnail} alt="Visuel de la formation"/>:<ImagePlus/>}</div><div className="tw-tags"><span>{data.modality}</span></div><h3>{data.title||'Titre de la formation'}</h3><p className={data.description?'tw-excerpt':'tw-excerpt empty'}>{data.description||'La description de votre formation apparaîtra ici.'}</p><dl className="tw-facts">{([['Public cible',audienceLabel,Users,'wide'],['Référence',reference,Tag,'wide'],['Durée',durationLabel(duration),Clock,''],['Prix',priceLabel(data.price),Euro,'']] as const).map(([label,value,Icon,size])=><div key={label} className={size}><Icon aria-hidden="true"/><dt>{label}</dt><dd className={value?undefined:'empty'}>{value||'À renseigner'}</dd></div>)}</dl></section>}
    {step===2&&<section className="tw-card"><h2><CalendarCheck/>Progression de configuration</h2>
      <strong>{percent} %</strong><progress aria-label="Progression de configuration" value={completed.length} max={checks.length}/>
      <p>{completed.length} éléments renseignés sur {checks.length}</p></section>}
    {step===3&&<ReviewSummary title={data.title} modality={data.modality} thumbnail={data.thumbnail} audience={audienceLabel} reference={reference}
      duration={durationLabel(duration)} price={priceLabel(data.price)} organizations={selectedOrgs} orientation={data.orientation} description={data.description} objectives={data.objectives}
      fundingTypes={data.fundingTypes} rows={sent}/>}
    {step<3&&<section className="tw-card"><h2><CalendarCheck/>Étapes suivantes</h2>{steps.slice(step+1).map((v,i)=><p className="tw-upcoming" key={v}><b>{step+i+2}</b>{v}</p>)}</section>}</aside></div>
    <footer>{(error||save.error)&&<p role="alert">{error||save.error?.message}</p>}<button disabled={save.isPending||uploading} onClick={()=>validate(true)&&save.mutate('draft')}><Save/>Enregistrer le brouillon</button><button disabled={save.isPending} onClick={()=>step?go(step-1):navigate(catalog)}><ArrowLeft/>{step?'Précédent':'Annuler'}</button><button className="primary" disabled={save.isPending||uploading} onClick={()=>step===3?validate(!publish)&&save.mutate(publish?'published':'unpublished'):next()}>{step===3?(publish?'Publier la formation':'Créer sans publier'):'Suivant'}<ArrowRight/></button></footer>
  </main>
}

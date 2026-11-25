import {useEffect,useRef,useState} from 'react'
import {Link,useNavigate} from 'react-router-dom'
import {useQueryClient} from '@tanstack/react-query'
import {ArrowLeft,ArrowRight,Building2,Calculator,Check,ChevronRight,Eye,FileText,ImageIcon,Mail,Save,UploadCloud} from 'lucide-react'
import {toApiError} from '../api'
import {organizationDraft} from './organizationDraft'
import './organization-wizard.css'

const path='/settings/organizations'
const steps=['Identification','Coordonnées','Facturation','Communications','Documents']
const descriptions=['Informations administratives (nom, code, SIRET, ANDPC…)','Adresse, responsables et contacts','Informations de facturation et bancaires','Paramètres des communications (e-mails, SMS…)','Logo, cachet et documents administratifs (Kbis, Qualiopi, RIB, NDA…)']
const subtitles=['Renseignez les informations administratives de l’organisme.','Renseignez les coordonnées et contacts de l’organisme.','Renseignez les informations de facturation de l’organisme.','Paramétrez les informations et préférences de communication de l’organisme.']
const icons=[Building2,Building2,Calculator,Mail,ImageIcon]
import {fields, optional, options, types, preferences, docs} from './organizationFields'

function Attachment({name,label,image,file,onChange}:{name:string;label:string;image:boolean;file?:File;onChange:(file?:File)=>void}){
  const preview=useRef<HTMLImageElement>(null)
  useEffect(()=>{if(!file||!image||!preview.current)return;const url=URL.createObjectURL(file);preview.current.src=url;return ()=>URL.revokeObjectURL(url)},[file,image])
  return <div className={"ow-upload"+(file?" filled":"")} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(e.dataTransfer.files[0])onChange(e.dataTransfer.files[0])}}>
    <strong>{!image&&<FileText/>}{label} <em>*</em></strong>{file&&image&&<img alt={label} ref={preview}/>}
    <span>{file?<><Check/> {file.name}<small>{file.name.split('.').pop()?.toUpperCase()} · {Math.ceil(file.size/1024)} Ko</small></>:image?'Glissez-déposez une image':'PDF ou image · 5 Mo max.'}</span>{file&&!image&&<small className="ow-attached">✓ Joint</small>}
    <label><UploadCloud/>{file?'Remplacer':'Sélectionner'}<input type="file" name={name} aria-label={label} accept={image?'image/png,image/jpeg,image/webp':'application/pdf,image/png,image/jpeg,image/webp'} onChange={e=>{if(e.target.files?.[0])onChange(e.target.files[0]);e.target.value=''}}/></label>
    {file&&<button type="button" onClick={()=>onChange()}>Supprimer</button>}
  </div>
}

export default function OrganizationWizard({user}:{user:string}){
  const [step,setStep]=useState(0),[values,setValues]=useState<Record<string,string>>({active:'1',color:'blue',operational:'1',alerts:'1',news:'1'})
  const [files,setFiles]=useState<Record<string,File>>({}),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false)
  const navigate=useNavigate(),client=useQueryClient(),Icon=icons[step]
  useEffect(()=>{let live=true;organizationDraft(user).then(d=>{if(live&&d){setStep(d.step);setValues(d.values);setFiles(d.files);setMessage('Brouillon restauré.')}}).catch(()=>{if(live)setMessage('Le stockage local des brouillons est indisponible.')}).finally(()=>{if(live)setReady(true)});return ()=>{live=false}},[user])
  function update(key:string,v:string){setValues(prev=>({...prev,[key]:v}));setMessage('')}
  function move(n:number){setStep(n);setMessage('')}
  async function draft(){setBusy(true);try{await organizationDraft(user,{step,values,files});setMessage('Brouillon enregistré sur ce navigateur.')}catch{setMessage('Impossible d’enregistrer le brouillon sur ce navigateur.')}finally{setBusy(false)}}
  async function submit(){
    if(step<4){move(step+1);return}
    const missing=docs.find(([key])=>!files[key])
    if(missing){setMessage('Ajoutez le document obligatoire « '+missing[1]+' ».');return}
    setBusy(true)
    try{
      const body=new FormData()
      Object.entries(values).forEach(([key,value])=>body.append(key,value))
      Object.entries(files).forEach(([key,file])=>body.append(key,file))
      const res=await fetch('/api/organization-profiles',{method:'POST',body})
      if(!res.ok)throw toApiError(res.status,await res.json().catch(()=>null))
      await organizationDraft(user,null).catch(()=>undefined)
      await Promise.all(['organizations','organization-summaries'].map(key=>client.invalidateQueries({queryKey:[key]})))
      navigate(path)
    }catch(e){setMessage(e instanceof Error?e.message:'Échec de la création.')}finally{setBusy(false)}
  }
  function upload(key:string,image:boolean,file?:File){
    const allowed=['image/png','image/jpeg','image/webp',...(image?[]:['application/pdf'])]
    if(file&&(!allowed.includes(file.type)||!file.size||file.size>5*1024*1024)){setMessage('Format non accepté ou fichier supérieur à 5 Mo.');return}
    setFiles(prev=>{const next={...prev};if(file)next[key]=file;else delete next[key];return next});setMessage('')
  }
  return <section className="ow" data-step={step+1}><nav><Link to={path}>Organismes</Link><ChevronRight/>Créer un organisme</nav><header><i><Building2/></i><div><h1>Créer un organisme</h1><p>Ajoutez un nouvel organisme de formation (DPC) à la plateforme.</p></div></header>
    <div className="ow-layout"><div className="ow-left"><ol className="ow-progress">{steps.map((s,i)=><li key={s} aria-current={i===step?'step':undefined} className={i<=step?'done':''}><button type="button" disabled={i>=step||busy} onClick={()=>move(i)}><b>{i<step?<Check/>:i+1}</b>{s}</button></li>)}</ol>
    <form onSubmit={e=>{e.preventDefault();void submit()}}><fieldset disabled={busy||!ready}>
    {step<4?<section className="ow-panel"><header><i><Icon/></i><div><h2>{steps[step]}</h2><p>{subtitles[step]}</p></div></header><div className={step===3?'ow-communications':''}><div><div className="ow-fields">{fields[step].map(([key,label,hint])=><label key={key} className={['name','url','smsSender'].includes(key)?'wide':''}><span>{label} {!optional.includes(key)&&<em>*</em>}</span>
    {options[key]||key==='active'?<select required={!optional.includes(key)} value={values[key]??''} onChange={e=>update(key,e.target.value)}>{key==='active'?<><option value="1">●　Actif</option><option value="0">○　Inactif</option></>:<><option value="">Sélectionner…</option>{options[key].map(o=><option key={o}>{o}</option>)}</>}</select>:<input name={key} type={types[key]??'text'} required={!optional.includes(key)} placeholder={hint} value={values[key]??''} onChange={e=>update(key,key==='siret'?e.target.value.replace(/\s/g,''):e.target.value)} pattern={({siret:'[0-9]{14}',code:'[A-Z0-9_]{2,20}',smsSender:'[A-Za-z0-9]{1,11}'} as Record<string,string>)[key]}/>}</label>)}</div>
    {step===3&&<div className="ow-prefs">{preferences.map(([key,label,desc])=><label key={key}><input type="checkbox" checked={values[key]==='1'} onChange={e=>update(key,e.target.checked?'1':'0')}/><span><strong>{label}</strong><small>{desc}</small></span></label>)}</div>}</div>
    {step===3&&<aside className="ow-preview"><h3><Eye/> Aperçu des communications</h3><p>Voici comment vos informations apparaîtront dans les messages.</p><h4>SMS</h4><blockquote>{values.smsSender||'Expéditeur'} · Votre session DPC est confirmée.</blockquote><h4>E-mail</h4><blockquote>De : {values.emailFrom||'—'}<br/>Répondre à : {values.replyEmail||'—'}<hr/>Confirmation de votre session DPC</blockquote></aside>}</div></section>:
    [true,false].map(image=><section className="ow-panel" key={String(image)}><header><i>{image?<ImageIcon/>:<FileText/>}</i><div><h2>{image?'Identité visuelle':'Documents administratifs'}</h2><p>{image?'Ajoutez le logo, la signature et le cachet de l’organisme.':'Ajoutez les documents réglementaires de l’organisme.'}</p></div></header><div className={image?'ow-images':'ow-docs'}>{docs.filter((_,i)=>(i<3)===image).map(([key,label])=><Attachment key={key} name={key} label={label} image={image} file={files[key]} onChange={file=>upload(key,image,file)}/>)}</div></section>)}
    {message&&<p role="status">{message}</p>}<footer>{step?<button type="button" onClick={()=>move(step-1)}><ArrowLeft/>Retour</button>:<Link to={path}>Annuler</Link>}<button type="button" onClick={draft}><Save/>Enregistrer en brouillon</button><button type="submit">{step===4?'Créer l’organisme':'Continuer'}{step===4?<Check/>:<ArrowRight/>}</button></footer></fieldset></form></div>
    <aside className="ow-guide"><img src="/organizations/creation-building.png" alt=""/><h2>Création d’un organisme</h2><p>Complétez les 5 étapes pour ajouter un nouvel organisme.</p><ol>{steps.map((s,i)=><li key={s} aria-current={i===step?'step':undefined}><b>{i+1}</b><div><strong>{s}</strong><small>{descriptions[i]}</small></div></li>)}</ol></aside></div></section>
}

import {Picto} from '../components/Picto'
import {useEffect,useState} from 'react'
import {Link,useNavigate,useSearchParams} from 'react-router-dom'
import {useQueryClient} from '@tanstack/react-query'
import {ArrowLeft,ArrowRight,Building2,Calculator,Check,Eye,FileText,ImageIcon,Mail,MessageSquare,Save,UploadCloud} from 'lucide-react'
import {api,toApiError} from '../api'
import {OrganizationFieldsForm} from './OrganizationFieldsForm'
import {OrganizationDocuments} from './OrganizationDocuments'
import {organizationDraft} from './organizationDraft'
import './organization-wizard.css'

const path='/settings/organizations'
const steps=['Identification','Coordonnées','Facturation','Communications','Documents']
const descriptions=['Informations administratives (nom, code, SIREN ou SIRET, ANDPC…)','Adresse, responsables et contacts','Informations de facturation et bancaires','Expéditeurs des e-mails et SMS','Logo, cachet et documents administratifs (Kbis, Qualiopi, RIB, NDA…)']
const subtitles=['Renseignez les informations administratives de l’organisme.','Renseignez les coordonnées et contacts de l’organisme.','Renseignez les informations de facturation de l’organisme.','Choisissez les expéditeurs des e-mails et des SMS.']
const icons=[Building2,Building2,Calculator,Mail,ImageIcon]
import {fieldHelp, organizationFormGroups, docs} from './organizationFields'

function Attachment({name,label,file,onChange}:{name:string;label:string;file?:File;onChange:(file?:File)=>void}){
  return <div className={"ow-upload"+(file?" filled":"")} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(e.dataTransfer.files[0])onChange(e.dataTransfer.files[0])}}>
    <strong><FileText/>{label}</strong>
    <span>{file?<><Check/> {file.name}<small>{file.name.split('.').pop()?.toUpperCase()} · {Math.ceil(file.size/1024)} Ko</small></>:'PDF ou image · 5 Mo max.'}</span>{file&&<small className="ow-attached">✓ Joint</small>}
    <label><UploadCloud/>{file?'Remplacer':'Sélectionner'}<input type="file" name={name} aria-label={label} aria-describedby={`ow-help-${name}`} accept="application/pdf,image/png,image/jpeg,image/webp" onChange={e=>{if(e.target.files?.[0])onChange(e.target.files[0]);e.target.value=''}}/></label>
    {file&&<button type="button" onClick={()=>onChange()}>Supprimer</button>}
    <small id={`ow-help-${name}`} className="ow-field-help">{fieldHelp[name]}</small>
  </div>
}

export default function OrganizationWizard({user}:{user:string}){
  const [step,setStep]=useState(0),[values,setValues]=useState<Record<string,string>>({active:'1',color:'blue'})
  const [files,setFiles]=useState<Record<string,File>>({}),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false)
  const navigate=useNavigate(),client=useQueryClient(),Icon=icons[step]
  const [params]=useSearchParams()
  const draftId=params.get('draft')
  useEffect(()=>{
    let live=true
    async function restore(){
      setReady(false)
      try {
        const draft = draftId ? await api<{step:number;values:Record<string,string>;files:Record<string,[string,string,string]>}>('/organization-profiles/drafts/'+encodeURIComponent(draftId)) : undefined
        const restored = draft ? {
          ...draft,
          files:Object.fromEntries(Object.entries(draft.files).map(([key,[name,type,data]])=>[
            key,new File([Uint8Array.from(atob(data),character=>character.charCodeAt(0))],name,{type}),
          ])),
        } : await organizationDraft(user).catch(()=>undefined)
        if(!live)return
        setStep(restored?.step??0)
        setValues({active:'1',color:'blue',...restored?.values})
        setFiles(restored?.files??{})
        setMessage(!draftId&&restored?'Brouillon local restauré. Enregistrez-le pour le retrouver dans la liste.':'')
        setReady(true)
      }catch(e){if(live)setMessage(e instanceof Error?e.message:'Impossible de charger le brouillon.')}
    }
    void restore()
    return ()=>{live=false}
  },[draftId,user])
  function update(key:string,v:string){setValues(prev=>({...prev,[key]:v}));setMessage('')}
  function move(n:number){setStep(n);setMessage('')}
  const billingDefaults: Record<string,string> = {
    billingName: values.name ?? '',
    billingAddress: [values.address, values.addressExtra].filter(Boolean).join(', '),
    billingZip: values.zipCode ?? '',
    billingCity: values.city ?? '',
    billingEmail: values.email ?? '',
    billingPhone: values.phone ?? '',
  }
  const formValues: Record<string,string> = { ...billingDefaults, emailFrom: values.email ?? '', ...values }
  function formData(bodyValues: Record<string,string>){
    const body = new FormData()
    Object.entries(bodyValues).forEach(([key,value])=>body.append(key,value))
    Object.entries(files).forEach(([key,file])=>body.append(key,file))
    return body
  }
  async function draft(){
    setBusy(true)
    try {
      const body = formData(values)
      body.set('step',String(step))
      const url = '/api/organization-profiles/drafts'+(draftId?'/'+encodeURIComponent(draftId):'')
      const response = await fetch(url,{method:'POST',body})
      if(!response.ok)throw toApiError(response.status,await response.json().catch(()=>null))
      if(!draftId)await organizationDraft(user,null).catch(()=>undefined)
      await client.invalidateQueries({queryKey:['organization-drafts']})
      navigate(path)
    }catch(e){setMessage(e instanceof Error?e.message:'Impossible d’enregistrer le brouillon.')}
    finally{setBusy(false)}
  }
  async function submit(){
    if(step<4){move(step+1);return}
    if(!files.logo){setMessage('Ajoutez le logo de l’organisme pour continuer.');return}
    setBusy(true)
    try{
      const body=formData(formValues)
      if(draftId)body.set('draftId',draftId)
      const res=await fetch('/api/organization-profiles',{method:'POST',body})
      if(!res.ok)throw toApiError(res.status,await res.json().catch(()=>null))
      if(!draftId)await organizationDraft(user,null).catch(()=>undefined)
      await Promise.all(['organizations','organization-summaries','organization-drafts'].map(key=>client.invalidateQueries({queryKey:[key]})))
      navigate(path)
    }catch(e){setMessage(e instanceof Error?e.message:'Échec de la création.')}finally{setBusy(false)}
  }
  function upload(key:string,image:boolean,file?:File){
    const allowed=['image/png','image/jpeg','image/webp',...(image?[]:['application/pdf'])]
    if(file&&(!allowed.includes(file.type)||!file.size||file.size>5*1024*1024)){setMessage('Format non accepté ou fichier supérieur à 5 Mo.');return}
    setFiles(prev=>{const next={...prev};if(file)next[key]=file;else delete next[key];return next});setMessage('')
  }
  return <section className="ow" data-step={step+1}><nav><Link to={path}><ArrowLeft aria-hidden="true"/>Organismes</Link></nav><header><i><Building2/></i><div><h1>{draftId?'Reprendre un organisme':'Créer un organisme'}</h1>{draftId&&<span className="org-draft-status">Brouillon</span>}<p>Ajoutez un nouvel organisme de formation (DPC) à la plateforme.</p></div></header>
    <div className="ow-layout"><div className="ow-left"><p className="ow-step-summary" aria-live="polite">Étape {step+1} sur {steps.length} · {steps[step]}</p>
    <form onSubmit={e=>{e.preventDefault();void submit()}}><fieldset disabled={busy||!ready}>
    {step<4?<section className="ow-panel"><header><i><Icon/></i><div><h2>{steps[step]}</h2><p>{subtitles[step]}</p></div></header><div className={step===3?'ow-communications':''}><div><div className="ow-fields"><OrganizationFieldsForm group={organizationFormGroups[step]} formValues={formValues} update={update}/></div>
    </div>
    {step===3&&<aside className="ow-preview" aria-label="Aperçu des messages">
      <h3><Eye aria-hidden="true"/> Aperçu des messages</h3>
      <section className="ow-message">
        <h4><Mail aria-hidden="true"/> E-mail</h4>
        <dl>
          <div><dt>De</dt><dd><strong>{values.name || 'Organisme'}</strong>{formValues.emailFrom && <span>{formValues.emailFrom}</span>}</dd></div>
          <div><dt>Objet</dt><dd>{values.name || 'Organisme'} — Confirmation de votre inscription</dd></div>
        </dl>
        <div className="ow-email-body"><p>Bonjour Camille,</p><p>Votre inscription à la classe virtuelle est confirmée.</p><p>L’équipe {values.name || 'de l’organisme'}</p></div>
      </section>
      <section className="ow-message">
        <h4><MessageSquare aria-hidden="true"/> SMS</h4>
        <div className="ow-sms-body"><strong>{values.smsSender || 'Expéditeur par défaut'}</strong><p>Bonjour Camille, votre classe virtuelle commence dans 5 minutes.</p></div>
      </section>
    </aside>}</div></section>:
    <>
      <OrganizationDocuments visualOnly stored={[]} removed={[]} root="" files={files} onChange={(key,file)=>upload(key,true,file)}/>
      <section className="ow-panel"><header><i><FileText/></i><div><h2>Documents administratifs</h2><p>Ces pièces sont facultatives et peuvent être ajoutées après la création.</p></div></header>
        <div className="ow-docs">{docs.slice(3).map(([key,label])=><Attachment key={key} name={key} label={label} file={files[key]} onChange={file=>upload(key,false,file)}/>)}</div>
      </section>
    </>}
    {message&&<p role="status">{message}</p>}<footer>{step?<button type="button" onClick={()=>move(step-1)}><ArrowLeft/>Retour</button>:<Link to={path}>Annuler</Link>}<button type="button" onClick={draft}><Save/>Enregistrer en brouillon</button><button type="submit">{step===4?'Créer l’organisme':'Continuer'}{step===4?<Check/>:<ArrowRight/>}</button></footer></fieldset></form></div>
    <aside className="ow-guide"><Picto name="building" className="picto-heading"/><h2>Création d’un organisme</h2><p>Complétez les 5 étapes pour ajouter un nouvel organisme.</p><ol>{steps.map((s,i)=><li key={s} aria-current={i===step?'step':undefined}><b>{i+1}</b><div><strong>{s}</strong><small>{descriptions[i]}</small></div></li>)}</ol></aside></div></section>
}

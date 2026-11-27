import {useRef,useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {Link,Navigate,useNavigate,useParams} from 'react-router-dom'
import {Archive,BookOpen,CalendarDays,ChartColumn,Copy,Eye,FileText,Megaphone,Pencil,Printer,Save,Star,Upload,Users} from 'lucide-react'
import {api,type VirtualClass} from '../api'
import {publicationLabel,publicationOptions} from './formationPublication'
import {formationThumbnail} from './formationThumbnail'
import {priceLabel} from './formationFormat'
import {compact,fundings,isFilled,type FundingRow} from './fundings'
import {FundingRows} from './FundingRows'
import {useOpenFunding} from './useOpenFunding'
import './formation-wizard.css'
import {TargetAudienceSelect} from './TargetAudienceSelect'
import './formation-sheet.css'

type Org={id:number;name:string;active:boolean}
type Formation={
  targetAudience?:{id:number;name:string}|null;acronym?:string|null;additionalOrganizations?:Org[]
  id:number;organization:Org;title:string;reference:string|null;publicationStatus:string;active:boolean
  theme:string|null;audience:string|null;language:string|null;prerequisites:string|null;modality:string|null
  description:string|null;objectives:string|null;orientation:string|null;thumbnail:string|null
  defaultCapacity:number;totalDurationMin:number|null;price?:string|null;fundingTypes:string[];andpcCodes:FundingRow[];fifplCodes?:FundingRow[];personalPrices?:FundingRow[]
}
type Session=VirtualClass&{formation:{id:number};reference?:string}
type Access={canReadClasses:boolean;canSchedule:boolean}
const statuses={PLANNED:'Planifiée',IN_PROGRESS:'En cours',DONE:'Terminée',CANCELLED:'Annulée'}
const tabs=[{name:'Conception',Icon:Pencil},{name:'Diffusion',Icon:Megaphone},{name:'Pilotage',Icon:ChartColumn}]
const funds=['ANDPC','FIFPL','Personnel']
const editable=['acronym','title','theme','audience','language','prerequisites','modality','description','objectives','orientation','thumbnail','defaultCapacity','totalDurationMin','price','fundingTypes','andpcCodes','fifplCodes','personalPrices','publicationStatus','active'] as const

export default function FormationSheet(access:Access){
  const {id}=useParams()
  const item=useQuery({queryKey:['formation',id],queryFn:()=>api<Formation>('/formations/'+id)})
  if(item.error)return <p role="alert">{item.error.message}</p>
  if(!item.data)return <p role="status">Chargement de la formation…</p>
  // A draft is still being created: every way in (catalogue, copy, saved link) leads back to the steps.
  if(item.data.publicationStatus==='draft')return <Navigate replace to={'/settings/formations/'+id+'/resume'}/>
  return <Sheet key={id} initial={item.data} {...access}/>
}

function Sheet({initial,canReadClasses,canSchedule}:Access&{initial:Formation}){
  const cache=useQueryClient(),navigate=useNavigate(),preview=useRef<HTMLDialogElement>(null)
  const [saved,setSaved]=useState(initial),[draft,setDraft]=useState(initial)
  const [tab,setTab]=useState('Conception'),[notice,setNotice]=useState(''),[loadingImage,imageBusy]=useState(false)
  const panels=useOpenFunding(fundings.map(f=>f.type).filter(type=>draft.fundingTypes.includes(type)))
  const orgs=useQuery({queryKey:['organizations'],queryFn:()=>api<Org[]>('/organizations')})
  const classes=useQuery({queryKey:['classes'],queryFn:()=>api<Session[]>('/virtual-classes'),enabled:canReadClasses})
  const sessions=classes.data?.filter(c=>c.formation.id===initial.id)
  const count=canReadClasses?sessions?.length:undefined
  const enrolled=canReadClasses?sessions?.reduce((n,c)=>n+c.enrolledCount,0):undefined
  const dirty=JSON.stringify(draft)!==JSON.stringify(saved)
  function change<K extends keyof Formation>(key:K,value:Formation[K]){setDraft(old=>({...old,[key]:value}));setNotice('')}
  const save=useMutation({mutationFn:async(action:'save'|'publish'|'archive'|'copy')=>{
    if(!draft.title.trim()||!draft.organization?.id)throw new Error('Renseignez le titre et l’organisme.')
    if(action==='publish'&&(!draft.audience?.trim()||!draft.description?.trim()||!draft.totalDurationMin))throw new Error('Complétez le public cible, la description et la durée avant de publier.')
    const copy=action==='copy'
    const payload:Record<string,unknown>={}
    for(const key of editable)if(copy||JSON.stringify(draft[key])!==JSON.stringify(saved[key]))payload[key]=draft[key]
    if(copy||draft.organization.id!==saved.organization.id)payload.organization='/api/organizations/'+draft.organization.id
    if(copy||draft.targetAudience?.id!==saved.targetAudience?.id){
      payload.targetAudience=draft.targetAudience?'/api/target-audiences/'+draft.targetAudience.id:null
      if(!copy)payload.audience=null
    }
    if(copy)payload.additionalOrganizations=(draft.additionalOrganizations??[]).map(o=>'/api/organizations/'+o.id)
    if(copy){payload.title=draft.title.slice(0,245)+' (copie)';payload.publicationStatus='draft'}
    if(action==='publish'){payload.publicationStatus='published';payload.active=true}
    if(action==='archive')payload.publicationStatus='archived'
    // Swapping the leading organisation moves its funding lines to the new one.
    if(draft.organization.id!==saved.organization.id)for(const key of ['andpcCodes','fifplCodes','personalPrices'] as const)
      payload[key]=(draft[key]??[]).map(row=>row.organization===saved.organization.id?{...row,organization:draft.organization.id}:row)
    for(const {key} of fundings)if(payload[key])payload[key]=(payload[key] as FundingRow[]).filter(isFilled).map(compact)
    return api<Formation>(copy?'/formations':'/formations/'+initial.id,{method:copy?'POST':'PATCH',body:JSON.stringify(payload),headers:copy?{}:{'Content-Type':'application/merge-patch+json'}})
  },onSuccess:(result,action)=>{
    cache.setQueryData(['formation',String(result.id)],result)
    void cache.invalidateQueries({queryKey:['formations']})
    if(action==='copy'){navigate('/settings/formations/'+result.id+'/edit');return}
    setSaved(result);setDraft(result);setNotice('Modifications enregistrées.')
  }})
  const busy=save.isPending||loadingImage
  // The leading organisation first: lines entered without one belong to it.
  const fundingOrgs=[draft.organization,...(draft.additionalOrganizations??[])].map(o=>({...o,...orgs.data?.find(item=>item.id===o.id)}))
  const input=(key:'acronym'|'title'|'theme'|'audience'|'prerequisites'|'language'|'orientation',label:string,maxLength=100)=><label>{label}<input value={draft[key]??''} maxLength={maxLength} onChange={e=>change(key,e.target.value)}/></label>
  const area=(key:'description'|'objectives',label:string)=><label className="wide">{label}<textarea rows={3} maxLength={5000} value={draft[key]??''} onChange={e=>change(key,e.target.value)}/></label>
  const print=()=>{preview.current?.showModal();window.print()}
  const status=publicationLabel(saved.publicationStatus)
  return <main className="tw ts">
    <header className="ts-head"><label className="ts-cover">{draft.thumbnail?<img src={draft.thumbnail} alt="Visuel"/>:<BookOpen/>}<Pencil className="ts-pencil"/>
      <input type="file" aria-label="Modifier le visuel" disabled={busy} accept="image/jpeg,image/png,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;imageBusy(true);try{change('thumbnail',await formationThumbnail(file))}catch(err){setNotice((err as Error).message)}finally{imageBusy(false)}}}/></label>
      <div><h1>{draft.title||'Formation'}</h1><div className="tw-tags"><span>{status}</span><span>{draft.theme||'Sans catégorie'}</span><span>{draft.modality||'Type à préciser'}</span></div></div>
      <div className="ts-controls"><small>{dirty?'Modifications en cours':'Modifications enregistrées'}</small><button onClick={()=>preview.current?.showModal()}><Eye/>Aperçu</button><button disabled={!dirty||busy} onClick={()=>save.mutate('save')}><Save/>Enregistrer</button>{saved.publicationStatus!=='published'&&<button className="primary" disabled={busy} onClick={()=>save.mutate('publish')}><Upload/>Publier</button>}</div>
    </header>
    <nav className="ts-tabs" aria-label="Rubriques de la formation">{tabs.map(({name,Icon})=><button key={name} aria-pressed={tab===name} onClick={()=>setTab(name)}><Icon/>{name}</button>)}</nav>
    {save.error&&<p role="alert">{save.error.message}</p>}{notice&&<p role="status">{notice}</p>}
    {classes.error&&<p role="alert">{classes.error.message}</p>}
    <div className="ts-metrics">{[{Icon:Users,label:'Inscriptions',value:enrolled},{Icon:CalendarDays,label:'Sessions',value:count},...(tab==='Pilotage'?[{Icon:ChartColumn,label:'Complétion',value:undefined},{Icon:Star,label:'Satisfaction',value:undefined}]:[])].map(({Icon,label,value})=><div key={label}><Icon/><strong>{value??'—'}</strong>{label}</div>)}</div>
    <div className="tw-layout"><div><fieldset disabled={busy} className="ts-body">
    {tab==='Conception'&&<><section className="tw-card"><h2><FileText/>Informations générales</h2><div className="tw-fields"><div className="wide">{input('title','Titre de la formation *',255)}</div>
      <label>Type de programme<select value={draft.modality??''} onChange={e=>change('modality',e.target.value||null)}><option value="">Choisir</option>{['Classe virtuelle','À distance','Présentiel','Mixte'].map(v=><option key={v}>{v}</option>)}</select></label>
      {input('theme','Catégorie')}{area('description','Description')}{input('prerequisites','Prérequis',5000)}
      <label>Durée estimée (minutes)<input type="number" min="1" value={draft.totalDurationMin??''} onChange={e=>change('totalDurationMin',Number(e.target.value)||null)}/></label>
      <label>Prix de la formation (€)<input type="number" min="0" step="0.01" value={draft.price??''} onChange={e=>change('price',e.target.value||null)}/></label>
      {input('language','Langue')}{input('acronym','Acronyme de la formation',255)}
      <label>Référence (créée à l’enregistrement)<input readOnly value={saved.reference??''}/></label>
      <TargetAudienceSelect value={String(draft.targetAudience?.id??'')} onChange={id=>change('targetAudience',id?{id:Number(id),name:''}:null)}/>
      <label>Organisme<select value={draft.organization.id} onChange={e=>{const org=orgs.data?.find(o=>o.id===Number(e.target.value));if(org)change('organization',org)}}>{(orgs.data??[draft.organization]).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      </div></section>
      <section className="tw-card"><h2><BookOpen/>Programme</h2><div className="tw-fields"><div className="wide">{input('orientation','Orientation',255)}</div>{area('objectives','Objectifs pédagogiques')}</div></section></>}
    {tab==='Diffusion'&&<><section className="tw-card"><h2><Megaphone/>Diffusion de la formation</h2><div className="tw-fields">
      <label>Statut de publication<select value={draft.publicationStatus} onChange={e=>change('publicationStatus',e.target.value)}>{publicationOptions.map(o=><option value={o.value} key={o.value}>{o.label}</option>)}</select></label>
      <label><input type="checkbox" checked={draft.active} onChange={e=>change('active',e.target.checked)}/> Formation active pour la planification</label></div></section>
      <section className="tw-card"><h2>Financements</h2><div className="tw-checks">{funds.map(f=><label key={f}><input type="checkbox" checked={draft.fundingTypes.includes(f)} onChange={e=>change('fundingTypes',e.target.checked?[...draft.fundingTypes,f]:draft.fundingTypes.filter(v=>v!==f))}/>{f}</label>)}</div>
      <div className="tw-funding">{fundings.filter(f=>draft.fundingTypes.includes(f.type)).map(f=><FundingRows key={f.type} funding={f} open={panels.open===f.type} onToggle={()=>panels.toggle(f.type)} orgs={fundingOrgs} rows={draft[f.key]??[]} onChange={rows=>change(f.key,rows)}/>)}</div></section></>}
    {tab==='Pilotage'&&<><section className="tw-card"><div className="ts-section-head"><h2><CalendarDays/>Suivi des sessions</h2>{canSchedule&&saved.active&&saved.organization.active&&<button onClick={()=>navigate('/classes/new',{state:{formationId:saved.id,capacity:20}})}>Créer une session</button>}</div>
      {!canReadClasses?<p>Accès aux sessions requis.</p>:!sessions?<p>{classes.error?'Sessions indisponibles.':'Chargement…'}</p>:<div className="ts-scroll"><table><thead><tr>{['Session','Date','Inscriptions','Statut'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{sessions.map(s=><tr key={s.id}><td><Link to={'/classes/'+s.id}>{s.reference||'Session '+s.id}</Link></td><td>{new Date(s.date).toLocaleDateString('fr-FR')}</td><td>{s.enrolledCount} / {s.capacity}</td><td>{statuses[s.status]}</td></tr>)}{!sessions.length&&<tr><td colSpan={4}>Aucune session liée.</td></tr>}</tbody></table></div>}</section>
      <section className="tw-card"><h2><ChartColumn/>Évaluations et engagement</h2><div className="ts-score">{['Pré-formation','Post-formation','Satisfaction','EPP'].map(v=><div key={v}><b>{v}</b><strong>—</strong><small>Non disponible</small></div>)}</div></section></>}
    </fieldset></div><aside><section className="tw-card"><h2>{tab==='Pilotage'?'Résumé':'Statut de la formation'}</h2><dl><div><dt>Statut</dt><dd>{status}</dd></div><div><dt>Sessions liées</dt><dd>{count??'—'}</dd></div><div><dt>Inscriptions actives</dt><dd>{enrolled??'—'}</dd></div></dl></section>
      <section className="tw-card ts-quick"><h2>Actions rapides</h2><button disabled={busy} onClick={()=>save.mutate('copy')}><Copy/>Dupliquer la formation</button><button onClick={print}><Printer/>Exporter la fiche (PDF)</button>{saved.publicationStatus!=='archived'&&<button disabled={busy} onClick={()=>save.mutate('archive')}><Archive/>Archiver la formation</button>}<Link to="/settings/formations">Retour aux formations</Link></section></aside></div>
    <dialog ref={preview} className="ts-preview"><h2>{draft.title}</h2>{draft.thumbnail&&<img src={draft.thumbnail} alt="Visuel de la formation"/>}<p>{draft.organization.name} · {draft.modality}</p><dl>{Object.entries({'Catégorie':draft.theme,'Public cible':draft.audience,'Durée':draft.totalDurationMin?draft.totalDurationMin+' min':null,'Prix':priceLabel(draft.price),'Description':draft.description,'Orientation':draft.orientation,'Objectifs pédagogiques':draft.objectives,'Prérequis':draft.prerequisites,'Langue':draft.language,'Financements':draft.fundingTypes.join(', ')}).map(([k,v])=>v&&<div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><button onClick={()=>preview.current?.close()}>Fermer</button></dialog>
  </main>
}

import {useRef,useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {Link,Navigate,useNavigate,useParams} from 'react-router-dom'
import {Archive,BookOpen,CalendarDays,ChartColumn,Copy,Eye,FileText,GraduationCap,Megaphone,Pencil,Printer,Save,Star,Upload,Users,Wallet} from 'lucide-react'
import {api,type VirtualClass} from '../api'
import {publicationLabel,publicationOptions} from './formationPublication'
import {FundingChoice,IdentityFields,PreviewCard,ProgrammeFields,VisualCard,type FormationValues} from './FormationParts'
import {useTargetAudiences} from './useTargetAudiences'
import {Resources} from '../components/Resources'
import {durationLabel,priceLabel,referenceLabel} from './formationFormat'
import {compact,fundings,isFilled,type FundingRow} from './fundings'
import {useOpenFunding} from './useOpenFunding'
import './formation-wizard.css'
import './formation-sheet.css'

type Org={id:number;name:string;active:boolean}
type Formation={
  targetAudience?:{id:number;name:string}|null;acronym?:string|null;additionalOrganizations?:Org[]
  id:number;organization:Org;title:string;reference:string|null;publicationStatus:string;active:boolean
  audience:string|null;modality:string|null
  description:string|null;objectives:string|null;orientation:string|null;thumbnail:string|null
  defaultCapacity:number;totalDurationMin:number|null;price?:string|null;fundingTypes:string[];andpcCodes:FundingRow[];fifplCodes?:FundingRow[];personalPrices?:FundingRow[]
}
type Session=VirtualClass&{formation:{id:number};reference?:string}
type Access={canReadClasses:boolean;canSchedule:boolean}
const statuses={PLANNED:'Planifiée',IN_PROGRESS:'En cours',DONE:'Terminée',CANCELLED:'Annulée'}
const tabs=[{name:'Conception',Icon:Pencil},{name:'Diffusion',Icon:Megaphone},{name:'Pilotage',Icon:ChartColumn}]
const editable=['acronym','title','audience','modality','description','objectives','orientation','thumbnail','defaultCapacity','totalDurationMin','price','fundingTypes','andpcCodes','fifplCodes','personalPrices','publicationStatus'] as const

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
    if(action==='publish'&&(!(draft.targetAudience||draft.audience?.trim())||!draft.description?.trim()||!draft.totalDurationMin))throw new Error('Complétez le public cible, la description et la durée avant de publier.')
    const copy=action==='copy'
    const payload:Record<string,unknown>={}
    for(const key of editable)if(copy||JSON.stringify(draft[key])!==JSON.stringify(saved[key]))payload[key]=draft[key]
    if(copy||draft.organization.id!==saved.organization.id)payload.organization='/api/organizations/'+draft.organization.id
    if(copy||draft.targetAudience?.id!==saved.targetAudience?.id){
      payload.targetAudience=draft.targetAudience?'/api/target-audiences/'+draft.targetAudience.id:null
      if(!copy)payload.audience=null
    }
    const kept=[draft.organization,...(draft.additionalOrganizations??[])].map(o=>o.id)
    const regrouped=JSON.stringify(kept)!==JSON.stringify([saved.organization,...(saved.additionalOrganizations??[])].map(o=>o.id))
    if(copy||regrouped)payload.additionalOrganizations=kept.slice(1).map(id=>'/api/organizations/'+id)
    if(copy){payload.title=draft.title.slice(0,245)+' (copie)';payload.publicationStatus='draft'}
    if(action==='publish')payload.publicationStatus='published'
    if(action==='archive')payload.publicationStatus='archived'
    // Funding lines of an organisation that no longer carries the formation leave with it, as in the creation steps.
    if(regrouped)for(const {key} of fundings)payload[key]=(draft[key]??[]).filter(row=>!row.organization||kept.includes(row.organization))
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
  const selectedOrgs=[draft.organization,...(draft.additionalOrganizations??[])].map(o=>({...o,...orgs.data?.find(item=>item.id===o.id)}))
  const audiences=useTargetAudiences()
  const audience=audiences.data?.find(a=>a.id===draft.targetAudience?.id)
  const audienceLabel=audience?[audience.name,audience.acronym&&'('+audience.acronym+')'].filter(Boolean).join(' '):draft.audience??''
  const reference=referenceLabel(draft.acronym??'',draft.title,audience)||saved.reference||''
  const minutes=draft.totalDurationMin??0
  const values:FormationValues={title:draft.title,acronym:draft.acronym??'',modality:draft.modality??'',targetAudience:String(draft.targetAudience?.id??''),
    hours:String(Math.floor(minutes/60)||''),minutes:String(minutes%60||''),price:draft.price??'',organizations:selectedOrgs.map(o=>String(o.id)),
    orientation:draft.orientation??'',description:draft.description??'',objectives:draft.objectives??''}
  // The shared fields speak strings and ids; the sheet keeps the shape of the API.
  function set<K extends keyof FormationValues>(key:K,value:FormationValues[K]){
    const text=value as string
    if(key==='hours'||key==='minutes'){const next={...values,[key]:text};change('totalDurationMin',Number(next.hours)*60+Number(next.minutes)||null)}
    else if(key==='targetAudience')change('targetAudience',text?{id:Number(text),name:''}:null)
    else if(key==='price')change('price',text||null)
    else if(key==='organizations'){
      const chosen=(value as string[]).flatMap(id=>orgs.data?.filter(o=>String(o.id)===id)??[])
      // A formation always keeps one organisation.
      if(chosen.length){setDraft(old=>({...old,organization:chosen[0],additionalOrganizations:chosen.slice(1)}));setNotice('')}
    }else change(key as 'title'|'acronym'|'modality'|'orientation'|'description'|'objectives',text)
  }
  const print=()=>{preview.current?.showModal();window.print()}
  const status=publicationLabel(saved.publicationStatus)
  return <main className="tw ts">
    <header className="ts-head"><GraduationCap className="ts-icon"/>
      <div><h1>{draft.title||'Formation'}</h1><div className="tw-tags"><span>{status}</span><span>{draft.modality||'Type à préciser'}</span></div></div>
      <div className="ts-controls"><small>{dirty?'Modifications en cours':'Modifications enregistrées'}</small><button onClick={()=>preview.current?.showModal()}><Eye/>Aperçu</button><button disabled={!dirty||busy} onClick={()=>save.mutate('save')}><Save/>Enregistrer</button>{saved.publicationStatus!=='published'&&<button className="primary" disabled={busy} onClick={()=>save.mutate('publish')}><Upload/>Publier</button>}</div>
    </header>
    <nav className="ts-tabs" aria-label="Rubriques de la formation">{tabs.map(({name,Icon})=><button key={name} aria-pressed={tab===name} onClick={()=>setTab(name)}><Icon/>{name}</button>)}</nav>
    {save.error&&<p role="alert">{save.error.message}</p>}{notice&&<p role="status">{notice}</p>}
    {classes.error&&<p role="alert">{classes.error.message}</p>}
    <div className="ts-metrics">{[{Icon:Users,label:'Inscriptions',value:enrolled},{Icon:CalendarDays,label:'Sessions',value:count},...(tab==='Pilotage'?[{Icon:ChartColumn,label:'Complétion',value:undefined},{Icon:Star,label:'Satisfaction',value:undefined}]:[])].map(({Icon,label,value})=><div key={label}><Icon/><strong>{value??'—'}</strong>{label}</div>)}</div>
    <div className="tw-layout"><div><fieldset disabled={busy} className="ts-body">
    {tab==='Conception'&&<><section className="tw-card"><h2><FileText/>Informations générales</h2><IdentityFields value={values} set={set} orgs={selectedOrgs} reference={reference}/></section>
      <VisualCard thumbnail={draft.thumbnail} loading={loadingImage} disabled={save.isPending} onLoading={imageBusy} onChange={value=>change('thumbnail',value)} onError={setNotice}/>
      <section className="tw-card"><h2><BookOpen/>Programme pédagogique</h2><ProgrammeFields value={values} set={set}/></section></>}
    {tab==='Diffusion'&&<><section className="tw-card"><h2><Megaphone/>Diffusion de la formation</h2><div className="tw-fields">
      <label>Statut de publication<select value={draft.publicationStatus} onChange={e=>change('publicationStatus',e.target.value)}>{publicationOptions.map(o=><option value={o.value} key={o.value}>{o.label}</option>)}</select></label>
      <p className="tw-field-help">Seule une formation publiée peut recevoir des classes.</p></div></section>
      <section className="tw-card"><h2><Wallet/>Financements</h2><FundingChoice selected={draft.fundingTypes} onSelect={types=>change('fundingTypes',types)} orgs={selectedOrgs} rows={key=>draft[key]??[]} onRows={(key,rows)=>change(key,rows)} panels={panels}/></section></>}
    {tab==='Pilotage'&&<><section className="tw-card"><div className="ts-section-head"><h2><CalendarDays/>Suivi des sessions</h2>{canSchedule&&saved.active&&saved.organization.active&&<button onClick={()=>navigate('/sessions')}>Planifier depuis une session</button>}</div>
      {!canReadClasses?<p>Accès aux sessions requis.</p>:!sessions?<p>{classes.error?'Sessions indisponibles.':'Chargement…'}</p>:<div className="ts-scroll"><table><thead><tr>{['Session','Date','Inscriptions','Statut'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{sessions.map(s=><tr key={s.id}><td><Link to={'/classes/'+s.id}>{s.reference||'Session '+s.id}</Link></td><td>{new Date(s.date).toLocaleDateString('fr-FR')}</td><td>{s.enrolledCount} / {s.capacity}</td><td>{statuses[s.status]}</td></tr>)}{!sessions.length&&<tr><td colSpan={4}>Aucune session liée.</td></tr>}</tbody></table></div>}</section>
      <section className="tw-card"><h2><ChartColumn/>Évaluations et engagement</h2><div className="ts-score">{['Pré-formation','Post-formation','Satisfaction','EPP'].map(v=><div key={v}><b>{v}</b><strong>—</strong><small>Non disponible</small></div>)}</div></section></>}
    </fieldset>
    {tab==='Conception'&&<section className="tw-card ts-resources"><h2><FileText/>Ressources pour les apprenants</h2><Resources owner={'/formations/'+initial.id} canWrite note="Proposées dans toutes les sessions de cette formation. Ajout et retrait immédiats."/></section>}</div><aside>{tab==='Conception'&&<PreviewCard thumbnail={draft.thumbnail} modality={draft.modality??''} title={draft.title} description={draft.description??''} audience={audienceLabel} reference={reference} duration={durationLabel(minutes)} price={priceLabel(draft.price)}/>}<section className="tw-card"><h2>{tab==='Pilotage'?'Résumé':'Statut de la formation'}</h2><dl><div><dt>Statut</dt><dd>{status}</dd></div><div><dt>Sessions liées</dt><dd>{count??'—'}</dd></div><div><dt>Inscriptions actives</dt><dd>{enrolled??'—'}</dd></div></dl></section>
      <section className="tw-card ts-quick"><h2>Actions rapides</h2><button disabled={busy} onClick={()=>save.mutate('copy')}><Copy/>Dupliquer la formation</button><button onClick={print}><Printer/>Exporter la fiche (PDF)</button>{saved.publicationStatus!=='archived'&&<button disabled={busy} onClick={()=>save.mutate('archive')}><Archive/>Archiver la formation</button>}<Link to="/settings/formations">Retour aux formations</Link></section></aside></div>
    <dialog ref={preview} className="ts-preview"><h2>{draft.title}</h2>{draft.thumbnail&&<img src={draft.thumbnail} alt="Visuel de la formation"/>}<p>{selectedOrgs.map(o=>o.name).join(', ')} · {draft.modality}</p><dl>{Object.entries({'Public cible':audienceLabel,'Durée':durationLabel(draft.totalDurationMin??0),'Prix':priceLabel(draft.price),'Description':draft.description,'Orientation':draft.orientation,'Objectifs pédagogiques':draft.objectives,'Financements':draft.fundingTypes.join(', ')}).map(([k,v])=>v&&<div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><button onClick={()=>preview.current?.close()}>Fermer</button></dialog>
  </main>
}

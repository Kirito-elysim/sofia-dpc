import { Info, TriangleAlert, Eye, Video, SlidersHorizontal, Building2, Check } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api } from '../api'
import { ActivationStatusIcon } from '../components/ActivationIcons'
import { Badge, DataTable, EditAction, EmptyState, Filters, OrgBadges, RowActions, SearchField, SelectField } from '../components/list/List'
import ZoomPage from './ZoomPage'
import { confirmDiscard, useZoomDirectory, type Draft } from './zoomShared'

export const freshConfig: Draft = {name:'',hosts:[],organizations:[],archived:false,policy:{passcode:false,waitingRoom:true,joinBeforeHost:false,recording:'account_default'}}
const labels = {passcode:'Protection par code',waitingRoom:'Salle d’attente',joinBeforeHost:'Arrivée avant l’hôte'}
const toggle = (ids:number[], id:number) => ids.includes(id) ? ids.filter(value=>value!==id) : [...ids,id]
const yes = (value:boolean) => value?'Oui':'Non'
const recordings: Record<string,string> = {account_default:'Hérité du compte Zoom',none:'Désactivé',cloud:'Cloud Zoom'}

export default function VirtualClassConfigs({canWrite,intro,initialDraft,onClose}:{canWrite:boolean;intro?:ReactNode;initialDraft?:Draft;onClose?:()=>void}) {
  const client=useQueryClient()
  const directory=useZoomDirectory()
  const [draft,edit]=useState<Draft|null>(initialDraft??null)
  const [original,keep]=useState<Draft|null>(initialDraft??null)
  const close=()=>{edit(null);onClose?.()}
  const [search,setSearch]=useState('')
  const [status,setStatus]=useState('')
  const [org,setOrg]=useState('')
  const save=useMutation({
    mutationFn:(value:Draft)=>api('/virtual-class-configs',{method:'POST',body:JSON.stringify(value)}),
    onSuccess:async()=>{await client.invalidateQueries({queryKey:['virtual-class-configs']});close()},
  })
  const open=(value:Draft)=>{if(!confirmDiscard())return;save.reset();keep(value);edit(value)}
  const data=directory.data
  const moved=data?.organizations.filter(org=>draft?.organizations.includes(org.id)&&org.config!=null&&org.config!==draft.id)
  const policyIssue=draft && (!draft.policy.waitingRoom && !draft.policy.passcode
    ? 'Activez la protection par code lorsque la salle d’attente est désactivée.'
    : draft.policy.waitingRoom && draft.policy.joinBeforeHost
      ? 'Désactivez la salle d’attente pour autoriser l’arrivée avant l’hôte.' : '')
  const filtered=(data?.items??[]).filter(c=>c.name.toLowerCase().includes(search.toLowerCase())&&(!status||c.archived===(status==='inactive'))&&(!org||data!.organizations.some(o=>String(o.id)===org&&o.config===c.id)))
  const form=draft&&data&&<form className="zw-editor zoom-sheet zoom-config-sheet" data-dirty={JSON.stringify(draft)!==JSON.stringify(original)} onSubmit={event=>{
      event.preventDefault()
      if ((moved?.length||draft.archived&&draft.organizations.length) && !confirm('Confirmer la modification du rattachement des organismes ?')) return
      save.mutate(draft)
    }}>
      <header className="zoom-sheet-head"><Video/><div><h1>Configuration Zoom</h1><p>Définissez les réglages appliqués à la création des classes virtuelles.</p></div>
        <div className="zw-buttons"><button type="button" onClick={()=>{if(confirmDiscard())close()}}>Annuler</button><button className="zw-primary" disabled={save.isPending||!!policyIssue}><Check/>Enregistrer</button></div></header>
      <div className="zoom-sheet-body"><div className="zoom-sheet-fields">
      <section className="ls-panel"><h2><Info/>Informations générales</h2><label><span>Nom de la configuration <i>*</i></span><input autoFocus placeholder="Ex. Classe DPC standard" required maxLength={100} value={draft.name} onChange={e=>edit({...draft,name:e.target.value})}/></label><small>{draft.name.length} / 100</small></section>
      <section className="ls-panel zc-settings"><h2><SlidersHorizontal/>Réglages Zoom</h2><div className="zc-setting-grid"><div>
        {Object.entries(labels).map(([name,label])=>{
          const key=name as keyof typeof labels
          return <label className="zw-setting" key={key}>{label}<input className="zw-switch" type="checkbox" checked={draft.policy[key]} onChange={e=>edit({...draft,policy:{...draft.policy,[key]:e.target.checked}})}/></label>
        })}
      </div><aside className="zoom-callout"><strong><Info/>Règles de configuration</strong><ul><li>Sans salle d’attente, la protection par code est obligatoire.</li><li>La salle d’attente et l’arrivée avant l’hôte ne peuvent pas être activées ensemble.</li></ul></aside></div></section>
      {policyIssue&&<p role="status" className="zw-policy-issue">{policyIssue}</p>}
      <section className="ls-panel"><h2><Video/>Enregistrement automatique</h2>{[['account_default','Hérité du compte Zoom','Utilise le réglage du compte associé.'],['none','Désactivé','Aucun enregistrement.'],['cloud','Cloud Zoom','Enregistrement automatique dans le cloud Zoom.']].map(([value,label,hint])=><label className="zw-choice zc-recording" key={value}><input type="radio" name="recording" checked={draft.policy.recording===value} onChange={()=>edit({...draft,policy:{...draft.policy,recording:value}})}/><span><strong>{label}</strong><small>{hint}</small></span></label>)}</section>
      <fieldset className="zw-picker" disabled={draft.archived}><legend><Building2/>Organismes associés</legend><details><summary>{data.organizations.filter(item=>draft.organizations.includes(item.id)).map(item=><span className="zw-pill" key={item.id}>{item.name}</span>)}{!draft.organizations.length&&'Sélectionner…'}</summary><div>
        {data.organizations.map(org=><label className="zw-choice" key={org.id}><input className="w-auto!" type="checkbox" checked={draft.organizations.includes(org.id)} onChange={()=>edit({...draft,organizations:toggle(draft.organizations,org.id)})}/>{org.name}</label>)}
      </div></details><small>Sélectionnez les organismes qui utiliseront cette configuration.</small></fieldset>
      <fieldset className="zw-picker" disabled={draft.archived}><legend>Comptes hôtes</legend><details><summary>{data.hosts.filter(item=>draft.hosts.includes(item.id)).map(item=><span className="zw-pill" key={item.id}>{item.label}</span>)}{!draft.hosts.length&&'Sélectionner…'}</summary><div>
        {data.hosts.map(host=><label className="zw-choice" key={host.id}><input className="w-auto!" type="checkbox" checked={draft.hosts.includes(host.id)} disabled={!host.active&&!draft.hosts.includes(host.id)} onChange={()=>edit({...draft,hosts:toggle(draft.hosts,host.id)})}/>{host.label}{host.active?'':' · Inactif'}</label>)}
      </div></details></fieldset>
      {!!moved?.length&&!draft.archived&&<p>Organismes réaffectés · {moved.map(org=>org.name).join(', ')}</p>}
      {draft.id&&<label className="zw-choice"><input className="w-auto!" type="checkbox" checked={draft.archived} onChange={e=>edit({...draft,archived:e.target.checked})}/>Archiver cette configuration</label>}
      {save.error&&<p role="alert">{save.error.message}</p>}
      </div><aside className="ls-panel zoom-preview"><h2><Eye/>Aperçu de la configuration</h2>
        <h3>{draft.name.trim()||'Configuration sans nom'}</h3>
        <section><b><Building2/>Organismes</b><OrgBadges organizations={data.organizations.filter(o=>draft.organizations.includes(o.id))}/></section>
        <section><b><SlidersHorizontal/>Réglages Zoom</b><div>{Object.entries(labels).map(([key,label])=><p key={key}><Check/>{label} · {draft.policy[key as keyof typeof labels]?'Activé':'Désactivé'}</p>)}</div></section>
        <section><b><Video/>Enregistrement</b><p>{recordings[draft.policy.recording]}</p></section>
        <section className="zc-validity" data-valid={!!draft.name.trim()&&!!draft.hosts.length&&!draft.archived&&!policyIssue}><b>{draft.archived?'Configuration archivée':policyIssue?'Réglages à vérifier':draft.name.trim()&&draft.hosts.length?'Configuration valide':'Configuration à compléter'}</b><p>{draft.archived?'Cette configuration est archivée.':policyIssue||(!draft.name.trim()?'Renseignez le nom de la configuration.':!draft.hosts.length?'Sélectionnez un compte hôte.':'Ces réglages pourront être utilisés à la création des classes virtuelles.')}</p></section>
      </aside></div>
    </form>
  if(form) return initialDraft ? form : <ZoomPage intro={null}>{form}</ZoomPage>
  const attached=(id?:number)=>data?.organizations.filter(o=>o.config===id)??[]
  const edition=(config:Draft|NonNullable<typeof data>['items'][number])=>open({...config,organizations:attached(config.id).map(o=>o.id)})
  const orphans=data?.organizations.filter(o=>o.config===null)??[]
  const reset=()=>{setSearch('');setStatus('');setOrg('')}
  const add=canWrite?{label:'Ajouter une configuration',onClick:()=>open(freshConfig)}:undefined
  return <ZoomPage intro={intro} add={add}>
    <details className="zw-rule-help"><summary>Règles des classes virtuelles</summary><div className="zw-rules"><p><Info aria-hidden="true"/>Accès nominatif : un lien Zoom par PS et par créneau.</p>
      <p><TriangleAlert aria-hidden="true"/>Si la salle d’attente est désactivée, la protection par code est obligatoire.</p>
      <p><TriangleAlert aria-hidden="true"/>La salle d’attente et l’arrivée avant l’hôte ne peuvent pas être activées ensemble.</p>
      <p><TriangleAlert aria-hidden="true"/>Un organisme ne peut être rattaché qu’à une seule configuration.</p></div></details>
    {!!orphans.length&&<div className="zw-orphans"><span>Sans configuration :</span><OrgBadges organizations={orphans}/></div>}
    <Filters onReset={reset}>
      <SearchField label="Rechercher une configuration" value={search} onChange={setSearch}/>
      <SelectField label="Statut" icon="done" all="Tous les statuts" value={status} onChange={setStatus} options={[{value:'active',label:'Active'},{value:'inactive',label:'Archivée'}]}/>
      <SelectField label="Organisme" icon="building" all="Tous les organismes" value={org} onChange={setOrg} options={(data?.organizations??[]).map(o=>({value:String(o.id),label:o.name}))}/>
    </Filters>
    {directory.error&&<p role="alert">{directory.error.message}</p>}
    <div className="zw-layout">
      <DataTable title="Liste des configurations" rows={filtered} total={data?.items.length??0} loading={directory.isLoading} filterKey={[search,status,org].join('|')} rowKey={c=>c.id!} rowName={c=>c.name}
        columns={[
          {key:'name',label:'Configuration',sort:c=>c.name,render:c=><strong>{c.name}</strong>},
          {key:'organizations',label:'Organismes',render:c=><OrgBadges organizations={attached(c.id)}/>},
          {key:'hosts',label:'Comptes hôtes',render:c=>{const names=data?.hosts.filter(h=>c.hosts.includes(h.id)).map(h=>h.label).join(', ');return names?<span className="ls-clip" title={names}>{names}</span>:'—'}},
          {key:'policy',label:'Réglages résumés',render:c=><span className="zw-summary">Code : {yes(c.policy.passcode)} · Attente : {yes(c.policy.waitingRoom)} · Arrivée avant : {yes(c.policy.joinBeforeHost)}<small>Enregistrement : {recordings[c.policy.recording]}</small></span>},
          {key:'status',label:'Statut',sort:c=>String(c.archived),render:c=><Badge tone={c.archived?'grey':'green'}><ActivationStatusIcon active={!c.archived}/>{c.archived?'Archivée':'Active'}</Badge>},
        ]}
        actions={canWrite?c=><RowActions><EditAction aria-label={'Modifier '+c.name} onClick={()=>edition(c)}/></RowActions>:undefined}
        empty={data?.items.length?<EmptyState title="Aucun résultat pour ce filtre" action={{label:'Réinitialiser les filtres',onClick:reset}}/>:<EmptyState title="Aucune configuration" action={add}/>}/>
    </div>
  </ZoomPage>
}

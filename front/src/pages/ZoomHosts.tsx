import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Check, ClipboardList, ExternalLink, Eye, EyeOff, Home, Info, KeyRound, LockKeyhole, Mail, ShieldCheck, Video } from 'lucide-react'
import { api } from '../api'
import { ActiveBadge, DataTable, EditAction, EmptyState, Filters, OrgBadges, RowActions, SearchField, SelectField, ToggleAction } from '../components/list/List'
import ZoomPage from './ZoomPage'
import { confirmDiscard, useZoomDirectory } from './zoomShared'

export type Host = { id?: number; label: string; hostUserId: string; profile: string; active: boolean }
export const freshHost: Host = { label: '', hostUserId: '', profile: '', active: true }
const patch = (id:number, body:object) => api('/zoom-accounts/'+id, {method:'PATCH',headers:{'Content-Type':'application/merge-patch+json'},body:JSON.stringify(body)})

export default function ZoomHosts({intro,initialHost,onClose}:{intro?:ReactNode;initialHost?:Host;onClose?:()=>void}) {
  const client = useQueryClient()
  const list = useQuery({queryKey:['zoom-accounts'],enabled:!initialHost,queryFn:()=>api<Host[]>('/zoom-accounts')})
  const directory = useZoomDirectory()
  const [draft, edit] = useState<Host|null>(initialHost??null)
  const [original, keep] = useState<Host|null>(initialHost??null)
  const eligible=useQuery({queryKey:['zoom-oauth'],enabled:!!draft&&!draft.id,queryFn:()=>api<{organizations:{id:number;name:string}[]}>('/zoom-oauth')})
  const [showSecret,setShowSecret]=useState(false)
  const close = () => { setShowSecret(false);edit(null); onClose?.() }
  const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [org, setOrg] = useState('')
  const save = useMutation({
    gcTime:0,
    mutationFn:({host,fields}:{host:Host;fields:FormData})=>{
      const {id,label,hostUserId,profile,active}=host
      if(id) return patch(id,{label,hostUserId,profile,active})
      return api('/zoom-oauth/server-account',{method:'POST',body:JSON.stringify({
        label,hostUserId,active,accountId:fields.get('accountId'),clientId:fields.get('clientId'),
        clientSecret:fields.get('clientSecret'),organization:Number(fields.get('organization')),
      })})
    },
    onSuccess:async()=>{save.reset();await client.invalidateQueries(); close()}
  })
  const toggle = useMutation({
    mutationFn:(host:Host)=>patch(host.id!,{active:!host.active}),
    onSuccess:async(_,host)=>{
      // An open form on this host follows the new status, so saving it does not undo the change.
      edit(value=>value&&value.id===host.id?{...value,active:!host.active}:value)
      keep(value=>value&&value.id===host.id?{...value,active:!host.active}:value)
      await client.invalidateQueries()
    }
  })
  const organizations = directory.data?.organizations??[]
  const attached = (id?:number)=>organizations.filter(o=>directory.data?.items.some(c=>c.id===o.config && id!==undefined && c.hosts.includes(id)))
  const rows=(list.data??[]).filter(h=>(h.label+' '+h.hostUserId+' '+h.profile).toLowerCase().includes(search.toLowerCase()) &&
    (!status || h.active===(status==='active')) && (!org || attached(h.id).some(o=>String(o.id)===org)))
  const open=(value:Host)=>{if(!confirmDiscard())return;save.reset();keep(value);edit(value)}
  const reset=()=>{setSearch('');setStatus('');setOrg('')}
  const form=draft&&<form className={draft.id?"zw-editor zoom-sheet":"zw-editor zoom-sheet zoom-add-account"} data-dirty={JSON.stringify(draft)!==JSON.stringify(original)} onChange={e=>{e.currentTarget.dataset.dirty='true'}} onSubmit={e=>{e.preventDefault();save.mutate({host:draft,fields:new FormData(e.currentTarget)})}}>
    {!draft.id&&<p className="za-crumb"><Home aria-hidden="true"/> /　Paramètres　 /　Zoom　 /　Comptes Zoom　 /　<strong>Ajouter un compte</strong></p>}
    <header className="zoom-sheet-head"><Video/><div><h1>{draft.id?'Modifier':'Ajouter'} un compte Zoom</h1><p>Connectez un compte Zoom (hôte) qui sera utilisé pour la création des classes virtuelles.</p></div>
      <div className="zw-buttons"><button type="button" onClick={()=>{if(confirmDiscard())close()}}>Annuler</button><button className="zw-primary" disabled={save.isPending||(!draft.id&&!eligible.data?.organizations.length)}><Check aria-hidden="true"/>{draft.id?'Enregistrer':'Ajouter le compte'}</button></div></header>
    <div className="zoom-sheet-body"><div className="zoom-sheet-fields"><section className="ls-panel"><h2><Info/>Informations du compte Zoom</h2>
      {(['label','hostUserId','profile'] as const).filter(key=>draft.id||key!=='profile').map((key,i)=><label key={key}><span>{['Nom du compte','Adresse e-mail ou identifiant Zoom','Profil technique'][i]} <i>*</i></span><span className={key==='hostUserId'?'za-input with-icon':'za-input'}>{key==='hostUserId'&&<Mail/>}<input autoFocus={i===0} required placeholder={['Ex. Zoom SOFIA','Ex. formation@organisme.fr','Ex. ZOOM_2'][i]} maxLength={[100,180,50][i]} pattern={key==='profile'?'[A-Z0-9_]+':undefined} value={draft[key]} onChange={e=>edit({...draft,[key]:e.target.value})}/></span><small>{['Un nom interne pour retrouver facilement le compte.','Identifiant du compte hôte dans Zoom.','Nom du profil OAuth configuré sur le serveur Sofia.'][i]}</small></label>)}
      {!draft.id&&<>
        <label><span>Clé API (Client ID) <i>*</i></span><span className="za-input with-icon"><KeyRound/><input name="clientId" required maxLength={255} placeholder="Ex. 1234567890abcdef…" autoComplete="off"/></span></label>
        <div className="za-secret-row"><label htmlFor="zoom-new-secret"><span>Secret API (Client Secret) <i>*</i></span><span className="za-input with-icon za-secret"><LockKeyhole/><input id="zoom-new-secret" name="clientSecret" type={showSecret?'text':'password'} required maxLength={1024} placeholder="Ex. a1b2c3d4e5f6…" autoComplete="new-password"/></span></label>
        <button className="za-eye" type="button" aria-label={showSecret?'Masquer le secret':'Afficher le secret'} aria-pressed={showSecret} onClick={()=>setShowSecret(!showSecret)}>{showSecret?<EyeOff/>:<Eye/>}</button></div>
        <a className="za-help" href="https://marketplace.zoom.us/develop/apps" target="_blank" rel="noreferrer"><ExternalLink/>Retrouver mes identifiants dans Zoom Marketplace</a>
      </>}
    </section><section className="ls-panel"><h2><Building2/>{draft.id?'Organismes associés':'Organisme associé'}{!draft.id&&<i>*</i>}</h2>
      {draft.id ? <>{attached(draft.id).length?<OrgBadges organizations={attached(draft.id)}/>:<p>Aucun organisme associé.</p>}<small>Le rattachement se gère dans la configuration qui utilise ce compte hôte.</small></> :
        <fieldset><legend>Sélectionnez l’organisme pour lequel ce compte Zoom sera utilisé.</legend>
          {eligible.data?.organizations.map(o=><label key={o.id} className="zw-choice za-org"><input type="radio" name="organization" value={o.id} required/><OrgBadges organizations={[organizations.find(item=>item.id===o.id)??{...o,code:o.name,color:null}]}/><strong>{o.name}</strong></label>)}
          {eligible.isLoading&&<p>Chargement des organismes…</p>}
          {eligible.error&&<p role="alert">{eligible.error.message}</p>}
          {eligible.data?.organizations.length===0&&<p>Aucun organisme actif disponible.</p>}
        </fieldset>}
    </section>
    <section className="ls-panel"><h2><ShieldCheck/>Statut</h2><label className="zw-choice za-toggle"><input className="zw-switch" type="checkbox" checked={draft.active} onChange={e=>edit({...draft,active:e.target.checked})}/><span><strong>Compte actif</strong><small>Le compte sera disponible pour la création des classes virtuelles.</small></span></label></section>
    {save.error&&<p role="alert">{save.error.message}</p>}</div>
    <aside className="ls-panel zoom-preview"><h2><Video/>Informations importantes</h2>
      <section className="zoom-callout"><h3><Info/>Compte Zoom (hôte)</h3><p>Ce compte est autorisé à créer les réunions de vos classes virtuelles via l’API Zoom.</p><p>L’authentification utilise une application Server-to-Server OAuth.</p></section>
      <section><h3><ClipboardList/>Prérequis côté Zoom</h3><ol><li>Identifier le compte Zoom qui hébergera les réunions.</li><li>Ouvrir l’application Server-to-Server OAuth dans Zoom Marketplace.</li><li>Recopier les identifiants de la rubrique Account Credentials.</li></ol>
        {!draft.id&&<label><span>Account ID Zoom <i>*</i></span><input name="accountId" required maxLength={255} placeholder="Identifiant du compte OAuth" autoComplete="off"/></label>}</section>
      <section><h3><ShieldCheck/>Sécurité</h3><p>Les identifiants API sont chiffrés à l’enregistrement. Le Client Secret reste confidentiel.</p></section></aside></div>
  </form>
  if(form) return initialHost ? form : <ZoomPage intro={null}>{form}</ZoomPage>
  const error=list.error||directory.error||toggle.error
  return <ZoomPage intro={intro} add={{label:'Ajouter un compte hôte',onClick:()=>open(freshHost)}}>
    <Filters onReset={reset}>
      <SearchField label="Rechercher un compte hôte" value={search} onChange={setSearch}/>
      <SelectField label="Statut" icon="done" all="Tous les statuts" value={status} onChange={setStatus} options={[{value:'active',label:'Actif'},{value:'inactive',label:'Inactif'}]}/>
      <SelectField label="Organisme" icon="building" all="Tous les organismes" value={org} onChange={setOrg} options={organizations.map(o=>({value:String(o.id),label:o.name}))}/>
    </Filters>
    {error&&<p role="alert">{error.message}</p>}
    <div className="zw-layout">
      <DataTable title="Liste des comptes hôtes" rows={rows} total={list.data?.length??0} loading={list.isLoading} filterKey={[search,status,org].join('|')} rowKey={h=>h.id!} rowName={h=>h.label}
        columns={[
          {key:'label',label:'Nom du compte',sort:h=>h.label,render:h=><strong>{h.label}</strong>},
          {key:'hostUserId',label:'Identifiant hôte Zoom',sort:h=>h.hostUserId,render:h=><span className="ls-clip" title={h.hostUserId}>{h.hostUserId}</span>},
          {key:'profile',label:'Profil technique',sort:h=>h.profile,render:h=>h.profile},
          {key:'organizations',label:'Organismes',render:h=><OrgBadges organizations={attached(h.id)}/>},
          {key:'active',label:'Statut',sort:h=>String(h.active),render:h=><ActiveBadge active={h.active}/>},
        ]}
        actions={h=><RowActions>
          <EditAction aria-label={'Modifier '+h.label} onClick={()=>open(h)}/>
          <ToggleAction active={h.active} disabled={toggle.isPending} onClick={()=>toggle.mutate(h)}/>
        </RowActions>}
        empty={list.data?.length?<EmptyState title="Aucun résultat pour ce filtre" action={{label:'Réinitialiser les filtres',onClick:reset}}/>:<EmptyState title="Aucun compte hôte" action={{label:'Ajouter un compte hôte',onClick:()=>open(freshHost)}}/>}/>
    </div>
  </ZoomPage>
}

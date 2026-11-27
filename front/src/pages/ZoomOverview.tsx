import { Building2, Plus, Pencil, Video, SlidersHorizontal, Users, Tag, ShieldCheck, Check } from 'lucide-react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import ZoomHosts, { freshHost, type Host } from './ZoomHosts'
import VirtualClassConfigs, {freshConfig} from './VirtualClassConfigs'
import { Badge, OrgBadges } from '../components/list/List'
import { confirmDiscard, useZoomDirectory, type Config, type Draft } from './zoomShared'

export default function ZoomOverview({global,canWrite}:{global:boolean;canWrite:boolean}) {
  const [configDraft,setConfigDraft]=useState<Draft|null>(null)
  const [hostId,setHostId]=useState<number|null>(null)
  const [addingHost,setAddingHost]=useState(false)
  const accounts=useQuery({queryKey:['zoom-accounts'],enabled:global,queryFn:()=>api<Host[]>('/zoom-accounts')})
  const host=useQuery({
    queryKey:['zoom-account',hostId],enabled:global&&hostId!==null,
    queryFn:()=>api<Host>('/zoom-accounts/'+hostId),
  })
  const {data,isLoading,error}=useZoomDirectory()
  if(isLoading) return <p role="status">Chargement des configurations et des hôtes…</p>
  if(error) return <p role="alert">{error.message}</p>
  if(!data) return null
  if(canWrite&&configDraft) return <VirtualClassConfigs canWrite initialDraft={configDraft} onClose={()=>setConfigDraft(null)}/>
  if(global&&addingHost) return <ZoomHosts initialHost={freshHost} onClose={()=>setAddingHost(false)}/>
  if(global&&hostId!==null) {
    if(host.data) return <ZoomHosts initialHost={host.data} onClose={()=>setHostId(null)}/>
    return <div className="ls-panel">{host.error?<p role="alert">{host.error.message}</p>:<p role="status">Ouverture du compte hôte…</p>}<button onClick={()=>setHostId(null)}>Retour à la vue d’ensemble</button></div>
  }
  const available=data.hosts.filter(host=>host.active)
  const associated=data.organizations.filter(o=>o.config!=null)
  const organizationsFor=(id:number)=>data.organizations.filter(o=>data.items.some(c=>c.id===o.config&&c.hosts.includes(id)))
  const editConfig=(config:Config)=>{if(canWrite&&confirmDiscard())setConfigDraft({...config,organizations:data.organizations.filter(o=>o.config===config.id).map(o=>o.id)})}
  return <div className="zoom-dashboard">
    <section aria-label="Synthèse Zoom" className="zoom-metrics">
      <article><Video/><div><b>{available.length}</b>Comptes hôtes actifs</div></article>
      <article><SlidersHorizontal/><div><b>{data.items.filter(c=>!c.archived).length}</b>Configurations actives</div></article>
      <article><Building2/><div><b>{associated.length}</b>Organismes associés<OrgBadges organizations={associated}/></div></article>
    </section>
    <section className="ls-card"><header className="zd-heading"><Users/><div><h2>Comptes Zoom ({available.length})</h2><p>Vos comptes hôtes disponibles pour la création des classes virtuelles.</p></div>{global&&<button className="zw-primary" onClick={()=>setAddingHost(true)}><Plus/>Ajouter un compte Zoom</button>}</header>
      <div className="zoom-account-cards">{available.map(h=><article key={h.id}>
        <div className="zoom-account-id"><span>zoom</span><div>{global?<button className="zw-edit-name" onClick={()=>setHostId(h.id)}>{h.label}<Pencil aria-label="Modifier"/></button>:<strong>{h.label}</strong>}
        <small>{accounts.data?.find(a=>a.id===h.id)?.hostUserId}</small><Badge tone="green"><Check/>Actif</Badge></div></div>
        <footer><Tag/>Utilisé pour <OrgBadges organizations={organizationsFor(h.id)}/></footer>
      </article>)}</div>{!available.length&&<p>Aucun compte hôte actif.</p>}
    </section>
    <section className="ls-card"><header className="zd-heading"><SlidersHorizontal/><div><h2>Configurations ({data.items.length})</h2><p>Modèles de réglages Zoom réutilisables lors de la création des classes virtuelles.</p></div>{canWrite&&<button onClick={()=>setConfigDraft(freshConfig)}><Plus/>Créer une configuration</button>}</header>
      {data.items.length ? <div className="ls-scroll"><table className="ls-table"><thead><tr><th>Nom de la configuration</th><th>Organismes</th><th>Réglages Zoom</th><th>Statut</th>{canWrite&&<th>Actions</th>}</tr></thead><tbody>
        {data.items.map(config=><tr key={config.id}><td>{canWrite&&config.id ? <button type="button" className="zw-edit-name" onClick={()=>editConfig(config)}>{config.name}</button>:<strong>{config.name}</strong>}</td><td><OrgBadges organizations={data.organizations.filter(org=>org.config===config.id)}/></td><td className="zd-policy"><span><ShieldCheck/>Code : {config.policy.passcode?'activé':'désactivé'}</span><span><Users/>Salle d’attente : {config.policy.waitingRoom?'activée':'désactivée'}</span><span><Video/>Enregistrement : {config.policy.recording==='cloud'?'Cloud Zoom':config.policy.recording==='none'?'désactivé':'hérité du compte'}</span></td><td><Badge tone={config.archived?'grey':'green'}>{config.archived?'Archivée':'Active'}</Badge></td>{canWrite&&<td><button className="zd-edit" aria-label={'Modifier '+config.name} onClick={()=>editConfig(config)}><Pencil/></button></td>}</tr>)}
      </tbody></table></div>:<p>Aucune configuration pour le moment.</p>}
    </section>
  </div>
}

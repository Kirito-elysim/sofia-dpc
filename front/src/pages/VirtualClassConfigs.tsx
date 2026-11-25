import {Plus,Settings} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'

type Policy = { passcode: boolean; waitingRoom: boolean; joinBeforeHost: boolean; recording: string }
type Config = { id?: number; name: string; hosts: number[]; archived: boolean; policy: Policy }
type Draft = Config & { organizations: number[] }
type Directory = {items: Config[]; organizations: {id:number; name:string; config:number|null}[]; hosts:{id:number;label:string;active:boolean}[]}
const fresh: Draft = {name:'',hosts:[],organizations:[],archived:false,policy:{passcode:false,waitingRoom:true,joinBeforeHost:false,recording:'account_default'}}
const labels = {passcode:'Protection par code',waitingRoom:'Salle d’attente',joinBeforeHost:'Arrivée avant l’hôte'}
const toggle = (ids:number[], id:number) => ids.includes(id) ? ids.filter(value=>value!==id) : [...ids,id]

export default function VirtualClassConfigs() {
  const client=useQueryClient()
  const directory=useQuery({queryKey:['virtual-class-configs'],queryFn:()=>api<Directory>('/virtual-class-configs')})
  const [draft,edit]=useState<Draft|null>(null)
  const save=useMutation({
    mutationFn:(value:Draft)=>api('/virtual-class-configs',{method:'POST',body:JSON.stringify(value)}),
    onSuccess:async()=>{await client.invalidateQueries({queryKey:['virtual-class-configs']});edit(null)},
  })
  const open=(value:Draft)=>{save.reset();edit(value)}
  const data=directory.data
  const moved=data?.organizations.filter(org=>draft?.organizations.includes(org.id)&&org.config!=null&&org.config!==draft.id)
  return <section className="ad-work">
    <header><Settings/><div><h1>Configurations des classes virtuelles</h1><p>Réglages Zoom et comptes hôtes par organisme</p></div><button className="primary page-add" onClick={()=>open(fresh)}><Plus/>Nouvelle configuration</button></header>

    {directory.error&&<p role="alert">{directory.error.message}</p>}
    {directory.isLoading&&<p>Chargement…</p>}
    {data&&<div className="ad-table"><table><thead><tr><th>Configuration</th><th>Organismes</th><th>Statut</th><th>Actions</th></tr></thead>
      <tbody>{data.items.map(config=>{
        const organizations=data.organizations.filter(org=>org.config===config.id)
        return <tr key={config.id}><td>{config.name}</td><td>{organizations.map(org=>org.name).join(', ')||'—'}</td>
          <td>{config.archived?'Archivée':'Active'}</td><td><button onClick={()=>open({...config,organizations:organizations.map(org=>org.id)})}>Modifier</button></td></tr>
      })}</tbody></table></div>}
    {draft&&data&&<form className="ad-panel mt-4 grid gap-3" onSubmit={event=>{
      event.preventDefault()
      if ((moved?.length||draft.archived&&draft.organizations.length) && !confirm('Confirmer la modification du rattachement des organismes ?')) return
      save.mutate(draft)
    }}>
      <h2>{draft.id?'Modifier la configuration':'Nouvelle configuration'}</h2>
      <label>Nom<input required maxLength={100} value={draft.name} onChange={e=>edit({...draft,name:e.target.value})}/></label>
      <p>Accès nominatif · un lien Zoom par PS et par créneau.</p>
      <fieldset className="grid gap-1"><legend className="font-bold">Réglages Zoom</legend>
        {Object.entries(labels).map(([name,label])=>{
          const key=name as keyof typeof labels
          return <label className="flex! items-center gap-2" key={key}><input className="w-auto!" type="checkbox" checked={draft.policy[key]} onChange={e=>edit({...draft,policy:{...draft.policy,[key]:e.target.checked}})}/>{label}</label>
        })}
      </fieldset>
      <label>Enregistrement automatique<select value={draft.policy.recording} onChange={e=>edit({...draft,policy:{...draft.policy,recording:e.target.value}})}>
        <option value="account_default">Hérité du compte Zoom</option><option value="none">Désactivé</option><option value="cloud">Cloud Zoom</option>
      </select></label>
      <fieldset disabled={draft.archived} className="grid gap-1"><legend className="font-bold">Comptes hôtes</legend>
        {data.hosts.map(host=><label className="flex! items-center gap-2" key={host.id}><input className="w-auto!" type="checkbox" checked={draft.hosts.includes(host.id)} disabled={!host.active&&!draft.hosts.includes(host.id)} onChange={()=>edit({...draft,hosts:toggle(draft.hosts,host.id)})}/>{host.label}{host.active?'':' · Inactif'}</label>)}
      </fieldset>
      <fieldset disabled={draft.archived} className="grid gap-1"><legend className="font-bold">Organismes</legend>
        {data.organizations.map(org=><label className="flex! items-center gap-2" key={org.id}><input className="w-auto!" type="checkbox" checked={draft.organizations.includes(org.id)} onChange={()=>edit({...draft,organizations:toggle(draft.organizations,org.id)})}/>{org.name}</label>)}
      </fieldset>
      {!!moved?.length&&!draft.archived&&<p>Organismes réaffectés · {moved.map(org=>org.name).join(', ')}</p>}
      {draft.id&&<label className="flex! items-center gap-2"><input className="w-auto!" type="checkbox" checked={draft.archived} onChange={e=>edit({...draft,archived:e.target.checked})}/>Archiver cette configuration</label>}
      {save.error&&<p role="alert">{save.error.message}</p>}
      <div className="ad-toolbar"><button type="button" onClick={()=>edit(null)}>Annuler</button><button className="primary" disabled={save.isPending}>Enregistrer</button></div>
    </form>}
  </section>
}

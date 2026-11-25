import {Video} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'

type Status = {
  app: {clientId:string;redirectUri:string}|null
  connections: {id:number;accountId:string}[]
  organizations: {id:number;name:string}[]
}
type Page={hosts:{id:string;label:string;email:string|null}[];next:string}
const post=(path:string,body:unknown)=>api(path,{method:'POST',body:JSON.stringify(body)})

export default function ZoomConnector() {
  const [params]=useSearchParams()
  const client=useQueryClient()
  const status=useQuery({queryKey:['zoom-oauth'],queryFn:()=>api<Status>('/zoom-oauth')})
  const [connection,connect]=useState(0)
  const [page,showPage]=useState('')
  const [organization,chooseOrg]=useState(0)
  const [selected,select]=useState<string[]>([])
  const hosts=useQuery({queryKey:['zoom-oauth-hosts',connection,page],enabled:connection>0,
    queryFn:()=>api<Page>('/zoom-oauth/'+connection+'/hosts?'+new URLSearchParams({page}))})
  const app=useMutation({mutationFn:(body:unknown)=>post('/zoom-oauth/application',body),
    onSuccess:()=>client.invalidateQueries({queryKey:['zoom-oauth']})})
  const start=useMutation({mutationFn:()=>api<{url:string}>('/zoom-oauth/start',{method:'POST'}),
    onSuccess:response=>window.location.assign(response.url)})
  const attach=useMutation({mutationFn:()=>post('/zoom-oauth/'+connection+'/hosts',{hosts:selected,organization}),
    onSuccess:async()=>{select([]);await client.invalidateQueries()}})
  const issue=status.error??app.error??start.error??hosts.error??attach.error

  return <section className="ad-work">
    <header><Video/><div><h1>Connecteur Zoom</h1><p>Connectez un compte et affectez ses hôtes à un organisme.</p></div></header>
    {params.get('zoom')==='connected'&&<p role="status">Compte Zoom connecté.</p>}
    {params.get('zoom')==='error'&&<p role="alert">Connexion Zoom interrompue. Vérifiez l’autorisation et recommencez.</p>}
    {issue&&<p role="alert">{issue.message}</p>}
    {status.data&&!status.data.app&&<form className="ad-panel grid gap-3" onSubmit={event=>{
      event.preventDefault()
      app.mutate(Object.fromEntries(new FormData(event.currentTarget)))
    }}>
      <h2>Application OAuth Sofia</h2>
      <label>Client ID<input name="clientId" required/></label>
      <label>Client Secret<input name="clientSecret" type="password" autoComplete="new-password" required/></label>
      <label>URL de retour autorisée dans Zoom<input name="redirectUri" type="url" required defaultValue={window.location.origin+'/api/zoom-oauth/callback'}/></label>
      <label>Jeton de signature des webhooks<input name="webhookSecret" type="password" autoComplete="new-password"/></label>
      <div className="ad-toolbar"><button className="primary" disabled={app.isPending}>Enregistrer l’application</button></div>
    </form>}
    {status.data?.app&&<div className="ad-toolbar"><button className="primary" disabled={start.isPending} onClick={()=>start.mutate()}>Connecter un compte Zoom</button></div>}
    {!!status.data?.connections.length&&<div className="ad-panel grid gap-3">
      <label>Compte Zoom connecté<select value={connection} onChange={e=>{connect(+e.target.value);showPage('');select([]);attach.reset()}}>
        <option value={0}>Choisir un compte</option>{status.data.connections.map(account=><option key={account.id} value={account.id}>{account.accountId}</option>)}
      </select></label>
      {connection>0&&<>
        <label>Organisme<select value={organization} onChange={e=>{chooseOrg(+e.target.value);attach.reset()}}>
          <option value={0}>Choisir un organisme</option>{status.data.organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}
        </select></label>
        {hosts.isLoading&&<p>Chargement des hôtes…</p>}
        <fieldset className="grid gap-2"><legend>Hôtes actifs</legend>{hosts.data?.hosts.map(host=><label key={host.id} className="flex! items-center">
          <input className="w-auto!" type="checkbox" checked={selected.includes(host.id)} onChange={e=>{
            attach.reset()
            select(e.target.checked?[...selected,host.id]:selected.filter(id=>id!==host.id))
          }}/>{host.label} {host.email&&'· '+host.email}
        </label>)}</fieldset>
        {hosts.data?.hosts.length===0&&<p>Aucun hôte disponible.</p>}
        <div className="ad-toolbar">
          {page&&<button onClick={()=>showPage('')}>Première page</button>}
          {hosts.data?.next&&<button onClick={()=>showPage(hosts.data?.next??'')}>Page suivante</button>}
          <button className="primary" disabled={!selected.length||!organization||attach.isPending} onClick={()=>attach.mutate()}>Rattacher les hôtes ({selected.length})</button>
        </div>
        {attach.isSuccess&&<p role="status">Hôtes ajoutés au pool de l’organisme.</p>}
      </>}
    </div>}
  </section>
}

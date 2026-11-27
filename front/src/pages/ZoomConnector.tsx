import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { ListHeading } from '../components/list/List'

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

  return <div className="zoom-connection">
    {params.get('zoom')==='connected'&&<p role="status">Compte Zoom connecté.</p>}
    {params.get('zoom')==='error'&&<p role="alert">Connexion Zoom interrompue. Vérifiez l’autorisation et recommencez.</p>}
    {issue&&<p role="alert">{issue.message}</p>}
    {status.data&&!status.data.app&&<form className="ls-panel zw-fields" onChange={event=>{event.currentTarget.dataset.dirty='true'}} onSubmit={event=>{
      event.preventDefault()
      app.mutate(Object.fromEntries(new FormData(event.currentTarget)))
    }}>
      <h2>Application Zoom</h2>
      <label>Client ID<input name="clientId" required/></label>
      <label>Client Secret<input name="clientSecret" type="password" autoComplete="new-password" required/></label>
      <label>URL de retour autorisée dans Zoom<input name="redirectUri" type="url" required defaultValue={window.location.origin+'/api/zoom-oauth/callback'}/></label>
      <label>Jeton de signature des webhooks<input name="webhookSecret" type="password" autoComplete="new-password"/></label>
      <div className="zw-actions"><button className="zw-primary" disabled={app.isPending}>Enregistrer l’application</button></div>
    </form>}
    {status.data?.app&&<section className="ls-panel zw-fields">
      <h2>Application Zoom</h2>
      <label>Client ID<input readOnly value={status.data.app.clientId}/></label>
      <label>Client Secret<input readOnly value="••••••••••••" aria-label="Secret enregistré"/></label>
      <label>URL de retour HTTPS<input readOnly value={status.data.app.redirectUri}/></label>
    </section>}
    {status.data&&<section className="ls-card">
      <ListHeading title="Liste des comptes Zoom connectés" count={status.data.connections.length} tools={<div className="zw-actions">{status.data.app&&<span className="ls-badge green">Application configurée</span>}<button type="button" className="zw-primary" disabled={!status.data.app||start.isPending} onClick={()=>start.mutate()}>Connecter un compte Zoom</button></div>}/>
      {!status.data.app&&<p className="zw-hint">Enregistrez d’abord l’application Zoom pour pouvoir connecter un compte.</p>}
      <div className="ls-scroll"><table className="ls-table"><thead><tr><th>Compte Zoom</th><th>Statut</th></tr></thead><tbody>{status.data.connections.map(account=><tr key={account.id}><td>{account.accountId}</td><td><span className="ls-badge green">Compte connecté</span></td></tr>)}{!status.data.connections.length&&<tr><td colSpan={2}>Aucun compte connecté.</td></tr>}</tbody></table></div></section>}
    {status.data&&<section className="ls-card">
      <ListHeading title="Importer des hôtes"/>
      <div className="zw-import-fields">
      <label>Compte Zoom connecté<select value={connection} onChange={e=>{connect(+e.target.value);showPage('');select([]);attach.reset()}}>
        <option value={0}>Choisir un compte</option>{status.data.connections.map(account=><option key={account.id} value={account.id}>{account.accountId}</option>)}
      </select></label>
      
        <label>Organisme<select value={organization} onChange={e=>{chooseOrg(+e.target.value);attach.reset()}}>
          <option value={0}>Choisir un organisme</option>{status.data.organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}
        </select></label>
      </div>
        {hosts.isLoading&&<p>Chargement des hôtes…</p>}
        <div className="ls-scroll"><table className="ls-table"><thead><tr><th></th><th>Nom</th><th>E-mail</th></tr></thead><tbody>{hosts.data?.hosts.map(host=><tr key={host.id}><td><input aria-label={'Sélectionner '+host.label} type="checkbox" checked={selected.includes(host.id)} onChange={e=>{
          attach.reset()
          select(e.target.checked?[...selected,host.id]:selected.filter(id=>id!==host.id))
        }}/></td><td>{host.label}</td><td>{host.email??'—'}</td></tr>)}{!hosts.data?.hosts.length&&!hosts.isLoading&&<tr><td colSpan={3}>{connection?'Aucun hôte disponible.':'Sélectionnez un compte connecté.'}</td></tr>}</tbody></table></div>
        <div className="zw-actions zw-import-footer">
          {page&&<button type="button" onClick={()=>showPage('')}>Première page</button>}
          {hosts.data?.next&&<button type="button" onClick={()=>showPage(hosts.data?.next??'')}>Page suivante</button>}
          <button type="button" className="zw-primary" disabled={!selected.length||!organization||attach.isPending} onClick={()=>attach.mutate()}>Rattacher les hôtes ({selected.length})</button>
        </div>
        {attach.isSuccess&&<p role="status">Hôtes ajoutés au pool de l’organisme.</p>}
    </section>}
  </div>
}

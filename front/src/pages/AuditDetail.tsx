import {useQuery} from '@tanstack/react-query'
import {api} from '../api'
import {fields,readable} from './auditLabels'

type Detail={data:Record<string,unknown>;request:{method:string;path:string;status?:number;payload:unknown}|null}

export default function AuditDetail({id,action}:{id:number;action:string}){
  const {data:detail,error}=useQuery({queryKey:['audit-event',id],queryFn:()=>api<Detail>('/audit/'+id)})
  if(error)return <p role="alert">{error.message}</p>
  if(!detail)return <p role="status">Chargement du détail…</p>
  const changes=Object.entries(detail.data)
  // Changes are stored as [before, after] pairs; other events keep plain values.
  const compared=['UPDATE','DELETE','ARCHIVE'].includes(action)
  return <div className="audit-detail">
    <section><h3>{action==='DELETE'?'Contenu supprimé':compared?'Ce qui a changé':'Données enregistrées'}</h3>
      {changes.length?<table><thead><tr><th>Champ</th>{compared?<><th>Avant</th><th>Après</th></>:<th>Valeur</th>}</tr></thead>
        <tbody>{changes.map(([key,value])=>{const pair=compared&&Array.isArray(value)&&value.length===2
          return <tr key={key}><th scope="row">{fields[key]??key}</th>{pair?<><td>{readable(value[0])}</td><td>{readable(value[1])}</td></>:<td colSpan={compared?2:1}>{readable(value)}</td>}</tr>})}</tbody></table>
        :<p>Aucun détail de champ pour cet événement.</p>}</section>
    <section><h3>Données envoyées</h3>
      {detail.request?<><p><code>{detail.request.method} {detail.request.path}</code>{detail.request.status?' · réponse '+detail.request.status:''}</p>
        {detail.request.payload===null?<p>Aucune donnée envoyée.</p>:<pre tabIndex={0}>{JSON.stringify(detail.request.payload,null,2)}</pre>}</>
        :<p>Non enregistrées (événement antérieur au suivi des données, ou action automatique).</p>}</section>
  </div>
}

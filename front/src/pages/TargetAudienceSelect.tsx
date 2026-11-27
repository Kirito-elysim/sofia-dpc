import {useQuery} from '@tanstack/react-query'
import {api} from '../api'

/** The list itself is managed in Administration > Publics cibles. */
export function TargetAudienceSelect({value,onChange}:{value:string;onChange:(value:string)=>void}){
  const audiences=useQuery({queryKey:['target-audiences'],queryFn:()=>api<{id:number;name:string}[]>('/target-audiences')})
  return <div>
    <label>Public cible<select value={value} onChange={e=>onChange(e.target.value)}><option value="">Choisir un public cible</option>{audiences.data?.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    {audiences.error&&<p role="alert">{audiences.error.message}</p>}
  </div>
}

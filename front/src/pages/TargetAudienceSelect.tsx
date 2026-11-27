import {useTargetAudiences} from './useTargetAudiences'

/** The list itself is managed in Administration > Publics cibles. */
export function TargetAudienceSelect({value,onChange}:{value:string;onChange:(value:string)=>void}){
  const audiences=useTargetAudiences()
  return <div>
    <label>Public cible<select value={value} onChange={e=>onChange(e.target.value)}><option value="">Choisir un public cible</option>{audiences.data?.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    {audiences.error&&<p role="alert">{audiences.error.message}</p>}
  </div>
}

import {useQuery} from '@tanstack/react-query'
import {useState} from "react"

import {Link} from 'react-router-dom'
import {api, type Me} from '../api'

type Session = {classId:number; slotId:number|null; date:string; title:string; organization:string; startTime:string|null}

export default function ScopedDashboard({me}:{me:Me}) {
  const overview=useQuery({queryKey:['dashboard-overview'],queryFn:()=>api<{slots:Session[]}>('/dashboard-overview')})
  const [organization, setOrganization]=useState('')
  const slots=overview.data?.slots ?? []
  const organizations=[...new Set(slots.map(slot=>slot.organization))].sort()
  return <section className="ad-work">
    <h1>Bonjour {me.name.split(' ')[0]}</h1>
    <div className="ad-panel">
      <h2>Prochaines classes</h2>
      <label>Organisme<select value={organization} onChange={event=>setOrganization(event.target.value)}>
        <option value="">Tous mes organismes</option>
        {organizations.map(name=><option key={name}>{name}</option>)}
      </select></label>
      {overview.error&&<p role="alert">{overview.error.message}</p>}
      {overview.isLoading&&<p>Chargement…</p>}
      {overview.data&&<><ul>{slots.filter(slot=>!organization||slot.organization===organization).slice(0,10).map(slot=>
        <li key={slot.slotId??'class-'+slot.classId}>
          {new Date(slot.date).toLocaleDateString('fr-FR')} · {slot.organization} · {me.permissions?.includes('CLASSES')?<Link to={'/classes/'+slot.classId}>{slot.title}</Link>:slot.title}
        </li>)}</ul>{!slots.length&&<p>Aucune classe à venir.</p>}</>}
    </div>
  </section>
}

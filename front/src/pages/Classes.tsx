import {Video} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, type VirtualClass } from '../api'
import { OrganizationBadge, StatusBadge } from '../components/Badges'

export default function Classes() {
  const { data, isLoading } = useQuery({ queryKey: ['classes'], queryFn: () => api<VirtualClass[]>('/virtual-classes') })
  return (
    <>
      <header className="page-heading"><Video/><h1 className="mb-4 text-2xl font-bold">Classes virtuelles</h1></header>
      {isLoading && <p>Chargement…</p>}
      <ul className="flex flex-col gap-2">
        {data?.map((c) => (
          <li key={c.id}>
            <Link to={`/classes/${c.id}`} className="sofia-card flex items-center gap-4 px-4 py-3 hover:shadow">
              <span className="w-24 text-sm text-slate-500">{new Date(c.date).toLocaleDateString('fr-FR')}</span>
              <span className="flex-1 font-medium">{c.sessions?.length?c.sessions.map(s=>s.formation).join(' + '):c.formation.title}{!!c.sessions?.length&&<small className="block font-normal text-slate-500">{[...new Set(c.sessions.map(s=>s.session))].join(', ')}</small>}</span>
              <OrganizationBadge {...(c.organization??c.formation.organization)} />
              <span className="w-16 text-right text-sm">{c.enrolledCount} / {c.capacity}</span>
              <StatusBadge status={c.status} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

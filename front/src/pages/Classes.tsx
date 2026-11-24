import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, type VirtualClass } from '../api'
import { OrganizationBadge, StatusBadge } from '../components/Badges'

export default function Classes() {
  const { data, isLoading } = useQuery({ queryKey: ['classes'], queryFn: () => api<VirtualClass[]>('/virtual-classes') })
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Classes virtuelles</h1>
      {isLoading && <p>Chargement…</p>}
      <ul className="flex flex-col gap-2">
        {data?.map((c) => (
          <li key={c.id}>
            <Link to={`/classes/${c.id}`} className="flex items-center gap-4 rounded-xl bg-white px-4 py-3 shadow-sm hover:shadow">
              <span className="w-24 text-sm text-slate-500">{new Date(c.date).toLocaleDateString('fr-FR')}</span>
              <span className="flex-1 font-medium">{c.training.title}</span>
              <OrganizationBadge {...c.training.organization} />
              <span className="w-16 text-right text-sm">{c.enrolledCount} / {c.capacity}</span>
              <StatusBadge status={c.status} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

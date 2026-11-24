import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { OrganizationBadge } from '../components/Badges'

type Slot = { id: number; classId: number; date: string; training: string; organization: string; slot: string; startTime: string; endTime: string }

export default function MyClasses() {
  const { data, isLoading } = useQuery({ queryKey: ['my-classes'], queryFn: () => api<Slot[]>('/me/classes') })
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Mes classes virtuelles à venir</h1>
      {isLoading && <p className="text-slate-400">Chargement…</p>}
      {data?.length === 0 && <p className="rounded-xl bg-white p-4 text-slate-400 shadow-sm">Aucune classe à venir.</p>}
      <ul className="flex flex-col gap-2">
        {data?.map((s) => (
          <li key={s.id} className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm">
            <div className="w-28 text-sm font-medium">{new Date(s.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            <div className="w-36 text-sm text-slate-500">{s.slot} · {s.startTime}–{s.endTime}</div>
            <div className="flex-1">{s.training}</div>
            <OrganizationBadge code={s.organization} name={s.organization} />
          </li>
        ))}
      </ul>
    </div>
  )
}

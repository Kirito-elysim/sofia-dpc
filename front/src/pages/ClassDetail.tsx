import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { api, ApiError, type Enrollment, type VirtualClass } from '../api'
import { OrganizationBadge, StatusBadge } from '../components/Badges'

const input = 'rounded border border-slate-300 px-3 py-2 text-sm'

export default function ClassDetail({ canEdit }: { canEdit: boolean }) {
  const { id } = useParams()
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const cls = useQuery({ queryKey: ['classes', id], queryFn: () => api<VirtualClass>(`/virtual-classes/${id}`) })
  const list = useQuery({ queryKey: ['enrollments', id], queryFn: () => api<{ enrollments: Enrollment[] }>(`/virtual-classes/${id}/enrollments`) })
  const refresh = () => qc.invalidateQueries()

  const add = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) => api(`/virtual-classes/${id}/enrollments`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { setError(''); refresh() },
    onError: (e: ApiError) => setError(e.message),
  })
  const cancel = useMutation({ mutationFn: (eid: number) => api(`/enrollments/${eid}`, { method: 'DELETE' }), onSuccess: refresh })

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = Object.fromEntries(new FormData(form))
    // Empty optional fields must be null, not "" (server validates the format).
    add.mutate(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])) as never, { onSuccess: () => form.reset() })
  }

  if (!cls.data) return null
  const c = cls.data
  const active = list.data?.enrollments.filter((x) => x.status === 'ACTIVE') ?? []
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold">{c.training.title}</h1>
        <OrganizationBadge {...c.training.organization} />
        <StatusBadge status={c.status} />
        <span className="ml-auto text-sm">{active.length} / {c.capacity} inscrits</span>
      </div>

      {canEdit && c.status === 'PLANNED' && (
        <form onSubmit={submit} className="mb-6 grid grid-cols-5 gap-2 rounded-xl bg-white p-4 shadow-sm">
          <input name="firstName" required placeholder="Prénom" className={input} />
          <input name="lastName" required placeholder="Nom" className={input} />
          <input name="email" type="email" required placeholder="E-mail" className={input} />
          <input name="phone" placeholder="Téléphone" className={input} />
          <input name="rpps" placeholder="RPPS (11 chiffres)" pattern="[0-9]{11}" className={input} />
          <button disabled={add.isPending} className="col-span-5 rounded-lg bg-primary px-3 py-2 font-medium text-white disabled:opacity-50">Inscrire le PS (envoie un e-mail de confirmation)</button>
          {error && <p role="alert" className="col-span-5 text-sm text-cancelled">{error}</p>}
        </form>
      )}

      <table className="w-full rounded-xl bg-white text-left text-sm shadow-sm">
        <thead className="text-slate-500"><tr><th className="p-3">PS</th><th>E-mail</th><th>Téléphone</th><th>RPPS</th><th /></tr></thead>
        <tbody>
          {active.map((x) => (
            <tr key={x.id} className="border-t border-slate-100">
              <td className="p-3">{x.participant.firstName} {x.participant.lastName.toUpperCase()}</td>
              <td>{x.participant.email}</td><td>{x.participant.phone}</td><td>{x.participant.rpps}</td>
              <td className="pr-3 text-right">{canEdit && <button onClick={() => confirm('Annuler cette inscription ?') && cancel.mutate(x.id)} className="text-cancelled">Annuler</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

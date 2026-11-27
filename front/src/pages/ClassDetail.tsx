import {Video} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError, type Enrollment, type VirtualClass } from '../api'
import { OrganizationBadge, StatusBadge } from '../components/Badges'

type TeachingSlot = { id:number; label:string; start:string; end_time:string; trainer:string|null; state:string|null; policy?:{configId:number|null;requested:Record<string,boolean|string>;effective:Record<string,boolean|string|null>|null} | null }

type Registration={enrollment:number;slot:number;label:string;state:string;url:string|null}
const states:Record<string,string>={queued:'À synchroniser',processing:'Synchronisation en cours',approved:'Inscrit sur Zoom',pending:'En attente d’approbation',review:'À vérifier',denied:'Refusé',cancelled:'Annulé',revoked:'Révoqué'}
const policyLabels:Record<string,string>={passcode:'Code d’accès',waitingRoom:'Salle d’attente',joinBeforeHost:'Arrivée avant l’hôte',recording:'Enregistrement',registration:'Inscription nominative'}
const settingLabel=(value:boolean|string|null|undefined)=>value==null?'À confirmer':typeof value==='boolean'?(value?'Activé':'Désactivé'):({account_default:'Hérité du compte',none:'Désactivé',cloud:'Cloud',local:'Local'}[value]??value)
const input = 'rounded border border-slate-300 px-3 py-2 text-sm'

export default function ClassDetail({ canEdit }: { canEdit: boolean }) {
  const { id } = useParams()
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const cls = useQuery({ queryKey: ['classes', id], queryFn: () => api<VirtualClass>(`/virtual-classes/${id}`) })
  const list = useQuery({ queryKey: ['enrollments', id], refetchInterval:10000, queryFn: () => api<{ enrollments: Enrollment[]; teachingSlots: TeachingSlot[];zoomRegistrations:Registration[] }>(`/virtual-classes/${id}/enrollments`) })
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
      <div className="page-heading"><Video/>
        <h1 className="text-2xl font-bold">{c.formation.title}</h1>
        <OrganizationBadge {...(c.organization??c.formation.organization)} />
        <StatusBadge status={c.status} />
        <span className="ml-auto text-sm">{c.enrolledCount} / {c.capacity} places apprenants occupées</span>
      </div>

      {!!c.sessions?.length&&<section className="sofia-card mb-5 p-4"><h2 className="mb-2 text-lg font-semibold">Sessions réunies dans cette classe</h2>
        <p className="mb-2 text-sm text-slate-500">Les inscriptions se gèrent dans la session ; les PS inscrits rejoignent automatiquement cette classe.</p>
        <ul>{c.sessions.map(s=><li key={s.id}><Link className="font-medium text-primary" to={'/sessions/'+s.sessionId}>{s.session}</Link> · {s.formation}</li>)}</ul></section>}
      <section className="sofia-card mb-5 p-4">
        <h2 className="mb-2 text-lg font-semibold">Formateurs par créneau</h2>
        {list.isLoading && <p>Chargement des affectations…</p>}
        {list.error && <p role="alert">{list.error.message}</p>}
        {list.data?.teachingSlots.length === 0 && <p>Aucun créneau affecté.</p>}
        {list.data?.teachingSlots.map(slot=><div key={slot.id} className="mb-2"><p>{slot.label} · {slot.start}–{slot.end_time} · <strong>{slot.trainer ?? 'Formateur à affecter'}</strong></p>
          {slot.policy&&<details><summary>Réglages Zoom du créneau{slot.state==='review'?' · À vérifier':''}</summary>
            <table className="mt-2 w-full text-left"><thead><tr><th>Réglage</th><th>Demandé</th><th>Confirmé par Zoom</th><th>Écart</th></tr></thead>
              <tbody>{Object.entries<boolean|string>({...slot.policy.requested,registration:true}).map(([key,value])=>{
                const actual=slot.policy?.effective?.[key]
                return <tr key={key}><td>{policyLabels[key]}</td><td>{settingLabel(value)}</td><td>{settingLabel(actual)}</td><td>{actual!=null&&value!=='account_default'&&actual!==value?'Oui':'—'}</td></tr>
              })}</tbody></table>
          </details>}</div>)}
      </section>
      <h2 className="mb-3 text-lg font-semibold">Apprenants inscrits (PS)</h2>
      {canEdit && !c.sessions?.length && c.status === 'PLANNED' && (
        <form onSubmit={submit} className="sofia-card mb-6 grid grid-cols-5 gap-2 p-4">
          <input name="firstName" required placeholder="Prénom" className={input} />
          <input name="lastName" required placeholder="Nom" className={input} />
          <input name="email" type="email" required placeholder="E-mail" className={input} />
          <input name="phone" placeholder="Téléphone" className={input} />
          <input name="rpps" placeholder="RPPS (11 chiffres)" pattern="[0-9]{11}" className={input} />
          <button disabled={add.isPending} className="col-span-5 rounded-lg bg-primary px-3 py-2 font-medium text-white disabled:opacity-50">Inscrire un apprenant (envoie un e-mail de confirmation)</button>
          {error && <p role="alert" className="col-span-5 text-sm text-cancelled">{error}</p>}
        </form>
      )}

      <table className="sofia-card w-full text-left text-sm">
        <thead className="text-slate-500"><tr><th className="p-3">Apprenant</th><th>E-mail</th><th>Téléphone</th><th>RPPS</th><th>Inscription Zoom par créneau</th><th /></tr></thead>
        <tbody>
          {active.map((x) => (
            <tr key={x.id} className="border-t border-slate-100">
              <td className="p-3"><Link to={'/learners/'+x.participant.id}>{x.participant.firstName} {x.participant.lastName.toUpperCase()}</Link></td>
              <td>{x.participant.email}</td><td>{x.participant.phone}</td><td>{x.participant.rpps}</td><td>{list.data?.zoomRegistrations?.filter(r=>r.enrollment===x.id).map(r=><p key={r.slot}>{r.label} · {states[r.state]??r.state} {r.url&&<a className="text-blue-700 underline" href={r.url} target="_blank" rel="noreferrer">Lien personnel</a>}</p>)}</td>
              <td className="pr-3 text-right">{canEdit && !c.sessions?.length && <button onClick={() => confirm('Annuler cette inscription ?') && cancel.mutate(x.id)} className="text-cancelled">Annuler</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

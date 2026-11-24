import { fromRow, toPayload } from './crudValues'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { api, ApiError } from '../api'

type Row = Record<string, any> & { id: number }
type Option = { value: string; label: string }

export type Field = {
  name: string
  label: string
  type?: 'text' | 'email' | 'number' | 'time' | 'password' | 'checkbox' | 'select' | 'multi'
  required?: boolean
  pattern?: string
  hint?: string
  /** Static options, or a relation: options come from GET /api/<path>, value sent as IRI /api/<path>/<id>. */
  options?: Option[]
  relation?: { path: string; label: (r: Record<string, string>) => string }
  /** Shown in the table; default = every field except passwords. */
  show?: (r: Row) => string
  /** Only on creation (e.g. initial password). */
  createOnly?: boolean
  /** Computed by the API: shown in the table, absent from the form. */
  tableOnly?: boolean
  /** Not editable once created. */
  readOnlyOnEdit?: boolean
}

type Props = { renderList?: (rows: Row[], open: (row: Row | 'new') => void) => ReactNode; title: string; path: string; fields: Field[]; canWrite: boolean; canDelete?: boolean; empty?: string; defaults?: Record<string, unknown> }

const inputCls = 'w-full rounded border border-slate-300 px-3 py-2 text-sm'

function useOptions(f: Field): Option[] {
  const rel = useQuery({ queryKey: [f.relation?.path], queryFn: () => api<Row[]>(`/${f.relation!.path}`), enabled: !!f.relation })
  if (f.relation) return (rel.data ?? []).map((r) => ({ value: String(r.id), label: f.relation!.label(r) }))
  return f.options ?? []
}

export function FieldInput({ f, value, onChange, disabled }: { f: Field; value: unknown; onChange: (v: unknown) => void; disabled: boolean }) {
  const options = useOptions(f)
  const base = { id: f.name, name: f.name, required: f.required, disabled }
  if (f.type === 'checkbox') return <input {...base} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
  if (f.type === 'select')
    return (
      <select {...base} className={inputCls} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  if (f.type === 'multi')
    return (
      <select {...base} multiple className={`${inputCls} h-28`} value={(value as string[]) ?? []} onChange={(e) => onChange([...e.target.selectedOptions].map((o) => o.value))}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  return (
    <input {...base} className={inputCls} type={f.type ?? 'text'} pattern={f.pattern} value={String(value ?? '')} autoComplete="off"
      onChange={(e) => onChange(f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} />
  )
}

function cell(f: Field, r: Row): string {
  if (f.show) return f.show(r)
  const v = r[f.name]
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
  if (f.relation) return v ? f.relation.label(v) : ''
  if (f.type === 'select') return f.options?.find((o) => o.value === v)?.label ?? String(v ?? '')
  return String(v ?? '')
}

export default function CrudPage({ title, path, fields, canWrite, canDelete = true, renderList, empty = 'Aucun élément.', defaults = {} }: Props) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Row | 'new' | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [error, setError] = useState('')
  const list = useQuery({ queryKey: [path], queryFn: () => api<Row[]>(`/${path}`) })

  const open = (row: Row | 'new') => {
    setEditing(row)
    setError('')
    setValues(fromRow(fields, row === 'new' ? null : row, defaults))
  }
  const done = () => { setEditing(null); qc.invalidateQueries() }
  const onError = (e: Error) => setError(e instanceof ApiError ? e.message : 'Erreur inattendue.')

  const save = useMutation({
    mutationFn: () => {
      const creating = editing === 'new'
      const body = JSON.stringify(toPayload(fields, values, creating))
      return creating
        ? api(`/${path}`, { method: 'POST', body })
        : api(`/${path}/${(editing as Row).id}`, { method: 'PATCH', body, headers: { 'Content-Type': 'application/merge-patch+json' } })
    },
    onSuccess: done,
    onError,
  })
  const remove = useMutation({ mutationFn: (id: number) => api(`/${path}/${id}`, { method: 'DELETE' }), onSuccess: done, onError })

  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate() }
  const creating = editing === 'new'
  if (renderList && !editing) return <>{list.error && <p role="alert">{list.error.message}</p>}{renderList(list.data ?? [], open)}</>
  const shown = fields.filter((f) => f.type !== 'password' && !f.createOnly)

  return (
    <>
      <div className="mb-4 flex items-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        {canWrite && <button onClick={() => open('new')} className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">+ Ajouter</button>}
      </div>

      {editing && (
        <form onSubmit={submit} className="mb-6 grid grid-cols-2 gap-3 rounded-xl bg-white p-4 shadow-sm">
          {fields.filter((f) => !f.tableOnly && (creating || !f.createOnly)).map((f) => (
            <label key={f.name} htmlFor={f.name} className={`flex flex-col gap-1 text-sm ${f.type === 'checkbox' ? 'flex-row items-center gap-2' : ''}`}>
              <span className="text-slate-600">{f.label}{f.required && ' *'}</span>
              <FieldInput f={f} value={values[f.name]} disabled={!creating && !!f.readOnlyOnEdit} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
              {f.hint && <span className="text-xs text-slate-400">{f.hint}</span>}
            </label>
          ))}
          {fields.some((f) => f.createOnly) && !creating && <p className="col-span-2 text-xs text-slate-400">Mot de passe : champ visible à la création uniquement.</p>}
          {error && <p role="alert" className="col-span-2 text-sm text-cancelled">{error}</p>}
          <div className="col-span-2 flex gap-2">
            <button disabled={save.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Enregistrer</button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-4 py-2 text-sm">Annuler</button>
          </div>
        </form>
      )}

      {!editing && error && <p role="alert" className="mb-3 text-sm text-cancelled">{error}</p>}
      <table className="w-full rounded-xl bg-white text-left text-sm shadow-sm">
        <thead className="text-slate-500"><tr>{shown.map((f) => <th key={f.name} className="p-3">{f.label}</th>)}<th /></tr></thead>
        <tbody>
          {list.data?.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              {shown.map((f) => <td key={f.name} className="p-3">{cell(f, r)}</td>)}
              <td className="space-x-3 pr-3 text-right whitespace-nowrap">
                {canWrite && <button onClick={() => open(r)} className="text-primary">Modifier</button>}
                {canWrite && canDelete && <button onClick={() => confirm('Supprimer cet élément ?') && remove.mutate(r.id)} className="text-cancelled">Supprimer</button>}
              </td>
            </tr>
          ))}
          {list.data?.length === 0 && <tr><td colSpan={shown.length + 1} className="p-4 text-center text-slate-400">{empty}</td></tr>}
        </tbody>
      </table>
    </>
  )
}

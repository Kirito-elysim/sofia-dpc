import type { Field } from './CrudPage'

type Row = Record<string, any> & { id: number }

/** Form values <-> API payload. Relations travel as IRIs, empty optional strings as null. */
export function toPayload(fields: Field[], values: Record<string, unknown>, creating: boolean) {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    if (f.tableOnly) continue
    if ((f.createOnly && !creating) || (f.readOnlyOnEdit && !creating)) continue
    const v = values[f.name]
    if (f.type === 'checkbox') out[f.name] = !!v
    else if (f.type === 'multi') out[f.name] = ((v as string[]) ?? []).map((id) => `/api/${f.relation!.path}/${id}`)
    else if (f.relation) out[f.name] = v ? `/api/${f.relation.path}/${v}` : null
    else if (f.type === 'number') out[f.name] = v === '' || v == null ? null : v
    else if (f.createOnly && !v) continue
    else out[f.name] = v === '' || v == null ? null : v
  }
  return out
}

export function fromRow(fields: Field[], row: Row | null, defaults: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...defaults }
  if (!row) return out
  for (const f of fields) {
    const v = row[f.name]
    if (f.type === 'multi') out[f.name] = ((v as Row[]) ?? []).map((x) => String(x.id))
    else if (f.relation) out[f.name] = v?.id != null ? String(v.id) : ''
    else if (!f.createOnly) out[f.name] = v ?? ''
  }
  return out
}

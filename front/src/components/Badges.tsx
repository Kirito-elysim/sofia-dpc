import type { VirtualClass } from '../api'

const STATUS = {
  PLANNED: ['Planifiée', 'bg-blue-100 text-planned'],
  IN_PROGRESS: ['En cours', 'bg-amber-100 text-progress'],
  DONE: ['Terminée', 'bg-green-100 text-done'],
  CANCELLED: ['Annulée', 'bg-red-100 text-cancelled'],
} as const

export function StatusBadge({ status }: { status: VirtualClass['status'] }) {
  const [label, cls] = STATUS[status]
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

export function OrganizationBadge({ code, name }: { code: string; name: string }) {
  const cls = code === 'PHOCEA' ? 'bg-phocea text-white' : 'bg-sofia text-white'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{name}</span>
}

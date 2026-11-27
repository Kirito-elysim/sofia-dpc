export const publicationOptions = [
  {value: 'draft', label: 'Brouillon'},
  {value: 'published', label: 'Publiée'},
  {value: 'archived', label: 'Archivée'},
]

export function publicationLabel(status: string) {
  return publicationOptions.find(option => option.value === status)?.label ?? '—'
}

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** Reads RFC 7807 bodies ({code, detail}) and Symfony validation bodies ({violations}). */
export function toApiError(status: number, body: unknown): ApiError {
  const b = (body ?? {}) as { code?: string; detail?: string; violations?: { propertyPath: string; title: string }[] }
  if (b.violations?.length) {
    return new ApiError(status, 'VALIDATION', b.violations.map((v) => v.title).join(' '))
  }
  return new ApiError(status, b.code ?? 'ERROR', b.detail ?? `Erreur ${status}`)
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { Accept: 'application/json', ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => null)
  if (!res.ok) throw toApiError(res.status, body)
  return body as T
}

/** Full reload: nothing cached for one account may be shown to the other. */
export async function impersonate(userId: number | 'exit') {
  await api(`/auth/impersonate/${userId}`, { method: 'POST' })
  window.location.assign('/')
}

export type Me = { impersonator?: string | null; trainer?: boolean; permissions?: string[]; roleName?: string | null; profilePhoto?: string | null; mustChangePassword?: boolean; email: string; name: string; roles: string[] }
export type VirtualClass = {
  id: number
  date: string
  capacity: number
  status: 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
  enrolledCount: number
  training: { title: string; organization: { name: string; code: string } }
}
export type Enrollment = {
  id: number
  status: 'ACTIVE' | 'CANCELLED'
  participant: { id:number; firstName: string; lastName: string; email: string; phone: string | null; rpps: string | null }
}

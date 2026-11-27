import {useQuery} from '@tanstack/react-query'
import {api,type Me} from '../../api'

/** The « Supprimé » choice of a status filter: admins and super admins, loaded when chosen. */
export function useDeleted<Result>(path: string, status: string) {
  const me = useQuery({queryKey: ['me'], queryFn: () => api<Me>('/auth/me')})
  const allowed = !!me.data?.roles.includes('ROLE_ADMIN')
  const viewing = status === 'deleted'
  const list = useQuery({queryKey: [path, 'deleted'], queryFn: () => api<Result>(`/${path}?deleted=1`), enabled: viewing && allowed})
  return {viewing, data: list.data, loading: list.isLoading, error: list.error, options: allowed ? [{value: 'deleted', label: 'Supprimé'}] : []}
}

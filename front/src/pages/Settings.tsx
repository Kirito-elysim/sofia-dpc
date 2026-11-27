import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import {staffRoles as ROLES, useCustomRoles} from './userRoles'

import UserDirectory from './UserDirectory'
import Catalog from './Catalog'
export const Formations = ({ canWrite }: { canWrite: boolean }) => <Catalog title="Formations" path="formations" canWrite={canWrite} />
export const Trainers = ({ canWrite }: { canWrite: boolean }) => <Catalog title="Formateurs" path="trainers" canWrite={canWrite} />
// Users are deactivated, never deleted (audit trail).
export function Users() {
  const customRoles=useCustomRoles()
  const list=useQuery({queryKey:['users'],queryFn:()=>api<Parameters<typeof UserDirectory>[0]['rows']>('/users')})
  const roles=[...ROLES,...(customRoles.data?.roles.map(role=>({value:'custom:'+role.id,label:role.name}))??[])]
  return <>{list.error&&<p role="alert">{list.error.message}</p>}<UserDirectory rows={list.data??[]} roles={roles} loading={list.isLoading}/></>
}

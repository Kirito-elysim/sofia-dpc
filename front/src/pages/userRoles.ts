import {useQuery} from "@tanstack/react-query"
import {api} from "../api"

export const userRoles = [
  { value: 'ROLE_SUPER_ADMIN', label: 'Super admin' },
  { value: 'ROLE_ADMIN', label: 'Admin' },
  { value: 'ROLE_SUIVI', label: 'Suivi / Attestations' },
  { value: 'ROLE_LECTURE', label: 'Lecture' },
  { value: 'ROLE_FORMATEUR', label: 'Formateur' },
]

// Trainer access is created from the trainer sheet, never from the Users screen.
export const staffRoles = userRoles.filter(role => role.value !== 'ROLE_FORMATEUR')

export type CustomRole = {id:number; name:string; permissions:string[]; deletedAt?:string|null}

export function useCustomRoles() {
  return useQuery({
    queryKey: ['custom-roles'],
    queryFn: () => api<{roles:CustomRole[]; usage:Record<string,number>; permissions:Record<string,string>; dependencies:Record<string,string[]>}>('/custom-roles'),
  })
}

export function rolePayload(assignedRole: string) {
  return assignedRole.startsWith('custom:')
    ? {role:'ROLE_LECTURE', customRoleId:Number(assignedRole.slice(7))}
    : {role:assignedRole, customRoleId:0}
}

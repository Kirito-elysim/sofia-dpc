import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import {staffRoles as ROLES, useCustomRoles} from './userRoles'
import ZoomConnector from './ZoomConnector'
import CrudPage, { type Field } from '../components/CrudPage'

import UserDirectory from './UserDirectory'
import Catalog from './Catalog'

const orgLabel = (o: Record<string, string>) => o.name

const trainings: Field[] = [
  { name: 'organization', label: 'Organisme', type: 'select', required: true, relation: { path: 'organizations', label: orgLabel } },
  { name: 'theme', label: 'Thématique' },
  { name: 'title', label: 'Titre', required: true },
  { name: 'reference', label: 'Référence' },
  { name: 'totalDurationMin', label: 'Durée totale (min)', type: 'number' },
  { name: 'defaultCapacity', label: 'Capacité par défaut (PS)', type: 'number', required: true },
]





export const Trainings = ({ canWrite }: { canWrite: boolean }) => <Catalog title="Formations" path="trainings" fields={trainings} canWrite={canWrite} defaults={{ defaultCapacity: 20 }} />
export const Trainers = ({ canWrite }: { canWrite: boolean }) => <Catalog title="Formateurs" path="trainers" fields={[]} canWrite={canWrite} />
// Users are deactivated, never deleted (audit trail).
export function Users() {
  const customRoles=useCustomRoles()
  const list=useQuery({queryKey:['users'],queryFn:()=>api<Parameters<typeof UserDirectory>[0]['rows']>('/users')})
  const roles=[...ROLES,...(customRoles.data?.roles.map(role=>({value:'custom:'+role.id,label:role.name}))??[])]
  return <>{list.error&&<p role="alert">{list.error.message}</p>}<UserDirectory rows={list.data??[]} roles={roles}/></>
}

const zoomFields: Field[] = [
  {name:'label',label:'Nom du compte',required:true},
  {name:'hostUserId',label:'Identifiant Zoom de l’hôte',required:true},
  {name:'profile',label:'Profil OAuth serveur',hint:'Nom du profil configuré pour ce compte, par exemple ZOOM_2.',required:true,pattern:'[A-Z0-9_]{1,50}'},
  {name:'active',label:'Disponible pour les réservations',type:'checkbox'},
]
export const ZoomAccounts = () => <><ZoomConnector/><CrudPage title="Comptes Zoom" empty="Ajoutez un premier compte hôte Zoom pour réserver des créneaux." path="zoom-accounts" fields={zoomFields} canWrite canDelete={false} defaults={{active:true}}/></>

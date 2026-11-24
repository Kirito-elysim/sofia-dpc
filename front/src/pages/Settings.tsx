import ZoomConnector from './ZoomConnector'
import CrudPage, { type Field } from '../components/CrudPage'

import UserDirectory from './UserDirectory'
import Catalog from './Catalog'

const orgLabel = (o: Record<string, string>) => o.name
const trainingLabel = (t: Record<string, string>) => t.title

const trainings: Field[] = [
  { name: 'organization', label: 'Organisme', type: 'select', required: true, relation: { path: 'organizations', label: orgLabel } },
  { name: 'theme', label: 'Thématique' },
  { name: 'title', label: 'Titre', required: true },
  { name: 'reference', label: 'Référence' },
  { name: 'totalDurationMin', label: 'Durée totale (min)', type: 'number' },
  { name: 'defaultCapacity', label: 'Capacité par défaut (PS)', type: 'number', required: true },
]

const timeSlots: Field[] = [
  { name: 'label', label: 'Libellé', required: true },
  { name: 'startTime', label: 'Début', type: 'time', required: true },
  { name: 'endTime', label: 'Fin', type: 'time', required: true },
  { name: 'durationMin', label: 'Durée (min)', show: (r) => String(r.durationMin), tableOnly: true },
]

const trainers: Field[] = [
  { name: 'civility', label: 'Civilité', type: 'select', options: ['Dr','Pr','Mme','M.'].map(value=>({value,label:value})) },
  { name: 'organization', label: 'Organisme', type: 'select', relation: {path:'organizations',label:orgLabel} },
  { name: 'specialty', label: 'Spécialité' },
  { name: 'comments', label: 'Commentaires (optionnel)' },
  { name: 'lastName', label: 'Nom', required: true },
  { name: 'firstName', label: 'Prénom', required: true },
  { name: 'email', label: 'E-mail', type: 'email', required: true },
  { name: 'phone', label: 'Téléphone' },
  { name: 'trainings', label: 'Formations assurées', type: 'multi', relation: { path: 'trainings', label: trainingLabel }, show: (r) => (r.trainings as { title: string }[]).map((t) => t.title).join(', ') },
]

const ROLES = [
  { value: 'ROLE_SUPER_ADMIN', label: 'Super admin' },
  { value: 'ROLE_ADMIN', label: 'Admin' },
  { value: 'ROLE_SUIVI', label: 'Suivi / Attestations' },
  { value: 'ROLE_LECTURE', label: 'Lecture' },
  { value: 'ROLE_FORMATEUR', label: 'Formateur' },
]

const users: Field[] = [
  { name:'organization', label:'Organisme', type:'select', relation:{path:'organizations',label:orgLabel} },
  { name: 'name', label: 'Nom', required: true },
  { name: 'email', label: 'E-mail', type: 'email', required: true },
  { name: 'role', label: 'Rôle', type: 'select', required: true, options: ROLES },
  { name: 'trainer', label: 'Formateur lié', type: 'select', relation: { path: 'trainers', label: (t) => `${t.lastName} ${t.firstName}` }, hint: 'Obligatoire pour le rôle Formateur, interdit sinon', show: (r) => (r.trainer ? `${r.trainer.lastName} ${r.trainer.firstName}` : '—') },
  { name: 'plainPassword', label: 'Mot de passe', type: 'password', createOnly: true, required: true, hint: '12 caractères minimum' },
  { name: 'active', label: 'Actif', type: 'checkbox' },
]

export const Trainings = ({ canWrite }: { canWrite: boolean }) => <Catalog title="Formations" path="trainings" fields={trainings} canWrite={canWrite} defaults={{ defaultCapacity: 20 }} />
export const TimeSlots = ({ canWrite }: { canWrite: boolean }) => <CrudPage title="Créneaux" path="time-slots" fields={timeSlots} canWrite={canWrite} />
export const Trainers = ({ canWrite }: { canWrite: boolean }) => <Catalog title="Formateurs" path="trainers" fields={trainers} canWrite={canWrite} />
// Users are deactivated, never deleted (audit trail).
export const Users = () => <CrudPage title="Utilisateurs et rôles" path="users" renderList={(rows,open)=><UserDirectory rows={rows} open={open} roles={ROLES}/>} fields={users} canWrite canDelete={false} defaults={{ active: true, role: 'ROLE_LECTURE' }} />

const zoomFields: Field[] = [
  {name:'label',label:'Nom du compte',required:true},
  {name:'hostUserId',label:'Identifiant Zoom de l’hôte',required:true},
  {name:'profile',label:'Profil OAuth serveur',hint:'Nom du profil configuré pour ce compte, par exemple ZOOM_2.',required:true,pattern:'[A-Z0-9_]{1,50}'},
  {name:'active',label:'Disponible pour les réservations',type:'checkbox'},
]
export const ZoomAccounts = () => <><ZoomConnector/><CrudPage title="Comptes Zoom" empty="Ajoutez un premier compte hôte Zoom pour réserver des créneaux." path="zoom-accounts" fields={zoomFields} canWrite canDelete={false} defaults={{active:true}}/></>

import CrudPage, { type Field } from '../components/CrudPage'

const orgLabel = (o: Record<string, string>) => o.name
const trainingLabel = (t: Record<string, string>) => t.title

const organizations: Field[] = [
  { name: 'name', label: 'Raison sociale', required: true },
  { name: 'code', label: 'Code', required: true, pattern: '[A-Z0-9_]{2,20}', hint: 'Majuscules, ex. SOFIA, PHOCEA', readOnlyOnEdit: true },
  { name: 'emailFrom', label: "Adresse d'envoi des mails", type: 'email', required: true, hint: "Avec Gmail : l'adresse authentifiée ou un alias" },
  { name: 'smsSender', label: 'Expéditeur SMS', pattern: '[A-Za-z0-9]{1,11}', hint: '11 caractères max' },
  { name: 'siret', label: 'SIRET', pattern: '[0-9]{14}', hint: '14 chiffres' },
  { name: 'andpcNumber', label: 'N° ANDPC' },
  { name: 'active', label: 'Actif', type: 'checkbox' },
]

const trainings: Field[] = [
  { name: 'organization', label: 'Organisme', type: 'select', required: true, relation: { path: 'organizations', label: orgLabel } },
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
  { name: 'lastName', label: 'Nom', required: true },
  { name: 'firstName', label: 'Prénom', required: true },
  { name: 'email', label: 'E-mail', type: 'email', required: true },
  { name: 'phone', label: 'Téléphone' },
  { name: 'trainings', label: 'Formations assurées', type: 'multi', relation: { path: 'trainings', label: trainingLabel }, show: (r) => (r.trainings as { title: string }[]).map((t) => t.title).join(', ') },
]

const ROLES = [
  { value: 'ROLE_SUPER_ADMIN', label: 'Super admin' },
  { value: 'ROLE_ADMIN', label: 'Admin' },
  { value: 'ROLE_SUIVI', label: 'Suivi' },
  { value: 'ROLE_LECTURE', label: 'Lecture' },
]

const users: Field[] = [
  { name: 'name', label: 'Nom', required: true },
  { name: 'email', label: 'E-mail', type: 'email', required: true },
  { name: 'role', label: 'Rôle', type: 'select', required: true, options: ROLES },
  { name: 'plainPassword', label: 'Mot de passe', type: 'password', createOnly: true, required: true, hint: '12 caractères minimum' },
  { name: 'active', label: 'Actif', type: 'checkbox' },
]

export const Organizations = ({ canWrite }: { canWrite: boolean }) => <CrudPage title="Organismes" path="organizations" fields={organizations} canWrite={canWrite} defaults={{ active: true }} />
export const Trainings = ({ canWrite }: { canWrite: boolean }) => <CrudPage title="Formations" path="trainings" fields={trainings} canWrite={canWrite} defaults={{ defaultCapacity: 20 }} />
export const TimeSlots = ({ canWrite }: { canWrite: boolean }) => <CrudPage title="Créneaux" path="time-slots" fields={timeSlots} canWrite={canWrite} />
export const Trainers = ({ canWrite }: { canWrite: boolean }) => <CrudPage title="Formateurs" path="trainers" fields={trainers} canWrite={canWrite} />
// Users are deactivated, never deleted (audit trail).
export const Users = () => <CrudPage title="Utilisateurs et rôles" path="users" fields={users} canWrite canDelete={false} defaults={{ active: true, role: 'ROLE_LECTURE' }} />

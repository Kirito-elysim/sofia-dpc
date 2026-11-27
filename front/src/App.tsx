import { useQuery } from '@tanstack/react-query'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { api, type Me } from './api'
import FormationSheet from './pages/FormationSheet'
import FormationWizard from './pages/FormationWizard'
import RoleSettings from './pages/RoleSettings'
import ScopedDashboard from './pages/ScopedDashboard'
import Layout from './components/Layout'
import ClassDetail from './pages/ClassDetail'
import Dashboard from './pages/Dashboard'
import ScheduleClass from './pages/ScheduleClass'
import { Directory, LearnerSheet, LivePresence } from './pages/Operations'
import Audit from './pages/Audit'
import MessageTemplates from './pages/MessageTemplates'
import Planning from './pages/Planning'
import Classes from './pages/Classes'
import MyClasses from './pages/MyClasses'
import ChangePassword from './pages/ChangePassword'
import Login from './pages/Login'
import CreateUser, { EditUser } from './pages/CreateUser'
import CreateTrainer, { EditTrainer } from './pages/TrainerForm'
import ZoomWorkspace from './pages/ZoomWorkspace'
import OrganizationWizard from './pages/OrganizationWizard'
import OrganizationProfile from './pages/OrganizationProfile'
import Organizations from './pages/Organizations'
import TimeSlots from './pages/TimeSlots'
import { Trainers, Formations, Users } from './pages/Settings'
import TargetAudiences from './pages/TargetAudiences'
import Sessions from './pages/Sessions'
import SessionSheet from './pages/SessionSheet'
import Registrations from './pages/Registrations'
import LearnerPortal from './pages/LearnerPortal'

function LegacyFormationLink() {
  const location = useLocation()
  return <Navigate replace to={{ ...location, pathname: location.pathname.replace('/settings/trainings', '/settings/formations') }}/>
}

function LegacyZoomLink({ initial }: { initial: 'connection' | 'configs' }) {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  if (!params.has('step')) params.set('step', initial)
  return <Navigate replace to={{ pathname: '/settings/zoom', search: params.toString(), hash: location.hash }}/>
}

export default function App() {
  // The learner portal has its own sign-in: it never asks who the team member is.
  const portal = useLocation().pathname.startsWith('/espace')
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me'), enabled: !portal })
  if (portal) return <LearnerPortal />
  if (me.isLoading) return null
  if (!me.data) return <Login />
  if (me.data.mustChangePassword) return <ChangePassword />
  if (me.data.roles.includes('ROLE_FORMATEUR'))
    return (
      <Routes>
        <Route element={<Layout me={me.data} />}>
          <Route path="my-classes" element={<MyClasses />} />
          <Route path="*" element={<Navigate to="/my-classes" replace />} />
        </Route>
      </Routes>
    )
  const global = me.data.roles.includes('ROLE_SUPER_ADMIN')
  const can = (permission: string) => global || (me.data.permissions?.includes(permission) ?? false)
  const home = ([['DASHBOARD','/dashboard'],['PLANNING','/planning'],['CLASSES','/classes'],['LEARNERS','/learners'],
    ['LIVE','/live'],['FORMATIONS','/settings/formations'],['TRAINERS','/settings/trainers'],['TIME_SLOTS','/settings/time-slots'],
    ['ORGANIZATIONS','/settings/organizations'],['CONFIGS','/settings/zoom']] as const)
    .find(([permission]) => can(permission))?.[1] ?? (me.data.trainer ? '/my-classes' : undefined)
  return (
    <Routes>
      <Route element={<Layout me={me.data} />}>
        {me.data.trainer&&<Route path="my-classes" element={<MyClasses/>}/>}
        {can('DASHBOARD')&&<Route path="dashboard" element={global?<Dashboard me={me.data}/>:<ScopedDashboard me={me.data}/>}/>}
        {can('PLANNING')&&<Route path="planning" element={<Planning canSchedule={can('SCHEDULE')} canReadClasses={can('CLASSES')}/>}/>}
        {can('SCHEDULE')&&<Route path="classes/new" element={<ScheduleClass/>}/>}
        {can('LIVE')&&<Route path="live" element={<LivePresence canSend={can('REMIND')}/>}/>}
        {can('LEARNERS')&&<Route path="learners" element={<Directory key="learners"/>}/>}
        {can('LEARNERS')&&<Route path="learners/:id" element={<LearnerSheet canRemind={can('REMIND')}/>}/>}
        {can('CLASSES')&&<Route path="sessions" element={<Sessions canWrite={can('SCHEDULE')}/>}/>}
        {can('SCHEDULE')&&<Route path="sessions/new" element={<SessionSheet canWrite/>}/>}
        {can('LEARNERS')&&<Route path="sessions/:id/formations/:formationId" element={<Registrations canWrite={can('ENROLL')}/>}/>}
        {can('CLASSES')&&<Route path="sessions/:id" element={<SessionSheet canWrite={can('SCHEDULE')} canReadLearners={can('LEARNERS')}/>}/>}
        {can('CLASSES')&&<Route path="classes" element={<Classes/>}/>}
        {can('CLASSES')&&<Route path="classes/:id" element={<ClassDetail canEdit={can('ENROLL')}/>}/>}
        {can('CONFIGS')&&<Route path="settings/zoom" element={<ZoomWorkspace global={global} canWrite={can('EDIT_CONFIGS')}/>}/>}
        {can('CONFIGS')&&<Route path="settings/virtual-class-configs" element={<LegacyZoomLink initial="configs"/>}/>}
        {can('EDIT_ORGANIZATIONS')&&<Route path="settings/organizations/:id/edit" element={<OrganizationProfile/>}/>}
        {can('ORGANIZATIONS')&&<Route path="settings/organizations" element={<Organizations canWrite={can('EDIT_ORGANIZATIONS')} canCreate={global}/>}/>}
        {can('FORMATIONS')&&can('EDIT_FORMATIONS')&&<Route path="settings/formations/new" element={<FormationWizard/>}/>}
        {can('FORMATIONS')&&can('EDIT_FORMATIONS')&&<Route path="settings/formations/:id/edit" element={<FormationSheet canReadClasses={can('CLASSES')} canSchedule={can('SCHEDULE')}/>}/>}
        {can('FORMATIONS')&&can('EDIT_FORMATIONS')&&<Route path="settings/formations/:id/resume" element={<FormationWizard/>}/>}
        {can('FORMATIONS')&&<Route path="settings/formations" element={<Formations canWrite={can('EDIT_FORMATIONS')}/>}/>}
        {can('EDIT_FORMATIONS')&&<Route path="settings/target-audiences" element={<TargetAudiences/>}/>}
        <Route path="settings/trainings/*" element={<LegacyFormationLink/>}/>
        {can('TIME_SLOTS')&&<Route path="settings/time-slots" element={<TimeSlots canWrite={global}/>}/>}
        {can('EDIT_TRAINERS')&&<Route path="settings/trainers/new" element={<CreateTrainer/>}/>}
        {can('EDIT_TRAINERS')&&<Route path="settings/trainers/:id/edit" element={<EditTrainer/>}/>}
        {can('TRAINERS')&&<Route path="settings/trainers" element={<Trainers canWrite={can('EDIT_TRAINERS')}/>}/>}
        {global&&<>
          <Route path="audit" element={<Audit/>}/>
          <Route path="settings/message-templates" element={<MessageTemplates canWrite/>}/>
          <Route path="settings/organizations/new" element={<OrganizationWizard user={me.data.email}/>}/>
          <Route path="settings/users/new" element={<CreateUser/>}/>
          <Route path="settings/users/:id/edit" element={<EditUser/>}/>
          <Route path="settings/users" element={<Users/>}/>
          <Route path="settings/roles" element={<RoleSettings/>}/>
          <Route path="settings/zoom-accounts" element={<LegacyZoomLink initial="connection"/>}/>
        </>}
        <Route path="*" element={home?<Navigate to={home} replace/>:<p className="p-6">Aucune rubrique accessible avec votre rôle.</p>}/>
      </Route>
    </Routes>
  )
}

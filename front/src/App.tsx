import { useQuery } from '@tanstack/react-query'
import { Navigate, Route, Routes } from 'react-router-dom'
import { api, type Me } from './api'
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
import VirtualClassConfigs from './pages/VirtualClassConfigs'
import OrganizationWizard from './pages/OrganizationWizard'
import OrganizationProfile from './pages/OrganizationProfile'
import Organizations from './pages/Organizations'
import { TimeSlots, Trainers, Trainings, Users, ZoomAccounts } from './pages/Settings'

export default function App() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me') })
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
    ['LIVE','/live'],['TRAININGS','/settings/trainings'],['TRAINERS','/settings/trainers'],['TIME_SLOTS','/settings/time-slots'],
    ['ORGANIZATIONS','/settings/organizations'],['CONFIGS','/settings/virtual-class-configs']] as const)
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
        {can('CLASSES')&&<Route path="classes" element={<Classes/>}/>}
        {can('CLASSES')&&<Route path="classes/:id" element={<ClassDetail canEdit={can('ENROLL')}/>}/>}
        {can('CONFIGS')&&<Route path="settings/virtual-class-configs" element={<VirtualClassConfigs canWrite={can('EDIT_CONFIGS')}/>}/>}
        {can('EDIT_ORGANIZATIONS')&&<Route path="settings/organizations/:id/edit" element={<OrganizationProfile/>}/>}
        {can('ORGANIZATIONS')&&<Route path="settings/organizations" element={<Organizations canWrite={can('EDIT_ORGANIZATIONS')} canCreate={global}/>}/>}
        {can('TRAININGS')&&<Route path="settings/trainings" element={<Trainings canWrite={can('EDIT_TRAININGS')}/>}/>}
        {can('TIME_SLOTS')&&<Route path="settings/time-slots" element={<TimeSlots canWrite={global}/>}/>}
        {can('TRAINERS')&&<Route path="settings/trainers" element={<Trainers canWrite={can('EDIT_TRAINERS')}/>}/>}
        {global&&<>
          <Route path="audit" element={<Audit/>}/>
          <Route path="settings/message-templates" element={<MessageTemplates canWrite/>}/>
          <Route path="settings/organizations/new" element={<OrganizationWizard user={me.data.email}/>}/>
          <Route path="settings/users/new" element={<CreateUser/>}/>
          <Route path="settings/users/:id/edit" element={<EditUser/>}/>
          <Route path="settings/users" element={<Users/>}/>
          <Route path="settings/roles" element={<RoleSettings/>}/>
          <Route path="settings/zoom-accounts" element={<ZoomAccounts/>}/>
        </>}
        <Route path="*" element={home?<Navigate to={home} replace/>:<p className="p-6">Aucune rubrique accessible avec votre rôle.</p>}/>
      </Route>
    </Routes>
  )
}

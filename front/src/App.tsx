import { useQuery } from '@tanstack/react-query'
import { Navigate, Route, Routes } from 'react-router-dom'
import { api, type Me } from './api'
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
import Login from './pages/Login'
import VirtualClassConfigs from './pages/VirtualClassConfigs'
import OrganizationWizard from './pages/OrganizationWizard'
import OrganizationProfile from './pages/OrganizationProfile'
import Organizations from './pages/Organizations'
import { TimeSlots, Trainers, Trainings, Users, ZoomAccounts } from './pages/Settings'

export default function App() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me') })
  if (me.isLoading) return null
  if (!me.data) return <Login />
  if (me.data.roles.includes('ROLE_FORMATEUR'))
    return (
      <Routes>
        <Route element={<Layout me={me.data} />}>
          <Route path="my-classes" element={<MyClasses />} />
          <Route path="*" element={<Navigate to="/my-classes" replace />} />
        </Route>
      </Routes>
    )
  const isAdmin = me.data.roles.includes('ROLE_ADMIN')
  return (
    <Routes>
      <Route element={<Layout me={me.data} />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard me={me.data} />} />
        <Route path="planning" element={<Planning canSchedule={isAdmin}/>} />
        {isAdmin&&<Route path="classes/new" element={<ScheduleClass/>}/>}
        {me.data.roles.includes('ROLE_SUPER_ADMIN')&&<Route path="settings/zoom-accounts" element={<ZoomAccounts/>}/>}
        <Route path="live" element={<LivePresence canSend={me.data.roles.includes('ROLE_SUIVI')}/>}/>
        <Route path="learners" element={<Directory key="learners"/>}/>
        <Route path="learners/:id" element={<LearnerSheet canRemind={me.data.roles.includes('ROLE_SUIVI')}/>}/>
        {isAdmin&&<Route path="audit" element={<Audit/>}/>}
        <Route path="classes" element={<Classes />} />
        <Route path="classes/:id" element={<ClassDetail canEdit={me.data.roles.includes('ROLE_SUIVI')} />} />
        <Route path="settings/message-templates" element={<MessageTemplates canWrite={isAdmin}/>}/>
        {isAdmin&&<Route path="settings/virtual-class-configs" element={<VirtualClassConfigs/>}/>}
        {isAdmin&&<Route path="settings/organizations/new" element={<OrganizationWizard user={me.data.email}/>}/>}
        {isAdmin&&<Route path="settings/organizations/:id/edit" element={<OrganizationProfile/>}/>}
        <Route path="settings/organizations" element={<Organizations canWrite={isAdmin} />} />
        <Route path="settings/trainings" element={<Trainings canWrite={isAdmin} />} />
        <Route path="settings/time-slots" element={<TimeSlots canWrite={isAdmin} />} />
        <Route path="settings/trainers" element={<Trainers canWrite={isAdmin} />} />
        {me.data.roles.includes('ROLE_SUPER_ADMIN') && <Route path="settings/users" element={<Users />} />}
      </Route>
    </Routes>
  )
}

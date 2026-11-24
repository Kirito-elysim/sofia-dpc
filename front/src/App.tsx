import { useQuery } from '@tanstack/react-query'
import { Navigate, Route, Routes } from 'react-router-dom'
import { api, type Me } from './api'
import Layout from './components/Layout'
import ClassDetail from './pages/ClassDetail'
import Classes from './pages/Classes'
import MyClasses from './pages/MyClasses'
import Login from './pages/Login'
import { Organizations, TimeSlots, Trainers, Trainings, Users } from './pages/Settings'

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
        <Route index element={<Navigate to="/classes" replace />} />
        <Route path="classes" element={<Classes />} />
        <Route path="classes/:id" element={<ClassDetail canEdit={me.data.roles.includes('ROLE_SUIVI')} />} />
        <Route path="settings/organizations" element={<Organizations canWrite={isAdmin} />} />
        <Route path="settings/trainings" element={<Trainings canWrite={isAdmin} />} />
        <Route path="settings/time-slots" element={<TimeSlots canWrite={isAdmin} />} />
        <Route path="settings/trainers" element={<Trainers canWrite={isAdmin} />} />
        {me.data.roles.includes('ROLE_SUPER_ADMIN') && <Route path="settings/users" element={<Users />} />}
      </Route>
    </Routes>
  )
}

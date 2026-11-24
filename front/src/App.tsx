import { useQuery } from '@tanstack/react-query'
import { Navigate, Route, Routes } from 'react-router-dom'
import { api, type Me } from './api'
import Layout from './components/Layout'
import ClassDetail from './pages/ClassDetail'
import Classes from './pages/Classes'
import Login from './pages/Login'

export default function App() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me') })
  if (me.isLoading) return null
  if (!me.data) return <Login />
  return (
    <Routes>
      <Route element={<Layout me={me.data} />}>
        <Route index element={<Navigate to="/classes" replace />} />
        <Route path="classes" element={<Classes />} />
        <Route path="classes/:id" element={<ClassDetail canEdit={me.data.roles.includes('ROLE_SUIVI')} />} />
      </Route>
    </Routes>
  )
}

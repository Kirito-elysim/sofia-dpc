import { useQueryClient } from '@tanstack/react-query'
import { CalendarDays, LogOut, Monitor, Settings } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { api, type Me } from '../api'

// Phase 2 entries are visible but disabled (see CLAUDE.md).
const SETTINGS = [
  ['organizations', 'Organismes'],
  ['trainings', 'Formations'],
  ['time-slots', 'Créneaux'],
  ['trainers', 'Formateurs'],
] as const
const SOON = ['Analytique', 'Facturation', 'Documents DPC']

export default function Layout({ me }: { me: Me }) {
  const qc = useQueryClient()
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    qc.setQueryData(['me'], null)
  }
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-sidebar p-4 text-white">
        <div className="mb-6 text-xl font-bold">SOFIA</div>
        <nav className="flex flex-col gap-1 text-sm">
          <NavLink to="/classes" className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 ${isActive ? 'bg-primary' : 'hover:bg-white/10'}`}>
            <Monitor size={16} /> Classes
          </NavLink>
          <div className="mt-4 flex items-center gap-2 px-3 py-1 text-xs uppercase tracking-wide text-white/60"><Settings size={14} /> Paramétrage</div>
          {[...SETTINGS, ...(me.roles.includes('ROLE_SUPER_ADMIN') ? ([['users', 'Utilisateurs et rôles']] as const) : [])].map(([to, label]) => (
            <NavLink key={to} to={`/settings/${to}`} className={({ isActive }) => `rounded-lg px-3 py-2 pl-8 ${isActive ? 'bg-primary' : 'hover:bg-white/10'}`}>{label}</NavLink>
          ))}
          <div className="mt-4" />
          {SOON.map((l) => (
            <span key={l} aria-disabled className="flex items-center justify-between px-3 py-2 opacity-50">
              {l}
              <span className="rounded bg-white/20 px-1.5 text-[10px]">Bientôt</span>
            </span>
          ))}
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-end gap-4 border-b border-slate-200 bg-white px-6 py-3 text-sm">
          <CalendarDays size={16} className="mr-auto text-slate-400" />
          <span>
            <strong>{me.name}</strong> <span className="text-slate-500">{me.roles.find((r) => r !== 'ROLE_USER')?.replace('ROLE_', '')}</span>
          </span>
          <button onClick={logout} aria-label="Déconnexion" className="text-slate-500 hover:text-ink">
            <LogOut size={16} />
          </button>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

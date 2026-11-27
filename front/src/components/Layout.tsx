import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Activity, Bell, Building2, CalendarDays, CalendarRange, ChevronDown, ChevronLeft, ClipboardList, Clock, GraduationCap, House, CircleHelp, LogOut, Mail, Monitor, ShieldCheck, UserCog, UserRound, UsersRound, Users, Video, type LucideIcon } from 'lucide-react'
import { NavLink, Outlet, useMatch } from 'react-router-dom'
import { api, impersonate, type Me } from '../api'
import '../planning.css'
import './navigation.css'

type Entry = [LucideIcon, string, string, string]
const main: Entry[] = [
  [House,'Tableau de bord','/dashboard','DASHBOARD'], [CalendarDays,'Planning','/planning','PLANNING'],
  [CalendarRange,'Sessions','/sessions','CLASSES'], [Monitor,'Classes','/classes','CLASSES'], [UsersRound,'Participants (PS)','/learners','LEARNERS'],
  [Activity,'Suivi en direct','/live','LIVE'],
]
const settings: Entry[] = [
  [GraduationCap,'Formations','/settings/formations','FORMATIONS'], [Clock,'Créneaux','/settings/time-slots','TIME_SLOTS'],
  [UserRound,'Formateurs','/settings/trainers','TRAINERS'], [Mail,'Modèles de messages','/settings/message-templates','GLOBAL'],
]
const administration: Entry[] = [
  [Building2,'Organismes','/settings/organizations','ORGANIZATIONS'],
  [UserCog,'Utilisateurs','/settings/users','GLOBAL'], [ShieldCheck,'Rôles et permissions','/settings/roles','GLOBAL'],
  [Video,'Paramètres Zoom','/settings/zoom','CONFIGS'], [Users,'Publics cibles','/settings/target-audiences','EDIT_FORMATIONS'],
]

function navigation([Icon,label,to]: Entry) {
  // The label stays in the page when the menu is folded: it names the icon for screen readers and as a tooltip.
  const content = <><Icon className="nav-picto" aria-hidden="true"/><span className="nav-label">{label}</span></>
  return to ? <NavLink key={label} to={to} title={label}>{content}</NavLink> : <span key={label} aria-disabled="true" title={label}>{content}</span>
}

export default function Layout({me}: {me: Me}) {
  const orgPage = useMatch("/settings/organizations")
  const settingsPage = useMatch("/settings/:section")
  const heading = settingsPage?.params.section === "message-templates" ? "Modèles de messages" : settingsPage?.params.section === "users" ? "Utilisateurs" : orgPage ? "Organismes" : settingsPage?.params.section === "formations" ? "Formations" : settingsPage?.params.section === "trainers" ? "Formateurs" : null
  const planning = useMatch("/planning")
  const dashboard = useMatch("/dashboard")
  const [organization, setOrganization] = useState("Tous")
  const qc = useQueryClient()
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', {method:'POST'}),
    onSuccess: async () => {
      await qc.cancelQueries()
      qc.setQueryData(['me'], null)
      qc.removeQueries({predicate: query => query.queryKey[0] !== 'me'})
    },
  })
  const leave = useMutation({mutationFn: () => impersonate('exit')})
  const sidebarKey = 'sofia.sidebar.'+me.email
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(sidebarKey) === 'collapsed' } catch { return false } })
  const toggleSidebar = () => { setCollapsed(!collapsed); try { localStorage.setItem(sidebarKey, collapsed ? 'expanded' : 'collapsed') } catch { /* private browsing: not remembered */ } }
  const trainer = me.roles.includes('ROLE_FORMATEUR')
  const global = me.roles.includes('ROLE_SUPER_ADMIN')
  const allowed = ([,,,permission]: Entry) => global || (me.permissions?.includes(permission) ?? false)
  const visibleSettings = settings.filter(allowed)
  const visibleAdmin = administration.filter(allowed)
  const role = me.roleName ?? me.roles.find(r => r !== 'ROLE_USER')?.replace('ROLE_', '').replaceAll('_',' ').toLowerCase()
  return <div className={dashboard ? "sofia-shell dashboard-shell" : heading ? "sofia-shell organizations-shell" : planning ? "sofia-shell planning-shell" : "sofia-shell"}><aside className={collapsed ? "sofia-side collapsed" : "sofia-side"}>
    <button type="button" className="sidebar-collapse" onClick={toggleSidebar} aria-expanded={!collapsed} aria-label={collapsed ? 'Développer la navigation' : 'Rétracter la navigation'} title={collapsed ? 'Développer la navigation' : 'Rétracter la navigation'}><ChevronLeft aria-hidden="true"/></button>
    <img className="brand" src="/catalog/sofia-navigation-logo.png" width={2172} height={724} alt="SOFIA – Classes virtuelles DPC"/>
    <nav>{trainer ? navigation([Monitor,'Mes classes','/my-classes','']) : <>
      {main.filter(allowed).map(navigation)}
      {me.trainer&&navigation([Monitor,'Mes classes','/my-classes',''])}
      {visibleSettings.length>0&&<details key={"settings-"+collapsed} open><summary tabIndex={collapsed?-1:undefined}>Paramétrage <ChevronDown aria-hidden="true"/></summary>{visibleSettings.map(navigation)}</details>}
      {visibleAdmin.length>0&&<details key={"admin-"+collapsed} open><summary tabIndex={collapsed?-1:undefined}>Administration <ChevronDown aria-hidden="true"/></summary>{visibleAdmin.map(navigation)}</details>}
      {global&&navigation([ClipboardList,'Journal d’audit','/audit','GLOBAL'])}
    </>}</nav></aside><div className="sofia-body"><header className="sofia-top"><span className="top-icon"><CircleHelp aria-hidden="true"/></span><span className="top-icon"><Bell aria-hidden="true"/></span><i/><details><summary aria-label={'Menu du compte de '+me.name}><b>{me.profilePhoto?<img src={me.profilePhoto} alt=""/>:me.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</b><span className="top-identity"><strong>{me.name}</strong><small>{role}</small></span><ChevronDown aria-hidden="true"/></summary><div className="sofia-account-actions">
      <button type="button" disabled={logout.isPending} onClick={()=>logout.mutate()}>
        <LogOut aria-hidden="true"/>{logout.isPending?'Déconnexion…':'Déconnexion'}
      </button>
      {logout.isError&&<p role="alert">La déconnexion a échoué. Réessaie.</p>}
    </div></details></header><main className="sofia-main">{me.impersonator&&<div className="impersonation" role="status"><span>Vous êtes connecté en tant que <strong>{me.name}</strong>.</span><button type="button" disabled={leave.isPending} onClick={()=>leave.mutate()}>Revenir à mon compte ({me.impersonator})</button>{leave.error&&<span role="alert">{leave.error.message}</span>}</div>}<Outlet context={{organization,setOrganization}}/></main></div></div>
}

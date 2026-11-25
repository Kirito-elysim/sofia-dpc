import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Activity, Bell, Building2, CalendarDays, ChevronDown, ClipboardList, Clock, GraduationCap, House, CircleHelp, LogOut, Mail, Monitor, Settings, ShieldCheck, SlidersHorizontal, UserCog, UserRound, UsersRound, Video, type LucideIcon } from 'lucide-react'
import { NavLink, Outlet, useMatch } from 'react-router-dom'
import { api, impersonate, type Me } from '../api'
import '../planning.css'
import './navigation.css'

type Entry = [LucideIcon, string, string, string]
const main: Entry[] = [
  [House,'Tableau de bord','/dashboard','DASHBOARD'], [CalendarDays,'Planning','/planning','PLANNING'],
  [Monitor,'Classes','/classes','CLASSES'], [UsersRound,'Participants (PS)','/learners','LEARNERS'],
  [Activity,'Suivi en direct','/live','LIVE'],
]
const settings: Entry[] = [
  [GraduationCap,'Formations','/settings/trainings','TRAININGS'], [Clock,'Créneaux','/settings/time-slots','TIME_SLOTS'],
  [UserRound,'Formateurs','/settings/trainers','TRAINERS'], [Mail,'Modèles de messages','/settings/message-templates','GLOBAL'],
]
const administration: Entry[] = [
  [Building2,'Organismes','/settings/organizations','ORGANIZATIONS'],
  [UserCog,'Utilisateurs','/settings/users','GLOBAL'], [ShieldCheck,'Rôles et permissions','/settings/roles','GLOBAL'],
  [SlidersHorizontal,'Configurations des classes virtuelles','/settings/virtual-class-configs','CONFIGS'],
  [Video,'Comptes Zoom','/settings/zoom-accounts','GLOBAL'],
]

function navigation([Icon,label,to]: Entry) {
  const content = <><Icon className="nav-picto" aria-hidden="true"/>{label}</>
  return to ? <NavLink key={label} to={to}>{content}</NavLink> : <span key={label} aria-disabled="true">{content}</span>
}

export default function Layout({me}: {me: Me}) {
  const orgPage = useMatch("/settings/organizations")
  const settingsPage = useMatch("/settings/:section")
  const heading = settingsPage?.params.section === "message-templates" ? "Modèles de messages" : settingsPage?.params.section === "users" ? "Utilisateurs" : orgPage ? "Organismes" : settingsPage?.params.section === "trainings" ? "Formations" : settingsPage?.params.section === "trainers" ? "Formateurs" : null
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
  const trainer = me.roles.includes('ROLE_FORMATEUR')
  const global = me.roles.includes('ROLE_SUPER_ADMIN')
  const allowed = ([,,,permission]: Entry) => global || (me.permissions?.includes(permission) ?? false)
  const visibleSettings = settings.filter(allowed)
  const visibleAdmin = administration.filter(allowed)
  const role = me.roleName ?? me.roles.find(r => r !== 'ROLE_USER')?.replace('ROLE_', '').replaceAll('_',' ').toLowerCase()
  return <div className={dashboard ? "sofia-shell dashboard-shell" : heading ? "sofia-shell organizations-shell" : planning ? "sofia-shell planning-shell" : "sofia-shell"}><aside className="sofia-side">
    <img className="brand" src="/catalog/sofia-navigation-logo.png" width={2172} height={724} alt="SOFIA – Classes virtuelles DPC"/>
    <nav>{trainer ? navigation([Monitor,'Mes classes','/my-classes','']) : <>
      {main.filter(allowed).map(navigation)}
      {me.trainer&&navigation([Monitor,'Mes classes','/my-classes',''])}
      {visibleSettings.length>0&&<details open><summary><Settings/>Paramétrage <ChevronDown/></summary>{visibleSettings.map(navigation)}</details>}
      {visibleAdmin.length>0&&<details open><summary><ShieldCheck/>Administration <ChevronDown/></summary>{visibleAdmin.map(navigation)}</details>}
      {global&&navigation([ClipboardList,'Journal d’audit','/audit','GLOBAL'])}
    </>}</nav></aside><div className="sofia-body"><header className="sofia-top"><CircleHelp/><Bell/><i/><b>{me.profilePhoto?<img src={me.profilePhoto} alt=""/>:me.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</b><details><summary><span><strong>{me.name}</strong><br/>{role}</span><ChevronDown/></summary><div className="sofia-account-actions">
      <button type="button" disabled={logout.isPending} onClick={()=>logout.mutate()}>
        <LogOut aria-hidden="true"/>{logout.isPending?'Déconnexion…':'Déconnexion'}
      </button>
      {logout.isError&&<p role="alert">La déconnexion a échoué. Réessaie.</p>}
    </div></details></header><main className="sofia-main">{me.impersonator&&<div className="impersonation" role="status"><span>Vous êtes connecté en tant que <strong>{me.name}</strong>.</span><button type="button" disabled={leave.isPending} onClick={()=>leave.mutate()}>Revenir à mon compte ({me.impersonator})</button>{leave.error&&<span role="alert">{leave.error.message}</span>}</div>}<Outlet context={{organization,setOrganization}}/></main></div></div>
}

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Activity, Bell, Building2, CalendarDays, ChartNoAxesColumn, ChevronDown, ClipboardList, Clock, CreditCard, FileText, GraduationCap, House, CircleHelp, Mail, Monitor, Search, Settings, UserRound, Users, Video, type LucideIcon } from 'lucide-react'
import { NavLink, Outlet, useMatch } from 'react-router-dom'
import { api, type Me } from '../api'
import '../planning.css'

type Entry = [LucideIcon, string, string?]
const main: Entry[] = [[House,'Tableau de bord','/dashboard'],[CalendarDays,'Planning','/planning'],[Monitor,'Classes','/classes'],[Users,'Participants (PS)','/learners'],[ClipboardList,'Attestations'],[Activity,'Suivi en direct','/live']]
const settings: Entry[] = [[Building2,'Organismes','/settings/organizations'],[GraduationCap,'Formations','/settings/trainings'],[Clock,'Créneaux','/settings/time-slots'],[UserRound,'Formateurs','/settings/trainers'],[Video,'Configurations des classes virtuelles','/settings/virtual-class-configs'],[Video,'Comptes Zoom','/settings/zoom-accounts'],[Users,'Utilisateurs et rôles','/settings/users'],[Mail,'Modèles de messages','/settings/message-templates']]

const navIcons: Record<string,string> = {
  'Tableau de bord':'home', Planning:'planning', Classes:'classes', 'Participants (PS)':'people', Attestations:'cert', 'Suivi en direct':'live',
  Organismes:'organization', Formations:'education', Créneaux:'clock', Formateurs:'person', 'Comptes Zoom':'zoom',
  'Utilisateurs et rôles':'users', 'Modèles de messages':'mail', 'Journal d’audit':'audit',
}
function navigation([Icon,label,to]: Entry) {
  const content = <>{navIcons[label] ? <img className="nav-picto" alt="" src={'/catalog/'+navIcons[label]+'.png'}/> : <Icon/>}{label}</>
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
  const trainer = me.roles.includes('ROLE_FORMATEUR')
  const role = me.roles.find(r => r !== 'ROLE_USER')?.replace('ROLE_', '').replaceAll('_',' ').toLowerCase()
  return <div className={dashboard ? "sofia-shell dashboard-shell" : heading ? "sofia-shell organizations-shell" : planning ? "sofia-shell planning-shell" : "sofia-shell"}><aside className="sofia-side">
    <img className="brand" src={heading || dashboard ? "/catalog/brand.png" : planning ? "/planning/brand.png" : "/sofia-brand.png"} alt="SOFIA – Classes virtuelles DPC"/>
    <nav>{trainer ? navigation([Monitor,'Mes classes','/my-classes']) : <>
      {main.map(navigation)}
      <details open><summary><Settings/>Paramétrage <ChevronDown/></summary>{settings.filter(([, ,to])=>to==='/settings/virtual-class-configs' ? me.roles.includes('ROLE_ADMIN') : !['/settings/users','/settings/zoom-accounts'].includes(to??'') || me.roles.includes('ROLE_SUPER_ADMIN')).map(navigation)}</details>
      {me.roles.includes('ROLE_ADMIN')&&navigation([ClipboardList,'Journal d’audit','/audit'])}
      <div className="future">{([[ChartNoAxesColumn,'Analytique'],[CreditCard,'Facturation'],[FileText,'Documents DPC']] as Entry[]).map(([Icon,label])=><span key={label} aria-disabled="true"><Icon/>{label}<small>Bientôt</small></span>)}</div>
    </>}</nav></aside><div className="sofia-body"><header className="sofia-top">{dashboard ? <><CircleHelp/></> : heading ? <><div className="org-crumb">Paramétrage　›　 <strong>{heading}</strong></div>{orgPage?<img className="top-picto" alt="Aide" src="/organizations/helpTop.png"/>:<CircleHelp/>}</> : planning ? <img className="top-picto" alt="Recherche" src="/planning/search.png"/> : <Search/>}{planning||orgPage?<img className="top-notify" alt="Notifications" src={planning?"/planning/notify.png":"/organizations/notify.png"}/>:<Bell/>}<i/><b>{me.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</b><details><summary><span><strong>{me.name}</strong><br/>{role}</span><ChevronDown/></summary><button onClick={async()=>{await api('/auth/logout',{method:'POST'});qc.setQueryData(['me'],null)}}>Déconnexion</button></details></header><main className="sofia-main"><Outlet context={{organization,setOrganization}}/></main></div></div>
}

import {Picto} from '../components/Picto'
import { useState, type ReactNode } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Activity, ArrowRight, CalendarDays, Check, CircleHelp, FileText, Info, Layers, Mail, Phone, UserRound, Users, Video, X, type LucideIcon } from 'lucide-react'
import type { Me } from '../api'
import './dashboard.css'

const organizations = ['SOFIA', 'STUDIO PHOCEA']
const alerts = [
  ['Thomas Bernard','Prise en charge du diabète de type 2 – Session 008',0,12],
  ['Sophie Martin','Santé mentale en soins primaires – Session 010',1,15],
] as const
const live = [
  ['Prise en charge du diabète de type 2',0,'Matin','Dr Martin P.',1,'09:00 – 13:00','10:12 / 13:00','18 / 20','9A7Z2626001','008'],
  ['Santé mentale en soins primaires',1,'Après-midi','Dr Lefèvre A.',2,'14:00 – 17:00','14:48 / 17:00','16 / 18','9A7Z2626004','010'],
] as const
const next = [
  ['14:00 – 17:00','BPCO : actualités de prise en charge',0,'20 / 20'],
  ['09:00 – 13:00','Antibiothérapie en ville',1,'18 / 20'],
  ['14:00 – 17:00','Douleur chronique : repérage et orientation',0,'16 / 20'],
] as const
const certificates = [
  ['Julien Robert','Santé mentale en soins primaires',22,1],
  ['Claire Dubois','BPCO : actualités de prise en charge',28,0],
  ['Antoine Girard','Prise en charge du diabète de type 2',24,0],
] as const
const activities = [
  ['15:02','Alerte traitée : Thomas Bernard (reconnecté) par Marie Leroy',0,Check],
  ['14:48','Relance SMS envoyée à 20 PS – Session 010',1,Mail],
  ['14:12','Classe déplacée : Session 009 du 24/04 vers le 25/04 par Charles M.',0,ArrowRight],
  ['13:57','Envoi en échec : 2 SMS – Session 008',0,X],
  ['09:01','Classe créée : Prise en charge du diabète de type 2 – Session 008',0,CalendarDays],
] as const

function Badge({id}:{id:number}) {return <span className={'org org'+id}>{organizations[id]}</span>}
function Panel({icon:Icon,title,children,action}:{icon:LucideIcon,title:string,children:ReactNode,action?:ReactNode}) {
  return <section className="db-panel"><header><Icon/><h2>{title}</h2>{action}</header>{children}</section>
}
export default function Dashboard({me}:{me:Me}) {
  const {organization,setOrganization}=useOutletContext<{organization:string,setOrganization:(o:string)=>void}>()
  const [dismissed,dismiss]=useState(false)
  const [handled, setHandled]=useState<string[]>([])
  const [detail, setDetail]=useState<{title:string,body:string}|null>(null)
  const matches=(id:number)=>organization==='Tous'||organization===organizations[id]
  const activeAlerts=alerts.filter(a=>matches(a[2])&&!handled.includes(a[0]))
  const classes=live.filter(c=>matches(c[1]))
  const docs=certificates.filter(c=>matches(c[3]))
  const stats: [LucideIcon,string,string,string][]=[
    [CalendarDays,'4','Classes aujourd’hui','2 en cours'],[Users,'34 / 38','PS connectés / PS attendus en ce moment',''],
    [Check,'89 %','Taux de présence moyen du jour',''],[Mail,'56','Relances envoyées aujourd’hui (SMS + mail)',''],[X,'2','Envois en échec',''],
  ]
  return <div className="dashboard">
    <section className="db-greeting"><Picto name="activity" className="picto-heading"/><div><h1>Bonjour {me.name.split(' ')[0]}</h1><p>Démonstration · Jeudi 17 avril 2025</p></div><Link className="db-green" to="/live">Suivi en direct →</Link><div className="db-switch">Organismes <div>{['Tous',...organizations].map((o,i)=><button key={o} aria-pressed={organization===o} onClick={()=>setOrganization(o)}>{i===0?<Layers/>:<i/>}{o}</button>)}</div></div></section>
    {!dismissed&&<section className="db-warning"><h2><Picto name="warning"/>{activeAlerts.length} PS déconnecté{activeAlerts.length===1?'':'s'} depuis plus de 10 min<button className="close-alert" aria-label="Masquer les alertes" onClick={()=>dismiss(true)}><X/></button></h2>{activeAlerts.map(([name,course,id,minutes])=><div className="db-warning-row" key={name}><UserRound/><strong>{name}</strong><b>{course}</b><Badge id={id}/><span className="db-red">◷　{minutes} min déconnecté{id===1?'e':''}</span><button onClick={()=>setDetail({title:'Appeler '+name,body:'Aucun numéro de téléphone renseigné pour ce participant de démonstration.'})}><Phone/>Appeler</button><button className="db-primary" onClick={()=>setHandled([...handled,name])}>Traiter</button></div>)}</section>}
    <div className="db-stats" aria-label="Indicateurs de tous les organismes">{stats.map(([,value,label,tag],i)=><div key={label} className={'db-stat k'+i}><Picto name={(['calendar','users','done','bell','warning'] as const)[i]} className="picto-heading"/><div><strong>{value}</strong><p>{label}</p>{tag&&<small>{tag}</small>}</div></div>)}</div>
    <div className="db-center"><Panel icon={Video} title={'Classes en cours ('+classes.length+')'} action={<Link to="/classes">Voir toutes les classes en cours <ArrowRight/></Link>}>{classes.map(([title,id,slot,trainer,zoom,hours,elapsed,count,action,session])=><article className={'db-course course'+id} key={title}><header><Badge id={id}/><div><h3>{title}</h3><p>Action : {action}　•　Session : {session}</p></div><small>▷　En cours</small></header><div className="course-content"><div><p><CalendarDays/>Créneau : <b>{slot} ({hours})</b></p><p><progress value={id?86:76} max={100}/>{elapsed}</p><p><UserRound/>Formateur : {trainer}</p><p><Video/>Compte Zoom : Zoom {zoom}</p></div><div className="course-ring"><b>{count}</b><span>PS connectés</span></div><div><p className="db-red"><Picto name="unplug"/>1 PS déconnecté</p><button className="db-primary" onClick={()=>setDetail({title,body:trainer+' · Zoom '+zoom+' · '+count+' PS connectés'})}><Picto name="link"/> Ouvrir le suivi en direct</button></div></div></article>)}</Panel>
    <div className="db-right"><Panel icon={Video} title="Comptes Zoom">{[1,2,3].map(n=><div className="zoom-slot" key={n}><Video/><b>Zoom {n}</b><span className={n===3?'free':''}>●　{n===3?'Libre':'Occupé jusqu’à '+(n===1?'13:00':'17:00')}</span>{['09:00　　 13:00','14:00　　 17:00'].map((t,i)=><div key={t}>{t}<i className={n===2?'purple':n===1&&!i?'orange':''}/></div>)}</div>)}</Panel>
    <Panel icon={CalendarDays} title="Prochaines classes" action={<Link to="/planning">Voir le planning <ArrowRight/></Link>}>{['Aujourd’hui – Jeudi 17 avril 2025','Demain – Vendredi 18 avril 2025'].map((day,i)=><div key={day}><h4>{day}</h4>{next.filter((c,index)=>(i===0?index===0:index>0)&&matches(c[2])).map(([hour,title,id,count])=><div className="db-next" key={title}><b>{hour}</b><span>{title}</span><Badge id={id}/><b>{count}</b></div>)}</div>)}</Panel></div></div>
    <div className="db-bottom"><Panel icon={FileText} title={'Attestations à vérifier ('+docs.length+')'} action={<button onClick={()=>setDetail({title:'Attestations à vérifier',body:docs.map(d=>d[0]+' · '+d[1]+' · Présence '+d[2]+' %').join('\n')})}>Voir toutes <ArrowRight/></button>}>{docs.map(([name,title,pct])=><div className="db-cert" key={name}><UserRound/><b>{name}</b><span>{title}</span><small>⚠　Présence {pct} % – sous le seuil</small><button onClick={()=>setDetail({title:name,body:title+' · Présence '+pct+' % · Attestation à vérifier'})}>Voir la fiche PS →</button></div>)}</Panel>
    <Panel icon={Activity} title="Activité récente" action={<button onClick={()=>setDetail({title:"Activité récente",body:activities.filter(a=>matches(a[2])).map(a=>a[0]+"　"+a[1]).join("\n")})}>Voir tout <ArrowRight/></button>}>{activities.filter(a=>matches(a[2])).map(([t,msg,id,Icon])=><div className="db-feed" key={t}><time>{t}</time><Icon/><span>{msg}</span>{['14:48','13:57'].includes(t)&&<Badge id={id}/>}</div>)}</Panel></div>
    <div className="db-notes"><Panel icon={Info} title="Choix d’ergonomie (à valider)">{['Affichage des classes en cours : cartes (comme ci-dessus).','Ou en liste compacte (plus d’informations à l’écran) ?','Position du bloc « Comptes Zoom » : à droite (comme ici) ou en haut ?','Affichage des alertes : seulement les déconnexions > 10 min ou d’autres alertes (inscrits < seuil, formateur absent…) ?'].map((t,i)=><label key={t}><input type="checkbox" defaultChecked={!i}/>{t}</label>)}</Panel><Panel icon={CircleHelp} title="Questions ouvertes"><ul><li>Seuil de présence pour le contrôle des attestations (ex. 20 %, 25 %, 30 %) ?</li><li>Délai et nombre de relances (ex. 3 min, 8 min, 10 min comme prévu) à afficher sur le tableau de bord ?</li><li>Souhaitez-vous afficher uniquement les classes du jour ou aussi un aperçu des prochains jours ?</li><li>Quelles autres alertes souhaitez-vous remonter sur cette page (ex. capacité atteinte, compte Zoom indisponible) ?</li></ul></Panel></div>
    {detail&&<dialog open aria-label={detail.title} className="db-detail"><h2>{detail.title}</h2><p>{detail.body}</p><button autoFocus className="db-primary" onClick={()=>setDetail(null)}>Fermer</button></dialog>}
  </div>
}

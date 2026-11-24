import { api } from '../api'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Info, List, Play, Plus, RotateCcw, X } from 'lucide-react'

const states = ['Planifiée','En cours','Terminée','Annulée']
const symbols = [CalendarDays,Play,Check,X]
const statusCodes = ['PLANNED','IN_PROGRESS','DONE','CANCELLED']
type Session = {classId:number;slotId:number|null;date:string;status:string;capacity:number;title:string;organization:string;orgCode:string;enrolled:number;zoom:string|null;trainer:string|null;startTime:string|null;endTime:string|null;zoomState:string|null}
const time = (s:Session)=>s.startTime ? s.startTime+' – '+s.endTime : 'Horaire à préciser'
const date = (offset:number)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+offset);return d}
const keyDay=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')
const unique=(items:(string|null)[])=>[...new Set(items.filter((v):v is string=>!!v))]
const rowKey=(s:Session)=>s.classId+'-'+(s.slotId??'none')
const short = (d:Date)=>d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})
const pic = (name:string) => <img className="plan-icon" alt="" src={'/planning/'+name+'.png'}/>
function Org({name}:{name:string}) {return <span className={'org org'+(name.includes('PHOCEA')?1:0)}>{name}</span>}
function Status({id}:{id:number}) {const Icon=symbols[id];return <span className={'status s'+id}><Icon/>{states[id]}</span>}
function Card({s}:{s:Session}) {return <article className={'session s'+statusCodes.indexOf(s.status)}><header><strong>{time(s)}</strong><Status id={statusCodes.indexOf(s.status)}/></header><Link className="session-title" to={'/classes/'+s.classId}>{s.title}</Link><Org name={s.organization}/><footer><span>{pic('participants')}{s.enrolled} / {s.capacity}</span><span>{pic('teacher')}{s.trainer}</span><span>{pic('camera')}{s.zoom??'—'}</span></footer></article>}
export default function Planning({canSchedule}:{canSchedule:boolean}) {
  const navigate=useNavigate()
  const [showAlerts,setShowAlerts]=useState(false)
  const [org,setOrg]=useState('Tous'), [training,setTraining]=useState(''),[trainer,setTrainer]=useState(''),[zoom,setZoom]=useState('')
  const [offset,move]=useState(0),[period,setPeriod]=useState('Semaine'),[list,setList]=useState(false)
  const planning=useQuery({queryKey:['planning'],queryFn:()=>api<{slots:Session[];accounts:string[]}>('/planning')})
  const sessions=planning.data?.slots??[]
  const accounts=planning.data?.accounts??[]
  const orgs=unique(sessions.map(s=>s.organization))
  const filtered=sessions.filter(s=>(org==='Tous'||org===s.organization)&&(!training||s.title===training)&&(!trainer||s.trainer===trainer)&&(!zoom||zoom===s.zoom))
  const first=date(offset)
  const monday=offset-(first.getDay()+6)%7
  const start=period==='Jour'?offset:monday
  const weekend=filtered.some(s=>s.date>=keyDay(date(start+5))&&s.date<=keyDay(date(start+6)))
  const days=Array.from({length:period==='Jour'?1:weekend?7:5},(_,i)=>start+i)
  const month=period==='Mois'
  const visible=filtered.filter(s=>month?s.date.slice(0,7)===keyDay(first).slice(0,7):s.date>=keyDay(date(start))&&s.date<=keyDay(date(days.at(-1)!)))
  function shift(dir:number){if(month){const d=new Date(first.getFullYear(),first.getMonth()+dir,1);move(Math.round((d.getTime()-date(0).getTime())/86400000))}else move(offset+dir*(period==='Jour'?1:7))}
  const reset=()=>{setTraining('');setTrainer('');setZoom('');setOrg('Tous')}
  const classes=[...new Map(visible.map(s=>[s.classId,s])).values()]
  const values=[classes.length,classes.reduce((n,s)=>n+s.enrolled,0),...statusCodes.slice(1).map(code=>classes.filter(s=>s.status===code).length)]
  const upcoming=filtered.filter(s=>s.date>=keyDay(date(0))&&s.date<keyDay(date(7)))
  return <section className="planning">{planning.error&&<p role="alert">{planning.error.message}</p>}{planning.isLoading&&<p>Chargement du planning…</p>}<div className="plan-heading">{pic('heading')}<div><h1>Planning des classes virtuelles</h1><p>Gérez, planifiez et suivez l’ensemble de vos sessions de formation DPC.</p></div><div className="org-picker">Organisme <div className="seg">{['Tous',...orgs].map((o,i)=><button className={org===o?'chosen':''} key={o} onClick={()=>setOrg(o)}>{i===0?pic('briefcase'):<em/>}{o}</button>)}</div></div></div>
    <div className="kpis">{['kpi0','kpi1','kpi2','kpi3','kpi4'].map((asset,i)=><div key={i} className={'kpi k'+i}>{pic(asset)}<div><strong>{values[i]}</strong><p>{[period==='Semaine'?'Classes cette semaine':period==='Jour'?'Classes ce jour':'Classes ce mois','PS attendus','En cours','Terminées','Annulée'][i]}</p></div></div>)}</div>
    <div className="filters">{([{label:'Formation',all:'Toutes les formations',options:unique(sessions.map(s=>s.title)),value:training,set:setTraining},{label:'Formateur',all:'Tous les formateurs',options:unique(sessions.map(s=>s.trainer)),value:trainer,set:setTrainer},{label:'Compte Zoom',all:'Tous les comptes Zoom',options:accounts,value:zoom,set:setZoom}]).map(f=><label key={f.label}>{f.label}{f.label!=='Formation'&&pic(f.label==='Formateur'?'trainer':'zoom')}<select value={f.value} onChange={e=>f.set(e.target.value)}><option value="">{f.all}</option>{f.options.map(o=><option key={o}>{o}</option>)}</select></label>)}<button onClick={reset}><RotateCcw/>Réinitialiser</button><button disabled={!canSchedule} onClick={()=>navigate('/classes/new')} className="primary"><Plus/>Créer une classe</button></div>
    <div className="plan-tools"><div className="seg">{[false,true].map(l=><button key={String(l)} className={list===l?'primary':''} onClick={()=>setList(l)}>{l?<List/>:<CalendarDays/>}{l?'Vue liste':'Vue calendrier'}</button>)}</div><div className="week-nav"><button aria-label="Période précédente" onClick={()=>shift(-1)}><ChevronLeft/></button>{pic('week')}<b>{month?first.toLocaleDateString('fr-FR',{month:'long',year:'numeric'}):period==='Jour'?short(first):'Semaine du '+date(start).getDate()+' au '+date(start+6).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}</b><button aria-label="Période suivante" onClick={()=>shift(1)}><ChevronRight/></button></div><div className="seg">{['Jour','Semaine','Mois'].map(p=><button className={period===p?'primary':''} onClick={()=>setPeriod(p)} key={p}>{p}</button>)}</div></div>
    {list||month?<div className={month&&!list?'month-grid':'session-list'}>{month&&!list?Array.from({length:new Date(first.getFullYear(),first.getMonth()+1,0).getDate()},(_,i)=><div key={i} style={i===0?{gridColumnStart:(new Date(first.getFullYear(),first.getMonth(),1).getDay()+6)%7+1}:undefined}><b>{i+1}</b>{visible.filter(s=>new Date(s.date+'T12:00:00').getDate()===i+1).map(s=><p key={rowKey(s)}>{s.title}</p>)}</div>):visible.length?visible.map(s=><div key={rowKey(s)}><b>{short(new Date(s.date+'T12:00:00'))}</b><Card s={s}/></div>):<p>Aucune classe sur cette période.</p>}</div>:<div className="calendar-scroll"><div className="calendar"><div className="hours">{Array.from({length:11},(_,i)=><span key={i}>{String(8+i).padStart(2,'0')}:00</span>)}</div>{days.map(d=><div className="day" key={d}><h3 className={d===0?'today':''}>{short(date(d))}</h3>{[0,1].map(slot=><div className="slot" key={slot}>{visible.filter(s=>s.date===keyDay(date(d))&&Number((s.startTime??'00:00')>='13:00')===slot).map(s=><Card s={s} key={rowKey(s)}/>)}</div>)}</div>)}</div></div>}
    <div className="legend"><b>Légende des statuts :</b>{states.map((s,i)=><Status key={s} id={i}/>)}<label>Organismes :</label>{orgs.map(name=><Org key={name} name={name}/>)}<span className="zoom-note"><Info/>{accounts.length} comptes Zoom {accounts.join(', ')}</span></div>
    <div className="panels"><section><h2>{pic('upcoming')}Prochaines classes (7 jours)</h2>{upcoming.map(s=><div className="upcoming" key={rowKey(s)}><CalendarDays/><b>{short(new Date(s.date+'T12:00:00'))}</b><span>{time(s)}</span><span>{s.title}</span><Org name={s.organization}/><span>{statusCodes.indexOf(s.status)===3?'Annulée':s.enrolled+' / '+s.capacity}</span></div>)}</section><section><h2>{pic('bell')}Alertes &amp; actions<button onClick={()=>setShowAlerts(true)}>Voir tout　→</button></h2>{[classes.filter(s=>s.status==='CANCELLED').length+' classe(s) annulée(s) sur la période',classes.filter(s=>s.enrolled<15&&s.status!=='CANCELLED').length+' classes avec moins de 15 inscrits'].map((a,i)=><p className={'alert a'+i} key={a}>{a}</p>)}</section></div>
    {showAlerts&&<dialog ref={el=>{if(el&&!el.open)el.showModal()}} onClose={()=>setShowAlerts(false)} className="plan-alert-dialog"><h2>Alertes &amp; actions</h2>{visible.filter(s=>statusCodes.indexOf(s.status)===3||s.enrolled<15).map(s=><p key={rowKey(s)}>{s.title} · {statusCodes.indexOf(s.status)===3?'Annulée':s.enrolled+' inscrits'}</p>)}<form method="dialog"><button>Fermer</button></form></dialog>}
  </section>
}

import {CalendarDays} from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { day, type Session } from './sessionModel'

type Trainer={id:number;firstName:string;lastName:string;active:boolean;organizations?:{id:number}[]}
export default function ScheduleClass(){
  const navigate=useNavigate(), cache=useQueryClient()
  const sessions=useQuery({queryKey:['sessions'],queryFn:()=>api<Session[]>('/sessions')})
  const trainers=useQuery({queryKey:['trainers'],queryFn:()=>api<Trainer[]>('/trainers')})
  const times=useQuery({queryKey:['time-slots'],queryFn:()=>api<{id:number;label:string;startTime:string;endTime:string;active:boolean}[]>('/time-slots')})
  const preset=useLocation().state as {sessionFormationId?:number}|null
  const [main,setMain]=useState(preset?.sessionFormationId??0),[others,setOthers]=useState<number[]>([]),[slots,setSlots]=useState<Record<number,number>>({})
  const [typed,setCapacity]=useState<number>()
  const offers=(sessions.data??[]).flatMap(session=>session.sessionFormations.filter(item=>item.formation.active).map(item=>({...item,session})))
  const chosen=offers.find(o=>o.id===main)
  // Several session-formations may share a class: same organisation, and a date open to all of them.
  const shareable=chosen?offers.filter(o=>o.id!==main&&o.session.organization.id===chosen.session.organization.id):[]
  const served=chosen?[chosen,...shareable.filter(o=>others.includes(o.id))]:[]
  const from=served.map(o=>o.effectiveAccessStartsOn).sort().at(-1),to=served.map(o=>o.effectiveAccessEndsOn).sort()[0]
  const noDate=!!from&&!!to&&from>to
  const capacity=typed??chosen?.capacity??0
  const attempt=useRef({body:'',key:''})
  const mutation=useMutation({mutationFn:(values:object)=>{
    const body=JSON.stringify(values)
    if(attempt.current.body!==body)attempt.current={body,key:crypto.randomUUID()}
    return api<{id:number}>('/scheduled-classes',{method:'POST',body,headers:{'Idempotency-Key':attempt.current.key}})
  },onSuccess:r=>{void cache.invalidateQueries({queryKey:['classes']});void cache.invalidateQueries({queryKey:['sessions']});void cache.invalidateQueries({queryKey:['planning']});navigate('/classes/'+r.id)}})
  function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();mutation.mutate({...Object.fromEntries(new FormData(e.currentTarget)),sessionFormationIds:served.map(o=>o.id),capacity,slots:Object.entries(slots).filter(([,trainer])=>trainer).map(([slot,trainerId])=>({timeSlotId:Number(slot),trainerId}))})}
  const input='block w-full rounded-md border border-slate-300 bg-white p-2'
  const label=(o:typeof offers[number])=>o.session.name+' · '+o.formation.title
  return <section className="max-w-3xl"><Link to={chosen?'/sessions/'+chosen.session.id:'/sessions'}>← {chosen?chosen.session.name:'Sessions'}</Link><header className="page-heading"><CalendarDays/><h1 className="my-4 text-2xl font-bold">Planifier une classe virtuelle</h1></header><form className="sofia-card grid gap-4 p-5" onSubmit={submit}>
    <label>Session et formation<select className={input} required value={main||''} onChange={e=>{setMain(Number(e.target.value));setOthers([]);setCapacity(undefined);setSlots({})}}><option value="">Choisir une formation de session</option>{offers.map(o=><option key={o.id} value={o.id}>{o.session.organization.name} · {label(o)}</option>)}</select></label>
    {sessions.data&&!offers.length&&<p>Rattachez d’abord une formation publiée à une <Link to="/sessions">session</Link>.</p>}
    {!!shareable.length&&<fieldset><legend className="font-semibold">Réunir d’autres formations dans la même classe (facultatif)</legend>{shareable.map(o=><label key={o.id} className="my-1 flex gap-2"><input type="checkbox" checked={others.includes(o.id)} onChange={e=>setOthers(e.target.checked?[...others,o.id]:others.filter(id=>id!==o.id))}/>{label(o)}</label>)}</fieldset>}
    {noDate&&<p role="alert">Les dates d’accès de ces formations ne se recoupent pas.</p>}
    <div className="grid grid-cols-2 gap-4"><label>Date<input className={input} name="date" type="date" required min={from} max={to}/>{chosen&&!noDate&&<small>Entre le {day(from!)} et le {day(to!)}.</small>}</label><label>Capacité<input className={input} type="number" min="1" required value={capacity||''} onChange={e=>setCapacity(Number(e.target.value))}/></label></div>
    <label>Référence (facultative)<input className={input} name="reference" maxLength={100}/></label>
    <fieldset><legend className="font-semibold">Créneaux et formateurs de l’organisme</legend>{times.data?.filter(t=>t.active).map(t=><label key={t.id} className="my-2 block">{t.label} · {t.startTime}–{t.endTime}<select className={input} value={slots[t.id]||''} onChange={e=>setSlots({...slots,[t.id]:Number(e.target.value)})}><option value="">Ne pas réserver ce créneau</option>{trainers.data?.filter(f=>f.active&&f.organizations?.some(o=>o.id===chosen?.session.organization.id)).map(f=><option key={f.id} value={f.id}>{f.firstName} {f.lastName}</option>)}</select></label>)}</fieldset>
    {[sessions.error,trainers.error,times.error,mutation.error].filter(Boolean).map((e,i)=><p key={i} role="alert">{e?.message}</p>)}
    <button className="rounded-lg bg-primary p-3 text-white disabled:opacity-50" disabled={mutation.isPending||!chosen||noDate||!Object.values(slots).some(Boolean)}>Réserver les créneaux et créer la classe</button>
  </form></section>
}

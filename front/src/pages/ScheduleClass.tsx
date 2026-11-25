import {CalendarDays} from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'

type Training={id:number;title:string;active:boolean;defaultCapacity:number;organization:{id:number;name:string;active:boolean}}
type Trainer={id:number;firstName:string;lastName:string;active:boolean;organizations?:{id:number}[]}
export default function ScheduleClass(){
  const navigate=useNavigate(), cache=useQueryClient()
  const trainings=useQuery({queryKey:['trainings'],queryFn:()=>api<Training[]>('/trainings')})
  const trainers=useQuery({queryKey:['trainers'],queryFn:()=>api<Trainer[]>('/trainers')})
  const times=useQuery({queryKey:['time-slots'],queryFn:()=>api<{id:number;label:string;startTime:string;endTime:string;active:boolean}[]>('/time-slots')})
  const [training,setTraining]=useState(0),[slots,setSlots]=useState<Record<number,number>>({})
  const [capacity,setCapacity]=useState(20)
  const attempt=useRef({body:'',key:''})
  const mutation=useMutation({mutationFn:(values:object)=>{
    const body=JSON.stringify(values)
    if(attempt.current.body!==body)attempt.current={body,key:crypto.randomUUID()}
    return api<{id:number}>('/scheduled-classes',{method:'POST',body,headers:{'Idempotency-Key':attempt.current.key}})
  },onSuccess:r=>{void cache.invalidateQueries({queryKey:['classes']});void cache.invalidateQueries({queryKey:['planning']});navigate('/classes/'+r.id)}})
  function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();mutation.mutate({...Object.fromEntries(new FormData(e.currentTarget)),trainingId:training,capacity,slots:Object.entries(slots).filter(([,trainer])=>trainer).map(([slot,trainerId])=>({timeSlotId:Number(slot),trainerId}))})}
  const input='block w-full rounded-md border border-slate-300 bg-white p-2'
  return <section className="max-w-3xl"><Link to="/planning">← Planning</Link><header className="page-heading"><CalendarDays/><h1 className="my-4 text-2xl font-bold">Créer une classe virtuelle</h1></header><form className="sofia-card grid gap-4 p-5" onSubmit={submit}>
    <label>Formation et organisme<select className={input} required value={training||''} onChange={e=>{const id=Number(e.target.value);setTraining(id);setCapacity(trainings.data?.find(t=>t.id===id)?.defaultCapacity??20);setSlots({})}}><option value="">Choisir une formation</option>{trainings.data?.filter(t=>t.active&&t.organization.active).map(t=><option key={t.id} value={t.id}>{t.organization.name} · {t.title}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-4"><label>Date<input className={input} name="date" type="date" required/></label><label>Capacité<input className={input} type="number" min="1" required value={capacity||''} onChange={e=>setCapacity(Number(e.target.value))}/></label></div>
    <div className="grid grid-cols-2 gap-4"><label>Action DPC<input className={input} name="dpcAction" maxLength={80} required/></label><label>Session DPC<input className={input} name="dpcSession" maxLength={80} required/></label></div>
    <label>Référence (facultative)<input className={input} name="reference" maxLength={100}/></label>
    <fieldset><legend className="font-semibold">Créneaux et formateurs de l’organisme</legend>{times.data?.filter(t=>t.active).map(t=><label key={t.id} className="my-2 block">{t.label} · {t.startTime}–{t.endTime}<select className={input} value={slots[t.id]||''} onChange={e=>setSlots({...slots,[t.id]:Number(e.target.value)})}><option value="">Ne pas réserver ce créneau</option>{trainers.data?.filter(f=>f.active&&f.organizations?.some(o=>o.id===trainings.data?.find(item=>item.id===training)?.organization.id)).map(f=><option key={f.id} value={f.id}>{f.firstName} {f.lastName}</option>)}</select></label>)}</fieldset>
    {[trainings.error,trainers.error,times.error,mutation.error].filter(Boolean).map((e,i)=><p key={i} role="alert">{e?.message}</p>)}
    <button className="rounded-lg bg-primary p-3 text-white disabled:opacity-50" disabled={mutation.isPending||!Object.values(slots).some(Boolean)}>Réserver les créneaux et créer la classe</button>
  </form></section>
}

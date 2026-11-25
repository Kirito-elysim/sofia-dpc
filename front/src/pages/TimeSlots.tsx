import {useEffect,useRef,useState,type FormEvent} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {CalendarDays,Info,List,Save,Trash2,X} from 'lucide-react'
import {api} from '../api'
import {ActiveBadge,DataTable,DeleteAction,EditAction,EmptyState,Filters,ListHeading,ListPage,PageHeader,RowActions,SearchField,SelectField,ToggleAction,ViewToggle} from '../components/list/List'
import './time-slots.css'

type Slot={id:number;label:string;startTime:string;endTime:string;durationMin:number;active:boolean}
const minutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3,5))
const duration=(total:number)=>total%60?`${Math.floor(total/60)} h ${String(total%60).padStart(2,'0')}`:`${total/60} h`
const patch=(id:number,body:object)=>api('/time-slots/'+id,{method:'PATCH',headers:{'Content-Type':'application/merge-patch+json'},body:JSON.stringify(body)})

export default function TimeSlots({canWrite}:{canWrite:boolean}) {
  const client=useQueryClient()
  const list=useQuery({queryKey:['time-slots'],queryFn:()=>api<Slot[]>('/time-slots')})
  const usage=useQuery({queryKey:['time-slot-usage'],queryFn:()=>api<number[]>('/time-slot-usage')})
  const [query,setQuery]=useState(''),[status,setStatus]=useState(''),[view,setView]=useState<'list'|'calendar'>('list')
  const [editing,setEditing]=useState<Slot|'new'|null>(null),[removing,setRemoving]=useState<Slot|null>(null)
  const change=useMutation({mutationFn:({slot,remove}:{slot:Slot;remove?:boolean})=>remove?api('/time-slots/'+slot.id,{method:'DELETE'}):patch(slot.id,{active:!slot.active}),
    onSuccess:()=>{setRemoving(null);void client.invalidateQueries()}})
  const rows=list.data??[]
  const filtered=rows.filter(slot=>(!status||String(slot.active)===status)&&slot.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((x,y)=>x.startTime.localeCompare(y.startTime))
  const reset=()=>{setQuery('');setStatus('')}
  const open=(slot:Slot|'new')=>{change.reset();setEditing(slot)}
  const views=<ViewToggle value={view} onChange={setView} options={[{key:'list',label:'Liste',Icon:List},{key:'calendar',label:'Calendaire',Icon:CalendarDays}]}/>
  const used=removing?usage.data?.includes(removing.id):false
  return <ListPage className={'slots'+(editing?' with-panel':'')}>
    <div className="slots-main">
      <PageHeader icon="calendar" title="Créneaux" subtitle="Définissez les plages horaires disponibles pour les classes virtuelles." add={canWrite?{label:'Ajouter un créneau',onClick:()=>open('new')}:undefined}/>
      <Filters onReset={reset}>
        <SearchField label="Rechercher un créneau" value={query} onChange={setQuery}/>
        <SelectField label="Statut" icon="done" all="Tous les statuts" value={status} onChange={setStatus} options={[{value:'true',label:'Actif'},{value:'false',label:'Inactif'}]}/>
      </Filters>
      {list.error&&<p role="alert">{list.error.message}</p>}{!removing&&change.error&&<p role="alert">{change.error.message}</p>}
      {view==='calendar'?<div className="ls-card"><ListHeading title="Liste des créneaux" count={rows.length} tools={views}/><ul className="slots-day" aria-label="Créneaux sur la journée">{filtered.map(s=><li key={s.id}><span>{s.label}</span><div><b className={s.active?'':'off'} style={{left:minutes(s.startTime)/14.4+'%',width:s.durationMin/14.4+'%'}} title={`${s.startTime} – ${s.endTime}`}/></div><small>{s.startTime} – {s.endTime}</small></li>)}<li className="slots-hours" aria-hidden="true"><span/><div>{[0,6,12,18,24].map(h=><em key={h} style={{left:h/.24+'%'}}>{h} h</em>)}</div><small/></li></ul></div>
      :<DataTable title="Liste des créneaux" tools={views} rows={filtered} total={rows.length} loading={list.isLoading} filterKey={query+'|'+status} rowKey={s=>s.id} rowName={s=>s.label}
        columns={[
          {key:'label',label:'Libellé',sort:s=>s.label,render:s=><strong>{s.label}</strong>},
          {key:'startTime',label:'Heure de début',sort:s=>s.startTime,render:s=>s.startTime},
          {key:'endTime',label:'Heure de fin',sort:s=>s.endTime,render:s=>s.endTime},
          {key:'duration',label:'Durée',sort:s=>s.durationMin,render:s=>duration(s.durationMin)},
          {key:'active',label:'Statut',sort:s=>String(s.active),render:s=><ActiveBadge active={s.active}/>},
        ]}
        actions={canWrite?s=><RowActions>
          <EditAction aria-label={'Modifier '+s.label} onClick={()=>open(s)}/>
          <ToggleAction active={s.active} disabled={change.isPending} onClick={()=>change.mutate({slot:s})}/>
          <DeleteAction aria-label={'Supprimer '+s.label} disabled={!usage.data} onClick={()=>{change.reset();setRemoving(s)}}/>
        </RowActions>:undefined}
        empty={rows.length?<EmptyState title="Aucun résultat pour ce filtre" text="Aucun créneau ne correspond à votre recherche ou à votre filtre." action={{label:'Réinitialiser les filtres',onClick:reset}}/>:<EmptyState title="Aucun créneau"/>}/>}
    </div>
    {editing&&<Panel key={editing==='new'?'new':editing.id} slot={editing==='new'?null:editing} close={()=>setEditing(null)}/>}
    {removing&&<Confirm used={!!used} slot={removing} pending={change.isPending} error={change.error?.message} close={()=>setRemoving(null)} confirm={()=>change.mutate({slot:removing,remove:!used})}/>}
  </ListPage>
}

function Panel({slot,close}:{slot:Slot|null;close:()=>void}) {
  const client=useQueryClient()
  const [label,setLabel]=useState(slot?.label??''),[start,setStart]=useState(slot?.startTime??''),[end,setEnd]=useState(slot?.endTime??''),[active,setActive]=useState(slot?.active??true)
  const first=useRef<HTMLInputElement>(null)
  useEffect(()=>first.current?.focus(),[])
  const invalid=!!start&&!!end&&end<=start
  const save=useMutation({mutationFn:()=>{const body={label:label.trim(),startTime:start,endTime:end,active};return slot?patch(slot.id,body):api('/time-slots',{method:'POST',body:JSON.stringify(body)})},
    onSuccess:async()=>{await client.invalidateQueries();close()}})
  const title=slot?'Modifier le créneau':'Ajouter un créneau'
  return <aside className="slots-panel" aria-label={title} onKeyDown={e=>{if(e.key==='Escape')close()}}>
    <header><h2>{title}</h2><button type="button" aria-label="Fermer" onClick={close}><X/></button></header>
    <p>{slot?'Mettez à jour ce créneau.':'Créez un créneau réutilisable pour les classes virtuelles.'}</p>
    <form onSubmit={(e:FormEvent)=>{e.preventDefault();if(!invalid&&!save.isPending)save.mutate()}}>
      <label><span>Libellé <em>*</em></span><input ref={first} required maxLength={50} placeholder="Ex. Matin" value={label} onChange={e=>setLabel(e.target.value)}/></label>
      <div className="slots-times"><label><span>Heure de début <em>*</em></span><input type="time" required value={start} onChange={e=>setStart(e.target.value)}/></label><label><span>Heure de fin <em>*</em></span><input type="time" required value={end} aria-invalid={invalid} aria-describedby={invalid?'slot-end-error':undefined} onChange={e=>setEnd(e.target.value)}/></label></div>
      {invalid&&<p id="slot-end-error" role="alert" className="slots-error"><Info aria-hidden="true"/>L’heure de fin doit être postérieure à l’heure de début.</p>}
      <label>Statut<select value={String(active)} onChange={e=>setActive(e.target.value==='true')}><option value="true">Actif</option><option value="false">Inactif</option></select></label>
      {start&&end&&!invalid&&<p className="slots-info"><Info aria-hidden="true"/>La durée est calculée automatiquement : {duration(minutes(end)-minutes(start))}.</p>}
      {save.error&&<p role="alert" className="slots-error">{save.error.message}</p>}
      <footer><button type="button" onClick={close}>Annuler</button><button className="slots-primary" disabled={invalid||save.isPending}><Save/>Enregistrer</button></footer>
    </form>
  </aside>
}

function Confirm({slot,used,pending,error,close,confirm}:{slot:Slot;used:boolean;pending:boolean;error?:string;close:()=>void;confirm:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const dialog=ref.current!;dialog.showModal();return ()=>dialog.close()},[])
  return <dialog ref={ref} className="slots-confirm" aria-labelledby="slot-confirm-title" onCancel={e=>{e.preventDefault();if(!pending)close()}}>
    <i><Trash2 aria-hidden="true"/></i>
    <div><h2 id="slot-confirm-title">Supprimer ce créneau ?</h2><p><b>{slot.label}</b> · {slot.startTime} – {slot.endTime}</p><p>Cette action est tracée dans le <b>journal d’audit</b>.</p>
      <p>{used?<>Il est déjà utilisé dans des classes : il sera <b>désactivé</b> plutôt que supprimé.{!slot.active&&' Il est déjà inactif.'}</>:'Il n’est utilisé par aucune classe : il sera retiré de la liste.'}</p>
      {error&&<p role="alert" className="slots-error">{error}</p>}
      <footer><button type="button" onClick={close} disabled={pending}>Annuler</button><button type="button" className={used?'slots-primary':'slots-danger'} disabled={pending||(used&&!slot.active)} onClick={confirm}>{used?'Désactiver':'Supprimer'}</button></footer></div>
    <button type="button" className="slots-close" aria-label="Fermer" onClick={close} disabled={pending}><X/></button>
  </dialog>
}

import {useEffect,useRef,useState,type FormEvent} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {ArrowUpDown,CalendarDays,ChevronDown,ChevronLeft,ChevronRight,Filter,Info,List,Pencil,Plus,Save,Search,SearchX,Trash2,X} from 'lucide-react'
import {api} from '../api'
import {ActivationActionIcon,ActivationStatusIcon} from '../components/ActivationIcons'
import './organizations.css'
import './organization-list.css'
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
  const [sort,setSort]=useState<{key:'label'|'startTime'|'endTime';dir:number}>({key:'startTime',dir:1})
  const [page,setPage]=useState(1),[size,setSize]=useState(10),[checked,setChecked]=useState<number[]>([])
  const [editing,setEditing]=useState<Slot|'new'|null>(null),[removing,setRemoving]=useState<Slot|null>(null)
  const change=useMutation({mutationFn:({slot,remove}:{slot:Slot;remove?:boolean})=>remove?api('/time-slots/'+slot.id,{method:'DELETE'}):patch(slot.id,{active:!slot.active}),
    onSuccess:()=>{setRemoving(null);void client.invalidateQueries()}})
  const rows=list.data??[]
  const filtered=rows.filter(s=>(!status||String(s.active)===status)&&s.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a,b)=>a[sort.key].localeCompare(b[sort.key],'fr')*sort.dir)
  const last=Math.max(1,Math.ceil(filtered.length/size)),current=Math.min(page,last),shown=filtered.slice((current-1)*size,current*size)
  const reset=()=>{setQuery('');setStatus('');setPage(1)}
  const open=(slot:Slot|'new')=>{change.reset();setEditing(slot)}
  const used=removing?usage.data?.includes(removing.id):false
  const sortable=(key:typeof sort.key,label:string)=><th scope="col" aria-sort={sort.key===key?(sort.dir>0?'ascending':'descending'):'none'}><button type="button" onClick={()=>setSort({key,dir:sort.key===key?-sort.dir:1})}>{label}<ArrowUpDown aria-hidden="true"/></button></th>
  return <section className={'slots'+(editing?' with-panel':'')}>
    <div className="slots-main">
      <header className="slots-title"><i><CalendarDays aria-hidden="true"/></i><div><h1>Créneaux</h1><p>Définissez les plages horaires disponibles pour les classes virtuelles.</p></div>{canWrite&&<button type="button" className="slots-primary" onClick={()=>open('new')}><Plus/>Ajouter un créneau</button>}</header>
      <div className="slots-card slots-filters">
        <label><Search aria-hidden="true"/><input aria-label="Rechercher un créneau" placeholder="Rechercher un créneau…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/></label>
        <label><Filter aria-hidden="true"/><select aria-label="Statut" value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Tous les statuts</option><option value="true">Actif</option><option value="false">Inactif</option></select><ChevronDown aria-hidden="true"/></label>
      </div>
      <div className="slots-card">
        <div className="slots-head"><h2>Liste des créneaux ({filtered.length})</h2><div role="group" aria-label="Affichage">{([['list',List,'Liste'],['calendar',CalendarDays,'Calendaire']] as const).map(([key,Icon,label])=><button key={key} type="button" aria-pressed={view===key} onClick={()=>setView(key)}><Icon aria-hidden="true"/>{label}</button>)}</div></div>
        {list.error&&<p role="alert">{list.error.message}</p>}{!removing&&change.error&&<p role="alert">{change.error.message}</p>}
        {list.isLoading&&<p role="status">Chargement…</p>}
        {list.data&&!filtered.length?<div className="od-empty" role="status"><i><SearchX aria-hidden="true"/></i><h2>{rows.length?'Aucun résultat pour ce filtre':'Aucun créneau'}</h2>{rows.length>0&&<><p>Aucun créneau ne correspond à votre recherche ou à votre filtre.</p><button type="button" onClick={reset}>Réinitialiser les filtres</button></>}</div>
        :view==='calendar'?<ul className="slots-day" aria-label="Créneaux sur la journée">{filtered.map(s=><li key={s.id}><span>{s.label}</span><div><b className={s.active?'':'off'} style={{left:minutes(s.startTime)/14.4+'%',width:s.durationMin/14.4+'%'}} title={`${s.startTime} – ${s.endTime}`}/></div><small>{s.startTime} – {s.endTime}</small></li>)}<li className="slots-hours" aria-hidden="true"><span/><div>{[0,6,12,18,24].map(h=><em key={h} style={{left:h/.24+'%'}}>{h} h</em>)}</div><small/></li></ul>
        :list.data&&<><div className="slots-scroll"><table><thead><tr><th scope="col"><input type="checkbox" aria-label="Sélectionner la page" checked={shown.length>0&&shown.every(s=>checked.includes(s.id))} onChange={e=>setChecked(e.target.checked?[...new Set([...checked,...shown.map(s=>s.id)])]:checked.filter(id=>!shown.some(s=>s.id===id)))}/></th>{sortable('label','Libellé')}{sortable('startTime','Heure de début')}{sortable('endTime','Heure de fin')}<th scope="col">Durée</th><th scope="col">Statut</th>{canWrite&&<th scope="col">Actions</th>}</tr></thead>
          <tbody>{shown.map(s=><tr key={s.id}><td><input type="checkbox" aria-label={'Sélectionner '+s.label} checked={checked.includes(s.id)} onChange={()=>setChecked(checked.includes(s.id)?checked.filter(id=>id!==s.id):[...checked,s.id])}/></td><td>{s.label}</td><td>{s.startTime}</td><td>{s.endTime}</td><td>{duration(s.durationMin)}</td><td><span className={'slots-state'+(s.active?' on':'')}><ActivationStatusIcon active={s.active}/>{s.active?'Actif':'Inactif'}</span></td>
            {canWrite&&<td className="oa"><div className="oa-actions directory-row-actions"><button type="button" aria-label={'Modifier '+s.label} onClick={()=>open(s)}><Pencil aria-hidden="true"/>Modifier</button><button type="button" className={s.active?'neutral':'green'} disabled={change.isPending} onClick={()=>change.mutate({slot:s})}><ActivationActionIcon active={s.active}/>{s.active?'Désactiver':'Activer'}</button><button type="button" className="red" aria-label={'Supprimer '+s.label} disabled={!usage.data} onClick={()=>{change.reset();setRemoving(s)}}><Trash2 aria-hidden="true"/>Supprimer</button></div></td>}</tr>)}</tbody></table></div>
          <footer><span>Affichage de {(current-1)*size+1} à {(current-1)*size+shown.length} sur {filtered.length} {filtered.length>1?'créneaux':'créneau'}</span><select aria-label="Résultats par page" value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1)}}>{[10,25,50].map(n=><option key={n} value={n}>{n} par page</option>)}</select><button type="button" aria-label="Précédent" disabled={current===1} onClick={()=>setPage(current-1)}><ChevronLeft/></button><b aria-current="page">{current}</b><button type="button" aria-label="Suivant" disabled={current===last} onClick={()=>setPage(current+1)}><ChevronRight/></button></footer></>}
      </div>
    </div>
    {editing&&<Panel key={editing==='new'?'new':editing.id} slot={editing==='new'?null:editing} close={()=>setEditing(null)}/>}
    {removing&&<Confirm used={!!used} slot={removing} pending={change.isPending} error={change.error?.message} close={()=>setRemoving(null)} confirm={()=>change.mutate({slot:removing,remove:!used})}/>}
  </section>
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

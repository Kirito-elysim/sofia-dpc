import {useState,type FormEvent} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {ArrowLeft,Save,UserPlus,UsersRound} from 'lucide-react'
import {Link,useParams} from 'react-router-dom'
import {api} from '../api'
import {ConfirmDialog,DataTable,DeleteAction,EditAction,EmptyState,ListPage,RowActions} from '../components/list/List'
import {day,type Registration,type RegistrationList} from './sessionModel'
import './formation-wizard.css'
import './sessions.css'

const fields={firstName:'Prénom',lastName:'Nom',email:'E-mail',phone:'Téléphone',rpps:'RPPS'} as const
const minutes=(seconds:number)=>Math.round(seconds/60)
const name=(r:Registration)=>r.participant.firstName+' '+r.participant.lastName

export default function Registrations({canWrite}:{canWrite:boolean}){
  const {formationId}=useParams(),cache=useQueryClient()
  const url='/session-formations/'+formationId+'/registrations'
  const list=useQuery({queryKey:['registrations',formationId],queryFn:()=>api<RegistrationList>(url),refetchInterval:30000})
  const [editing,edit]=useState<Registration|null>(null),[removing,setRemoving]=useState<Registration|null>(null)
  const refresh=()=>{void cache.invalidateQueries({queryKey:['registrations',formationId]});void cache.invalidateQueries({queryKey:['sessions']});void cache.invalidateQueries({queryKey:['classes']})}
  const remove=useMutation({mutationFn:(id:number)=>api('/registrations/'+id,{method:'DELETE'}),onSuccess:()=>{setRemoving(null);refresh()}})
  if(list.error)return <p role="alert">{list.error.message}</p>
  if(!list.data)return <p role="status">Chargement des inscriptions…</p>
  const data=list.data,full=data.registrations.length>=data.capacity
  // The table sits outside the form styles: it keeps the look of every other list.
  return <><main className="tw ss ss-entry">
    <header className="tw-header"><UsersRound/><div><h1>{data.formation.title}</h1><p>{data.session.name} · accès du {day(data.accessStartsOn)} au {day(data.accessEndsOn)} · {data.registrations.length} / {data.capacity} PS inscrits</p></div>
      <Link className="ss-back" to={'/sessions/'+data.session.id}><ArrowLeft/>Retour à la session</Link></header>
    {canWrite&&(full?<p className="tw-warning">La capacité est atteinte : augmentez-la dans la session pour inscrire d’autres PS.</p>:<AddForm url={url} fundings={data.formation.fundingTypes} onDone={refresh}/>)}
    {editing&&<EditForm key={editing.id} item={editing} fundings={data.formation.fundingTypes} close={()=>edit(null)} onDone={()=>{edit(null);refresh()}}/>}
    </main><ListPage className="ss-entry-list"><DataTable title="PS inscrits" rows={data.registrations} total={data.registrations.length} filterKey="" rowKey={r=>r.id} rowName={name}
      columns={[
        {key:'name',label:'PS',sort:r=>r.participant.lastName,render:r=><div><strong>{name(r)}</strong><br/><small>{r.participant.email}</small></div>},
        {key:'funding',label:'Financement',sort:r=>r.funding??'',render:r=>r.funding??'—'},
        {key:'access',label:'Accès',sort:r=>r.effectiveAccessEndsOn,render:r=><div>{day(r.effectiveAccessStartsOn)} – {day(r.effectiveAccessEndsOn)}<br/><small>{r.accessStartsOn||r.accessEndsOn?'propre à ce PS':'hérité'}</small></div>},
        {key:'presence',label:'Présence par demi-journée',render:r=>r.attendance.length?<ul className="ss-presence">{r.attendance.map(a=><li key={a.classId+a.label} className={a.upcoming?undefined:a.seconds?'seen':'absent'}>
          <Link to={'/classes/'+a.classId}>{day(a.date).slice(0,5)} {a.label}</Link> {a.upcoming?'à venir':minutes(a.seconds)+' / '+minutes(a.expected)+' min'}</li>)}</ul>:'Aucune classe'},
      ]}
      actions={canWrite?r=><RowActions><EditAction aria-label={'Modifier '+name(r)} onClick={()=>edit(r)}/><DeleteAction aria-label={'Désinscrire '+name(r)} onClick={()=>{remove.reset();setRemoving(r)}}/></RowActions>:undefined}
      empty={<EmptyState title="Aucun PS inscrit"/>}/>
    {removing&&<ConfirmDialog title="Désinscrire ce PS" pending={remove.isPending} error={remove.error?.message} onCancel={()=>setRemoving(null)} onConfirm={()=>remove.mutate(removing.id)}>
      <p>{name(removing)} ne suivra plus les classes à venir. La présence aux classes déjà tenues est conservée.</p></ConfirmDialog>}
  </ListPage></>
}

type Access={funding:string;accessStartsOn:string;accessEndsOn:string}
function AccessFields({value,set,fundings}:{value:Access;set:(value:Access)=>void;fundings:string[]}){
  return <>
    <div><label>Financement<select value={value.funding} onChange={e=>set({...value,funding:e.target.value})}><option value="">Non précisé</option>{fundings.map(f=><option key={f}>{f}</option>)}</select></label></div>
    <div><label>Début d’accès<input type="date" value={value.accessStartsOn} onChange={e=>set({...value,accessStartsOn:e.target.value})}/></label><small className="tw-field-help">Vide : comme la formation de la session.</small></div>
    <div><label>Fin d’accès<input type="date" min={value.accessStartsOn} value={value.accessEndsOn} onChange={e=>set({...value,accessEndsOn:e.target.value})}/></label><small className="tw-field-help">Vide : comme la formation de la session.</small></div>
  </>
}
const orNull=(value:object)=>Object.fromEntries(Object.entries(value).map(([k,v])=>[k,String(v).trim()||null]))

function AddForm({url,fundings,onDone}:{url:string;fundings:string[];onDone:()=>void}){
  const blank={firstName:'',lastName:'',email:'',phone:'',rpps:'',funding:fundings.length===1?fundings[0]:'',accessStartsOn:'',accessEndsOn:''}
  const [data,set]=useState(blank)
  const save=useMutation({mutationFn:()=>api(url,{method:'POST',body:JSON.stringify(orNull(data))}),onSuccess:()=>{set(blank);onDone()}})
  return <section className="tw-card"><h2><UserPlus/>Inscrire un PS</h2><form onSubmit={(e:FormEvent)=>{e.preventDefault();if(!save.isPending)save.mutate()}}><div className="tw-fields">
    {(Object.keys(fields) as (keyof typeof fields)[]).map(key=>{const required=key==='firstName'||key==='lastName'||key==='email'
      return <div key={key}><label>{fields[key]}{required&&<> <em>*</em></>}<input type={key==='email'?'email':'text'} required={required} maxLength={key==='email'?180:key==='rpps'?11:key==='phone'?20:100} pattern={key==='rpps'?'[0-9]{11}':undefined} value={data[key]} onChange={e=>{set({...data,[key]:e.target.value});save.reset()}}/></label>{key==='rpps'&&<small className="tw-field-help">11 chiffres.</small>}</div>})}
    <AccessFields value={data} set={value=>set({...data,...value})} fundings={fundings}/></div>
    {save.error&&<p role="alert" className="ss-error">{save.error.message}</p>}{save.isSuccess&&<p role="status">PS inscrit.</p>}
    <button className="primary" disabled={save.isPending}><UserPlus/>Inscrire</button></form></section>
}

function EditForm({item,fundings,close,onDone}:{item:Registration;fundings:string[];close:()=>void;onDone:()=>void}){
  const [data,set]=useState<Access>({funding:item.funding??'',accessStartsOn:item.accessStartsOn??'',accessEndsOn:item.accessEndsOn??''})
  const save=useMutation({mutationFn:()=>api('/registrations/'+item.id,{method:'PATCH',body:JSON.stringify(orNull(data))}),onSuccess:onDone})
  return <section className="tw-card" aria-label={'Inscription de '+name(item)}><h2><Save/>Modifier l’inscription de {name(item)}</h2><form onSubmit={(e:FormEvent)=>{e.preventDefault();save.mutate()}}>
    <div className="tw-fields"><AccessFields value={data} set={set} fundings={fundings}/></div>
    {save.error&&<p role="alert" className="ss-error">{save.error.message}</p>}
    <div className="ss-actions"><button className="primary" disabled={save.isPending}><Save/>Enregistrer l’inscription</button><button type="button" onClick={close}>Annuler</button></div></form></section>
}

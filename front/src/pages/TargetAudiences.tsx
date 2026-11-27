import {useState,type FormEvent} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {Save} from 'lucide-react'
import {api} from '../api'
import {ConfirmDialog,DataTable,DeleteAction,DeletedBadge,EditAction,EmptyState,Filters,ListPage,PageHeader,RowActions,SearchField,SelectField} from '../components/list/List'
import {useDeleted} from '../components/list/useDeleted'
import './target-audiences.css'

type Audience={id:number;name:string;acronym:string;deletedAt?:string|null}
type Draft={id?:number;name:string;acronym:string}

export default function TargetAudiences(){
  const cache=useQueryClient()
  const list=useQuery({queryKey:['target-audiences'],queryFn:()=>api<Audience[]>('/target-audiences')})
  const [query,setQuery]=useState(''),[status,setStatus]=useState('')
  const [editing,setEditing]=useState<Draft|null>(null),[removing,setRemoving]=useState<Audience|null>(null)
  const refresh=()=>{void cache.invalidateQueries({queryKey:['target-audiences']});void cache.invalidateQueries({queryKey:['formations']});void cache.invalidateQueries({queryKey:['formation']})}
  const save=useMutation({
    mutationFn:({id,name,acronym}:Draft)=>api('/target-audiences'+(id?'/'+id:''),{method:id?'PATCH':'POST',body:JSON.stringify({name:name.trim(),acronym:acronym.trim()}),
      headers:id?{'Content-Type':'application/merge-patch+json'}:{}}),
    onSuccess:()=>{setEditing(null);refresh()},
  })
  const remove=useMutation({mutationFn:(id:number)=>api('/target-audiences/'+id,{method:'DELETE'}),onSuccess:()=>{setRemoving(null);refresh()}})
  const deleted=useDeleted<Audience[]>('target-audiences',status)
  const source=(deleted.viewing?deleted.data:list.data)??[]
  const rows=source.filter(a=>(a.name+' '+a.acronym).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const complete=!!editing?.name.trim()&&!!editing.acronym.trim()
  const reset=()=>{setQuery('');setStatus('')}
  const open=(audience:Draft)=>{save.reset();setEditing(audience)}
  const error=list.error??deleted.error
  return <ListPage>
    <PageHeader icon="users" title="Publics cibles" subtitle="Gérez les publics proposés dans les fiches de formation." add={{label:'Ajouter un public cible',onClick:()=>open({name:'',acronym:''})}}/>
    <Filters onReset={reset}>
      <SearchField label="Rechercher un public cible" value={query} onChange={setQuery}/>
      {deleted.options.length>0&&<SelectField label="Statut" icon="done" all="En service" value={status} onChange={setStatus} options={deleted.options}/>}
    </Filters>
    {error&&<p role="alert">{error.message}</p>}
    {editing&&<form className="ls-panel audience-form" onKeyDown={e=>{if(e.key==='Escape')setEditing(null)}} onSubmit={(e:FormEvent)=>{e.preventDefault();if(complete&&!save.isPending)save.mutate(editing)}}>
      <label>Libellé *<input key={editing.id??'new'} autoFocus required maxLength={100} value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></label>
      <label className="audience-acronym">Acronyme *<input required maxLength={20} value={editing.acronym} onChange={e=>setEditing({...editing,acronym:e.target.value})}/></label>
      <button type="button" onClick={()=>setEditing(null)}>Annuler</button><button className="ls-add" disabled={!complete||save.isPending}><Save/>Enregistrer</button>
      {save.error&&<p role="alert">{save.error.message}</p>}
    </form>}
    <DataTable title="Liste des publics cibles" rows={rows} total={source.length} loading={list.isLoading||deleted.loading} filterKey={query+'|'+status} rowKey={a=>a.id} rowName={a=>a.name}
      columns={[
        {key:'id',label:'ID',sort:a=>String(a.id),render:a=>a.id},
        {key:'name',label:'Libellé',sort:a=>a.name,render:a=><strong>{a.name}</strong>},
        {key:'acronym',label:'Acronyme',sort:a=>a.acronym,render:a=>a.acronym||'—'},
        ...(deleted.viewing?[{key:'deletedAt',label:'Statut',render:(a:Audience)=><DeletedBadge at={a.deletedAt}/>}]:[]),
      ]}
      actions={deleted.viewing?undefined:a=><RowActions>
        <EditAction aria-label={'Modifier '+a.name} onClick={()=>open(a)}/>
        <DeleteAction aria-label={'Supprimer '+a.name} onClick={()=>{remove.reset();setRemoving(a)}}/>
      </RowActions>}
      empty={source.length?<EmptyState title="Aucun résultat pour ce filtre" action={{label:'Réinitialiser les filtres',onClick:reset}}/>:<EmptyState title="Aucun public cible"/>}/>
    {removing&&<ConfirmDialog title="Supprimer le public cible" pending={remove.isPending} error={remove.error?.message} onCancel={()=>setRemoving(null)} onConfirm={()=>remove.mutate(removing.id)}>
      <p>« {removing.name} » ne sera plus proposé dans les formations.</p></ConfirmDialog>}
  </ListPage>
}

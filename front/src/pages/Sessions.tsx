import {useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {useNavigate} from 'react-router-dom'
import {api} from '../api'
import {Badge,ConfirmDialog,DataTable,DeleteAction,EditAction,EmptyState,Filters,ListPage,OrgBadges,PageHeader,RowActions,SearchField,SelectField} from '../components/list/List'
import {day,phaseOf,phases,type Org,type Session} from './sessionModel'

const tones={upcoming:'blue',running:'orange',over:'grey'} as const

export default function Sessions({canWrite}:{canWrite:boolean}){
  const cache=useQueryClient(),navigate=useNavigate()
  const list=useQuery({queryKey:['sessions'],queryFn:()=>api<Session[]>('/sessions')})
  const orgs=useQuery({queryKey:['organizations'],queryFn:()=>api<Org[]>('/organizations')})
  const [query,setQuery]=useState(''),[org,setOrg]=useState(''),[phase,setPhase]=useState('')
  const [removing,setRemoving]=useState<Session|null>(null)
  const remove=useMutation({mutationFn:(id:number)=>api('/sessions/'+id,{method:'DELETE'}),onSuccess:()=>{setRemoving(null);void cache.invalidateQueries({queryKey:['sessions']})}})
  const rows=list.data??[]
  const titles=(s:Session)=>s.sessionFormations.map(f=>f.formation.title).join(', ')
  const filtered=rows.filter(s=>(!org||String(s.organization.id)===org)&&(!phase||phaseOf(s)===phase)&&(s.name+' '+titles(s)).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const reset=()=>{setQuery('');setOrg('');setPhase('')}
  const open=(s:Session)=>navigate('/sessions/'+s.id)
  const add=canWrite?{label:'Créer une session',onClick:()=>navigate('/sessions/new')}:undefined
  return <ListPage>
    <PageHeader icon="calendar" title="Sessions" subtitle="Les périodes de formation et les formations qui y sont rattachées." add={add}/>
    <Filters onReset={reset}>
      <SearchField label="Rechercher une session ou une formation" value={query} onChange={setQuery}/>
      <SelectField label="Organisme" icon="building" all="Tous les organismes" value={org} onChange={setOrg} options={(orgs.data??[]).map(o=>({value:String(o.id),label:o.name}))}/>
      <SelectField label="Période" icon="calendar" all="Toutes les périodes" value={phase} onChange={setPhase} options={Object.entries(phases).map(([value,label])=>({value,label}))}/>
    </Filters>
    {list.error&&<p role="alert">{list.error.message}</p>}
    <DataTable title="Liste des sessions" rows={filtered} total={rows.length} loading={list.isLoading} filterKey={[query,org,phase].join('|')} rowKey={s=>s.id} rowName={s=>s.name}
      columns={[
        {key:'name',label:'Session',sort:s=>s.name,render:s=><strong>{s.name}</strong>},
        {key:'organization',label:'Organisme',sort:s=>s.organization.name,render:s=><OrgBadges organizations={[{...s.organization,...orgs.data?.find(o=>o.id===s.organization.id)}]}/>},
        {key:'startsOn',label:'Début',sort:s=>s.startsOn,render:s=>day(s.startsOn)},
        {key:'endsOn',label:'Fin',sort:s=>s.endsOn,render:s=>day(s.endsOn)},
        {key:'formations',label:'Formations',sort:titles,render:s=>s.sessionFormations.length?<span className="ls-clip" title={titles(s)}>{titles(s)}</span>:'Aucune'},
        {key:'phase',label:'Statut',sort:s=>phaseOf(s),render:s=><Badge tone={tones[phaseOf(s)]}>{phases[phaseOf(s)]}</Badge>},
      ]}
      actions={s=><RowActions>
        <EditAction label={canWrite?'Ouvrir':'Voir'} aria-label={'Ouvrir '+s.name} onClick={()=>open(s)}/>
        {canWrite&&<DeleteAction aria-label={'Supprimer '+s.name} onClick={()=>{remove.reset();setRemoving(s)}}/>}
      </RowActions>}
      empty={rows.length?<EmptyState title="Aucun résultat pour ce filtre" action={{label:'Réinitialiser les filtres',onClick:reset}}/>:<EmptyState title="Aucune session" action={add}/>}/>
    {removing&&<ConfirmDialog title="Supprimer la session" pending={remove.isPending} error={remove.error?.message} onCancel={()=>setRemoving(null)} onConfirm={()=>remove.mutate(removing.id)}>
      <p>« {removing.name} » ne sera plus proposée.</p></ConfirmDialog>}
  </ListPage>
}

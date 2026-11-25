import {useRef,useState} from 'react'
import {useMutation,useQueryClient} from '@tanstack/react-query'
import {Activity,Building2,CalendarDays,Check,Clock,GraduationCap,House,Layers,Save,Settings,ShieldCheck,UserRound,Users,Video} from 'lucide-react'
import {api} from '../api'
import {userRoles,useCustomRoles,type CustomRole} from './userRoles'
import {Badge,DataTable,EditAction,EmptyState,Filters,ListPage,LockedAction,PageHeader,RowActions,SearchField,SelectField} from '../components/list/List'
import './roles.css'

const sections=[
  {title:'Exploitation',items:[['DASHBOARD',House],['PLANNING',CalendarDays],['CLASSES',Video],['LEARNERS',Users],['LIVE',Activity]]},
  {title:'Paramétrage',items:[['TRAININGS',GraduationCap],['TIME_SLOTS',Clock],['TRAINERS',UserRound]]},
  {title:'Administration',items:[['ORGANIZATIONS',Building2],['CONFIGS',Settings]]},
] as const
const actions:Record<string,string[]>={CLASSES:['ENROLL'],TRAININGS:['EDIT_TRAININGS'],ORGANIZATIONS:['EDIT_ORGANIZATIONS'],CONFIGS:['EDIT_CONFIGS']}
function permissionsFor(keys:string[]) {
  const permissions=new Set(keys.flatMap(key=>[key,...(actions[key]??[])]))
  if(keys.includes('LIVE')||keys.includes('LEARNERS')) permissions.add('REMIND')
  if(keys.includes('TRAINERS')&&keys.includes('TRAININGS')) permissions.add('EDIT_TRAINERS')
  if(['PLANNING','CLASSES','TRAININGS','TRAINERS','TIME_SLOTS'].every(key=>permissions.has(key))) permissions.add('SCHEDULE')
  return [...permissions]
}
export default function RoleSettings(){
  const directory=useCustomRoles(), client=useQueryClient()
  const [search,setSearch]=useState(''),[type,setType]=useState('')
  const [id,setId]=useState<number>(),[name,setName]=useState(''),[keys,setKeys]=useState<string[]>([]),[changed,setChanged]=useState(false)
  const [notice,setNotice]=useState('')
  const input=useRef<HTMLInputElement>(null)
  const custom=directory.data?.roles??[]
  const labels=directory.data?.permissions??{}
  function effective(role:CustomRole){
    return [...new Set(role.permissions.flatMap(key=>[key,...(directory.data?.dependencies[key]??[])]))]
  }
  function edit(role?:CustomRole){
    setId(role?.id);setName(role?.name??'');setKeys(role?effective(role).filter(key=>sections.some(group=>group.items.some(([value])=>value===key))):[])
    setChanged(false);setNotice('');save.reset();input.current?.focus()
  }
  const save=useMutation({
    mutationFn:()=>api('/custom-roles',{method:'POST',body:JSON.stringify({id,name,permissions:(!changed&&id?custom.find(role=>role.id===id)?.permissions:undefined)??permissionsFor(keys)})}),
    onSuccess:async()=>{await client.invalidateQueries({queryKey:['custom-roles']});edit();setNotice('Rôle enregistré.')},
  })
  const rows=[...userRoles.map(role=>({name:role.label,role:undefined as CustomRole|undefined})),...custom.map(role=>({name:role.name,role}))]
  const visible=rows.filter(row=>row.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())&&(!type||type===(row.role?'custom':'system')))
  const reset=()=>{setSearch('');setType('')}
  return <ListPage>
    <PageHeader icon="shield" title="Rôles et permissions" subtitle="Gérez les accès aux rubriques de Sofia." add={{label:'Créer un rôle',onClick:()=>edit()}}/>
    <div className="roles-work"><div className="roles-left">
      <div className="roles-stats">{[[Users,'Rôles',rows.length],[ShieldCheck,'Rôles système',userRoles.length],[Layers,'Personnalisés',custom.length]].map(([IconValue,label,count])=>{
        const Icon=IconValue as typeof Users
        return <div key={String(label)}><Icon/><span><strong>{directory.data?String(count):'—'}</strong>{String(label)}</span></div>
      })}</div>
      <Filters onReset={reset}>
        <SearchField label="Rechercher un rôle" value={search} onChange={setSearch}/>
        <SelectField label="Type de rôle" icon="tag" all="Tous les types" value={type} onChange={setType} options={[{value:'system',label:'Système'},{value:'custom',label:'Personnalisé'}]}/>
      </Filters>
      {directory.error&&<p role="alert">{directory.error.message}</p>}
      <DataTable title="Liste des rôles" rows={visible} total={rows.length} loading={directory.isLoading} filterKey={search+'|'+type} rowKey={r=>r.role?.id??r.name} rowName={r=>r.name}
        columns={[
          {key:'name',label:'Nom du rôle',sort:r=>r.name,render:r=><strong>{r.name}</strong>},
          {key:'type',label:'Type',sort:r=>r.role?'Personnalisé':'Système',render:r=><Badge tone={r.role?'purple':'blue'}>{r.role?'Personnalisé':'Système'}</Badge>},
        ]}
        actions={r=><RowActions>{r.role?<EditAction aria-label={'Modifier '+r.name} onClick={()=>edit(r.role)}/>:<LockedAction/>}</RowActions>}
        empty={<EmptyState title="Aucun résultat pour ce filtre" text="Modifiez votre recherche ou le type de rôle sélectionné." action={{label:'Réinitialiser les filtres',onClick:reset}}/>}/>
    </div>
    <form className="roles-card roles-editor" onSubmit={e=>{e.preventDefault();save.mutate()}}>
      <header><ShieldCheck/><h2>{id?'Modifier le rôle':'Créer un rôle personnalisé'}</h2></header>
      <label className="roles-name">Nom du rôle<input ref={input} required maxLength={100} placeholder="Ex. Coordinateur DPC" value={name} onChange={e=>{setName(e.target.value);setNotice('')}}/></label>
      <h3>Rubriques autorisées</h3><p>Activez les rubriques accessibles dans les organismes de l’utilisateur.</p>
      {sections.map(group=><fieldset key={group.title}><legend>{group.title}</legend>{group.items.map(([key,Icon])=><label key={key}><Icon/>{labels[key]??'…'}<input type="checkbox" role="switch" checked={keys.includes(key)} onChange={e=>{setChanged(true);setKeys(e.target.checked?[...keys,key]:keys.filter(item=>item!==key))}}/></label>)}</fieldset>)}
      {save.error&&<p role="alert">{save.error.message}</p>}{notice&&<p role="status"><Check/>{notice}</p>}
      <footer><button type="button" onClick={()=>edit()}>Annuler</button><button className="roles-primary" disabled={!directory.data||save.isPending}><Save/>{id?'Enregistrer':'Créer le rôle'}</button></footer>
    </form></div>
  </ListPage>
}

import {useRef,useState} from 'react'
import {useMutation,useQueryClient} from '@tanstack/react-query'
import {Activity,Building2,CalendarDays,Check,ChevronLeft,ChevronRight,Clock,GraduationCap,House,Layers,List,LockKeyhole,Pencil,Plus,Save,Search,SearchX,Settings,ShieldCheck,UserRound,Users,Video} from 'lucide-react'
import {api} from '../api'
import {userRoles,useCustomRoles,type CustomRole} from './userRoles'
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
  const [page,setPage]=useState(1),[size,setSize]=useState(10)
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
  const last=Math.max(1,Math.ceil(visible.length/size)),current=Math.min(page,last),shown=visible.slice((current-1)*size,current*size)
  return <section className="roles-work">
    <div className="roles-left"><header className="roles-title"><ShieldCheck/><div><h1>Rôles et permissions</h1><p>Gérez les accès aux rubriques de Sofia.</p></div></header>
      <div className="roles-stats">{[[Users,'Rôles',rows.length],[ShieldCheck,'Rôles système',userRoles.length],[Layers,'Personnalisés',custom.length]].map(([IconValue,label,count])=>{
        const Icon=IconValue as typeof Users
        return <div key={String(label)}><Icon/><span><strong>{directory.data?String(count):'—'}</strong>{String(label)}</span></div>
      })}</div>
      <section className="roles-card"><header><List/><h2>Rôles existants</h2><button type="button" className="roles-primary" onClick={()=>edit()}><Plus/>Créer un rôle</button></header>
        <div className="roles-filters"><label><Search/><input aria-label="Rechercher un rôle" placeholder="Rechercher un rôle…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></label>
          <select aria-label="Type de rôle" value={type} onChange={e=>{setType(e.target.value);setPage(1)}}><option value="">Tous les types</option><option value="system">Système</option><option value="custom">Personnalisé</option></select></div>
        {directory.error&&<p role="alert">{directory.error.message}</p>}
        {visible.length>0&&<table><thead><tr><th>Nom du rôle</th><th>Type</th><th>Action</th></tr></thead><tbody>{shown.map(({name,role})=><tr key={role?.id??name}><td>{name}</td><td><span className="roles-badge">{role?'Personnalisé':'Système'}</span></td><td>{role?<button type="button" aria-label={'Modifier '+name} onClick={()=>edit(role)}><Pencil/></button>:<LockKeyhole aria-label="Rôle protégé"/>}</td></tr>)}</tbody></table>}
        {visible.length>0&&<footer className="roles-pages"><span>{visible.length} résultats sur {rows.length}</span><select aria-label="Résultats par page" value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1)}}>{[10,25,50].map(n=><option value={n} key={n}>{n} par page</option>)}</select><button type="button" disabled={current===1} onClick={()=>setPage(current-1)} aria-label="Précédent"><ChevronLeft/></button><b aria-current="page">{current} / {last}</b><button type="button" disabled={current===last} onClick={()=>setPage(current+1)} aria-label="Suivant"><ChevronRight/></button></footer>}
        {!visible.length&&directory.isLoading&&<p role="status">Chargement des rôles…</p>}
        {!visible.length&&directory.data&&!directory.error&&<div className="od-empty" role="status">
          <i><SearchX aria-hidden="true"/></i><h2>Aucun résultat</h2>
          <p>Modifiez votre recherche ou le type de rôle sélectionné.</p>
          <button type="button" onClick={()=>{setSearch('');setType('');setPage(1)}}>Réinitialiser les filtres</button>
        </div>}
      </section>
    </div>
    <form className="roles-card roles-editor" onSubmit={e=>{e.preventDefault();save.mutate()}}>
      <header><ShieldCheck/><h2>{id?'Modifier le rôle':'Créer un rôle personnalisé'}</h2></header>
      <label className="roles-name">Nom du rôle<input ref={input} required maxLength={100} placeholder="Ex. Coordinateur DPC" value={name} onChange={e=>{setName(e.target.value);setNotice('')}}/></label>
      <h3>Rubriques autorisées</h3><p>Activez les rubriques accessibles dans les organismes de l’utilisateur.</p>
      {sections.map(group=><fieldset key={group.title}><legend>{group.title}</legend>{group.items.map(([key,Icon])=><label key={key}><Icon/>{labels[key]??'…'}<input type="checkbox" role="switch" checked={keys.includes(key)} onChange={e=>{setChanged(true);setKeys(e.target.checked?[...keys,key]:keys.filter(item=>item!==key))}}/></label>)}</fieldset>)}
      {save.error&&<p role="alert">{save.error.message}</p>}{notice&&<p role="status"><Check/>{notice}</p>}
      <footer><button type="button" onClick={()=>edit()}>Annuler</button><button className="roles-primary" disabled={!directory.data||save.isPending}><Save/>{id?'Enregistrer':'Créer le rôle'}</button></footer>
    </form>
  </section>
}

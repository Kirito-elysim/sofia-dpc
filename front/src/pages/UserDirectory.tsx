import {useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {ClipboardCheck,Crown,Eye,LogIn,Shield,type LucideIcon} from 'lucide-react'
import {useNavigate} from 'react-router-dom'
import {api,impersonate,type Me} from '../api'
import {ActiveBadge,Badge,ConfirmDialog,DeletedBadge,DataTable,DeleteAction,EditAction,EmptyState,Filters,IconAction,ListPage,OrgBadges,PageHeader,RowActions,SearchField,SelectField,ToggleAction} from '../components/list/List'
import {useDeleted} from '../components/list/useDeleted'

type Org = {id:number;name:string;code?:string;color?:string|null}
type Row = {id:number;name:string;email:string;role:string;assignedRole?:string;active:boolean;deletedAt?:string|null;lastLoginAt:string|null;organizations?:Org[];organization?:Org|null}
type Option = {value:string;label:string}
const roleLooks:Record<string,{icon:LucideIcon;tone:'purple'|'blue'|'grey'}>={ROLE_SUPER_ADMIN:{icon:Crown,tone:'purple'},ROLE_ADMIN:{icon:Shield,tone:'blue'},ROLE_SUIVI:{icon:ClipboardCheck,tone:'blue'},ROLE_LECTURE:{icon:Eye,tone:'grey'}}
function memberships(row:Row):Org[] {
  return row.organizations?.length ? row.organizations : row.organization ? [row.organization] : []
}
function lastLogin(value:string|null){
  if(!value)return '—'
  const date=new Date(value),today=new Date(),yesterday=new Date()
  yesterday.setDate(today.getDate()-1)
  const day=date.toDateString()===today.toDateString()?'Aujourd’hui':date.toDateString()===yesterday.toDateString()?'Hier':'Le '+date.toLocaleDateString('fr-FR',{day:'numeric',month:'short'})
  return day+' à '+date.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})
}
export default function UserDirectory({rows:accounts,roles,loading}:{rows:Row[];roles:Option[];loading?:boolean}){
  // Trainer-only accounts are managed from the trainer sheet.
  const rows=accounts.filter(r=>r.role!=='ROLE_FORMATEUR')
  const navigate=useNavigate(),qc=useQueryClient()
  const orgs=useQuery({queryKey:['organizations'],queryFn:()=>api<Org[]>('/organizations')})
  const [query,setQuery]=useState(''),[org,setOrg]=useState(''),[role,setRole]=useState(''),[status,setStatus]=useState('')
  const deleted=useDeleted<Row[]>('users',status)
  const source=deleted.viewing?(deleted.data??[]).filter(r=>r.role!=='ROLE_FORMATEUR'):rows
  const update=useMutation({mutationFn:(r:Row)=>api('/users/'+r.id,{method:'PATCH',headers:{'Content-Type':'application/merge-patch+json'},body:JSON.stringify({active:!r.active})}),onSuccess:()=>qc.invalidateQueries({queryKey:['users']})})
  const borrow=useMutation({mutationFn:impersonate})
  const me=useQuery({queryKey:['me'],queryFn:()=>api<Me>('/auth/me')})
  const [removing,setRemoving]=useState<Row|null>(null)
  const remove=useMutation({mutationFn:(r:Row)=>api('/users/'+r.id,{method:'DELETE'}),onSuccess:async()=>{await qc.invalidateQueries({queryKey:['users']});setRemoving(null)}})
  const roleName=(r:Row)=>roles.find(o=>o.value===(r.assignedRole??r.role))?.label??r.role
  // The list only carries ids and names: colours come from the organization records.
  const coloured=(r:Row)=>memberships(r).map(o=>({...o,...orgs.data?.find(item=>item.id===o.id)}))
  const filtered=source.filter(r=>(!org||memberships(r).some(o=>String(o.id)===org))&&(!role||(r.assignedRole??r.role)===role)&&(!status||deleted.viewing||String(r.active)===status)&&(r.name+' '+r.email).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const reset=()=>{setQuery('');setOrg('');setRole('');setStatus('')}
  const add=()=>navigate('/settings/users/new')
  return <ListPage>
    <PageHeader icon="users" title="Utilisateurs" subtitle="Gérez les utilisateurs, leurs rôles et leurs accès à la plateforme." add={{label:'Ajouter un utilisateur',onClick:add}}/>
    <Filters onReset={reset}>
      <SearchField label="Rechercher un utilisateur" value={query} onChange={setQuery}/>
      <SelectField label="Organisme" icon="building" all="Tous les organismes" value={org} onChange={setOrg} options={orgs.data?.map(o=>({value:String(o.id),label:o.name}))??[]}/>
      <SelectField label="Rôle" icon="trainer" all="Tous les rôles" value={role} onChange={setRole} options={roles}/>
      <SelectField label="Statut" icon="done" all="Tous les statuts" value={status} onChange={setStatus} options={[{value:'true',label:'Actif'},{value:'false',label:'Inactif'},...deleted.options]}/>
    </Filters>
    {deleted.error&&<p role="alert">{deleted.error.message}</p>}
    {(update.error||borrow.error)&&<p role="alert">{(update.error||borrow.error)?.message}</p>}
    <DataTable title="Liste des utilisateurs" rows={filtered} total={source.length} loading={loading||deleted.loading} filterKey={[query,org,role,status].join('|')} rowKey={r=>r.id} rowName={r=>r.name}
      columns={[
        {key:'name',label:'Nom',sort:r=>r.name,render:r=><strong className="ls-clip" title={r.name}>{r.name}</strong>},
        {key:'email',label:'Email',sort:r=>r.email,render:r=><span className="ls-clip" title={r.email}>{r.email}</span>},
        {key:'role',label:'Rôle',sort:roleName,render:r=>{const look=roleLooks[r.role]??roleLooks.ROLE_LECTURE;return <Badge tone={look.tone} icon={look.icon}>{roleName(r)}</Badge>}},
        {key:'organization',label:'Organisme',sort:r=>memberships(r).map(o=>o.name).join(', '),render:r=>r.role==='ROLE_SUPER_ADMIN'?'Tous':<OrgBadges organizations={coloured(r)}/>},
        {key:'lastLoginAt',label:'Dernière connexion',sort:r=>r.lastLoginAt??'',render:r=>lastLogin(r.lastLoginAt)},
        {key:'active',label:'Statut',sort:r=>String(r.active),render:r=>deleted.viewing?<DeletedBadge at={r.deletedAt}/>:<ActiveBadge active={r.active}/>},
      ]}
      actions={deleted.viewing?undefined:r=><RowActions>
        <EditAction aria-label={'Modifier '+r.name} onClick={()=>navigate('/settings/users/'+r.id+'/edit')}/>
        <ToggleAction active={r.active} disabled={update.isPending} onClick={()=>update.mutate(r)}/>
        <DeleteAction aria-label={'Supprimer '+r.name} disabled={r.email===me.data?.email} title={r.email===me.data?.email?'Vous ne pouvez pas supprimer votre propre compte':undefined} onClick={()=>{remove.reset();setRemoving(r)}}/>
        <IconAction icon={LogIn} disabled={!r.active||r.role==='ROLE_SUPER_ADMIN'||borrow.isPending} onClick={()=>borrow.mutate(r.id)} aria-label={'Se connecter en tant que '+r.name} title={r.role==='ROLE_SUPER_ADMIN'?'Impossible pour un super admin':!r.active?'Compte désactivé':'Se connecter en tant que'}/>
      </RowActions>}
      empty={<EmptyState title="Aucun résultat pour ce filtre" text="Aucun utilisateur ne correspond à vos critères de recherche." action={{label:'Réinitialiser les filtres',onClick:reset}}/>}/>
    {removing&&<ConfirmDialog title="Supprimer ce compte ?" pending={remove.isPending} error={remove.error?.message} onCancel={()=>setRemoving(null)} onConfirm={()=>remove.mutate(removing)}>
      <p><b>{removing.name}</b><br/>{removing.email}</p>
      <p>Le compte quitte la liste et ne peut plus se connecter. Son historique reste au journal d’audit et son adresse e-mail reste réservée.</p>
    </ConfirmDialog>}
  </ListPage>
}

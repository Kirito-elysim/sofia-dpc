import {useState,type FormEvent,type ReactNode} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {ArrowLeft,Check,ChevronDown,Pencil,Upload,X,Info,LockKeyhole,Mail,Save,ShieldCheck,UserRound,UserRoundPlus} from 'lucide-react'
import {Link,Navigate,useNavigate,useParams} from 'react-router-dom'
import {api,type Me} from '../api'
import {rolePayload,useCustomRoles,staffRoles} from './userRoles'
import './create-user.css'

const listPath='/settings/users'
const staffPermissions=['Tableau de bord et planning','Consultation des classes et des apprenants']
const followUpPermissions=[...staffPermissions,'Suivi des classes et inscriptions']
const adminPermissions=[...followUpPermissions,'Création de classes et gestion des référentiels']
const permissionsByRole: Record<string,string[]> = {
  ROLE_SUPER_ADMIN:[...adminPermissions,'Gestion des utilisateurs, des rôles et des comptes Zoom','Journal d’audit et modèles de messages'],
  ROLE_ADMIN:adminPermissions,
  ROLE_SUIVI:followUpPermissions,
  ROLE_LECTURE:staffPermissions,
}

function Card({title,icon,children}:{title:string;icon:ReactNode;children:ReactNode}) {
  return <section className="uc-card"><h2><i>{icon}</i>{title}</h2>{children}</section>
}

type Account={id:number;name:string;email:string;phone?:string|null;jobTitle?:string|null;active:boolean;role:string;assignedRole?:string;profilePhoto?:string|null;organizations?:{id:number}[];organization?:{id:number}|null}

export function EditUser() {
  const {id}=useParams()
  // Always refetched: the form copies these values once, so a stale copy would be saved back.
  const user=useQuery({queryKey:['users',id],queryFn:()=>api<Account>('/users/'+id),gcTime:0})
  if(user.isError)return <p role="alert" className="uc-error">{user.error.message}</p>
  if(!user.data)return <p>Chargement…</p>
  if(user.data.role==='ROLE_FORMATEUR')return <Navigate to={listPath} replace/>
  return <UserForm key={user.data.id} user={user.data}/>
}

export default function CreateUser() {
  return <UserForm/>
}

function UserForm({user}:{user?:Account}) {
  const me=useQuery({queryKey:['me'],queryFn:()=>api<Me>('/auth/me')})
  const self=!!user&&user.email===me.data?.email
  const [first,...rest]=user?.name.split(' ')??['']
  const navigate=useNavigate()
  const client=useQueryClient()
  const [firstName,setFirstName]=useState(first)
  const [lastName,setLastName]=useState(rest.join(' '))
  const customRoles=useCustomRoles()
  const options=[...staffRoles,...(customRoles.data?.roles.map(item=>({value:'custom:'+item.id,label:item.name}))??[])]
  const [role,setRole]=useState(user?.assignedRole??user?.role??'')
  const [organizations,setOrganizations]=useState<string[]>(()=>(user?.organizations?.length?user.organizations:user?.organization?[user.organization]:[]).map(org=>String(org.id)))
  const [orgSearch,setOrgSearch]=useState('')
  const [photo,setPhoto]=useState<string|null>(user?.profilePhoto??null)
  const [photoError,setPhotoError]=useState('')
  const [photoLoading,setPhotoLoading]=useState(false)
  const [sendAccess,setSendAccess]=useState(true)
  const customRole=customRoles.data?.roles.find(item=>'custom:'+item.id===role)
  const permissions=customRole
    ? [...new Set(customRole.permissions.flatMap(key=>[key,...(customRoles.data?.dependencies[key]??[])]))].map(key=>customRoles.data?.permissions[key])
    : permissionsByRole[role]??[]
  const isGlobal=role==='ROLE_SUPER_ADMIN'
  const orgs=useQuery({queryKey:['organizations'],queryFn:()=>api<{id:number;name:string}[]>('/organizations')})
  const create=useMutation({
    mutationFn:(body:object)=>user
      ?api('/users/'+user.id,{method:'PATCH',headers:{'Content-Type':'application/merge-patch+json'},body:JSON.stringify(body)})
      :api('/users',{method:'POST',body:JSON.stringify(body)}),
    onSuccess:async()=>{
      await client.invalidateQueries({queryKey:['users']})
      if(self)await client.invalidateQueries({queryKey:['me']})
      navigate(listPath)
    },
  })
  const resend=useMutation({mutationFn:()=>api('/users/'+user!.id+'/access',{method:'POST'})})
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(create.isPending)return
    const form=new FormData(event.currentTarget)
    create.mutate({
      name:[firstName.trim(),lastName.trim()].filter(Boolean).join(' '),
      email:String(form.get('email')??'').trim(),
      phone:form.get('phone')||null, jobTitle:form.get('jobTitle')||null,
      // The server refuses a change of one's own role or status.
      ...(self?{}:{...rolePayload(role), active:form.has('active')}),
      ...(photo===(user?.profilePhoto??null)&&user?{}:{profilePhoto:photo}),
      organizations:isGlobal?[]:organizations.map(id=>'/api/organizations/'+id),
      ...(user?{}:{plainPassword:sendAccess?Array.from(crypto.getRandomValues(new Uint8Array(18)),byte=>byte.toString(16).padStart(2,'0')).join(''):form.get('plainPassword'), sendAccess}),
    })
  }
  return <section className="user-create">
    <nav aria-label="Retour à la liste"><Link to={listPath}><ArrowLeft aria-hidden="true"/>Utilisateurs</Link></nav>
    <header className="uc-heading"><i><UserRoundPlus aria-hidden="true"/></i><div><h1>{user?'Modifier un utilisateur':'Créer un utilisateur'}</h1><p>{user?'Mettez à jour le compte et ses accès à Sofia.':'Ajoutez un compte et définissez ses accès à Sofia.'}</p></div></header>
    <form onSubmit={submit}>
      <div className="uc-layout">
        <div className="uc-stack">
          <Card title="Informations générales" icon={<UserRoundPlus aria-hidden="true"/>}>
            <div className="uc-fields">
              <label>Prénom <em>*</em><input autoComplete="section-newuser given-name" required maxLength={149} placeholder="Ex. Charles" value={firstName} onChange={e=>setFirstName(e.target.value)}/><small>Prénom affiché sur le profil.</small></label>
              <label>Nom {!user&&<em>*</em>}<input autoComplete="section-newuser family-name" required={!user} maxLength={149} placeholder="Ex. Mouna" value={lastName} onChange={e=>setLastName(e.target.value)}/><small>Nom de famille affiché dans les listes.</small></label>
              <label>E-mail <em>*</em><span className="uc-input-icon"><Mail aria-hidden="true"/><input name="email" type="email" defaultValue={user?.email} required maxLength={180} placeholder="Ex. charles@exemple.fr" autoComplete="section-newuser email"/></span><small>Adresse utilisée pour se connecter et recevoir les accès.</small></label>
              <label>Téléphone<input name="phone" defaultValue={user?.phone??''} type="tel" maxLength={40} placeholder="Ex. 06 12 34 56 78"/><small>Numéro de contact professionnel, facultatif.</small></label>
              <fieldset className="uc-orgs"><legend>Organismes {isGlobal?'':'*'}</legend>
                {isGlobal?'Tous les organismes':<>
                  <details className="uc-org-select" onKeyDown={event=>{
                    if(event.key==='Escape'){
                      event.currentTarget.open=false
                      event.currentTarget.querySelector('summary')?.focus()
                    }
                  }}>
                    <summary>{organizations.length ? `${organizations.length} sélectionné(s)` : 'Sélectionner des organismes'}<ChevronDown aria-hidden="true"/></summary>
                    <div className="uc-org-options">
                      <input aria-label="Rechercher un organisme" placeholder="Rechercher…" value={orgSearch} onChange={event=>setOrgSearch(event.target.value)}/>
                      {orgs.data?.filter(org=>org.name.toLocaleLowerCase().includes(orgSearch.trim().toLocaleLowerCase())).map(org=>{
                        const id=String(org.id)
                        const selected=organizations.includes(id)
                        return <button key={id} type="button" aria-pressed={selected} onClick={()=>{
                          setOrganizations(ids=>selected?ids.filter(value=>value!==id):[...ids,id])
                        }}>{org.name}{selected&&<Check aria-hidden="true"/>}</button>
                      })}
                      {!orgs.data?.some(org=>org.name.toLocaleLowerCase().includes(orgSearch.trim().toLocaleLowerCase()))&&<small>{orgs.isLoading?'Chargement…':'Aucun organisme trouvé.'}</small>}
                    </div>
                  </details>
                  <div className="uc-org-tags">{orgs.data?.filter(org=>organizations.includes(String(org.id))).map(org=><button key={org.id} type="button" aria-label={`Retirer ${org.name}`} onClick={()=>{setOrganizations(ids=>ids.filter(id=>id!==String(org.id)))}}>{org.name}<X aria-hidden="true"/></button>)}</div>
                </>}
                <small>{orgs.isError?'Chargement impossible.':isGlobal?'Le super administrateur dispose d’un accès global.':'Recherchez et sélectionnez un ou plusieurs organismes.'}</small>
              </fieldset>
              <label>Fonction<input name="jobTitle" defaultValue={user?.jobTitle??''} maxLength={150} placeholder="Ex. Responsable DPC"/><small>Intitulé du poste, indépendant des permissions.</small></label>
            </div>
          </Card>
          <Card title="Accès et rôle" icon={<LockKeyhole aria-hidden="true"/>}>
            <div className="uc-fields">
              <label>Rôle <em>*</em><select required disabled={self} value={role} onChange={e=>{setRole(e.target.value)}}>
                <option value="">Sélectionner un rôle</option>
                {options.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
              </select><small>{self?'Vous ne pouvez pas modifier votre propre rôle.':'Choisissez le niveau d’accès au back-office.'}</small></label>
              <p className="uc-note"><Info aria-hidden="true"/>Le rôle détermine les actions disponibles.</p>
              <label className="uc-active">Statut du compte<span><input type="checkbox" name="active" disabled={self} defaultChecked={user?.active??true}/> Compte actif</span><small>{self?'Vous ne pouvez pas désactiver votre propre compte.':'Un compte actif peut se connecter.'}</small></label>
              {!user&&<label className="uc-active">Envoi des accès<span><input type="checkbox" checked={sendAccess} onChange={e=>setSendAccess(e.target.checked)}/> Envoyer par e-mail</span><small>Envoie un mot de passe temporaire à l’adresse du compte.</small></label>}
              {!user&&!sendAccess&&<label className="uc-wide">Mot de passe temporaire <em>*</em><input type="text" name="plainPassword" autoComplete="off" spellCheck={false} required minLength={12} maxLength={4096}/><small>Saisissez au moins 12 caractères et communiquez-les à l’utilisateur. Il devra changer son mot de passe à sa première connexion.</small></label>}
            </div>
            {user&&!self&&<div className="uc-resend">
              <strong>Mot de passe</strong>
              <button type="button" disabled={!user.active||resend.isPending} onClick={()=>{
                if(window.confirm('Envoyer un nouveau mot de passe temporaire à '+user.email+' ? L’ancien ne fonctionnera plus.'))resend.mutate()
              }}><Mail aria-hidden="true"/>{resend.isPending?'Envoi…':'Renvoyer un mot de passe temporaire'}</button>
              <small>{user.active?'Envoyé à l’adresse enregistrée du compte. Il devra être changé à la prochaine connexion.':'Activez et enregistrez le compte avant l’envoi.'}</small>
              {resend.isSuccess&&<p role="status">Mot de passe temporaire envoyé à {user.email}.</p>}
              {resend.isError&&<p role="alert" className="uc-error">{resend.error.message}</p>}
            </div>}
            {role&&!isGlobal&&<p className="uc-note uc-scope"><Info aria-hidden="true"/>Les permissions du rôle s’appliquent dans tous les organismes sélectionnés.</p>}
          </Card>
        </div>
        <aside className="uc-stack">
          <Card title="Profil utilisateur" icon={<UserRound aria-hidden="true"/>}>
            <div className="uc-profile-picker">
              <label className="uc-avatar" htmlFor="user-photo" aria-label="Choisir une photo de profil">
                {photo?<img src={photo} alt="Aperçu de la photo de profil"/>:<UserRound aria-hidden="true"/>}
                <i><Pencil aria-hidden="true"/></i>
              </label>
              <div><strong>Photo de profil</strong><p>JPG ou PNG (max. 2 Mo)</p>
              <div className="uc-photo">
              <label><Upload aria-hidden="true"/> {photo?'Remplacer le fichier':'Choisir un fichier'}
                <input id="user-photo" type="file" accept="image/jpeg,image/png" disabled={photoLoading} onChange={event=>{
                  const file=event.target.files?.[0]
                  event.target.value=''
                  if(!file)return
                  setPhotoError('')
                  if(!['image/jpeg','image/png'].includes(file.type)||file.size>2*1024*1024){
                    setPhotoError('Choisissez une image JPG ou PNG de 2 Mo maximum.')
                    return
                  }
                  const reader=new FileReader()
                  setPhotoLoading(true)
                  reader.onload=()=>{setPhoto(String(reader.result));setPhotoLoading(false)}
                  reader.onerror=()=>{setPhotoError('Impossible de lire la photo.');setPhotoLoading(false)}
                  reader.readAsDataURL(file)
                }}/>
              </label>
              {photo&&<button type="button" onClick={()=>{setPhoto(null);setPhotoError('')}} disabled={photoLoading}>Retirer</button>}
            </div>
            </div></div>
            {photoError&&<p className="uc-error" role="alert">{photoError}</p>}

          </Card>
          <Card title="Permissions selon le rôle" icon={<ShieldCheck aria-hidden="true"/>}>
            {role?<ul className="uc-rights">{permissions.map(permission=><li key={permission}><Check aria-hidden="true"/>{permission}</li>)}</ul>:<p className="uc-permissions-empty">Sélectionnez un rôle pour afficher ses permissions.</p>}
          </Card>
        </aside>
      </div>
      {create.isError&&<p role="alert" className="uc-error">{create.error.message}</p>}
      <footer className="uc-card uc-footer"><Link to={listPath}>Annuler</Link><button className="page-add" disabled={create.isPending||photoLoading||!role||(!isGlobal&&(!orgs.data||!organizations.length))||firstName.trim().length+lastName.trim().length+1>150}><Save aria-hidden="true"/>{user?(create.isPending?'Enregistrement…':'Enregistrer'):(create.isPending?'Création…':'Créer l’utilisateur')}</button></footer>
    </form>
  </section>
}

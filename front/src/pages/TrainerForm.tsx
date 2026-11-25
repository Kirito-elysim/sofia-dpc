import {useState,type FormEvent} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {Briefcase,Building2,CalendarCheck,ChevronRight,Clock,FileText,GraduationCap,IdCard,Info,KeyRound,Mail,Phone,Save,Stethoscope,Upload,UserRound,UserRoundPlus,Video} from 'lucide-react'
import {Link,useLocation,useNavigate,useParams} from 'react-router-dom'
import {api} from '../api'
import {Card,OrganizationPicker,PhotoPicker,useOrganizations} from './FormParts'
import './create-user.css'
import './trainer-form.css'

const listPath='/settings/trainers'
const professions=['Médecin','Pharmacien','Chirurgien-dentiste','Sage-femme','Infirmier','Masseur-kinésithérapeute','Autre']
const formatLabels={VIRTUAL_CLASS:'Classe virtuelle',ELEARNING:'E-learning',INTEGRATED:'Programme intégré'}
const documents=[['cv','CV',FileText],['contract','Convention / contrat',FileText]] as const
const accessMessages:Record<string,string>={created:'Accès créé, invitation envoyée.',sent:'Nouveau mot de passe temporaire envoyé.',linked:'Formateur rattaché au compte existant : « Mes classes » est ajouté à ce compte.',enabled:'Accès activé.',disabled:'Accès désactivé.'}

type Trainer={id:number;firstName:string;lastName:string;email:string;phone?:string|null;profession?:string|null;specialty?:string|null;rppsNumber?:string|null;active:boolean;formats?:string[];biography?:string|null;comments?:string|null;photo?:string|null;updatedAt?:string|null;organizations?:{id:number}[]}
type Account={trainerId:number;staff:boolean;active:boolean}
type Files=Partial<Record<string,File|null>>

async function grantAccess(id:number,active?:boolean){
  const {result}=await api<{result:string}>('/trainers/'+id+'/access',active===undefined?{method:'POST'}:{method:'PATCH',headers:{'Content-Type':'application/merge-patch+json'},body:JSON.stringify({active})})
  return accessMessages[result]
}

export function EditTrainer() {
  const {id}=useParams()
  // Always refetched: the form copies these values once, so a stale copy would be saved back.
  const trainer=useQuery({queryKey:['trainers',id],queryFn:()=>api<Trainer>('/trainers/'+id),gcTime:0})
  if(trainer.isError)return <p role="alert">{trainer.error.message}</p>
  if(!trainer.data)return <p>Chargement…</p>
  return <TrainerForm key={trainer.data.id} trainer={trainer.data}/>
}

export default function CreateTrainer() {
  return <TrainerForm/>
}

function TrainerForm({trainer}:{trainer?:Trainer}) {
  const navigate=useNavigate(),client=useQueryClient()
  const [organizations,setOrganizations]=useState<string[]>(()=>trainer?.organizations?.map(o=>String(o.id))??[])
  const [formats,setFormats]=useState<string[]>(trainer?.formats??[])
  const [photo,setPhoto]=useState<string|null>(trainer?.photo??null)
  const [photoLoading,setPhotoLoading]=useState(false)
  const [files,setFiles]=useState<Files>({})
  const [fileError,setFileError]=useState('')
  const [invite,setInvite]=useState(true)
  const [active,setActive]=useState(trainer?.active??true)
  const orgs=useOrganizations()
  const stored=useQuery({queryKey:['trainer-documents',trainer?.id],queryFn:()=>api<{kind:string;name:string}[]>('/trainers/'+trainer!.id+'/documents'),enabled:!!trainer})
  const save=useMutation({mutationFn:async(body:object)=>{
    const saved=await api<Trainer>('/trainers'+(trainer?'/'+trainer.id:''),{method:trainer?'PATCH':'POST',headers:trainer?{'Content-Type':'application/merge-patch+json'}:{},body:JSON.stringify(body)})
    // The sheet is saved from here on: later failures are reported on it, so a retry cannot create it twice.
    const failures:string[]=[],messages:string[]=[]
    for(const [kind,label] of documents){
      const file=files[kind]
      if(file===undefined)continue
      const data=new FormData()
      if(file)data.append('file',file)
      await api('/trainers/'+saved.id+'/documents/'+kind,{method:file?'POST':'DELETE',body:file?data:undefined}).catch((e:Error)=>failures.push(label+' : '+e.message))
    }
    if(!trainer&&invite&&active)await grantAccess(saved.id).then(m=>messages.push(m)).catch((e:Error)=>failures.push('Accès non créé : '+e.message))
    return {id:saved.id,failures,notice:[trainer?'Fiche enregistrée.':'Formateur créé.',...messages,...failures].join(' ')}
  },onSuccess:async({id,failures,notice})=>{
    await client.invalidateQueries()
    if(failures.length){setFiles({});navigate(listPath+'/'+id+'/edit',{state:{notice},replace:true})}
    else navigate(listPath,{state:{notice}})
  }})
  const notice=(useLocation().state as {notice?:string}|null)?.notice
  const missing=!organizations.length||!formats.length
  const selected=orgs.data?.filter(o=>organizations.includes(String(o.id))).map(o=>o.name).join(', ')
  const chosen=Object.entries(formatLabels).filter(([key])=>formats.includes(key)).map(([,label])=>label).join(', ')
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(save.isPending||missing)return
    const form=new FormData(event.currentTarget)
    const text=(name:string)=>String(form.get(name)??'').trim()||null
    save.mutate({firstName:text('firstName'),lastName:text('lastName'),email:text('email'),phone:text('phone'),profession:text('profession'),specialty:text('specialty'),rppsNumber:text('rppsNumber'),biography:text('biography'),comments:text('comments'),active,formats,
      organizations:organizations.map(id=>'/api/organizations/'+id),
      ...(trainer&&photo===(trainer.photo??null)?{}:{photo})})
  }
  const field=(name:keyof Trainer,label:string,Icon:typeof Mail,props:React.InputHTMLAttributes<HTMLInputElement>)=><label>{label} {props.required&&<em>*</em>}<span className="uc-input-icon"><Icon aria-hidden="true"/><input name={name} defaultValue={String(trainer?.[name]??'')} {...props}/></span></label>
  const title=trainer?'Modifier un formateur':'Créer un formateur'
  return <section className="user-create trainer-form">
    <nav aria-label="Fil d’Ariane"><span>Paramétrage</span><ChevronRight aria-hidden="true"/><Link to={listPath}>Formateurs</Link><ChevronRight aria-hidden="true"/><strong aria-current="page">{title}</strong></nav>
    <header className="uc-heading"><i><UserRoundPlus aria-hidden="true"/></i><div><h1>{title}</h1><p>{trainer?'Mettez à jour le formateur et ses informations d’intervention.':'Ajoutez un formateur et définissez ses informations d’intervention.'}</p></div></header>
    {notice&&<p role="status" className="tf-notice">{notice}</p>}
    <form onSubmit={submit}>
      <div className="uc-layout">
        <div className="uc-stack">
          <Card title="Informations générales" icon={<UserRoundPlus aria-hidden="true"/>}>
            <div className="uc-fields">
              {field('firstName','Prénom',UserRound,{required:true,maxLength:100,placeholder:'Ex. Sophie'})}
              {field('lastName','Nom',UserRound,{required:true,maxLength:100,placeholder:'Ex. Leroy'})}
              {field('email','Email professionnel',Mail,{required:true,type:'email',maxLength:180,placeholder:'Ex. sophie.leroy@exemple.fr'})}
              {field('phone','Téléphone',Phone,{type:'tel',maxLength:20,pattern:'\\+?[0-9 .]*',placeholder:'Ex. 06 12 34 56 78'})}
              <label>Profession <em>*</em><span className="uc-input-icon"><Briefcase aria-hidden="true"/><select name="profession" required defaultValue={trainer?.profession??''}><option value="">Sélectionner une profession</option>{[...new Set([...professions,...(trainer?.profession?[trainer.profession]:[])])].map(p=><option key={p}>{p}</option>)}</select></span></label>
              {field('specialty','Spécialité',Stethoscope,{maxLength:100,placeholder:'Ex. Endocrinologie – Diabétologie'})}
              {field('rppsNumber','N° RPPS / ADELI',IdCard,{inputMode:'numeric',maxLength:20,pattern:'[0-9 ]{9,20}',title:'Au moins 9 chiffres',placeholder:'Ex. 10101234567'})}
              <OrganizationPicker legend={<>Organisme(s) d’intervention <em>*</em></>} hint="Le formateur peut animer les formations de ces organismes." value={organizations} onChange={setOrganizations}/>
              <label className="uc-active">Statut<span><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/> Formateur {active?'actif':'inactif'}</span></label>
            </div>
          </Card>
          <Card title="Interventions et compétences" icon={<GraduationCap aria-hidden="true"/>}>
            <div className="uc-fields">
              <fieldset className="tf-formats uc-wide"><legend>Formats assurés <em>*</em></legend>{Object.entries(formatLabels).map(([key,label])=><label key={key}><input type="checkbox" checked={formats.includes(key)} onChange={e=>setFormats(e.target.checked?[...formats,key]:formats.filter(f=>f!==key))}/>{label}</label>)}</fieldset>
              <label className="uc-wide">Biographie / présentation<textarea name="biography" maxLength={2000} rows={3} defaultValue={trainer?.biography??''}/></label>
              <label className="uc-wide">Notes internes <span>(optionnel)</span><textarea name="comments" maxLength={500} rows={3} defaultValue={trainer?.comments??''}/></label>
            </div>
          </Card>
        </div>
        <aside className="uc-stack">
          <Card title="Profil du formateur" icon={<UserRound aria-hidden="true"/>}>
            <PhotoPicker photo={photo} onChange={setPhoto} onLoading={setPhotoLoading}/>
            <ul className="tf-facts">
              <li><Video aria-hidden="true"/><span>Mode :<b>Invité Zoom</b></span></li>
              {trainer?.updatedAt&&<li><Clock aria-hidden="true"/><span>Dernière mise à jour :<b>{new Date(trainer.updatedAt).toLocaleDateString('fr-FR')}</b></span></li>}
            </ul>
          </Card>
          <Card title="Documents" icon={<FileText aria-hidden="true"/>}>
            <ul className="tf-documents">{documents.map(([kind,label,Icon])=>{
              const file=files[kind],saved=file===undefined?stored.data?.find(d=>d.kind===kind):undefined
              return <li key={kind}><Icon aria-hidden="true"/><div><strong>{label}</strong>
                <small>{file?file.name:file===null?'Sera supprimé à l’enregistrement':saved?<a href={'/api/trainers/'+trainer!.id+'/documents/'+kind} download>{saved.name}</a>:'PDF, JPG ou PNG – max. 5 Mo'}</small></div>
                <div className="tf-file-actions"><label><Upload aria-hidden="true"/>{file||saved?'Remplacer':'Choisir un fichier'}<input type="file" accept="application/pdf,image/jpeg,image/png" aria-label={label} onChange={e=>{
                  const picked=e.target.files?.[0]
                  e.target.value=''
                  if(!picked)return
                  if(!['application/pdf','image/jpeg','image/png'].includes(picked.type)||picked.size>5*1024*1024){setFileError(label+' : choisissez un fichier PDF, JPG ou PNG de 5 Mo maximum.');return}
                  setFileError('');setFiles({...files,[kind]:picked})
                }}/></label>
                {(file||saved)&&<button type="button" onClick={()=>setFiles({...files,[kind]:saved?null:undefined})}>Retirer</button>}
                {file===null&&<button type="button" onClick={()=>setFiles({...files,[kind]:undefined})}>Annuler</button>}</div></li>
            })}</ul>
            {(fileError||stored.error)&&<p role="alert" className="uc-error">{fileError||stored.error?.message}</p>}
          </Card>
          {trainer&&<TrainerAccess trainer={trainer}/>}
          <Card title="Aperçu de planification" icon={<Info aria-hidden="true"/>}>
            <ul className="tf-preview">
              <li><Building2 aria-hidden="true"/><span><b>Organismes sélectionnés :</b> {selected||'aucun'}</span></li>
              <li><GraduationCap aria-hidden="true"/><span><b>Formats assurés :</b> {chosen||'aucun'}</span></li>
              <li><CalendarCheck aria-hidden="true"/><span>Le formateur peut être assigné à un créneau matin ou après-midi d’une classe virtuelle.</span></li>
            </ul>
          </Card>
        </aside>
      </div>
      {save.isError&&<p role="alert" className="uc-error">{save.error.message}</p>}
      <footer className="uc-card uc-footer">
        {!trainer&&<label className="tf-invite"><input type="checkbox" checked={invite&&active} disabled={!active} onChange={e=>setInvite(e.target.checked)}/>Envoyer un email d’invitation au formateur</label>}
        {missing&&<span className="tf-missing">Choisissez au moins un organisme et un format.</span>}
        <Link to={listPath}>Annuler</Link><button className="page-add" disabled={save.isPending||photoLoading||missing}><Save aria-hidden="true"/>{save.isPending?'Enregistrement…':trainer?'Enregistrer':'Créer le formateur'}</button>
      </footer>
    </form>
  </section>
}

function TrainerAccess({trainer}:{trainer:Trainer}) {
  const client=useQueryClient()
  const accounts=useQuery({queryKey:['trainer-accounts'],queryFn:()=>api<Account[]>('/trainer-accounts')})
  const access=useMutation({mutationFn:(active?:boolean)=>grantAccess(trainer.id,active),onSuccess:()=>client.invalidateQueries({queryKey:['trainer-accounts']})})
  const account=accounts.data?.find(a=>a.trainerId===trainer.id)
  return <Card title="Accès à Sofia" icon={<KeyRound aria-hidden="true"/>}><div className="tf-access">
    {accounts.isLoading?<p>Chargement…</p>
      :account?.staff?<p>Rattaché à un compte de gestion. « Mes classes » est ouvert tant que la fiche est active.</p>
      :!trainer.active?<p>Fiche désactivée : aucun accès possible.</p>
      :!account?<><p>Aucun accès.</p><button type="button" disabled={access.isPending} onClick={()=>access.mutate(undefined)}>Créer l’accès à Sofia</button></>
      :<><p>Compte formateur {account.active?'actif':'désactivé'}.</p>{account.active&&<button type="button" disabled={access.isPending} onClick={()=>access.mutate(undefined)}>Renvoyer l’accès</button>}<button type="button" disabled={access.isPending} onClick={()=>access.mutate(!account.active)}>{account.active?'Désactiver l’accès':'Activer l’accès'}</button></>}
    {access.data&&<p role="status">{access.data}</p>}
    {(access.error||accounts.error)&&<p role="alert" className="uc-error">{(access.error||accounts.error)?.message}</p>}
  </div></Card>
}

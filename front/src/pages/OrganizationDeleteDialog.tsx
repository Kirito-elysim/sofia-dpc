import {ActivationActionIcon} from '../components/ActivationIcons'
import {useEffect,useId,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {Info,Trash2,TriangleAlert,X} from 'lucide-react'
import './organizations.css'
import './organization-list.css'

type Props = {
  name:string
  linkedClasses?:number
  pending:boolean
  error?:string
  onClose:()=>void
  onDelete:()=>void
  onDeactivate?:()=>void
}

export function OrganizationDeleteDialog({name,linkedClasses,pending,error,onClose,onDelete,onDeactivate}:Props) {
  const [confirmation,setConfirmation]=useState('')
  const confirmationId=useId()
  const confirmed=confirmation.trim()===name.trim()
  const ref = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(()=>{
    const dialog = ref.current!
    dialog.showModal()
    cancel.current?.focus()
    return ()=>dialog.close()
  },[])
  return createPortal(
    <dialog ref={ref} className="oa-dialog od-dialog confirm" aria-label={`Supprimer ${name} ?`}
      onCancel={event=>{event.preventDefault();if(!pending)onClose()}}>
      <header>
        <Trash2 className="od-dialog-icon" aria-hidden="true"/>
        <h2>Supprimer {name} ?</h2>
        <button type="button" disabled={pending} onClick={onClose} aria-label="Fermer"><X aria-hidden="true"/></button>
      </header>
      <p><strong>{name}</strong> sera retiré de la liste et des choix pour les nouvelles classes. Ses données sont conservées et l’action est tracée dans le journal d’audit.</p>
      {linkedClasses!==undefined&&linkedClasses>0&&<div className="oa-caution">
        <TriangleAlert aria-hidden="true"/>
        <strong>{linkedClasses} {linkedClasses===1?'classe rattachée':'classes rattachées'}</strong>
        <p>Les classes existantes et leur historique seront conservés.</p>
        {onDeactivate&&<p>Vous pouvez aussi désactiver l’organisme pour le garder visible dans la liste.</p>}
      </div>}
      <div className="od-delete-confirmation">
        <label htmlFor={confirmationId}><Info aria-hidden="true"/> Saisissez le nom de l’organisme pour confirmer</label>
        <input id={confirmationId} value={confirmation} placeholder={name} onChange={event=>setConfirmation(event.target.value)} disabled={pending} autoComplete="off"/>
      </div>
      {error&&<p className="oa-error" role="alert">{error}</p>}
      <footer>
        <button ref={cancel} type="button" disabled={pending} onClick={onClose}>Annuler</button>
        {onDeactivate&&<button type="button" disabled={pending} onClick={onDeactivate}><ActivationActionIcon active={true}/>Désactiver</button>}
        <button type="button" className="danger" disabled={pending||!confirmed} onClick={onDelete}>
          <Trash2 aria-hidden="true"/><span>Confirmer la suppression</span>
        </button>
      </footer>
    </dialog>,
    document.body,
  )
}

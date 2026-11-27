import {useRef,useState,type FormEvent} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {Download,ExternalLink,FileText,Link2,Plus,Trash2} from 'lucide-react'
import {api} from '../api'
import './resources.css'

type Resource={id:number;title:string;url?:string|null;fileName?:string|null}

/** Files and links given to learners, for a formation (`/formations/8`) or a session-formation. */
export function Resources({owner,canWrite,note}:{owner:string;canWrite:boolean;note:string}){
  const cache=useQueryClient(),form=useRef<HTMLFormElement>(null)
  const key=['resources',owner]
  const list=useQuery({queryKey:key,queryFn:()=>api<Resource[]>(owner+'/resources')})
  const [kind,setKind]=useState<'file'|'url'>('file')
  const refresh=()=>cache.invalidateQueries({queryKey:key})
  const add=useMutation({mutationFn:(body:FormData)=>api(owner+'/resources',{method:'POST',body}),onSuccess:()=>{form.current?.reset();return refresh()}})
  const remove=useMutation({mutationFn:(id:number)=>api('/resources/'+id,{method:'DELETE'}),onSuccess:refresh})
  return <div className="res">
    <p className="res-note">{note}</p>
    {list.error&&<p role="alert">{list.error.message}</p>}
    {list.data?.length===0&&<p className="res-note">Aucune ressource.</p>}
    <ul>{list.data?.map(r=><li key={r.id}>{r.url?<Link2 aria-hidden="true"/>:<FileText aria-hidden="true"/>}<span>{r.title}</span>
      <a href={r.url??'/api/resources/'+r.id+'/file'} target={r.url?'_blank':undefined} rel="noreferrer">{r.url?<ExternalLink aria-hidden="true"/>:<Download aria-hidden="true"/>}{r.url?'Ouvrir':'Télécharger'}</a>
      {canWrite&&<button type="button" aria-label={'Retirer '+r.title} disabled={remove.isPending} onClick={()=>{if(window.confirm('Retirer « '+r.title+' » ?'))remove.mutate(r.id)}}><Trash2 aria-hidden="true"/></button>}</li>)}</ul>
    {canWrite&&<form ref={form} onSubmit={(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!add.isPending)add.mutate(new FormData(e.currentTarget))}}>
      <label>Titre de la ressource<input name="title" required maxLength={150}/></label>
      <label>Type<select value={kind} onChange={e=>setKind(e.target.value as 'file'|'url')}><option value="file">Fichier</option><option value="url">Lien (vidéo, page web)</option></select></label>
      {kind==='file'?<label>Fichier (PDF, JPG ou PNG, 5 Mo max.)<input type="file" name="file" required accept="application/pdf,image/jpeg,image/png"/></label>
        :<label>Adresse du lien<input type="url" name="url" required maxLength={500} pattern="https://.*" placeholder="https://…"/></label>}
      <button disabled={add.isPending}><Plus aria-hidden="true"/>Ajouter la ressource</button>
    </form>}
    {(add.error||remove.error)&&<p role="alert" className="res-error">{(add.error??remove.error)?.message}</p>}
  </div>
}

import {useEffect,useRef,useState,type ReactNode} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Check,ChevronDown,Pencil,Upload,UserRound,X} from 'lucide-react'
import {api} from '../api'
import './create-user.css'

export function Card({title,icon,children}:{title:string;icon:ReactNode;children:ReactNode}) {
  return <section className="uc-card"><h2><i>{icon}</i>{title}</h2>{children}</section>
}

export function useOrganizations() {
  return useQuery({queryKey:['organizations'],queryFn:()=>api<{id:number;name:string;code?:string;color?:string|null}[]>('/organizations')})
}

/** Colour set on the organization; Phocea stays purple when none was chosen. */
const colorOf=(org:{code?:string;color?:string|null})=>org.color??(org.code?.includes('PHO')?'purple':'blue')

/** Searchable multi-selection of organizations, values are ids. */
export function OrganizationPicker({legend,hint,value,onChange}:{legend:ReactNode;hint:string;value:string[];onChange:(ids:string[])=>void}) {
  const orgs=useOrganizations()
  const [search,setSearch]=useState('')
  const found=orgs.data?.filter(org=>org.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))??[]
  const list=useRef<HTMLDetailsElement>(null)
  // A <details> stays open by itself: close it when the pointer or the focus goes elsewhere.
  useEffect(()=>{
    const close=(event:Event)=>{if(list.current&&!list.current.contains(event.target as Node))list.current.open=false}
    document.addEventListener('pointerdown',close)
    document.addEventListener('focusin',close)
    return ()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('focusin',close)}
  },[])
  const toggle=(id:string)=>onChange(value.includes(id)?value.filter(item=>item!==id):[...value,id])
  return <fieldset className="uc-orgs"><legend>{legend}</legend>
    <details ref={list} className="uc-org-select" onKeyDown={event=>{
      if(event.key==='Escape'){
        event.currentTarget.open=false
        event.currentTarget.querySelector('summary')?.focus()
      }
    }}>
      <summary>{value.length ? `${value.length} sélectionné(s)` : 'Sélectionner des organismes'}<ChevronDown aria-hidden="true"/></summary>
      <div className="uc-org-options">
        <input aria-label="Rechercher un organisme" placeholder="Rechercher…" value={search} onChange={event=>setSearch(event.target.value)}/>
        {found.map(org=>{
          const selected=value.includes(String(org.id))
          return <button key={org.id} type="button" data-color={colorOf(org)} aria-pressed={selected} onClick={()=>toggle(String(org.id))}><i aria-hidden="true"/>{org.name}{selected&&<Check aria-hidden="true"/>}</button>
        })}
        {!found.length&&<small>{orgs.isLoading?'Chargement…':'Aucun organisme trouvé.'}</small>}
      </div>
    </details>
    <div className="uc-org-tags">{orgs.data?.filter(org=>value.includes(String(org.id))).map(org=><button key={org.id} type="button" data-color={colorOf(org)} aria-label={`Retirer ${org.name}`} onClick={()=>toggle(String(org.id))}>{org.name}<X aria-hidden="true"/></button>)}</div>
    <small>{orgs.isError?'Chargement impossible.':hint}</small>
  </fieldset>
}

/** JPG or PNG of 2 MB at most, kept as a data URL. */
export function PhotoPicker({photo,onChange,onLoading}:{photo:string|null;onChange:(photo:string|null)=>void;onLoading:(loading:boolean)=>void}) {
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  const busy=(state:boolean)=>{setLoading(state);onLoading(state)}
  return <>
    <div className="uc-profile-picker">
      <label className="uc-avatar" htmlFor="profile-photo" aria-label="Choisir une photo de profil">
        {photo?<img src={photo} alt="Aperçu de la photo de profil"/>:<UserRound aria-hidden="true"/>}
        <i><Pencil aria-hidden="true"/></i>
      </label>
      <div><strong>Photo de profil</strong><p>JPG ou PNG (max. 2 Mo)</p>
        <div className="uc-photo">
          <label><Upload aria-hidden="true"/> {photo?'Remplacer le fichier':'Choisir un fichier'}
            <input id="profile-photo" type="file" accept="image/jpeg,image/png" disabled={loading} onChange={event=>{
              const file=event.target.files?.[0]
              event.target.value=''
              if(!file)return
              setError('')
              if(!['image/jpeg','image/png'].includes(file.type)||file.size>2*1024*1024){
                setError('Choisissez une image JPG ou PNG de 2 Mo maximum.')
                return
              }
              const reader=new FileReader()
              busy(true)
              reader.onload=()=>{onChange(String(reader.result));busy(false)}
              reader.onerror=()=>{setError('Impossible de lire la photo.');busy(false)}
              reader.readAsDataURL(file)
            }}/>
          </label>
          {photo&&<button type="button" onClick={()=>{onChange(null);setError('')}} disabled={loading}>Retirer</button>}
        </div>
      </div>
    </div>
    {error&&<p className="uc-error" role="alert">{error}</p>}
  </>
}

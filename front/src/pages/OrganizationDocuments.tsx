import {useEffect,useRef,useState} from 'react'
import {CheckCircle2,Download,FileText,ImageIcon,RefreshCw,Trash2,UploadCloud} from 'lucide-react'
import './organization-profile.css'
import {docs,fieldHelp} from './organizationFields'

export type StoredDocument={kind:string;name:string;size:number;mime:string}
const descriptions:Record<string,string>={kbis:'Extrait Kbis de l’organisme',qualiopi:'Certificat de certification Qualiopi',rib:'Relevé d’identité bancaire',declaration:'Accusé de réception de déclaration d’activité'}

function DocumentItem({kind,label,visual,stored,file,root,onChange,required=false}:{required?:boolean;kind:string;label:string;visual:boolean;stored?:StoredDocument;file?:File;root:string;onChange:(file?:File)=>void}){
  const input=useRef<HTMLInputElement>(null)
  const preview=useRef<HTMLImageElement>(null),download=useRef<HTMLAnchorElement>(null)
  const [error,setError]=useState('')
  useEffect(()=>{
    if(!file)return
    const url=URL.createObjectURL(file)
    if(preview.current)preview.current.src=url
    if(download.current)download.current.href=url
    return ()=>URL.revokeObjectURL(url)
  },[file])
  const name=file?.name??stored?.name,size=file?.size??stored?.size
  const href=!file&&stored?root+'/'+kind:undefined
  const type=(file?.type??stored?.mime)?.split('/').pop()?.toUpperCase().replace('JPEG','JPG')
  function choose(f?:File){
    if(!f)return
    const allowed=['image/png','image/jpeg','image/webp',...(visual?[]:['application/pdf'])]
    if(!allowed.includes(f.type)||!f.size||f.size>5*1024*1024){setError('Choisissez un fichier au format accepté, de 5 Mo maximum.');return}
    setError('');onChange(f)
  }
  return <div className={visual?'ed-visual':'ed-row'} onDragOver={visual?e=>e.preventDefault():undefined} onDrop={visual?e=>{e.preventDefault();choose(e.dataTransfer.files[0])}:undefined}>
    <div className="ed-label">{!visual&&<FileText/>}<div><strong>{label}{required&&<em> *</em>}</strong>{!visual&&<small>{descriptions[kind]}</small>}</div></div>
    <div className="ed-content">
      {visual&&<div className="ed-image">{name?<img ref={preview} src={href} alt={label}/>:<ImageIcon/>}</div>}
      <div className="ed-meta">{name&&<CheckCircle2/>}<div>{name??'Aucun fichier joint'}{name&&<small>{[type,size!=null?new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1}).format(size>=1048576?size/1048576:size/1024)+(size>=1048576?' Mo':' Ko'):null].filter(Boolean).join(' · ')}</small>}</div></div>
      <div className="ed-actions">
        {!visual&&name&&<a ref={download} download={name} href={href}><Download/>Télécharger</a>}
        <button type="button" onClick={()=>input.current?.click()} aria-label={(name?'Remplacer':'Ajouter')+' '+label}><RefreshCw/>{name?'Remplacer':'Ajouter'}</button>
        {name&&<button className="ed-remove" type="button" aria-label={'Supprimer '+label} onClick={()=>{setError('');onChange()}}><Trash2/>Supprimer</button>}
      </div>
      {visual&&<small className="ed-hint"><UploadCloud/>PNG, JPG ou WebP · 5 Mo max.</small>}
    </div>
    <input ref={input} hidden type="file" name={kind} accept={(visual?'':'application/pdf,')+'image/png,image/jpeg,image/webp'} onChange={e=>{choose(e.target.files?.[0]);e.target.value=''}}/>
    {visual&&<small className="ed-file-help">{fieldHelp[kind]}</small>}
    {error&&<p role="alert">{error}</p>}
  </div>
}

export function OrganizationDocuments({stored,files,removed,root,onChange,visualOnly=false}:{visualOnly?:boolean;stored:StoredDocument[];files:Record<string,File>;removed:string[];root:string;onChange:(key:string,file?:File)=>void}){
  return <div className="ed-documents">{(visualOnly?[true]:[true,false]).map(visual=><section className="oe-panel" key={String(visual)}>
    <div className="ed-heading"><i>{visual?<ImageIcon/>:<FileText/>}</i><div><h2>{visual?'Identité visuelle':'Documents administratifs'}</h2><p>{visualOnly?'Le logo est obligatoire. La signature et le cachet sont facultatifs.':<>Mettez à jour {visual?'le logo, la signature et le cachet':'les documents réglementaires'} de l’organisme.</>}</p></div></div>
    <div className={visual?'ed-images':'ed-rows'}>{docs.filter((_,i)=>(i<3)===visual).map(([key,label])=><DocumentItem key={key} kind={key} label={label} visual={visual} required={visualOnly&&key==='logo'} root={root} stored={removed.includes(key)?undefined:stored.find(d=>d.kind===key)} file={files[key]} onChange={f=>onChange(key,f)}/>)}</div>
  </section>)}</div>
}

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, Plus, Power, X } from 'lucide-react'
import { api } from '../api'
import './organizations.css'

const colors = { blue: 'Bleu SOFIA', purple: 'Violet Phocea', gray: 'Gris' }
type Color = keyof typeof colors
type Org = { id:number; name:string; code:string; active:boolean; color:Color|null; emailFrom:string; smsSender:string|null; siret:string|null; andpcNumber:string|null }
type Summary = { id:number; total:number; at:string|null; author:string|null }
const colorOf = (o:Org):Color => o.color ?? (/^(PHO|PHOCEA)$/.test(o.code)?'purple':/^(SOF|SOFIA)$/.test(o.code)?'blue':'gray')
const icon = (name:string) => <img className="oa-icon" alt="" src={'/organizations/'+name+'.png'}/>
const newOrg:Org={id:0,name:'',code:'',active:true,color:'blue',emailFrom:'',smsSender:null,siret:null,andpcNumber:null}

function Modal({kind,title,onClose,children}:{kind:string,title:string,onClose:()=>void,children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const dialog=ref.current!;dialog.showModal();return ()=>dialog.close()},[])
  return <dialog ref={ref} className={'oa-dialog '+kind} aria-label={title} onCancel={e=>{e.preventDefault();onClose()}}>
    <header>{icon(kind==='drawer'?'drawer':'trash')}<h2>{title}</h2><button type="button" onClick={onClose} aria-label="Fermer"><X/></button></header>{children}</dialog>
}

export default function Organizations({canWrite}:{canWrite:boolean}) {
  const qc=useQueryClient()
  const list=useQuery({queryKey:['organizations'],queryFn:()=>api<Org[]>('/organizations')})
  const summary=useQuery({queryKey:['organization-summaries'],queryFn:()=>api<Summary[]>('/organization-summaries')})
  const details=new Map(summary.data?.map(s=>[Number(s.id),s]))
  const rows=list.data??[]
  const [search,searchFor]=useState(''),[status,setStatus]=useState(''),[color,setColor]=useState('')
  const [sort,setSort]=useState({key:'id',dir:1}),[page,setPage]=useState(1),[size,setSize]=useState(10)
  const [checked,select]=useState<number[]>([])
  const [draft,edit]=useState<Org|null>(null),[deleting,confirmDelete]=useState<Org|null>(null)
  const change=useMutation({mutationFn:({id,method,body}:{id?:number;method:string;body?:object})=>api('/organizations'+(id?'/'+id:''),{method,body:JSON.stringify(body),headers:method==='PATCH'?{'Content-Type':'application/merge-patch+json'}:{}}),
    onSuccess:()=>{edit(null);confirmDelete(null);void qc.invalidateQueries()}})
  const close=()=>{if(!change.isPending){edit(null);confirmDelete(null);change.reset()}}
  const toggle=(o:Org)=>change.mutate({id:o.id,method:'PATCH',body:{active:!o.active}})
  const dup=!!draft&&rows.some(o=>o.id!==draft.id&&o.code===draft.code)
  function save(){if(!draft||dup)return;const {id,code,...body}=draft;change.mutate({id,method:id?'PATCH':'POST',body:id?body:{...body,code}})}
  const reset=()=>{searchFor('');setStatus('');setColor('');setPage(1)}
  const ordered=rows.filter(o=>(o.name+' '+o.code).toLocaleLowerCase().includes(search.toLocaleLowerCase())&&(!status||String(o.active)===status)&&(!color||colorOf(o)===color))
  const sortValue=(o:Org)=>({id:o.id,name:o.name,code:o.code,color:colors[colorOf(o)],total:Number(details.get(o.id)?.total??0),active:Number(o.active),at:details.get(o.id)?.at??''})[sort.key as 'id'|'name'|'code'|'color'|'total'|'active'|'at']
  ordered.sort((a,b)=>String(sortValue(a)).localeCompare(String(sortValue(b)),'fr',{numeric:true})*sort.dir)
  const last=Math.max(1,Math.ceil(ordered.length/size)),current=Math.min(page,last),shown=ordered.slice((current-1)*size,current*size)
  const all=shown.length>0&&shown.every(o=>checked.includes(o.id))
  const err=change.error&&<p className="oa-error" role="alert">{change.error.message}</p>
  return <section className="oa org-admin"><header className="oa-title">{icon('building')}<div><h1>Organismes ({rows.length})</h1><p>Gérez les organismes de formation (ex. SOFIA, STUDIO PHOCEA).</p></div>{canWrite&&<button className="blue" onClick={()=>{change.reset();edit({...newOrg})}}><Plus/>Ajouter un organisme</button>}</header>
    <section className="oa-filters"><label>{icon('search')}<input aria-label="Rechercher un organisme" placeholder="Rechercher un organisme…" value={search} onChange={e=>{searchFor(e.target.value);setPage(1)}}/></label>
    <label>Statut{icon('education')}<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Tous les statuts</option><option value="true">Actif</option><option value="false">Inactif</option></select></label>
    <label>Couleur{icon('palette')}<select value={color} onChange={e=>{setColor(e.target.value);setPage(1)}}><option value="">Toutes les couleurs</option>{Object.entries(colors).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><button onClick={reset}>{icon('reset')}Réinitialiser</button></section>
    {list.isError&&<p role="alert">{list.error.message}</p>}{!draft&&!deleting&&err}
    <section className="oa-table"><div className="oa-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Sélectionner la page" checked={all} onChange={()=>select(all?checked.filter(id=>!shown.some(o=>o.id===id)):[...new Set([...checked,...shown.map(o=>o.id)])])}/></th>
    {Object.entries({name:'Nom',code:'Code',color:'Couleur',total:'Classes associées',active:'Statut',at:'Dernière modification'}).map(([key,label])=><th key={key}><button onClick={()=>setSort({key,dir:sort.key===key?-sort.dir:1})}>{label}{icon('sort')}</button></th>)}{canWrite&&<th>Actions</th>}</tr></thead><tbody>
    {shown.map(o=>{const meta=details.get(o.id);return <tr key={o.id}><td><input type="checkbox" aria-label={'Sélectionner '+o.name} checked={checked.includes(o.id)} onChange={()=>select(checked.includes(o.id)?checked.filter(id=>id!==o.id):[...checked,o.id])}/></td><td><strong>{o.name}</strong></td><td><b className={'oa-code '+colorOf(o)}>{o.code}</b></td><td><span className="oa-inline"><i className={'swatch '+colorOf(o)}/>{colors[colorOf(o)]}</span></td><td><span className="oa-inline">{icon('calendar')}{meta?.total??'—'}</span></td><td><b className={'oa-state '+(o.active?'on':'')}>{icon(o.active?'active':'inactive')}{o.active?'Actif':'Inactif'}</b></td><td>{meta?.at?<span className="oa-inline">{icon('calendar')}<span>{new Date(meta.at.replace(' ','T')).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'})}{meta.author&&<small>par {meta.author}</small>}</span></span>:'—'}</td>
    {canWrite&&<td><div className="oa-actions"><button onClick={()=>{change.reset();edit({...o,color:colorOf(o)})}}>{icon('edit')}Modifier</button><button disabled={change.isPending} className={o.active?'neutral':'green'} onClick={()=>toggle(o)}>{icon('power')}{o.active?'Désactiver':'Activer'}</button><button className="red" onClick={()=>{change.reset();confirmDelete(o)}}>{icon('delete')}Supprimer</button></div></td>}</tr>})}</tbody></table></div>
    <footer>{list.isLoading?'Chargement…':ordered.length+' résultats sur '+rows.length}<select aria-label="Résultats par page" value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1)}}>{[10,25,50].map(n=><option value={n} key={n}>{n} par page</option>)}</select><button disabled={current<=1} onClick={()=>setPage(current-1)} aria-label="Précédent"><ChevronLeft/></button><b>{current}</b><button disabled={current>=last} onClick={()=>setPage(current+1)} aria-label="Suivant"><ChevronRight/></button></footer></section>
    <section className="oa-empty">{icon('empty')}<div><h2>Aucun résultat pour ce filtre</h2><p>Aucun organisme ne correspond à vos critères de recherche.</p><button onClick={reset}>{icon('reset')}Réinitialiser les filtres</button></div></section>
    <div className="oa-notes">{[['idea','Points d’ergonomie','Identification rapide via un code et une couleur (bleu = SOFIA, violet = STUDIO PHOCEA).','Filtre et recherche pour retrouver un organisme en un clic.','Désactivation plutôt que suppression pour conserver l’historique des classes.'],['help','Questions ouvertes','Souhaitez-vous des informations supplémentaires (SIRET, adresse, contact) ?','Un organisme peut-il être totalement masqué (non visible dans les listes) ?','Faut-il gérer des droits par organisme (ex. utilisateurs rattachés) ?']].map(([img,title,...items])=><section key={title}><h3>{icon(img)}{title}</h3><ul>{items.map(t=><li key={t}>{t}</li>)}</ul></section>)}</div>
    {draft&&<Modal kind="drawer" title="Ajouter / Modifier un organisme" onClose={close}><form onSubmit={e=>{e.preventDefault();save()}}><div className="oa-form"><h3>{icon('step1')} Informations générales</h3>
    <label>Nom de l’organisme <em>*</em><input required maxLength={100} value={draft.name} onChange={e=>edit({...draft,name:e.target.value})}/></label>
    <label>Code <em>*</em><input required readOnly={!!draft.id} pattern="[A-Z0-9_]{2,20}" value={draft.code} onChange={e=>edit({...draft,code:e.target.value})}/></label>{dup&&<p className="oa-error">ⓘ Ce code est déjà utilisé par un autre organisme.</p>}
    <label className="org-color-field">Couleur d’identification <em>*</em><i className={'swatch '+(draft.color??'gray')}/><select value={draft.color??'gray'} onChange={e=>edit({...draft,color:e.target.value as Color})}>{Object.entries(colors).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
    <details open={!draft.id}><summary>Coordonnées et paramètres d’envoi</summary>{([['emailFrom','Adresse d’envoi des mails'],['smsSender','Expéditeur SMS'],['siret','SIRET'],['andpcNumber','N° ANDPC']] as const).map(([key,label])=><label key={key}>{label}<input required={key==='emailFrom'} type={key==='emailFrom'?'email':'text'} pattern={key==='smsSender'?'[A-Za-z0-9]{1,11}':key==='siret'?'[0-9]{14}':undefined} value={draft[key]??''} onChange={e=>edit({...draft,[key]:e.target.value||null})}/></label>)}</details>
    <h3>{icon('step2')} Statut</h3><fieldset><legend>Statut <em>*</em></legend>{[true,false].map(v=><label key={String(v)}><input type="radio" name="active" checked={v===draft.active} onChange={()=>edit({...draft,active:v})}/>{v?'Actif':'Inactif'}</label>)}</fieldset>
    <p className="oa-info">{icon('info')}Un organisme inactif n’est plus proposé lors de la création de nouvelles classes, mais reste visible pour l’historique et les rapports.</p>{err}</div><footer><button type="button" onClick={close}>Annuler</button><button className="blue" disabled={dup||change.isPending}><Check/>Enregistrer</button></footer></form></Modal>}
    {deleting&&<Modal kind="confirm" title="Supprimer Organisme ?" onClose={close}><p>Cette action est tracée dans le journal d’audit.</p><div className="oa-caution">{icon('alert')}<div><strong>{details.has(deleting.id)?'Cet organisme est utilisé dans '+details.get(deleting.id)?.total+' classes':deleting.name}</strong> (en cours ou passées).<p>Il est recommandé de le désactiver plutôt que de le supprimer.</p></div></div>{err}<footer><button onClick={close}>Annuler</button>{deleting.active&&<button disabled={change.isPending} onClick={()=>toggle(deleting)}><Power/>Désactiver</button>}<button className="danger" disabled={change.isPending} onClick={()=>change.mutate({id:deleting.id,method:'DELETE'})}>{icon('delete')}Supprimer</button></footer></Modal>}
  </section>
}

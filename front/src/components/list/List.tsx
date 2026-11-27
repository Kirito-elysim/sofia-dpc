/**
 * The building blocks of every list screen, modelled on « Utilisateurs ».
 * A new list is assembled from these: no screen draws its own header, table, badge or button.
 */
import {useEffect,useRef,useState,type ButtonHTMLAttributes,type ReactNode} from 'react'
import {ArrowUpDown,ChevronLeft,ChevronRight,LockKeyhole,Pencil,Plus,RotateCcw,Search,SearchX,Trash2,type LucideIcon} from 'lucide-react'
import {ActivationActionIcon,ActivationStatusIcon} from '../ActivationIcons'
import {Picto,type PictoName} from '../Picto'
import type {Column} from './types'
import './list.css'

export function ListPage({children,className=''}:{children:ReactNode;className?:string}) {
  return <section className={'ls-page '+className}>{children}</section>
}

export function PageHeader({icon,title,subtitle,add}:{icon:PictoName;title:string;subtitle:string;add?:{label:string;onClick:()=>void}}) {
  return <header className="ls-header"><Picto name={icon} className="picto-heading"/><div><h1>{title}</h1><p>{subtitle}</p></div>
    {add&&<button type="button" className="ls-add" onClick={add.onClick}><Plus aria-hidden="true"/>{add.label}</button>}</header>
}

export function Filters({children,onReset}:{children:ReactNode;onReset:()=>void}) {
  return <div className="ls-filters">{children}<button type="button" className="ls-reset" onClick={onReset}><RotateCcw aria-hidden="true"/>Réinitialiser</button></div>
}

export function SearchField({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) {
  return <label className="ls-search"><Search aria-hidden="true"/><input aria-label={label} placeholder={label+'…'} value={value} onChange={e=>onChange(e.target.value)}/></label>
}

export function SelectField({label,icon,all,value,onChange,options}:{label:string;icon:PictoName;all:string;value:string;onChange:(value:string)=>void;options:{value:string;label:string}[]}) {
  return <label className="ls-select"><span>{label}</span><Picto name={icon}/><select value={value} onChange={e=>onChange(e.target.value)}><option value="">{all}</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
}

export function ViewToggle<Key extends string>({value,onChange,options}:{value:Key;onChange:(key:Key)=>void;options:{key:Key;label:string;Icon:LucideIcon}[]}) {
  return <div className="ls-views" role="group" aria-label="Affichage">{options.map(({key,label,Icon})=><button key={key} type="button" aria-pressed={value===key} onClick={()=>onChange(key)}><Icon aria-hidden="true"/>{label}</button>)}</div>
}

/** « Liste des … (n) » at the top of the card that holds a list, with its view buttons on the right. */
export function ListHeading({title,count,tools}:{title:string;count?:number;tools?:ReactNode}) {
  return <div className="ls-heading"><h2>{title}{count!==undefined&&' ('+count+')'}</h2>{tools}</div>
}

export function ActiveBadge({active}:{active:boolean}) {
  return <span className={'ls-badge '+(active?'green':'grey')}><ActivationStatusIcon active={active}/>{active?'Actif':'Inactif'}</span>
}

export function DeletedBadge({at}:{at?:string|null}) {
  return <span className="ls-badge red"><Trash2 aria-hidden="true"/>Supprimé{at?' le '+new Date(at).toLocaleDateString('fr-FR'):''}</span>
}

export function Badge({tone,icon:Icon,children}:{tone:'green'|'grey'|'blue'|'purple'|'orange';icon?:LucideIcon;children:ReactNode}) {
  return <span className={'ls-badge '+tone}>{Icon&&<Icon aria-hidden="true"/>}{children}</span>
}

/** Badges in the colour chosen on each organization; Phocea stays purple when none was chosen. */
export function OrgBadges({organizations}:{organizations:{id:number;name:string;code?:string;color?:string|null}[]}) {
  if(!organizations.length)return <>—</>
  return <span className="ls-orgs">{organizations.map(o=><span key={o.id} className={'ls-org '+(o.color??(o.code?.includes('PHO')?'purple':'blue'))}>{o.name}</span>)}</span>
}

export function RowActions({children}:{children:ReactNode}) {
  return <div className="ls-actions">{children}</div>
}

type ActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>,'type'|'className'>

export function EditAction({label='Modifier',...props}:ActionProps&{label?:string}) {
  return <button type="button" className="ls-action edit" {...props}><Pencil aria-hidden="true"/>{label}</button>
}
export function ToggleAction({active,...props}:ActionProps&{active:boolean}) {
  return <button type="button" className={'ls-action toggle '+(active?'off':'on')} {...props}><ActivationActionIcon active={active}/>{active?'Désactiver':'Activer'}</button>
}
export function DeleteAction(props:ActionProps) {
  return <button type="button" className="ls-action delete" {...props}><Trash2 aria-hidden="true"/>Supprimer</button>
}
export function LockedAction() {
  return <button type="button" className="ls-action locked" disabled title="Rôle protégé"><LockKeyhole aria-hidden="true"/>Protégé</button>
}
export function IconAction({icon:Icon,...props}:ActionProps&{icon:LucideIcon}) {
  return <button type="button" className="ls-action edit icon" {...props}><Icon aria-hidden="true"/></button>
}

/** Centred confirmation of a deletion; the focus starts on « Annuler ». Without `onConfirm` it only explains a refusal. */
export function ConfirmDialog({title,children,pending=false,error,onCancel,onConfirm}:{title:string;children:ReactNode;pending?:boolean;error?:string;onCancel:()=>void;onConfirm?:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const dialog=ref.current!;dialog.showModal();return ()=>dialog.close()},[])
  return <dialog ref={ref} className="ls-confirm" aria-label={title} onCancel={e=>{e.preventDefault();if(!pending)onCancel()}}>
    <i><Trash2 aria-hidden="true"/></i><h2>{title}</h2>{children}{error&&<p role="alert">{error}</p>}
    <footer><button type="button" autoFocus disabled={pending} onClick={onCancel}>{onConfirm?'Annuler':'Fermer'}</button>{onConfirm&&<button type="button" className="danger" disabled={pending} onClick={onConfirm}>{pending?'Suppression…':'Supprimer'}</button>}</footer>
  </dialog>
}

export function EmptyState({title,text,action}:{title:string;text?:string;action?:{label:string;onClick:()=>void}}) {
  return <div className="ls-empty" role="status"><i><SearchX aria-hidden="true"/></i><h2>{title}</h2>{text&&<p>{text}</p>}{action&&<button type="button" onClick={action.onClick}>{action.label}</button>}</div>
}

export function Pagination({shown,total,page,pages,size,onPage,onSize}:{shown:number;total:number;page:number;pages:number;size:number;onPage:(page:number)=>void;onSize:(size:number)=>void}) {
  return <footer className="ls-pages"><span>{shown} résultat{shown>1?'s':''} sur {total}</span>
    <select aria-label="Résultats par page" value={size} onChange={e=>onSize(Number(e.target.value))}>{[10,25,50].map(n=><option key={n} value={n}>{n} par page</option>)}</select>
    <button type="button" aria-label="Précédent" disabled={page<=1} onClick={()=>onPage(page-1)}><ChevronLeft aria-hidden="true"/></button><b aria-current="page">{page}</b>
    <button type="button" aria-label="Suivant" disabled={page>=pages} onClick={()=>onPage(page+1)}><ChevronRight aria-hidden="true"/></button></footer>
}

type TableProps<Row> = {
  /** « Liste des … »: shown above the table and used as its accessible name. */
  title: string
  tools?: ReactNode
  /** Rows left by the filters; `total` counts them before filtering. */
  rows: Row[]
  total: number
  rowKey: (row: Row) => string | number
  rowName: (row: Row) => string
  columns: Column<Row>[]
  actions?: (row: Row) => ReactNode
  /** Changing it (new filters) goes back to the first page. */
  filterKey: string
  loading?: boolean
  empty: ReactNode
}

export function DataTable<Row>({title,tools,rows,total,rowKey,rowName,columns,actions,filterKey,loading,empty}:TableProps<Row>) {
  const [sort,setSort]=useState<{key:string;dir:number}>()
  const [position,setPosition]=useState({filterKey,page:1}),[size,setSize]=useState(10)
  const [checked,setChecked]=useState<(string|number)[]>([])
  const by=columns.find(c=>c.key===sort?.key)?.sort
  const ordered=by?[...rows].sort((a,b)=>String(by(a)).localeCompare(String(by(b)),'fr',{numeric:true})*sort!.dir):rows
  const pages=Math.max(1,Math.ceil(ordered.length/size)),page=position.filterKey===filterKey?Math.min(position.page,pages):1
  const shown=ordered.slice((page-1)*size,page*size),keys=shown.map(rowKey)
  return <div className="ls-card">
    <ListHeading title={title} count={loading?undefined:total} tools={tools}/>
    <div className="ls-scroll" role="region" aria-label={title} tabIndex={0}><table className="ls-table">
      <thead><tr><th className="ls-check"><input type="checkbox" aria-label="Sélectionner la page" checked={keys.length>0&&keys.every(k=>checked.includes(k))} onChange={e=>setChecked(e.target.checked?[...new Set([...checked,...keys])]:checked.filter(k=>!keys.includes(k)))}/></th>
        {columns.map(c=><th key={c.key} aria-sort={sort?.key===c.key?(sort.dir>0?'ascending':'descending'):undefined}>{c.sort?<button type="button" onClick={()=>setSort({key:c.key,dir:sort?.key===c.key?-sort.dir:1})}>{c.label}<ArrowUpDown aria-hidden="true"/></button>:c.label}</th>)}
        {actions&&<th>Actions</th>}</tr></thead>
      <tbody>{shown.map(row=>{const key=rowKey(row);return <tr key={key}><td className="ls-check"><input type="checkbox" aria-label={'Sélectionner '+rowName(row)} checked={checked.includes(key)} onChange={()=>setChecked(checked.includes(key)?checked.filter(k=>k!==key):[...checked,key])}/></td>
        {columns.map(c=><td key={c.key}>{c.render(row)}</td>)}{actions&&<td>{actions(row)}</td>}</tr>})}
        {!rows.length&&<tr className="ls-blank"><td colSpan={columns.length+(actions?2:1)}>{loading?<p role="status">Chargement…</p>:empty}</td></tr>}</tbody>
    </table></div>
    <Pagination shown={rows.length} total={total} page={page} pages={pages} size={size} onPage={next=>setPosition({filterKey,page:next})} onSize={next=>{setSize(next);setPosition({filterKey,page:1})}}/>
  </div>
}

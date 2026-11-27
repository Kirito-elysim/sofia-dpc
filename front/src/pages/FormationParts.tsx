/** What the creation steps and the edit sheet of a formation have in common: same fields, same cards. */
import type {ReactNode} from 'react'
import {Clock,Euro,Eye,ImagePlus,Tag,Upload,Users} from 'lucide-react'
import {OrganizationPicker} from './FormParts'
import {TargetAudienceSelect} from './TargetAudienceSelect'
import {FundingRows} from './FundingRows'
import {fundings,type FundingKey,type FundingRow} from './fundings'
import {formationThumbnail} from './formationThumbnail'

export type FormationValues={
  title:string;acronym:string;modality:string;targetAudience:string;hours:string;minutes:string;price:string;organizations:string[]
  orientation:string;description:string;objectives:string
}
type Set=<K extends keyof FormationValues>(key:K,value:FormationValues[K])=>void
type Org={id:number;name:string;code?:string;color?:string|null;andpcNumber?:string|null}

const fieldHelp={
  title:'Titre affiché dans le catalogue.',
  acronym:'Court nom de la formation, ex. ETP. Laissé vide, le titre est utilisé.',
  orientation:'Indiquez l’orientation DPC ou le thème prioritaire.',
  description:'Présentez le contenu et l’intérêt de la formation.',
  objectives:'Précisez ce que les participants sauront faire à l’issue de la formation.',
  hours:'Heures entières.',
  minutes:'Minutes restantes, de 0 à 59.',
}
// Required fields carry a red asterisk, as on the organisation screen.
const caption=(label:string)=>label.endsWith(' *')?<>{label.slice(0,-1)}<em>*</em></>:label

function TextInput({name,label,value,set,numeric}:{name:'title'|'acronym'|'orientation'|'hours'|'minutes';label:string;value:FormationValues;set:Set;numeric?:boolean}){
  return <div><label>{caption(label)}<input type={numeric?'number':'text'} min={numeric?0:undefined} max={name==='minutes'?59:undefined} maxLength={name==='title'||name==='orientation'||name==='acronym'?255:100} value={value[name]} aria-describedby={name+'-help'} onChange={e=>set(name,e.target.value)}/></label><small id={name+'-help'} className="tw-field-help">{fieldHelp[name]}</small></div>
}
function TextArea({name,label,value,set}:{name:'description'|'objectives';label:string;value:FormationValues;set:Set}){
  return <div><label>{caption(label)}<textarea rows={name==='description'?3:7} maxLength={5000} value={value[name]} aria-describedby={name+'-help'} onChange={e=>set(name,e.target.value)}/></label><small id={name+'-help'} className="tw-field-help">{fieldHelp[name]}</small></div>
}

export function IdentityFields({value,set,orgs,reference}:{value:FormationValues;set:Set;orgs:Org[];reference:string}){
  const field={value,set}
  return <div className="tw-fields">
    <div className="wide"><TextInput name="title" label="Titre de la formation *" {...field}/><small>{value.title.length} / 255</small></div>
    <TextInput name="acronym" label="Acronyme de la formation" {...field}/><div><label>Type de programme<select value={value.modality} onChange={e=>set('modality',e.target.value)}>{['Classe virtuelle','À distance','Présentiel','Mixte'].map(v=><option key={v}>{v}</option>)}</select></label><small className="tw-field-help">Choisissez le format de la formation.</small></div>
    <div><TargetAudienceSelect value={value.targetAudience} onChange={id=>set('targetAudience',id)}/><small className="tw-field-help">Choisissez le public auquel s’adresse la formation. Le référentiel se gère dans Administration → Publics cibles.</small></div>
    <div><label>Référence<input readOnly value={reference} placeholder="Choisissez un public cible" aria-describedby="reference-help"/></label><small id="reference-help" className="tw-field-help">Créée automatiquement : acronyme du public cible, puis acronyme de la formation.</small></div>
    <div><b>{caption('Durée estimée *')}</b><div className="tw-duration"><TextInput name="hours" label="Heures" numeric {...field}/><TextInput name="minutes" label="Minutes" numeric {...field}/></div></div>
    <div><label>Prix de la formation (€)<input type="number" min="0" step="0.01" value={value.price} onChange={e=>set('price',e.target.value)}/></label><small className="tw-field-help">Indiquez le tarif de la formation en euros.</small></div>
    <div><OrganizationPicker legend={caption('Organismes *')} hint={value.organizations.length>1?'Organisme porteur : '+(orgs.find(o=>String(o.id)===value.organizations[0])?.name??''):'Sélectionnez un ou plusieurs organismes. Le premier devient l’organisme porteur.'} value={value.organizations} onChange={ids=>set('organizations',ids)}/></div>
  </div>
}

export function ProgrammeFields({value,set}:{value:FormationValues;set:Set}){
  return <div className="tw-fields">
    <div className="wide"><TextInput name="orientation" label="Orientation" value={value} set={set}/></div>
    <div className="wide"><TextArea name="description" label="Description *" value={value} set={set}/></div>
    <div className="wide"><TextArea name="objectives" label="Objectifs pédagogiques" value={value} set={set}/></div>
  </div>
}

export function VisualCard({thumbnail,loading,disabled,onLoading,onChange,onError}:{thumbnail:string|null;loading:boolean;disabled?:boolean;onLoading:(loading:boolean)=>void;onChange:(thumbnail:string)=>void;onError:(message:string)=>void}){
  return <section className="tw-card"><h2><ImagePlus/>Visuel de la formation</h2><label className="tw-upload"><Upload/>{loading?'Chargement…':thumbnail?'Remplacer l’image':'Importer une image'}<span>JPEG, PNG ou WebP · 10 Mo maximum</span><input type="file" disabled={loading||disabled} accept="image/jpeg,image/png,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;onLoading(true);try{onChange(await formationThumbnail(file))}catch(err){onError((err as Error).message)}finally{onLoading(false)}}}/></label></section>
}

export function PreviewCard({thumbnail,modality,title,description,audience,reference,duration,price}:{thumbnail:string|null;modality:string;title:string;description:string;audience:string;reference:string;duration:string;price:string}){
  const facts=[['Public cible',audience,Users,'wide'],['Référence',reference,Tag,'wide'],['Durée',duration,Clock,''],['Prix',price,Euro,'']] as const
  return <section className="tw-card"><h2><Eye/>Aperçu de la formation</h2><div className="tw-picture">{thumbnail?<img src={thumbnail} alt="Visuel de la formation"/>:<ImagePlus/>}</div><div className="tw-tags"><span>{modality}</span></div><h3>{title||'Titre de la formation'}</h3><p className={description?'tw-excerpt':'tw-excerpt empty'}>{description||'La description de votre formation apparaîtra ici.'}</p><dl className="tw-facts">{facts.map(([label,value,Icon,size])=><div key={label} className={size}><Icon aria-hidden="true"/><dt>{label}</dt><dd className={value?undefined:'empty'}>{value||'À renseigner'}</dd></div>)}</dl></section>
}

type FundingProps={
  selected:string[];onSelect:(types:string[])=>void;orgs:Org[];rows:(key:FundingKey)=>FundingRow[];onRows:(key:FundingKey,rows:FundingRow[])=>void
  panels:{open?:string;show:(type:string)=>void;toggle:(type:string)=>void};defaultPrice?:string;note?:ReactNode;emptyOrganizations?:ReactNode
}
/** One card per funding to tick, then an accordion with what each ticked one asks for. */
export function FundingChoice({selected,onSelect,orgs,rows,onRows,panels,defaultPrice,note,emptyOrganizations}:FundingProps){
  return <div className="tw-funding"><p className="tw-field-help">Sélectionnez les financements proposés pour cette formation. Chacun demande ses propres informations.</p>
    <div className="tw-funds">{fundings.map(({type,help})=><label key={type}><input type="checkbox" aria-label={type} checked={selected.includes(type)} onChange={e=>{onSelect(e.target.checked?[...selected,type]:selected.filter(f=>f!==type));if(e.target.checked)panels.show(type)}}/><span><strong>{type}</strong><small>{help}</small></span></label>)}</div>
    {!!selected.length&&note&&<p className="tw-field-help">{note}</p>}
    {!!selected.length&&!orgs.length&&emptyOrganizations}
    {!!orgs.length&&fundings.filter(f=>selected.includes(f.type)).map(f=><FundingRows key={f.type} funding={f} open={panels.open===f.type} onToggle={()=>panels.toggle(f.type)} defaultPrice={defaultPrice} orgs={orgs} rows={rows(f.key)} onChange={next=>onRows(f.key,next)}/>)}
  </div>
}

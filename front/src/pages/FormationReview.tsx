import {BookOpen,CircleAlert,CircleCheck,Clock,Euro,GraduationCap,Info,Pencil,Tag,Users,Wallet,type LucideIcon} from 'lucide-react'
import type {CSSProperties} from 'react'
import {OrgBadges} from '../components/list/List'
import {priceLabel} from './formationFormat'
import {fundings,type FundingKey,type FundingRow} from './fundings'

type Org={id:number;name:string;code?:string;color?:string|null}
export type Check={label:string;section:number;done:boolean}
const sections:[string,LucideIcon][]=[['Informations générales',Info],['Programme',BookOpen],['Financements',Wallet]]

/** Left side of the last step: how far the formation is, and what is left in each section. */
export function ReviewProgress({checks,edit,publish,setPublish}:{checks:Check[];edit:(step:number)=>void;publish:boolean;setPublish:(publish:boolean)=>void}){
  const done=checks.filter(c=>c.done).length,left=checks.length-done
  const percent=Math.round(100*done/checks.length)
  return <div className="tw-reviews">
    <div className="tw-score">
      <div className="tw-ring" style={{'--value':percent} as CSSProperties} role="img" aria-label={percent+' % renseigné'}><strong>{percent} %</strong></div>
      <div><h3>{left?'Encore '+left+' point'+(left>1?'s':'')+' à compléter':'Formation complète'}</h3><p>{done} éléments renseignés sur {checks.length}</p></div>
    </div>
    {sections.map(([label,Icon],section)=>{
      const own=checks.filter(c=>c.section===section),ok=own.filter(c=>c.done).length,complete=ok===own.length
      return <article key={label} className={'tw-review '+(complete?'done':'todo')}>
        <header><Icon aria-hidden="true"/><div><h3>{label}</h3><small>{ok} / {own.length}</small></div>
          <button type="button" aria-label={'Modifier '+label} onClick={()=>edit(section)}><Pencil aria-hidden="true"/>Modifier</button></header>
        <div className="tw-segments" aria-hidden="true">{own.map(c=><i key={c.label} className={c.done?'on':undefined}/>)}</div>
        <ul>{own.map(c=><li key={c.label} className={c.done?'done':'todo'}>{c.done?<CircleCheck aria-label="Renseigné"/>:<CircleAlert aria-label="À compléter"/>}{c.label}</li>)}</ul>
      </article>})}
    <label className="tw-publish"><input type="checkbox" role="switch" aria-label="Publier la formation" aria-describedby="publish-help" checked={publish} onChange={e=>setPublish(e.target.checked)}/>
      <span><strong>Publier la formation</strong><small id="publish-help">{publish?'La formation sera active et disponible dans le catalogue.':'La formation sera créée mais inactive : aucune classe ne pourra être planifiée. Vous pourrez la publier depuis sa fiche.'}</small></span></label>
  </div>
}

type Summary={
  title:string;modality:string;thumbnail:string|null;audience:string;reference:string;duration:string;price:string;organizations:Org[]
  orientation:string;description:string;objectives:string;fundingTypes:string[];rows:(key:FundingKey)=>FundingRow[]
}

/** Right side of the last step: the formation as a visual sheet. */
export function ReviewSummary(p:Summary){
  const facts:[string,string,LucideIcon][]=[['Public cible',p.audience,Users],['Référence',p.reference,Tag],['Durée',p.duration,Clock],['Prix',p.price,Euro]]
  return <section className="tw-card tw-sheet"><h2><GraduationCap/>Résumé de la formation</h2>
    <div className="tw-cover">{p.thumbnail?<img src={p.thumbnail} alt="Visuel de la formation"/>:<GraduationCap aria-hidden="true"/>}<span>{p.modality}</span></div>
    <h3>{p.title||'Titre de la formation'}</h3><OrgBadges organizations={p.organizations}/>
    <dl className="tw-facts">{facts.map(([label,value,Icon],i)=><div key={label} className={i<2?'wide':undefined}><Icon aria-hidden="true"/><dt>{label}</dt><dd className={value?undefined:'empty'}>{value||'À renseigner'}</dd></div>)}</dl>
    {([['Orientation',p.orientation],['Description',p.description],['Objectifs pédagogiques',p.objectives]] as const).filter(([,value])=>value.trim()).map(([label,value])=><div key={label} className="tw-text"><h4>{label}</h4><p>{value}</p></div>)}
    {fundings.filter(f=>p.fundingTypes.includes(f.type)).map(f=><div key={f.type} className="tw-money"><h4><Wallet aria-hidden="true"/>{f.type}</h4>
      {p.rows(f.key).map((row,i)=><div key={i} className="tw-line"><p><OrgBadges organizations={p.organizations.filter(o=>o.id===row.organization)}/><span>{row.year}</span></p>
        <dl>{f.columns.filter(c=>row[c.key]).map(c=><div key={c.key}><dt>{c.label.replace(' (€)','')}</dt><dd>{c.numeric&&c.key!=='durationHours'?priceLabel(row[c.key]):row[c.key]}</dd></div>)}</dl></div>)}
      {!p.rows(f.key).length&&<p className="tw-none">Aucune information saisie</p>}</div>)}
  </section>
}

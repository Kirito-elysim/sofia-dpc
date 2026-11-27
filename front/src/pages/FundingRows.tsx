import {ChevronDown} from 'lucide-react'
import type {FundingRow,fundings} from './fundings'

type Org={id:number;name:string;code?:string;color?:string|null;andpcNumber?:string|null}

const year=new Date().getFullYear()

/** One accordion panel per funding: a block per organisation, a line per year. Rows without an organisation belong to the first one. */
export function FundingRows({funding,orgs,rows,onChange,open,onToggle,defaultPrice=''}:{open:boolean;onToggle:()=>void;defaultPrice?:string;funding:typeof fundings[number];orgs:Org[];rows:FundingRow[];onChange:(rows:FundingRow[])=>void}){
  const set=(index:number,row:FundingRow)=>onChange(index<0?[...rows,row]:rows.map((r,i)=>i===index?row:r))
  // The header sums the panel up, so a closed one still shows what is left to fill.
  const needsCode=funding.columns.some(c=>c.key==='code')
  const done=orgs.filter(o=>{
    const own=rows.filter(row=>(row.organization??orgs[0].id)===o.id),lines=own.length?own:[{year} as FundingRow]
    return needsCode?lines.every(row=>!!row.code?.trim()):lines.some(row=>!!((row.priceHT??defaultPrice)||row.priceTTC))
  }).length
  const complete=done===orgs.length
  const panel='funding-'+funding.type
  return <section className="tw-accordion" aria-label={'Financement '+funding.type}>
    <h3><button type="button" aria-expanded={open} aria-controls={panel} onClick={onToggle}><strong>{funding.type}</strong>
      <span className={complete?'done':undefined}>{complete?'Complet':(needsCode?'Code':'Prix')+' renseigné pour '+done+' sur '+orgs.length}</span><ChevronDown aria-hidden="true"/></button></h3>
    <div id={panel} hidden={!open}>
    {orgs.map(o=>{
      const own=rows.map((row,index)=>({row,index})).filter(({row})=>(row.organization??orgs[0].id)===o.id)
      const shown=own.length?own:[{row:{organization:o.id,year} as FundingRow,index:-1}]
      return <fieldset key={o.id} className="tw-org-codes" data-color={o.color??(o.code?.includes('PHO')?'purple':'blue')}><legend>{o.name}</legend>
        {funding.type==='ANDPC'&&<small>{o.andpcNumber?'N° ANDPC de l’organisme : '+o.andpcNumber:'N° ANDPC de l’organisme non renseigné.'}</small>}
        {shown.map(({row,index},position)=><div className="tw-code" key={position}>
          <label>Année<input type="number" value={row.year||''} onChange={e=>set(index,{...row,organization:o.id,year:Number(e.target.value)})}/></label>
          {funding.columns.map(column=><label key={column.key}>{column.label}<input type={column.numeric?'number':'text'} min={column.numeric?0:undefined} step={column.numeric?'0.01':undefined} maxLength={100} value={row[column.key]??(column.key==='priceHT'?defaultPrice:'')} onChange={e=>set(index,{...row,organization:o.id,[column.key]:e.target.value})}/></label>)}
          {own.length>1&&<button type="button" aria-label={'Retirer la ligne '+(position+1)+' de '+o.name+' ('+funding.type+')'} onClick={()=>onChange(rows.filter((_,i)=>i!==index))}>Retirer</button>}</div>)}
        <button type="button" disabled={!own.length} onClick={()=>set(-1,{organization:o.id,year})}>Ajouter une année</button>
      </fieldset>})}
    </div>
  </section>
}

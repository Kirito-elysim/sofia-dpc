/** What each funding asks for, per organisation and per year (essentials taken from the former platform). */
export type FundingRow={organization?:number;year:number;code?:string;priceHT?:string;priceTTC?:string;andpcSupport?:string;durationHours?:string}
export type FundingKey='andpcCodes'|'fifplCodes'|'personalPrices'
type Column={key:Exclude<keyof FundingRow,'organization'|'year'>;label:string;numeric?:boolean}
export const fundings:{type:string;key:FundingKey;help:string;columns:Column[]}[]=[
  {type:'ANDPC',key:'andpcCodes',help:'Un numéro d’action DPC par organisme.',columns:[
    {key:'code',label:'Numéro d’action DPC'},{key:'priceHT',label:'Prix HT (€)',numeric:true},{key:'andpcSupport',label:'Prise en charge ANDPC (€)',numeric:true}]},
  {type:'FIFPL',key:'fifplCodes',help:'Prise en charge des professionnels libéraux.',columns:[
    {key:'code',label:'Code FIFPL'},{key:'durationHours',label:'Durée (heures)',numeric:true},{key:'priceHT',label:'Prix HT (€)',numeric:true}]},
  {type:'Personnel',key:'personalPrices',help:'Formation réglée par le participant.',columns:[
    {key:'priceHT',label:'Prix HT (€)',numeric:true},{key:'priceTTC',label:'Prix TTC (€)',numeric:true}]},
]
/** An untouched « Prix HT » takes the price of the first step; an emptied one stays empty. */
export const withPrice=(row:FundingRow,price:string):FundingRow=>({...row,priceHT:row.priceHT??price})
/** A stored line still at that price keeps following it when the draft is resumed. */
export const followPrice=(rows:FundingRow[]=[],price?:string|null)=>rows.map(row=>price&&row.priceHT===price?{...row,priceHT:undefined}:row)
export const isFilled=(row:FundingRow)=>Object.entries(row).some(([key,value])=>key!=='organization'&&key!=='year'&&String(value??'').trim()!=='')
/** Empty fields are not sent. */
export const compact=(row:FundingRow)=>Object.fromEntries(Object.entries(row).filter(([,value])=>String(value??'').trim()!=='')) as FundingRow

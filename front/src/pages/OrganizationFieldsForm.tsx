import {Check,ChevronDown} from 'lucide-react'
import {establishmentNumber,fieldHelp,optional,options,organizationColors,types} from './organizationFields'

export function OrganizationFieldsForm({group,formValues,update,editing=false}:{
  group:string[][];formValues:Record<string,string>;update:(key:string,value:string)=>void;editing?:boolean
}){
  const isRequired = (key:string) => editing
    ? ['name','code','emailFrom','active','andpcNumber'].includes(key)
    : key !== 'smsSender' && !optional.includes(key)
  return <>{group.map(([key,label,hint])=>key==='color'?
      <div key={key} className="ow-color-field" role="group" aria-labelledby="ow-color-label" aria-describedby="ow-color-help">
        <span id="ow-color-label">{label}</span>
        <div className="ow-color-options">
          {organizationColors.map(([value,name])=><label key={value} data-color={value}>
            <input type="radio" name="color" value={value} checked={formValues.color===value} onChange={()=>update('color',value)}/>
            <span className="ow-color-swatch" aria-hidden="true">{formValues.color===value&&<Check/>}</span>
            <span>{name}</span>
          </label>)}
        </div>
        <small id="ow-color-help" className="ow-field-help">{fieldHelp.color}</small>
      </div>:<label key={key} className={['name','url','smsSender'].includes(key)?'wide':''}><span id={`ow-label-${key}`}>{label} {isRequired(key)&&<em>*</em>}</span>
    {options[key]||key==='active'?
      <div className="ow-select" data-status={key==='active'?formValues.active:undefined}>
        <select name={key} aria-labelledby={`ow-label-${key}`} aria-describedby={`ow-help-${key}`} required={isRequired(key)} value={formValues[key]??''} onChange={e=>update(key,e.target.value)}>
          {key==='active'?<><option value="1">Actif</option><option value="0">Inactif</option></>:<><option value="">Sélectionner…</option>{formValues[key]&&!options[key].includes(formValues[key])&&<option>{formValues[key]}</option>}{options[key].map(o=><option key={o}>{o}</option>)}</>}
        </select>
        <ChevronDown aria-hidden="true"/>
      </div>:
      <input readOnly={editing&&key==='code'} name={key} aria-labelledby={`ow-label-${key}`} aria-describedby={`ow-help-${key}`} type={types[key]??'text'} required={isRequired(key)} placeholder={hint} value={formValues[key]??''} onChange={e=>update(key,key==='siret'?e.target.value.replace(/\s/g,''):e.target.value)}
        {...(key==='siret'?{pattern:establishmentNumber.pattern,inputMode:establishmentNumber.inputMode,title:establishmentNumber.hint}:{maxLength:key==='numberAPE'?15:undefined,pattern:({code:'[A-Z0-9_]{2,20}',smsSender:'[A-Za-z0-9]{1,11}'} as Record<string,string>)[key]})}/>}<small id={`ow-help-${key}`} className="ow-field-help">{fieldHelp[key]}</small></label>)}</>
}

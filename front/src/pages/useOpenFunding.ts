import {useState} from 'react'

/** One funding panel open at a time: the first selected one until another is chosen; '' closes them all. */
export function useOpenFunding(selected:string[]){
  const [chosen,show]=useState<string>()
  const open=chosen===''||(chosen&&selected.includes(chosen))?chosen:selected[0]
  return {open,show,toggle:(type:string)=>show(open===type?'':type)}
}

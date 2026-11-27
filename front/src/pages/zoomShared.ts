import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

export type Policy = { passcode: boolean; waitingRoom: boolean; joinBeforeHost: boolean; recording: string }
export type Config = { id?: number; name: string; hosts: number[]; archived: boolean; policy: Policy }
export type Draft = Config & { organizations: number[] }
export type Directory = {
  items: Config[]
  organizations: {id:number; name:string; code:string; color:string|null; config:number|null}[]
  hosts: {id:number;label:string;active:boolean}[]
}

export function useZoomDirectory() {
  return useQuery({queryKey:['virtual-class-configs'],queryFn:()=>api<Directory>('/virtual-class-configs')})
}

/** Asks before leaving a Zoom form that holds unsaved input (marked with data-dirty). */
export function confirmDiscard() {
  return !document.querySelector('.zoom-workspace form[data-dirty=true]') || confirm('Abandonner les modifications non enregistrées ?')
}

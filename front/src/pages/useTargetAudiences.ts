import {useQuery} from '@tanstack/react-query'
import {api} from '../api'

export const useTargetAudiences=()=>useQuery({queryKey:['target-audiences'],queryFn:()=>api<{id:number;name:string;acronym?:string}[]>('/target-audiences')})

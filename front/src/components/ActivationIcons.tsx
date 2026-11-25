import {CircleCheck,CircleMinus,CirclePause,CirclePlay} from 'lucide-react'

export function ActivationStatusIcon({active}:{active:boolean}) {
  const Icon=active?CircleCheck:CircleMinus
  return <Icon className="activation-status-icon" aria-hidden="true"/>
}

export function ActivationActionIcon({active}:{active:boolean}) {
  const Icon=active?CirclePause:CirclePlay
  return <Icon aria-hidden="true"/>
}

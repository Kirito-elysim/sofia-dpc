import { LayoutGrid, Users, SlidersHorizontal } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import ZoomConnector from './ZoomConnector'
import ZoomHosts from './ZoomHosts'
import VirtualClassConfigs from './VirtualClassConfigs'
import ZoomOverview from './ZoomOverview'
import ZoomPage from './ZoomPage'
import { confirmDiscard } from './zoomShared'

type Props = { global: boolean; canWrite: boolean }

export default function ZoomWorkspace({ global, canWrite }: Props) {
  const [params, setParams] = useSearchParams()
  const requested=params.get('step')
  const active=requested==='organizations'?'configs':requested
  const navigate = (step?:string) => {
    if (!confirmDiscard()) return
    setParams(previous => {
      const next = new URLSearchParams(previous)
      if (step) next.set('step', step)
      else next.delete('step')
      next.delete('zoom')
      return next
    })
  }
  const accounts=global&&(active==='connection'||active==='hosts')
  const intro=<nav className="zoom-tabs" aria-label="Rubriques Zoom">
    <button aria-current={!accounts&&active!=='configs'?'page':undefined} onClick={()=>navigate()}><LayoutGrid/>Vue d’ensemble</button>
    <button disabled={!global} aria-current={accounts?'page':undefined} onClick={()=>navigate('hosts')}><Users/>Comptes Zoom</button>
    <button aria-current={active==='configs'?'page':undefined} onClick={()=>navigate('configs')}><SlidersHorizontal/>Configurations</button>
  </nav>
  if(accounts&&active==='connection') return <ZoomPage intro={intro}><ZoomConnector/></ZoomPage>
  if(accounts) return <ZoomHosts intro={<>{intro}<button className="zoom-back" onClick={()=>navigate('connection')}>Connexion OAuth et import des hôtes</button></>}/>
  if(active==='configs') return <VirtualClassConfigs intro={intro} canWrite={canWrite}/>
  return <ZoomPage intro={intro}><ZoomOverview canWrite={canWrite} global={global}/></ZoomPage>
}

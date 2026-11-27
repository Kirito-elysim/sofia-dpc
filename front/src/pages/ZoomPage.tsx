import { House } from 'lucide-react'
import type { ReactNode } from 'react'
import { ListPage, PageHeader } from '../components/list/List'
import './zoom-workspace.css'

export default function ZoomPage({intro,add,children}:{intro:ReactNode;add?:{label:string;onClick:()=>void};children:ReactNode}) {
  return <ListPage className="zoom-workspace">
    <p className="zd-crumb"><House/> /　Paramètres　 /　<strong>Zoom</strong></p>
    <PageHeader icon="video" title="Paramètres Zoom" subtitle="Connexion, comptes hôtes et réglages des classes virtuelles." add={add}/>
    {intro}{children}
  </ListPage>
}

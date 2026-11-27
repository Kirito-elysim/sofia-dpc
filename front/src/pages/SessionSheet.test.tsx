import {afterEach,expect,test,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {MemoryRouter,Route,Routes} from 'react-router-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import SessionSheet from './SessionSheet'
import {phaseOf} from './sessionModel'
import {api} from '../api'

vi.mock('../api',()=>({api:vi.fn()}))
afterEach(cleanup)

test('classe une session selon ses dates, bornes comprises',()=>{
  const session={startsOn:'2030-11-01',endsOn:'2030-11-30'}
  expect(['2030-10-31','2030-11-01','2030-11-30','2030-12-01'].map(now=>phaseOf(session,now))).toEqual(['upcoming','running','running','over'])
})

test('rattache une formation publiée et prolonge son accès',async()=>{
  const formation={id:7,title:'Diabète',fundingTypes:['ANDPC'],defaultCapacity:12,active:true,organization:{id:4}}
  const attached={id:3,formation,capacity:12,fundingNumbers:[],effectiveAccessStartsOn:'2030-11-01',effectiveAccessEndsOn:'2030-11-30'}
  const session={id:2,name:'Novembre',organization:{id:4,name:'SOFIA'},startsOn:'2030-11-01',endsOn:'2030-11-30',sessionFormations:[attached]}
  const other={...formation,id:8,title:'Asthme'}
  vi.mocked(api).mockImplementation(async path=>path==='/organizations'?[session.organization]:path==='/formations'?[formation,other,{...other,id:9,title:'Brouillon',active:false},{...other,id:10,title:'Ailleurs',organization:{id:99}}]:session)
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/sessions/2']}><Routes><Route path="/sessions/:id" element={<SessionSheet canWrite/>}/></Routes></MemoryRouter></QueryClientProvider>)
  const card=within(await screen.findByRole('article',{name:'Diabète'}))
  expect(card.getByText(/hérité de la session/)).toBeTruthy()
  // Only published formations of the organisation that are not attached yet.
  await screen.findByRole('option',{name:'Asthme'})
  expect(screen.queryByRole('option',{name:/Diabète|Brouillon|Ailleurs/})).toBeNull()
  fireEvent.change(screen.getByLabelText('Formation à rattacher'),{target:{value:'8'}})
  fireEvent.click(screen.getByRole('button',{name:'Rattacher'}))
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/session-formations',expect.objectContaining({method:'POST',body:JSON.stringify({session:'/api/sessions/2',formation:'/api/formations/8',capacity:12})})))
  fireEvent.change(card.getByLabelText('N° de session DPC'),{target:{value:'013'}})
  fireEvent.change(card.getByLabelText('Fin d’accès'),{target:{value:'2030-12-31'}})
  expect(card.getByText(/31\/12\/2030 · dates propres/)).toBeTruthy()
  fireEvent.click(card.getByRole('button',{name:'Enregistrer Diabète'}))
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/session-formations/3',expect.objectContaining({method:'PATCH',body:JSON.stringify({capacity:12,fundingNumbers:{ANDPC:'013'},accessStartsOn:null,accessEndsOn:'2030-12-31'})})))
})

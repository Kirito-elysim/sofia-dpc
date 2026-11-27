import {expect,test,vi} from 'vitest'
import {render,fireEvent,screen,waitFor} from '@testing-library/react'
import {MemoryRouter,Route,Routes} from 'react-router-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import FormationSheet from './FormationSheet'
import {api} from '../api'
vi.mock('../api',()=>({api:vi.fn()}))

test('conserve la saisie pendant la consultation des sessions et enregistre le champ modifié',async()=>{
  const org={id:4,name:'SOFIA',active:true}
  const record={id:8,title:'Formation initiale',organization:org,publicationStatus:'draft',active:true,defaultCapacity:20,fundingTypes:[],andpcCodes:[]}
  vi.mocked(api).mockImplementation(async(path,init)=>{
    if(path==='/target-audiences')return []
    if(path==='/organizations')return [org]
    if(path==='/virtual-classes')return [{id:3,formation:{id:8},date:'2026-11-27',reference:'Session A',capacity:20,enrolledCount:2,status:'PLANNED'},{id:5,formation:{id:9},reference:'Autre session'}]
    return {...record,...JSON.parse(String(init?.body??'{}'))}
  })
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/settings/formations/8/edit']}><Routes><Route path="/settings/formations/:id/edit" element={<FormationSheet canReadClasses canSchedule/>}/></Routes></MemoryRouter></QueryClientProvider>)
  fireEvent.change(await screen.findByLabelText('Titre de la formation *'),{target:{value:'Formation révisée'}})
  fireEvent.click(screen.getByRole('button',{name:'Pilotage'}))
  expect(await screen.findByRole('link',{name:'Session A'})).toBeTruthy()
  expect(screen.queryByText('Autre session')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Diffusion'}))
  fireEvent.click(screen.getByRole('button',{name:'Enregistrer'}))
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/formations/8',expect.objectContaining({method:'PATCH',body:JSON.stringify({title:'Formation révisée'})})))
})

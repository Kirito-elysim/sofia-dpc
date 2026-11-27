import {afterEach,expect,test,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter,Route,Routes} from 'react-router-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import Registrations from './Registrations'
import {api} from '../api'

vi.mock('../api',()=>({api:vi.fn()}))
afterEach(cleanup)

test('inscrit un PS et affiche sa présence par demi-journée',async()=>{
  const registration={id:5,funding:'ANDPC',effectiveAccessStartsOn:'2030-11-01',effectiveAccessEndsOn:'2030-11-30',participant:{id:1,firstName:'Paul',lastName:'Test',email:'ps@example.test'},
    attendance:[{classId:9,date:'2030-11-14',label:'Matin',seconds:7200,expected:14400,upcoming:false},{classId:9,date:'2030-11-14',label:'Après-midi',seconds:0,expected:10800,upcoming:true}]}
  vi.mocked(api).mockImplementation(async(_,init)=>init?.method?{}:{session:{id:2,name:'Novembre'},formation:{title:'Diabète',fundingTypes:['ANDPC']},capacity:2,accessStartsOn:'2030-11-01',accessEndsOn:'2030-11-30',registrations:[registration]})
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/sessions/2/formations/3']}><Routes><Route path="/sessions/:id/formations/:formationId" element={<Registrations canWrite/>}/></Routes></MemoryRouter></QueryClientProvider>)
  expect(await screen.findByText(/120 \/ 240 min/)).toBeTruthy()
  expect(screen.getByText(/à venir/)).toBeTruthy()
  for(const [label,value] of [['Prénom','Ana'],['Nom','Fictive'],['E-mail','ana@example.test']])fireEvent.change(screen.getByLabelText(new RegExp('^'+label)),{target:{value}})
  fireEvent.click(screen.getByRole('button',{name:'Inscrire'}))
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/session-formations/3/registrations',expect.objectContaining({method:'POST',body:JSON.stringify({firstName:'Ana',lastName:'Fictive',email:'ana@example.test',phone:null,rpps:null,funding:'ANDPC',accessStartsOn:null,accessEndsOn:null})})))
})

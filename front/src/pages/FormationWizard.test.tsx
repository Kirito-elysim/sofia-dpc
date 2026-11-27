import {expect,test,vi} from 'vitest'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {api} from '../api'
import FormationWizard from './FormationWizard'

vi.mock('../api',()=>({api:vi.fn(),impersonate:vi.fn()}))

test('prévisualise le titre puis publie la formation après les quatre étapes',async()=>{
  const client=new QueryClient()
  vi.mocked(api).mockImplementation(async path=>path==='/organizations'?[{id:7,name:'Sofia'},{id:8,name:'Studio'}]:path==='/target-audiences'?[{id:5,name:'Médecins'}]:{id:1})
  render(<QueryClientProvider client={client}><MemoryRouter><FormationWizard/></MemoryRouter></QueryClientProvider>)
  await screen.findByLabelText('Titre de la formation *')
  const fill=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}})
  fill('Titre de la formation *','Formation pilote')
  expect(screen.getByRole('heading',{name:'Formation pilote'})).toBeTruthy()
  fireEvent.click(await screen.findByRole('button',{name:'Sofia'}))
  fireEvent.click(screen.getByRole('button',{name:'Studio'}))
  fill('Slug ou référence','med-01')
  expect(screen.queryByLabelText('Description *')).toBeNull()
  await screen.findByRole('option',{name:'Médecins'})
  fill('Public cible','5')
  fill('Heures','2')
  const next=()=>fireEvent.click(screen.getByRole('button',{name:'Suivant'}))
  next()
  fill('Orientation','Prévention')
  fill('Description *','Formation de test')
  fill('Objectifs pédagogiques','Objectif de test')
  next()
  expect(screen.queryByText('Évaluations')).toBeNull()
  expect(screen.queryByLabelText('CPF')).toBeNull()
  fireEvent.click(screen.getByLabelText('Personnel'))
  next()
  expect(screen.getByRole('heading',{name:'Résumé de la formation'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Modifier Financements'}))
  expect((screen.getByLabelText('Personnel') as HTMLInputElement).checked).toBe(true)
  next()
  fireEvent.click(screen.getByRole('button',{name:'Publier la formation'}))
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/formations',expect.objectContaining({method:'POST'})))
  const [path,request]=vi.mocked(api).mock.calls.find(([path])=>path==='/formations')!
  expect(path).toBe('/formations')
  expect(JSON.parse(String(request?.body))).toMatchObject({organization:'/api/organizations/7',additionalOrganizations:['/api/organizations/8'],targetAudience:'/api/target-audiences/5',customReference:'med-01',title:'Formation pilote',totalDurationMin:120,publicationStatus:'published',fundingTypes:['Personnel'],orientation:'Prévention',description:'Formation de test',objectives:'Objectif de test'})
})

test('ouvre la création depuis le bouton de l’en-tête du catalogue',async()=>{
  const {Formations}=await import('./Settings')
  const {Routes,Route}=await import('react-router-dom')
  vi.mocked(api).mockImplementation(async path=>path==='/auth/me'?{roles:[]}:[])
  const view=render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/settings/formations']}>
    <Routes><Route path="/settings/formations" element={<Formations canWrite/>}/>
      <Route path="/settings/formations/new" element={<FormationWizard/>}/></Routes>
  </MemoryRouter></QueryClientProvider>)
  const create=view.getByRole('button',{name:'Créer une formation'})
  expect(create.closest('header')).toBeTruthy()
  fireEvent.click(create)
  expect(await view.findByRole('heading',{name:'Créer une formation'})).toBeTruthy()
})

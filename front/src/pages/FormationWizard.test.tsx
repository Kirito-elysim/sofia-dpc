import {expect,test,vi} from 'vitest'
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {api} from '../api'
import FormationWizard from './FormationWizard'

vi.mock('../api',()=>({api:vi.fn(),impersonate:vi.fn()}))

test('prévisualise le titre puis publie la formation après les quatre étapes',async()=>{
  const client=new QueryClient()
  vi.mocked(api).mockImplementation(async path=>path==='/organizations'?[{id:7,name:'Sofia'},{id:8,name:'Studio'}]:path==='/target-audiences'?[{id:5,name:'Médecins',acronym:'MED'}]:{id:1})
  render(<QueryClientProvider client={client}><MemoryRouter><FormationWizard/></MemoryRouter></QueryClientProvider>)
  await screen.findByLabelText('Titre de la formation *')
  const fill=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}})
  fill('Titre de la formation *','Formation pilote')
  expect(screen.getByRole('heading',{name:'Formation pilote'})).toBeTruthy()
  fireEvent.click(await screen.findByRole('button',{name:'Sofia'}))
  fireEvent.click(screen.getByRole('button',{name:'Studio'}))
  fill('Acronyme de la formation','etp')
  expect(screen.queryByLabelText('Description *')).toBeNull()
  await screen.findByRole('option',{name:'Médecins'})
  fill('Public cible','5')
  fill('Heures','2')
  fill('Prix de la formation (€)','450.50')
  const summary=screen.getByRole('heading',{name:'Aperçu de la formation'}).closest('section')!
  for(const text of ['Médecins (MED)','MED-ETP','2 h'])expect(summary.textContent).toContain(text)
  expect(summary.textContent).toMatch(/450,50\s€/)
  fill('Acronyme de la formation','')
  expect(summary.textContent).toContain('MED-formation-pilote')
  fill('Acronyme de la formation','etp')
  const next=()=>fireEvent.click(screen.getByRole('button',{name:'Suivant'}))
  next()
  fill('Orientation','Prévention')
  fill('Description *','Formation de test')
  fill('Objectifs pédagogiques','Objectif de test')
  next()
  expect(screen.queryByText('Évaluations')).toBeNull()
  expect(screen.queryByLabelText('CPF')).toBeNull()
  fireEvent.click(screen.getByLabelText('Personnel'))
  fireEvent.click(screen.getByLabelText('ANDPC'))
  fireEvent.click(screen.getByLabelText('FIFPL'))
  next()
  expect(screen.getByRole('alert').textContent).toContain('numéro d’action DPC pour : Sofia, Studio')
  expect(screen.getByRole('alert').textContent).toContain('code FIFPL pour : Sofia, Studio')
  const line=(funding:string,org:string,label:string,value:string)=>fireEvent.change(within(within(screen.getByRole('region',{name:'Financement '+funding})).getByRole('group',{name:org})).getByLabelText(label),{target:{value}})
  // One panel at a time: publishing with codes missing opens the first incomplete one.
  const header=(funding:string)=>screen.getByRole('button',{name:new RegExp('^'+funding+' ?(Complet|Code|Prix)')})
  expect(header('ANDPC').getAttribute('aria-expanded')).toBe('true')
  expect(header('FIFPL').getAttribute('aria-expanded')).toBe('false')
  for(const [org,code] of [['Sofia','S-001'],['Studio','P-002']])line('ANDPC',org,'Numéro d’action DPC',code)
  expect(header('ANDPC').textContent).toContain('Complet')
  fireEvent.click(header('FIFPL'))
  expect(header('ANDPC').getAttribute('aria-expanded')).toBe('false')
  for(const [org,code] of [['Sofia','S-001'],['Studio','P-002']])line('FIFPL',org,'Code FIFPL','F-'+code)
  fireEvent.click(header('Personnel'))
  line('Personnel','Studio','Prix TTC (€)','360')
  // The price of the first step fills every « Prix HT » until it is changed.
  const prices=screen.getAllByLabelText('Prix HT (€)') as HTMLInputElement[]
  expect(prices.map(input=>input.value)).toEqual(Array(6).fill('450.50'))
  fireEvent.click(header('FIFPL'))
  line('FIFPL','Studio','Prix HT (€)','300')
  next()
  expect(screen.getByRole('heading',{name:'Résumé de la formation'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Modifier Financements'}))
  expect((screen.getByLabelText('Personnel') as HTMLInputElement).checked).toBe(true)
  next()
  const toggle=screen.getByRole('switch',{name:'Publier la formation'})
  fireEvent.click(toggle)
  expect(screen.getByRole('button',{name:'Créer sans publier'})).toBeTruthy()
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button',{name:'Publier la formation'}))
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/formations',expect.objectContaining({method:'POST'})))
  const [path,request]=vi.mocked(api).mock.calls.find(([path])=>path==='/formations')!
  expect(path).toBe('/formations')
  expect(JSON.parse(String(request?.body))).toMatchObject({organization:'/api/organizations/7',additionalOrganizations:['/api/organizations/8'],targetAudience:'/api/target-audiences/5',acronym:'etp',title:'Formation pilote',totalDurationMin:120,price:'450.50',publicationStatus:'published',fundingTypes:['Personnel','ANDPC','FIFPL'],andpcCodes:[{organization:7,code:'S-001',priceHT:'450.50'},{organization:8,code:'P-002',priceHT:'450.50'}],fifplCodes:[{organization:7,code:'F-S-001',priceHT:'450.50'},{organization:8,code:'F-P-002',priceHT:'300'}],personalPrices:[{organization:7,priceHT:'450.50'},{organization:8,priceTTC:'360',priceHT:'450.50'}],orientation:'Prévention',description:'Formation de test',objectives:'Objectif de test'})
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

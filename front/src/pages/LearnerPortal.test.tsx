import {afterEach,expect,test,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import LearnerPortal from './LearnerPortal'
import {api,ApiError} from '../api'

vi.mock('../api',async original=>({...await original<typeof import('../api')>(),api:vi.fn()}))
afterEach(()=>{cleanup();vi.mocked(api).mockReset();window.history.replaceState(null,'','/')})
const show=()=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><LearnerPortal/></QueryClientProvider>)

test('demande un lien sans révéler si l’adresse est connue',async()=>{
  vi.mocked(api).mockImplementation(async path=>{if(path==='/portal/me')throw new ApiError(401,'ERROR','Connectez-vous');return undefined})
  show()
  fireEvent.change(await screen.findByLabelText('Adresse e-mail'),{target:{value:'ps@example.test'}})
  fireEvent.click(screen.getByRole('button',{name:'Recevoir mon lien'}))
  expect(await screen.findByText(/Si cette adresse correspond/)).toBeTruthy()
  expect(api).toHaveBeenCalledWith('/portal/links',{method:'POST',body:JSON.stringify({email:'ps@example.test'})})
})

test('consomme le jeton, le retire de l’adresse et montre les seules formations ouvertes en détail',async()=>{
  window.history.replaceState(null,'','/espace#token=abc')
  const formation=(id:number,title:string,open:boolean)=>({id,formation:title,session:'Novembre',organization:'SOFIA',accessStartsOn:'2030-11-01',accessEndsOn:'2030-11-30',open,
    resources:open?[{id:4,title:'Support'}]:[],classes:open?[{classId:1,date:'2030-11-14',label:'Matin',start:'09:00',end:'13:00',joinUrl:'https://example.test/j/1'}]:[]})
  vi.mocked(api).mockImplementation(async path=>path==='/portal/me'?{firstName:'Paul',formations:[formation(1,'Ouverte',true),formation(2,'Fermée',false)]}:undefined)
  show()
  expect(await screen.findByRole('heading',{name:'Bonjour Paul'})).toBeTruthy()
  await waitFor(()=>expect(window.location.hash).toBe(''))
  expect(api).toHaveBeenCalledWith('/portal/session',{method:'POST',body:JSON.stringify({token:'abc'})})
  expect(screen.getByRole('link',{name:'Télécharger'}).getAttribute('href')).toBe('/api/portal/resources/4/file')
  expect(screen.getByRole('link',{name:'Rejoindre'})).toBeTruthy()
  expect(screen.getAllByText(/Accès fermé/)).toHaveLength(1)
})

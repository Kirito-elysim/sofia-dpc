import {expect,test,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import Layout from './Layout'

vi.mock('../api',()=>({api:vi.fn(),impersonate:vi.fn()}))

test('replie le menu, garde les libellés accessibles et mémorise le choix',()=>{
  const saved=new Map<string,string>()
  vi.stubGlobal('localStorage',{getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>saved.set(k,v)})
  const me={email:'demo@example.test',name:'Demo',roles:['ROLE_SUPER_ADMIN']}
  const show=()=>render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Layout me={me}/></MemoryRouter></QueryClientProvider>)
  show()
  fireEvent.click(screen.getByRole('button',{name:'Rétracter la navigation'}))
  expect(screen.getByRole('button',{name:'Développer la navigation'}).getAttribute('aria-expanded')).toBe('false')
  expect(screen.getByRole('link',{name:'Formations'})).toBeTruthy()
  cleanup()
  show()
  expect(screen.getByRole('button',{name:'Développer la navigation'})).toBeTruthy()
  vi.unstubAllGlobals()
})

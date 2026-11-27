import {afterEach,expect,test,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import ScheduleClass from './ScheduleClass'
import {api} from '../api'

vi.mock('../api',()=>({api:vi.fn()}))
afterEach(cleanup)

test('réunit deux formations de session sur une date ouverte aux deux',async()=>{
  const offer=(id:number,title:string,from:string,to:string)=>({id,formation:{id,title,active:true},capacity:12,effectiveAccessStartsOn:from,effectiveAccessEndsOn:to})
  const session=(id:number,org:number,items:object[])=>({id,name:'Session '+id,organization:{id:org,name:'Org '+org},sessionFormations:items})
  vi.mocked(api).mockImplementation(async(path,init)=>{
    if(init?.method==='POST')return {id:9}
    if(path==='/sessions')return [session(1,4,[offer(1,'Diabète','2030-11-01','2030-11-30')]),session(2,4,[offer(2,'Asthme','2030-11-15','2030-12-15')]),session(3,5,[offer(3,'Ailleurs','2030-11-01','2030-11-30')])]
    if(path==='/trainers')return [{id:6,firstName:'A',lastName:'B',active:true,organizations:[{id:4}]}]
    return [{id:7,label:'Matin',startTime:'09:00',endTime:'13:00',active:true}]
  })
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[{pathname:'/classes/new',state:{sessionFormationId:1}}]}><ScheduleClass/></MemoryRouter></QueryClientProvider>)
  fireEvent.click(await screen.findByLabelText('Session 2 · Asthme'))
  expect(screen.queryByLabelText(/Ailleurs/)).toBeNull()
  const date=screen.getByLabelText(/^Date/) as HTMLInputElement
  expect([date.min,date.max]).toEqual(['2030-11-15','2030-11-30'])
  fireEvent.change(date,{target:{value:'2030-11-20'}})
  await screen.findByRole('option',{name:'A B'})
  fireEvent.change(screen.getByLabelText(/Matin/),{target:{value:'6'}})
  fireEvent.submit(date.closest('form')!)
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/scheduled-classes',expect.objectContaining({method:'POST'})))
  const [,request]=vi.mocked(api).mock.calls.find(([,init])=>init?.method==='POST')!
  expect(JSON.parse(String(request?.body))).toMatchObject({date:'2030-11-20',sessionFormationIds:[1,2],capacity:12,slots:[{timeSlotId:7,trainerId:6}]})
})

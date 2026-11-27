import {expect,test} from 'vitest'
import {durationLabel} from './formationFormat'

test('affiche la durée en heures et minutes, jamais en heures décimales',()=>{
  expect([470,120,45,0].map(durationLabel)).toEqual(['7 h 50 min','2 h','45 min',''])
})

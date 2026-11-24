import { expect, test } from 'vitest'
import { toApiError } from './api'

test('business problem keeps its stable code', () => {
  const e = toApiError(409, { code: 'CAPACITY_REACHED', detail: 'Complet' })
  expect([e.status, e.code, e.message]).toEqual([409, 'CAPACITY_REACHED', 'Complet'])
})

test('validation violations are joined', () => {
  const e = toApiError(422, { violations: [{ propertyPath: 'email', title: 'Email invalide.' }] })
  expect([e.code, e.message]).toEqual(['VALIDATION', 'Email invalide.'])
})

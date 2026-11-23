import test from 'node:test'
import assert from 'node:assert/strict'
import { playerDetailsFromForm, suggestedCategory } from '../src/pilot/playerDetails.js'
import { playersCsv } from '../src/pilot/exportAttendance.js'

const categories = [
  { id:'u16', name:'Sub 16', gender:'female', active:true },
  { id:'primera', name:'Primera', gender:'male', active:true },
  { id:'old', name:'Sub 14', gender:'female', active:false }
]

test('new player details preserve full name, optional fields and selected category', () => {
  const fields = new FormData()
  Object.entries({ first_name:'Ana María', last_name:'Pérez', category:'u16', sex:'female', dni:'12345678', birth_date:'2010-11-22', team:'B' }).forEach(([key,value]) => fields.set(key,value))
  assert.deepEqual(playerDetailsFromForm(fields,categories), {
    first_name:'Ana María', last_name:'Pérez', full_name:'PÉREZ Ana María', category_id:'u16', sex:'female', dni:'12345678', birth_date:'2010-11-22', team:'B', category_override:false
  })
  fields.set('sex','male')
  assert.throws(() => playerDetailsFromForm(fields,categories), /rama/)
  fields.set('sex','female'); fields.set('dni','abc')
  assert.throws(() => playerDetailsFromForm(fields,categories), /DNI/)
})

test('automatic suggestion only selects an active category with matching branch', () => {
  assert.equal(suggestedCategory(categories,'2010-11-22','female',2026)?.id,'u16')
  assert.equal(suggestedCategory(categories,'2012-01-01','female',2026),null)
  assert.equal(suggestedCategory(categories,'2010-11-22','male',2026)?.id,'primera')
  assert.equal(suggestedCategory(categories,'','female',2026),null)
})

test('detailed filtered export preserves UTF-8, dates, branch and neutralizes formulas', () => {
  const csv = playersCsv({ categories, detailed:true, players:[{
    full_name:'PÉREZ Ana María', first_name:'Ana María', last_name:'Pérez', dni:'12345678',
    birth_date:'2010-11-22', sex:'female', team:'=2+2', category_id:'u16', active:true
  }] })
  assert.ok(csv.startsWith('\ufeff'))
  assert.match(csv,/"DNI";"Nacimiento";"Rama"/)
  assert.match(csv,/"12345678";"2010-11-22";"Femenina";"'=2\+2"/)
  assert.doesNotMatch(csv,/Masculina/)
})

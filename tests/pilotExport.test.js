import test from 'node:test'
import assert from 'node:assert/strict'
import { attendanceCsv,attendanceFilename } from '../src/pilot/exportAttendance.js'

test('attendance CSV preserves data and neutralizes spreadsheet formulas', () => {
  const csv = attendanceCsv({
    sessions:[{ id:'day',session_date:'2026-11-21',category_id:'cat' }],
    categories:[{ id:'cat',name:'Sub 16; "A"' }],
    players:[{ id:'p',full_name:'  =HYPERLINK("bad")' }],
    attendance:[{ session_id:'day',player_id:'p',status:'present' }]
  })
  assert.equal(csv,'\ufeff"Fecha";"Categoría";"Jugador";"Estado"\r\n"2026-11-21";"Sub 16; ""A""";"\'  =HYPERLINK(""bad"")";"Presente"')
  assert.equal(attendanceFilename('Junín Vóley / JNN','2026-11-21'),'asistencia-Junin-Voley-JNN-2026-11-21.csv')
})

test('attendance CSV exports the remaining statuses in Spanish', () => {
  const csv = attendanceCsv({
    sessions:[{ id:'day',session_date:'2026-11-22',category_id:'cat' }],
    categories:[{ id:'cat',name:'Sub16 Piloto' }],
    players:[{ id:'p',full_name:'Jugador de Prueba JNN' }],
    attendance:[{ session_id:'day',player_id:'p',status:'late' },{ session_id:'day',player_id:'p',status:'absent' }]
  })
  assert.match(csv, /"Tarde"\r\n/)
  assert.match(csv, /"Ausente"$/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { attendanceCsv,attendanceFilename,filteredAttendance,legacyTrainingSession,playersCsv,playersFilename } from '../src/pilot/exportAttendance.js'
import { attendanceStats } from '../src/attendanceStats.js'

test('original attendance percentages follow exactly the visible filtered records', () => {
  const sessions=[
    {id:'match',category_id:'a',session_date:'2026-11-23',activity_type:'match'},
    {id:'training',category_id:'a',session_date:'2026-11-23',activity_type:'training'},
    {id:'foreign',category_id:'b',session_date:'2026-11-23',activity_type:'training'},
  ]
  const attendance=[
    {session_id:'match',player_id:'p1',status:'late'},
    {session_id:'training',player_id:'p1',status:'present'},
    {session_id:'training',player_id:'p2',status:'absent'},
    {session_id:'foreign',player_id:'p3',status:'present'},
    {session_id:'training',player_id:'unknown',status:'invalid'},
  ]
  assert.equal(legacyTrainingSession(sessions,'a','2026-11-23').id,'training')
  assert.deepEqual(attendanceStats(filteredAttendance({attendance,sessions,categoryId:'a',activity:'training'})),{
    total:2,present:1,late:0,absent:1,presentPct:50,latePct:0,absentPct:50,
  })
  assert.deepEqual(attendanceStats(filteredAttendance({attendance,sessions,categoryId:'a',activity:'match'})),{
    total:1,present:0,late:1,absent:0,presentPct:0,latePct:100,absentPct:0,
  })
  assert.equal(legacyTrainingSession(sessions,'b','2026-11-24'),undefined)
})

test('player CSV exports only selected rows with Spanish states, UTF-8 and formula protection', () => {
  const csv = playersCsv({ players:[
    { full_name:'María José Núñez', category_id:'a', active:true },
    { full_name:' =HYPERLINK("malicioso")', category_id:'b', active:false }
  ],categories:[{id:'a',name:'Sub 16; A'},{id:'b',name:'Sub 18'}] })
  assert.equal(csv,'\ufeff"Jugador";"Categoría";"Estado"\r\n"María José Núñez";"Sub 16; A";"Activo"\r\n"\' =HYPERLINK(""malicioso"")";"Sub 18";"Inactivo"')
  assert.equal(playersFilename('Junín Vóley JNN'),'jugadores-Junin-Voley-JNN.csv')
})

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

test('attendance CSV exports all three real statuses in Spanish for distinct players', () => {
  const csv = attendanceCsv({
    sessions:[{ id:'day',session_date:'2026-11-22',category_id:'cat' }],
    categories:[{ id:'cat',name:'Sub16 Piloto' }],
    players:[{ id:'p1',full_name:'Juan Pérez' },{ id:'p2',full_name:'María José' },{ id:'p3',full_name:'Álvaro Díaz' }],
    attendance:[{ session_id:'day',player_id:'p1',status:'present' },{ session_id:'day',player_id:'p2',status:'late' },{ session_id:'day',player_id:'p3',status:'absent' }]
  })
  assert.equal(csv.split('\r\n').length,4)
  assert.match(csv, /"Juan Pérez";"Presente"\r\n/)
  assert.match(csv, /"María José";"Tarde"\r\n/)
  assert.match(csv, /"Álvaro Díaz";"Ausente"$/)
})

test('attendance CSV filters by club category and date before export', () => {
  const csv = attendanceCsv({
    sessions:[{id:'one',session_date:'2026-11-22',category_id:'a'}, {id:'two',session_date:'2026-11-22',category_id:'b'}, {id:'three',session_date:'2026-11-23',category_id:'a'}],
    categories:[{id:'a',name:'Sub16'}, {id:'b',name:'Sub18'}],
    players:[{id:'p',full_name:'Ejemplo'}],
    attendance:[{session_id:'one',player_id:'p',status:'present'}, {session_id:'two',player_id:'p',status:'late'}, {session_id:'three',player_id:'p',status:'absent'}],
    categoryId:'a', date:'2026-11-22'
  })
  assert.match(csv,/"Sub16";"Ejemplo";"Presente"/)
  assert.doesNotMatch(csv,/Sub18|Tarde|Ausente/)
})

test('history count and CSV contain the same player rows with accented names', () => {
  const data = {
    sessions:[{id:'one',session_date:'2026-11-22',category_id:'a'}],
    categories:[{id:'a',name:'Sub 16'}],
    players:[{id:'p1',full_name:'María José Núñez'}, {id:'p2',full_name:'Otro Jugador'}],
    attendance:[{session_id:'one',player_id:'p1',status:'late'}, {session_id:'one',player_id:'p2',status:'present'}],
    playerId:'p1'
  }
  assert.equal(filteredAttendance(data).length,1)
  const csv = attendanceCsv(data)
  assert.match(csv,/María José Núñez/)
  assert.match(csv,/"Tarde"/)
  assert.doesNotMatch(csv,/Otro Jugador|"Presente"/)
})

test('advanced history filters activity and exports its visible Spanish label', () => {
  const data={
    sessions:[{id:'a',session_date:'2026-11-23',category_id:'c',activity_type:'training'},
      {id:'b',session_date:'2026-11-23',category_id:'c',activity_type:'match'}],
    categories:[{id:'c',name:'Sub 16'}],players:[{id:'p',full_name:'María José'}],
    attendance:[{session_id:'a',player_id:'p',status:'present'},{session_id:'b',player_id:'p',status:'late'}],
    activity:'match',includeActivity:true,
  }
  assert.equal(filteredAttendance(data).length,1)
  const csv=attendanceCsv(data)
  assert.match(csv,/"Fecha";"Categoría";"Actividad";"Jugador";"Estado"/)
  assert.match(csv,/"Partido";"María José";"Tarde"/)
  assert.doesNotMatch(csv,/Entrenamiento|Presente/)
})

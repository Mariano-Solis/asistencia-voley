import test from 'node:test'
import assert from 'node:assert/strict'
import { attendanceWorkbookPayload, downloadAttendanceReport } from '../src/pilot/attendanceWorkbook.js'
import { exportAttendanceWorkbook } from '../src/xlsxCategoryExport.js'

const institution={id:'a',name:'Junín Vóley JNN'}
const data={
  institution,
  categories:[{id:'cat',institution_id:'a',name:'Sub 16 Ñandú'},{id:'foreign',institution_id:'b',name:'Ajena'}],
  sessions:[
    {id:'one',institution_id:'a',category_id:'cat',session_date:'2026-11-22',activity_type:'training'},
    {id:'two',institution_id:'a',category_id:'cat',session_date:'2026-11-23',activity_type:'match'},
    {id:'other',institution_id:'b',category_id:'foreign',session_date:'2026-11-23',activity_type:'match'},
  ],
  players:[{id:'p',institution_id:'a',full_name:'María José Núñez'},
    {id:'q',institution_id:'a',full_name:'Ana Torres'},
    {id:'foreign-p',institution_id:'b',full_name:'No exportar ajeno'}],
  attendance:[{session_id:'one',institution_id:'a',player_id:'p',status:'present'},
    {session_id:'two',institution_id:'a',player_id:'p',status:'late'},
    {session_id:'two',institution_id:'a',player_id:'q',status:'absent'},
    {session_id:'other',institution_id:'b',player_id:'foreign-p',status:'present'}],
  categoryId:'cat',from:'2026-11-22',to:'2026-11-23',
  now:new Date('2026-11-23T12:00:00Z'),
}

function zipEntries(buffer) {
  const result=new Map()
  for(let pos=0;pos+30<=buffer.length && buffer.readUInt32LE(pos)===0x04034b50;){
    const size=buffer.readUInt32LE(pos+18),nameSize=buffer.readUInt16LE(pos+26)
    const extra=buffer.readUInt16LE(pos+28),start=pos+30+nameSize+extra
    result.set(buffer.subarray(pos+30,pos+30+nameSize).toString(),buffer.subarray(start,start+size).toString())
    pos=start+size
  }
  return result
}

test('informe de asistencia aplica club, categoría, fechas, actividad y jugador',()=>{
  const payload=attendanceWorkbookPayload(data)
  assert.equal(payload.publisher,'Junín Vóley JNN')
  assert.equal(payload.paymentColumnLabel,'Cuotas no incluidas')
  assert.deepEqual(payload.totals,{present:1,late:1,absent:1})
  assert.equal(payload.sessionColumns.length,2)
  assert.deepEqual(payload.playerRows.map(p=>p.name),['Ana Torres','María José Núñez'])
  assert.deepEqual(payload.playerRows[1].statuses,['Presente','Tarde'])
  const filtered=attendanceWorkbookPayload({...data,activity:'match',playerId:'p'})
  assert.deepEqual(filtered.totals,{present:0,late:1,absent:0})
  assert.equal(filtered.sessionColumns.length,1)
  assert.deepEqual(filtered.playerRows.map(p=>p.name),['María José Núñez'])
  assert.throws(()=>attendanceWorkbookPayload({...data,categoryId:'foreign'}),/no está disponible/)
  assert.throws(()=>attendanceWorkbookPayload({...data,from:'2026-11-24'}),/período válido/)
  assert.throws(()=>attendanceWorkbookPayload({...data,from:'2026-11-20',to:'2026-11-21'}),/No hay asistencias/)
})

test('XLSX real no expone nombre ajeno ni metadata municipal y conserva default original',async()=>{
  const oldDocument=globalThis.document,oldWindow=globalThis.window
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL
  let blob,filename
  const anchor={style:{},click(){filename=this.download},remove(){}}
  globalThis.document={body:{appendChild(){}},createElement(){return anchor}}
  globalThis.window={setTimeout(){}}
  URL.createObjectURL=value=>{blob=value;return 'blob:report'}
  URL.revokeObjectURL=()=>{}
  try{
    downloadAttendanceReport(data)
    assert.match(filename,/informe-asistencia-junin-voley-jnn-2026-11-22-a-2026-11-23\.xlsx/)
    const files=zipEntries(Buffer.from(await blob.arrayBuffer()))
    assert.match(files.get('docProps/core.xml'),/Junín Vóley JNN/)
    assert.doesNotMatch(files.get('docProps/core.xml'),/Municipalidad/)
    assert.match(files.get('docProps/app.xml'),/Junín Vóley JNN/)
    const strings=files.get('xl/sharedStrings.xml')
    assert.match(strings,/María José Núñez|Sub 16 Ñandú/)
    assert.match(strings,/Cuotas no incluidas/)
    assert.doesNotMatch(strings,/No exportar ajeno|Ajena/)
    exportAttendanceWorkbook({...attendanceWorkbookPayload(data),publisher:undefined})
    const original=zipEntries(Buffer.from(await blob.arrayBuffer()))
    assert.match(original.get('docProps/core.xml'),/Municipalidad De San Martín - VOLEY/)
  }finally{
    globalThis.document=oldDocument;globalThis.window=oldWindow
    URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke
  }
})

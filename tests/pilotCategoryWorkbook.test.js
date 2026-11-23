import test from 'node:test'
import assert from 'node:assert/strict'
import { categorySummaryPayload, downloadCategorySummary } from '../src/pilot/categoryWorkbook.js'
import { exportCategoryWorkbook } from '../src/xlsxCategoryExport.js'

const institution = { name:'Junín Vóley JNN' }
const categories = [
  {id:'a',name:'Sub 16 Ñandú',gender:'female'},
  {id:'b',name:'Sub 18',gender:'male'},
]
const players = [
  {category_id:'a',full_name:'Ana María',sex:'female'},
  {category_id:'a',full_name:'Filtrada',sex:'female'},
  {category_id:'b',full_name:'Pedro',sex:'male'},
  {category_id:'foreign',full_name:'Otro club',sex:'male'},
]
const now = new Date('2026-11-23T12:00:00Z')

test('resumen respeta institución, categorías y jugadores ya filtrados', () => {
  const result = categorySummaryPayload({institution,categories,players:[players[0],players[3]],categoryIds:['a'],now})
  assert.equal(result.total,1)
  assert.equal(result.female,1)
  assert.equal(result.male,0)
  assert.deepEqual(result.categoryRows,[['Femenino','Sub 16 Ñandú',1]])
  assert.match(result.filename,/junin-voley-jnn-2026-11-23\.xlsx$/)
  assert.equal(result.publisher,institution.name)
})

function readEntries(buffer) {
  const files = new Map()
  let pos = 0
  while (pos + 30 <= buffer.length && buffer.readUInt32LE(pos) === 0x04034b50) {
    const compressed = buffer.readUInt32LE(pos+18)
    const nameSize = buffer.readUInt16LE(pos+26)
    const extraSize = buffer.readUInt16LE(pos+28)
    const start = pos+30+nameSize+extraSize
    files.set(buffer.subarray(pos+30,pos+30+nameSize).toString(),buffer.subarray(start,start+compressed).toString())
    pos = start+compressed
  }
  return files
}

test('XLSX real conserva metadata comercial y no incluye otros clubes ni filas filtradas', async () => {
  const oldDocument = globalThis.document, oldWindow = globalThis.window
  const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL
  let blob, filename
  const anchor = {style:{},click(){filename=this.download},remove(){}}
  globalThis.document = {body:{appendChild(){}},createElement(){return anchor}}
  globalThis.window = {setTimeout(){}}
  URL.createObjectURL = value => { blob = value; return 'blob:test' }
  URL.revokeObjectURL = () => {}
  try {
    downloadCategorySummary({institution,categories,players:[players[0],players[3]],categoryIds:['a'],now})
    assert.match(filename,/\.xlsx$/)
    assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const files = readEntries(Buffer.from(await blob.arrayBuffer()))
    assert.equal(files.size > 7,true)
    assert.match(files.get('docProps/core.xml'),/Junín Vóley JNN/)
    assert.doesNotMatch(files.get('docProps/core.xml'),/Municipalidad/)
    assert.match(files.get('docProps/app.xml'),/Junín Vóley JNN/)
    assert.match(files.get('xl/sharedStrings.xml'),/Sub 16 Ñandú/)
    assert.doesNotMatch(files.get('xl/sharedStrings.xml'),/Sub 18|Otro club|Filtrada/)
    assert.match(files.get('xl/worksheets/sheet1.xml'),/\<v\>1\<\/v\>/)
    exportCategoryWorkbook({...categorySummaryPayload({institution,categories:[],players:[],now,categoryIds:[]}),publisher:undefined})
    const original = readEntries(Buffer.from(await blob.arrayBuffer()))
    assert.match(original.get('docProps/core.xml'),/Municipalidad De San Martín - VOLEY/)
  } finally {
    globalThis.document = oldDocument
    globalThis.window = oldWindow
    URL.createObjectURL = oldCreate
    URL.revokeObjectURL = oldRevoke
  }
})

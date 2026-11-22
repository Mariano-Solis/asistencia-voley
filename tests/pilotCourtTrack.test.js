import test from 'node:test'
import assert from 'node:assert/strict'
import { findTeams } from '../api/pilot-courtrack-teams.js'
import { dominantColor } from '../src/pilot/colorFromLogo.js'

test('Court Track discovery keeps exact team code and rejects untrusted logo hosts', async () => {
  const fetcher = async () => ({ ok:true, json:async () => ({data:[{posicionesObj:[
    {id_equipo:'JNN',logo:'https://cdn.courtrack.com/image/upload/f_webp/v1/Courtrack/App/FMV/Logos/JNN.png'},
    {id_equipo:'JNN B',logo:'https://evil.example/image.png'},
    {id_equipo:'MSM',logo:'https://cdn.courtrack.com/image/upload/f_webp/v1/Courtrack/App/FMV/Logos/MSM.png'},
  ]}]}) })
  const teams = await findTeams('jn',fetcher)
  assert.equal(teams.length,2)
  assert.equal(teams.find(team => team.code === 'JNN')?.logo,'https://cdn.courtrack.com/image/upload/f_webp/v1/Courtrack/App/FMV/Logos/JNN.png')
  assert.equal(teams.find(team => team.code === 'JNN B')?.logo,null)
})

test('palette sampler ignores pale backgrounds and transparent pixels', () => {
  const data = new Uint8ClampedArray([
    255,255,255,255, 255,255,255,255, 255,255,255,255, 255,255,255,255,
    90,150,20,255, 90,150,20,255, 90,150,20,255, 90,150,20,255,
  ])
  assert.equal(dominantColor(data),'#609018')
})

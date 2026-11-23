import test from 'node:test'
import assert from 'node:assert/strict'
import { probeDenied,probeZero } from '../src/pilot/probeResults.js'

test('the browser isolation panel never counts a server failure as a RLS pass', () => {
  assert.equal(probeDenied({ data:null,error:{message:'server failure'},status:500 }),false)
  assert.equal(probeDenied({ data:null,error:{message:'network failure'} }),false)
  assert.equal(probeZero({ data:null,error:{message:'server failure'},status:500 }),false)
  assert.equal(probeDenied({ data:[{id:'foreign'}],error:null,status:200 }),false)
  assert.equal(probeDenied({ data:[],error:null,status:200 }),true)
  assert.equal(probeDenied({ data:null,error:{message:'forbidden'},status:403 }),true)
  assert.equal(probeDenied({ data:null,error:{message:'missing',status:404} }),true)
})

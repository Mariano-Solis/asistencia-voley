import test from 'node:test'
import assert from 'node:assert/strict'
import { probeDenied,probeZero,validForeignFixture } from '../src/pilot/probeResults.js'

test('the browser isolation panel never counts a server failure as a RLS pass', () => {
  assert.equal(probeDenied({ data:null,error:{message:'server failure'},status:500 }),false)
  assert.equal(probeDenied({ data:null,error:{message:'network failure'} }),false)
  assert.equal(probeZero({ data:null,error:{message:'server failure'},status:500 }),false)
  assert.equal(probeDenied({ data:[{id:'foreign'}],error:null,status:200 }),false)
  assert.equal(probeDenied({ data:[],error:null,status:200 }),true)
  assert.equal(probeDenied({ data:null,error:{message:'forbidden'},status:403 }),true)
  assert.equal(probeDenied({ data:null,error:{message:'missing',status:404} }),true)
})

test('the browser probe rejects malformed or mismatched foreign fixture paths', () => {
  const institution='10000000-0000-4000-8000-000000000001'
  const target={ institution,name:'Club Ficticio B',category:'20000000-0000-4000-8000-000000000002',player:'30000000-0000-4000-8000-000000000003',session:'40000000-0000-4000-8000-000000000004',logo:`${institution}/50000000-0000-4000-8000-000000000005.png` }
  assert.equal(validForeignFixture({institution:'60000000-0000-4000-8000-000000000006'},target),true)
  assert.equal(validForeignFixture({institution},target),false)
  assert.equal(validForeignFixture({institution:'60000000-0000-4000-8000-000000000006'},{...target,player:'typo'}),false)
  assert.equal(validForeignFixture({institution:'60000000-0000-4000-8000-000000000006'},{...target,logo:`60000000-0000-4000-8000-000000000006/50000000-0000-4000-8000-000000000005.png`}),false)
})

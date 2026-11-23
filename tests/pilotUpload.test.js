import test from 'node:test'
import assert from 'node:assert/strict'
import { validatedLogo, renderCrop, croppedBlob } from '../src/pilot/logoUpload.js'

test('rejects disguised and oversized logo uploads before decoding', async () => {
  const disguised = new Blob([new Uint8Array(32)], { type:'image/png' })
  await assert.rejects(validatedLogo(disguised),/PNG, JPG o WebP válido/)
  const oversized = new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type:'image/png' })
  await assert.rejects(validatedLogo(oversized),/4 MB/)
})

test('square crop clamps mobile pan to the actual bitmap and extracts a colored pixel', () => {
  let crop
  const context = {
    clearRect() {},
    drawImage(...args) { crop = args },
    getImageData() { return { data:new Uint8ClampedArray([196,49,25,255]) } },
  }
  const canvas = { getContext:() => context }
  const bitmap = { width:800,height:400 }
  assert.equal(renderCrop(canvas,bitmap,2,1,-1),'#c03018')
  assert.deepEqual(crop,[bitmap,600,0,200,200,0,0,512,512])
  assert.equal(canvas.width,512)
  assert.equal(canvas.height,512)
})

test('cropped shield rejects an oversized result before Storage upload', async () => {
  await assert.rejects(croppedBlob({ toBlob(callback) { callback({size:2*1024*1024+1}) } }),/2 MB/)
  await assert.rejects(croppedBlob({ toBlob(callback) { callback(null) } }),/2 MB/)
})

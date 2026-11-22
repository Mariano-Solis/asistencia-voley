import test from 'node:test'
import assert from 'node:assert/strict'
import { brandColors, paletteFromPrimary } from '../src/pilot/brand.js'

test('brand colors retain readable text for light and dark club colors', () => {
  assert.equal(brandColors('#ffffff')['--club-on-primary'], '#000000')
  assert.equal(brandColors('#000000')['--club-on-primary'], '#ffffff')
  assert.equal(brandColors('#194b77')['--club-primary'], '#194b77')
  assert.equal(brandColors('url(evil)')['--club-primary'], '#194b77')
})

test('automatic palette keeps background and surface distinct from a sampled crest color', () => {
  const palette = paletteFromPrimary('#609018')
  assert.equal(palette.primary,'#609018')
  assert.equal(palette.surface,'#ffffff')
  assert.notEqual(palette.background,palette.primary)
  assert.notEqual(palette.accent,palette.primary)
})

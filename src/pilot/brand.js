const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const luminance = hex => rgb(hex).map(value => {
  const normalized = value / 255
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)

export function brandColors(value) {
  const primary = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#194b77'
  const light = luminance(primary) > 0.179
  return {
    '--club-primary': primary,
    '--club-on-primary': light ? '#000000' : '#ffffff',
    '--club-selected': light ? '#153c32' : '#0c765b',
  }
}

const blend = (hex, target, ratio) => `#${rgb(hex).map((value, index) =>
  Math.round(value * (1 - ratio) + target[index] * ratio).toString(16).padStart(2,'0')).join('')}`

export function paletteFromPrimary(value) {
  const primary = brandColors(value)['--club-primary']
  return {
    primary,
    secondary: blend(primary,[255,255,255],0.82),
    accent: blend(primary,[0,0,0],0.3),
    background: blend(primary,[255,255,255],0.95),
    surface: '#ffffff',
  }
}

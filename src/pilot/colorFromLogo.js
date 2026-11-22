export function dominantColor(data) {
  const counts = new Map()
  for (let i = 0; i < data.length; i += 16) {
    const [r,g,b,a] = data.slice(i,i+4)
    if (a < 180 || Math.max(r,g,b) > 242 && Math.min(r,g,b) > 225 || Math.max(r,g,b) < 28) continue
    const saturation = Math.max(r,g,b) - Math.min(r,g,b)
    if (saturation < 35) continue
    const bucket = [r,g,b].map(value => Math.round(value / 24) * 24)
    const key = bucket.map(value => Math.min(255,value).toString(16).padStart(2,'0')).join('')
    counts.set(key,(counts.get(key) || 0) + 1)
  }
  const strongest = [...counts].sort((a,b) => b[1] - a[1])[0]
  return strongest ? `#${strongest[0]}` : null
}

export async function logoPrimaryColor(url) {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = url
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d', { willReadFrequently:true })
  context.drawImage(image,0,0,64,64)
  return dominantColor(context.getImageData(0,0,64,64).data)
}

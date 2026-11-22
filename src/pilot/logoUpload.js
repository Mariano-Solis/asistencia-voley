import { dominantColor } from './colorFromLogo.js'

export async function validatedLogo(file) {
  if (!file || file.size > 4 * 1024 * 1024 || file.size < 16) throw new Error('El escudo debe pesar entre 16 bytes y 4 MB.')
  const head = new Uint8Array(await file.slice(0,16).arrayBuffer())
  const png = head.slice(0,8).join(',') === '137,80,78,71,13,10,26,10'
  const jpg = head[0] === 255 && head[1] === 216 && head[2] === 255
  const webp = String.fromCharCode(...head.slice(0,4)) === 'RIFF' && String.fromCharCode(...head.slice(8,12)) === 'WEBP'
  if (!(png && file.type === 'image/png' || jpg && file.type === 'image/jpeg' || webp && file.type === 'image/webp')) throw new Error('Usá un archivo PNG, JPG o WebP válido.')
  const bitmap = await createImageBitmap(file)
  if (bitmap.width < 64 || bitmap.height < 64 || bitmap.width > 4096 || bitmap.height > 4096) {
    bitmap.close(); throw new Error('El escudo debe medir entre 64 y 4096 píxeles por lado.')
  }
  return bitmap
}

export function renderCrop(canvas, bitmap, zoom = 1, horizontal = 0, vertical = 0) {
  canvas.width = canvas.height = 512
  const side = Math.min(bitmap.width,bitmap.height) / zoom
  const left = Math.max(0, Math.min(bitmap.width - side, (bitmap.width - side) * (horizontal + 1) / 2))
  const top = Math.max(0, Math.min(bitmap.height - side, (bitmap.height - side) * (vertical + 1) / 2))
  const context = canvas.getContext('2d', { willReadFrequently:true })
  context.clearRect(0,0,512,512)
  context.drawImage(bitmap,left,top,side,side,0,0,512,512)
  return dominantColor(context.getImageData(0,0,512,512).data)
}

export async function croppedBlob(canvas) {
  const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/webp',0.85))
  if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('No se pudo preparar el escudo dentro del límite de 2 MB.')
  return blob
}

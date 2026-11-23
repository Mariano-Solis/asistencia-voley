import React, { useEffect, useRef, useState } from 'react'
import { validatedLogo, renderCrop, croppedBlob } from './logoUpload.js'

// Admin-only editor. The database and Storage policies remain authoritative.
export function PlayerPhoto({ client, institutionId, player, canEdit, busy, run, announce }) {
  const canvas = useRef(null)
  const [bitmap, setBitmap] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => () => bitmap?.close(), [bitmap])
  useEffect(() => {
    if (bitmap && canvas.current) renderCrop(canvas.current, bitmap, zoom)
  }, [bitmap, zoom])
  useEffect(() => {
    let active = true
    setUrl('')
    if (player.photo_path) client.storage.from('pilot-player-photos').createSignedUrl(player.photo_path, 300)
      .then(({ data, error: failure }) => { if (active) { if (failure) setError('No se pudo abrir la foto privada.'); else setUrl(data.signedUrl) } })
      .catch(() => { if (active) setError('No se pudo abrir la foto privada.') })
    return () => { active = false }
  }, [client, player.photo_path])

  async function choose(event) {
    setError('')
    try { const image = await validatedLogo(event.target.files?.[0]); setBitmap(image); setZoom(1) }
    catch (failure) { setError(failure.message); event.target.value = '' }
  }
  function save() {
    run(async () => {
      if (!bitmap) throw new Error('Elegí una foto para guardar.')
      const blob = await croppedBlob(canvas.current)
      const path = `${institutionId}/${player.id}/${crypto.randomUUID()}.webp`
      const { error: uploadError } = await client.storage.from('pilot-player-photos').upload(path, blob, { contentType:'image/webp', upsert:false })
      if (uploadError) throw uploadError
      try {
        const { data, error: linkError } = await client.from('players').update({ photo_path:path })
          .eq('institution_id',institutionId).eq('id',player.id).select('id,photo_path').single()
        if (linkError) throw linkError
        if (data?.photo_path !== path) throw new Error('No se pudo confirmar la foto del jugador.')
      } catch (failure) {
        const { error: cleanupError } = await client.storage.from('pilot-player-photos').remove([path])
        if (cleanupError) throw new Error('La foto no quedó vinculada y no se pudo limpiar el archivo temporal. Avisá al soporte.')
        throw failure
      }
      setBitmap(null)
      announce('Foto privada guardada. La imagen anterior se conserva hasta una limpieza verificada.')
    })
  }
  return <div className="player-photo-editor">
    {url && <img src={url} alt={`Foto de ${player.full_name}`} width="96" height="96" />}
    {error && <p role="alert">{error}</p>}
    {canEdit && <><label>Foto del jugador<input type="file" accept="image/png,image/jpeg,image/webp" onChange={choose} /></label>
      {bitmap && <><canvas ref={canvas} className="crop-preview" aria-label="Vista previa de la foto" />
        <label>Recorte y zoom<input type="range" min="1" max="3" step="0.1" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label>
        <button type="button" disabled={busy} onClick={save}>Guardar foto privada</button></>}
    </>}
  </div>
}

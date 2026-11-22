import React, { useEffect, useRef, useState } from 'react'
import { brandColors, paletteFromPrimary } from './brand.js'
import { validatedLogo, renderCrop, croppedBlob } from './logoUpload.js'

export function IdentityEditor({ institution, client, logoUrl, onSaved }) {
  const canvas = useRef(null)
  const previewCanvas = useRef(null)
  const [bitmap, setBitmap] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [horizontal, setHorizontal] = useState(0)
  const [vertical, setVertical] = useState(0)
  const [name, setName] = useState(institution.name)
  const [primary, setPrimary] = useState(institution.primary_color)
  const [secondary, setSecondary] = useState(institution.secondary_color || '#e7eef5')
  const [accent, setAccent] = useState(institution.accent_color || '#0c765b')
  const [background, setBackground] = useState(institution.background_color || '#f1f5fa')
  const [surface, setSurface] = useState(institution.surface_color || '#ffffff')
  const [mode, setMode] = useState(institution.visual_mode || 'combined')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (bitmap && canvas.current) {
    const extracted = renderCrop(canvas.current,bitmap,zoom,horizontal,vertical)
    if (previewCanvas.current) {
      previewCanvas.current.width = previewCanvas.current.height = 64
      previewCanvas.current.getContext('2d').drawImage(canvas.current,0,0,64,64)
    }
    if (extracted && zoom === 1 && horizontal === 0 && vertical === 0) {
      const palette = paletteFromPrimary(extracted)
      setPrimary(palette.primary); setSecondary(palette.secondary); setAccent(palette.accent)
      setBackground(palette.background); setSurface(palette.surface)
    }
  } },[bitmap,zoom,horizontal,vertical])
  useEffect(() => () => bitmap?.close(),[bitmap])

  async function chooseFile(event) {
    setMessage('')
    try {
      const next = await validatedLogo(event.target.files?.[0])
      setBitmap(next); setZoom(1); setHorizontal(0); setVertical(0)
      setMode('manual')
    } catch (error) { setMessage(error.message); event.target.value = '' }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    let uploaded = null
    try {
      let logoPath = institution.logo_path || null
      if (bitmap) {
        const blob = await croppedBlob(canvas.current)
        uploaded = `${institution.id}/${crypto.randomUUID()}.webp`
        const { error } = await client.storage.from('pilot-branding').upload(uploaded,blob,{ contentType:'image/webp',upsert:false })
        if (error) throw error
        logoPath = uploaded
      }
      const data = new FormData(event.currentTarget)
      const { error } = await client.rpc('pilot_update_identity', {
        p_institution:institution.id,p_name:name.trim(),p_primary:primary,p_secondary:secondary,p_accent:accent,
        p_background:background,p_surface:surface,p_logo_path:logoPath,p_mode:mode,
        p_country:String(data.get('country') || '').trim(),p_region:String(data.get('region') || '').trim(),
        p_city:String(data.get('city') || '').trim(),p_federation:String(data.get('federation') || '').trim(),
        p_sport:String(data.get('sport') || '').trim(),
      })
      if (error) throw error
      await onSaved()
      setMessage('Identidad guardada para esta institución.')
    } catch (error) {
      if (uploaded) await client.storage.from('pilot-branding').remove([uploaded])
      setMessage(error.message || 'No se pudo guardar la identidad.')
    } finally { setBusy(false) }
  }
  return <section><h2>Identidad institucional</h2><p>Podés completar la identidad sin usar Court Track. Los datos y el escudo quedan asociados solamente a este club.</p>
    <form onSubmit={save}>
      <label>1. Nombre público<input value={name} onChange={event => setName(event.target.value)} minLength="2" maxLength="100" required /></label>
      <label>2. Modalidad<select value={mode} onChange={event => setMode(event.target.value)}><option value="combined">Combinada: conservar datos importados y ajustes propios</option><option value="manual">Manual: usar mis datos y escudo</option></select></label>
      <label>3. Escudo propio, opcional<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile} /></label>
      <p>PNG, JPG o WebP hasta 4 MB; se recorta y guarda una copia WebP privada de hasta 2 MB.</p>
      {bitmap && <div className="crop-tools"><canvas ref={canvas} className="crop-preview" aria-label="Vista previa del escudo recortado" />
        <label>Acercar<input type="range" min="1" max="3" step="0.1" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label>
        <label>Mover horizontalmente<input type="range" min="-1" max="1" step="0.1" value={horizontal} onChange={event => setHorizontal(Number(event.target.value))} /></label>
        <label>Mover verticalmente<input type="range" min="-1" max="1" step="0.1" value={vertical} onChange={event => setVertical(Number(event.target.value))} /></label></div>}
      {!bitmap && logoUrl && <img className="crest-large" src={logoUrl} alt={`Escudo actual de ${institution.name}`} />}
      <h3>4. Ajustar colores</h3>
      {[['Principal',primary,setPrimary],['Secundario',secondary,setSecondary],['Acento',accent,setAccent],['Fondo',background,setBackground],['Superficies',surface,setSurface]].map(([label,value,change]) => <label key={label}>{label}<input type="color" value={value} onChange={event => change(event.target.value)} /></label>)}
      <details><summary>Ubicación y asociación (opcionales)</summary>
        {[['País','country',institution.country],['Provincia o región','region',institution.region],['Ciudad','city',institution.city],['Federación o asociación','federation',institution.federation],['Disciplina','sport',institution.sport || 'Vóley']].map(([label,field,value]) => <label key={field}>{label}<input name={field} defaultValue={value || ''} maxLength={field === 'federation' ? 100 : 80} /></label>)}
      </details>
      <h3>5. Vista previa</h3><div className="identity-preview" style={{background}}>
        <div className="preview-heading" style={{background:primary,color:brandColors(primary)['--club-on-primary']}}>{bitmap && <canvas className="preview-crest" ref={previewCanvas} />}{!bitmap && logoUrl && <img className="preview-crest" src={logoUrl} alt="" />}<strong>{name || 'Tu institución'}</strong></div>
        <div className="preview-card" style={{background:surface,color:brandColors(surface)['--club-on-primary']}}>Categorías · Jugadores · Asistencia <span style={{color:accent}}>●</span></div>
      </div>
      <button disabled={busy}>6. Confirmar y guardar</button>
    </form>{message && <p className="notice" role="status">{message}</p>}
  </section>
}

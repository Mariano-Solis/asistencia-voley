import React, { useState } from 'react'

// Diagnostic UI for the protected Preview only. It uses the current Supabase
// Auth session and the ordinary publishable key; no elevated credentials.
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII='), c => c.charCodeAt(0))
const rows = result => !result.error && Array.isArray(result.data) ? result.data : null
const zero = result => rows(result)?.length === 0
const denied = result => Boolean(result.error) || zero(result)

export function IsolationProbe({ client, institution }) {
  const storageKey = `pilot-qa-${institution.id}`
  const [own, setOwn] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null') } catch { return null }
  })
  const [target, setTarget] = useState({ institution:'',category:'',player:'',session:'',logo:'' })
  const [report, setReport] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const expect = (label, result, predicate) => ({ label, result: predicate(result) ? 'PASS' : 'FAIL' })

  async function prepare() {
    setBusy(true); setMessage(''); setReport([])
    const fixture = { institution:institution.id }
    try {
      const suffix = crypto.randomUUID().slice(0,8)
      const { data:categories,error:catError } = await client.from('categories').insert({institution_id:institution.id,name:`Ensayo JWT ${suffix}`}).select('id')
      if (catError || categories?.length !== 1) throw catError || Error('Categoría no creada')
      fixture.category = categories[0].id
      const { data:players,error:playerError } = await client.from('players').insert({institution_id:institution.id,category_id:fixture.category,full_name:`Jugador ficticio JWT ${suffix}`}).select('id')
      if (playerError || players?.length !== 1) throw playerError || Error('Jugador no creado')
      fixture.player = players[0].id
      const date = new Date().toISOString().slice(0,10)
      const { data:sessions,error:sessionError } = await client.from('training_sessions').insert({institution_id:institution.id,category_id:fixture.category,session_date:date}).select('id')
      if (sessionError || sessions?.length !== 1) throw sessionError || Error('Jornada no creada')
      fixture.session = sessions[0].id
      const { error:attendanceError } = await client.from('attendance').insert({institution_id:institution.id,session_id:fixture.session,player_id:fixture.player,status:'present'})
      if (attendanceError) throw attendanceError
      fixture.logo = `${institution.id}/${crypto.randomUUID()}.png`
      const { error:uploadError } = await client.storage.from('pilot-branding').upload(fixture.logo,new Blob([png],{type:'image/png'}),{contentType:'image/png',upsert:false})
      if (uploadError) throw uploadError
      const { data:download,error:downloadError } = await client.storage.from('pilot-branding').download(fixture.logo)
      if (downloadError || download.size !== png.length) throw downloadError || Error('No se pudo descargar el escudo propio')
      sessionStorage.setItem(storageKey,JSON.stringify(fixture)); setOwn(fixture)
      setMessage('Datos ficticios propios preparados. Copiá solo los cinco identificadores al otro administrador de prueba.')
    } catch (error) {
      sessionStorage.setItem(storageKey,JSON.stringify(fixture)); setOwn(fixture)
      setMessage(`Preparación incompleta: ${error.message}. Limpiá estos datos antes de repetir.`)
    } finally { setBusy(false) }
  }

  async function check() {
    setBusy(true); setMessage(''); setReport([])
    const result = []
    const add = (label,response,predicate) => result.push(expect(label,response,predicate))
    try {
      if (!own?.logo || Object.values(target).some(value => !value) || own.institution === target.institution) throw Error('Se requieren dos clubes y sus datos ficticios completos.')
      for (const [table,column] of [['institutions','id'],['institution_memberships','institution_id'],['institution_licenses','institution_id'],['categories','institution_id'],['players','institution_id'],['training_sessions','institution_id'],['attendance','institution_id']]) {
        add(`Lectura ajena: ${table}`,await client.from(table).select('*').eq(column,target.institution),zero)
      }
      add('Inserción ajena de categoría',await client.from('categories').insert({institution_id:target.institution,name:`Intruso ${crypto.randomUUID().slice(0,8)}`}).select('id'),denied)
      add('Inserción ajena de jugador',await client.from('players').insert({institution_id:target.institution,category_id:target.category,full_name:'Intruso ficticio'}).select('id'),denied)
      add('Edición ajena de jugador',await client.from('players').update({full_name:'Alteración indebida'}).eq('id',target.player).select('id'),denied)
      add('Eliminación ajena de jugador',await client.from('players').delete().eq('id',target.player).select('id'),denied)
      add('Cambio de institution_id',await client.from('players').update({institution_id:target.institution}).eq('id',own.player).select('id'),denied)
      add('Cambio de rol',await client.from('institution_memberships').update({role:'super_admin'}).eq('institution_id',target.institution).select('user_id'),denied)
      add('Cambio de licencia',await client.from('institution_licenses').update({status:'active'}).eq('institution_id',target.institution).select('institution_id'),denied)
      add('Cambio de identidad ajena',await client.rpc('pilot_update_identity',{p_institution:target.institution,p_name:'Intruso ficticio',p_primary:'#194b77',p_secondary:'#e7eef5',p_accent:'#0c765b',p_background:'#f1f5fa',p_surface:'#ffffff',p_logo_path:target.logo,p_mode:'manual'}),response => Boolean(response.error))
      const bucket = client.storage.from('pilot-branding')
      add('Descarga privada ajena',await bucket.download(target.logo),response => Boolean(response.error))
      add('Firma URL privada ajena',await bucket.createSignedUrl(target.logo,60),response => Boolean(response.error))
      add('Subida en ruta ajena',await bucket.upload(`${target.institution}/${crypto.randomUUID()}.png`,new Blob([png],{type:'image/png'}),{contentType:'image/png',upsert:false}),response => Boolean(response.error))
      add('Modificación de escudo ajeno',await bucket.update(target.logo,new Blob([png],{type:'image/png'}),{contentType:'image/png'}),response => Boolean(response.error))
      add('Jugador propio permanece',await client.from('players').select('id').eq('id',own.player),response => rows(response)?.length === 1)
      setReport(result)
      setMessage(result.every(item => item.result === 'PASS') ? 'Todas las comprobaciones de esta sesión pasaron. Repetí desde el otro club antes de aprobar el aislamiento.' : 'Hay un fallo de seguridad o una prueba incompleta. No habilites usuarios reales.')
    } catch (error) { setReport(result); setMessage(error.message) }
    finally { setBusy(false) }
  }

  async function clean() {
    if (!own) return
    setBusy(true); setMessage('')
    const errors = []
    const attempt = async (label,action) => { try { const { error } = await action(); if (error) errors.push(label) } catch { errors.push(label) } }
    if (own.logo) await attempt('escudo',() => client.storage.from('pilot-branding').remove([own.logo]))
    if (own.session && own.player) await attempt('asistencia',() => client.from('attendance').delete().eq('institution_id',institution.id).eq('session_id',own.session).eq('player_id',own.player))
    if (own.session) await attempt('jornada',() => client.from('training_sessions').delete().eq('institution_id',institution.id).eq('id',own.session))
    if (own.player) await attempt('jugador',() => client.from('players').delete().eq('institution_id',institution.id).eq('id',own.player))
    if (own.category) await attempt('categoría',() => client.from('categories').delete().eq('institution_id',institution.id).eq('id',own.category))
    if (!errors.length) { sessionStorage.removeItem(storageKey); setOwn(null) }
    setMessage(errors.length ? `Limpieza incompleta: ${errors.join(', ')}. Conservá los identificadores para revisar.` : 'Datos ficticios propios eliminados.')
    setBusy(false)
  }

  function downloadReport() {
    const blob = new Blob([JSON.stringify({ date:new Date().toISOString(),institution:institution.slug,results:report },null,2)],{type:'application/json'})
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob); anchor.download = `aislamiento-${institution.slug}.json`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(anchor.href),60000)
  }

  return <section><h2>Ensayo de aislamiento con sesión real</h2><p>Solo para la Preview protegida. Ejecutá primero Preparar en cada club. Intercambiá únicamente los identificadores ficticios; nunca compartas enlaces de acceso, JWT ni contraseñas. Cada comprobación usa la sesión Auth actual y PostgREST/Storage reales.</p>
    <button disabled={busy || Boolean(own)} onClick={prepare}>Preparar datos propios</button>
    {own && <><p>Datos propios de esta sesión (copiá los valores al otro ensayo):</p><dl>{Object.entries(own).map(([key,value]) => <React.Fragment key={key}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}</dl></>}
    <form onSubmit={event => { event.preventDefault(); check() }}><h3>Datos ficticios del otro club</h3>{Object.entries(target).map(([key,value]) => <label key={key}>{key}<input value={value} onChange={event => setTarget(current => ({...current,[key]:event.target.value.trim()}))} required autoComplete="off" /></label>)}<button disabled={busy || !own?.logo}>Ejecutar denegaciones cruzadas</button></form>
    {report.length > 0 && <ul>{report.map(item => <li key={item.label}>{item.label}: <strong>{item.result}</strong></li>)}</ul>}
    {report.length > 0 && <button disabled={busy} onClick={downloadReport}>Descargar informe sin credenciales</button>}
    {message && <p className="notice" role="status">{message}</p>}
    <button disabled={busy || !own} onClick={clean}>Limpiar únicamente mis datos ficticios</button>
  </section>
}

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabase'

const genderText = value => String(value || '').toLowerCase() === 'female' ? 'Femenino' : 'Masculino'

export default function CategoryAdminManager() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [host, setHost] = useState(null)
  const [categories, setCategories] = useState([])
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState({ name: '', gender: 'female', active: true })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadCategories() {
    const { data, error } = await supabase
      .from('categories')
      .select('id,name,gender,active,created_at')
      .order('name')
    if (error) {
      setMessage(error.message || 'No se pudieron cargar las categorías.')
      return
    }
    setCategories(data || [])
  }

  useEffect(() => {
    let alive = true

    async function loadRole() {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData?.session?.user?.id
      if (!userId) return
      const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
      if (alive) setIsSuperAdmin(data?.role === 'super_admin')
    }

    loadRole()
    const { data } = supabase.auth.onAuthStateChange(() => setTimeout(loadRole, 0))
    return () => {
      alive = false
      data?.subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isSuperAdmin) {
      setHost(null)
      document.body.classList.remove('mgsm-category-manager-mounted')
      return undefined
    }

    let frame = 0
    let lastCount = -1

    const sync = () => {
      frame = 0
      const list = document.querySelector('main.app .category-admin')
      const section = list?.closest('section') || null
      setHost(current => current === section ? current : section)

      if (section) {
        document.body.classList.add('mgsm-category-manager-mounted')
        const count = list?.children?.length ?? 0
        if (count !== lastCount) {
          lastCount = count
          loadCategories()
        }
      }
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync)
    }

    sync()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      document.body.classList.remove('mgsm-category-manager-mounted')
    }
  }, [isSuperAdmin])

  useEffect(() => {
    if (host) loadCategories()
  }, [host])

  const sorted = useMemo(() => [...categories].sort((a, b) => {
    const genderOrder = String(a.gender).localeCompare(String(b.gender))
    return genderOrder || String(a.name).localeCompare(String(b.name), 'es')
  }), [categories])

  function beginEdit(category) {
    setMessage('')
    setEditing(category.id)
    setDraft({ name: category.name || '', gender: category.gender || 'female', active: category.active !== false })
  }

  async function saveEdit(category) {
    const name = draft.name.trim()
    if (!name) {
      setMessage('El nombre de la categoría no puede quedar vacío.')
      return
    }

    const duplicate = categories.some(item =>
      item.id !== category.id &&
      String(item.name || '').trim().toLocaleLowerCase('es-AR') === name.toLocaleLowerCase('es-AR') &&
      String(item.gender || '') === draft.gender
    )
    if (duplicate) {
      setMessage(`Ya existe una categoría ${genderText(draft.gender)} con el nombre “${name}”.`)
      return
    }

    if (category.gender !== draft.gender) {
      const { count } = await supabase.from('players').select('id', { count: 'exact', head: true }).eq('category_id', category.id)
      if ((count || 0) > 0 && !window.confirm(`Esta categoría tiene ${count} jugador${count === 1 ? '' : 'es'}. ¿Confirmás cambiar también su clasificación de género?`)) return
    }

    setBusy(true)
    setMessage('')
    const { error } = await supabase
      .from('categories')
      .update({ name, gender: draft.gender, active: draft.active })
      .eq('id', category.id)

    if (error) setMessage(error.message || 'No se pudo modificar la categoría.')
    else {
      setEditing(null)
      setMessage('✓ Categoría modificada correctamente.')
      await loadCategories()
      window.dispatchEvent(new Event('mgsm:category-changed'))
    }
    setBusy(false)
  }

  async function removeCategory(category) {
    setBusy(true)
    setMessage('')

    const [playersResult, sessionsResult] = await Promise.all([
      supabase.from('players').select('id', { count: 'exact', head: true }).eq('category_id', category.id),
      supabase.from('training_sessions').select('id', { count: 'exact', head: true }).eq('category_id', category.id),
    ])

    if (playersResult.error || sessionsResult.error) {
      setMessage(playersResult.error?.message || sessionsResult.error?.message || 'No se pudo verificar si la categoría está en uso.')
      setBusy(false)
      return
    }

    const players = playersResult.count || 0
    const sessions = sessionsResult.count || 0
    if (players > 0 || sessions > 0) {
      const parts = []
      if (players) parts.push(`${players} jugador${players === 1 ? '' : 'es'}`)
      if (sessions) parts.push(`${sessions} sesión${sessions === 1 ? '' : 'es'}${sessions === 1 ? '' : 'es'}`)
      setMessage(`No se puede eliminar “${category.name}” porque tiene ${parts.join(' y ')} asociados. Primero reasignalos o corregí la categoría con Editar.`)
      setBusy(false)
      return
    }

    const confirmed = window.confirm(`¿Eliminar definitivamente la categoría “${category.name}”?\n\nEstá vacía y no tiene sesiones. Esta acción no se puede deshacer.`)
    if (!confirmed) {
      setBusy(false)
      return
    }

    const { error } = await supabase.from('categories').delete().eq('id', category.id)
    if (error) setMessage(error.message || 'No se pudo eliminar la categoría.')
    else {
      if (editing === category.id) setEditing(null)
      setMessage(`✓ Categoría “${category.name}” eliminada.`)
      await loadCategories()
      window.dispatchEvent(new Event('mgsm:category-changed'))
    }
    setBusy(false)
  }

  if (!isSuperAdmin || !host) return null

  return createPortal(
    <>
      <style>{`
        body.mgsm-category-manager-mounted main.app .category-admin { display:none !important; }
        .mgsm-category-manager { margin-top:15px; display:grid; gap:9px; }
        .mgsm-category-manager-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:5px 0 2px; }
        .mgsm-category-manager-head h3 { margin:0; font-size:14px; }
        .mgsm-category-manager-head button { background:#f3f3f3; color:#444; padding:7px 10px; border-radius:8px; font-size:11px; font-weight:800; }
        .mgsm-category-manage-row { padding:13px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .mgsm-category-manage-info { min-width:0; }
        .mgsm-category-manage-info b, .mgsm-category-manage-info small { display:block; }
        .mgsm-category-manage-info small { margin-top:3px; color:#777; font-size:10px; }
        .mgsm-category-actions { display:flex; gap:7px; flex:0 0 auto; }
        .mgsm-category-actions button { min-height:36px; padding:7px 10px; border-radius:8px; font-size:10px; font-weight:850; }
        .mgsm-category-edit { background:#f3f3f3; color:#333; }
        .mgsm-category-delete { background:#fff0f0; color:#a3121a; border:1px solid #f3c5c8; }
        .mgsm-category-editor { display:grid; grid-template-columns:minmax(0,1fr) 150px auto auto; gap:8px; align-items:center; width:100%; }
        .mgsm-category-editor label { display:flex; align-items:center; gap:6px; font-size:11px; white-space:nowrap; }
        .mgsm-category-editor input[type="checkbox"] { width:18px !important; height:18px !important; min-height:18px !important; }
        .mgsm-category-save { background:var(--mgsm-red); color:#fff; }
        .mgsm-category-cancel { background:#f3f3f3; color:#444; }
        .mgsm-category-manager-message { margin:8px 0 0; padding:10px 12px; border-radius:9px; background:#fff5f5; border:1px solid #f1d2d4; color:#8f0f16; font-size:11px; }
        @media(max-width:700px) {
          .mgsm-category-manage-row { align-items:flex-start; flex-direction:column; }
          .mgsm-category-actions { width:100%; }
          .mgsm-category-actions button { flex:1; }
          .mgsm-category-editor { grid-template-columns:1fr 1fr; }
          .mgsm-category-editor > input { grid-column:1 / -1; }
        }
      `}</style>

      {message ? <div className="mgsm-category-manager-message">{message}</div> : null}
      <div className="mgsm-category-manager">
        <div className="mgsm-category-manager-head">
          <h3>Administrar categorías</h3>
          <button type="button" onClick={loadCategories}>↻ Actualizar</button>
        </div>

        {sorted.map(category => (
          <div className="card mgsm-category-manage-row" key={category.id}>
            {editing === category.id ? (
              <div className="mgsm-category-editor">
                <input value={draft.name} onChange={event => setDraft(value => ({ ...value, name: event.target.value }))} placeholder="Nombre de categoría" />
                <select value={draft.gender} onChange={event => setDraft(value => ({ ...value, gender: event.target.value }))}>
                  <option value="female">Femenino</option>
                  <option value="male">Masculino</option>
                </select>
                <label><input type="checkbox" checked={draft.active} onChange={event => setDraft(value => ({ ...value, active: event.target.checked }))} /> Activa</label>
                <button type="button" className="mgsm-category-save" disabled={busy} onClick={() => saveEdit(category)}>Guardar</button>
                <button type="button" className="mgsm-category-cancel" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button>
              </div>
            ) : (
              <>
                <div className="mgsm-category-manage-info">
                  <b>{category.name}</b>
                  <small>{genderText(category.gender)} · {category.active === false ? 'INACTIVA' : 'ACTIVA'}</small>
                </div>
                <div className="mgsm-category-actions">
                  <button type="button" className="mgsm-category-edit" disabled={busy} onClick={() => beginEdit(category)}>✏️ Editar</button>
                  <button type="button" className="mgsm-category-delete" disabled={busy} onClick={() => removeCategory(category)}>🗑️ Eliminar</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </>,
    host
  )
}

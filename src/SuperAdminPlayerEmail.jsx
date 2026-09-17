import { useEffect } from 'react'
import { supabase } from './supabase'

function normalize(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR')
}

export default function SuperAdminPlayerEmail() {
  useEffect(() => {
    let cancelled = false
    let observer = null
    let rows = []
    let frame = 0

    const decorate = () => {
      frame = 0
      if (cancelled || !rows.length) return

      document.querySelectorAll('main.app .player-card').forEach((card) => {
        if (card.querySelector('[data-superadmin-player-email]')) return

        const name = card.querySelector('h3')?.textContent?.trim() || ''
        const dataItems = Array.from(card.querySelectorAll('.player-data > span'))
        const dniItem = dataItems.find((item) => item.querySelector('b')?.textContent?.trim() === 'DNI')
        const dni = dniItem ? dniItem.textContent.replace('DNI', '').trim() : ''

        const match = rows.find((row) =>
          normalize(row.full_name) === normalize(name) &&
          normalize(row.dni || '—') === normalize(dni || '—')
        )
        if (!match) return

        const data = card.querySelector('.player-data')
        if (!data) return

        const item = document.createElement('span')
        item.setAttribute('data-superadmin-player-email', 'true')
        item.className = 'superadmin-player-email'

        const label = document.createElement('b')
        label.textContent = 'Correo de cuenta'
        const value = document.createElement('span')
        value.textContent = match.email || 'Sin cuenta asociada'
        value.className = match.email ? '' : 'superadmin-player-email-empty'

        item.append(label, value)
        data.appendChild(item)
      })
    }

    const scheduleDecorate = () => {
      if (frame || cancelled) return
      frame = requestAnimationFrame(decorate)
    }

    async function load() {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData?.user
      if (!user || cancelled) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role,active,approval_status')
        .eq('id', user.id)
        .maybeSingle()

      if (
        cancelled ||
        profile?.role !== 'super_admin' ||
        !profile?.active ||
        profile?.approval_status !== 'approved'
      ) return

      const { data, error } = await supabase.rpc('get_superadmin_player_account_emails')
      if (cancelled || error) return
      rows = Array.isArray(data) ? data : []

      decorate()
      observer = new MutationObserver(scheduleDecorate)
      observer.observe(document.body, { childList: true, subtree: true })
    }

    load()

    return () => {
      cancelled = true
      observer?.disconnect()
      if (frame) cancelAnimationFrame(frame)
      document.querySelectorAll('[data-superadmin-player-email]').forEach((node) => node.remove())
    }
  }, [])

  return null
}

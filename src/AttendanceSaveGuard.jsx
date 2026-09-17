import { useEffect } from 'react'

function isAttendanceSaveButton(target) {
  const button = target?.closest?.('section[data-attendance-dirty] button.primary.wide')
  if (!button) return null
  const text = (button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
  return text.includes('guardar') && text.includes('registro') ? button : null
}

export default function AttendanceSaveGuard() {
  useEffect(() => {
    const snapshots = new WeakMap()
    let scheduled = 0

    const refreshSnapshots = () => {
      scheduled = 0
      document.querySelectorAll('section[data-attendance-dirty]').forEach((section) => {
        const loadedAt = section.dataset.attendanceLoadedAt || ''
        const previous = snapshots.get(section)
        if (previous?.loadedAt === loadedAt) return

        snapshots.set(section, {
          loadedAt,
          hadExistingAttendance: section.querySelectorAll('.status.active').length > 0,
        })
      })
    }

    const scheduleRefresh = () => {
      if (scheduled) return
      scheduled = requestAnimationFrame(refreshSnapshots)
    }

    const onClick = (event) => {
      const button = isAttendanceSaveButton(event.target)
      if (!button || button.disabled) return

      const section = button.closest('section[data-attendance-dirty]')
      if (!section) return

      const dirty = section.dataset.attendanceDirty === 'true'
      const markedCount = section.querySelectorAll('.status.active').length
      const snapshot = snapshots.get(section)
      const isNewSession = !snapshot?.hadExistingAttendance

      if (!dirty) {
        event.preventDefault()
        event.stopImmediatePropagation()
        window.alert('No hay cambios de asistencia para guardar.')
        return
      }

      if (markedCount === 0) {
        event.preventDefault()
        event.stopImmediatePropagation()
        window.alert('Marcá al menos una asistencia antes de guardar el registro.')
        return
      }

      if (isNewSession) {
        const confirmed = window.confirm(
          `Vas a crear un nuevo registro de asistencia con ${markedCount} jugador${markedCount === 1 ? '' : 'es'} marcado${markedCount === 1 ? '' : 's'}. ¿Querés guardarlo?`,
        )
        if (!confirmed) {
          event.preventDefault()
          event.stopImmediatePropagation()
        }
      }
    }

    refreshSnapshots()
    document.addEventListener('click', onClick, true)
    const observer = new MutationObserver(scheduleRefresh)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-attendance-loaded-at'],
    })

    return () => {
      document.removeEventListener('click', onClick, true)
      observer.disconnect()
      if (scheduled) cancelAnimationFrame(scheduled)
    }
  }, [])

  return null
}

import { useLayoutEffect } from 'react'
import { supabase } from './supabase'

function cleanLabel(value = '') {
  return String(value)
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalLabel(value = '') {
  const text = cleanLabel(value).toLocaleLowerCase('es-AR')

  if (text.includes('horario')) return 'Horarios'
  if (text.includes('perfil')) return 'Mi perfil'

  return cleanLabel(value)
}

export default function PlayerTabVisibilityGuard() {
  useLayoutEffect(() => {
    let cancelled = false
    let disabledTabs = []
    let scheduledApply = 0
    let settingsReady = false

    // Prevent a disabled player tab from flashing before app_ui_settings arrives.
    // useLayoutEffect runs before paint, and this temporary style also covers
    // player navigation that is mounted a moment later by async auth routing.
    const pendingStyle = document.createElement('style')
    pendingStyle.dataset.playerTabsPendingStyle = 'true'
    pendingStyle.textContent = `
      .player-section-nav {
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `
    document.head.appendChild(pendingStyle)

    const isPlayerView = () =>
      localStorage.getItem('voley_access_mode') === 'player' ||
      Boolean(document.querySelector('main.player-app'))

    const revealNavigation = () => {
      if (pendingStyle.isConnected) pendingStyle.remove()
      document.querySelectorAll('.player-section-nav').forEach((nav) => {
        nav.dataset.playerTabsReady = 'true'
      })
    }

    const apply = () => {
      scheduledApply = 0

      if (!isPlayerView()) return

      document.querySelectorAll('.player-section-nav button').forEach((button) => {
        const label = canonicalLabel(button.textContent)
        const hidden = disabledTabs.includes(label)

        button.hidden = hidden
        button.setAttribute('aria-hidden', hidden ? 'true' : 'false')
        button.dataset.playerFeatureTab = label

        if (hidden) {
          button.style.setProperty('display', 'none', 'important')
        } else {
          button.style.removeProperty('display')
        }
      })

      document.querySelectorAll('.player-section-nav').forEach((nav) => {
        const active = nav.querySelector('button.active')
        const activeIsHidden =
          active && (active.hidden || active.style.display === 'none')

        if (activeIsHidden) {
          const firstEnabled = Array.from(nav.querySelectorAll('button')).find(
            (button) => !button.hidden && button.style.display !== 'none'
          )

          if (firstEnabled) firstEnabled.click()
        }
      })

      if (settingsReady) revealNavigation()
    }

    const scheduleApply = () => {
      if (scheduledApply) return
      scheduledApply = requestAnimationFrame(apply)
    }

    async function loadSettings() {
      const { data, error } = await supabase
        .from('app_ui_settings')
        .select('disabled_tabs')
        .eq('id', 'global')
        .maybeSingle()

      if (cancelled) return

      if (!error) {
        disabledTabs = Array.isArray(data?.disabled_tabs)
          ? data.disabled_tabs
          : []
      }

      // Even on a read error we must not leave navigation permanently hidden.
      // In that case the safe fallback is the app's normal visible-tab behavior.
      settingsReady = true
      apply()
    }

    loadSettings()

    const observer = new MutationObserver(scheduleApply)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      cancelled = true
      observer.disconnect()
      if (scheduledApply) cancelAnimationFrame(scheduledApply)
      if (pendingStyle.isConnected) pendingStyle.remove()
    }
  }, [])

  return null
}

import { useLayoutEffect } from 'react'
import { supabase } from './supabase'

const CACHE_KEY = 'voley_disabled_tabs_cache'

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

function readCachedDisabledTabs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function PlayerTabVisibilityGuard() {
  useLayoutEffect(() => {
    let cancelled = false
    let disabledTabs = readCachedDisabledTabs()
    let scheduledApply = 0
    let settingsReady = false

    // This rule intentionally stays mounted for the lifetime of the app.
    // Any player nav created later (for example when switching from Super Admin
    // to Player without a full reload) starts hidden and cannot flash on screen.
    const guardStyle = document.createElement('style')
    guardStyle.dataset.playerTabsGuardStyle = 'true'
    guardStyle.textContent = `
      .player-section-nav:not([data-player-tabs-ready="true"]) {
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `
    document.head.appendChild(guardStyle)

    const isPlayerView = () =>
      localStorage.getItem('voley_access_mode') === 'player' ||
      Boolean(document.querySelector('main.player-app'))

    const apply = () => {
      scheduledApply = 0
      if (!isPlayerView()) return

      document.querySelectorAll('.player-section-nav').forEach((nav) => {
        // Mark as not-ready before touching any newly mounted controls.
        nav.dataset.playerTabsReady = 'false'

        nav.querySelectorAll('button').forEach((button) => {
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

        const active = nav.querySelector('button.active')
        const activeIsHidden =
          active && (active.hidden || active.style.display === 'none')

        if (activeIsHidden) {
          const firstEnabled = Array.from(nav.querySelectorAll('button')).find(
            (button) => !button.hidden && button.style.display !== 'none'
          )
          if (firstEnabled) firstEnabled.click()
        }

        if (settingsReady) nav.dataset.playerTabsReady = 'true'
      })
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
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(disabledTabs))
        } catch {
          // Cache is an optimization only. Database remains the source of truth.
        }
      }

      settingsReady = true
      apply()
    }

    // Apply the synchronous cache before the first visible player navigation,
    // then reconcile with the authoritative database setting.
    apply()
    loadSettings()

    const observer = new MutationObserver(scheduleApply)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      cancelled = true
      observer.disconnect()
      if (scheduledApply) cancelAnimationFrame(scheduledApply)
      if (guardStyle.isConnected) guardStyle.remove()
    }
  }, [])

  return null
}

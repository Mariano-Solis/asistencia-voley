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

    // Player navigation is hidden until the authoritative settings are applied.
    // Disabled buttons also receive a persistent data marker. This makes their
    // visibility deterministic even if another component later removes inline
    // styles or the native hidden attribute.
    const guardStyle = document.createElement('style')
    guardStyle.dataset.playerTabsGuardStyle = 'true'
    guardStyle.textContent = `
      .player-section-nav:not([data-player-tabs-ready="true"]) {
        visibility: hidden !important;
        pointer-events: none !important;
      }

      .player-section-nav button[data-player-tab-disabled="true"] {
        display: none !important;
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
        nav.dataset.playerTabsReady = 'false'

        nav.querySelectorAll('button').forEach((button) => {
          const label = canonicalLabel(button.textContent)
          const hidden = disabledTabs.includes(label)

          button.dataset.playerFeatureTab = label
          button.dataset.playerTabDisabled = hidden ? 'true' : 'false'
          button.hidden = hidden
          button.setAttribute('aria-hidden', hidden ? 'true' : 'false')

          if (hidden) {
            button.style.setProperty('display', 'none', 'important')
            button.setAttribute('tabindex', '-1')
          } else {
            button.style.removeProperty('display')
            button.removeAttribute('tabindex')
          }
        })

        const active = nav.querySelector('button.active')
        const activeIsHidden =
          active && active.dataset.playerTabDisabled === 'true'

        if (activeIsHidden) {
          const firstEnabled = Array.from(nav.querySelectorAll('button')).find(
            (button) => button.dataset.playerTabDisabled !== 'true'
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

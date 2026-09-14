import { useEffect } from 'react'

function findOriginalButton() {
  return Array.from(document.querySelectorAll('button')).find((button) => {
    const text = String(button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
    return text.includes('solapas') && !button.dataset.solapasHeaderButton
  })
}

export default function FeatureTabHeaderMover() {
  useEffect(() => {
    let disposed = false

    const sync = () => {
      if (disposed) return

      const original = findOriginalButton()
      const topUser = document.querySelector('main.app .topbar .top-user')

      if (!original || !topUser) {
        document.querySelector('[data-solapas-header-button="true"]')?.remove()
        return
      }

      original.style.display = 'none'
      original.setAttribute('aria-hidden', 'true')

      let headerButton = topUser.querySelector('[data-solapas-header-button="true"]')
      if (!headerButton) {
        headerButton = document.createElement('button')
        headerButton.type = 'button'
        headerButton.dataset.solapasHeaderButton = 'true'
        headerButton.className = 'mgsm-solapas-header-button'
        headerButton.setAttribute('aria-label', 'Configurar solapas')
        headerButton.title = 'Configurar solapas'
        headerButton.innerHTML = '<span aria-hidden="true">⚙️</span><span class="mgsm-solapas-header-text">Solapas</span>'
        headerButton.addEventListener('click', () => original.click())
      }

      const logout = Array.from(topUser.querySelectorAll('button')).find((button) => {
        const text = String(button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
        return text === 'salir'
      })

      if (logout) {
        if (headerButton.parentElement !== topUser || headerButton.nextSibling !== logout) {
          topUser.insertBefore(headerButton, logout)
        }
      } else if (headerButton.parentElement !== topUser) {
        topUser.appendChild(headerButton)
      }
    }

    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', sync)

    return () => {
      disposed = true
      observer.disconnect()
      window.removeEventListener('resize', sync)
      document.querySelector('[data-solapas-header-button="true"]')?.remove()
      const original = findOriginalButton()
      if (original) {
        original.style.display = ''
        original.removeAttribute('aria-hidden')
      }
    }
  }, [])

  return (
    <style>{`
      .mgsm-solapas-header-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-height: 40px;
        padding: 8px 11px;
        border: 1px solid rgba(255,255,255,.65);
        border-radius: 12px;
        background: rgba(255,255,255,.16);
        color: #fff;
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        line-height: 1;
        white-space: nowrap;
        box-shadow: none;
        cursor: pointer;
        flex: 0 0 auto;
      }
      .mgsm-solapas-header-button:hover,
      .mgsm-solapas-header-button:focus-visible {
        background: rgba(255,255,255,.28);
        outline: 2px solid rgba(255,255,255,.85);
        outline-offset: 2px;
      }
      @media (max-width: 760px) {
        .mgsm-solapas-header-button {
          min-height: 38px;
          padding: 7px 8px;
          border-radius: 10px;
          font-size: 11px;
          gap: 3px;
        }
      }
      @media (max-width: 430px) {
        .mgsm-solapas-header-text {
          font-size: 10px;
        }
      }
    `}</style>
  )
}

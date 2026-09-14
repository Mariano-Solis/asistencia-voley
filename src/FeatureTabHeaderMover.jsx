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
    let frameId = 0
    let observer = null

    const sync = () => {
      if (disposed) return

      const original = findOriginalButton()
      const topbar = document.querySelector('main.app .topbar')
      const topUser = topbar?.querySelector('.top-user')
      const brandText = topbar?.querySelector('.brand > div')

      if (!original || !topUser || !brandText) {
        return
      }

      if (original.style.display !== 'none') original.style.display = 'none'
      if (original.getAttribute('aria-hidden') !== 'true') original.setAttribute('aria-hidden', 'true')

      const nameSpan = Array.from(topUser.children).find((el) => {
        return el.tagName === 'SPAN' && !el.classList.contains('role')
      })
      const adminName = String(nameSpan?.textContent || '').replace(/\s+/g, ' ').trim()

      if (nameSpan) {
        if (nameSpan.style.display !== 'none') nameSpan.style.display = 'none'
        if (nameSpan.getAttribute('aria-hidden') !== 'true') nameSpan.setAttribute('aria-hidden', 'true')
      }

      let brandName = brandText.querySelector('[data-admin-name-brand="true"]')
      if (!brandName) {
        brandName = document.createElement('span')
        brandName.dataset.adminNameBrand = 'true'
        brandName.className = 'mgsm-admin-name-brand'
        brandText.appendChild(brandName)
      }
      if (adminName && brandName.textContent !== adminName) {
        brandName.textContent = adminName
      }

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

    const scheduleSync = () => {
      if (disposed || frameId) return
      frameId = window.requestAnimationFrame(() => {
        frameId = 0
        sync()
      })
    }

    sync()
    observer = new MutationObserver(scheduleSync)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', scheduleSync)

    return () => {
      disposed = true
      if (frameId) window.cancelAnimationFrame(frameId)
      observer?.disconnect()
      window.removeEventListener('resize', scheduleSync)
      document.querySelector('[data-solapas-header-button="true"]')?.remove()
      document.querySelector('[data-admin-name-brand="true"]')?.remove()

      const original = findOriginalButton()
      if (original) {
        original.style.display = ''
        original.removeAttribute('aria-hidden')
      }

      const topUser = document.querySelector('main.app .topbar .top-user')
      const nameSpan = topUser && Array.from(topUser.children).find((el) => {
        return el.tagName === 'SPAN' && !el.classList.contains('role')
      })
      if (nameSpan) {
        nameSpan.style.display = ''
        nameSpan.removeAttribute('aria-hidden')
      }
    }
  }, [])

  return (
    <style>{`
      .mgsm-admin-name-brand {
        display: block;
        margin-top: 2px;
        color: rgba(255,255,255,.96);
        font-size: 12px;
        font-weight: 800;
        line-height: 1.15;
        white-space: nowrap;
      }

      .mgsm-solapas-header-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-height: 40px;
        padding: 8px 11px;
        border: 1px solid rgba(255,255,255,.72);
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
        main.app .topbar {
          gap: 8px !important;
        }
        main.app .topbar .brand {
          min-width: 0;
          flex: 1 1 auto;
        }
        main.app .topbar .brand > div {
          min-width: 0;
        }
        main.app .topbar .brand strong,
        main.app .topbar .brand > div > span:not(.mgsm-admin-name-brand) {
          white-space: nowrap;
        }
        .mgsm-admin-name-brand {
          font-size: 11px;
          max-width: 235px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        main.app .topbar .top-user {
          gap: 6px !important;
          flex: 0 0 auto;
        }
        main.app .topbar .top-user .role {
          display: none !important;
        }
        .mgsm-solapas-header-button {
          min-height: 38px;
          padding: 7px 9px;
          border-radius: 10px;
          font-size: 11px;
          gap: 3px;
        }
      }

      @media (max-width: 430px) {
        .mgsm-admin-name-brand {
          font-size: 10px;
          max-width: 205px;
        }
        .mgsm-solapas-header-text {
          font-size: 10px;
        }
      }
    `}</style>
  )
}

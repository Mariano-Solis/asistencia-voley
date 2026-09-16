import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabase'

function formatProperName(value = '') {
  return String(value)
    .trim()
    .toLocaleLowerCase('es-AR')
    .replace(/(^|[\s'-])\p{L}/gu, (match) => match.toLocaleUpperCase('es-AR'))
}

export default function AdminHeaderPaymentPolish() {
  const [role, setRole] = useState('')
  const [fullName, setFullName] = useState('')
  const [navTarget, setNavTarget] = useState(null)

  useEffect(() => {
    let mounted = true

    async function loadProfile() {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData?.session?.user?.id
      if (!userId) {
        if (mounted) {
          setRole('')
          setFullName('')
        }
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role,full_name')
        .eq('id', userId)
        .maybeSingle()

      if (!mounted) return
      setRole(profile?.role || '')
      setFullName(profile?.full_name || '')
    }

    loadProfile()
    const { data } = supabase.auth.onAuthStateChange(() => {
      setTimeout(loadProfile, 0)
    })

    return () => {
      mounted = false
      data?.subscription?.unsubscribe()
    }
  }, [])

  const isAdminMode = role === 'admin' || role === 'super_admin'

  useEffect(() => {
    if (!isAdminMode) {
      setNavTarget(null)
      document.body.classList.remove('mgsm-payment-tab-mounted')
      return undefined
    }

    let frame = 0

    const sync = () => {
      frame = 0
      const nav = document.querySelector('main.app > nav, main.app nav')
      setNavTarget((current) => current === nav ? current : (nav || null))

      if (role === 'super_admin') {
        const nameNode = document.querySelector('.mgsm-admin-name-brand')
        if (nameNode) {
          const formatted = formatProperName(fullName)
          if (formatted && nameNode.textContent !== formatted) nameNode.textContent = formatted
          nameNode.style.setProperty('font-size', '14px', 'important')
          nameNode.style.setProperty('line-height', '1', 'important')
          nameNode.style.setProperty('font-weight', '800', 'important')
          nameNode.style.setProperty('text-transform', 'none', 'important')
          nameNode.style.setProperty('letter-spacing', '0', 'important')
        }
      }

      document.body.classList.add('mgsm-payment-tab-mounted')
    }

    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(sync)
    }

    sync()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      document.body.classList.remove('mgsm-payment-tab-mounted')
    }
  }, [isAdminMode, role, fullName])

  if (!isAdminMode) return null

  const paymentButton = (
    <button
      type="button"
      className="mgsm-payment-nav-tab"
      data-feature-tab="Pagos"
      aria-label="Pagos"
      title="Pagos"
      onClick={() => {
        const launcher = document.querySelector('.stable-pay-admin-launcher')
        launcher?.click()
      }}
    >
      <span>Pagos</span>
    </button>
  )

  return (
    <>
      <style>{`
        body.mgsm-payment-tab-mounted > .stable-pay-admin-launcher,
        body.mgsm-payment-tab-mounted .stable-pay-admin-launcher {
          display: none !important;
        }

        main.app nav .mgsm-payment-nav-tab {
          flex: 0 0 auto;
        }

        .mgsm-admin-name-brand {
          font-size: 14px !important;
          line-height: 1 !important;
          font-weight: 800 !important;
          text-transform: none !important;
          letter-spacing: 0 !important;
        }

        @media (max-width: 760px) {
          .mgsm-admin-name-brand {
            font-size: 14px !important;
            line-height: 1 !important;
            max-width: 205px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }
      `}</style>

      {navTarget ? createPortal(paymentButton, navTarget) : null}
    </>
  )
}

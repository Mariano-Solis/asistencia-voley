import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function PlayerInstitutionalFooter() {
  const [target, setTarget] = useState(null)

  useEffect(() => {
    let cancelled = false

    const findTarget = () => {
      if (cancelled) return
      const playerApp = document.querySelector('main.player-app')
      setTarget(playerApp || null)
    }

    findTarget()
    const observer = new MutationObserver(findTarget)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [])

  if (!target) return null

  return createPortal(
    <footer className="player-institutional-footer" aria-label="Municipalidad de San Martín VOLEY">
      <img src="/Logo.jpg" alt="Municipalidad de San Martín - VOLEY" />
      <span>Municipalidad de San Martín - VOLEY - #vamoselpoli</span>
    </footer>,
    target
  )
}

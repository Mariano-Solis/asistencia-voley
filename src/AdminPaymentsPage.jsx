import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabase'

const BUCKET = 'payment-receipts'
const FEES = [10000, 15000, 20000]

function currentPeriod() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Mendoza',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  return `${year}-${month}-01`
}

function periodLabel(value) {
  if (!value) return '—'
  const date = new Date(`${value}T12:00:00`)
  return new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Mendoza',
  })
    .format(date)
    .replace(/^./, (character) => character.toUpperCase())
}

function money(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function stateOf(payment) {
  if (!payment) return { cls: 'pending', label: 'Pendiente' }
  if (payment.validation_status === 'validated') return { cls: 'paid', label: '✓ Comprobante válido' }
  if (payment.validation_status === 'pending_validation') return { cls: 'review', label: '⏳ Verificando comprobante' }
  if (payment.validation_status === 'manual_review') return { cls: 'review', label: '⚠ Pendiente de revisión' }
  if (payment.validation_status === 'rejected') return { cls: 'rejected', label: '✕ Rechazado' }
  return { cls: 'review', label: '⏳ Verificando comprobante' }
}

async function openReceipt(path, setMessage) {
  if (!path) return
  const popup = window.open('', '_blank')
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120)
    if (error) throw error
    if (popup) popup.location.href = data.signedUrl
    else window.location.href = data.signedUrl
  } catch {
    popup?.close()
    setMessage('No se pudo abrir el comprobante.')
  }
}

function AdminPaymentsContent({ role }) {
  const period = currentPeriod()
  const refreshInFlightRef = useRef(false)
  const [players, setPlayers] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [reviewing, setReviewing] = useState('')
  const [bulkReviewing, setBulkReviewing] = useState(false)

  async function load(clearMessage = false, showLoading = false) {
    if (refreshInFlightRef.current) return
    refreshInFlightRef.current = true
    if (showLoading) setLoading(true)
    if (clearMessage) setMessage('')

    try {
      const [playerResult, paymentResult] = await Promise.all([
        supabase
          .from('players')
          .select('id,full_name,monthly_fee,category_id,team,active')
          .eq('active', true)
          .order('full_name'),
        supabase
          .from('monthly_payments')
          .select('id,player_id,period_month,amount_due,receipt_path,validation_status,validation_reason,detected_provider')
          .eq('period_month', period),
      ])

      if (playerResult.error || paymentResult.error) setMessage('No se pudieron cargar los pagos.')
      if (!playerResult.error) setPlayers(playerResult.data || [])
      if (!paymentResult.error) setPayments(paymentResult.data || [])
    } finally {
      if (showLoading) setLoading(false)
      refreshInFlightRef.current = false
    }
  }

  useEffect(() => {
    load(false, true)
  }, [])

  const hasPendingValidation = payments.some(
    (payment) => payment.validation_status === 'pending_validation',
  )

  useEffect(() => {
    if (!hasPendingValidation) return undefined
    const timer = window.setInterval(() => load(false, false), 5000)
    return () => window.clearInterval(timer)
  }, [hasPendingValidation])

  const paymentByPlayer = useMemo(
    () => Object.fromEntries(payments.map((payment) => [payment.player_id, payment])),
    [payments],
  )

  const rows = useMemo(
    () =>
      players.filter((player) => {
        const payment = paymentByPlayer[player.id]
        const query = search.trim().toLowerCase()
        if (query && !player.full_name.toLowerCase().includes(query)) return false
        if (status === 'validated' && payment?.validation_status !== 'validated') return false
        if (status === 'pending_validation' && payment?.validation_status !== 'pending_validation') return false
        if (status === 'manual_review' && payment?.validation_status !== 'manual_review') return false
        if (status === 'pending' && payment) return false
        if (status === 'rejected' && payment?.validation_status !== 'rejected') return false
        return true
      }),
    [players, paymentByPlayer, search, status],
  )

  const validated = rows.filter(
    (player) => paymentByPlayer[player.id]?.validation_status === 'validated',
  ).length
  const review = rows.filter(
    (player) => paymentByPlayer[player.id]?.validation_status === 'manual_review',
  ).length
  const expected = rows.reduce((sum, player) => sum + Number(player.monthly_fee || 0), 0)
  const received = rows.reduce((sum, player) => {
    const payment = paymentByPlayer[player.id]
    return sum + (payment?.validation_status === 'validated' ? Number(payment.amount_due || 0) : 0)
  }, 0)
  const receiptsCount = payments.filter((payment) => !!payment.receipt_path).length
  const unvalidatedReceiptsCount = payments.filter(
    (payment) => !!payment.receipt_path && payment.validation_status !== 'validated',
  ).length

  async function updateFee(playerId, value) {
    if (role !== 'super_admin') return
    const fee = Number(value)
    const { error } = await supabase.from('players').update({ monthly_fee: fee }).eq('id', playerId)
    if (error) setMessage('No se pudo modificar la cuota.')
    else {
      setPlayers((current) =>
        current.map((player) => (player.id === playerId ? { ...player, monthly_fee: fee } : player)),
      )
    }
  }

  async function reviewPayment(paymentId, decision) {
    if (role !== 'super_admin') return
    setReviewing(paymentId)
    setMessage('')
    const { data, error } = await supabase.functions.invoke('review-payment-receipt', {
      body: { payment_id: paymentId, decision },
    })
    if (error || !data?.ok) setMessage('No se pudo resolver el comprobante.')
    else {
      setMessage(decision === 'validated' ? '✓ Comprobante aprobado.' : '✓ Comprobante rechazado.')
      await load(false, false)
    }
    setReviewing('')
  }

  async function approveAllReceipts() {
    if (role !== 'super_admin' || bulkReviewing || unvalidatedReceiptsCount === 0) return
    const label = periodLabel(period)
    const confirmed = window.confirm(
      `Vas a aprobar todos los comprobantes cargados de ${label}. ¿Querés continuar?`,
    )
    if (!confirmed) return

    setBulkReviewing(true)
    setMessage('')
    try {
      const { data, error } = await supabase.functions.invoke('review-payment-receipt', {
        body: { action: 'bulk_validate', period_month: period },
      })
      if (error || !data?.ok) {
        setMessage('No se pudieron aprobar todos los comprobantes.')
      } else {
        const count = Number(data.updated_count || 0)
        setMessage(
          count > 0
            ? `✓ Se aprobaron ${count} comprobante${count === 1 ? '' : 's'} de ${label}.`
            : `✓ Todos los comprobantes de ${label} ya estaban aprobados.`,
        )
        await load(false, false)
      }
    } finally {
      setBulkReviewing(false)
    }
  }

  async function revokePayment(paymentId, playerName) {
    if (role !== 'super_admin' || reviewing) return
    const confirmed = window.confirm(
      `Vas a revocar la aprobación del comprobante de ${playerName}. Quedará pendiente de revisión. ¿Querés continuar?`,
    )
    if (!confirmed) return

    setReviewing(paymentId)
    setMessage('')
    try {
      const { data, error } = await supabase.functions.invoke('review-payment-receipt', {
        body: { action: 'revoke', payment_id: paymentId },
      })
      if (error || !data?.ok) {
        setMessage('No se pudo revocar la aprobación del comprobante.')
      } else {
        setMessage(`↩ Aprobación revocada para ${playerName}. El comprobante quedó pendiente de revisión.`)
        await load(false, false)
      }
    } finally {
      setReviewing('')
    }
  }

  return (
    <section className="payments-inline-page" aria-label="Administración de pagos">
      <div className="page-title payments-inline-title">
        <div>
          <h1>Pagos</h1>
          <p>{periodLabel(period)} · {role === 'super_admin' ? 'Vista del club' : 'Tus categorías autorizadas'}</p>
        </div>
      </div>

      <div className="payments-inline-card">
        <div className="stable-pay-summary">
          <div><span>Esperado</span><b>{money(expected)}</b></div>
          <div><span>Validados</span><b>{validated}</b></div>
          <div><span>En revisión</span><b>{review}</b></div>
          <div><span>Validado</span><b>{money(received)}</b></div>
        </div>

        <div className="stable-pay-filters">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar Jugador@" />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Todos</option>
            <option value="validated">Validados</option>
            <option value="pending_validation">Verificando</option>
            <option value="manual_review">Pendientes de revisión</option>
            <option value="pending">Sin comprobante</option>
            <option value="rejected">Rechazados</option>
          </select>
        </div>

        {role === 'super_admin' && (
          <div className="stable-pay-bulk-actions">
            <div>
              <strong>Acciones del período · {periodLabel(period)}</strong>
              <small>{receiptsCount} comprobante{receiptsCount === 1 ? '' : 's'} cargado{receiptsCount === 1 ? '' : 's'} · {unvalidatedReceiptsCount} sin aprobar</small>
            </div>
            <button
              type="button"
              className="approve-all"
              disabled={bulkReviewing || unvalidatedReceiptsCount === 0}
              onClick={approveAllReceipts}
            >
              {bulkReviewing ? '⏳ Aprobando...' : `✓ Aprobar todos los comprobantes de ${periodLabel(period)}`}
            </button>
          </div>
        )}

        {message && <div className="stable-pay-message">{message}</div>}

        <div className="stable-pay-admin-list">
          {loading ? (
            <p>Cargando pagos...</p>
          ) : rows.length ? (
            rows.map((player) => {
              const payment = paymentByPlayer[player.id]
              const state = stateOf(payment)
              return (
                <article className="stable-pay-admin-row" key={player.id}>
                  <div className="stable-pay-person">
                    <b>{player.full_name}</b>
                    <small>{player.team ? `Equipo ${player.team}` : 'Sin equipo'}</small>
                    {payment?.validation_reason && <small>{payment.validation_reason}</small>}
                  </div>
                  <div className="stable-pay-fee">
                    <span>Cuota</span>
                    {role === 'super_admin' ? (
                      <select value={player.monthly_fee || 20000} onChange={(event) => updateFee(player.id, event.target.value)}>
                        {FEES.map((fee) => <option key={fee} value={fee}>{money(fee)}</option>)}
                      </select>
                    ) : (
                      <b>{money(player.monthly_fee)}</b>
                    )}
                  </div>
                  <b className={`stable-pay-state ${state.cls}`}>{state.label}</b>
                  <div className="stable-pay-row-actions">
                    {payment?.receipt_path ? (
                      <button type="button" onClick={() => openReceipt(payment.receipt_path, setMessage)}>👁 Ver</button>
                    ) : (
                      <span>Sin archivo</span>
                    )}
                    {role === 'super_admin' && payment?.receipt_path && ['manual_review', 'pending_validation', 'rejected'].includes(payment.validation_status) && (
                      <>
                        <button type="button" className="approve" disabled={reviewing === payment.id || bulkReviewing} onClick={() => reviewPayment(payment.id, 'validated')}>✓ Aprobar</button>
                        {payment.validation_status !== 'rejected' && (
                          <button type="button" className="reject" disabled={reviewing === payment.id || bulkReviewing} onClick={() => reviewPayment(payment.id, 'rejected')}>✕ Rechazar</button>
                        )}
                      </>
                    )}
                    {role === 'super_admin' && payment?.validation_status === 'validated' && (
                      <button type="button" className="revoke" disabled={reviewing === payment.id || bulkReviewing} onClick={() => revokePayment(payment.id, player.full_name)}>↩ Revocar aprobación</button>
                    )}
                  </div>
                </article>
              )
            })
          ) : (
            <p>No hay registros para este filtro.</p>
          )}
        </div>
      </div>
    </section>
  )
}

export default function AdminPaymentsPage() {
  const [role, setRole] = useState('')
  const [open, setOpen] = useState(false)
  const [host, setHost] = useState(null)

  const isAdmin = role === 'admin' || role === 'super_admin'

  useEffect(() => {
    let alive = true

    async function resolveRole() {
      const { data } = await supabase.auth.getUser()
      const user = data?.user
      if (!alive || !user) {
        if (alive) setRole('')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (alive) setRole(profile?.role || '')
    }

    resolveRole()
    const { data } = supabase.auth.onAuthStateChange(() => setTimeout(resolveRole, 0))
    return () => {
      alive = false
      data?.subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const handleOpen = () => {
      if (isAdmin) setOpen(true)
    }
    window.addEventListener('mgsm:open-payments-page', handleOpen)
    return () => window.removeEventListener('mgsm:open-payments-page', handleOpen)
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) {
      setOpen(false)
      setHost(null)
      return undefined
    }

    let createdHost = null
    let frame = 0

    const sync = () => {
      frame = 0
      const content = document.querySelector('main.app .content-inner')
      if (!content) {
        setHost((current) => (current?.isConnected ? current : null))
        return
      }

      let pageHost = content.querySelector(':scope > [data-admin-payments-page-host]')
      if (!pageHost) {
        pageHost = document.createElement('div')
        pageHost.setAttribute('data-admin-payments-page-host', 'true')
        content.appendChild(pageHost)
        createdHost = pageHost
      }
      setHost((current) => (current === pageHost ? current : pageHost))
    }

    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(sync)
    }

    sync()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      setHost(null)
      if (createdHost?.isConnected) createdHost.remove()
    }
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return undefined

    const closeFromOtherTab = (event) => {
      const button = event.target?.closest?.('main.app > nav button, main.app nav button')
      if (!button || button.classList.contains('mgsm-payment-nav-tab')) return
      setOpen(false)
    }

    document.addEventListener('click', closeFromOtherTab, true)
    return () => document.removeEventListener('click', closeFromOtherTab, true)
  }, [isAdmin])

  useEffect(() => {
    const content = host?.parentElement
    const nav = document.querySelector('main.app > nav, main.app nav')
    const paymentButton = nav?.querySelector('.mgsm-payment-nav-tab')

    if (!content || !nav || !paymentButton) return undefined

    if (open) {
      content.dataset.paymentsPageOpen = 'true'
      nav.dataset.paymentsOpen = 'true'
      paymentButton.classList.add('active')
      paymentButton.setAttribute('aria-current', 'page')
    } else {
      delete content.dataset.paymentsPageOpen
      delete nav.dataset.paymentsOpen
      paymentButton.classList.remove('active')
      paymentButton.removeAttribute('aria-current')
    }

    return () => {
      delete content.dataset.paymentsPageOpen
      delete nav.dataset.paymentsOpen
      paymentButton.classList.remove('active')
      paymentButton.removeAttribute('aria-current')
    }
  }, [host, open])

  if (!isAdmin || !host || !open) return null

  return createPortal(<AdminPaymentsContent role={role} />, host)
}

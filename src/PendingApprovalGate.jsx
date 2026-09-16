import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function PendingApprovalGate() {
  const [state, setState] = useState(null)

  useEffect(() => {
    let alive = true

    async function check() {
      const { data } = await supabase.auth.getUser()
      const user = data?.user
      if (!alive || !user) {
        if (alive) setState(null)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role,active,approval_status,full_name')
        .eq('id', user.id)
        .maybeSingle()

      if (!alive || !profile) return
      if (profile.approval_status === 'approved' && profile.active) {
        setState(null)
        return
      }

      setState({
        status: profile.approval_status || 'pending',
        role: profile.role || 'player',
        name: profile.full_name || user.email || '',
      })
    }

    check()
    const { data } = supabase.auth.onAuthStateChange(() => setTimeout(check, 0))
    return () => {
      alive = false
      data?.subscription?.unsubscribe()
    }
  }, [])

  if (!state) return null

  const rejected = state.status === 'rejected'
  const professor = state.role === 'pending_admin'

  return (
    <div className="pending-approval-gate" role="dialog" aria-modal="true" aria-label="Acceso pendiente de aprobación">
      <section className="pending-approval-card">
        <div className="pending-approval-icon">{rejected ? '✕' : '⏳'}</div>
        <h1>{rejected ? 'Solicitud no aprobada' : 'Cuenta pendiente de aprobación'}</h1>
        <p className="pending-approval-name">{state.name}</p>
        <p>
          {rejected
            ? 'Tu cuenta no fue aprobada para ingresar al sistema. Si creés que se trata de un error, comunicate con un responsable del vóley del Polideportivo.'
            : professor
              ? 'Tu correo ya puede estar verificado, pero el acceso de Profe se habilita únicamente cuando el Super Administrador confirma que pertenecés al cuerpo de Profes.'
              : 'Tu cuenta fue creada correctamente. Un Profe autorizado o el Super Administrador debe confirmar que sos Jugador@ del Polideportivo antes de habilitar el acceso.'}
        </p>
        {!rejected && <strong className="pending-approval-note">No necesitás crear otra cuenta. Esperá la aprobación y luego ingresá normalmente.</strong>}
        <button type="button" onClick={() => supabase.auth.signOut()}>Salir</button>
      </section>
    </div>
  )
}

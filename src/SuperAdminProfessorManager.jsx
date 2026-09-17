import { useEffect } from 'react'
import { supabase } from './supabase'

export default function SuperAdminProfessorManager() {
  useEffect(() => {
    let cancelled = false
    let observer = null
    let frame = 0
    let professors = []

    const findProfessorSection = () => Array.from(document.querySelectorAll('main.app .content-inner > section'))
      .find((section) => section.querySelector('.page-title h1')?.textContent?.trim() === 'Profes')

    const render = () => {
      frame = 0
      if (cancelled || !professors.length) return
      const section = findProfessorSection()
      if (!section) return

      const rows = Array.from(section.querySelectorAll('.admin-list .admin-row'))
      const unused = [...professors]
      rows.forEach((row) => {
        if (row.querySelector('[data-superadmin-professor-management]')) return
        const name = row.querySelector('b')?.textContent?.trim() || ''
        const matchIndex = unused.findIndex((item) => (item.full_name || 'Profe') === name)
        if (matchIndex < 0) return
        const [professor] = unused.splice(matchIndex, 1)

        const badge = row.querySelector('.team-badge')
        if (badge) badge.textContent = professor.active === false ? 'INACTIVO' : 'ACTIVO'

        const block = document.createElement('div')
        block.dataset.superadminProfessorManagement = 'true'
        block.className = 'superadmin-professor-management'

        const email = document.createElement('div')
        email.className = 'superadmin-professor-email'
        const emailLabel = document.createElement('b')
        emailLabel.textContent = 'Correo de cuenta'
        const emailValue = document.createElement('span')
        emailValue.textContent = professor.email || 'Sin correo asociado'
        email.append(emailLabel, emailValue)

        const edit = document.createElement('button')
        edit.type = 'button'
        edit.className = 'superadmin-professor-edit'
        edit.textContent = '✏️ Modificar'
        edit.addEventListener('click', () => openEditor(professor))

        block.append(email, edit)
        row.appendChild(block)
      })
    }

    const scheduleRender = () => {
      if (frame || cancelled) return
      frame = requestAnimationFrame(render)
    }

    const openEditor = (professor) => {
      document.querySelector('[data-superadmin-professor-modal]')?.remove()
      const overlay = document.createElement('div')
      overlay.className = 'modal'
      overlay.dataset.superadminProfessorModal = 'true'

      const card = document.createElement('div')
      card.className = 'modal-card superadmin-professor-modal-card'
      const head = document.createElement('div')
      head.className = 'modal-head'
      const title = document.createElement('h2')
      title.textContent = 'Modificar Profe'
      const closeButton = document.createElement('button')
      closeButton.type = 'button'
      closeButton.textContent = '×'
      head.append(title, closeButton)
      card.appendChild(head)

      const form = document.createElement('form')
      const nameLabel = document.createElement('label')
      nameLabel.textContent = 'Nombre y apellido'
      const nameInput = document.createElement('input')
      nameInput.required = true
      nameInput.value = professor.full_name || ''
      nameLabel.appendChild(nameInput)

      const accountEmailLabel = document.createElement('label')
      accountEmailLabel.textContent = 'Correo de cuenta'
      const emailInput = document.createElement('input')
      emailInput.type = 'email'
      emailInput.readOnly = true
      emailInput.value = professor.email || ''
      accountEmailLabel.appendChild(emailInput)
      const emailHelp = document.createElement('small')
      emailHelp.textContent = 'El correo de acceso se muestra como dato de la cuenta y no se modifica desde esta ficha.'
      accountEmailLabel.appendChild(emailHelp)

      const activeLabel = document.createElement('label')
      activeLabel.className = 'superadmin-professor-active'
      const activeInput = document.createElement('input')
      activeInput.type = 'checkbox'
      activeInput.checked = professor.active !== false
      activeLabel.append(activeInput, document.createTextNode(' Cuenta activa'))

      const message = document.createElement('div')
      message.className = 'message superadmin-professor-message'
      message.hidden = true

      const actions = document.createElement('div')
      actions.className = 'form-actions'
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.textContent = 'Cancelar'
      const save = document.createElement('button')
      save.type = 'submit'
      save.className = 'primary'
      save.textContent = 'Guardar cambios'
      actions.append(cancel, save)

      form.append(nameLabel, accountEmailLabel, activeLabel, message, actions)
      card.appendChild(form)
      overlay.appendChild(card)
      document.body.appendChild(overlay)

      const close = () => overlay.remove()
      closeButton.addEventListener('click', close)
      cancel.addEventListener('click', close)
      overlay.addEventListener('click', (event) => { if (event.target === overlay) close() })

      form.addEventListener('submit', async (event) => {
        event.preventDefault()
        const nextName = nameInput.value.trim()
        if (!nextName) return
        save.disabled = true
        save.textContent = 'Guardando...'
        message.hidden = true

        const { error } = await supabase.rpc('superadmin_update_professor', {
          p_professor_id: professor.professor_id,
          p_full_name: nextName,
          p_active: activeInput.checked,
        })

        if (error) {
          message.textContent = error.message || 'No se pudieron guardar los cambios.'
          message.hidden = false
          save.disabled = false
          save.textContent = 'Guardar cambios'
          return
        }

        professor.full_name = nextName
        professor.active = activeInput.checked
        const row = Array.from(document.querySelectorAll('.admin-list .admin-row'))
          .find((item) => item.querySelector('[data-superadmin-professor-management] .superadmin-professor-email span')?.textContent === (professor.email || 'Sin correo asociado'))
        if (row) {
          const rowTitle = row.querySelector('b')
          if (rowTitle) rowTitle.textContent = nextName
          const rowBadge = row.querySelector('.team-badge')
          if (rowBadge) rowBadge.textContent = activeInput.checked ? 'ACTIVO' : 'INACTIVO'
        }
        close()
      })
    }

    async function load() {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData?.user
      if (!user || cancelled) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role,active,approval_status')
        .eq('id', user.id)
        .maybeSingle()

      if (cancelled || profile?.role !== 'super_admin' || !profile?.active || profile?.approval_status !== 'approved') return

      const { data, error } = await supabase.rpc('get_superadmin_professor_accounts')
      if (cancelled || error) return
      professors = Array.isArray(data) ? data : []

      render()
      observer = new MutationObserver(scheduleRender)
      observer.observe(document.body, { childList: true, subtree: true })
    }

    load()

    return () => {
      cancelled = true
      observer?.disconnect()
      if (frame) cancelAnimationFrame(frame)
      document.querySelectorAll('[data-superadmin-professor-management]').forEach((node) => node.remove())
      document.querySelector('[data-superadmin-professor-modal]')?.remove()
    }
  }, [])

  return null
}

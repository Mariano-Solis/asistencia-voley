import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

/* =========================================================
   CONFIGURACIÓN
========================================================= */

const STATUS = {
  present: {
    label: 'Presente',
    icon: '✓',
  },
  late: {
    label: 'Tarde',
    icon: '◷',
  },
  absent: {
    label: 'Ausente',
    icon: '✕',
  },
}

const ACTIVITY_TYPES = {
  training: {
    label: 'Entrenamiento',
    icon: '🏐',
  },
  match: {
    label: 'Partido',
    icon: '🏆',
  },
  tournament: {
    label: 'Torneo',
    icon: '🥇',
  },
}

const today = () =>
  new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Argentina/Mendoza',
  })

function generateCode() {
  const letters = Math.random()
    .toString(36)
    .substring(2, 6)
    .toUpperCase()

  const numbers = Math.floor(
    1000 + Math.random() * 9000
  )

  return `${letters}-${numbers}`
}


/* =========================================================
   LOGIN
========================================================= */

function Login({
  onAdminLogin,
  onPlayerLogin,
}) {
  const [mode, setMode] = useState('player')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()

    setLoading(true)
    setMessage('')

    try {
      if (mode === 'player') {
        const {
          data,
          error,
        } = await supabase.rpc(
          'player_login',
          {
            p_name: name.trim(),
            p_code: code.trim().toUpperCase(),
          }
        )

        if (error) {
          throw error
        }

        if (!data?.ok) {
          throw new Error(
            data?.message ||
              'Nombre o código incorrectos.'
          )
        }

        onPlayerLogin({
          id: data.id,
          name: data.full_name,
          code: code.trim().toUpperCase(),
          category_id: data.category_id,
          category_name: data.category_name,
        })

        return
      }

      const {
        data,
        error,
      } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        })

      if (error) {
        throw error
      }

      onAdminLogin(data.session)

    } catch (error) {
      setMessage(
        error.message ||
          'Ocurrió un error.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth">
      <section className="auth-card">

        <div className="ball">
          🏐
        </div>

        <h1>
          Asistencia Vóley
        </h1>

        <p>
          {mode === 'player'
            ? 'Ingresá con tu nombre y código personal.'
            : 'Acceso del administrador.'}
        </p>

        <form onSubmit={handleSubmit}>

          {mode === 'player' ? (
            <>
              <input
                required
                placeholder="Nombre y apellido"
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
              />

              <input
                required
                placeholder="Código personal"
                value={code}
                onChange={(event) =>
                  setCode(
                    event.target.value.toUpperCase()
                  )
                }
              />

              <button disabled={loading}>
                {loading
                  ? 'Ingresando...'
                  : 'Ingresar'}
              </button>
            </>
          ) : (
            <>
              <input
                required
                type="email"
                placeholder="Correo del administrador"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
              />

              <input
                required
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
              />

              <button disabled={loading}>
                {loading
                  ? 'Ingresando...'
                  : 'Ingresar como administrador'}
              </button>
            </>
          )}

        </form>

        {message && (
          <div className="message">
            {message}
          </div>
        )}

        <button
          className="link-btn"
          onClick={() => {
            setMode(
              mode === 'player'
                ? 'admin'
                : 'player'
            )

            setMessage('')
          }}
        >
          {mode === 'player'
            ? 'Soy administrador'
            : 'Volver al acceso de jugadoras'}
        </button>

      </section>
    </main>
  )
}


/* =========================================================
   BOTONES DE ASISTENCIA
========================================================= */

function StatusButton({
  value,
  onChange,
}) {
  return (
    <div className="status-picker">

      {Object.entries(STATUS).map(
        ([key, item]) => (
          <button
            key={key}
            type="button"
            className={
              value === key
                ? `status ${key} active`
                : `status ${key}`
            }
            onClick={() =>
              onChange(key)
            }
          >
            <span>
              {item.icon}
            </span>

            <small>
              {item.label}
            </small>
          </button>
        )
      )}

    </div>
  )
}


/* =========================================================
   SELECTOR DE ACTIVIDAD
========================================================= */

function ActivityPicker({
  value,
  onChange,
}) {
  return (
    <div className="activity-picker">

      {Object.entries(
        ACTIVITY_TYPES
      ).map(
        ([key, item]) => (
          <button
            key={key}
            type="button"
            className={
              value === key
                ? 'active'
                : ''
            }
            onClick={() =>
              onChange(key)
            }
          >
            {item.icon}{' '}
            {item.label}
          </button>
        )
      )}

    </div>
  )
}


/* =========================================================
   ADMIN - ASISTENCIA
========================================================= */

function AdminHome({
  profile,
  players,
  categories,
}) {
  const [date, setDate] =
    useState(today())

  const [categoryId, setCategoryId] =
    useState(
      categories[0]?.id || ''
    )

  const [activityType, setActivityType] =
    useState('training')

  const [attendance, setAttendance] =
    useState({})

  const [loading, setLoading] =
    useState(false)

  const [message, setMessage] =
    useState('')

  useEffect(() => {
    if (
      categories.length > 0 &&
      !categories.some(
        (category) =>
          category.id === categoryId
      )
    ) {
      setCategoryId(
        categories[0].id
      )
    }
  }, [
    categories,
    categoryId,
  ])

  const categoryPlayers =
    useMemo(
      () =>
        players.filter(
          (player) =>
            player.category_id ===
            categoryId
        ),
      [
        players,
        categoryId,
      ]
    )

  useEffect(() => {
    async function loadAttendance() {
      if (
        !date ||
        !categoryId ||
        !activityType
      ) {
        setAttendance({})
        return
      }

      setMessage('')

      const {
        data: session,
        error: sessionError,
      } =
        await supabase
          .from(
            'training_sessions'
          )
          .select('id')
          .eq(
            'session_date',
            date
          )
          .eq(
            'category_id',
            categoryId
          )
          .eq(
            'activity_type',
            activityType
          )
          .maybeSingle()

      if (sessionError) {
        setMessage(
          sessionError.message
        )

        setAttendance({})
        return
      }

      if (!session) {
        setAttendance({})
        return
      }

      const {
        data,
        error,
      } =
        await supabase
          .from('attendance')
          .select(
            'player_id,status'
          )
          .eq(
            'session_id',
            session.id
          )

      if (error) {
        setMessage(
          error.message
        )

        return
      }

      setAttendance(
        Object.fromEntries(
          (data || []).map(
            (item) => [
              item.player_id,
              item.status,
            ]
          )
        )
      )
    }

    loadAttendance()
  }, [
    date,
    categoryId,
    activityType,
  ])

  async function saveAttendance() {
    if (!categoryId) {
      setMessage(
        'Seleccioná una categoría.'
      )
      return
    }

    if (!activityType) {
      setMessage(
        'Seleccioná una actividad.'
      )
      return
    }

    setLoading(true)
    setMessage('')

    try {
      let {
        data: session,
        error,
      } =
        await supabase
          .from(
            'training_sessions'
          )
          .select('*')
          .eq(
            'session_date',
            date
          )
          .eq(
            'category_id',
            categoryId
          )
          .eq(
            'activity_type',
            activityType
          )
          .maybeSingle()

      if (error) {
        throw error
      }

      if (!session) {
        const result =
          await supabase
            .from(
              'training_sessions'
            )
            .insert({
              session_date: date,
              created_by:
                profile.id,
              activity_type:
                activityType,
              category_id:
                categoryId,
            })
            .select()
            .single()

        if (result.error) {
          throw result.error
        }

        session = result.data
      }

      const rows =
        categoryPlayers
          .filter(
            (player) =>
              attendance[player.id]
          )
          .map(
            (player) => ({
              session_id:
                session.id,
              player_id:
                player.id,
              status:
                attendance[
                  player.id
                ],
            })
          )

      if (rows.length > 0) {
        const result =
          await supabase
            .from('attendance')
            .upsert(
              rows,
              {
                onConflict:
                  'session_id,player_id',
              }
            )

        if (result.error) {
          throw result.error
        }
      }

      setMessage(
        '✓ Asistencia guardada correctamente.'
      )

    } catch (error) {
      setMessage(
        error.message
      )
    } finally {
      setLoading(false)
    }
  }

  const currentCategory =
    categories.find(
      (category) =>
        category.id === categoryId
    )

  return (
    <section>

      <div className="page-head">

        <div>
          <h2>
            Tomar asistencia
          </h2>

          <p>
            Seleccioná categoría y actividad.
          </p>
        </div>

        <input
          type="date"
          value={date}
          onChange={(event) =>
            setDate(event.target.value)
          }
        />

      </div>

      <div className="filter-box">

        <label>
          Categoría
        </label>

        <select
          value={categoryId}
          onChange={(event) =>
            setCategoryId(
              event.target.value
            )
          }
        >
          {categories.map(
            (category) => (
              <option
                key={category.id}
                value={category.id}
              >
                {category.name}
              </option>
            )
          )}
        </select>

        <label>
          Actividad
        </label>

        <ActivityPicker
          value={activityType}
          onChange={(value) =>
            setActivityType(value)
          }
        />

      </div>

      {categoryPlayers.length === 0 ? (
        <div className="empty">
          No hay jugadoras en{' '}
          <b>
            {currentCategory?.name ||
              'esta categoría'}
          </b>.
          <br />
          Agregalas desde
          <b> Jugadoras</b>.
        </div>
      ) : (
        <div className="attendance-list">

          {categoryPlayers.map(
            (player) => (
              <div
                className="player-row"
                key={player.id}
              >

                <div className="avatar">
                  {player.full_name
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <div className="player-name">
                  {player.full_name}
                </div>

                <StatusButton
                  value={
                    attendance[
                      player.id
                    ]
                  }
                  onChange={(status) =>
                    setAttendance(
                      (current) => ({
                        ...current,
                        [player.id]:
                          status,
                      })
                    )
                  }
                />

              </div>
            )
          )}

        </div>
      )}

      {categoryPlayers.length > 0 && (
        <button
          className="save-btn"
          disabled={loading}
          onClick={
            saveAttendance
          }
        >
          {loading
            ? 'Guardando...'
            : 'Guardar asistencia'}
        </button>
      )}

      {message && (
        <div className="message">
          {message}
        </div>
      )}

    </section>
  )
}


/* =========================================================
   ADMIN - JUGADORAS
========================================================= */

function Players({
  players,
  categories,
  refresh,
}) {
  const [firstName, setFirstName] =
    useState('')

  const [lastName, setLastName] =
    useState('')

  const [categoryId, setCategoryId] =
    useState(
      categories[0]?.id || ''
    )

  const [newCode, setNewCode] =
    useState('')

  const [message, setMessage] =
    useState('')

  const [loading, setLoading] =
    useState(false)

  /* ---------------------------------------------
     EDICIÓN
  --------------------------------------------- */

  const [editingPlayer, setEditingPlayer] =
    useState(null)

  const [editFirstName, setEditFirstName] =
    useState('')

  const [editLastName, setEditLastName] =
    useState('')

  const [editCategoryId, setEditCategoryId] =
    useState('')

  const [editing, setEditing] =
    useState(false)

  useEffect(() => {
    if (
      categories.length > 0 &&
      !categories.some(
        (category) =>
          category.id === categoryId
      )
    ) {
      setCategoryId(
        categories[0].id
      )
    }
  }, [
    categories,
    categoryId,
  ])

  /* ---------------------------------------------
     AGREGAR JUGADORA
  --------------------------------------------- */

  async function addPlayer(event) {
    event.preventDefault()

    setLoading(true)
    setMessage('')

    try {
      const cleanFirstName =
        firstName.trim()

      const cleanLastName =
        lastName.trim()

      if (
        !cleanFirstName ||
        !cleanLastName
      ) {
        throw new Error(
          'Ingresá nombre y apellido.'
        )
      }

      if (!categoryId) {
        throw new Error(
          'Seleccioná una categoría.'
        )
      }

      const fullName =
        `${cleanLastName.toUpperCase()} ${cleanFirstName}`

      const code =
        generateCode()

      const {
        error,
      } =
        await supabase
          .from('players')
          .insert({
            full_name:
              fullName,
            access_code:
              code,
            category_id:
              categoryId,
            active: true,
          })

      if (error) {
        throw error
      }

      setFirstName('')
      setLastName('')
      setNewCode(code)

      await refresh()

    } catch (error) {
      setMessage(
        error.message
      )
    } finally {
      setLoading(false)
    }
  }

  /* ---------------------------------------------
     ABRIR EDICIÓN
  --------------------------------------------- */

  function startEdit(player) {
    const parts =
      player.full_name.trim().split(/\s+/)

    const last =
      parts.shift() || ''

    const first =
      parts.join(' ')

    setEditingPlayer(player)
    setEditLastName(last)
    setEditFirstName(first)
    setEditCategoryId(
      player.category_id || ''
    )
    setMessage('')
  }

  /* ---------------------------------------------
     CANCELAR EDICIÓN
  --------------------------------------------- */

  function cancelEdit() {
    setEditingPlayer(null)
    setEditFirstName('')
    setEditLastName('')
    setEditCategoryId('')
  }

  /* ---------------------------------------------
     GUARDAR EDICIÓN
  --------------------------------------------- */

  async function saveEdit(event) {
    event.preventDefault()

    if (!editingPlayer) {
      return
    }

    const cleanFirstName =
      editFirstName.trim()

    const cleanLastName =
      editLastName.trim()

    if (
      !cleanFirstName ||
      !cleanLastName
    ) {
      setMessage(
        'Ingresá nombre y apellido.'
      )
      return
    }

    if (!editCategoryId) {
      setMessage(
        'Seleccioná una categoría.'
      )
      return
    }

    setEditing(true)
    setMessage('')

    try {
      const fullName =
        `${cleanLastName.toUpperCase()} ${cleanFirstName}`

      const {
        error,
      } =
        await supabase
          .from('players')
          .update({
            full_name:
              fullName,
            category_id:
              editCategoryId,
          })
          .eq(
            'id',
            editingPlayer.id
          )

      if (error) {
        throw error
      }

      setMessage(
        '✓ Jugadora actualizada correctamente.'
      )

      cancelEdit()

      await refresh()

    } catch (error) {
      setMessage(
        error.message
      )
    } finally {
      setEditing(false)
    }
  }

  /* ---------------------------------------------
     ELIMINAR / DESACTIVAR
  --------------------------------------------- */

  async function deletePlayer(player) {
    const confirmed =
      window.confirm(
        `¿Seguro que querés eliminar a ${player.full_name}?\n\nSu historial de asistencias se conservará, pero dejará de aparecer entre las jugadoras activas.`
      )

    if (!confirmed) {
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const {
        error,
      } =
        await supabase
          .from('players')
          .update({
            active: false,
          })
          .eq(
            'id',
            player.id
          )

      if (error) {
        throw error
      }

      if (
        editingPlayer?.id ===
        player.id
      ) {
        cancelEdit()
      }

      setMessage(
        '✓ Jugadora eliminada correctamente.'
      )

      await refresh()

    } catch (error) {
      setMessage(
        error.message
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>

      <div className="page-head">

        <div>

          <h2>
            Jugadoras
          </h2>

          <p>
            Agregá, editá o eliminá jugadoras.
          </p>

        </div>

      </div>

      {/* -----------------------------------------
          AGREGAR
      ----------------------------------------- */}

      <form
        className="add-player"
        onSubmit={addPlayer}
      >

        <input
          required
          placeholder="Apellido"
          value={lastName}
          onChange={(event) =>
            setLastName(
              event.target.value
            )
          }
        />

        <input
          required
          placeholder="Nombre"
          value={firstName}
          onChange={(event) =>
            setFirstName(
              event.target.value
            )
          }
        />

        <select
          required
          value={categoryId}
          onChange={(event) =>
            setCategoryId(
              event.target.value
            )
          }
        >

          <option value="">
            Seleccionar categoría
          </option>

          {categories.map(
            (category) => (
              <option
                key={category.id}
                value={category.id}
              >
                {category.name}
              </option>
            )
          )}

        </select>

        <button
          disabled={loading}
        >
          {loading
            ? 'Agregando...'
            : '+ Agregar jugadora'}
        </button>

      </form>

      {/* -----------------------------------------
          CÓDIGO NUEVO
      ----------------------------------------- */}

      {newCode && (
        <div className="code-card">

          <b>
            ✓ Jugadora agregada
          </b>

          <span>
            Código personal:
          </span>

          <strong>
            {newCode}
          </strong>

          <small>
            Entregale este código a la jugadora.
          </small>

          <button
            onClick={() =>
              setNewCode('')
            }
          >
            Entendido
          </button>

        </div>
      )}

      {message && (
        <div className="message">
          {message}
        </div>
      )}

      {/* -----------------------------------------
          FORMULARIO EDITAR
      ----------------------------------------- */}

      {editingPlayer && (
        <div className="edit-player-card">

          <div className="page-head">
            <div>
              <h3>
                ✏️ Editar jugadora
              </h3>

              <p>
                Modificá sus datos y guardá los cambios.
              </p>
            </div>
          </div>

          <form
            className="add-player"
            onSubmit={saveEdit}
          >

            <input
              required
              placeholder="Apellido"
              value={editLastName}
              onChange={(event) =>
                setEditLastName(
                  event.target.value
                )
              }
            />

            <input
              required
              placeholder="Nombre"
              value={editFirstName}
              onChange={(event) =>
                setEditFirstName(
                  event.target.value
                )
              }
            />

            <select
              required
              value={editCategoryId}
              onChange={(event) =>
                setEditCategoryId(
                  event.target.value
                )
              }
            >

              <option value="">
                Seleccionar categoría
              </option>

              {categories.map(
                (category) => (
                  <option
                    key={category.id}
                    value={category.id}
                  >
                    {category.name}
                  </option>
                )
              )}

            </select>

            <button
              disabled={editing}
            >
              {editing
                ? 'Guardando...'
                : '✓ Guardar cambios'}
            </button>

            <button
              type="button"
              className="link-btn"
              onClick={
                cancelEdit
              }
            >
              Cancelar
            </button>

          </form>

        </div>
      )}

      {/* -----------------------------------------
          LISTA
      ----------------------------------------- */}

      <div className="simple-list">

        {players.map(
          (player) => {

            const category =
              categories.find(
                (item) =>
                  item.id ===
                  player.category_id
              )

            return (
              <div
                key={player.id}
                className="simple-row player-management-row"
              >

                <span className="avatar">
                  {player.full_name
                    .charAt(0)
                    .toUpperCase()}
                </span>

                <div className="player-info">

                  <b>
                    {player.full_name}
                  </b>

                  <small>
                    {category?.name ||
                      'Sin categoría'}
                  </small>

                </div>

                <div className="player-code">

                  <span>
                    Código
                  </span>

                  <strong>
                    {player.access_code}
                  </strong>

                </div>

                {/* BOTONES */}

                <div className="player-actions">

                  <button
                    type="button"
                    className="edit-btn"
                    onClick={() =>
                      startEdit(player)
                    }
                    disabled={loading}
                  >
                    ✏️ Editar
                  </button>

                  <button
                    type="button"
                    className="delete-btn"
                    onClick={() =>
                      deletePlayer(player)
                    }
                    disabled={loading}
                  >
                    🗑️ Eliminar
                  </button>

                </div>

              </div>
            )
          }
        )}

      </div>

    </section>
  )
}


/* =========================================================
   ADMIN - HISTORIAL
========================================================= */

function History({
  players,
  categories,
}) {
  const [sessions, setSessions] =
    useState([])

  const [selected, setSelected] =
    useState(null)

  const [rows, setRows] =
    useState([])

  const [categoryFilter, setCategoryFilter] =
    useState('all')

  useEffect(() => {
    async function loadSessions() {

      let query =
        supabase
          .from(
            'training_sessions'
          )
          .select(`
            *,
            categories (
              id,
              name
            )
          `)
          .order(
            'session_date',
            {
              ascending: false,
            }
          )

      if (
        categoryFilter !==
        'all'
      ) {
        query =
          query.eq(
            'category_id',
            categoryFilter
          )
      }

      const {
        data,
        error,
      } =
        await query

      if (!error) {
        setSessions(
          data || []
        )
      }
    }

    loadSessions()
  }, [
    categoryFilter,
  ])

  async function openSession(
    session
  ) {
    setSelected(session)

    const {
      data,
      error,
    } =
      await supabase
        .from('attendance')
        .select(
          'player_id,status'
        )
        .eq(
          'session_id',
          session.id
        )

    if (!error) {
      setRows(
        data || []
      )
    }
  }

  function playerName(id) {
    return (
      players.find(
        (player) =>
          player.id === id
      )?.full_name ||
      'Jugadora'
    )
  }

  function formatDate(value) {
    return new Date(
      value + 'T12:00:00'
    ).toLocaleDateString(
      'es-AR'
    )
  }

  return (
    <section>

      <div className="page-head">

        <div>

          <h2>
            Historial
          </h2>

          <p>
            Consultá las asistencias anteriores.
          </p>

        </div>

      </div>

      <div className="filter-box">

        <label>
          Filtrar por categoría
        </label>

        <select
          value={categoryFilter}
          onChange={(event) =>
            setCategoryFilter(
              event.target.value
            )
          }
        >

          <option value="all">
            Todas las categorías
          </option>

          {categories.map(
            (category) => (
              <option
                key={category.id}
                value={category.id}
              >
                {category.name}
              </option>
            )
          )}

        </select>

      </div>

      <div className="history-grid">

        <div className="sessions">

          {sessions.length === 0 ? (
            <div className="empty">
              No hay sesiones registradas.
            </div>
          ) : (
            sessions.map(
              (session) => (
                <button
                  key={session.id}
                  className={
                    selected?.id ===
                    session.id
                      ? 'session active'
                      : 'session'
                  }
                  onClick={() =>
                    openSession(
                      session
                    )
                  }
                >

                  <strong>
                    {formatDate(
                      session.session_date
                    )}
                  </strong>

                  <small>
                    {
                      ACTIVITY_TYPES[
                        session.activity_type
                      ]?.icon
                    }{' '}

                    {
                      ACTIVITY_TYPES[
                        session.activity_type
                      ]?.label ||
                      session.activity_type
                    }
                  </small>

                  <small>
                    {
                      session.categories?.name ||
                      'Sin categoría'
                    }
                  </small>

                </button>
              )
            )
          )}

        </div>

        <div className="history-detail">

          {!selected ? (
            'Elegí una fecha para ver la asistencia.'
          ) : (
            <>
              <h3>
                {formatDate(
                  selected.session_date
                )}
              </h3>

              <p>
                {
                  selected.categories?.name ||
                  'Sin categoría'
                }

                {' · '}

                {
                  ACTIVITY_TYPES[
                    selected.activity_type
                  ]?.label ||
                  selected.activity_type
                }
              </p>

              {rows.length === 0 ? (
                <div className="empty">
                  No hay asistencias cargadas.
                </div>
              ) : (
                <div className="simple-list">

                  {rows.map(
                    (row) => (
                      <div
                        className="simple-row"
                        key={
                          row.player_id
                        }
                      >

                        <b>
                          {playerName(
                            row.player_id
                          )}
                        </b>

                        <span
                          className={
                            `badge ${row.status}`
                          }
                        >
                          {
                            STATUS[
                              row.status
                            ]?.label ||
                            row.status
                          }
                        </span>

                      </div>
                    )
                  )}

                </div>
              )}

            </>
          )}

        </div>

      </div>

    </section>
  )
}


/* =========================================================
   JUGADORA
========================================================= */

function PlayerDashboard({
  player,
  onLogout,
}) {
  const [rows, setRows] =
    useState([])

  useEffect(() => {
    async function loadAttendance() {

      const {
        data,
        error,
      } = await supabase.rpc(
        'player_attendance',
        {
          p_name:
            player.name,

          p_code:
            player.code,
        }
      )

      if (!error) {
        setRows(
          data || []
        )
      }
    }

    loadAttendance()
  }, [
    player,
  ])

  const counts =
    useMemo(
      () => ({
        present:
          rows.filter(
            (row) =>
              row.status ===
              'present'
          ).length,

        late:
          rows.filter(
            (row) =>
              row.status ===
              'late'
          ).length,

        absent:
          rows.filter(
            (row) =>
              row.status ===
              'absent'
          ).length,
      }),
      [rows]
    )

  return (
    <main className="app">

      <header>

        <div className="brand">
          🏐 <span>Asistencia</span>
        </div>

        <button
          className="logout"
          onClick={onLogout}
        >
          Salir
        </button>

      </header>

      <div className="content">

        <section>

          <div className="page-head">

            <div>

              <h2>
                Mi asistencia
              </h2>

              <p>
                Hola, {player.name}.
              </p>

              {player.category_name && (
                <p>
                  Categoría:{' '}
                  <b>
                    {player.category_name}
                  </b>
                </p>
              )}

            </div>

          </div>

          <div className="stats">

            <div>
              <strong>
                {counts.present}
              </strong>

              <span>
                Presentes
              </span>
            </div>

            <div>
              <strong>
                {counts.late}
              </strong>

              <span>
                Tardanzas
              </span>
            </div>

            <div>
              <strong>
                {counts.absent}
              </strong>

              <span>
                Ausencias
              </span>
            </div>

          </div>

          <div className="simple-list">

            {rows.map(
              (row, index) => (
                <div
                  className="simple-row"
                  key={
                    row.session_id ||
                    index
                  }
                >

                  <div>

                    <b>
                      {new Date(
                        row.session_date +
                          'T12:00:00'
                      ).toLocaleDateString(
                        'es-AR'
                      )}
                    </b>

                    <small>
                      {
                        ACTIVITY_TYPES[
                          row.activity_type
                        ]?.icon
                      }{' '}

                      {
                        ACTIVITY_TYPES[
                          row.activity_type
                        ]?.label ||
                        ''
                      }
                    </small>

                  </div>

                  <span
                    className={
                      `badge ${row.status}`
                    }
                  >
                    {
                      STATUS[
                        row.status
                      ]?.label ||
                      row.status
                    }
                  </span>

                </div>
              )
            )}

          </div>

        </section>

      </div>

    </main>
  )
}


/* =========================================================
   APP PRINCIPAL
========================================================= */

function App() {

  const [session, setSession] =
    useState(null)

  const [profile, setProfile] =
    useState(null)

  const [players, setPlayers] =
    useState([])

  const [categories, setCategories] =
    useState([])

  const [tab, setTab] =
    useState('home')

  const [player, setPlayer] =
    useState(() => {

      try {
        return JSON.parse(
          localStorage.getItem(
            'voley_player'
          ) || 'null'
        )
      } catch {
        return null
      }

    })

  /* ---------------------------------------------
     CARGAR ADMIN
  --------------------------------------------- */

  async function loadAdmin(user) {

    const {
      data: profileData,
      error: profileError,
    } =
      await supabase
        .from('profiles')
        .select('*')
        .eq(
          'id',
          user.id
        )
        .single()

    if (profileError) {
      console.error(
        profileError
      )

      return
    }

    setProfile(
      profileData
    )

    if (
      profileData?.role ===
      'admin'
    ) {

      const {
        data: categoryData,
        error: categoryError,
      } =
        await supabase
          .from('categories')
          .select('*')
          .order('name')

      if (categoryError) {
        console.error(
          categoryError
        )
      } else {
        setCategories(
          categoryData || []
        )
      }

      const {
        data: playerData,
        error: playerError,
      } =
        await supabase
          .from('players')
          .select('*')
          .eq(
            'active',
            true
          )
          .order(
            'full_name'
          )

      if (playerError) {
        console.error(
          playerError
        )
      } else {
        setPlayers(
          playerData || []
        )
      }
    }
  }

  /* ---------------------------------------------
     SESIÓN ADMIN
  --------------------------------------------- */

  useEffect(() => {

    if (!supabase) {
      return
    }

    supabase.auth
      .getSession()
      .then(
        ({
          data,
        }) => {

          setSession(
            data.session
          )

          if (
            data.session
          ) {
            loadAdmin(
              data.session.user
            )
          }

        }
      )

    const {
      data: {
        subscription,
      },
    } =
      supabase.auth
        .onAuthStateChange(
          (
            _event,
            newSession
          ) => {

            setSession(
              newSession
            )

            if (
              newSession
            ) {
              loadAdmin(
                newSession.user
              )
            } else {

              setProfile(
                null
              )

              setPlayers(
                []
              )

              setCategories(
                []
              )
            }

          }
        )

    return () =>
      subscription.unsubscribe()

  }, [])

  /* ---------------------------------------------
     SUPABASE NO CONECTADO
  --------------------------------------------- */

  if (!supabase) {

    return (
      <main className="auth">

        <section className="auth-card">

          <div className="ball">
            🏐
          </div>

          <h1>
            Falta conectar Supabase
          </h1>

          <p>
            Revisá tu archivo .env
          </p>

        </section>

      </main>
    )
  }

  /* ---------------------------------------------
     JUGADORA
  --------------------------------------------- */

  if (
    player &&
    !session
  ) {

    return (
      <PlayerDashboard
        player={player}
        onLogout={() => {

          localStorage.removeItem(
            'voley_player'
          )

          setPlayer(
            null
          )

        }}
      />
    )
  }

  /* ---------------------------------------------
     LOGIN
  --------------------------------------------- */

  if (
    !session ||
    !profile
  ) {

    return (
      <Login
        onAdminLogin={(
          newSession
        ) =>
          setSession(
            newSession
          )
        }

        onPlayerLogin={(
          newPlayer
        ) => {

          localStorage.setItem(
            'voley_player',
            JSON.stringify(
              newPlayer
            )
          )

          setPlayer(
            newPlayer
          )

        }}
      />
    )
  }

  /* ---------------------------------------------
     ADMIN
  --------------------------------------------- */

  const refresh =
    () =>
      loadAdmin(
        session.user
      )

  const logout =
    () =>
      supabase.auth.signOut()

  return (
    <main className="app">

      <header>

        <div className="brand">
          🏐 <span>Asistencia</span>
        </div>

        <button
          className="logout"
          onClick={
            logout
          }
        >
          Salir
        </button>

      </header>

      <nav>

        <button
          className={
            tab === 'home'
              ? 'active'
              : ''
          }
          onClick={() =>
            setTab('home')
          }
        >
          Asistencia
        </button>

        <button
          className={
            tab === 'players'
              ? 'active'
              : ''
          }
          onClick={() =>
            setTab('players')
          }
        >
          Jugadoras
        </button>

        <button
          className={
            tab === 'history'
              ? 'active'
              : ''
          }
          onClick={() =>
            setTab('history')
          }
        >
          Historial
        </button>

      </nav>

      <div className="content">

        {tab === 'home' && (
          <AdminHome
            profile={profile}
            players={players}
            categories={categories}
          />
        )}

        {tab === 'players' && (
          <Players
            players={players}
            categories={categories}
            refresh={refresh}
          />
        )}

        {tab === 'history' && (
          <History
            players={players}
            categories={categories}
          />
        )}

      </div>

    </main>
  )
}


export default App
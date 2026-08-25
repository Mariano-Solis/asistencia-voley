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

function normalizeGender(value) {
  const normalized = String(value || '').trim().toLowerCase()

  if (
    [
      'female',
      'femenino',
      'femenina',
      'mujer',
      'mujeres',
      'f',
    ].includes(normalized)
  ) {
    return 'female'
  }

  return 'male'
}

function genderLabel(category) {
  return normalizeGender(category?.gender) === 'female'
    ? 'Jugadora'
    : 'Jugador'
}

function genderGroupLabel(gender) {
  return gender === 'female' ? 'Femenino' : 'Masculino'
}

function categorySort(a, b) {
  return String(a?.name || '').localeCompare(
    String(b?.name || ''),
    'es',
    {
      numeric: true,
      sensitivity: 'base',
    }
  )
}

function categoriesByGender(categories) {
  return {
    male: [...categories]
      .filter(
        (category) =>
          normalizeGender(category.gender) === 'male'
      )
      .sort(categorySort),

    female: [...categories]
      .filter(
        (category) =>
          normalizeGender(category.gender) === 'female'
      )
      .sort(categorySort),
  }
}

function hasCategoryPermission(
  profile,
  category,
  permissions,
  action = 'view'
) {
  if (!profile || !category) return false

  if (profile.role === 'super_admin') return true

  if (category.admin_id === profile.id) return true

  const permission = permissions?.[category.id]

  return action === 'edit'
    ? Boolean(permission?.can_edit)
    : Boolean(permission?.can_view)
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

        if (error) throw error

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

      if (error) throw error

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
  permissions,
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

  const editableCategories = useMemo(
    () =>
      categories.filter((category) =>
        hasCategoryPermission(
          profile,
          category,
          permissions,
          'edit'
        )
      ),
    [categories, profile, permissions]
  )

  useEffect(() => {
    if (
      editableCategories.length > 0 &&
      !editableCategories.some(
        (category) =>
          category.id === categoryId
      )
    ) {
      setCategoryId(
        editableCategories[0].id
      )
    }

    if (
      editableCategories.length === 0
    ) {
      setCategoryId('')
    }
  }, [
    editableCategories,
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

      if (error) throw error

      if (!session) {
        const result =
          await supabase
            .from(
              'training_sessions'
            )
            .insert({
              session_date:
                date,
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
            setDate(
              event.target.value
            )
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
          {editableCategories.map(
            (category) => (
              <option
                key={category.id}
                value={category.id}
              >
                {genderGroupLabel(
                  normalizeGender(
                    category.gender
                  )
                )}{' '}
                · {category.name}
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
          No hay jugadores/as en{' '}
          <b>
            {currentCategory?.name ||
              'esta categoría'}
          </b>.
          <br />
          Agregalos desde
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

function CategoryPicker({
  categories,
  value,
  onChange,
  disabled = false,
}) {
  const groups =
    categoriesByGender(categories)

  const selected =
    categories.find(
      (category) =>
        category.id === value
    )

  return (
    <div className="category-picker">

      <div className="category-picker-current">

        {selected ? (
          <>
            <span>
              {genderGroupLabel(
                normalizeGender(
                  selected.gender
                )
              )}
            </span>

            <strong>
              {selected.name}
            </strong>
          </>
        ) : (
          <span>
            Seleccionar rama y categoría
          </span>
        )}

      </div>

      <div className="category-picker-groups">

        {['male', 'female'].map(
          (gender) => (
            <details
              key={gender}
              open={groups[gender].some(
                (category) =>
                  category.id === value
              )}
            >

              <summary>
                <strong>
                  {genderGroupLabel(
                    gender
                  )}
                </strong>

                <small>
                  {groups[gender].length}{' '}
                  categorías
                </small>
              </summary>

              <div className="category-picker-options">

                {groups[gender].length === 0 ? (
                  <div className="category-picker-empty">
                    No hay categorías disponibles.
                  </div>
                ) : (
                  groups[gender].map(
                    (category) => (
                      <button
                        key={category.id}
                        type="button"
                        disabled={disabled}
                        className={
                          value ===
                          category.id
                            ? 'selected'
                            : ''
                        }
                        onClick={() =>
                          onChange(
                            category.id
                          )
                        }
                      >
                        {category.name}
                      </button>
                    )
                  )
                )}

              </div>

            </details>
          )
        )}

      </div>

    </div>
  )
}

function Players({
  profile,
  players,
  categories,
  permissions,
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

  const [genderFilter, setGenderFilter] =
    useState('all')

  const [categoryFilter, setCategoryFilter] =
    useState('all')

  const [search, setSearch] =
    useState('')

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

  const playerCategories =
    useMemo(() => {
      return categories.filter(
        (category) =>
          hasCategoryPermission(
            profile,
            category,
            permissions,
            'view'
          )
      )
    }, [
      categories,
      profile,
      permissions,
    ])

  const editableCategories =
    useMemo(() => {
      return categories.filter(
        (category) =>
          hasCategoryPermission(
            profile,
            category,
            permissions,
            'edit'
          )
      )
    }, [
      categories,
      profile,
      permissions,
    ])

  useEffect(() => {
    if (
      editableCategories.length > 0 &&
      !editableCategories.some(
        (category) =>
          category.id === categoryId
      )
    ) {
      setCategoryId(
        editableCategories[0].id
      )
    }

    if (
      editableCategories.length === 0
    ) {
      setCategoryId('')
    }
  }, [
    editableCategories,
    categoryId,
  ])

  const visiblePlayers =
    useMemo(() => {
      const query =
        search.trim().toLowerCase()

      return players.filter(
        (player) => {
          const category =
            categories.find(
              (item) =>
                item.id ===
                player.category_id
            )

          if (!category) return false

          if (
            !hasCategoryPermission(
              profile,
              category,
              permissions,
              'view'
            )
          ) {
            return false
          }

          if (
            genderFilter !== 'all' &&
            normalizeGender(
              category.gender
            ) !== genderFilter
          ) {
            return false
          }

          if (
            categoryFilter !== 'all' &&
            player.category_id !==
              categoryFilter
          ) {
            return false
          }

          if (
            query &&
            !player.full_name
              .toLowerCase()
              .includes(query)
          ) {
            return false
          }

          return true
        }
      )
    }, [
      players,
      categories,
      profile,
      permissions,
      genderFilter,
      categoryFilter,
      search,
    ])

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

  function startEdit(player) {
    const parts =
      player.full_name
        .trim()
        .split(/\s+/)

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

  function cancelEdit() {
    setEditingPlayer(null)
    setEditFirstName('')
    setEditLastName('')
    setEditCategoryId('')
  }

  async function saveEdit(event) {
    event.preventDefault()

    if (!editingPlayer) return

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

    if (
      !editCategoryId ||
      !editableCategories.some(
        (category) =>
          category.id ===
          editCategoryId
      )
    ) {
      setMessage(
        'Seleccioná una categoría que tengas habilitada para editar.'
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

      if (error) throw error

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

  async function deletePlayer(player) {
    const confirmed =
      window.confirm(
        `¿Seguro que querés eliminar a ${player.full_name}?\n\nSu historial de asistencias se conservará, pero dejará de aparecer entre las jugadoras activas.`
      )

    if (!confirmed) return

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

      if (error) throw error

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
            Jugadores y jugadoras
          </h2>

          <p>
            Agregá, editá o eliminá jugadores y jugadoras.
          </p>

        </div>

      </div>

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

        <CategoryPicker
          categories={
            editableCategories
          }
          value={categoryId}
          onChange={
            setCategoryId
          }
          disabled={loading}
        />

        <button
          disabled={loading}
        >
          {loading
            ? 'Agregando...'
            : '+ Agregar jugadora'}
        </button>

      </form>

      {newCode && (
        <div className="code-card">

          <b>
            ✓{' '}
            {
              genderLabel(
                categories.find(
                  (category) =>
                    category.id ===
                    categoryId
                )
              ) ===
              'Jugadora'
                ? 'Jugadora agregada'
                : 'Jugador agregado'
            }
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

            <CategoryPicker
              categories={
                editableCategories
              }
              value={
                editCategoryId
              }
              onChange={
                setEditCategoryId
              }
              disabled={editing}
            />

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

      <div className="player-filters">

        <div className="player-filter-search">

          <label>
            Buscar jugador/a
          </label>

          <input
            type="search"
            placeholder="Nombre y apellido"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
          />

        </div>

        <div>

          <label>
            Rama
          </label>

          <select
            value={genderFilter}
            onChange={(event) => {
              setGenderFilter(
                event.target.value
              )

              setCategoryFilter(
                'all'
              )
            }}
          >

            <option value="all">
              Todas
            </option>

            <option value="male">
              Masculino
            </option>

            <option value="female">
              Femenino
            </option>

          </select>

        </div>

        <div>

          <label>
            Categoría
          </label>

          <select
            value={
              categoryFilter
            }
            onChange={(event) =>
              setCategoryFilter(
                event.target.value
              )
            }
          >

            <option value="all">
              Todas
            </option>

            {playerCategories
              .filter(
                (category) =>
                  genderFilter ===
                    'all' ||
                  normalizeGender(
                    category.gender
                  ) ===
                    genderFilter
              )
              .sort(categorySort)
              .map(
                (category) => (
                  <option
                    key={
                      category.id
                    }
                    value={
                      category.id
                    }
                  >
                    {
                      genderGroupLabel(
                        normalizeGender(
                          category.gender
                        )
                      )
                    }{' '}
                    · {category.name}
                  </option>
                )
              )}

          </select>

        </div>

      </div>

      <div className="simple-list">

        {visiblePlayers.length === 0 ? (
          <div className="empty">
            No hay jugadores/as que coincidan con los filtros.
          </div>
        ) : (
          visiblePlayers.map(
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
                      {category
                        ? `${genderLabel(category)} · ${genderGroupLabel(normalizeGender(category.gender))} · ${category.name}`
                        : 'Sin categoría'}
                    </small>

                  </div>

                  <div className="player-code">

                    <span>
                      Código de ingreso
                    </span>

                    <strong>
                      {player.access_code}
                    </strong>

                  </div>

                  <div className="player-actions">

                    <button
                      type="button"
                      className="edit-btn"
                      onClick={() =>
                        startEdit(
                          player
                        )
                      }
                      disabled={
                        loading ||
                        !hasCategoryPermission(
                          profile,
                          category,
                          permissions,
                          'edit'
                        )
                      }
                      title={
                        !hasCategoryPermission(
                          profile,
                          category,
                          permissions,
                          'edit'
                        )
                          ? 'No tenés permiso para editar esta categoría'
                          : 'Editar'
                      }
                    >
                      <span aria-hidden="true">
                        ✏️
                      </span>

                      <span>
                        Modificar
                      </span>
                    </button>

                    <button
                      type="button"
                      className="delete-btn"
                      onClick={() =>
                        deletePlayer(
                          player
                        )
                      }
                      disabled={
                        loading ||
                        !hasCategoryPermission(
                          profile,
                          category,
                          permissions,
                          'edit'
                        )
                      }
                      title={
                        !hasCategoryPermission(
                          profile,
                          category,
                          permissions,
                          'edit'
                        )
                          ? 'No tenés permiso para eliminar esta categoría'
                          : 'Eliminar'
                      }
                    >
                      <span aria-hidden="true">
                        🗑️
                      </span>

                      <span>
                        Eliminar
                      </span>
                    </button>

                  </div>

                </div>
              )
            }
          )
        )}

      </div>

    </section>
  )
}

/* =========================================================
   PERMISOS
========================================================= */

function Permissions({
  profile,
  categories,
}) {
  const [admins, setAdmins] =
    useState([])

  const [permissions, setPermissions] =
    useState({})

  const [selectedAdmin, setSelectedAdmin] =
    useState('')

  const [loading, setLoading] =
    useState(false)

  const [message, setMessage] =
    useState('')

  const groups =
    categoriesByGender(categories)

  useEffect(() => {
    async function load() {

      setMessage('')

      const {
        data: adminData,
        error: adminError,
      } =
        await supabase
          .from('profiles')
          .select(
            'id, full_name, role'
          )
          .eq(
            'role',
            'admin'
          )
          .order(
            'full_name'
          )

      if (adminError) {
        setMessage(
          adminError.message
        )
        return
      }

      setAdmins(
        adminData || []
      )

      if (
        !selectedAdmin &&
        adminData?.length
      ) {
        setSelectedAdmin(
          adminData[0].id
        )
      }

      const {
        data: permissionData,
        error: permissionError,
      } =
        await supabase
          .from(
            'admin_category_permissions'
          )
          .select(
            'admin_id, category_id, can_view, can_edit'
          )

      if (permissionError) {
        setMessage(
          permissionError.message
        )
        return
      }

      const map = {}

      ;(permissionData || [])
        .forEach(
          (item) => {
            map[
              `${item.admin_id}:${item.category_id}`
            ] = item
          }
        )

      setPermissions(map)
    }

    load()
  }, [
    selectedAdmin,
  ])

  if (
    profile?.role !==
    'super_admin'
  ) {
    return null
  }

  const currentPermission =
    (categoryId) =>
      permissions[
        `${selectedAdmin}:${categoryId}`
      ] || {
        can_view: false,
        can_edit: false,
      }

  async function savePermission(
    category,
    field,
    value
  ) {
    if (!selectedAdmin) return

    const current =
      currentPermission(
        category.id
      )

    const next = {
      can_view:
        field ===
        'can_view'
          ? value
          : current.can_view,

      can_edit:
        field ===
        'can_edit'
          ? value
          : current.can_edit,
    }

    if (next.can_edit) {
      next.can_view = true
    }

    setLoading(true)
    setMessage('')

    try {

      if (
        !next.can_view &&
        !next.can_edit
      ) {

        const {
          error,
        } =
          await supabase
            .from(
              'admin_category_permissions'
            )
            .delete()
            .eq(
              'admin_id',
              selectedAdmin
            )
            .eq(
              'category_id',
              category.id
            )

        if (error) throw error

        setPermissions(
          (currentMap) => {
            const copy = {
              ...currentMap,
            }

            delete copy[
              `${selectedAdmin}:${category.id}`
            ]

            return copy
          }
        )

      } else {

        const {
          data,
          error,
        } =
          await supabase
            .from(
              'admin_category_permissions'
            )
            .upsert(
              {
                admin_id:
                  selectedAdmin,

                category_id:
                  category.id,

                can_view:
                  next.can_view,

                can_edit:
                  next.can_edit,
              },
              {
                onConflict:
                  'admin_id,category_id',
              }
            )
            .select(
              'admin_id, category_id, can_view, can_edit'
            )
            .single()

        if (error) throw error

        setPermissions(
          (currentMap) => ({
            ...currentMap,

            [
              `${selectedAdmin}:${category.id}`
            ]:
              data,
          })
        )
      }

      setMessage(
        '✓ Permiso actualizado.'
      )

    } catch (error) {
      setMessage(
        error.message
      )
    } finally {
      setLoading(false)
    }
  }

  function renderGroup(gender) {

    return (
      <div
        className="permission-group"
        key={gender}
      >

        <div className="permission-group-head">

          <strong>
            {genderGroupLabel(
              gender
            )}
          </strong>

        </div>

        {groups[gender].length === 0 ? (
          <div className="empty">
            No hay categorías.
          </div>
        ) : (
          groups[gender].map(
            (category) => {

              const permission =
                currentPermission(
                  category.id
                )

              const owned =
                category.admin_id ===
                selectedAdmin

              return (
                <div
                  className="permission-row"
                  key={
                    category.id
                  }
                >

                  <div>

                    <b>
                      {category.name}
                    </b>

                    {owned && (
                      <small>
                        Asignada directamente a este administrador
                      </small>
                    )}

                  </div>

                  <label className="permission-check">

                    <input
                      type="checkbox"
                      checked={
                        owned ||
                        permission.can_view
                      }
                      disabled={
                        owned ||
                        loading
                      }
                      onChange={(
                        event
                      ) =>
                        savePermission(
                          category,
                          'can_view',
                          event.target.checked
                        )
                      }
                    />

                    <span>
                      Ver
                    </span>

                  </label>

                  <label className="permission-check">

                    <input
                      type="checkbox"
                      checked={
                        owned ||
                        permission.can_edit
                      }
                      disabled={
                        owned ||
                        loading
                      }
                      onChange={(
                        event
                      ) =>
                        savePermission(
                          category,
                          'can_edit',
                          event.target.checked
                        )
                      }
                    />

                    <span>
                      Editar
                    </span>

                  </label>

                </div>
              )
            }
          )
        )}

      </div>
    )
  }

  return (
    <section>

      <div className="page-head">

        <div>

          <h2>
            Permisos de administradores
          </h2>

          <p>
            Elegí qué ramas y categorías puede ver o editar cada administrador.
          </p>

        </div>

      </div>

      <div className="filter-box permission-admin-picker">

        <label>
          Administrador
        </label>

        <select
          value={selectedAdmin}
          onChange={(event) =>
            setSelectedAdmin(
              event.target.value
            )
          }
        >

          <option value="">
            Seleccionar administrador
          </option>

          {admins.map(
            (admin) => (
              <option
                key={admin.id}
                value={admin.id}
              >
                {admin.full_name ||
                  'Administrador sin nombre'}
              </option>
            )
          )}

        </select>

      </div>

      {!selectedAdmin ? (
        <div className="empty">
          No hay administradores para configurar.
        </div>
      ) : (
        <div className="permissions-grid">
          {renderGroup('male')}
          {renderGroup('female')}
        </div>
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

  /* -------------------------------------------------------
     EDICIÓN DE FECHA
  ------------------------------------------------------- */

  const [editingDate, setEditingDate] =
    useState(false)

  const [newDate, setNewDate] =
    useState('')

  const [savingDate, setSavingDate] =
    useState(false)

  const [message, setMessage] =
    useState('')

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
      } else {
        setMessage(
          error.message
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

    setSelected(
      session
    )

    setEditingDate(false)

    setNewDate(
      session.session_date || ''
    )

    setMessage('')

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
    } else {
      setRows([])
      setMessage(
        error.message
      )
    }
  }

  function startEditDate() {
    if (!selected) return

    setNewDate(
      selected.session_date || ''
    )

    setEditingDate(true)
    setMessage('')
  }

  function cancelEditDate() {
    setEditingDate(false)

    setNewDate(
      selected?.session_date || ''
    )

    setMessage('')
  }

  async function saveDate() {
    if (!selected) return

    if (!newDate) {
      setMessage(
        'Seleccioná una fecha.'
      )
      return
    }

    if (
      newDate ===
      selected.session_date
    ) {
      setEditingDate(false)

      setMessage(
        'La fecha no fue modificada.'
      )

      return
    }

    setSavingDate(true)
    setMessage('')

    try {
      const {
        data,
        error,
      } =
        await supabase
          .from(
            'training_sessions'
          )
          .update({
            session_date:
              newDate,
          })
          .eq(
            'id',
            selected.id
          )
          .select(`
            *,
            categories (
              id,
              name
            )
          `)
          .single()

      if (error) {
        throw error
      }

      setSelected(data)

      setSessions(
        (current) =>
          current
            .map(
              (session) =>
                session.id ===
                data.id
                  ? data
                  : session
            )
            .sort(
              (a, b) =>
                String(
                  b.session_date
                ).localeCompare(
                  String(
                    a.session_date
                  )
                )
            )
      )

      setNewDate(
        data.session_date
      )

      setEditingDate(false)

      setMessage(
        '✓ Fecha actualizada correctamente.'
      )

    } catch (error) {
      setMessage(
        error.message ||
          'No se pudo actualizar la fecha.'
      )
    } finally {
      setSavingDate(false)
    }
  }

  function playerName(id) {
    return (
      players.find(
        (player) =>
          player.id === id
      )?.full_name ||
      'Jugador/a'
    )
  }

  function formatDate(value) {
    if (!value) return ''

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
          onChange={(event) => {
            setCategoryFilter(
              event.target.value
            )

            setSelected(null)
            setRows([])
            setEditingDate(false)
          }}
        >

          <option value="all">
            Todas las categorías
          </option>

          {categories.map(
            (category) => (
              <option
                key={category.id}
                value={
                  category.id
                }
              >
                {genderGroupLabel(
                  normalizeGender(
                    category.gender
                  )
                )}{' '}
                · {category.name}
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
                  key={
                    session.id
                  }
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
                      session
                        .categories
                        ?.name ||
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

              <div className="history-detail-head">

                <div>

                  <h3>
                    {formatDate(
                      selected.session_date
                    )}
                  </h3>

                  <p>

                    {
                      selected
                        .categories
                        ?.name ||
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

                </div>

                {!editingDate && (
                  <button
                    type="button"
                    className="date-edit-btn"
                    onClick={
                      startEditDate
                    }
                    title="Modificar fecha"
                  >
                    <span aria-hidden="true">
                      ✏️
                    </span>

                    <span>
                      Modificar
                    </span>
                  </button>
                )}

              </div>

              {editingDate && (
                <div className="date-editor">

                  <div className="date-editor-title">

                    <span>
                      📅
                    </span>

                    <div>

                      <strong>
                        Cambiar fecha
                      </strong>

                      <small>
                        Elegí la nueva fecha del entrenamiento.
                      </small>

                    </div>

                  </div>

                  <div className="date-editor-controls">

                    <input
                      type="date"
                      value={
                        newDate
                      }
                      onChange={(
                        event
                      ) =>
                        setNewDate(
                          event.target
                            .value
                        )
                      }
                      disabled={
                        savingDate
                      }
                    />

                    <button
                      type="button"
                      className="date-save-btn"
                      onClick={
                        saveDate
                      }
                      disabled={
                        savingDate
                      }
                    >
                      {savingDate
                        ? 'Guardando...'
                        : '✓ Guardar'}
                    </button>

                    <button
                      type="button"
                      className="date-cancel-btn"
                      onClick={
                        cancelEditDate
                      }
                      disabled={
                        savingDate
                      }
                    >
                      Cancelar
                    </button>

                  </div>

                </div>
              )}

              {message && (
                <div className="message">
                  {message}
                </div>
              )}

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
      } =
        await supabase.rpc(
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
          onClick={
            onLogout
          }
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
                    {
                      player.category_name
                    }
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

  const [categoryPermissions, setCategoryPermissions] =
    useState({})

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
      ![
        'admin',
        'super_admin',
      ].includes(
        profileData?.role
      )
    ) {
      setCategories([])
      setPlayers([])
      setCategoryPermissions({})
      return
    }

    const {
      data: categoryData,
      error: categoryError,
    } =
      await supabase
        .from('categories')
        .select('*')
        .eq(
          'active',
          true
        )
        .order(
          'gender'
        )
        .order(
          'name'
        )

    if (categoryError) {
      console.error(
        categoryError
      )
      return
    }

    let permissionMap = {}

    if (
      profileData.role !==
      'super_admin'
    ) {

      const {
        data: permissionData,
        error: permissionError,
      } =
        await supabase
          .from(
            'admin_category_permissions'
          )
          .select(
            'category_id, can_view, can_edit'
          )
          .eq(
            'admin_id',
            profileData.id
          )

      if (permissionError) {
        console.error(
          permissionError
        )
      } else {

        ;(
          permissionData ||
          []
        ).forEach(
          (item) => {

            permissionMap[
              item.category_id
            ] = {
              can_view:
                Boolean(
                  item.can_view
                ),

              can_edit:
                Boolean(
                  item.can_edit
                ),
            }

          }
        )

      }
    }

    setCategoryPermissions(
      permissionMap
    )

    const visibleCategories =
      (
        categoryData ||
        []
      ).filter(
        (category) =>
          hasCategoryPermission(
            profileData,
            category,
            permissionMap,
            'view'
          )
      )

    setCategories(
      visibleCategories
    )

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
          'last_name'
        )
        .order(
          'first_name'
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

              setCategoryPermissions(
                {}
              )

            }

          }
        )

    return () =>
      subscription.unsubscribe()

  }, [])

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

        {profile.role ===
          'super_admin' && (
          <button
            className={
              tab ===
              'permissions'
                ? 'active'
                : ''
            }
            onClick={() =>
              setTab(
                'permissions'
              )
            }
          >
            Permisos
          </button>
        )}

      </nav>

      <div className="content">

        {tab === 'home' && (
          <AdminHome
            profile={profile}
            players={players}
            categories={categories}
            permissions={
              categoryPermissions
            }
          />
        )}

        {tab === 'players' && (
          <Players
            profile={profile}
            players={players}
            categories={categories}
            permissions={
              categoryPermissions
            }
            refresh={refresh}
          />
        )}

        {tab === 'history' && (
          <History
            players={players}
            categories={categories}
          />
        )}

        {tab ===
          'permissions' &&
          profile.role ===
            'super_admin' && (
          <Permissions
            profile={profile}
            categories={
              categories
            }
          />
        )}

      </div>

    </main>
  )
}

export default App
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const APP_NAME = "Municipalidad de San Martín - VOLEY";
const APP_TAGLINE = "#VamosElPoli";

const STATUS = {
  present: { label: "Presente", icon: "✓" },
  late: { label: "Tarde", icon: "◷" },
  absent: { label: "Ausente", icon: "✕" },
};

const ACTIVITY_TYPES = {
  training: { label: "Entrenamiento", icon: "🏐" },
  match: { label: "Partido", icon: "🏆" },
  tournament: { label: "Torneo", icon: "🥇" },
};

const today = () =>
  new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Mendoza",
  });

const clean = (value) => String(value ?? "").trim();

function normalizeGender(value) {
  return ["female", "femenino", "femenina", "mujer", "mujeres", "f"].includes(
    clean(value).toLowerCase(),
  )
    ? "female"
    : "male";
}

function genderLabel(category) {
  return normalizeGender(category?.gender) === "female"
    ? "Jugadora"
    : "Jugador";
}

function genderGroupLabel(gender) {
  return gender === "female" ? "Femenino" : "Masculino";
}

function categorySort(a, b) {
  return clean(a?.name).localeCompare(clean(b?.name), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function categoriesByGender(categories) {
  return {
    male: [...categories]
      .filter((c) => normalizeGender(c.gender) === "male")
      .sort(categorySort),
    female: [...categories]
      .filter((c) => normalizeGender(c.gender) === "female")
      .sort(categorySort),
  };
}

function hasCategoryPermission(
  profile,
  category,
  permissions,
  action = "view",
) {
  if (!profile || !category) return false;
  if (profile.role === "super_admin") return true;
  if (category.admin_id === profile.id) return true;
  const p = permissions?.[category.id];
  return action === "edit" ? Boolean(p?.can_edit) : Boolean(p?.can_view);
}

function errorText(error) {
  return error?.message || "Ocurrió un error.";
}

function formatDate(value) {
  return value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("es-AR")
    : "—";
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("No se pudo copiar el texto.");
}

async function shareText({ title, text }) {
  if (navigator.share) {
    await navigator.share({ title, text });
    return "shared";
  }
  await copyText(text);
  return "copied";
}

function parseTournamentDates(value, fallbackStart, fallbackEnd) {
  const dates = Array.isArray(value) ? value : [];
  const normalized = dates.map(String).filter(Boolean).sort();
  if (normalized.length) return normalized;
  return [fallbackStart, fallbackEnd]
    .filter(Boolean)
    .filter((date, index, list) => list.indexOf(date) === index);
}

function sessionVenue(session) {
  return session?.activity_type === "tournament"
    ? session.tournament_location || session.event_location || ""
    : session?.event_location || "";
}

function sessionTournamentDates(session) {
  return parseTournamentDates(
    session?.tournament_dates,
    session?.tournament_start_date ||
      session?.event_start_date ||
      session?.session_date,
    session?.tournament_end_date ||
      session?.event_end_date ||
      session?.session_date,
  );
}

function Login({ onAdminLogin, onPlayerLogin }) {
  const [mode, setMode] = useState("player");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      if (mode === "player") {
        const { data, error } = await supabase.rpc("player_login", {
          p_name: name.trim(),
          p_code: code.trim().toUpperCase(),
        });
        if (error) throw error;
        if (!data?.ok)
          throw new Error(data?.message || "Nombre o código incorrectos.");
        onPlayerLogin({
          id: data.id,
          name: data.full_name,
          code: code.trim().toUpperCase(),
          category_id: data.category_id,
          category_name: data.category_name,
        });
      } else if (mode === "admin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        onAdminLogin(data.session);
      } else {
        if (!clean(fullName)) throw new Error("Ingresá tu nombre y apellido.");
        if (password.length < 6)
          throw new Error("La contraseña debe tener al menos 6 caracteres.");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim(), role: "admin" } },
        });
        if (error) throw error;
        if (data.session) {
          onAdminLogin(data.session);
        } else {
          setMessage(
            "✓ Cuenta creada. Revisá tu correo si Supabase solicita confirmar la cuenta y luego ingresá como administrador.",
          );
          setMode("admin");
        }
      }
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth">
      <section className="auth-card">
        <div className="ball">🏐</div>
        <h1>{APP_NAME}</h1>
        <p className="brand-tagline">{APP_TAGLINE}</p>
        <p>
          {mode === "player"
            ? "Ingresá con tu nombre y código personal."
            : mode === "admin"
              ? "Acceso para profes y administradores."
              : "Creá tu cuenta de profe sin depender del super administrador."}
        </p>
        <form onSubmit={submit}>
          {mode === "player" && (
            <>
              <input
                required
                placeholder="Nombre y apellido"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                required
                placeholder="Código personal"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              <button disabled={loading}>
                {loading ? "Ingresando..." : "Ingresar"}
              </button>
            </>
          )}
          {mode === "admin" && (
            <>
              <input
                required
                type="email"
                placeholder="Correo de la profe"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                required
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button disabled={loading}>
                {loading ? "Ingresando..." : "Ingresar como profe"}
              </button>
            </>
          )}
          {mode === "signup" && (
            <>
              <input
                required
                placeholder="Nombre y apellido"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <input
                required
                type="email"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                required
                type="password"
                minLength={6}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button disabled={loading}>
                {loading ? "Creando cuenta..." : "Crear cuenta de profe"}
              </button>
            </>
          )}
        </form>
        {message && <div className="message">{message}</div>}
        {mode !== "signup" && (
          <button
            className="link-btn"
            onClick={() => {
              setMode("signup");
              setMessage("");
            }}
          >
            Soy profe y quiero crear mi cuenta
          </button>
        )}
        {mode === "signup" && (
          <button
            className="link-btn"
            onClick={() => {
              setMode("admin");
              setMessage("");
            }}
          >
            Ya tengo cuenta · Ingresar
          </button>
        )}
        {mode !== "player" && mode !== "signup" && (
          <button
            className="link-btn"
            onClick={() => {
              setMode("player");
              setMessage("");
            }}
          >
            Volver al acceso de Jugador@s
          </button>
        )}
      </section>
    </main>
  );
}

function StatusButton({ value, onChange }) {
  return (
    <div className="status-picker">
      {Object.entries(STATUS).map(([key, item]) => (
        <button
          key={key}
          type="button"
          className={`status ${key} ${value === key ? "active" : ""}`}
          onClick={() => onChange(key)}
        >
          <span>{item.icon}</span>
          <small>{item.label}</small>
        </button>
      ))}
    </div>
  );
}

function ActivityPicker({ value, onChange }) {
  return (
    <div className="activity-picker">
      {Object.entries(ACTIVITY_TYPES).map(([key, item]) => (
        <button
          key={key}
          type="button"
          className={value === key ? "active" : ""}
          onClick={() => onChange(key)}
        >
          {item.icon} {item.label}
        </button>
      ))}
    </div>
  );
}

function CategoryPicker({ categories, value, onChange, disabled = false }) {
  const groups = categoriesByGender(categories);
  const selectedGender = normalizeGender(
    categories.find((c) => c.id === value)?.gender,
  );
  const [openGender, setOpenGender] = useState(
    value && groups[selectedGender]?.some((c) => c.id === value)
      ? selectedGender
      : null,
  );

  return (
    <div className="category-picker">
      <div className="category-picker-current">
        {value ? (
          <>
            <span>{genderGroupLabel(selectedGender)}</span>
            <strong>{categories.find((c) => c.id === value)?.name}</strong>
          </>
        ) : (
          <span>Seleccionar categoría</span>
        )}
      </div>
      <div className="category-picker-groups">
        {["female", "male"].map((gender) => (
          <details key={gender} open={openGender === gender}>
            <summary
              onClick={(event) => {
                event.preventDefault();
                setOpenGender((current) =>
                  current === gender ? null : gender,
                );
              }}
            >
              <strong>{genderGroupLabel(gender)}</strong>
            </summary>
            <div className="category-picker-options">
              {groups[gender].map((category) => (
                <button
                  type="button"
                  key={category.id}
                  disabled={disabled}
                  className={value === category.id ? "selected" : ""}
                  onClick={() => {
                    onChange(category.id);
                    setOpenGender(gender);
                  }}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function Attendance({ profile, players, categories, permissions, refresh }) {
  const editableCategories = useMemo(
    () =>
      categories.filter((c) =>
        hasCategoryPermission(profile, c, permissions, "edit"),
      ),
    [categories, profile, permissions],
  );
  const [date, setDate] = useState(today());
  const [categoryId, setCategoryId] = useState(editableCategories[0]?.id || "");
  const [activityType, setActivityType] = useState("training");
  const [attendance, setAttendance] = useState({});
  const [details, setDetails] = useState({
    opponent: "",
    matchLocation: "",
    location: "",
    startDate: today(),
    endDate: today(),
    tournamentDates: [today()],
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!editableCategories.some((c) => c.id === categoryId))
      setCategoryId(editableCategories[0]?.id || "");
  }, [editableCategories, categoryId]);

  const categoryPlayers = useMemo(
    () => players.filter((p) => p.category_id === categoryId),
    [players, categoryId],
  );

  useEffect(() => {
    async function load() {
      if (!date || !categoryId || !activityType) return;
      const { data, error } = await supabase
        .from("training_sessions")
        .select("*")
        .eq("session_date", date)
        .eq("category_id", categoryId)
        .eq("activity_type", activityType)
        .maybeSingle();
      if (error) {
        setMessage(errorText(error));
        return;
      }
      if (!data) {
        setAttendance({});
        setDetails({
          opponent: "",
          matchLocation: "",
          location: "",
          startDate: date,
          endDate: date,
          tournamentDates: [date],
        });
        return;
      }
      const { data: rows, error: rowError } = await supabase
        .from("attendance")
        .select("player_id,status")
        .eq("session_id", data.id);
      if (rowError) {
        setMessage(errorText(rowError));
        return;
      }
      setAttendance(
        Object.fromEntries((rows || []).map((r) => [r.player_id, r.status])),
      );
      const startDate =
        data.tournament_start_date || data.event_start_date || date;
      const endDate = data.tournament_end_date || data.event_end_date || date;
      setDetails({
        opponent: data.opponent || "",
        matchLocation:
          data.activity_type === "match" ? data.event_location || "" : "",
        location: sessionVenue(data),
        startDate,
        endDate,
        tournamentDates: parseTournamentDates(
          data.tournament_dates,
          startDate,
          endDate,
        ),
      });
    }
    load();
  }, [date, categoryId, activityType]);

  async function save() {
    if (!categoryId) return setMessage("Seleccioná una categoría.");
    setLoading(true);
    setMessage("");
    try {
      const tournamentDates = parseTournamentDates(
        details.tournamentDates,
        details.startDate || date,
        details.endDate || date,
      );
      const payload = {
        session_date: date,
        created_by: profile.id,
        activity_type: activityType,
        category_id: categoryId,
        opponent:
          activityType === "match" ? clean(details.opponent) || null : null,
        event_location:
          activityType === "match"
            ? clean(details.matchLocation) || null
            : activityType === "tournament"
              ? clean(details.location) || null
              : null,
        event_start_date:
          activityType === "tournament" ? details.startDate || date : null,
        event_end_date:
          activityType === "tournament" ? details.endDate || date : null,
        tournament_location:
          activityType === "tournament"
            ? clean(details.location) || null
            : null,
        tournament_start_date:
          activityType === "tournament" ? details.startDate || date : null,
        tournament_end_date:
          activityType === "tournament" ? details.endDate || date : null,
        tournament_dates:
          activityType === "tournament" ? tournamentDates : null,
      };
      let { data: session, error } = await supabase
        .from("training_sessions")
        .select("*")
        .eq("session_date", date)
        .eq("category_id", categoryId)
        .eq("activity_type", activityType)
        .maybeSingle();
      if (error) throw error;
      if (session) {
        const result = await supabase
          .from("training_sessions")
          .update(payload)
          .eq("id", session.id)
          .select()
          .single();
        if (result.error) throw result.error;
        session = result.data;
      } else {
        const result = await supabase
          .from("training_sessions")
          .insert(payload)
          .select()
          .single();
        if (result.error) throw result.error;
        session = result.data;
      }
      const rows = categoryPlayers
        .filter((p) => attendance[p.id])
        .map((p) => ({
          session_id: session.id,
          player_id: p.id,
          status: attendance[p.id],
        }));
      if (rows.length) {
        const result = await supabase
          .from("attendance")
          .upsert(rows, { onConflict: "session_id,player_id" });
        if (result.error) throw result.error;
      }
      const selectedIds = new Set(rows.map((r) => r.player_id));
      const existing = await supabase
        .from("attendance")
        .select("player_id")
        .eq("session_id", session.id);
      if (existing.error) throw existing.error;
      const stale = (existing.data || [])
        .filter((r) => !selectedIds.has(r.player_id))
        .map((r) => r.player_id);
      if (stale.length) {
        const result = await supabase
          .from("attendance")
          .delete()
          .eq("session_id", session.id)
          .in("player_id", stale);
        if (result.error) throw result.error;
      }
      setMessage("✓ Registro guardado correctamente.");
      await refresh();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Tomar asistencia</h2>
          <p>Creá o modificá entrenamientos, partidos y torneos.</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="filter-box">
        <label>Categoría</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          {editableCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {genderGroupLabel(normalizeGender(c.gender))} · {c.name}
            </option>
          ))}
        </select>
        <label>Actividad</label>
        <ActivityPicker value={activityType} onChange={setActivityType} />
        {activityType === "match" && (
          <div className="event-extra event-grid">
            <div>
              <label>Rival</label>
              <input
                placeholder="Ej.: Club Mendoza"
                value={details.opponent}
                onChange={(e) =>
                  setDetails((d) => ({ ...d, opponent: e.target.value }))
                }
              />
            </div>
            <div>
              <label>Lugar</label>
              <input
                placeholder="Ej.: Polideportivo"
                value={details.matchLocation}
                onChange={(e) =>
                  setDetails((d) => ({ ...d, matchLocation: e.target.value }))
                }
              />
            </div>
          </div>
        )}
        {activityType === "tournament" && (
          <div className="event-extra event-grid">
            <div>
              <label>Lugar</label>
              <input
                placeholder="Ej.: Polideportivo"
                value={details.location}
                onChange={(e) =>
                  setDetails((d) => ({ ...d, location: e.target.value }))
                }
              />
            </div>
            <div>
              <label>Desde</label>
              <input
                type="date"
                value={details.startDate}
                onChange={(e) =>
                  setDetails((d) => ({ ...d, startDate: e.target.value }))
                }
              />
            </div>
            <div>
              <label>Hasta</label>
              <input
                type="date"
                value={details.endDate}
                onChange={(e) =>
                  setDetails((d) => ({ ...d, endDate: e.target.value }))
                }
              />
            </div>
            <div className="tournament-dates">
              <label>Fechas adicionales</label>
              <div>
                {details.tournamentDates.map((value, index) => (
                  <div className="date-row" key={`${value}-${index}`}>
                    <input
                      type="date"
                      value={value}
                      onChange={(e) =>
                        setDetails((d) => ({
                          ...d,
                          tournamentDates: d.tournamentDates.map(
                            (item, itemIndex) =>
                              itemIndex === index ? e.target.value : item,
                          ),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="mini-delete"
                      aria-label="Quitar fecha"
                      onClick={() =>
                        setDetails((d) => ({
                          ...d,
                          tournamentDates: d.tournamentDates.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        }))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="add-date-btn"
                onClick={() =>
                  setDetails((d) => ({
                    ...d,
                    tournamentDates: [
                      ...d.tournamentDates,
                      d.endDate || d.startDate || date,
                    ],
                  }))
                }
              >
                + Agregar fecha
              </button>
            </div>
          </div>
        )}
      </div>
      {!categoryPlayers.length ? (
        <div className="empty">
          No hay{" "}
          {normalizeGender(
            categories.find((c) => c.id === categoryId)?.gender,
          ) === "female"
            ? "jugadoras"
            : "jugadores"}{" "}
          en esta categoría.
        </div>
      ) : (
        <div className="attendance-list">
          {categoryPlayers.map((p) => (
            <div className="player-row" key={p.id}>
              <div className="avatar">
                {p.full_name?.charAt(0)?.toUpperCase()}
              </div>
              <div className="player-name">{p.full_name}</div>
              <StatusButton
                value={attendance[p.id]}
                onChange={(status) =>
                  setAttendance((a) => ({ ...a, [p.id]: status }))
                }
              />
            </div>
          ))}
        </div>
      )}
      {!!categoryPlayers.length && (
        <button className="save-btn" disabled={loading} onClick={save}>
          {loading ? "Guardando..." : "Guardar / modificar registro"}
        </button>
      )}
      {message && <div className="message">{message}</div>}
    </section>
  );
}

function Players({ profile, players, categories, permissions, refresh }) {
  const editableCategories = useMemo(
    () =>
      categories.filter((c) =>
        hasCategoryPermission(profile, c, permissions, "edit"),
      ),
    [categories, profile, permissions],
  );
  const visibleCategories = useMemo(
    () =>
      categories.filter((c) =>
        hasCategoryPermission(profile, c, permissions, "view"),
      ),
    [categories, profile, permissions],
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [categoryId, setCategoryId] = useState(editableCategories[0]?.id || "");
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!editableCategories.some((c) => c.id === categoryId))
      setCategoryId(editableCategories[0]?.id || "");
  }, [editableCategories, categoryId]);
  const visiblePlayers = players.filter((p) => {
    const c = categories.find((x) => x.id === p.category_id);
    if (!c || !hasCategoryPermission(profile, c, permissions, "view"))
      return false;
    return (
      (!search || p.full_name.toLowerCase().includes(search.toLowerCase())) &&
      (categoryFilter === "all" || p.category_id === categoryFilter)
    );
  });
  async function add(event) {
    event.preventDefault();
    if (!categoryId) return setMessage("Seleccioná una categoría.");
    setLoading(true);
    try {
      const full_name = `${lastName.trim().toUpperCase()} ${firstName.trim()}`;
      const access_code = `${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const { error } = await supabase
        .from("players")
        .insert({
          full_name,
          access_code,
          category_id: categoryId,
          active: true,
        });
      if (error) throw error;
      setFirstName("");
      setLastName("");
      setMessage(
        `✓ ${genderLabel(categories.find((c) => c.id === categoryId))} agregad${normalizeGender(categories.find((c) => c.id === categoryId)?.gender) === "female" ? "a" : "o"}.`,
      );
      await refresh();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  function startEdit(p) {
    const parts = p.full_name.trim().split(/\s+/);
    setEditLast(parts.shift() || "");
    setEditFirst(parts.join(" "));
    setEditCategory(p.category_id);
    setEditingPlayer(p);
  }
  async function saveEdit(e) {
    e.preventDefault();
    if (!editingPlayer) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("players")
        .update({
          full_name: `${editLast.trim().toUpperCase()} ${editFirst.trim()}`,
          category_id: editCategory,
        })
        .eq("id", editingPlayer.id);
      if (error) throw error;
      setEditingPlayer(null);
      setMessage(
        `✓ ${genderLabel(categories.find((c) => c.id === editCategory))} modificad${normalizeGender(categories.find((c) => c.id === editCategory)?.gender) === "female" ? "a" : "o"}.`,
      );
      await refresh();
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setLoading(false);
    }
  }
  async function remove(p) {
    if (!window.confirm(`¿Eliminar a ${p.full_name}?`)) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("players")
        .update({ active: false })
        .eq("id", p.id);
      if (error) throw error;
      setMessage(
        `✓ ${genderLabel(categories.find((c) => c.id === p.category_id))} eliminad${normalizeGender(categories.find((c) => c.id === p.category_id)?.gender) === "female" ? "a" : "o"}.`,
      );
      await refresh();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  async function copyPlayerCode(p) {
    try {
      await copyText(p.access_code);
      setMessage(`✓ Código de ${p.full_name} copiado.`);
    } catch (e) {
      setMessage(errorText(e));
    }
  }
  async function sharePlayer(p) {
    const text = `${APP_NAME}\n${APP_TAGLINE}\n\nJugador@: ${p.full_name}\nCódigo personal: ${p.access_code}`;
    try {
      const result = await shareText({
        title: `${APP_NAME} · Código de ingreso`,
        text,
      });
      setMessage(
        result === "copied"
          ? "✓ Datos copiados. Podés pegarlos donde quieras compartirlos."
          : "",
      );
    } catch (e) {
      if (e?.name !== "AbortError") setMessage(errorText(e));
    }
  }
  async function shareCategoryTemplate() {
    if (categoryFilter === "all") {
      setMessage("Seleccioná una categoría para compartir su plantilla.");
      return;
    }
    const category = categories.find((c) => c.id === categoryFilter);
    if (!category) return;
    const categoryPlayers = players.filter(
      (p) => p.category_id === categoryFilter && p.active !== false,
    );
    const header = `${APP_NAME}\n${APP_TAGLINE}\n\nPlantilla ${genderGroupLabel(normalizeGender(category.gender))} · ${category.name}`;
    const body = categoryPlayers.length
      ? categoryPlayers
          .map((p, i) => `${i + 1}. ${p.full_name} — Código: ${p.access_code}`)
          .join("\n")
      : "No hay Jugador@s registrados.";
    const text = `${header}\n\n${body}`;
    try {
      const result = await shareText({
        title: `${APP_NAME} · ${category.name}`,
        text,
      });
      if (result === "copied")
        setMessage(
          "✓ Plantilla copiada. Podés pegarla donde quieras compartirla.",
        );
    } catch (e) {
      if (e?.name !== "AbortError")
        setMessage("No se pudo compartir la plantilla.");
    }
  }
  async function copyCategoryTemplate() {
    if (categoryFilter === "all")
      return setMessage("Seleccioná una categoría para copiar su plantilla.");
    const category = categories.find((c) => c.id === categoryFilter);
    const list = players.filter(
      (p) => p.category_id === categoryFilter && p.active !== false,
    );
    const text = `${APP_NAME}\n${APP_TAGLINE}\n\nPlantilla ${genderGroupLabel(normalizeGender(category?.gender))} · ${category?.name || ""}\n\n${list.length ? list.map((p, index) => `${index + 1}. ${p.full_name} — Código: ${p.access_code}`).join("\n") : "No hay Jugador@s registrados."}`;
    try {
      await copyText(text);
      setMessage("✓ Plantilla copiada.");
    } catch (error) {
      setMessage(errorText(error));
    }
  }
  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Jugador@s</h2>
          <p>Agregá, modificá o eliminá Jugador@s.</p>
        </div>
      </div>
      <form className="add-player" onSubmit={add}>
        <input
          required
          placeholder="Apellido"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
        <input
          required
          placeholder="Nombre"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <CategoryPicker
          categories={editableCategories}
          value={categoryId}
          onChange={setCategoryId}
        />
        <button disabled={loading}>+ Agregar</button>
      </form>
      {editingPlayer && (
        <form className="edit-player-card add-player" onSubmit={saveEdit}>
          <input
            required
            placeholder="Apellido"
            value={editLast}
            onChange={(e) => setEditLast(e.target.value)}
          />
          <input
            required
            placeholder="Nombre"
            value={editFirst}
            onChange={(e) => setEditFirst(e.target.value)}
          />
          <CategoryPicker
            categories={editableCategories}
            value={editCategory}
            onChange={setEditCategory}
          />
          <button disabled={loading}>✓ Guardar cambios</button>
          <button
            type="button"
            className="link-btn"
            onClick={() => setEditingPlayer(null)}
          >
            Cancelar
          </button>
        </form>
      )}
      {categoryFilter !== "all" && (
        <div className="share-template-row">
          <button
            type="button"
            className="copy-category-btn"
            onClick={copyCategoryTemplate}
          >
            📋 Copiar plantilla
          </button>
          <button
            type="button"
            className="share-template-btn"
            onClick={shareCategoryTemplate}
          >
            📤 Compartir plantilla
          </button>
        </div>
      )}
      <div className="player-filters">
        <div>
          <label>Buscar</label>
          <input
            placeholder="Nombre y apellido"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label>Categoría</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">Todas</option>
            {visibleCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {genderGroupLabel(normalizeGender(c.gender))} · {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {message && <div className="message">{message}</div>}
      <div className="simple-list">
        {visiblePlayers.length ? (
          visiblePlayers.map((p) => {
            const c = categories.find((x) => x.id === p.category_id);
            const canEdit = hasCategoryPermission(
              profile,
              c,
              permissions,
              "edit",
            );
            return (
              <div className="simple-row player-management-row" key={p.id}>
                <span className="avatar">{p.full_name.charAt(0)}</span>
                <div className="player-info">
                  <b>{p.full_name}</b>
                  <small>
                    {genderGroupLabel(normalizeGender(c?.gender))} · {c?.name}
                  </small>
                </div>
                <div className="player-code">
                  <span>Código</span>
                  <strong>{p.access_code}</strong>
                </div>
                <div className="player-actions">
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={() => copyPlayerCode(p)}
                  >
                    📋 Copiar
                  </button>
                  <button
                    type="button"
                    className="share-btn"
                    onClick={() => sharePlayer(p)}
                  >
                    📤 Compartir
                  </button>
                  <button
                    type="button"
                    className="edit-btn"
                    disabled={!canEdit}
                    onClick={() => startEdit(p)}
                  >
                    ✏️ Modificar
                  </button>
                  <button
                    type="button"
                    className="delete-btn"
                    disabled={!canEdit}
                    onClick={() => remove(p)}
                  >
                    🗑️ Eliminar
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty">No hay registros.</div>
        )}
      </div>
    </section>
  );
}

function History({ profile, categories, permissions, players, refresh }) {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [type, setType] = useState("training");
  const [opponent, setOpponent] = useState("");
  const [matchLocation, setMatchLocation] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tournamentDates, setTournamentDates] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(false);
  async function load() {
    let q = supabase
      .from("training_sessions")
      .select("*, categories(id,name,gender)")
      .order("session_date", { ascending: false });
    if (filter !== "all") q = q.eq("category_id", filter);
    const { data, error } = await q;
    if (error) setMessage(errorText(error));
    else setSessions(data || []);
  }
  useEffect(() => {
    load();
  }, [filter]);
  async function open(s) {
    setSelected(s);
    const { data, error } = await supabase
      .from("attendance")
      .select("player_id,status")
      .eq("session_id", s.id);
    if (error) {
      setMessage(errorText(error));
      return;
    }
    const start =
      s.tournament_start_date || s.event_start_date || s.session_date;
    const end = s.tournament_end_date || s.event_end_date || s.session_date;
    setRows(data || []);
    setDate(s.session_date);
    setType(s.activity_type);
    setOpponent(s.opponent || "");
    setMatchLocation(s.activity_type === "match" ? s.event_location || "" : "");
    setLocation(sessionVenue(s));
    setStartDate(start);
    setEndDate(end);
    setTournamentDates(sessionTournamentDates(s));
    setAttendance(
      Object.fromEntries((data || []).map((r) => [r.player_id, r.status])),
    );
    setEditing(false);
  }
  const cat = selected?.categories;
  const editable =
    cat && hasCategoryPermission(profile, cat, permissions, "edit");
  async function saveEdit() {
    if (!selected) return;
    setLoading(true);
    try {
      const dates = parseTournamentDates(
        tournamentDates,
        startDate || date,
        endDate || date,
      );
      const payload = {
        session_date: date,
        activity_type: type,
        opponent: type === "match" ? clean(opponent) || null : null,
        event_location:
          type === "match"
            ? clean(matchLocation) || null
            : type === "tournament"
              ? clean(location) || null
              : null,
        event_start_date: type === "tournament" ? startDate || date : null,
        event_end_date: type === "tournament" ? endDate || date : null,
        tournament_location:
          type === "tournament" ? clean(location) || null : null,
        tournament_start_date: type === "tournament" ? startDate || date : null,
        tournament_end_date: type === "tournament" ? endDate || date : null,
        tournament_dates: type === "tournament" ? dates : null,
      };
      const { error } = await supabase
        .from("training_sessions")
        .update(payload)
        .eq("id", selected.id);
      if (error) throw error;
      const playerIds = Object.keys(attendance);
      if (playerIds.length) {
        const up = await supabase.from("attendance").upsert(
          playerIds.map((id) => ({
            session_id: selected.id,
            player_id: id,
            status: attendance[id],
          })),
          { onConflict: "session_id,player_id" },
        );
        if (up.error) throw up.error;
      }
      setMessage("✓ Registro modificado.");
      setEditing(false);
      await load();
      await open({ ...selected, ...payload });
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  async function remove() {
    if (
      !selected ||
      !window.confirm(
        "¿Eliminar definitivamente este registro y su asistencia?",
      )
    )
      return;
    setLoading(true);
    try {
      const a = await supabase
        .from("attendance")
        .delete()
        .eq("session_id", selected.id);
      if (a.error) throw a.error;
      const s = await supabase
        .from("training_sessions")
        .delete()
        .eq("id", selected.id);
      if (s.error) throw s.error;
      setSelected(null);
      setRows([]);
      setMessage("✓ Registro eliminado definitivamente.");
      await load();
      await refresh();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Historial</h2>
          <p>
            Desde acá podés modificar o eliminar cualquier registro guardado.
          </p>
        </div>
      </div>
      <div className="filter-box">
        <label>Filtrar por categoría</label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Todas</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {genderGroupLabel(normalizeGender(c.gender))} · {c.name}
            </option>
          ))}
        </select>
      </div>
      {!selected ? (
        <div className="history-grid">
          <div className="sessions">
            {sessions.length ? (
              sessions.map((s) => (
                <button
                  key={s.id}
                  className="session"
                  onClick={() => open(s)}
                >
                  <strong>
                    {new Date(s.session_date + "T12:00:00").toLocaleDateString(
                      "es-AR",
                    )}
                  </strong>
                  <small>
                    {ACTIVITY_TYPES[s.activity_type]?.icon}{" "}
                    {ACTIVITY_TYPES[s.activity_type]?.label}
                  </small>
                  <small>{s.categories?.name}</small>
                  {s.activity_type === "match" && s.opponent && (
                    <small>Vs. {s.opponent}</small>
                  )}
                  {s.activity_type === "tournament" && (
                    <small>{sessionVenue(s) || "Sin lugar"}</small>
                  )}
                </button>
              ))
            ) : (
              <div className="empty">No hay registros.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="history-detail history-detail-full">
          <div
            className="detail-head session-detail-header"
            onClick={() => {
              if (!editing) setSelected(null);
            }}
            role={!editing ? "button" : undefined}
            tabIndex={!editing ? 0 : undefined}
            onKeyDown={(event) => {
              if (!editing && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                setSelected(null);
              }
            }}
          >
            <div>
              <span className="detail-back">← Historial</span>
              <h3>
                {ACTIVITY_TYPES[type]?.icon} {ACTIVITY_TYPES[type]?.label}
              </h3>
              <p>{selected.categories?.name}</p>
            </div>
            {editable && (
              <div
                className="record-actions"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className="edit-btn"
                  onClick={() => setEditing(true)}
                >
                  ✏️ Modificar
                </button>
                <button
                  className="delete-btn"
                  onClick={remove}
                  disabled={loading}
                >
                  🗑️ Eliminar
                </button>
              </div>
            )}
          </div>
          {editing ? (
            <div className="edit-session-form">
              <label>
                Fecha
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                Actividad
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  {Object.entries(ACTIVITY_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              {type === "match" && (
                <>
                  <label>
                    Rival
                    <input
                      value={opponent}
                      onChange={(e) => setOpponent(e.target.value)}
                    />
                  </label>
                  <label>
                    Lugar
                    <input
                      value={matchLocation}
                      onChange={(e) => setMatchLocation(e.target.value)}
                    />
                  </label>
                </>
              )}
              {type === "tournament" && (
                <>
                  <label>
                    Lugar
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    />
                  </label>
                  <label>
                    Desde
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </label>
                  <label>
                    Hasta
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </label>
                  <div className="tournament-dates">
                    <label>Fechas adicionales</label>
                    <div>
                      {tournamentDates.map((value, index) => (
                        <div className="date-row" key={`${value}-${index}`}>
                          <input
                            type="date"
                            value={value}
                            onChange={(e) =>
                              setTournamentDates((dates) =>
                                dates.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? e.target.value
                                    : item,
                                ),
                              )
                            }
                          />
                          <button
                            type="button"
                            className="mini-delete"
                            aria-label="Quitar fecha"
                            onClick={() =>
                              setTournamentDates((dates) =>
                                dates.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="add-date-btn"
                      onClick={() =>
                        setTournamentDates((dates) => [
                          ...dates,
                          endDate || startDate || date,
                        ])
                      }
                    >
                      + Agregar fecha
                    </button>
                  </div>
                </>
              )}
              <div className="form-actions">
                <button
                  className="save-btn"
                  onClick={saveEdit}
                  disabled={loading}
                >
                  ✓ Guardar cambios
                </button>
                <button
                  className="link-btn"
                  onClick={() => setEditing(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              {selected.activity_type === "match" && selected.opponent && (
                <p>
                  <b>Vs.:</b> {selected.opponent}
                  {selected.event_location && <> · <b>Lugar:</b> {selected.event_location}</>}
                </p>
              )}
              {selected.activity_type === "tournament" && (
                <p>
                  <b>Lugar:</b> {sessionVenue(selected) || "—"} ·{" "}
                  <b>Fechas:</b>{" "}
                  {sessionTournamentDates(selected).map(formatDate).join(", ")}
                </p>
              )}
              <div className="simple-list">
                {rows.map((r) => (
                  <div className="simple-row" key={r.player_id}>
                    <b>
                      {players.find((p) => p.id === r.player_id)
                        ?.full_name || "Jugador@"}
                    </b>
                    <div className="attendance-history-actions">
                      <StatusButton
                        value={r.status}
                        onChange={async (status) => {
                          const result = await supabase
                            .from("attendance")
                            .update({ status })
                            .eq("session_id", selected.id)
                            .eq("player_id", r.player_id);
                          if (result.error)
                            setMessage(errorText(result.error));
                          else {
                            setRows((x) =>
                              x.map((y) =>
                                y.player_id === r.player_id
                                  ? { ...y, status }
                                  : y,
                              ),
                            );
                            setMessage("✓ Asistencia modificada.");
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="mini-delete"
                        onClick={async () => {
                          if (!window.confirm("¿Eliminar esta asistencia?"))
                            return;
                          const result = await supabase
                            .from("attendance")
                            .delete()
                            .eq("session_id", selected.id)
                            .eq("player_id", r.player_id);
                          if (result.error)
                            setMessage(errorText(result.error));
                          else {
                            setRows((x) =>
                              x.filter((y) => y.player_id !== r.player_id),
                            );
                            setAttendance((a) => {
                              const copy = { ...a };
                              delete copy[r.player_id];
                              return copy;
                            });
                            setMessage("✓ Asistencia eliminada.");
                          }
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {message && <div className="message">{message}</div>}
    </section>
  );
}

function Categories({ profile, categories, refresh }) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState("female");
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  if (profile.role !== "super_admin") return null;
  async function add(e) {
    e.preventDefault();
    if (!clean(name)) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("categories")
        .insert({
          name: name.trim(),
          gender,
          active: true,
          admin_id: profile.id,
        });
      if (error) throw error;
      setName("");
      setMessage("✓ Categoría creada.");
      await refresh();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  async function save() {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("categories")
        .update({ name: editName.trim() })
        .eq("id", editing.id);
      if (error) throw error;
      setEditing(null);
      setMessage("✓ Categoría modificada.");
      await refresh();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  async function remove(c) {
    if (!window.confirm(`¿Eliminar ${c.name}?`)) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("categories")
        .update({ active: false })
        .eq("id", c.id);
      if (error) throw error;
      setMessage("✓ Categoría eliminada.");
      await refresh();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Categorías</h2>
          <p>
            Creá directamente desde la app categorías normales o versiones B,
            sin entrar a Supabase.
          </p>
        </div>
      </div>
      <form className="category-create-form" onSubmit={add}>
        <input
          required
          placeholder="Ej.: Sub14 o Sub14 B"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="female">Femenino</option>
          <option value="male">Masculino</option>
        </select>
        <button disabled={loading}>+ Crear categoría</button>
      </form>
      {editing && (
        <div className="edit-session-form">
          <label>
            Nombre
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button className="save-btn" onClick={save}>
              Guardar
            </button>
            <button className="link-btn" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      <div className="category-admin-list">
        {categories.map((c) => (
          <div className="simple-row" key={c.id}>
            <div>
              <b>{c.name}</b>
              <small>{genderGroupLabel(normalizeGender(c.gender))}</small>
            </div>
            <div className="record-actions">
              <button
                className="edit-btn"
                onClick={() => {
                  setEditing(c);
                  setEditName(c.name);
                }}
              >
                ✏️ Modificar
              </button>
              <button className="delete-btn" onClick={() => remove(c)}>
                🗑️ Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
      {message && <div className="message">{message}</div>}
    </section>
  );
}

function Permissions({ profile, categories }) {
  const [admins, setAdmins] = useState([]);
  const [selected, setSelected] = useState("");
  const [permissions, setPermissions] = useState({});
  const [message, setMessage] = useState("");
  useEffect(() => {
    async function load() {
      const a = await supabase
        .from("profiles")
        .select("id,full_name,role")
        .eq("role", "admin")
        .order("full_name");
      if (a.error) {
        setMessage(errorText(a.error));
        return;
      }
      setAdmins(a.data || []);
      if (!selected && a.data?.length) setSelected(a.data[0].id);
      const p = await supabase
        .from("admin_category_permissions")
        .select("admin_id,category_id,can_view,can_edit");
      if (!p.error)
        setPermissions(
          Object.fromEntries(
            (p.data || []).map((x) => [`${x.admin_id}:${x.category_id}`, x]),
          ),
        );
    }
    load();
  }, [selected]);
  if (profile.role !== "super_admin") return null;
  async function setPermission(c, field, value) {
    const key = `${selected}:${c.id}`;
    const current = permissions[key] || { can_view: false, can_edit: false };
    const next = {
      can_view: field === "can_view" ? value : current.can_view,
      can_edit: field === "can_edit" ? value : current.can_edit,
    };
    if (next.can_edit) next.can_view = true;
    const result =
      !next.can_view && !next.can_edit
        ? await supabase
            .from("admin_category_permissions")
            .delete()
            .eq("admin_id", selected)
            .eq("category_id", c.id)
        : await supabase
            .from("admin_category_permissions")
            .upsert(
              {
                admin_id: selected,
                category_id: c.id,
                can_view: next.can_view,
                can_edit: next.can_edit,
              },
              { onConflict: "admin_id,category_id" },
            )
            .select()
            .single();
    if (result.error) setMessage(errorText(result.error));
    else {
      setPermissions((p) => {
        const x = { ...p };
        if (!next.can_view && !next.can_edit) delete x[key];
        else x[key] = { ...next };
        return x;
      });
      setMessage("✓ Permiso actualizado.");
    }
  }
  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Permisos</h2>
          <p>Elegí qué categorías puede ver y editar cada profe.</p>
        </div>
      </div>
      <div className="filter-box">
        <label>Profe</label>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>
              {a.full_name || "Profe sin nombre"}
            </option>
          ))}
        </select>
      </div>
      <div className="permissions-grid">
        {["female", "male"].map((g) => {
          const list = categoriesByGender(categories)[g];
          return (
            <div className="permission-group" key={g}>
              <div className="permission-group-head">
                <strong>{genderGroupLabel(g)}</strong>
              </div>
              {list.map((c) => {
                const p = permissions[`${selected}:${c.id}`] || {};
                return (
                  <div className="permission-row" key={c.id}>
                    <div>
                      <b>{c.name}</b>
                    </div>
                    <label className="permission-check">
                      <input
                        type="checkbox"
                        checked={!!p.can_view}
                        onChange={(e) =>
                          setPermission(c, "can_view", e.target.checked)
                        }
                      />
                      Ver
                    </label>
                    <label className="permission-check">
                      <input
                        type="checkbox"
                        checked={!!p.can_edit}
                        onChange={(e) =>
                          setPermission(c, "can_edit", e.target.checked)
                        }
                      />
                      Editar
                    </label>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {message && <div className="message">{message}</div>}
    </section>
  );
}

function PlayerDashboard({ player, onLogout }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    supabase
      .rpc("player_attendance", { p_name: player.name, p_code: player.code })
      .then(({ data }) => setRows(data || []));
  }, [player]);
  const counts = {
    present: rows.filter((r) => r.status === "present").length,
    late: rows.filter((r) => r.status === "late").length,
    absent: rows.filter((r) => r.status === "absent").length,
  };
  return (
    <main className="app">
      <header>
        <div className="brand">
          🏐 <span>{APP_NAME}</span>
        </div>
        <button className="logout" onClick={onLogout}>
          Salir
        </button>
      </header>
      <div className="content">
        <section>
          <div className="page-head">
            <div>
              <h2>Mi asistencia</h2>
              <p>{APP_TAGLINE}</p>
              <p>Hola, {player.name}.</p>
              <p>
                Categoría: <b>{player.category_name}</b>
              </p>
            </div>
          </div>
          <div className="stats">
            <div>
              <strong>{counts.present}</strong>
              <span>Presentes</span>
            </div>
            <div>
              <strong>{counts.late}</strong>
              <span>Tardanzas</span>
            </div>
            <div>
              <strong>{counts.absent}</strong>
              <span>Ausencias</span>
            </div>
          </div>
          <div className="simple-list">
            {rows.map((r, i) => (
              <div className="simple-row" key={r.session_id || i}>
                <div>
                  <b>
                    {new Date(r.session_date + "T12:00:00").toLocaleDateString(
                      "es-AR",
                    )}
                  </b>
                  <small>
                    {ACTIVITY_TYPES[r.activity_type]?.icon}{" "}
                    {ACTIVITY_TYPES[r.activity_type]?.label}
                  </small>
                </div>
                <span className={`badge ${r.status}`}>
                  {STATUS[r.status]?.label}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [players, setPlayers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [tab, setTab] = useState("home");
  const [player, setPlayer] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("voley_player") || "null");
    } catch {
      return null;
    }
  });
  async function loadAdmin(user) {
    const p = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (p.error) {
      setProfile(null);
      return;
    }
    setProfile(p.data);
    if (!["admin", "super_admin"].includes(p.data.role)) return;
    const c = await supabase
      .from("categories")
      .select("*")
      .eq("active", true)
      .order("gender")
      .order("name");
    const all = c.data || [];
    let map = {};
    if (p.data.role !== "super_admin") {
      const r = await supabase
        .from("admin_category_permissions")
        .select("category_id,can_view,can_edit")
        .eq("admin_id", user.id);
      map = Object.fromEntries((r.data || []).map((x) => [x.category_id, x]));
    }
    setPermissions(map);
    setCategories(
      p.data.role === "super_admin"
        ? all
        : all.filter((x) => hasCategoryPermission(p.data, x, map, "view")),
    );
    const ps = await supabase
      .from("players")
      .select("*")
      .eq("active", true)
      .order("full_name");
    setPlayers(ps.data || []);
  }
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadAdmin(data.session.user);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) loadAdmin(s.user);
      else setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, []);
  const refresh = () => (session ? loadAdmin(session.user) : Promise.resolve());
  const logout = () => supabase.auth.signOut();
  if (player && !session)
    return (
      <PlayerDashboard
        player={player}
        onLogout={() => {
          localStorage.removeItem("voley_player");
          setPlayer(null);
        }}
      />
    );
  if (!session || !profile)
    return (
      <Login
        onAdminLogin={(s) => setSession(s)}
        onPlayerLogin={(p) => {
          localStorage.setItem("voley_player", JSON.stringify(p));
          setPlayer(p);
        }}
      />
    );
  const nav = [
    ["home", "Asistencia"],
    ["players", "Jugador@s"],
    ["history", "Historial"],
  ];
  if (profile.role === "super_admin")
    nav.push(["categories", "Categorías"], ["permissions", "Permisos"]);
  return (
    <main className="app">
      <header>
        <div className="brand">
          🏐 <span>{APP_NAME}</span>
        </div>
        <div className="header-user">
          {profile.full_name || "Profe"}{" "}
          <button className="logout" onClick={logout}>
            Salir
          </button>
        </div>
      </header>
      <nav>
        {nav.map(([k, l]) => (
          <button
            key={k}
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </nav>
      <div className="content">
        {tab === "home" && (
          <Attendance
            profile={profile}
            players={players}
            categories={categories}
            permissions={permissions}
            refresh={refresh}
          />
        )}{" "}
        {tab === "players" && (
          <Players
            profile={profile}
            players={players}
            categories={categories}
            permissions={permissions}
            refresh={refresh}
          />
        )}{" "}
        {tab === "history" && (
          <History
            profile={profile}
            players={players}
            categories={categories}
            permissions={permissions}
            refresh={refresh}
          />
        )}{" "}
        {tab === "categories" && profile.role === "super_admin" && (
          <Categories
            profile={profile}
            categories={categories}
            refresh={refresh}
          />
        )}{" "}
        {tab === "permissions" && profile.role === "super_admin" && (
          <Permissions profile={profile} categories={categories} />
        )}
      </div>
    </main>
  );
}

export default App;

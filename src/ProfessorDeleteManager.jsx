import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

const genderText = (value) => value === "female" ? "Femenino" : value === "male" ? "Masculino" : "—";
const dateText = (value) => value ? new Date(value).toLocaleDateString("es-AR") : "—";

export default function ProfessorDeleteManager() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [mountNode, setMountNode] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [togglingId, setTogglingId] = useState("");
  const [selectedProfessor, setSelectedProfessor] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [creatingProfessor, setCreatingProfessor] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    const evaluateSession = async (session) => {
      if (!mounted || !session?.user) return setIsSuperAdmin(false);
      const { data } = await supabase.from("profiles").select("role,active,approval_status").eq("id", session.user.id).maybeSingle();
      if (mounted) setIsSuperAdmin(data?.role === "super_admin" && data?.active !== false && data?.approval_status === "approved");
    };
    supabase.auth.getSession().then(({ data }) => evaluateSession(data?.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setTimeout(() => evaluateSession(session), 0));
    return () => { mounted = false; data?.subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return setMountNode(null);
    const syncMount = () => {
      const section = Array.from(document.querySelectorAll("section")).find((s) => s.querySelector(".page-title h1")?.textContent?.trim() === "Profes");
      if (!section) return setMountNode(null);
      section.querySelectorAll(".admin-list").forEach((list) => {
        if (!list.closest("[data-professor-delete-manager]")) list.style.display = "none";
      });
      let node = section.querySelector("[data-professor-delete-manager]");
      if (!node) {
        node = document.createElement("div");
        node.setAttribute("data-professor-delete-manager", "true");
        section.appendChild(node);
      }
      setMountNode(node);
    };
    syncMount();
    const observer = new MutationObserver(syncMount);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isSuperAdmin]);

  useEffect(() => { if (mountNode && isSuperAdmin) loadAdmins(); }, [mountNode, isSuperAdmin]);

  useEffect(() => {
    if (!selectedProfessor) return;
    const onKey = (event) => { if (event.key === "Escape") closeDetails(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [selectedProfessor]);

  async function createProfessor(event) {
    event.preventDefault();
    setCreateError("");
    const firstName = createForm.firstName.trim();
    const lastName = createForm.lastName.trim();
    const email = createForm.email.trim().toLowerCase();
    const password = createForm.password;
    if (!firstName || !lastName || !email || !password) return setCreateError("Completá todos los datos.");
    if (password.length < 8) return setCreateError("La contraseña debe tener al menos 8 caracteres.");

    setCreatingProfessor(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-professor", {
        body: { first_name: firstName, last_name: lastName, email, password },
      });
      if (error) {
        let detail = error.message || "No se pudo crear la cuenta del Profe.";
        try { const body = await error.context?.json?.(); if (body?.error) detail = body.error; } catch (_) {}
        throw new Error(detail);
      }
      if (!data?.ok) throw new Error(data?.error || "No se pudo crear la cuenta del Profe.");
      const professor = data.professor;
      setAdmins((current) => [...current, professor].sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "", "es")));
      setCreateForm({ firstName: "", lastName: "", email: "", password: "" });
      setCreating(false);
      setMessage(`✓ Cuenta de ${professor.full_name} creada, aprobada y lista para ingresar.`);
    } catch (error) {
      setCreateError(error?.message || "No se pudo crear la cuenta del Profe.");
    } finally {
      setCreatingProfessor(false);
    }
  }

  async function loadAdmins() {
    setMessage("");
    const { data, error } = await supabase.from("profiles").select("id,full_name,role,active,created_at").in("role", ["admin", "pending_admin"]).order("full_name");
    if (error) return setMessage(error.message || "No se pudieron cargar los Profes.");
    setAdmins(data || []);
  }

  async function openDetails(professor) {
    setSelectedProfessor(professor);
    setDetails(null);
    setDetailsError("");
    setDetailsLoading(true);
    setEditing(false);
    setEditName(professor.full_name || "");

    try {
      const [profileResult, playerResult, permissionsResult, ownedCategoriesResult, sessionsResult, accountsResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", professor.id).maybeSingle(),
        supabase.from("players").select("*, categories(name,gender)").eq("user_id", professor.id).maybeSingle(),
        supabase.from("admin_category_permissions").select("category_id,can_view,can_edit,categories(name,gender)").eq("admin_id", professor.id),
        supabase.from("categories").select("id,name,gender").eq("admin_id", professor.id).eq("active", true),
        supabase.from("training_sessions").select("activity_type").eq("created_by", professor.id),
        supabase.rpc("get_superadmin_professor_accounts"),
      ]);

      const firstError = [profileResult, playerResult, permissionsResult, ownedCategoriesResult, sessionsResult, accountsResult].find((result) => result.error)?.error;
      if (firstError) throw firstError;

      const categoryMap = new Map();
      (ownedCategoriesResult.data || []).forEach((category) => categoryMap.set(category.id, {
        id: category.id, name: category.name, gender: category.gender, can_view: true, can_edit: true, source: "Responsable",
      }));
      (permissionsResult.data || []).forEach((permission) => {
        const current = categoryMap.get(permission.category_id);
        categoryMap.set(permission.category_id, {
          id: permission.category_id,
          name: permission.categories?.name || current?.name || "Categoría",
          gender: permission.categories?.gender || current?.gender,
          can_view: !!permission.can_view || !!current?.can_view,
          can_edit: !!permission.can_edit || !!current?.can_edit,
          source: current?.source || "Permiso",
        });
      });

      const sessions = sessionsResult.data || [];
      const account = (accountsResult.data || []).find((item) => item.professor_id === professor.id) || null;
      const profile = profileResult.data || professor;
      setEditName(profile.full_name || professor.full_name || "");
      setDetails({
        profile,
        accountEmail: account?.email || "",
        player: playerResult.data || null,
        categories: Array.from(categoryMap.values()).sort((a, b) => `${a.gender}-${a.name}`.localeCompare(`${b.gender}-${b.name}`, "es")),
        activities: {
          training: sessions.filter((item) => item.activity_type === "training").length,
          match: sessions.filter((item) => item.activity_type === "match").length,
          tournament: sessions.filter((item) => item.activity_type === "tournament").length,
          total: sessions.length,
        },
      });
    } catch (error) {
      setDetailsError(error?.message || "No se pudieron cargar los datos del Profe.");
    } finally {
      setDetailsLoading(false);
    }
  }

  function closeDetails() {
    setSelectedProfessor(null);
    setDetails(null);
    setDetailsError("");
    setDetailsLoading(false);
    setEditing(false);
    setSavingEdit(false);
  }

  async function saveProfessorEdit(event) {
    event.preventDefault();
    const nextName = editName.trim();
    if (!nextName || !selectedProfessor || !details) return;
    setSavingEdit(true);
    setDetailsError("");
    const { error } = await supabase.rpc("superadmin_update_professor", {
      p_professor_id: selectedProfessor.id,
      p_full_name: nextName,
      p_active: details.profile?.active !== false,
    });
    setSavingEdit(false);
    if (error) return setDetailsError(error.message || "No se pudieron guardar los cambios del Profe.");

    setAdmins((current) => current.map((item) => item.id === selectedProfessor.id ? { ...item, full_name: nextName } : item));
    setSelectedProfessor((current) => current ? { ...current, full_name: nextName } : current);
    setDetails((current) => current ? { ...current, profile: { ...current.profile, full_name: nextName } } : current);
    setEditing(false);
    setMessage(`✓ Datos de ${nextName} actualizados.`);
  }

  async function toggleActive(professor) {
    const next = professor.active === false;
    setTogglingId(professor.id);
    setMessage("");
    const { error } = await supabase.rpc("superadmin_update_professor", {
      p_professor_id: professor.id,
      p_full_name: details?.profile?.full_name || professor.full_name || "Profe",
      p_active: next,
    });
    setTogglingId("");
    if (error) {
      const text = error.message || "No se pudo cambiar el estado del Profe.";
      setMessage(text);
      if (selectedProfessor?.id === professor.id) setDetailsError(text);
      return;
    }
    setAdmins((current) => current.map((item) => item.id === professor.id ? { ...item, active: next } : item));
    if (selectedProfessor?.id === professor.id) {
      setSelectedProfessor((current) => current ? { ...current, active: next } : current);
      setDetails((current) => current ? { ...current, profile: { ...current.profile, active: next } } : current);
      setDetailsError("");
    }
    setMessage(next ? `✓ ${professor.full_name} quedó ACTIVO.` : `✓ ${professor.full_name} quedó INACTIVO y en modo solo lectura.`);
  }

  async function removeProfessor(professor) {
    const name = professor.full_name || "este Profe";
    const warning = `¿Eliminar definitivamente a ${name}?\n\nSe eliminará su cuenta de acceso. Si también era Jugador@, se eliminará además su ficha de Jugador@ y su asistencia personal. Las categorías, Jugador@s y registros administrativos que hubiera gestionado se conservarán y pasarán al Super Administrador.`;
    if (!window.confirm(warning)) return;
    setDeletingId(professor.id);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("delete-professor", { body: { user_id: professor.id } });
      if (error) {
        let detail = error.message || "No se pudo eliminar el Profe.";
        try { const body = await error.context?.json?.(); if (body?.error) detail = body.error; } catch (_) {}
        throw new Error(detail);
      }
      if (!data?.ok) throw new Error(data?.error || "No se pudo eliminar el Profe.");
      setAdmins((current) => current.filter((item) => item.id !== professor.id));
      if (selectedProfessor?.id === professor.id) closeDetails();
      setMessage(`✓ ${name} fue eliminado correctamente.`);
    } catch (error) {
      setMessage(error?.message || "No se pudo eliminar el Profe.");
    } finally { setDeletingId(""); }
  }

  const detailCategory = useMemo(() => {
    const player = details?.player;
    return player?.categories ? `${genderText(player.categories.gender)} · ${player.categories.name}` : "—";
  }, [details]);

  if (!mountNode || !isSuperAdmin) return null;

  const listPortal = createPortal(
    <div className="card professor-unified-card">
      <div className="card-head professor-management-head"><div><h2>Gestión de Profes</h2><span>Control exclusivo del Super Administrador.</span></div><button type="button" className="primary professor-create-open" onClick={() => { setCreating((value) => !value); setCreateError(""); }}>{creating ? "Cancelar alta" : "＋ Crear cuenta de Profe"}</button></div>
      {creating && <form className="professor-create-form" onSubmit={createProfessor}>
        <div className="professor-create-intro"><b>Alta directa de Profe</b><span>La cuenta quedará activa, aprobada y con el correo confirmado administrativamente. El Profe podrá ingresar inmediatamente con el correo y contraseña que le entregues.</span></div>
        {createError && <div className="message">{createError}</div>}
        <div className="professor-create-grid">
          <label>Nombre<input value={createForm.firstName} onChange={(event) => setCreateForm((current) => ({ ...current, firstName: event.target.value }))} autoComplete="off" required /></label>
          <label>Apellido<input value={createForm.lastName} onChange={(event) => setCreateForm((current) => ({ ...current, lastName: event.target.value }))} autoComplete="off" required /></label>
          <label>Correo electrónico<input type="email" value={createForm.email} onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))} autoComplete="off" required /></label>
          <label>Contraseña inicial<input type="password" minLength={8} value={createForm.password} onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" required /><small>Mínimo 8 caracteres. Entregásela al Profe de forma privada.</small></label>
        </div>
        <div className="form-actions"><button type="button" onClick={() => { setCreating(false); setCreateError(""); }}>Cancelar</button><button type="submit" className="primary" disabled={creatingProfessor}>{creatingProfessor ? "Creando cuenta..." : "Crear y habilitar cuenta"}</button></div>
      </form>}
      <p className="professor-status-note">Tocá el nombre de un Profe para ver su ficha completa, correo de cuenta y modificar sus datos.</p>
      {message && <div className="message">{message}</div>}
      <div className="professor-unified-list">
        {admins.length ? admins.map((professor) => {
          const active = professor.active !== false;
          return <div className="professor-unified-row" key={professor.id}>
            <button type="button" className="professor-info-button" onClick={() => openDetails(professor)}>
              <b>{professor.full_name || "Profe"}</b>
              <span>{professor.role === "pending_admin" ? "Cuenta pendiente de Profe" : "Cuenta de Profe"} · Ver datos</span>
            </button>
            <button type="button" className={`professor-status-btn ${active ? "active" : "inactive"}`} disabled={togglingId === professor.id} onClick={() => toggleActive(professor)}>{togglingId === professor.id ? "Guardando..." : active ? "ACTIVO" : "INACTIVO"}</button>
            <button type="button" className="professor-delete-btn" disabled={deletingId === professor.id} onClick={() => removeProfessor(professor)}>{deletingId === professor.id ? "Eliminando..." : "🗑️ Eliminar"}</button>
          </div>;
        }) : <div className="empty">No hay Profes registrados.</div>}
      </div>
    </div>, mountNode,
  );

  const detailPortal = selectedProfessor ? createPortal(
    <div className="professor-detail-modal" role="dialog" aria-modal="true" aria-label={`Datos de ${selectedProfessor.full_name || "Profe"}`} onClick={closeDetails}>
      <div className="card professor-detail-card" onClick={(event) => event.stopPropagation()}>
        <div className="professor-detail-head">
          <button type="button" className="professor-detail-back" onClick={closeDetails}>← Volver a Profes</button>
          <div className="professor-detail-title"><span className="eyebrow">Ficha del Profe</span><h2>{selectedProfessor.full_name || "Profe"}</h2></div>
          <div className="professor-detail-head-actions">
            <button type="button" className={`professor-status-btn professor-detail-status ${details?.profile?.active === false ? "inactive" : "active"}`} disabled={!details || togglingId === selectedProfessor.id} onClick={() => toggleActive({ ...selectedProfessor, active: details?.profile?.active })}>{togglingId === selectedProfessor.id ? "Guardando..." : details?.profile?.active === false ? "INACTIVO" : "ACTIVO"}</button>
            <button type="button" className="professor-detail-close" aria-label="Cerrar" onClick={closeDetails}>×</button>
          </div>
        </div>

        {detailsLoading && <div className="empty">Cargando datos...</div>}
        {detailsError && <div className="message">{detailsError}</div>}

        {details && <>
          <div className="professor-account-card">
            <div><span>Correo de cuenta</span><b>{details.accountEmail || "Sin correo asociado"}</b><small>Correo utilizado para crear e ingresar a la cuenta. Solo visible para Super Admin.</small></div>
            <button type="button" className="primary professor-edit-btn" onClick={() => setEditing((value) => !value)}>{editing ? "Cancelar edición" : "✏️ Modificar datos"}</button>
          </div>

          {editing && <form className="professor-edit-form" onSubmit={saveProfessorEdit}>
            <label>Nombre y apellido<input value={editName} onChange={(event) => setEditName(event.target.value)} required /></label>
            <label>Correo de cuenta<input type="email" value={details.accountEmail || ""} readOnly /></label>
            <small>El correo de acceso es un dato de Auth y se mantiene en solo lectura para no romper el inicio de sesión.</small>
            <div className="form-actions"><button type="button" onClick={() => { setEditing(false); setEditName(details.profile?.full_name || ""); }}>Cancelar</button><button type="submit" className="primary" disabled={savingEdit}>{savingEdit ? "Guardando..." : "Guardar cambios"}</button></div>
          </form>}

          <div className="professor-detail-grid">
            <div className="professor-detail-item"><span>Estado</span><b>{details.profile?.active === false ? "INACTIVO" : "ACTIVO"}</b></div>
            <div className="professor-detail-item"><span>Rol</span><b>{details.profile?.role === "pending_admin" ? "Profe pendiente" : "Profe"}</b></div>
            <div className="professor-detail-item"><span>Alta</span><b>{dateText(details.profile?.created_at)}</b></div>
            <div className="professor-detail-item"><span>También es Jugador@</span><b>{details.player ? "Sí" : "No"}</b></div>
            <div className="professor-detail-item"><span>Categorías a cargo</span><b>{details.categories.length}</b></div>
            <div className="professor-detail-item"><span>Actividades cargadas</span><b>{details.activities.total}</b></div>
          </div>

          <div className="professor-detail-sections">
            <div className="professor-detail-section"><h3>Categorías y permisos</h3><div className="professor-detail-list">{details.categories.length ? details.categories.map((category) => <div key={category.id}><b>{genderText(category.gender)} · {category.name}</b><span>{category.can_edit ? "Puede ver y editar" : category.can_view ? "Solo lectura" : "Sin acceso"}</span></div>) : <div className="empty">No tiene categorías asignadas.</div>}</div></div>
            <div className="professor-detail-section"><h3>Actividad administrativa</h3><div className="professor-detail-list"><div><b>Entrenamientos</b><span>{details.activities.training}</span></div><div><b>Partidos</b><span>{details.activities.match}</span></div><div><b>Torneos</b><span>{details.activities.tournament}</span></div></div></div>
            {details.player && <div className="professor-detail-section"><h3>Perfil de Jugador@ asociado</h3><div className="professor-detail-list"><div><b>Nombre</b><span>{details.player.full_name || "—"}</span></div><div><b>DNI</b><span>{details.player.dni || "—"}</span></div><div><b>Fecha de nacimiento</b><span>{dateText(details.player.birth_date)}</span></div><div><b>Rama</b><span>{genderText(details.player.sex)}</span></div><div><b>Categoría</b><span>{detailCategory}</span></div><div><b>Equipo</b><span>{details.player.team ? `Equipo ${details.player.team}` : "Sin asignar"}</span></div><div><b>Código personal</b><span>{details.player.access_code || "—"}</span></div></div></div>}
          </div>
        </>}
      </div>
    </div>, document.body,
  ) : null;

  return <>{listPortal}{detailPortal}</>;
}

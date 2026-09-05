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

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    const evaluateSession = async (session) => {
      if (!mounted || !session?.user) return setIsSuperAdmin(false);
      const { data } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
      if (mounted) setIsSuperAdmin(data?.role === "super_admin");
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
    const onKey = (event) => {
      if (event.key === "Escape") closeDetails();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [selectedProfessor]);

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

    try {
      const [profileResult, playerResult, permissionsResult, ownedCategoriesResult, sessionsResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", professor.id).maybeSingle(),
        supabase.from("players").select("*, categories(name,gender)").eq("user_id", professor.id).maybeSingle(),
        supabase.from("admin_category_permissions").select("category_id,can_view,can_edit,categories(name,gender)").eq("admin_id", professor.id),
        supabase.from("categories").select("id,name,gender").eq("admin_id", professor.id).eq("active", true),
        supabase.from("training_sessions").select("activity_type").eq("created_by", professor.id),
      ]);

      const firstError = [profileResult, playerResult, permissionsResult, ownedCategoriesResult, sessionsResult].find((result) => result.error)?.error;
      if (firstError) throw firstError;

      const categoryMap = new Map();
      (ownedCategoriesResult.data || []).forEach((category) => {
        categoryMap.set(category.id, {
          id: category.id,
          name: category.name,
          gender: category.gender,
          can_view: true,
          can_edit: true,
          source: "Responsable",
        });
      });
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
      setDetails({
        profile: profileResult.data || professor,
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
  }

  async function toggleActive(professor) {
    const next = professor.active === false;
    setTogglingId(professor.id);
    setMessage("");
    const { error } = await supabase.from("profiles").update({ active: next }).eq("id", professor.id);
    setTogglingId("");
    if (error) return setMessage(error.message || "No se pudo cambiar el estado del Profe.");
    setAdmins((current) => current.map((item) => item.id === professor.id ? { ...item, active: next } : item));
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

  return createPortal(
    <>
      <div className="card professor-unified-card">
        <div className="card-head"><div><h2>Gestión de Profes</h2><span>Control exclusivo del Super Administrador.</span></div></div>
        <p className="professor-status-note">Tocá el nombre de un Profe para ver su ficha completa. ACTIVO permite cargar y modificar información; INACTIVO conserva el acceso en modo solo lectura.</p>
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
      </div>

      {selectedProfessor && <div className="professor-detail-modal" role="dialog" aria-modal="true" aria-label={`Datos de ${selectedProfessor.full_name || "Profe"}`} onClick={closeDetails}>
        <div className="card professor-detail-card" onClick={(event) => event.stopPropagation()}>
          <div className="professor-detail-head">
            <div>
              <span className="eyebrow">Ficha del Profe</span>
              <h2>{selectedProfessor.full_name || "Profe"}</h2>
            </div>
            <button type="button" className="professor-detail-close" aria-label="Cerrar" onClick={closeDetails}>×</button>
          </div>

          {detailsLoading && <div className="empty">Cargando datos...</div>}
          {detailsError && <div className="message">{detailsError}</div>}

          {details && <>
            <div className="professor-detail-grid">
              <div className="professor-detail-item"><span>Estado</span><b>{details.profile?.active === false ? "INACTIVO" : "ACTIVO"}</b></div>
              <div className="professor-detail-item"><span>Rol</span><b>{details.profile?.role === "pending_admin" ? "Profe pendiente" : "Profe"}</b></div>
              <div className="professor-detail-item"><span>Alta</span><b>{dateText(details.profile?.created_at)}</b></div>
              <div className="professor-detail-item"><span>También es Jugador@</span><b>{details.player ? "Sí" : "No"}</b></div>
              <div className="professor-detail-item"><span>Categorías a cargo</span><b>{details.categories.length}</b></div>
              <div className="professor-detail-item"><span>Actividades cargadas</span><b>{details.activities.total}</b></div>
            </div>

            <div className="professor-detail-sections">
              <div className="professor-detail-section">
                <h3>Categorías y permisos</h3>
                <div className="professor-detail-list">
                  {details.categories.length ? details.categories.map((category) => <div key={category.id}>
                    <b>{genderText(category.gender)} · {category.name}</b>
                    <span>{category.can_edit ? "Puede ver y editar" : category.can_view ? "Solo lectura" : "Sin acceso"}</span>
                  </div>) : <div className="empty">No tiene categorías asignadas.</div>}
                </div>
              </div>

              <div className="professor-detail-section">
                <h3>Actividad administrativa</h3>
                <div className="professor-detail-list">
                  <div><b>Entrenamientos</b><span>{details.activities.training}</span></div>
                  <div><b>Partidos</b><span>{details.activities.match}</span></div>
                  <div><b>Torneos</b><span>{details.activities.tournament}</span></div>
                </div>
              </div>

              {details.player && <div className="professor-detail-section">
                <h3>Perfil de Jugador@ asociado</h3>
                <div className="professor-detail-list">
                  <div><b>Nombre</b><span>{details.player.full_name || "—"}</span></div>
                  <div><b>DNI</b><span>{details.player.dni || "—"}</span></div>
                  <div><b>Fecha de nacimiento</b><span>{dateText(details.player.birth_date)}</span></div>
                  <div><b>Rama</b><span>{genderText(details.player.sex)}</span></div>
                  <div><b>Categoría</b><span>{detailCategory}</span></div>
                  <div><b>Equipo</b><span>{details.player.team ? `Equipo ${details.player.team}` : "Sin asignar"}</span></div>
                  <div><b>Código personal</b><span>{details.player.access_code || "—"}</span></div>
                </div>
              </div>}
            </div>
          </>}
        </div>
      </div>}
    </>, mountNode
  );
}

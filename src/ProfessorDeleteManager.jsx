import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

export default function ProfessorDeleteManager() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [mountNode, setMountNode] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [togglingId, setTogglingId] = useState("");

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

  async function loadAdmins() {
    setMessage("");
    const { data, error } = await supabase.from("profiles").select("id,full_name,role,active").in("role", ["admin", "pending_admin"]).order("full_name");
    if (error) return setMessage(error.message || "No se pudieron cargar los Profes.");
    setAdmins(data || []);
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
      setMessage(`✓ ${name} fue eliminado correctamente.`);
    } catch (error) {
      setMessage(error?.message || "No se pudo eliminar el Profe.");
    } finally { setDeletingId(""); }
  }

  if (!mountNode || !isSuperAdmin) return null;

  return createPortal(
    <div className="card professor-unified-card">
      <div className="card-head"><div><h2>Gestión de Profes</h2><span>Control exclusivo del Super Administrador.</span></div></div>
      <p className="professor-status-note">ACTIVO permite cargar y modificar información. INACTIVO conserva el acceso y la lectura, pero bloquea las modificaciones administrativas.</p>
      {message && <div className="message">{message}</div>}
      <div className="professor-unified-list">
        {admins.length ? admins.map((professor) => {
          const active = professor.active !== false;
          return <div className="professor-unified-row" key={professor.id}>
            <div><b>{professor.full_name || "Profe"}</b><span>{professor.role === "pending_admin" ? "Cuenta pendiente de Profe" : "Cuenta de Profe"}</span></div>
            <button type="button" className={`professor-status-btn ${active ? "active" : "inactive"}`} disabled={togglingId === professor.id} onClick={() => toggleActive(professor)}>{togglingId === professor.id ? "Guardando..." : active ? "ACTIVO" : "INACTIVO"}</button>
            <button type="button" className="professor-delete-btn" disabled={deletingId === professor.id} onClick={() => removeProfessor(professor)}>{deletingId === professor.id ? "Eliminando..." : "🗑️ Eliminar"}</button>
          </div>;
        }) : <div className="empty">No hay Profes registrados.</div>}
      </div>
    </div>, mountNode
  );
}

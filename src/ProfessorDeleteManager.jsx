import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

export default function ProfessorDeleteManager() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [mountNode, setMountNode] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    const evaluateSession = async (session) => {
      if (!mounted || !session?.user) {
        setIsSuperAdmin(false);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (mounted) setIsSuperAdmin(data?.role === "super_admin");
    };

    supabase.auth.getSession().then(({ data }) => evaluateSession(data?.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => evaluateSession(session), 0);
    });

    return () => {
      mounted = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) {
      setMountNode(null);
      return;
    }

    const syncMount = () => {
      const sections = Array.from(document.querySelectorAll("section"));
      const profesSection = sections.find((section) => {
        const title = section.querySelector(".page-title h1");
        return title?.textContent?.trim() === "Profes";
      });

      if (!profesSection) {
        setMountNode(null);
        return;
      }

      let node = profesSection.querySelector("[data-professor-delete-manager]");
      if (!node) {
        node = document.createElement("div");
        node.setAttribute("data-professor-delete-manager", "true");
        profesSection.appendChild(node);
      }
      setMountNode(node);
    };

    syncMount();
    const observer = new MutationObserver(syncMount);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!mountNode || !isSuperAdmin) return;
    loadAdmins();
  }, [mountNode, isSuperAdmin]);

  async function loadAdmins() {
    setMessage("");
    const { data, error } = await supabase
      .from("profiles")
      .select("id,full_name,role")
      .in("role", ["admin", "pending_admin"])
      .order("full_name");

    if (error) {
      setMessage(error.message || "No se pudieron cargar los Profes.");
      return;
    }
    setAdmins(data || []);
  }

  async function removeProfessor(professor) {
    const name = professor.full_name || "este Profe";
    const warning = `¿Eliminar definitivamente a ${name}?\n\nSe eliminará su cuenta de acceso. Si también era Jugador@, se eliminará además su ficha de Jugador@ y su asistencia personal. Las categorías, Jugador@s y registros administrativos que hubiera gestionado se conservarán y pasarán al Super Administrador.`;
    if (!window.confirm(warning)) return;

    setDeletingId(professor.id);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("delete-professor", {
        body: { user_id: professor.id },
      });

      if (error) {
        let detail = error.message || "No se pudo eliminar el Profe.";
        try {
          const body = await error.context?.json?.();
          if (body?.error) detail = body.error;
        } catch (_) {}
        throw new Error(detail);
      }
      if (!data?.ok) throw new Error(data?.error || "No se pudo eliminar el Profe.");

      setAdmins((current) => current.filter((item) => item.id !== professor.id));
      setMessage(`✓ ${name} fue eliminado correctamente.`);
      setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setMessage(error?.message || "No se pudo eliminar el Profe.");
    } finally {
      setDeletingId("");
    }
  }

  if (!mountNode || !isSuperAdmin) return null;

  return createPortal(
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-head">
        <div>
          <h2>Eliminar Profe</h2>
          <span>Control exclusivo del Super Administrador.</span>
        </div>
      </div>

      {message && <div className="message">{message}</div>}

      <div className="admin-list">
        {admins.length ? admins.map((professor) => (
          <div className="card admin-row" key={professor.id} style={{ marginTop: 10 }}>
            <div>
              <b>{professor.full_name || "Profe"}</b>
              <span>{professor.role === "pending_admin" ? "Cuenta pendiente de Profe" : "Cuenta de Profe"}</span>
            </div>
            <button
              type="button"
              className="danger"
              disabled={deletingId === professor.id}
              onClick={() => removeProfessor(professor)}
            >
              {deletingId === professor.id ? "Eliminando..." : "🗑️ Eliminar"}
            </button>
          </div>
        )) : <div className="empty">No hay Profes para eliminar.</div>}
      </div>
    </div>,
    mountNode,
  );
}

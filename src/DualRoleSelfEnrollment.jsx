import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

export default function DualRoleSelfEnrollment() {
  const [eligible, setEligible] = useState(false);
  const [playerRequest, setPlayerRequest] = useState(null);
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState(null);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [sex, setSex] = useState("female");
  const [dni, setDni] = useState("");
  const [birth, setBirth] = useState("");
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const hostRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function check(session) {
      if (!mounted || !session?.user) {
        setEligible(false);
        setPlayerRequest(null);
        setOpen(false);
        return;
      }

      const [profileResult, playerResult] = await Promise.all([
        supabase.from("profiles").select("id,full_name,role").eq("id", session.user.id).maybeSingle(),
        supabase.from("players").select("id,active,approval_status").eq("user_id", session.user.id).maybeSingle(),
      ]);
      if (!mounted) return;

      if (profileResult.error || playerResult.error) return;

      const canAdmin = ["admin", "super_admin"].includes(profileResult.data?.role);
      const request = playerResult.data || null;
      const approvedPlayer = !!request?.active && request?.approval_status === "approved";

      setPlayerRequest(request);
      setEligible(canAdmin && !approvedPlayer);

      if (canAdmin && profileResult.data?.full_name) {
        const parts = profileResult.data.full_name.trim().split(/\s+/);
        if (!first) setFirst(parts[0] || "");
        if (!last) setLast(parts.slice(1).join(" "));
      }
    }

    supabase.auth.getSession().then(({ data }) => check(data?.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => check(session), 0);
    });

    return () => {
      mounted = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!eligible) {
      hostRef.current = null;
      setHost(null);
      return;
    }

    let cancelled = false;
    let scheduled = 0;

    const syncHost = () => {
      scheduled = 0;
      if (cancelled) return;

      const currentHost = document.querySelector("main.app .topbar .top-user");
      if (currentHost !== hostRef.current) {
        hostRef.current = currentHost || null;
        setHost(currentHost || null);
      }
    };

    const scheduleSync = () => {
      if (scheduled) return;
      scheduled = requestAnimationFrame(syncHost);
    };

    syncHost();
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer.disconnect();
      if (scheduled) cancelAnimationFrame(scheduled);
      hostRef.current = null;
    };
  }, [eligible]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !saving) setOpen(false);
    };

    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, saving]);

  async function submit(e) {
    e.preventDefault();
    setMessage("");
    if (!first.trim() || !last.trim() || !dni.trim() || !birth) {
      setMessage("Completá nombre, apellido, DNI y fecha de nacimiento.");
      return;
    }

    setSaving(true);
    try {
      const result = await supabase.rpc("create_my_player_profile", {
        p_first_name: first.trim(),
        p_last_name: last.trim(),
        p_sex: sex,
        p_dni: dni.trim(),
        p_birth_date: birth,
      });
      if (result.error) throw result.error;
      const player = result.data;

      if (file && player?.id) {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (uid) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${uid}/${Date.now()}-${safeName}`;
          const upload = await supabase.storage.from("player-selfies").upload(path, file, {
            upsert: true,
            contentType: file.type || "image/jpeg",
          });
          if (upload.error) throw upload.error;
          const update = await supabase.from("players").update({ selfie_path: path }).eq("id", player.id);
          if (update.error) throw update.error;
        }
      }

      setPlayerRequest({
        id: player?.id,
        active: !!player?.active,
        approval_status: player?.approval_status || "pending",
      });
      setFile(null);
      setMessage("✓ Solicitud enviada. Tu perfil de Jugador@ queda pendiente hasta que lo apruebe otro Profe autorizado o el Super Administrador.");
    } catch (error) {
      setMessage(error?.message || "No se pudo crear tu perfil de Jugador@.");
    } finally {
      setSaving(false);
    }
  }

  if (!eligible) return null;

  const pending = playerRequest?.approval_status === "pending" && !playerRequest?.active;
  const rejected = playerRequest?.approval_status === "rejected";

  const launcher = host ? createPortal(
    <button
      type="button"
      className={`admin-player-switch-topbar${pending ? " pending" : rejected ? " rejected" : ""}`}
      onClick={() => { setMessage(""); setOpen(true); }}
      aria-label={pending ? "Perfil de Jugador@ pendiente de aprobación" : rejected ? "Reenviar solicitud de Jugador@" : "Crear mi perfil de Jugador@"}
    >
      <span className="admin-player-switch-icon">🏐</span>
      <span className="admin-player-switch-label">
        {pending ? <><span>Perfil Jugador@</span><span>pendiente</span></> : rejected ? <><span>Reenviar perfil</span><span>de Jugador@</span></> : <><span>Crear perfil</span><span>de Jugador@</span></>}
      </span>
    </button>,
    host,
  ) : null;

  const modal = open ? createPortal(
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label="Crear acceso de Jugador@"
      style={{ zIndex: 100000 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) setOpen(false);
      }}
    >
      <div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div><span className="eyebrow">DOBLE FUNCIÓN</span><h2>{pending ? "Perfil de Jugador@ pendiente" : rejected ? "Reenviar solicitud de Jugador@" : "También soy Jugador@"}</h2></div>
          <button type="button" onClick={() => setOpen(false)} disabled={saving}>×</button>
        </div>

        {pending ? (
          <>
            <p>Tu solicitud ya fue creada correctamente. Para mantener el control de altas, todavía debe aprobarla otro Profe autorizado para tu categoría o el Super Administrador.</p>
            <div className="message">No necesitás crear otro perfil ni volver a cargar tus datos.</div>
            <div className="form-actions"><button className="primary" type="button" onClick={() => setOpen(false)}>Entendido</button></div>
          </>
        ) : (
          <>
            <p>{rejected ? "Podés corregir tus datos y volver a enviar la solicitud. La nueva solicitud quedará pendiente de aprobación." : "Conservás intacto tu acceso de Profe/Super Admin y solicitás un perfil deportivo en la misma cuenta. La categoría se calcula automáticamente y el acceso como Jugador@ requiere aprobación independiente."}</p>

            <form onSubmit={submit}>
              <div className="two">
                <input required placeholder="Nombre" value={first} onChange={e => setFirst(e.target.value)} />
                <input required placeholder="Apellido" value={last} onChange={e => setLast(e.target.value)} />
              </div>
              <div className="two">
                <select value={sex} onChange={e => setSex(e.target.value)}><option value="female">Femenino</option><option value="male">Masculino</option></select>
                <input required placeholder="DNI" value={dni} onChange={e => setDni(e.target.value)} />
              </div>
              <label className="field-label">Fecha de nacimiento<input required type="date" value={birth} onChange={e => setBirth(e.target.value)} /></label>
              <label className="selfie-field">
                <span>Foto / Selfie</span>
                <span className="file-button" onClick={() => fileRef.current?.click()}>📷 Cámara / Galería</span>
                <input ref={fileRef} className="hidden-file" type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
                {file && <span className="file-name">✓ {file.name}</span>}
              </label>
              {message && <div className="message">{message}</div>}
              <div className="form-actions">
                <button type="button" onClick={() => setOpen(false)} disabled={saving}>Cancelar</button>
                <button className="primary" disabled={saving}>{saving ? "Enviando..." : rejected ? "Reenviar solicitud" : "Solicitar perfil de Jugador@"}</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      {launcher}
      {modal}
    </>
  );
}

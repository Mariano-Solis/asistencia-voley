import { useEffect, useRef, useState } from "react";
import AppNew from "./AppNew";
import ProfessorSelfSignup from "./ProfessorSelfSignup";
import { supabase } from "./supabase";

const PUBLIC_APP_URL = "https://voleysanmartin.com.ar/";
const APP_NAME = "Municipalidad de San Martín - VOLEY";
const TAGLINE = "#VamosElPoli";
const LOGO = "/Logo.jpg";
const TYPES = { training: "Entrenamiento", match: "Partido", tournament: "Torneo" };
const STATUS = { present: "Presente", late: "Tarde", absent: "Ausente" };
const dateText = v => v ? new Date(`${v}T12:00:00`).toLocaleDateString("es-AR") : "—";

function AuthRecovery() {
  const [modal, setModal] = useState(null);
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    const openRecovery = () => {
      if (!mounted) return;
      setModal("password");
      setMessage("");
      setNewPassword("");
      setConfirmPassword("");
    };

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") openRecovery();
    });

    return () => {
      mounted = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const installControls = () => {
      const emailInputs = Array.from(document.querySelectorAll('input[type="email"]'));
      const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]'));
      if (!emailInputs.length || !passwordInputs.length) return;

      const emailInput = emailInputs.find((input) => {
        const root = input.closest("form, section, div") || document.body;
        return root.textContent?.toLowerCase().includes("acceso con código personal");
      });
      if (!emailInput) return;

      const passwordInput = passwordInputs.find((input) => {
        const root = input.closest("form, section, div") || document.body;
        return root.contains(emailInput);
      });
      if (!passwordInput) return;

      const root = passwordInput.closest("form, section, div") || passwordInput.parentElement;
      if (!root || root.querySelector(".voley-auth-recovery-controls")) return;

      const controls = document.createElement("div");
      controls.className = "voley-auth-recovery-controls";
      controls.style.cssText = "display:flex;justify-content:center;gap:18px;flex-wrap:wrap;margin:8px 0 4px;";

      const forgot = document.createElement("button");
      forgot.type = "button";
      forgot.textContent = "¿Olvidaste tu contraseña?";
      forgot.style.cssText = "border:0;background:none;color:#b5121b;text-decoration:underline;cursor:pointer;font:inherit;padding:4px 2px;";
      forgot.addEventListener("click", () => {
        setEmail(emailInput.value.trim());
        setMessage("");
        setModal("forgot");
      });

      const resend = document.createElement("button");
      resend.type = "button";
      resend.textContent = "📩 Reenviar correo de verificación";
      resend.style.cssText = "border:0;background:none;color:#333;text-decoration:underline;cursor:pointer;font:inherit;padding:4px 2px;";
      resend.addEventListener("click", () => {
        setEmail(emailInput.value.trim());
        setMessage("");
        setModal("resend");
      });

      controls.append(forgot, resend);
      root.appendChild(controls);
    };

    installControls();
    const observer = new MutationObserver(installControls);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function sendRecovery() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setMessage("Ingresá tu correo electrónico primero.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: PUBLIC_APP_URL,
      });
      if (error) throw error;
      setMessage("✓ Listo. Revisá tu correo (y Spam/Correo no deseado). Si la cuenta existe, Supabase enviará el enlace para cambiar la contraseña.");
    } catch (error) {
      setMessage(error?.message || "No se pudo enviar el correo de recuperación.");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setMessage("Ingresá el correo con el que registraste la cuenta.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: cleanEmail,
        options: { emailRedirectTo: PUBLIC_APP_URL },
      });
      if (error) {
        const text = String(error.message || "");
        if (/already confirmed|confirmed/i.test(text)) {
          setMessage("Esta cuenta ya está verificada. No necesitás otro correo de confirmación. Si no podés entrar, usá «¿Olvidaste tu contraseña?».");
        } else {
          throw error;
        }
      } else {
        setMessage("✓ Correo de verificación reenviado. Revisá Recibidos y Spam/Correo no deseado.");
      }
    } catch (error) {
      setMessage(error?.message || "No se pudo reenviar el correo de verificación.");
    } finally {
      setLoading(false);
    }
  }

  async function updatePassword() {
    if (newPassword.length < 6) {
      setMessage("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMessage("✓ Contraseña actualizada. Ya podés ingresar con tu cuenta.");
      setTimeout(() => setModal(null), 1300);
    } catch (error) {
      setMessage(error?.message || "No se pudo actualizar la contraseña.");
    } finally {
      setLoading(false);
    }
  }

  if (!modal) return null;

  const title = modal === "forgot" ? "Recuperar contraseña" : modal === "resend" ? "Verificar cuenta" : "Nueva contraseña";

  return (
    <div className="voley-auth-modal" style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,.62)", display: "grid", placeItems: "center", padding: 20 }}>
      <section style={{ width: "min(440px,100%)", background: "#fff", borderRadius: 18, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, color: "#111" }}>{title}</h2>
          <button type="button" onClick={() => setModal(null)} aria-label="Cerrar" style={{ border: 0, background: "none", fontSize: 28, cursor: "pointer" }}>×</button>
        </div>
        <p style={{ color: "#555", lineHeight: 1.5 }}>
          {modal === "forgot" && "Ingresá el correo de tu cuenta y te enviaremos un enlace para crear una nueva contraseña."}
          {modal === "resend" && "Ingresá el correo usado al registrarte. Si la cuenta todavía no está confirmada, te enviaremos un nuevo correo de verificación."}
          {modal === "password" && "Elegí una nueva contraseña para tu cuenta."}
        </p>

        {modal !== "password" ? (
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo electrónico" autoFocus style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid #ccc", marginBottom: 12 }} />
        ) : (
          <>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Nueva contraseña" autoFocus style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid #ccc", marginBottom: 10 }} />
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repetir contraseña" style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid #ccc", marginBottom: 12 }} />
          </>
        )}

        {message && <div style={{ background: "#f4f4f4", borderRadius: 10, padding: 12, marginBottom: 12, lineHeight: 1.45 }}>{message}</div>}

        <button type="button" disabled={loading} onClick={modal === "forgot" ? sendRecovery : modal === "resend" ? resendVerification : updatePassword} style={{ width: "100%", border: 0, borderRadius: 10, padding: "13px 16px", background: "#b5121b", color: "#fff", fontWeight: 700, cursor: loading ? "wait" : "pointer" }}>
          {loading ? "Enviando..." : modal === "forgot" ? "Enviar recuperación" : modal === "resend" ? "Reenviar correo" : "Guardar nueva contraseña"}
        </button>
      </section>
    </div>
  );
}

function AccountRepair() {
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    const ensure = async (session) => {
      if (!mounted || !session?.user) return;
      try { await supabase.rpc("ensure_player_profile"); } catch (_) {}
    };
    supabase.auth.getSession().then(({ data }) => ensure(data?.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => ensure(session));
    return () => { mounted = false; data?.subscription?.unsubscribe(); };
  }, []);
  return null;
}

function MediaPickerEnhancer() {
  useEffect(() => {
    const enhance = () => {
      document.querySelectorAll('input[type="file"][accept*="image"]').forEach((input) => {
        input.removeAttribute("capture");
      });
      document.querySelectorAll(".file-button").forEach((button) => {
        const text = button.textContent || "";
        if (/selfie|foto|subir|cambiar|elegir/i.test(text) && !/galer/i.test(text)) {
          button.textContent = "📷 Cámara / Galería";
        }
      });
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}

function DualPlayerDashboard({ session, player: initialPlayer, onSwitchAdmin, onLogout }) {
  const [player, setPlayer] = useState(initialPlayer);
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      const p = await supabase.from("players").select("*").eq("user_id", session.user.id).eq("active", true).maybeSingle();
      if (!mounted) return;
      if (p.data) setPlayer(p.data);
      const playerId = p.data?.id || initialPlayer?.id;
      if (!playerId) return;
      const r = await supabase.from("attendance").select("session_id,status,training_sessions(session_date,activity_type)").eq("player_id", playerId).order("session_id");
      if (!mounted) return;
      setRows((r.data || []).map(x => ({
        session_date: x.training_sessions?.session_date,
        activity_type: x.training_sessions?.activity_type,
        status: x.status,
        session_id: x.session_id,
      })));
    }
    load();
    return () => { mounted = false; };
  }, [session.user.id, initialPlayer?.id]);

  if (!player) return <main className="loading-screen">Cargando tu perfil...</main>;

  const counts = {
    present: rows.filter(r => r.status === "present").length,
    late: rows.filter(r => r.status === "late").length,
    absent: rows.filter(r => r.status === "absent").length,
  };
  const { data: photoData } = player.selfie_path ? supabase.storage.from("player-selfies").getPublicUrl(player.selfie_path) : { data: null };

  return (
    <main className="player-app">
      <header className="topbar">
        <div className="brand compact"><img src={LOGO} alt="MGSM VOLEY MENDOZA"/><div><strong>{APP_NAME}</strong><span>{TAGLINE}</span></div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" onClick={onSwitchAdmin}>👨‍🏫 Ir a Profe</button>
          <button type="button" onClick={onLogout}>Salir</button>
        </div>
      </header>

      <div className="player-wrap">
        <section className="hero-profile card">
          {player.selfie_path ? <img className="avatar photo" src={photoData?.publicUrl} alt=""/> : <div className="avatar">{player.full_name?.charAt(0)?.toUpperCase() || "J"}</div>}
          <div className="grow">
            <span className="eyebrow">Mi perfil · Jugador@</span>
            <h1>{player.full_name}</h1>
            <p>{player.team ? `Equipo ${player.team}` : "Sin asignar"}</p>
          </div>
          <button className="profile-edit-btn" onClick={() => setEditing(true)}>✏️ Editar mis datos</button>
        </section>

        <div className="stats">
          <div className="card"><b>{counts.present}</b><span>Presentes</span></div>
          <div className="card"><b>{counts.late}</b><span>Tardanzas</span></div>
          <div className="card"><b>{counts.absent}</b><span>Ausencias</span></div>
        </div>

        <div className="card access-box">
          <span>Tu código personal</span>
          <strong>{player.access_code || "—"}</strong>
          <button type="button" onClick={() => navigator.clipboard?.writeText(player.access_code || "").then(() => setMessage("✓ Código copiado."))}>📋 Copiar código</button>
        </div>

        <div className="card">
          <div className="card-head"><h2>Mi asistencia</h2></div>
          <div className="simple-list">
            {rows.length ? rows.map((r, i) => (
              <div className="history-row" key={r.session_id || i}>
                <div className="grow"><b>{dateText(r.session_date)}</b><span>{TYPES[r.activity_type] || "Actividad"}</span></div>
                <span className={`badge ${r.status}`}>{STATUS[r.status] || r.status}</span>
              </div>
            )) : <div className="empty">Todavía no tenés asistencias registradas.</div>}
          </div>
        </div>
        {message && <div className="message">{message}</div>}
      </div>

      {editing && <DualPlayerEdit player={player} onClose={() => setEditing(false)} onSaved={(updated) => { setPlayer(updated); setEditing(false); setMessage("✓ Perfil actualizado correctamente."); }} />}
    </main>
  );
}

function DualPlayerEdit({ player, onClose, onSaved }) {
  const [data, setData] = useState({
    first: player.first_name || "",
    last: player.last_name || "",
    dni: player.dni || "",
    birth: player.birth_date || "",
    sex: player.sex || "female",
    file: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      let categoryId = player.category_id || null;
      const cat = await supabase.rpc("calculate_player_category", { p_birth_date: data.birth, p_sex: data.sex });
      if (!cat.error && cat.data) categoryId = cat.data;

      const r = await supabase.from("players").update({
        first_name: data.first.trim(),
        last_name: data.last.trim(),
        full_name: `${data.last.trim().toUpperCase()} ${data.first.trim()}`,
        dni: data.dni.trim() || null,
        birth_date: data.birth || null,
        sex: data.sex,
        category_id: categoryId,
      }).eq("id", player.id).select().single();
      if (r.error) throw r.error;
      let updated = r.data;

      if (data.file) {
        const safeName = data.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${player.user_id}/${Date.now()}-${safeName}`;
        const up = await supabase.storage.from("player-selfies").upload(path, data.file, { upsert: true, contentType: data.file.type || "image/jpeg" });
        if (up.error) throw up.error;
        const ur = await supabase.from("players").update({ selfie_path: path }).eq("id", player.id).select().single();
        if (ur.error) throw ur.error;
        updated = ur.data;
      }
      onSaved(updated);
    } catch (e) {
      setError(e?.message || "No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal">
      <div className="modal-card">
        <div className="modal-head"><h2>Mi perfil</h2><button type="button" onClick={onClose}>×</button></div>
        <form onSubmit={save}>
          <div className="two">
            <input required value={data.first} placeholder="Nombre" onChange={e => setData(d => ({ ...d, first: e.target.value }))}/>
            <input required value={data.last} placeholder="Apellido" onChange={e => setData(d => ({ ...d, last: e.target.value }))}/>
          </div>
          <div className="two">
            <select value={data.sex} onChange={e => setData(d => ({ ...d, sex: e.target.value }))}><option value="female">Femenino</option><option value="male">Masculino</option></select>
            <input value={data.dni} placeholder="DNI" onChange={e => setData(d => ({ ...d, dni: e.target.value }))}/>
          </div>
          <input type="date" value={data.birth} onChange={e => setData(d => ({ ...d, birth: e.target.value }))}/>
          <label className="selfie-field">
            <span>Foto / Selfie</span>
            <span className="file-button" onClick={() => fileRef.current?.click()}>📷 Cámara / Galería</span>
            <input ref={fileRef} className="hidden-file" type="file" accept="image/*" onChange={e => setData(d => ({ ...d, file: e.target.files?.[0] || null }))}/>
            {data.file && <span className="file-name">✓ {data.file.name}</span>}
          </label>
          {error && <div className="message">{error}</div>}
          <div className="form-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</button></div>
        </form>
      </div>
    </div>
  );
}

function DualRoleRouter() {
  const [session, setSession] = useState(null);
  const [dualPlayer, setDualPlayer] = useState(null);
  const [isDual, setIsDual] = useState(false);
  const [adminVisible, setAdminVisible] = useState(false);

  useEffect(() => {
    let mounted = true;

    const rememberModeFromClick = (event) => {
      const button = event.target.closest(".auth-tabs button");
      if (!button) return;
      const text = (button.textContent || "").toLowerCase();
      if (text.includes("jugador")) localStorage.setItem("voley_access_mode", "player");
      if (text.includes("profe")) localStorage.setItem("voley_access_mode", "admin");
    };
    document.addEventListener("click", rememberModeFromClick, true);

    async function evaluate(nextSession) {
      if (!mounted) return;
      setSession(nextSession || null);
      if (!nextSession?.user) {
        setDualPlayer(null);
        setIsDual(false);
        setAdminVisible(false);
        return;
      }

      const [profileResult, playerResult] = await Promise.all([
        supabase.from("profiles").select("id,full_name,role").eq("id", nextSession.user.id).maybeSingle(),
        supabase.from("players").select("*").eq("user_id", nextSession.user.id).eq("active", true).maybeSingle(),
      ]);
      if (!mounted) return;

      const canAdmin = ["admin", "super_admin"].includes(profileResult.data?.role);
      const hasPlayer = !!playerResult.data;
      const dual = canAdmin && hasPlayer;
      setIsDual(dual);

      const preferred = localStorage.getItem("voley_access_mode");
      if (dual && preferred === "player") {
        setDualPlayer(playerResult.data);
        setAdminVisible(false);
      } else {
        setDualPlayer(null);
        setAdminVisible(dual && canAdmin);
      }
    }

    supabase.auth.getSession().then(({ data }) => evaluate(data?.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => evaluate(nextSession));

    return () => {
      mounted = false;
      document.removeEventListener("click", rememberModeFromClick, true);
      data?.subscription?.unsubscribe();
    };
  }, []);

  async function switchAdmin() {
    localStorage.setItem("voley_access_mode", "admin");
    setDualPlayer(null);
    setAdminVisible(true);
  }

  async function switchPlayer() {
    if (!session?.user) return;
    const p = await supabase.from("players").select("*").eq("user_id", session.user.id).eq("active", true).maybeSingle();
    if (!p.data) return;
    localStorage.setItem("voley_access_mode", "player");
    setDualPlayer(p.data);
    setAdminVisible(false);
  }

  async function logout() {
    localStorage.removeItem("voley_access_mode");
    localStorage.removeItem("voley_player");
    setDualPlayer(null);
    setIsDual(false);
    setAdminVisible(false);
    await supabase.auth.signOut();
  }

  if (dualPlayer && session) {
    return <DualPlayerDashboard session={session} player={dualPlayer} onSwitchAdmin={switchAdmin} onLogout={logout}/>;
  }

  return (
    <>
      <AppNew />
      <ProfessorSelfSignup />
      {isDual && adminVisible && (
        <button
          type="button"
          onClick={switchPlayer}
          style={{ position: "fixed", right: 18, bottom: 18, zIndex: 9998, border: 0, borderRadius: 999, padding: "12px 16px", background: "#111", color: "#fff", fontWeight: 800, boxShadow: "0 8px 24px rgba(0,0,0,.22)", cursor: "pointer" }}
        >
          🏐 Ir a mi perfil de Jugador@
        </button>
      )}
    </>
  );
}

export default function App() {
  return <><AuthRecovery /><AccountRepair /><MediaPickerEnhancer /><DualRoleRouter /></>;
}

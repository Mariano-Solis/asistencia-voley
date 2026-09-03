import { useEffect, useState } from "react";
import AppNew from "./AppNew";
import ProfessorSelfSignup from "./ProfessorSelfSignup";
import { supabase } from "./supabase";

const PUBLIC_APP_URL = "https://asistencia-voley.vercel.app/";

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
      setMessage("✓ Contraseña actualizada. Ya podés ingresar como Jugador@.");
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

function PlayerSelfEdit() {
  const [session, setSession] = useState(null);
  const [player, setPlayer] = useState(null);
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [dni, setDni] = useState("");
  const [birth, setBirth] = useState("");
  const [sex, setSex] = useState("female");
  const [selfie, setSelfie] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function hydrate(p) {
    setFirst(p.first_name || "");
    setLast(p.last_name || "");
    setDni(p.dni || "");
    setBirth(p.birth_date || "");
    setSex(p.sex === "male" ? "male" : "female");
    setSelfie(null);
    setMessage("");
  }

  async function loadAuth(authSession) {
    if (!authSession?.user || !supabase) return false;
    const uid = authSession.user.id;
    const profile = await supabase.from("profiles").select("id,role").eq("id", uid).maybeSingle();
    if (profile.error || profile.data?.role !== "player") return false;
    const result = await supabase.from("players").select("id,user_id,first_name,last_name,full_name,dni,birth_date,sex,selfie_path,access_code,active").eq("user_id", uid).maybeSingle();
    if (result.error || !result.data) return false;
    setSession(authSession);
    setPlayer(result.data);
    hydrate(result.data);
    return true;
  }

  async function loadLegacy() {
    if (!supabase) return;
    try {
      const legacy = JSON.parse(localStorage.getItem("voley_player") || "null");
      if (!legacy?.legacy || !legacy.id || !legacy.code) return;
      const result = await supabase.from("players").select("id,user_id,first_name,last_name,full_name,dni,birth_date,sex,selfie_path,access_code,active").eq("id", legacy.id).maybeSingle();
      if (result.error || !result.data || !result.data.active) return;
      setSession({ legacy: true, id: result.data.id, code: legacy.code, name: result.data.full_name });
      setPlayer(result.data);
      hydrate(result.data);
    } catch (_) {}
  }

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const ok = await loadAuth(data?.session);
      if (!ok && mounted) await loadLegacy();
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted && nextSession) loadAuth(nextSession);
    });
    return () => { mounted = false; data?.subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    const removeDuplicate = () => {
      document.querySelectorAll(".profile-edit-btn, button, a").forEach((el) => {
        const text = String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (el.classList?.contains("profile-edit-btn") || text === "editar mis datos" || text.includes("✏️ editar mis datos")) el.remove();
      });
    };
    removeDuplicate();
    const observer = new MutationObserver(removeDuplicate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function save() {
    if (!player || !session) return;
    if (!first.trim() || !last.trim() || !birth) {
      setMessage("Completá nombre, apellido y fecha de nacimiento.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      let selfiePath = null;
      if (selfie) {
        const owner = player.user_id || `legacy-${player.id}`;
        selfiePath = `${owner}/${Date.now()}-${selfie.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const upload = await supabase.storage.from("player-selfies").upload(selfiePath, selfie, { upsert: false, contentType: selfie.type || "image/jpeg" });
        if (upload.error) throw upload.error;
      }

      const result = session.legacy
        ? await supabase.rpc("player_update_by_code", { p_player_id: player.id, p_code: session.code, p_first_name: first.trim(), p_last_name: last.trim(), p_dni: dni.trim(), p_birth_date: birth, p_sex: sex, p_selfie_path: selfiePath })
        : await supabase.rpc("player_update_own_profile", { p_first_name: first.trim(), p_last_name: last.trim(), p_dni: dni.trim(), p_birth_date: birth, p_sex: sex, p_selfie_path: selfiePath });
      if (result.error) throw result.error;

      const updated = result.data?.player;
      if (updated) { setPlayer(updated); hydrate(updated); }
      setMessage("✓ Datos actualizados correctamente.");
      setTimeout(() => setOpen(false), 900);
    } catch (e) {
      setMessage(e?.message || "No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }

  if (!player || !session) return null;

  return (
    <>
      {!session.legacy && <button className="player-self-edit-fab" type="button" onClick={() => { setMessage(""); setOpen(true); }}>✏️ Mis datos</button>}
      {open && (
        <div className="player-self-edit-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <section className="player-self-edit-modal" role="dialog" aria-modal="true" aria-label="Editar mis datos">
            <div className="player-self-edit-head"><div><span className="player-self-edit-kicker">MI PERFIL</span><h2>Mis datos</h2><p>Solo vos podés modificar tus datos personales.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar">×</button></div>
            <div className="player-self-edit-grid">
              <label>Nombre<input value={first} onChange={e => setFirst(e.target.value)} /></label>
              <label>Apellido<input value={last} onChange={e => setLast(e.target.value)} /></label>
              <label>DNI<input value={dni} onChange={e => setDni(e.target.value)} inputMode="numeric" /></label>
              <label>Sexo<select value={sex} onChange={e => setSex(e.target.value)}><option value="female">Femenino</option><option value="male">Masculino</option></select></label>
              <label className="player-self-edit-full">Fecha de nacimiento<input type="date" value={birth} onChange={e => setBirth(e.target.value)} /></label>
              <label className="player-self-edit-full">Nueva selfie<input type="file" accept="image/*" capture="user" onChange={e => setSelfie(e.target.files?.[0] || null)} /></label>
            </div>
            {message && <div className="player-self-edit-message">{message}</div>}
            <div className="player-self-edit-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancelar</button><button type="button" className="primary" disabled={saving} onClick={save}>{saving ? "Guardando..." : "Guardar cambios"}</button></div>
          </section>
        </div>
      )}
    </>
  );
}

export default function App() {
  return <><AuthRecovery /><AccountRepair /><AppNew /><PlayerSelfEdit /><ProfessorSelfSignup /></>;
}

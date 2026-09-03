import { useEffect, useState } from "react";
import AppNew from "./AppNew";
import ProfessorSelfSignup from "./ProfessorSelfSignup";
import { supabase } from "./supabase";

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

  // El boton antiguo vive dentro de AppNew. Se elimina de forma global,
  // independientemente de que este componente haya cargado el perfil.
  useEffect(() => {
    const removeDuplicate = () => {
      document.querySelectorAll(".profile-edit-btn, button, a").forEach((el) => {
        const text = String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (el.classList?.contains("profile-edit-btn") || text === "editar mis datos" || text.includes("✏️ editar mis datos")) {
          el.remove();
        }
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
        const upload = await supabase.storage.from("player-selfies").upload(selfiePath, selfie, {
          upsert: false,
          contentType: selfie.type || "image/jpeg"
        });
        if (upload.error) throw upload.error;
      }

      const result = session.legacy
        ? await supabase.rpc("player_update_by_code", { p_player_id: player.id, p_code: session.code, p_first_name: first.trim(), p_last_name: last.trim(), p_dni: dni.trim(), p_birth_date: birth, p_sex: sex, p_selfie_path: selfiePath })
        : await supabase.rpc("player_update_own_profile", { p_first_name: first.trim(), p_last_name: last.trim(), p_dni: dni.trim(), p_birth_date: birth, p_sex: sex, p_selfie_path: selfiePath });
      if (result.error) throw result.error;

      const updated = result.data?.player;
      if (updated) {
        setPlayer(updated);
        hydrate(updated);
      }
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
            <div className="player-self-edit-head">
              <div><span className="player-self-edit-kicker">MI PERFIL</span><h2>Mis datos</h2><p>Solo vos podés modificar tus datos personales.</p></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
            </div>
            <div className="player-self-edit-grid">
              <label>Nombre<input value={first} onChange={e => setFirst(e.target.value)} /></label>
              <label>Apellido<input value={last} onChange={e => setLast(e.target.value)} /></label>
              <label>DNI<input value={dni} onChange={e => setDni(e.target.value)} inputMode="numeric" /></label>
              <label>Sexo<select value={sex} onChange={e => setSex(e.target.value)}><option value="female">Femenino</option><option value="male">Masculino</option></select></label>
              <label className="player-self-edit-full">Fecha de nacimiento<input type="date" value={birth} onChange={e => setBirth(e.target.value)} /></label>
              <label className="player-self-edit-full">Nueva selfie<input type="file" accept="image/*" capture="user" onChange={e => setSelfie(e.target.files?.[0] || null)} /></label>
            </div>
            {message && <div className="player-self-edit-message">{message}</div>}
            <div className="player-self-edit-actions">
              <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancelar</button>
              <button type="button" className="primary" disabled={saving} onClick={save}>{saving ? "Guardando..." : "Guardar cambios"}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default function App() {
  return <><AccountRepair /><AppNew /><PlayerSelfEdit /><ProfessorSelfSignup /></>;
}

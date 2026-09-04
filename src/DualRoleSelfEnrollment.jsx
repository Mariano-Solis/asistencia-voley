import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

export default function DualRoleSelfEnrollment() {
  const [eligible, setEligible] = useState(false);
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [sex, setSex] = useState("female");
  const [dni, setDni] = useState("");
  const [birth, setBirth] = useState("");
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function check(session) {
      if (!mounted || !session?.user) {
        setEligible(false);
        setOpen(false);
        return;
      }

      const [profileResult, playerResult] = await Promise.all([
        supabase.from("profiles").select("id,full_name,role").eq("id", session.user.id).maybeSingle(),
        supabase.from("players").select("id").eq("user_id", session.user.id).eq("active", true).maybeSingle(),
      ]);
      if (!mounted) return;

      const canAdmin = ["admin", "super_admin"].includes(profileResult.data?.role);
      setEligible(canAdmin && !playerResult.data);

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

      localStorage.setItem("voley_access_mode", "player");
      setMessage("✓ Tu acceso como Jugador@ quedó creado. Entrando a tu perfil...");
      setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setMessage(error?.message || "No se pudo crear tu perfil de Jugador@.");
    } finally {
      setSaving(false);
    }
  }

  if (!eligible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => { setMessage(""); setOpen(true); }}
        style={{ position: "fixed", right: 18, bottom: 18, zIndex: 9997, border: 0, borderRadius: 999, padding: "12px 16px", background: "#111", color: "#fff", fontWeight: 800, boxShadow: "0 8px 24px rgba(0,0,0,.22)", cursor: "pointer" }}
      >
        🏐 También soy Jugador@
      </button>

      {open && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Crear acceso de Jugador@">
          <div className="modal-card">
            <div className="modal-head">
              <div><span className="eyebrow">DOBLE FUNCIÓN</span><h2>También soy Jugador@</h2></div>
              <button type="button" onClick={() => setOpen(false)}>×</button>
            </div>
            <p>Conservás intacto tu acceso de Profe/Super Admin y agregás tu perfil deportivo a la misma cuenta.</p>

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
                <button type="button" onClick={() => setOpen(false)}>Cancelar</button>
                <button className="primary" disabled={saving}>{saving ? "Creando..." : "Crear mi acceso de Jugador@"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

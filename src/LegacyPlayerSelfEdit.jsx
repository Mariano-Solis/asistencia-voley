import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const PLAYER_KEY = "voley_player";

function clean(v) {
  return String(v ?? "").trim();
}

function hydratePlayer(p, setters) {
  setters.first(p?.first_name || "");
  setters.last(p?.last_name || "");
  setters.dni(p?.dni || "");
  setters.birth(p?.birth_date || "");
  setters.sex(p?.sex === "male" ? "male" : "female");
}

export default function LegacyPlayerSelfEdit() {
  const [player, setPlayer] = useState(null);
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [dni, setDni] = useState("");
  const [birth, setBirth] = useState("");
  const [sex, setSex] = useState("female");
  const [selfie, setSelfie] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    if (!supabase || typeof window === "undefined") return;
    try {
      const legacy = JSON.parse(localStorage.getItem(PLAYER_KEY) || "null");
      if (!legacy?.legacy || !legacy.id || !legacy.code) {
        setPlayer(null);
        return;
      }

      // Legacy players are intentionally not readable directly through the
      // players table because RLS protects that table. This RPC validates the
      // player id + personal code and returns only the player's own fields.
      const result = await supabase.rpc("player_profile_by_code", {
        p_player_id: legacy.id,
        p_code: clean(legacy.code).toUpperCase(),
      });

      if (result.error || !result.data?.ok || !result.data?.player?.active) {
        setPlayer(null);
        return;
      }

      const current = result.data.player;
      setPlayer(current);
      setCode(clean(legacy.code).toUpperCase());
      hydratePlayer(current, { first: setFirst, last: setLast, dni: setDni, birth: setBirth, sex: setSex });
    } catch (_) {
      setPlayer(null);
    }
  };

  useEffect(() => {
    load();
    const onStorage = (event) => {
      if (!event.key || event.key === PLAYER_KEY) load();
    };
    const onFocus = () => load();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const uploadLegacySelfie = async (file) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/player-selfie-upload`;
    const form = new FormData();
    form.append("player_id", player.id);
    form.append("code", code);
    form.append("file", file);

    const response = await fetch(url, { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) throw new Error(data?.error || "No se pudo cargar la selfie.");
    return data.path;
  };

  const save = async () => {
    if (!player || !code) return;
    if (!clean(first) || !clean(last) || !birth) {
      setMessage("Completá nombre, apellido y fecha de nacimiento.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      let selfiePath = null;
      if (selfie) selfiePath = await uploadLegacySelfie(selfie);

      const result = await supabase.rpc("player_update_by_code", {
        p_player_id: player.id,
        p_code: code,
        p_first_name: clean(first),
        p_last_name: clean(last),
        p_dni: clean(dni),
        p_birth_date: birth,
        p_sex: sex,
        p_selfie_path: selfiePath,
      });

      if (result.error) throw result.error;

      const updated = result.data?.player || {
        ...player,
        first_name: clean(first),
        last_name: clean(last),
        full_name: `${clean(last).toUpperCase()} ${clean(first)}`,
        dni: clean(dni) || null,
        birth_date: birth,
        sex,
        selfie_path: selfiePath || player.selfie_path,
      };

      setPlayer(updated);
      hydratePlayer(updated, { first: setFirst, last: setLast, dni: setDni, birth: setBirth, sex: setSex });
      setSelfie(null);
      setMessage("✓ Datos actualizados correctamente.");
      setTimeout(() => setOpen(false), 900);
    } catch (e) {
      setMessage(e?.message || "No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
    }
  };

  if (!player) return null;

  return (
    <>
      <button
        className="player-self-edit-fab legacy-player-self-edit-fab"
        type="button"
        onClick={() => { setMessage(""); setOpen(true); }}
        aria-label="Editar mis datos"
      >
        ✏️ Mis datos
      </button>

      {open && (
        <div
          className="player-self-edit-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setOpen(false);
          }}
        >
          <section className="player-self-edit-modal" role="dialog" aria-modal="true" aria-label="Editar mis datos">
            <div className="player-self-edit-head">
              <div>
                <strong>Mis datos</strong>
                <span>Actualizá tu información personal</span>
              </div>
              <button type="button" onClick={() => !saving && setOpen(false)} aria-label="Cerrar">×</button>
            </div>

            <div className="player-self-edit-form">
              <div className="two">
                <label>Nombre<input value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" /></label>
                <label>Apellido<input value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" /></label>
              </div>
              <div className="two">
                <label>DNI<input value={dni} onChange={(e) => setDni(e.target.value)} inputMode="numeric" /></label>
                <label>Sexo<select value={sex} onChange={(e) => setSex(e.target.value)}><option value="female">Femenino</option><option value="male">Masculino</option></select></label>
              </div>
              <label>Fecha de nacimiento<input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} /></label>

              <label className="selfie-field">
                <span>Selfie</span>
                <span className="file-button">📷 {selfie ? "Cambiar selfie" : "Cargar mi selfie"}</span>
                <input className="hidden-file" type="file" accept="image/*" capture="user" onChange={(e) => setSelfie(e.target.files?.[0] || null)} />
                {selfie && <span className="file-name">✓ {selfie.name}</span>}
              </label>

              {message && <div className="message">{message}</div>}

              <div className="player-self-edit-actions">
                <button type="button" className="secondary" onClick={() => !saving && setOpen(false)}>Cancelar</button>
                <button type="button" className="primary" disabled={saving} onClick={save}>{saving ? "Guardando..." : "Guardar cambios"}</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

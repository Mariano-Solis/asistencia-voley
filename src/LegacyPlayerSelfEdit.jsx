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
      const raw = localStorage.getItem(PLAYER_KEY);
      const legacy = JSON.parse(raw || "null");
      if (!legacy?.legacy || !legacy.id || !legacy.code) {
        setPlayer(null);
        return;
      }

      const result = await supabase
        .from("players")
        .select("id,user_id,first_name,last_name,full_name,dni,birth_date,sex,selfie_path,access_code,active")
        .eq("id", legacy.id)
        .maybeSingle();

      if (result.error || !result.data?.active) {
        setPlayer(null);
        return;
      }

      setPlayer(result.data);
      setCode(clean(legacy.code).toUpperCase());
      hydratePlayer(result.data, { first: setFirst, last: setLast, dni: setDni, birth: setBirth, sex: setSex });
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

  const save = async () => {
    if (!player || !code) return;
    if (!clean(first) || !clean(last) || !birth) {
      setMessage("Completá nombre, apellido y fecha de nacimiento.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      // Legacy access is deliberately handled by the protected RPC. The player
      // never receives permission to update administrative columns directly.
      // The selfie is sent only when the legacy storage path is already usable.
      let selfiePath = null;

      if (selfie) {
        // Legacy players have no auth.uid(). Keep the same folder convention
        // used by the existing player-selfie flow. If Storage rejects the upload,
        // the profile data is not partially saved and the user gets a clear error.
        const path = `legacy-${player.id}/${Date.now()}-${selfie.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const upload = await supabase.storage.from("player-selfies").upload(path, selfie, {
          upsert: false,
          contentType: selfie.type || "image/jpeg",
        });
        if (upload.error) throw upload.error;
        selfiePath = path;
      }

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
        onClick={() => {
          setMessage("");
          setOpen(true);
        }}
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
                <input
                  className="hidden-file"
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={(e) => setSelfie(e.target.files?.[0] || null)}
                />
                {selfie && <span className="file-name">✓ {selfie.name}</span>}
              </label>

              {message && <div className="message">{message}</div>}

              <div className="player-self-edit-actions">
                <button type="button" className="secondary" onClick={() => !saving && setOpen(false)}>Cancelar</button>
                <button type="button" className="primary" disabled={saving} onClick={save}>
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

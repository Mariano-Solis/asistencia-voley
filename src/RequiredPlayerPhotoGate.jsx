import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { isAuthSession } from "./sessionSafety";
import { playerPhotoPath, preparePlayerPhoto } from "./playerPhoto";

export default function RequiredPlayerPhotoGate() {
  const [session, setSession] = useState(null);
  const [player, setPlayer] = useState(null);
  const [checking, setChecking] = useState(true);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const preview = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    let mounted = true;

    async function inspect(nextSession) {
      if (!mounted) return;
      setSession(nextSession || null);
      setChecking(true);
      setPlayer(null);
      setFile(null);
      setMessage("");

      if (!isAuthSession(nextSession)) {
        setChecking(false);
        return;
      }

      const uid = nextSession.user.id;
      const profileResult = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();

      if (!mounted) return;
      if (profileResult.error || profileResult.data?.role !== "player") {
        setChecking(false);
        return;
      }

      let playerResult = await supabase
        .from("players")
        .select("id,user_id,full_name,selfie_path")
        .eq("user_id", uid)
        .maybeSingle();

      if (!playerResult.data && !playerResult.error) {
        try { await supabase.rpc("ensure_player_profile"); } catch (_) {}
        playerResult = await supabase
          .from("players")
          .select("id,user_id,full_name,selfie_path")
          .eq("user_id", uid)
          .maybeSingle();
      }

      if (!mounted) return;
      setPlayer(playerResult.data || null);
      setChecking(false);
    }

    supabase.auth.getSession().then(({ data }) => inspect(data?.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => inspect(nextSession), 0);
    });

    return () => {
      mounted = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  if (checking || !isAuthSession(session) || !player || player.selfie_path) return null;

  function selectFile(event) {
    const selected = event.target.files?.[0] || event.target.__voleySelectedFile || null;
    setMessage("");
    if (!selected) {
      setFile(null);
      return;
    }
    if (!String(selected.type || "").startsWith("image/")) {
      setFile(null);
      setMessage("Seleccioná Una Imagen Para La Foto De Perfil.");
      return;
    }
    setFile(selected);
  }

  async function save() {
    if (!file || saving) return;
    setSaving(true);
    setMessage("");
    const uid = session.user.id;

    try {
      const prepared = await preparePlayerPhoto(file);
      const path = playerPhotoPath(uid, prepared);
      const upload = await supabase.storage
        .from("player-selfies")
        .upload(path, prepared, { upsert: false, contentType: prepared.type });
      if (upload.error) throw upload.error;

      const linked = await supabase
        .from("players")
        .update({ selfie_path: path })
        .eq("id", player.id)
        .eq("user_id", uid)
        .select("id,user_id,full_name,selfie_path")
        .single();

      if (linked.error || linked.data?.selfie_path !== path) {
        await supabase.storage.from("player-selfies").remove([path]);
        throw linked.error || new Error("No Se Pudo Vincular La Foto De Perfil.");
      }

      setPlayer(linked.data);
      setFile(null);
    } catch (error) {
      setMessage(error?.message || "No Se Pudo Guardar La Foto De Perfil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="required-photo-gate" role="dialog" aria-modal="true" aria-labelledby="required-photo-title">
      <section className="required-photo-card">
        <div className="required-photo-emblem">📷</div>
        <span className="required-photo-eyebrow">Identidad Del Jugador@</span>
        <h1 id="required-photo-title">Foto De Perfil</h1>
        <p>Agregá Tu Foto Para Completar Tu Perfil y Continuar.</p>

        {preview ? (
          <img className="required-photo-preview" src={preview} alt="Vista previa de la foto seleccionada" />
        ) : (
          <div className="required-photo-placeholder" aria-hidden="true">👤</div>
        )}

        <label className="selfie-field required-photo-field">
          <span>Foto De Perfil</span>
          <span className="file-button" role="button" tabIndex={0}>📷 Agregar Foto / Selfie</span>
          <input className="hidden-file" type="file" accept="image/*" onChange={selectFile} />
          {file && <span className="file-name">✓ Foto Seleccionada: {file.name}</span>}
        </label>

        {message && <div className="message">{message}</div>}
        <button type="button" className="primary required-photo-save" disabled={!file || saving} onClick={save}>
          {saving ? "Guardando Foto..." : "Guardar y Continuar"}
        </button>
      </section>
    </div>
  );
}

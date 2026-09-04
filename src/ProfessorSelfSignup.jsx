import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

const PUBLIC_APP_URL = "https://voleysanmartin.com.ar/";

export default function ProfessorSelfSignup() {
  const [portalTarget, setPortalTarget] = useState(null);
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [alsoPlayer, setAlsoPlayer] = useState(false);
  const [sex, setSex] = useState("female");
  const [dni, setDni] = useState("");
  const [birth, setBirth] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let host = null;

    const sync = () => {
      const card = document.querySelector(".auth-card");
      const activeTab = card?.querySelector(".auth-tabs button.active")?.textContent?.trim() || "";
      const shouldShow = activeTab === "Profe" || activeTab === "Crear cuenta";

      if (!card || !shouldShow) {
        if (host?.isConnected) host.remove();
        host = null;
        setPortalTarget(null);
        setOpen(false);
        return;
      }

      if (!host || !host.isConnected) {
        host = document.createElement("div");
        host.className = "professor-signup-inline-host";
        const subtitle = card.querySelector(".auth-subtitle");
        if (subtitle) subtitle.insertAdjacentElement("afterend", host);
        else card.appendChild(host);
      }

      setPortalTarget(host);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
      if (host?.isConnected) host.remove();
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    let activating = false;

    const activateConfirmedProfessor = async (session) => {
      if (!mounted || !session?.user || activating) return;

      const profileResult = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!mounted || profileResult.error || profileResult.data?.role !== "pending_admin") return;

      activating = true;
      try {
        const { data, error } = await supabase.rpc("activate_confirmed_professor");
        if (!mounted || error || !data?.ok) return;
        window.location.reload();
      } finally {
        activating = false;
      }
    };

    supabase.auth.getSession().then(({ data }) => activateConfirmedProfessor(data?.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => activateConfirmedProfessor(session), 0);
    });

    return () => {
      mounted = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  async function submit(e) {
    e.preventDefault();
    setMessage("");

    if (!first.trim() || !last.trim() || !email.trim() || password.length < 6) {
      setMessage("Completá nombre, apellido, correo y una contraseña de al menos 6 caracteres.");
      return;
    }

    if (alsoPlayer && (!dni.trim() || !birth)) {
      setMessage("Para registrarte también como Jugador@ completá DNI y fecha de nacimiento.");
      return;
    }

    setSaving(true);
    try {
      const role = alsoPlayer ? "professor_player_pending" : "professor_pending";
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: `${first.trim()} ${last.trim()}`,
            first_name: first.trim(),
            last_name: last.trim(),
            sex: alsoPlayer ? sex : null,
            dni: alsoPlayer ? dni.trim() : null,
            birth_date: alsoPlayer ? birth : null,
            role,
          },
          emailRedirectTo: PUBLIC_APP_URL,
        },
      });
      if (error) throw error;

      setFirst("");
      setLast("");
      setEmail("");
      setPassword("");
      setAlsoPlayer(false);
      setSex("female");
      setDni("");
      setBirth("");

      if (alsoPlayer) {
        setMessage(
          data.session
            ? "✓ Cuenta creada como Profe + Jugador@. Tu acceso de Profe quedó habilitado con la verificación de tu correo."
            : "✓ Cuenta creada como Profe + Jugador@. Revisá tu correo y confirmá la cuenta. Al confirmar, tu acceso de Profe quedará habilitado automáticamente."
        );
      } else {
        setMessage(
          data.session
            ? "✓ Cuenta de Profe creada y habilitada. Ya podés ingresar como Profe."
            : "✓ Cuenta de Profe creada. Revisá tu correo y confirmala. Al confirmar, el acceso de Profe quedará habilitado automáticamente."
        );
      }
    } catch (e) {
      setMessage(e?.message || "No se pudo crear la cuenta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {portalTarget && createPortal(
        <button
          className="professor-signup-inline-trigger"
          type="button"
          onClick={() => { setMessage(""); setOpen(true); }}
        >
          <span aria-hidden="true">👨‍🏫</span>
          <span>Crear cuenta de Profe</span>
        </button>,
        portalTarget
      )}

      {open && (
        <div className="professor-signup-overlay" role="dialog" aria-modal="true" aria-label="Crear cuenta de Profe">
          <div className="professor-signup-card">
            <div className="professor-signup-head">
              <div>
                <span className="professor-signup-kicker">MGSM VOLEY MENDOZA</span>
                <h2>Crear cuenta de Profe</h2>
                <p>Cada profe crea su propia cuenta. Si además juega, puede tener ambos accesos con la misma cuenta.</p>
              </div>
              <button type="button" className="professor-signup-close" onClick={() => setOpen(false)}>×</button>
            </div>

            <form onSubmit={submit} className="professor-signup-form">
              <div className="two">
                <input required placeholder="Nombre" value={first} onChange={e => setFirst(e.target.value)} />
                <input required placeholder="Apellido" value={last} onChange={e => setLast(e.target.value)} />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700 }}>
                <input type="checkbox" checked={alsoPlayer} onChange={e => setAlsoPlayer(e.target.checked)} style={{ width: 20, height: 20 }} />
                También soy Jugador@
              </label>

              {alsoPlayer && (
                <>
                  <div className="two">
                    <select value={sex} onChange={e => setSex(e.target.value)}>
                      <option value="female">Femenino</option>
                      <option value="male">Masculino</option>
                    </select>
                    <input required placeholder="DNI" value={dni} onChange={e => setDni(e.target.value)} />
                  </div>
                  <label className="field-label">
                    Fecha de nacimiento
                    <input required type="date" value={birth} onChange={e => setBirth(e.target.value)} />
                  </label>
                  <small>Tu categoría como Jugador@ se calculará automáticamente. La foto de perfil la podrás sacar con la cámara o elegir desde la galería al ingresar.</small>
                </>
              )}

              <input required type="email" placeholder="Correo electrónico" value={email} onChange={e => setEmail(e.target.value)} />
              <input required minLength={6} type="password" placeholder="Contraseña (mínimo 6 caracteres)" value={password} onChange={e => setPassword(e.target.value)} />
              <small>No necesitás ningún código. El acceso de Profe se habilita automáticamente cuando confirmás tu correo.</small>
              <button className="primary" disabled={saving}>{saving ? "Creando cuenta..." : alsoPlayer ? "Crear cuenta Profe + Jugador@" : "Crear mi cuenta de Profe"}</button>
            </form>

            {message && <div className="message">{message}</div>}
          </div>
        </div>
      )}
    </>
  );
}

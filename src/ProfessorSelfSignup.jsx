import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const PUBLIC_APP_URL = "https://voleysanmartin.com.ar/";

export default function ProfessorSelfSignup() {
  const [visible, setVisible] = useState(false);
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

  const [activationOpen, setActivationOpen] = useState(false);
  const [activationCode, setActivationCode] = useState("");
  const [activationMessage, setActivationMessage] = useState("");
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    const sync = () => setVisible(!!document.querySelector(".auth"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    const checkPendingProfessor = async (session) => {
      if (!mounted || !session?.user) {
        setActivationOpen(false);
        setActivationCode("");
        setActivationMessage("");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!mounted) return;
      setActivationOpen(data?.role === "pending_admin");
      if (data?.role !== "pending_admin") {
        setActivationCode("");
        setActivationMessage("");
      }
    };

    supabase.auth.getSession().then(({ data }) => checkPendingProfessor(data?.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => checkPendingProfessor(session), 0);
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
            ? "✓ Cuenta creada como Profe + Jugador@. Para activar el acceso de Profe te pediremos el código al ingresar."
            : "✓ Cuenta creada como Profe + Jugador@. Revisá tu correo para confirmarla. El código de Profe se pedirá recién al ingresar."
        );
      } else {
        setMessage(
          data.session
            ? "✓ Cuenta de Profe creada. Ahora se te pedirá el código para activar el acceso de Profe."
            : "✓ Cuenta de Profe creada. Revisá tu correo para confirmarla. El código se pedirá recién cuando ingreses."
        );
      }
    } catch (e) {
      setMessage(e?.message || "No se pudo crear la cuenta.");
    } finally {
      setSaving(false);
    }
  }

  async function activateProfessor(e) {
    e.preventDefault();
    setActivationMessage("");
    if (!activationCode.trim()) {
      setActivationMessage("Ingresá el código de acceso de Profe.");
      return;
    }

    setActivating(true);
    try {
      const { data, error } = await supabase.rpc("activate_professor_access", {
        p_code: activationCode.trim().toUpperCase(),
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || "No se pudo activar el acceso de Profe.");

      setActivationMessage("✓ Acceso de Profe activado correctamente. Entrando...");
      setTimeout(() => window.location.reload(), 650);
    } catch (e) {
      setActivationMessage(e?.message || "Código de acceso de Profe inválido.");
    } finally {
      setActivating(false);
    }
  }

  async function logoutPending() {
    setActivationOpen(false);
    setActivationCode("");
    setActivationMessage("");
    await supabase.auth.signOut();
    window.location.reload();
  }

  return (
    <>
      {visible && (
        <button className="professor-signup-trigger" type="button" onClick={() => { setMessage(""); setOpen(true); }}>
          👨‍🏫 Crear cuenta de Profe
        </button>
      )}

      {visible && open && (
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
                  <small>Tu categoría como Jugador@ se calculará automáticamente. La foto de perfil la podrás sacar o elegir desde la galería al ingresar.</small>
                </>
              )}

              <input required type="email" placeholder="Correo electrónico" value={email} onChange={e => setEmail(e.target.value)} />
              <input required minLength={6} type="password" placeholder="Contraseña (mínimo 6 caracteres)" value={password} onChange={e => setPassword(e.target.value)} />
              <small>Primero creás la cuenta. El código de acceso de Profe se pedirá recién después, cuando ingreses.</small>
              <button className="primary" disabled={saving}>{saving ? "Creando cuenta..." : alsoPlayer ? "Crear cuenta Profe + Jugador@" : "Crear mi cuenta de Profe"}</button>
            </form>

            {message && <div className="message">{message}</div>}
          </div>
        </div>
      )}

      {activationOpen && (
        <div className="professor-signup-overlay" role="dialog" aria-modal="true" aria-label="Activar acceso de Profe" style={{ zIndex: 100001 }}>
          <div className="professor-signup-card">
            <div className="professor-signup-head">
              <div>
                <span className="professor-signup-kicker">MGSM VOLEY MENDOZA</span>
                <h2>Activar acceso de Profe</h2>
                <p>Tu cuenta ya está creada. Ahora ingresá el código institucional para habilitar el panel de Profe.</p>
              </div>
            </div>

            <form onSubmit={activateProfessor} className="professor-signup-form">
              <input
                required
                autoFocus
                placeholder="Código de acceso de Profe"
                value={activationCode}
                onChange={e => setActivationCode(e.target.value.toUpperCase())}
              />
              <small>Este código ya no se pide para registrarte. Se usa únicamente para habilitar el acceso administrativo.</small>
              <button className="primary" disabled={activating}>{activating ? "Validando..." : "Ingresar como Profe"}</button>
              <button type="button" onClick={logoutPending} disabled={activating}>Salir</button>
            </form>

            {activationMessage && <div className="message">{activationMessage}</div>}
          </div>
        </div>
      )}
    </>
  );
}

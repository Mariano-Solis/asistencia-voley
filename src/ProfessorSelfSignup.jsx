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
  const [code, setCode] = useState("");
  const [alsoPlayer, setAlsoPlayer] = useState(false);
  const [sex, setSex] = useState("female");
  const [dni, setDni] = useState("");
  const [birth, setBirth] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

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

  async function submit(e) {
    e.preventDefault();
    setMessage("");
    if (!first.trim() || !last.trim() || !email.trim() || password.length < 6 || !code.trim()) {
      setMessage("Completá nombre, apellido, correo, contraseña y código de registro.");
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
            registration_code: code.trim(),
          },
          emailRedirectTo: PUBLIC_APP_URL,
        },
      });
      if (error) throw error;

      setFirst("");
      setLast("");
      setEmail("");
      setPassword("");
      setCode("");
      setAlsoPlayer(false);
      setSex("female");
      setDni("");
      setBirth("");

      if (alsoPlayer) {
        setMessage(
          data.session
            ? "✓ Cuenta creada como Profe + Jugador@. Podés usar el mismo correo y contraseña para ambos accesos."
            : "✓ Cuenta creada como Profe + Jugador@. Revisá tu correo para confirmarla. Después podrás entrar con el mismo correo y contraseña desde Profe o Jugador@s."
        );
      } else {
        setMessage(
          data.session
            ? "✓ Cuenta de Profe creada. Ya podés ingresar desde Profe."
            : "✓ Solicitud creada. Revisá tu correo para confirmar la cuenta y luego ingresá desde Profe."
        );
      }
    } catch (e) {
      setMessage(e?.message || "No se pudo crear la cuenta.");
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  return (
    <>
      <button className="professor-signup-trigger" type="button" onClick={() => { setMessage(""); setOpen(true); }}>
        👨‍🏫 Crear cuenta de Profe
      </button>

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
                  <small>Tu categoría como Jugador@ se calculará automáticamente. La foto de perfil la podrás sacar o elegir desde la galería al ingresar.</small>
                </>
              )}

              <input required type="email" placeholder="Correo electrónico" value={email} onChange={e => setEmail(e.target.value)} />
              <input required minLength={6} type="password" placeholder="Contraseña (mínimo 6 caracteres)" value={password} onChange={e => setPassword(e.target.value)} />
              <input required placeholder="Código de registro de Profe" value={code} onChange={e => setCode(e.target.value.toUpperCase())} />
              <small>El código evita que cualquier persona pueda registrarse como administradora.</small>
              <button className="primary" disabled={saving}>{saving ? "Creando cuenta..." : alsoPlayer ? "Crear cuenta Profe + Jugador@" : "Crear mi cuenta de Profe"}</button>
            </form>

            {message && <div className="message">{message}</div>}
          </div>
        </div>
      )}
    </>
  );
}

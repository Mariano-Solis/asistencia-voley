import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const PUBLIC_APP_URL = "https://asistencia-voley.vercel.app/";

export default function ProfessorSelfSignup() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
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
    if (!name.trim() || !email.trim() || password.length < 6 || !code.trim()) {
      setMessage("Completá nombre, correo, contraseña y código de registro.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: name.trim(),
            role: "professor_pending",
            registration_code: code.trim(),
          },
          emailRedirectTo: PUBLIC_APP_URL,
        },
      });
      if (error) throw error;
      setName("");
      setEmail("");
      setPassword("");
      setCode("");
      setMessage(
        data.session
          ? "✓ Cuenta de profe creada. Ya podés ingresar desde Profe."
          : "✓ Solicitud creada. Revisá tu correo para confirmar la cuenta y luego ingresá desde Profe."
      );
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
                <p>El mismo profe puede registrarse sin que tengas que crearle la cuenta.</p>
              </div>
              <button type="button" className="professor-signup-close" onClick={() => setOpen(false)}>×</button>
            </div>

            <form onSubmit={submit} className="professor-signup-form">
              <input required placeholder="Nombre y apellido" value={name} onChange={e => setName(e.target.value)} />
              <input required type="email" placeholder="Correo electrónico" value={email} onChange={e => setEmail(e.target.value)} />
              <input required minLength={6} type="password" placeholder="Contraseña (mínimo 6 caracteres)" value={password} onChange={e => setPassword(e.target.value)} />
              <input required placeholder="Código de registro de Profe" value={code} onChange={e => setCode(e.target.value.toUpperCase())} />
              <small>El código evita que cualquier persona pueda registrarse como administradora.</small>
              <button className="primary" disabled={saving}>{saving ? "Creando cuenta..." : "Crear mi cuenta de Profe"}</button>
            </form>

            {message && <div className="message">{message}</div>}
          </div>
        </div>
      )}
    </>
  );
}

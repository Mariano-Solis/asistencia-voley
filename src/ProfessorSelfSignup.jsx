import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

const PUBLIC_APP_URL = "https://voleysanmartin.com.ar/";

const normalizeSpaces = (value = "") => String(value).trim().replace(/\s+/g, " ");
const normalizeFirstName = (value = "") => normalizeSpaces(value)
  .toLocaleLowerCase("es-AR")
  .replace(/(^|[\s'-])([\p{L}])/gu, (_, separator, letter) => `${separator}${letter.toLocaleUpperCase("es-AR")}`);
const normalizeLastName = (value = "") => normalizeSpaces(value).toLocaleUpperCase("es-AR");

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
      const shouldShow = activeTab === "Profe" || activeTab === "Crear Cuenta";

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

  async function submit(e) {
    e.preventDefault();
    setMessage("");

    const normalizedFirst = normalizeFirstName(first);
    const normalizedLast = normalizeLastName(last);

    if (!normalizedFirst || !normalizedLast || !email.trim() || password.length < 6) {
      setMessage("Completá Nombre, Apellido, Correo y Una Contraseña De Al Menos 6 Caracteres.");
      return;
    }

    if (alsoPlayer && (!dni.trim() || !birth)) {
      setMessage("Para Registrarte También Como Jugador@ Completá DNI y Fecha De Nacimiento.");
      return;
    }

    setSaving(true);
    try {
      const role = alsoPlayer ? "professor_player_pending" : "professor_pending";
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: `${normalizedFirst} ${normalizedLast}`,
            first_name: normalizedFirst,
            last_name: normalizedLast,
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

      const verificationText = data.session
        ? "Tu Correo Ya Está Verificado."
        : "Revisá Tu Correo y Confirmá La Cuenta.";

      setMessage(
        alsoPlayer
          ? `✓ Solicitud Creada Como Profe + Jugador@. ${VerificationText} El Acceso De Profe Quedará Pendiente Hasta Que El Super Administrador Lo Apruebe; Tu Perfil De Jugador@ También Deberá Ser Aprobado Por Un Profe Autorizado O El Super Administrador.`
          : `✓ Solicitud De Profe Creada. ${VerificationText} El Acceso Quedará Pendiente Hasta Que El Super Administrador Confirme Que Pertenecés Al Cuerpo De Profes.`
      );
    } catch (e) {
      setMessage(e?.message || "No Se Pudo Crear La Cuenta.");
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
          <span>Crear Cuenta De Profe</span>
        </button>,
        portalTarget
      )}

      {open && (
        <div className="professor-signup-overlay" role="dialog" aria-modal="true" aria-label="Crear Cuenta De Profe">
          <div className="professor-signup-card">
            <div className="professor-signup-head">
              <div>
                <span className="professor-signup-kicker">MGSM VOLEY MENDOZA</span>
                <h2>Crear Cuenta De Profe</h2>
                <p>Cada Profe Crea Su Propia Cuenta. El Super Administrador Debe Aprobarla Antes De Habilitar El Acceso.</p>
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
                También Soy Jugador@
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
                    Fecha De Nacimiento
                    <input required type="date" value={birth} onChange={e => setBirth(e.target.value)} />
                  </label>
                  <small>Tu Categoría Como Jugador@ Se Calculará Automáticamente. Ese Perfil Quedará Pendiente De Aprobación Independiente.</small>
                </>
              )}

              <input required type="email" placeholder="Correo Electrónico" value={email} onChange={e => setEmail(e.target.value)} />
              <input required minLength={6} type="password" placeholder="Contraseña (Mínimo 6 Caracteres)" value={password} onChange={e => setPassword(e.target.value)} />
              <small>Nombre y Apellido Se Guardan Automáticamente Con El Formato Institucional. Confirmar El Correo No Habilita Por Sí Solo El Acceso De Profe: La Aprobación Del Super Administrador Es Obligatoria.</small>
              <div className="mgsm-turnstile-slot" data-turnstile-slot="professor-signup" />
              <button className="primary" disabled={saving}>{saving ? "Creando Solicitud..." : alsoPlayer ? "Solicitar Cuenta Profe + Jugador@" : "Solicitar Cuenta De Profe"}</button>
            </form>

            {message && <div className="message">{message}</div>}
          </div>
        </div>
      )}
    </>
  );
}

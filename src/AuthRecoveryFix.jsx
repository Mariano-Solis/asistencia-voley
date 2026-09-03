import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

const PUBLIC_APP_URL = "https://asistencia-voley.vercel.app/";

export default function AuthRecoveryFix() {
  const [target, setTarget] = useState(null);
  const [modal, setModal] = useState(null);
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    const onRecovery = (event) => {
      if (event === "PASSWORD_RECOVERY") {
        setModal("password");
        setMessage("");
        setNewPassword("");
        setConfirmPassword("");
      }
    };

    const { data } = supabase.auth.onAuthStateChange(onRecovery);
    return () => data?.subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    let lastCard = null;
    let lastEmailInput = null;

    const findLogin = () => {
      const cards = Array.from(document.querySelectorAll(".auth-card"));
      const card = cards.find((el) => {
        const text = (el.textContent || "").toLowerCase();
        return text.includes("acceso con código personal") && text.includes("correo electrónico");
      });

      if (!card) {
        if (lastCard !== null || lastEmailInput !== null) {
          lastCard = null;
          lastEmailInput = null;
          setTarget(null);
        }
        return;
      }

      const form = card.querySelector("form");
      if (!form) return;

      const emailInput = form.querySelector('input[type="email"]');
      const passwordInput = form.querySelector('input[type="password"]');
      if (!emailInput || !passwordInput) return;

      if (lastCard !== card || lastEmailInput !== emailInput) {
        lastCard = card;
        lastEmailInput = emailInput;
        setTarget({ card, emailInput });
      }
    };

    findLogin();

    const observer = new MutationObserver(() => {
      findLogin();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("resize", findLogin);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", findLogin);
    };
  }, []);

  useEffect(() => {
    const cleanOldControls = () => {
      document.querySelectorAll(".voley-auth-recovery-controls").forEach((el) => el.remove());
    };

    cleanOldControls();
    const observer = new MutationObserver(cleanOldControls);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (target?.emailInput) {
      setEmail(target.emailInput.value || "");
    }
  }, [target?.emailInput]);

  function openForgot() {
    const value = target?.emailInput?.value?.trim() || "";
    setEmail(value);
    setMessage("");
    setModal("forgot");
  }

  function openResend() {
    const value = target?.emailInput?.value?.trim() || "";
    setEmail(value);
    setMessage("");
    setModal("resend");
  }

  async function sendRecovery() {
    const value = email.trim().toLowerCase();
    if (!value) return setMessage("Ingresá tu correo electrónico.");

    setLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(value, {
        redirectTo: PUBLIC_APP_URL,
      });
      if (error) throw error;
      setMessage("✓ Correo enviado. Revisá Recibidos y Spam/Correo no deseado.");
    } catch (error) {
      setMessage(error?.message || "No se pudo enviar el correo de recuperación.");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    const value = email.trim().toLowerCase();
    if (!value) return setMessage("Ingresá el correo con el que te registraste.");

    setLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: value,
        options: { emailRedirectTo: PUBLIC_APP_URL },
      });
      if (error) throw error;
      setMessage("✓ Solicitud enviada. Revisá Recibidos y Spam/Correo no deseado.");
    } catch (error) {
      const text = String(error?.message || "");
      if (/already confirmed|confirmed/i.test(text)) {
        setMessage("Esta cuenta ya está verificada. Para recuperar el acceso usá «¿Olvidaste tu contraseña?». ");
      } else {
        setMessage(text || "No se pudo reenviar el correo de verificación.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function updatePassword() {
    if (newPassword.length < 6) {
      return setMessage("La nueva contraseña debe tener al menos 6 caracteres.");
    }
    if (newPassword !== confirmPassword) {
      return setMessage("Las contraseñas no coinciden.");
    }

    setLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMessage("✓ Contraseña actualizada. Ya podés ingresar como Jugador@.");
      setTimeout(() => setModal(null), 1200);
    } catch (error) {
      setMessage(error?.message || "No se pudo actualizar la contraseña.");
    } finally {
      setLoading(false);
    }
  }

  const controls = target?.card ? (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: 16,
        flexWrap: "wrap",
        margin: "10px 0 2px",
        position: "relative",
        zIndex: 5,
      }}
    >
      <button
        type="button"
        onClick={openForgot}
        style={{
          border: 0,
          background: "none",
          color: "#b5121b",
          textDecoration: "underline",
          cursor: "pointer",
          font: "inherit",
          padding: 6,
        }}
      >
        ¿Olvidaste tu contraseña?
      </button>
      <button
        type="button"
        onClick={openResend}
        style={{
          border: 0,
          background: "none",
          color: "#333",
          textDecoration: "underline",
          cursor: "pointer",
          font: "inherit",
          padding: 6,
        }}
      >
        📩 Reenviar correo de verificación
      </button>
    </div>
  ) : null;

  const modalView = modal ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "rgba(0,0,0,.68)",
        display: "grid",
        placeItems: "center",
        padding: 18,
      }}
    >
      <section
        style={{
          width: "min(430px,100%)",
          background: "#fff",
          borderRadius: 18,
          padding: 24,
          boxShadow: "0 24px 70px rgba(0,0,0,.35)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, color: "#111" }}>
            {modal === "forgot"
              ? "Recuperar contraseña"
              : modal === "resend"
                ? "Verificar cuenta"
                : "Nueva contraseña"}
          </h2>
          <button
            type="button"
            onClick={() => setModal(null)}
            style={{ border: 0, background: "none", fontSize: 28, cursor: "pointer" }}
          >
            ×
          </button>
        </div>

        <p style={{ color: "#555", lineHeight: 1.5 }}>
          {modal === "forgot" &&
            "Ingresá el correo de tu cuenta. Te enviaremos un enlace para crear una nueva contraseña."}
          {modal === "resend" &&
            "Ingresá el correo usado al registrarte. Si la cuenta todavía necesita confirmación, te enviaremos un nuevo correo."}
          {modal === "password" && "Elegí una nueva contraseña para tu cuenta."}
        </p>

        {modal === "password" ? (
          <>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nueva contraseña"
              autoFocus
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 12,
                borderRadius: 10,
                border: "1px solid #ccc",
                marginBottom: 10,
              }}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repetir contraseña"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 12,
                borderRadius: 10,
                border: "1px solid #ccc",
                marginBottom: 12,
              }}
            />
          </>
        ) : (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Correo electrónico"
            autoFocus
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: 12,
              borderRadius: 10,
              border: "1px solid #ccc",
              marginBottom: 12,
            }}
          />
        )}

        {message && (
          <div
            style={{
              background: "#f4f4f4",
              borderRadius: 10,
              padding: 12,
              marginBottom: 12,
              lineHeight: 1.45,
            }}
          >
            {message}
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={
            modal === "forgot"
              ? sendRecovery
              : modal === "resend"
                ? resendVerification
                : updatePassword
          }
          style={{
            width: "100%",
            border: 0,
            borderRadius: 10,
            padding: 13,
            background: "#b5121b",
            color: "#fff",
            fontWeight: 700,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading
            ? "Enviando..."
            : modal === "forgot"
              ? "Enviar recuperación"
              : modal === "resend"
                ? "Reenviar correo"
                : "Guardar nueva contraseña"}
        </button>
      </section>
    </div>
  ) : null;

  return (
    <>
      {target?.card && createPortal(controls, target.card)}
      {modalView && createPortal(modalView, document.body)}
    </>
  );
}

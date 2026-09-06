import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const OFFICIAL_PAYMENT = {
  alias: "comision.voley.mgsm",
  cvu: "0000003100057442515764",
  holder: "Pablo Javier Iglesias",
  provider: "Mercado Pago",
};

function translateTechnicalMessage(text) {
  const value = String(text || "").trim();
  if (!value) return value;

  const technicalPatterns = [
    /edge function/i,
    /non-2xx/i,
    /failed to fetch/i,
    /networkerror/i,
    /network request failed/i,
    /fetch failed/i,
    /jwt/i,
    /unauthorized/i,
    /forbidden/i,
    /internal server error/i,
  ];

  if (technicalPatterns.some((pattern) => pattern.test(value))) {
    return "✕ Comprobante no válido. No se pudo completar la verificación. Intentá nuevamente con un comprobante claro y correspondiente a la cuenta oficial de VOLEY.";
  }

  return value;
}

export default function PlayerPaymentDestination() {
  const [host, setHost] = useState(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const sync = () => {
      const wrap = document.querySelector("main.player-app .player-wrap");
      if (!wrap) {
        setHost(null);
        return;
      }

      let node = wrap.querySelector("[data-player-payment-destination-host]");
      if (!node) {
        node = document.createElement("div");
        node.setAttribute("data-player-payment-destination-host", "true");
        const accessBox = wrap.querySelector(".access-box");
        if (accessBox) wrap.insertBefore(node, accessBox);
        else wrap.prepend(node);
      }
      setHost(node);
    };

    const sanitizeMessages = () => {
      document.querySelectorAll(".payment-message, .payment-admin-section .message").forEach((node) => {
        const translated = translateTechnicalMessage(node.textContent);
        if (translated && translated !== node.textContent) node.textContent = translated;
      });
    };

    sync();
    sanitizeMessages();
    const observer = new MutationObserver(() => {
      sync();
      sanitizeMessages();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  async function copyValue(value, label) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1800);
  }

  if (!host) return null;

  return createPortal(
    <section className="player-payment-destination" aria-label="Cuenta oficial para transferencias">
      <div className="player-payment-destination-head">
        <span className="player-payment-destination-icon">💳</span>
        <div>
          <span className="player-payment-destination-eyebrow">CUENTA OFICIAL DE PAGO</span>
          <h2>TRANSFERÍ ÚNICAMENTE A ESTA CUENTA</h2>
        </div>
      </div>

      <div className="player-payment-destination-grid">
        <div className="player-payment-destination-item player-payment-destination-alias">
          <span>Alias</span>
          <strong>{OFFICIAL_PAYMENT.alias}</strong>
          <button type="button" onClick={() => copyValue(OFFICIAL_PAYMENT.alias, "alias")}>
            {copied === "alias" ? "✓ Alias copiado" : "📋 Copiar alias"}
          </button>
        </div>

        <div className="player-payment-destination-item">
          <span>CVU</span>
          <strong>{OFFICIAL_PAYMENT.cvu}</strong>
          <button type="button" onClick={() => copyValue(OFFICIAL_PAYMENT.cvu, "cvu")}>
            {copied === "cvu" ? "✓ CVU copiado" : "📋 Copiar CVU"}
          </button>
        </div>

        <div className="player-payment-destination-item">
          <span>Titular</span>
          <strong>{OFFICIAL_PAYMENT.holder}</strong>
          <small>{OFFICIAL_PAYMENT.provider}</small>
        </div>
      </div>

      <div className="player-payment-destination-warning">
        <b>IMPORTANTE:</b> el comprobante sólo será aceptado si la transferencia fue enviada a esta cuenta y corresponde al mes en curso. Un pago enviado a otra cuenta no será válido.
      </div>
    </section>,
    host,
  );
}

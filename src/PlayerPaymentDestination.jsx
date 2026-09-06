import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const OFFICIAL_PAYMENT = {
  alias: "comision.voley.mgsm",
  cvu: "0000003100057442515764",
  holder: "Pablo Javier Iglesias",
  provider: "Mercado Pago",
};

export default function PlayerPaymentDestination() {
  const [host, setHost] = useState(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let lastHost = null;

    const sync = () => {
      const wrap = document.querySelector("main.player-app .player-wrap");
      if (!wrap) {
        if (lastHost !== null) {
          lastHost = null;
          setHost(null);
        }
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

      if (node !== lastHost) {
        lastHost = node;
        setHost(node);
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

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
        <b>IMPORTANTE:</b> el comprobante sólo será aprobado si la transferencia fue enviada a esta cuenta y corresponde al mes en curso. Si el sistema gratuito no puede verificarlo automáticamente, quedará pendiente de revisión del Super Administrador.
      </div>
    </section>,
    host,
  );
}

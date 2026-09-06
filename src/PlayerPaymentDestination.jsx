import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

const OFFICIAL_PAYMENT = {
  alias: "comision.voley.mgsm",
  cvu: "0000003100057442515764",
  holder: "Pablo Javier Iglesias",
  provider: "Mercado Pago",
};

function currentPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Mendoza",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}-01`;
}

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
    return "⚠ No se pudo procesar el comprobante en este momento. El archivo no fue aceptado. Intentá nuevamente.";
  }

  return value;
}

export default function PlayerPaymentDestination() {
  const [host, setHost] = useState(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let checkingReview = false;
    let alive = true;

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

      const help = wrap.querySelector(".payment-player-card .payment-help");
      if (help) {
        help.textContent = "Intentamos verificar el comprobante automáticamente con controles gratuitos. Si no puede confirmarse con seguridad, quedará pendiente de revisión del Super Administrador. El pagador puede ser otra persona.";
      }
    };

    const sanitizeMessages = () => {
      document.querySelectorAll(".payment-message, .payment-admin-section .message").forEach((node) => {
        const translated = translateTechnicalMessage(node.textContent);
        if (translated && translated !== node.textContent) node.textContent = translated;
      });
    };

    const checkManualReview = async () => {
      if (!alive || checkingReview) return;
      const message = document.querySelector("main.player-app .payment-message");
      const value = String(message?.textContent || "");
      const looksLikeFallback = /no se pudo verificar el comprobante|archivo no fue aceptado/i.test(value);
      if (!looksLikeFallback) return;

      checkingReview = true;
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        if (!user) return;

        const { data: player } = await supabase
          .from("players")
          .select("id")
          .eq("user_id", user.id)
          .eq("active", true)
          .maybeSingle();
        if (!player?.id) return;

        const { data: payment } = await supabase
          .from("monthly_payments")
          .select("id,validation_status,validation_reason")
          .eq("player_id", player.id)
          .eq("period_month", currentPeriod())
          .maybeSingle();

        if (payment?.validation_status === "manual_review") {
          sessionStorage.setItem("voley_payment_manual_review", payment.validation_reason || "Comprobante recibido y pendiente de revisión manual.");
          window.location.reload();
        }
      } finally {
        checkingReview = false;
      }
    };

    const showReloadNotice = () => {
      const notice = sessionStorage.getItem("voley_payment_manual_review");
      if (!notice) return;
      const card = document.querySelector("main.player-app .payment-player-card");
      if (!card) return;
      if (!card.querySelector("[data-payment-review-notice]")) {
        const box = document.createElement("div");
        box.className = "message payment-message";
        box.setAttribute("data-payment-review-notice", "true");
        box.textContent = `⚠ ${notice}`;
        card.appendChild(box);
      }
      sessionStorage.removeItem("voley_payment_manual_review");
    };

    const run = () => {
      sync();
      sanitizeMessages();
      showReloadNotice();
      void checkManualReview();
    };

    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      alive = false;
      observer.disconnect();
    };
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

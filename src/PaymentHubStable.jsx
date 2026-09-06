import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

const BUCKET = "payment-receipts";
const FEES = [10000, 15000, 20000];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
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

function periodLabel(value) {
  if (!value) return "—";
  const d = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Mendoza",
  }).format(d).replace(/^./, (c) => c.toUpperCase());
}

function money(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function safeName(name) {
  return String(name || "comprobante")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-90);
}

function stateOf(payment) {
  if (!payment) return { cls: "pending", label: "Pendiente" };
  if (payment.validation_status === "validated") return { cls: "paid", label: "✓ Comprobante válido" };
  if (payment.validation_status === "pending_validation") return { cls: "review", label: "⏳ Verificando comprobante" };
  if (payment.validation_status === "manual_review") return { cls: "review", label: "⚠ Pendiente de revisión" };
  if (payment.validation_status === "rejected") return { cls: "rejected", label: "✕ Rechazado" };
  return { cls: "review", label: "⏳ Verificando comprobante" };
}

async function openReceipt(path, setMessage) {
  if (!path) return;
  const popup = window.open("", "_blank");
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120);
    if (error) throw error;
    if (popup) popup.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  } catch {
    popup?.close();
    setMessage("No se pudo abrir el comprobante.");
  }
}

function OfficialAccount({ onCopy }) {
  return (
    <section className="stable-pay-account">
      <span className="stable-pay-eyebrow">CUENTA OFICIAL DE PAGO</span>
      <strong className="stable-pay-alias">{OFFICIAL_PAYMENT.alias}</strong>
      <button type="button" onClick={() => onCopy(OFFICIAL_PAYMENT.alias)}>📋 Copiar alias</button>
      <div className="stable-pay-account-detail">
        <span>{OFFICIAL_PAYMENT.provider}</span>
        <span>{OFFICIAL_PAYMENT.holder}</span>
        <span>CVU {OFFICIAL_PAYMENT.cvu}</span>
      </div>
      <small>Transferí únicamente a esta cuenta.</small>
    </section>
  );
}

function PlayerPaymentPanel({ player, onClose }) {
  const inputRef = useRef(null);
  const refreshInFlightRef = useRef(false);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const period = currentPeriod();

  async function load(clearMessage = false, showLoading = false) {
    if (!player?.id || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    if (showLoading) setLoading(true);
    if (clearMessage) setMessage("");

    try {
      const { data, error } = await supabase
        .from("monthly_payments")
        .select("id,player_id,period_month,amount_due,receipt_path,receipt_name,receipt_type,uploaded_at,validation_status,validation_reason,detected_provider,validated_at")
        .eq("player_id", player.id)
        .order("period_month", { ascending: false });
      if (error) setMessage("No se pudieron cargar tus pagos.");
      else setPayments(data || []);
    } finally {
      if (showLoading) setLoading(false);
      refreshInFlightRef.current = false;
    }
  }

  useEffect(() => { load(false, true); }, [player?.id]);

  const current = payments.find((row) => row.period_month === period);
  const currentState = stateOf(current);
  const verifying = current?.validation_status === "pending_validation";

  useEffect(() => {
    if (!verifying) return undefined;
    const timer = window.setInterval(() => load(false, false), 4500);
    return () => window.clearInterval(timer);
  }, [verifying, player?.id]);

  async function upload(file) {
    if (!file || !player?.monthly_fee || verifying) return;
    if (!ALLOWED_TYPES.has(file.type)) {
      setMessage("El comprobante debe ser JPG, PNG o PDF.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setMessage("El comprobante no puede superar los 10 MB.");
      return;
    }

    setUploading(true);
    setMessage("⏳ Cargando comprobante...");
    const folder = period.slice(0, 7);
    const path = `${player.id}/${folder}/${Date.now()}-${safeName(file.name)}`;

    try {
      const uploaded = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploaded.error) throw uploaded.error;

      const { data, error } = await supabase.functions.invoke("validate-payment-receipt", {
        body: {
          receipt_path: path,
          receipt_name: file.name,
          receipt_type: file.type,
          period_month: period,
        },
      });

      if (error) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
        setMessage("⚠ No se pudo cargar el comprobante. Intentá nuevamente.");
        return;
      }

      if (data?.status === "pending_validation") {
        setMessage("✓ Comprobante cargado. Se verificará en segundo plano. Podés cerrar esta ventana y seguir usando la aplicación.");
        await load(false, false);
        return;
      }

      if (data?.status === "validated") {
        setMessage("✓ Comprobante validado automáticamente.");
        await load(false, false);
        return;
      }

      if (data?.status === "manual_review") {
        setMessage("⚠ Comprobante cargado. No pudo verificarse automáticamente y será revisado por el Super Administrador.");
        await load(false, false);
        return;
      }

      if (data?.status === "rejected") {
        setMessage(`✕ ${data.reason || "Comprobante no válido."}`);
        await load(false, false);
        return;
      }

      setMessage("⚠ No se pudo determinar el estado del comprobante. Intentá nuevamente.");
    } catch {
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      setMessage("⚠ No se pudo cargar el comprobante. Intentá nuevamente.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function copyAlias(value) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("✓ Alias copiado.");
    } catch {
      setMessage(`Alias: ${value}`);
    }
  }

  return (
    <div className="stable-pay-modal" role="dialog" aria-modal="true" aria-label="Mis pagos">
      <div className="stable-pay-modal-card stable-pay-player-modal">
        <div className="stable-pay-modal-head">
          <div><span>💳</span><div><h2>Mis pagos</h2><p>{player.full_name}</p></div></div>
          <button type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <OfficialAccount onCopy={copyAlias} />

        <section className={`stable-pay-current ${currentState.cls}`}>
          <div><span>Mi cuota · {periodLabel(period)}</span><strong>{money(player.monthly_fee)}</strong></div>
          <b className={`stable-pay-state ${currentState.cls}`}>{currentState.label}</b>
        </section>

        <p className="stable-pay-help">Los comprobantes descargados de Mercado Pago se leen automáticamente buscando la fecha del mes en curso y el CVU oficial. Si el archivo no puede leerse con seguridad, queda pendiente de revisión manual. El pagador puede ser otra persona.</p>

        {current?.validation_reason && current.validation_status !== "validated" && (
          <div className="stable-pay-note">{current.validation_reason}</div>
        )}

        <div className="stable-pay-actions">
          <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => upload(e.target.files?.[0])} />
          <button type="button" className="primary" disabled={uploading || verifying} onClick={() => inputRef.current?.click()}>
            {uploading ? "⏳ Cargando..." : verifying ? "⏳ Verificación en curso" : current ? "📎 Reemplazar comprobante" : "📎 Adjuntar comprobante"}
          </button>
          {current?.receipt_path && <button type="button" onClick={() => openReceipt(current.receipt_path, setMessage)}>👁 Ver comprobante</button>}
        </div>

        {message && <div className="stable-pay-message">{message}</div>}

        <section className="stable-pay-history">
          <h3>Historial</h3>
          {loading ? <p>Cargando pagos...</p> : payments.length ? payments.map((row) => {
            const s = stateOf(row);
            return <div className="stable-pay-history-row" key={row.id}><span><b>{periodLabel(row.period_month)}</b><small>{money(row.amount_due)}</small></span><b className={`stable-pay-state ${s.cls}`}>{s.label}</b>{row.receipt_path && <button type="button" onClick={() => openReceipt(row.receipt_path, setMessage)}>Ver</button>}</div>;
          }) : <p>Todavía no hay comprobantes cargados.</p>}
        </section>
      </div>
    </div>
  );
}

function AdminPaymentPanel({ role, onClose }) {
  const period = currentPeriod();
  const refreshInFlightRef = useRef(false);
  const [players, setPlayers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [reviewing, setReviewing] = useState("");

  async function load(clearMessage = false, showLoading = false) {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    if (showLoading) setLoading(true);
    if (clearMessage) setMessage("");

    try {
      const [p, pay] = await Promise.all([
        supabase.from("players").select("id,full_name,monthly_fee,category_id,team,active").eq("active", true).order("full_name"),
        supabase.from("monthly_payments").select("id,player_id,period_month,amount_due,receipt_path,validation_status,validation_reason,detected_provider").eq("period_month", period),
      ]);
      if (p.error || pay.error) setMessage("No se pudieron cargar los pagos.");
      if (!p.error) setPlayers(p.data || []);
      if (!pay.error) setPayments(pay.data || []);
    } finally {
      if (showLoading) setLoading(false);
      refreshInFlightRef.current = false;
    }
  }

  useEffect(() => { load(false, true); }, []);

  const hasPendingValidation = payments.some((p) => p.validation_status === "pending_validation");

  useEffect(() => {
    if (!hasPendingValidation) return undefined;
    const timer = window.setInterval(() => load(false, false), 5000);
    return () => window.clearInterval(timer);
  }, [hasPendingValidation]);

  const paymentByPlayer = useMemo(() => Object.fromEntries(payments.map((p) => [p.player_id, p])), [payments]);
  const rows = useMemo(() => players.filter((player) => {
    const payment = paymentByPlayer[player.id];
    const q = search.trim().toLowerCase();
    if (q && !player.full_name.toLowerCase().includes(q)) return false;
    if (status === "validated" && payment?.validation_status !== "validated") return false;
    if (status === "pending_validation" && payment?.validation_status !== "pending_validation") return false;
    if (status === "manual_review" && payment?.validation_status !== "manual_review") return false;
    if (status === "pending" && payment) return false;
    if (status === "rejected" && payment?.validation_status !== "rejected") return false;
    return true;
  }), [players, paymentByPlayer, search, status]);

  const validated = rows.filter((p) => paymentByPlayer[p.id]?.validation_status === "validated").length;
  const review = rows.filter((p) => paymentByPlayer[p.id]?.validation_status === "manual_review").length;
  const expected = rows.reduce((sum, p) => sum + Number(p.monthly_fee || 0), 0);
  const received = rows.reduce((sum, p) => {
    const pay = paymentByPlayer[p.id];
    return sum + (pay?.validation_status === "validated" ? Number(pay.amount_due || 0) : 0);
  }, 0);

  async function updateFee(playerId, value) {
    if (role !== "super_admin") return;
    const fee = Number(value);
    const { error } = await supabase.from("players").update({ monthly_fee: fee }).eq("id", playerId);
    if (error) setMessage("No se pudo modificar la cuota.");
    else setPlayers((prev) => prev.map((p) => p.id === playerId ? { ...p, monthly_fee: fee } : p));
  }

  async function reviewPayment(paymentId, decision) {
    if (role !== "super_admin") return;
    setReviewing(paymentId);
    setMessage("");
    const { data, error } = await supabase.functions.invoke("review-payment-receipt", {
      body: { payment_id: paymentId, decision },
    });
    if (error || !data?.ok) setMessage("No se pudo resolver el comprobante.");
    else {
      setMessage(decision === "validated" ? "✓ Comprobante aprobado." : "✓ Comprobante rechazado.");
      await load(false, false);
    }
    setReviewing("");
  }

  return (
    <div className="stable-pay-modal" role="dialog" aria-modal="true" aria-label="Administración de pagos">
      <div className="stable-pay-modal-card stable-pay-admin-modal">
        <div className="stable-pay-modal-head">
          <div><span>💳</span><div><h2>Pagos</h2><p>{periodLabel(period)} · {role === "super_admin" ? "Vista del club" : "Tus categorías autorizadas"}</p></div></div>
          <button type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div className="stable-pay-summary">
          <div><span>Esperado</span><b>{money(expected)}</b></div>
          <div><span>Validados</span><b>{validated}</b></div>
          <div><span>En revisión</span><b>{review}</b></div>
          <div><span>Validado</span><b>{money(received)}</b></div>
        </div>

        <div className="stable-pay-filters">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar Jugador@" />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos</option>
            <option value="validated">Validados</option>
            <option value="pending_validation">Verificando</option>
            <option value="manual_review">Pendientes de revisión</option>
            <option value="pending">Sin comprobante</option>
            <option value="rejected">Rechazados</option>
          </select>
        </div>

        {message && <div className="stable-pay-message">{message}</div>}

        <div className="stable-pay-admin-list">
          {loading ? <p>Cargando pagos...</p> : rows.length ? rows.map((player) => {
            const payment = paymentByPlayer[player.id];
            const state = stateOf(payment);
            return (
              <article className="stable-pay-admin-row" key={player.id}>
                <div className="stable-pay-person"><b>{player.full_name}</b><small>{player.team ? `Equipo ${player.team}` : "Sin equipo"}</small>{payment?.validation_reason && <small>{payment.validation_reason}</small>}</div>
                <div className="stable-pay-fee">
                  <span>Cuota</span>
                  {role === "super_admin" ? <select value={player.monthly_fee || 20000} onChange={(e) => updateFee(player.id, e.target.value)}>{FEES.map((fee) => <option key={fee} value={fee}>{money(fee)}</option>)}</select> : <b>{money(player.monthly_fee)}</b>}
                </div>
                <b className={`stable-pay-state ${state.cls}`}>{state.label}</b>
                <div className="stable-pay-row-actions">
                  {payment?.receipt_path ? <button type="button" onClick={() => openReceipt(payment.receipt_path, setMessage)}>👁 Ver</button> : <span>Sin archivo</span>}
                  {role === "super_admin" && payment?.validation_status === "manual_review" && <>
                    <button type="button" className="approve" disabled={reviewing === payment.id} onClick={() => reviewPayment(payment.id, "validated")}>✓ Aprobar</button>
                    <button type="button" className="reject" disabled={reviewing === payment.id} onClick={() => reviewPayment(payment.id, "rejected")}>✕ Rechazar</button>
                  </>}
                </div>
              </article>
            );
          }) : <p>No hay registros para este filtro.</p>}
        </div>
      </div>
    </div>
  );
}

export default function PaymentHubStable() {
  const [identity, setIdentity] = useState({ role: "", player: null });
  const [mode, setMode] = useState(() => localStorage.getItem("voley_access_mode") || "");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playerHost, setPlayerHost] = useState(null);

  useEffect(() => {
    let alive = true;
    async function resolve() {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!alive || !user) {
        if (alive) setIdentity({ role: "", player: null });
        return;
      }
      const [profile, player] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
        supabase.from("players").select("id,full_name,monthly_fee,user_id,active").eq("user_id", user.id).eq("active", true).maybeSingle(),
      ]);
      if (!alive) return;
      setIdentity({ role: profile.data?.role || "", player: player.data || null });
    }
    resolve();
    const { data } = supabase.auth.onAuthStateChange(() => setTimeout(resolve, 0));
    return () => { alive = false; data?.subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = localStorage.getItem("voley_access_mode") || "";
      setMode((prev) => prev === next ? prev : next);
    }, 700);
    return () => window.clearInterval(timer);
  }, []);

  const isAdmin = ["admin", "super_admin"].includes(identity.role);
  const isPlayerRole = identity.role === "player";
  const isDualPlayerMode = isAdmin && !!identity.player && mode === "player";
  const playerMode = !!identity.player && (isPlayerRole || isDualPlayerMode);
  const adminMode = isAdmin && !isDualPlayerMode;

  useEffect(() => {
    if (!playerMode) {
      setPlayerHost(null);
      return undefined;
    }

    let createdNode = null;
    const attach = () => {
      const hero = document.querySelector("main.player-app .hero-profile");
      if (!hero?.parentElement) {
        setPlayerHost((prev) => prev?.isConnected ? prev : null);
        return;
      }

      let host = hero.parentElement.querySelector("[data-stable-payment-anchor]");
      if (!host) {
        host = document.createElement("div");
        host.setAttribute("data-stable-payment-anchor", "true");
        hero.insertAdjacentElement("afterend", host);
        createdNode = host;
      }
      setPlayerHost((prev) => prev === host ? prev : host);
    };

    attach();
    const timer = window.setInterval(attach, 800);
    return () => {
      window.clearInterval(timer);
      setPlayerHost(null);
      if (createdNode?.isConnected) createdNode.remove();
    };
  }, [playerMode]);

  async function copyAlias() {
    try {
      await navigator.clipboard.writeText(OFFICIAL_PAYMENT.alias);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (!playerMode && !adminMode) return null;

  const playerBanner = playerMode && !open ? (
    <aside className="stable-pay-player-banner">
      <div><span>💳 CUOTA · {periodLabel(currentPeriod())}</span><strong>{OFFICIAL_PAYMENT.alias}</strong></div>
      <button type="button" onClick={copyAlias}>{copied ? "✓ Copiado" : "📋 Copiar alias"}</button>
      <button type="button" className="primary" onClick={() => setOpen(true)}>Ver pagos</button>
    </aside>
  ) : null;

  return (
    <>
      {playerHost && playerBanner && createPortal(playerBanner, playerHost)}

      {adminMode && !open && (
        <button type="button" className="stable-pay-admin-launcher" onClick={() => setOpen(true)}>💳 <span>Pagos</span></button>
      )}

      {open && playerMode && identity.player && <PlayerPaymentPanel player={identity.player} onClose={() => setOpen(false)} />}
      {open && adminMode && <AdminPaymentPanel role={identity.role} onClose={() => setOpen(false)} />}
    </>
  );
}
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

const BUCKET = "payment-receipts";
const PAYMENT_START_PERIOD = "2026-10-01";
const FEES = [10000, 15000, 20000];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const OFFICIAL_PAYMENT = {
  alias: "comision.voley.mgsm",
  cvu: "0000003100057442515764",
  holder: "Pablo Javier Iglesias",
  provider: "Mercado Pago",
};

function mendozaDateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Mendoza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((p) => p.type === "year")?.value || 0),
    month: Number(parts.find((p) => p.type === "month")?.value || 0),
    day: Number(parts.find((p) => p.type === "day")?.value || 0),
  };
}

function currentPeriod() {
  const { year, month } = mendozaDateParts();
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function addMonths(period, amount = 1) {
  const [year, month] = period.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + amount, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function maxEligiblePaymentPeriod() {
  const { year, month, day } = mendozaDateParts();
  const current = `${year}-${String(month).padStart(2, "0")}-01`;
  if (current < "2026-09-01") return null;
  if (current === "2026-09-01") return day >= 25 ? PAYMENT_START_PERIOD : null;
  if (current < PAYMENT_START_PERIOD) return null;
  return day >= 25 ? addMonths(current, 1) : current;
}

function oldestUnpaidPeriod(payments, maxPeriod = maxEligiblePaymentPeriod()) {
  if (!maxPeriod) return null;
  const byPeriod = new Map((payments || []).map((row) => [row.period_month, row]));
  for (let period = PAYMENT_START_PERIOD; period <= maxPeriod; period = addMonths(period, 1)) {
    const row = byPeriod.get(period);
    if (!row || row.validation_status !== "validated") return period;
  }
  return null;
}

function availablePaymentPeriods(maxPeriod = maxEligiblePaymentPeriod()) {
  if (!maxPeriod) return [];
  const result = [];
  for (let period = PAYMENT_START_PERIOD; period <= maxPeriod; period = addMonths(period, 1)) result.push(period);
  return result;
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
  if (payment.validation_status === "validated") return { cls: "paid", label: "✓ Comprobante Válido" };
  if (payment.validation_status === "pending_validation") return { cls: "review", label: "⏳ Verificando Comprobante" };
  if (payment.validation_status === "manual_review") return { cls: "review", label: "⚠ Pendiente De Revisión" };
  if (payment.validation_status === "rejected") return { cls: "rejected", label: "✕ Rechazado" };
  return { cls: "review", label: "⏳ Verificando Comprobante" };
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
    setMessage("No Se Pudo Abrir El Comprobante.");
  }
}

function OfficialAccount({ onCopy }) {
  return (
    <section className="stable-pay-account">
      <span className="stable-pay-eyebrow">CUENTA OFICIAL DE PAGO</span>
      <strong className="stable-pay-alias">{OFFICIAL_PAYMENT.alias}</strong>
      <button type="button" onClick={() => onCopy(OFFICIAL_PAYMENT.alias)}>📋 Copiar Alias</button>
      <div className="stable-pay-account-detail">
        <span>{OFFICIAL_PAYMENT.provider}</span>
        <span>{OFFICIAL_PAYMENT.holder}</span>
        <span>CVU {OFFICIAL_PAYMENT.cvu}</span>
      </div>
      <small>Transferí Únicamente A Esta Cuenta.</small>
    </section>
  );
}

export function PlayerPaymentPanel({ player, onClose, embedded = false }) {
  const inputRef = useRef(null);
  const refreshInFlightRef = useRef(false);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const maxEligiblePeriod = maxEligiblePaymentPeriod();
  const paymentsStarted = !!maxEligiblePeriod;

  async function load(clearMessage = false, showLoading = false) {
    if (!paymentsStarted) { setPayments([]); setLoading(false); return; }
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
      if (error) setMessage("No Se Pudieron Cargar Tus Pagos.");
      else setPayments(data || []);
    } finally {
      if (showLoading) setLoading(false);
      refreshInFlightRef.current = false;
    }
  }

  useEffect(() => { load(false, true); }, [player?.id]);

  const period = oldestUnpaidPeriod(payments, maxEligiblePeriod);
  const current = period ? payments.find((row) => row.period_month === period) : null;
  const currentState = period ? stateOf(current) : { cls: "paid", label: "✓ Sin Cuotas Pendientes" };
  const verifying = current?.validation_status === "pending_validation";

  useEffect(() => {
    if (!verifying) return undefined;
    const timer = window.setInterval(() => load(false, false), 4500);
    return () => window.clearInterval(timer);
  }, [verifying, player?.id]);

  async function upload(file) {
    if (!paymentsStarted) { setMessage("Los Pagos Se Habilitan El 25 De Septiembre."); return; }
    if (!period) { setMessage("✓ No Tenés Cuotas Habilitadas Pendientes."); return; }
    if (!file || !player?.monthly_fee || verifying) return;
    if (!ALLOWED_TYPES.has(file.type)) {
      setMessage("El Comprobante Debe Ser JPG, PNG O PDF.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setMessage("El Comprobante No Puede Superar Los 10 MB.");
      return;
    }

    setUploading(true);
    setMessage("⏳ Cargando Comprobante...");
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
        setMessage("⚠ No Se Pudo Cargar El Comprobante. Intentá Nuevamente.");
        return;
      }

      if (data?.status === "pending_validation") {
        setMessage("✓ Comprobante Cargado. Se Verificará En Segundo Plano. Podés Cerrar Esta Ventana y Seguir Usando La Aplicación.");
        await load(false, false);
        return;
      }

      if (data?.status === "validated") {
        setMessage("✓ Comprobante Validado Automáticamente.");
        await load(false, false);
        return;
      }

      if (data?.status === "manual_review") {
        setMessage("⚠ Comprobante Cargado. No Pudo Verificarse Automáticamente y Será Revisado Por El Super Administrador.");
        await load(false, false);
        return;
      }

      if (data?.status === "rejected") {
        setMessage(`✕ ${data.reason || "Comprobante No Válido."}`);
        await load(false, false);
        return;
      }

      setMessage("⚠ No Se Pudo Determinar El Estado Del Comprobante. Intentá Nuevamente.");
    } catch {
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      setMessage("⚠ No Se Pudo Cargar El Comprobante. Intentá Nuevamente.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function copyAlias(value) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("✓ Alias Copiado.");
    } catch {
      setMessage(`Alias: ${value}`);
    }
  }

  return (
    <div className={embedded ? "stable-pay-player-page" : "stable-pay-modal"} role={embedded ? undefined : "dialog"} aria-modal={embedded ? undefined : "true"} aria-label="Mis Pagos">
      <div className={embedded ? "stable-pay-player-page-card stable-pay-player-modal" : "stable-pay-modal-card stable-pay-player-modal"}>
        <div className="stable-pay-modal-head">
          <div><span>💳</span><div><h2>Mis Pagos</h2><p>{player.full_name}</p></div></div>
          {!embedded && <button type="button" onClick={onClose} aria-label="Cerrar">×</button>}
        </div>

        {!paymentsStarted ? <section className="stable-pay-start-notice">
          <span>📅</span>
          <h3>Pagos A Partir De Octubre</h3>
          <p>Durante Septiembre Estamos Creando y Aprobando Cuentas. La Carga De Pagos Se Habilita El 25 De Septiembre Para Abonar Octubre.</p>
        </section> : <>
        <OfficialAccount onCopy={copyAlias} />

        <section className={`stable-pay-current ${currentState.cls}`}>
          <div><span>{period ? `Cuota A Pagar · ${periodLabel(period)}` : "Estado De Pagos"}</span><strong>{period ? money(player.monthly_fee) : "Al Día"}</strong></div>
          <b className={`stable-pay-state ${currentState.cls}`}>{currentState.label}</b>
        </section>

        <p className="stable-pay-help">Los Comprobantes Descargados De Mercado Pago Se Leen Automáticamente Buscando La Fecha Del Mes En Curso y El CVU Oficial. Si El Archivo No Puede Leerse Con Seguridad, Queda Pendiente De Revisión Manual. El Pagador Puede Ser Otra Persona.</p>

        {current?.validation_reason && current.validation_status !== "validated" && (
          <div className="stable-pay-note">{current.validation_reason}</div>
        )}

        <div className="stable-pay-actions">
          <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => upload(e.target.files?.[0])} />
          <button type="button" className="primary" disabled={uploading || verifying || !period} onClick={() => inputRef.current?.click()}>
            {uploading ? "⏳ Cargando..." : verifying ? "⏳ Verificación En Curso" : !period ? "✓ Sin Cuotas Pendientes" : current ? "📎 Reemplazar Comprobante" : `📎 Adjuntar Comprobante De ${periodLabel(period)}`}
          </button>
          {current?.receipt_path && <button type="button" onClick={() => openReceipt(current.receipt_path, setMessage)}>👁 Ver Comprobante</button>}
        </div>

        {message && <div className="stable-pay-message">{message}</div>}

        <section className="stable-pay-history">
          <h3>Historial</h3>
          {loading ? <p>Cargando Pagos...</p> : payments.length ? payments.map((row) => {
            const s = stateOf(row);
            return <div className="stable-pay-history-row" key={row.id}><span><b>{periodLabel(row.period_month)}</b><small>{money(row.amount_due)}</small></span><b className={`stable-pay-state ${s.cls}`}>{s.label}</b>{row.receipt_path && <button type="button" onClick={() => openReceipt(row.receipt_path, setMessage)}>Ver</button>}</div>;
          }) : <p>Todavía No Hay Comprobantes Cargados.</p>}
        </section>
        </>}
      </div>
    </div>
  );
}

export function AdminPaymentPanel({ role, canApprovePayments = role === "super_admin", onClose, embedded = false }) {
  const maxEligiblePeriod = maxEligiblePaymentPeriod();
  const paymentPeriods = availablePaymentPeriods(maxEligiblePeriod);
  const defaultPeriod = (() => {
    if (!maxEligiblePeriod) return PAYMENT_START_PERIOD;
    const current = currentPeriod();
    if (current < PAYMENT_START_PERIOD) return PAYMENT_START_PERIOD;
    return current <= maxEligiblePeriod ? current : maxEligiblePeriod;
  })();
  const [period, setPeriod] = useState(defaultPeriod);
  const paymentsStarted = !!maxEligiblePeriod;
  const refreshInFlightRef = useRef(false);
  const [players, setPlayers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [reviewing, setReviewing] = useState("");
  const [bulkReviewing, setBulkReviewing] = useState(false);

  async function load(clearMessage = false, showLoading = false) {
    if (!paymentsStarted) { setPlayers([]); setPayments([]); setLoading(false); return; }
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    if (showLoading) setLoading(true);
    if (clearMessage) setMessage("");

    try {
      const [p, pay] = await Promise.all([
        supabase.from("players").select("id,full_name,monthly_fee,category_id,team,active").eq("active", true).order("full_name"),
        supabase.from("monthly_payments").select("id,player_id,period_month,amount_due,receipt_path,validation_status,validation_reason,detected_provider").eq("period_month", period),
      ]);
      if (p.error || pay.error) setMessage("No Se Pudieron Cargar Los Pagos.");
      if (!p.error) setPlayers(p.data || []);
      if (!pay.error) setPayments(pay.data || []);
    } finally {
      if (showLoading) setLoading(false);
      refreshInFlightRef.current = false;
    }
  }

  useEffect(() => { load(false, true); }, [period, paymentsStarted]);

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
  const receiptsCount = payments.filter((p) => !!p.receipt_path).length;
  const unvalidatedReceiptsCount = payments.filter((p) => !!p.receipt_path && p.validation_status !== "validated").length;

  async function updateFee(playerId, value) {
    if (role !== "super_admin") return;
    const fee = Number(value);
    const { error } = await supabase.from("players").update({ monthly_fee: fee }).eq("id", playerId);
    if (error) setMessage("No Se Pudo Modificar La Cuota.");
    else setPlayers((prev) => prev.map((p) => p.id === playerId ? { ...p, monthly_fee: fee } : p));
  }

  async function reviewPayment(paymentId, decision) {
    if (!canApprovePayments) return;
    setReviewing(paymentId);
    setMessage("");
    const { data, error } = await supabase.functions.invoke("review-payment-receipt", {
      body: { payment_id: paymentId, decision },
    });
    if (error || !data?.ok) setMessage("No Se Pudo Resolver El Comprobante.");
    else {
      setMessage(decision === "validated" ? "✓ Comprobante Aprobado." : "✓ Comprobante Rechazado.");
      await load(false, false);
    }
    setReviewing("");
  }

  async function approveAllReceipts() {
    if (!canApprovePayments || bulkReviewing || unvalidatedReceiptsCount === 0) return;
    const label = periodLabel(period);
    const confirmed = window.confirm(`Vas A Aprobar Todos Los Comprobantes Cargados De ${label}. ¿Querés Continuar?`);
    if (!confirmed) return;

    setBulkReviewing(true);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("review-payment-receipt", {
        body: { action: "bulk_validate", period_month: period },
      });
      if (error || !data?.ok) {
        setMessage("No Se Pudieron Aprobar Todos Los Comprobantes.");
      } else {
        const count = Number(data.updated_count || 0);
        setMessage(count > 0
          ? `✓ Se aprobaron ${count} comprobante${count === 1 ? "" : "s"} de ${label}.`
          : `✓ Todos Los Comprobantes De ${label} Ya Estaban Aprobados.`);
        await load(false, false);
      }
    } finally {
      setBulkReviewing(false);
    }
  }

  async function revokePayment(paymentId, playerName) {
    if (!canApprovePayments || reviewing) return;
    const confirmed = window.confirm(`Vas A Revocar La Aprobación Del Comprobante De ${playerName}. Quedará Pendiente De Revisión. ¿Querés Continuar?`);
    if (!confirmed) return;

    setReviewing(paymentId);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("review-payment-receipt", {
        body: { action: "revoke", payment_id: paymentId },
      });
      if (error || !data?.ok) {
        setMessage("No Se Pudo Revocar La Aprobación Del Comprobante.");
      } else {
        setMessage(`↩ Aprobación Revocada Para ${playerName}. El Comprobante Quedó Pendiente De Revisión.`);
        await load(false, false);
      }
    } finally {
      setReviewing("");
    }
  }

  return (
    <div className={embedded ? "stable-pay-admin-page" : "stable-pay-modal"} role={embedded ? undefined : "dialog"} aria-modal={embedded ? undefined : "true"} aria-label="Administración De Pagos">
      <div className={embedded ? "stable-pay-admin-page-card stable-pay-admin-modal" : "stable-pay-modal-card stable-pay-admin-modal"}>
        <div className="stable-pay-modal-head">
          <div><span>💳</span><div><h2>Pagos</h2><p>{periodLabel(period)} · {role === "super_admin" ? "Vista Del Club" : "Tus Categorías Autorizadas"}</p></div></div>
          <button type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        {!paymentsStarted ? <section className="stable-pay-start-notice">
          <span>📅</span>
          <h3>Pagos A Partir De Octubre</h3>
          <p>Septiembre No Genera Deuda. La Carga De Comprobantes Se Habilita El 25 De Septiembre Para El Período Octubre De 2026.</p>
        </section> : <>
        <div className="stable-pay-period-picker">
          <label><span>Período</span><select value={period} onChange={(e) => setPeriod(e.target.value)}>{paymentPeriods.map((value) => <option key={value} value={value}>{periodLabel(value)}</option>)}</select></label>
        </div>
        <div className="stable-pay-summary">
          <div><span>Esperado</span><b>{money(expected)}</b></div>
          <div><span>Validados</span><b>{validated}</b></div>
          <div><span>En Revisión</span><b>{review}</b></div>
          <div><span>Validado</span><b>{money(received)}</b></div>
        </div>

        <div className="stable-pay-filters">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar Jugador@" />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos</option>
            <option value="validated">Validados</option>
            <option value="pending_validation">Verificando</option>
            <option value="manual_review">Pendientes De Revisión</option>
            <option value="pending">Sin Comprobante</option>
            <option value="rejected">Rechazados</option>
          </select>
        </div>

        {canApprovePayments && (
          <div className="stable-pay-bulk-actions">
            <div>
              <strong>Acciones Del Período · {periodLabel(period)}</strong>
              <small>{receiptsCount} comprobante{receiptsCount === 1 ? "" : "s"} cargado{receiptsCount === 1 ? "" : "s"} · {unvalidatedReceiptsCount} sin aprobar</small>
            </div>
            <button type="button" className="approve-all" disabled={bulkReviewing || unvalidatedReceiptsCount === 0} onClick={approveAllReceipts}>
              {bulkReviewing ? "⏳ Aprobando..." : `✓ Aprobar Todos Los Comprobantes De ${periodLabel(period)}`}
            </button>
          </div>
        )}

        {message && <div className="stable-pay-message">{message}</div>}

        <div className="stable-pay-admin-list">
          {loading ? <p>Cargando Pagos...</p> : rows.length ? rows.map((player) => {
            const payment = paymentByPlayer[player.id];
            const state = stateOf(payment);
            return (
              <article className="stable-pay-admin-row" key={player.id}>
                <div className="stable-pay-person"><b>{player.full_name}</b><small>{player.team ? `Equipo ${player.team}` : "Sin Equipo"}</small>{payment?.validation_reason && <small>{payment.validation_reason}</small>}</div>
                <div className="stable-pay-fee">
                  <span>Cuota</span>
                  {role === "super_admin" ? <select value={player.monthly_fee || 20000} onChange={(e) => updateFee(player.id, e.target.value)}>{FEES.map((fee) => <option key={fee} value={fee}>{money(fee)}</option>)}</select> : <b>{money(player.monthly_fee)}</b>}
                </div>
                <b className={`stable-pay-state ${state.cls}`}>{state.label}</b>
                <div className="stable-pay-row-actions">
                  {payment?.receipt_path ? <button type="button" onClick={() => openReceipt(payment.receipt_path, setMessage)}>👁 Ver</button> : <span>Sin Archivo</span>}
                  {canApprovePayments && payment?.receipt_path && ["manual_review", "pending_validation", "rejected"].includes(payment.validation_status) && <>
                    <button type="button" className="approve" disabled={reviewing === payment.id || bulkReviewing} onClick={() => reviewPayment(payment.id, "validated")}>✓ Aprobar</button>
                    {payment.validation_status !== "rejected" && <button type="button" className="reject" disabled={reviewing === payment.id || bulkReviewing} onClick={() => reviewPayment(payment.id, "rejected")}>✕ Rechazar</button>}
                  </>}
                  {canApprovePayments && payment?.validation_status === "validated" && (
                    <button type="button" className="revoke" disabled={reviewing === payment.id || bulkReviewing} onClick={() => revokePayment(payment.id, player.full_name)}>↩ Revocar Aprobación</button>
                  )}
                </div>
              </article>
            );
          }) : <p>No Hay Registros Para Este Filtro.</p>}
        </div>
        </>}
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

  const playerBanner = playerMode && !!maxEligiblePaymentPeriod() && !open ? (
    <aside className="stable-pay-player-banner">
      <div><span>💳 CUOTA · {periodLabel(currentPeriod())}</span><strong>{OFFICIAL_PAYMENT.alias}</strong></div>
      <button type="button" onClick={copyAlias}>{copied ? "✓ Copiado" : "📋 Copiar Alias"}</button>
      <button type="button" className="primary" onClick={() => setOpen(true)}>Ver Pagos</button>
    </aside>
  ) : null;

  return (
    <>
      {playerHost && playerBanner && createPortal(playerBanner, playerHost)}

      {adminMode && !!maxEligiblePaymentPeriod() && !open && (
        <button type="button" className="stable-pay-admin-launcher" onClick={() => setOpen(true)}>💳 <span>Pagos</span></button>
      )}

      {open && playerMode && identity.player && <PlayerPaymentPanel player={identity.player} onClose={() => setOpen(false)} />}
      {open && adminMode && <AdminPaymentPanel role={identity.role} onClose={() => setOpen(false)} />}
    </>
  );
}
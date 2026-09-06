import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

const BUCKET = "payment-receipts";
const FEES = [10000, 15000, 20000];
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

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
  if (value == null || value === "") return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function genderText(value) {
  return String(value || "").toLowerCase() === "female" ? "Femenino" : "Masculino";
}

function safeName(name) {
  return String(name || "comprobante")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-90);
}

function isValidated(payment) {
  return payment?.validation_status === "validated";
}

function paymentState(payment) {
  if (!payment) return { cls: "pending", label: "Pendiente" };
  if (payment.validation_status === "validated") return { cls: "paid", label: "✓ Comprobante válido" };
  if (payment.validation_status === "manual_review") return { cls: "review", label: "⚠ Revisión manual" };
  if (payment.validation_status === "rejected") return { cls: "rejected", label: "✕ Rechazado" };
  return { cls: "review", label: "⏳ Analizando" };
}

async function openReceipt(path, setMessage) {
  if (!path) return;
  const popup = window.open("", "_blank");
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120);
    if (error) throw error;
    if (popup) popup.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  } catch (error) {
    popup?.close();
    setMessage?.("No se pudo abrir el comprobante.");
  }
}

function PlayerPayments({ playerId }) {
  const inputRef = useRef(null);
  const [player, setPlayer] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const period = currentPeriod();

  const load = async (clearMessage = true) => {
    if (!playerId) return;
    setLoading(true);
    if (clearMessage) setMessage("");
    try {
      const [p, pay] = await Promise.all([
        supabase
          .from("players")
          .select("id,full_name,monthly_fee")
          .eq("id", playerId)
          .single(),
        supabase
          .from("monthly_payments")
          .select("id,player_id,period_month,amount_due,receipt_path,receipt_name,receipt_type,uploaded_at,validation_status,validation_reason,validation_confidence,detected_payment_date,detected_amount,detected_provider,validated_at")
          .eq("player_id", playerId)
          .order("period_month", { ascending: false }),
      ]);
      if (p.error) throw p.error;
      if (pay.error) throw pay.error;
      setPlayer(p.data);
      setPayments(pay.data || []);
    } catch (error) {
      setMessage("No se pudieron cargar tus pagos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [playerId]);

  const current = payments.find((row) => row.period_month === period);
  const currentState = paymentState(current);

  async function upload(file) {
    if (!file || !player?.monthly_fee) return;
    if (!ALLOWED_TYPES.has(file.type)) {
      setMessage("El comprobante debe ser JPG, PNG o PDF.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setMessage("El comprobante no puede superar los 10 MB.");
      return;
    }

    setUploading(true);
    setMessage("⏳ Subiendo y analizando el comprobante...");
    const folder = period.slice(0, 7);
    const path = `${player.id}/${folder}/${Date.now()}-${safeName(file.name)}`;

    try {
      const up = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (up.error) throw up.error;

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
        setMessage("⚠ No se pudo verificar el comprobante en este momento. El archivo NO fue aceptado. Intentá nuevamente más tarde.");
        return;
      }

      if (data?.status === "rejected") {
        setMessage(`✕ Archivo rechazado. ${data.reason || "Comprobante no válido."}`);
        return;
      }

      if (data?.status === "verification_unavailable") {
        setMessage(`⚠ ${data.reason || "No se pudo verificar el comprobante en este momento. El archivo NO fue aceptado. Intentá nuevamente más tarde."}`);
        return;
      }

      if (data?.status === "validated") {
        const provider = data.detected_provider ? ` · ${data.detected_provider}` : "";
        const detectedDate = data.detected_payment_date ? ` · ${new Date(`${data.detected_payment_date}T12:00:00`).toLocaleDateString("es-AR")}` : "";
        setMessage(`✓ Comprobante validado correctamente${provider}${detectedDate}.`);
        await load(false);
        return;
      }

      setMessage("⚠ No se pudo verificar el comprobante en este momento. El archivo NO fue aceptado. Intentá nuevamente más tarde.");
    } catch (error) {
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      setMessage("⚠ No se pudo verificar el comprobante en este momento. El archivo NO fue aceptado. Intentá nuevamente más tarde.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (loading) {
    return <section className="payment-player-card card"><div className="empty">Cargando pagos...</div></section>;
  }

  return (
    <section className="payment-player-section">
      <div className={`payment-player-card card ${currentState.cls}`}>
        <div className="payment-player-head">
          <div>
            <span className="eyebrow">Mi cuota · {periodLabel(period)}</span>
            <h2>{player?.monthly_fee ? money(player.monthly_fee) : "Cuota sin configurar"}</h2>
          </div>
          <span className={`payment-state ${currentState.cls}`}>{currentState.label}</span>
        </div>

        {!player?.monthly_fee ? (
          <p className="payment-help">El Super Administrador todavía no asignó el importe mensual de tu cuota.</p>
        ) : (
          <>
            <p className="payment-help">
              El archivo se analiza automáticamente antes de contar como pago. Debe ser un comprobante bancario o de billetera virtual del mes en curso. El titular de la cuenta puede ser otra persona.
            </p>
            {current?.validation_reason && !isValidated(current) && (
              <div className="payment-validation-note">{current.validation_reason}</div>
            )}
            <div className="payment-player-actions">
              <input
                ref={inputRef}
                className="payment-file-input"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) => upload(e.target.files?.[0])}
              />
              <button
                type="button"
                className="primary"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? "⏳ Analizando..." : current ? "📎 Reemplazar comprobante" : "📎 Adjuntar comprobante"}
              </button>
              {current?.receipt_path && (
                <button type="button" className="payment-secondary" onClick={() => openReceipt(current.receipt_path, setMessage)}>
                  👁 Ver comprobante
                </button>
              )}
            </div>
          </>
        )}

        {message && <div className="message payment-message">{message}</div>}
      </div>

      <div className="card payment-history-card">
        <div className="card-head"><h2>Mi historial de pagos</h2></div>
        {payments.length ? (
          <div className="payment-history-list">
            {payments.map((row) => {
              const state = paymentState(row);
              return (
                <div className="payment-history-row" key={row.id}>
                  <div>
                    <b>{periodLabel(row.period_month)}</b>
                    <span>{money(row.amount_due)}</span>
                  </div>
                  <span className={`payment-state ${state.cls}`}>{state.label}</span>
                  <button type="button" className="payment-view-small" onClick={() => openReceipt(row.receipt_path, setMessage)}>
                    Ver
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty">Todavía no hay comprobantes cargados.</div>
        )}
      </div>
    </section>
  );
}

function AdminPayments({ role }) {
  const [period, setPeriod] = useState(currentPeriod());
  const [players, setPlayers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [payments, setPayments] = useState([]);
  const [branch, setBranch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [reviewingId, setReviewingId] = useState("");
  const [message, setMessage] = useState("");

  const load = async (clearMessage = true) => {
    setLoading(true);
    if (clearMessage) setMessage("");
    try {
      const [p, c, pay] = await Promise.all([
        supabase
          .from("players")
          .select("id,full_name,category_id,team,monthly_fee,active")
          .eq("active", true)
          .order("full_name"),
        supabase.from("categories").select("id,name,gender,active").eq("active", true).order("name"),
        supabase
          .from("monthly_payments")
          .select("id,player_id,period_month,amount_due,receipt_path,receipt_name,receipt_type,uploaded_at,validation_status,validation_reason,validation_confidence,detected_payment_date,detected_amount,detected_provider,validated_at")
          .eq("period_month", period),
      ]);
      if (p.error) throw p.error;
      if (c.error) throw c.error;
      if (pay.error) throw pay.error;
      setPlayers(p.data || []);
      setCategories(c.data || []);
      setPayments(pay.data || []);
    } catch (error) {
      setMessage("No se pudieron cargar los pagos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [period]);

  useEffect(() => {
    setCategoryId("");
  }, [branch]);

  const paymentByPlayer = useMemo(
    () => Object.fromEntries(payments.map((row) => [row.player_id, row])),
    [payments],
  );

  const visibleCategories = useMemo(
    () => categories.filter((c) => !branch || c.gender === branch),
    [categories, branch],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((p) => {
      const cat = categories.find((c) => c.id === p.category_id);
      const pay = paymentByPlayer[p.id];
      const paid = isValidated(pay);
      if (branch && cat?.gender !== branch) return false;
      if (categoryId && p.category_id !== categoryId) return false;
      if (status === "paid" && !paid) return false;
      if (status === "pending" && (paid || pay?.validation_status === "manual_review")) return false;
      if (status === "review" && pay?.validation_status !== "manual_review") return false;
      if (status === "rejected" && pay?.validation_status !== "rejected") return false;
      if (q && !p.full_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [players, categories, paymentByPlayer, branch, categoryId, status, search]);

  const configured = rows.filter((p) => p.monthly_fee);
  const expected = configured.reduce((sum, p) => sum + Number(p.monthly_fee || 0), 0);
  const received = rows.reduce((sum, p) => {
    const pay = paymentByPlayer[p.id];
    return sum + (isValidated(pay) ? Number(pay.amount_due || 0) : 0);
  }, 0);
  const paidCount = rows.filter((p) => isValidated(paymentByPlayer[p.id])).length;
  const reviewCount = rows.filter((p) => paymentByPlayer[p.id]?.validation_status === "manual_review").length;

  async function updateFee(playerId, value) {
    if (role !== "super_admin") return;
    setSavingId(playerId);
    setMessage("");
    const fee = value ? Number(value) : null;
    try {
      const r = await supabase.from("players").update({ monthly_fee: fee }).eq("id", playerId).select("id,monthly_fee").single();
      if (r.error) throw r.error;
      setPlayers((prev) => prev.map((p) => p.id === playerId ? { ...p, monthly_fee: r.data.monthly_fee } : p));
    } catch (error) {
      setMessage("No se pudo actualizar la cuota.");
    } finally {
      setSavingId("");
    }
  }

  async function reviewPayment(paymentId, decision) {
    if (role !== "super_admin" || !paymentId) return;
    setReviewingId(paymentId);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("review-payment-receipt", {
        body: { payment_id: paymentId, decision },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "No se pudo resolver el comprobante.");
      setMessage(decision === "validated" ? "✓ Comprobante aprobado manualmente." : "✓ Comprobante rechazado manualmente.");
      await load(false);
    } catch (error) {
      setMessage("No se pudo resolver el comprobante.");
    } finally {
      setReviewingId("");
    }
  }

  return (
    <section className="payment-admin-section">
      <div className="page-title">
        <div>
          <h1>Pagos</h1>
          <p>Cuotas mensuales y comprobantes validados. Los Profes ven únicamente sus categorías; el Super Administrador ve el total.</p>
        </div>
      </div>

      <div className="payment-summary-grid">
        <div className="card payment-summary-card"><span>Esperado</span><b>{money(expected)}</b><small>{configured.length} cuotas configuradas</small></div>
        <div className="card payment-summary-card"><span>Validados</span><b>{paidCount} / {rows.length}</b><small>{reviewCount ? `${reviewCount} en revisión` : `${rows.length - paidCount} pendientes`}</small></div>
        <div className="card payment-summary-card"><span>Importe validado</span><b>{money(received)}</b><small>Sólo comprobantes aprobados</small></div>
      </div>

      <div className="card payment-filter-card">
        <label>Mes<input type="month" value={period.slice(0, 7)} onChange={(e) => setPeriod(`${e.target.value}-01`)} /></label>
        <label>Rama<select value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">Todas</option><option value="female">Femenino</option><option value="male">Masculino</option></select></label>
        <label>Categoría<select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Todas</option>{visibleCategories.map((c) => <option key={c.id} value={c.id}>{genderText(c.gender)} · {c.name}</option>)}</select></label>
        <label>Estado<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Todos</option><option value="paid">Validados</option><option value="review">Revisión manual</option><option value="pending">Pendientes</option><option value="rejected">Rechazados</option></select></label>
        <label className="payment-search">Buscar Jugador@<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre y apellido" /></label>
      </div>

      {message && <div className="message">{message}</div>}

      <div className="card payment-list-card">
        <div className="payment-list-head">
          <div><h2>{periodLabel(period)}</h2><p>{role === "super_admin" ? "Vista completa del club" : "Vista limitada a tus categorías autorizadas"}</p></div>
          <span>{rows.length} Jugador@s</span>
        </div>

        {loading ? (
          <div className="empty">Cargando pagos...</div>
        ) : rows.length ? (
          <div className="payment-admin-list">
            {rows.map((player) => {
              const cat = categories.find((c) => c.id === player.category_id);
              const pay = paymentByPlayer[player.id];
              const state = paymentState(pay);
              return (
                <div className="payment-admin-row" key={player.id}>
                  <div className="payment-player-info">
                    <b>{player.full_name}</b>
                    <span>{cat ? `${genderText(cat.gender)} · ${cat.name}` : "Sin categoría"}{player.team ? ` · Equipo ${player.team}` : ""}</span>
                    {pay?.validation_reason && <small className="payment-validation-reason">{pay.validation_reason}</small>}
                    {pay?.detected_provider && <small>Detectado: {pay.detected_provider}{pay.detected_payment_date ? ` · ${new Date(`${pay.detected_payment_date}T12:00:00`).toLocaleDateString("es-AR")}` : ""}{pay.detected_amount != null ? ` · ${money(pay.detected_amount)}` : ""}</small>}
                  </div>

                  <div className="payment-fee-cell">
                    <span>Cuota</span>
                    {role === "super_admin" ? (
                      <select value={player.monthly_fee || ""} disabled={savingId === player.id} onChange={(e) => updateFee(player.id, e.target.value)}>
                        <option value="">Sin configurar</option>
                        {FEES.map((fee) => <option key={fee} value={fee}>{money(fee)}</option>)}
                      </select>
                    ) : (
                      <b>{player.monthly_fee ? money(player.monthly_fee) : "Sin configurar"}</b>
                    )}
                  </div>

                  <span className={`payment-state ${state.cls}`}>{state.label}</span>

                  <div className="payment-row-actions">
                    {pay?.receipt_path ? (
                      <>
                        <button type="button" className="payment-secondary" onClick={() => openReceipt(pay.receipt_path, setMessage)}>👁 Ver comprobante</button>
                        {role === "super_admin" && pay.validation_status === "manual_review" && (
                          <div className="payment-review-actions">
                            <button type="button" className="payment-review-approve" disabled={reviewingId === pay.id} onClick={() => reviewPayment(pay.id, "validated")}>✓ Aprobar</button>
                            <button type="button" className="payment-review-reject" disabled={reviewingId === pay.id} onClick={() => reviewPayment(pay.id, "rejected")}>✕ Rechazar</button>
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="payment-no-file">Sin archivo</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty">No hay Jugador@s para estos filtros.</div>
        )}
      </div>
    </section>
  );
}

export default function PaymentHub() {
  const [adminHost, setAdminHost] = useState(null);
  const [playerHost, setPlayerHost] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [role, setRole] = useState("");
  const [playerId, setPlayerId] = useState("");

  useEffect(() => {
    let alive = true;

    const resolveIdentity = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!alive || !user) {
        if (alive) { setRole(""); setPlayerId(""); }
        return;
      }
      const [profile, player] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
        supabase.from("players").select("id").eq("user_id", user.id).eq("active", true).maybeSingle(),
      ]);
      if (!alive) return;
      setRole(profile.data?.role || "");
      setPlayerId(player.data?.id || "");
    };

    resolveIdentity();
    const { data } = supabase.auth.onAuthStateChange(() => setTimeout(resolveIdentity, 0));
    return () => {
      alive = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      const app = document.querySelector("main.app");
      const nav = app?.querySelector(":scope > nav");
      const content = app?.querySelector(".content-inner");
      if (app && nav && content && ["admin", "super_admin"].includes(role)) {
        let button = nav.querySelector("[data-payment-hub-button]");
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.setAttribute("data-payment-hub-button", "true");
          button.textContent = "Pagos";
          button.addEventListener("click", () => setAdminOpen(true));
          const training = nav.querySelector("[data-training-hub-button]");
          if (training) nav.insertBefore(button, training);
          else nav.appendChild(button);
        }

        let host = content.querySelector("[data-payment-hub-host]");
        if (!host) {
          host = document.createElement("div");
          host.setAttribute("data-payment-hub-host", "true");
          content.appendChild(host);
        }
        setAdminHost(host);
      } else {
        setAdminHost(null);
      }

      const wrap = document.querySelector("main.player-app .player-wrap");
      if (wrap && playerId) {
        let host = wrap.querySelector("[data-player-payment-host]");
        if (!host) {
          host = document.createElement("div");
          host.setAttribute("data-player-payment-host", "true");
          const access = wrap.querySelector(".access-box");
          if (access) access.insertAdjacentElement("afterend", host);
          else wrap.appendChild(host);
        }
        setPlayerHost(host);
      } else {
        setPlayerHost(null);
      }
    };

    const closeFromNativeNav = (event) => {
      const button = event.target?.closest?.("main.app > nav button");
      if (!button || button.hasAttribute("data-payment-hub-button")) return;
      setAdminOpen(false);
    };

    sync();
    document.addEventListener("click", closeFromNativeNav, true);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("click", closeFromNativeNav, true);
      observer.disconnect();
    };
  }, [role, playerId]);

  useEffect(() => {
    if (!adminHost) return;
    const content = adminHost.parentElement;
    const button = document.querySelector("main.app > nav [data-payment-hub-button]");
    if (!content) return;
    Array.from(content.children).forEach((child) => {
      if (child === adminHost) child.style.display = adminOpen ? "" : "none";
      else child.style.display = adminOpen ? "none" : "";
    });
    button?.classList.toggle("active", adminOpen);
  }, [adminHost, adminOpen]);

  return (
    <>
      {adminHost && createPortal(<AdminPayments role={role} />, adminHost)}
      {playerHost && playerId && createPortal(<PlayerPayments playerId={playerId} />, playerHost)}
    </>
  );
}

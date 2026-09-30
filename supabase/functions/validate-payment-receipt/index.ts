import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "payment-receipts";
const PAYMENT_START_PERIOD = "2026-10-01";

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

function addMonths(period: string, amount = 1) {
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

function oldestUnpaidPeriod(payments: Array<{ period_month: string; validation_status: string }>, maxPeriod: string | null) {
  if (!maxPeriod) return null;
  const byPeriod = new Map(payments.map((row) => [row.period_month, row]));
  for (let period = PAYMENT_START_PERIOD; period <= maxPeriod; period = addMonths(period, 1)) {
    const row = byPeriod.get(period);
    if (!row || row.validation_status !== "validated") return period;
  }
  return null;
}
const OCR_URL = "https://www.voleysanmartin.com.ar/api/validate-payment";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const OFFICIAL = {
  cvu: "0000003100057442515764",
  alias: "comision.voley.mgsm",
  name: "Pablo Javier Iglesias",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function extractPaymentDate(text: string) {
  const plain = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const spanish = plain.match(/\b([0-3]?\d)\s*[\/-]\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s*[\/-]\s*(20\d{2})\b/);
  if (spanish) {
    const day = Number(spanish[1]);
    const month = MONTHS[spanish[2]];
    const year = Number(spanish[3]);
    if (day >= 1 && day <= 31 && month) return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const numeric = plain.match(/\b([0-3]?\d)\s*[\/.\-]\s*([01]?\d)\s*[\/.\-]\s*(20\d{2})\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = Number(numeric[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const spaced = plain.match(/\b([0-3]?\d)\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(20\d{2})\b/);
  if (spaced) {
    const day = Number(spaced[1]);
    const month = MONTHS[spaced[2]];
    const year = Number(spaced[3]);
    if (day >= 1 && day <= 31 && month) return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  return null;
}

function isoDate(date: Date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function paymentWindow(periodMonth: string) {
  const match = periodMonth.match(/^(\d{4})-(\d{2})(?:-01)?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = new Date(Date.UTC(year, month - 2, 25, 12));
  const end = new Date(Date.UTC(year, month, 0, 12));
  return { start: isoDate(start), end: isoDate(end) };
}

function dateInsideWindow(paymentDate: string, periodMonth: string) {
  const window = paymentWindow(periodMonth);
  return !!window && paymentDate >= window.start && paymentDate <= window.end;
}

function extractCvuCandidates(text: string) {
  const raw = String(text || "");
  const candidates: Array<{ value: string; context: string }> = [];
  const pattern = /(?:\d[\s.\-]*){22}/g;
  for (const match of raw.matchAll(pattern)) {
    const digits = compactDigits(match[0]);
    if (digits.length !== 22) continue;
    const index = match.index || 0;
    const start = Math.max(0, index - 180);
    const end = Math.min(raw.length, index + match[0].length + 180);
    candidates.push({ value: digits, context: normalizeText(raw.slice(start, end)) });
  }
  return candidates;
}

function destinationCvuStatus(text: string) {
  const candidates = extractCvuCandidates(text);
  const destinationWords = /(destino|destinatari|a quien|para quien|transferiste a|transferencia a|cuenta de destino|cvu destino|receptor|beneficiario)/;
  const marked = candidates.filter((item) => destinationWords.test(item.context));

  if (marked.some((item) => item.value === OFFICIAL.cvu)) {
    return { verified: true, explicitWrong: false, detected: OFFICIAL.cvu };
  }
  if (marked.length && !marked.some((item) => item.value === OFFICIAL.cvu)) {
    return { verified: false, explicitWrong: true, detected: marked[0].value };
  }

  const officialCandidate = candidates.find((item) => item.value === OFFICIAL.cvu);
  const normalized = normalizeText(text);
  const nameOk = normalized.includes(normalizeText(OFFICIAL.name));
  if (officialCandidate && nameOk) {
    return { verified: true, explicitWrong: false, detected: OFFICIAL.cvu };
  }

  return {
    verified: false,
    explicitWrong: false,
    detected: candidates.length === 1 ? candidates[0].value : null,
  };
}

function monthMatches(text: string, period: string) {
  const [year, month] = period.split("-");
  const monthNumber = Number(month);
  const names = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const normalized = normalizeText(text);
  const monthName = names[monthNumber - 1];
  if (normalized.includes(`${monthName} ${year}`)) return true;
  const dmy = new RegExp(`(?:^|\\D)(?:0?[1-9]|[12]\\d|3[01])[\\/\\-.](?:0?${monthNumber})[\\/\\-.]${year}(?:\\D|$)`);
  const ymd = new RegExp(`(?:^|\\D)${year}[\\/\\-.](?:0?${monthNumber})[\\/\\-.](?:0?[1-9]|[12]\\d|3[01])(?:\\D|$)`);
  return dmy.test(text) || ymd.test(text);
}

async function extractPdfText(bytes: Uint8Array) {
  const raw = new TextDecoder("latin1").decode(bytes);
  const simple = [...raw.matchAll(/\(([^()]*)\)\s*Tj/g)].map((m) => m[1]);
  const arrays = [...raw.matchAll(/\[(.*?)\]\s*TJ/gs)].flatMap((m) =>
    [...m[1].matchAll(/\(([^()]*)\)/g)].map((x) => x[1]),
  );
  return [...simple, ...arrays].join(" ").replace(/\\([()\\])/g, "$1");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Método no permitido." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return reply(401, { error: "Sesión requerida." });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return reply(401, { error: "Sesión inválida o vencida." });

    const payload = await req.json();
    const receiptPath = String(payload?.receipt_path || "");
    const receiptName = String(payload?.receipt_name || "comprobante").slice(0, 180);
    const receiptType = String(payload?.receipt_type || "");
    const periodMonth = String(payload?.period_month || "");

    if (!/^\d{4}-\d{2}-01$/.test(periodMonth)) return reply(400, { error: "Período inválido." });
    if (periodMonth < PAYMENT_START_PERIOD) return reply(400, { error: "El Registro De Pagos Comienza En Octubre De 2026." });
    const maxEligiblePeriod = maxEligiblePaymentPeriod();
    if (!maxEligiblePeriod) return reply(400, { error: "La Carga De Pagos Se Habilita El 25 De Septiembre De 2026." });
    if (!ALLOWED_TYPES.has(receiptType)) return reply(400, { error: "Tipo de archivo no permitido." });

    const { data: player, error: playerError } = await admin
      .from("players")
      .select("id,user_id,monthly_fee,active")
      .eq("user_id", userData.user.id)
      .eq("active", true)
      .maybeSingle();

    if (playerError || !player) return reply(403, { error: "No se encontró un perfil de Jugador@ activo." });
    if (!player.monthly_fee) return reply(400, { error: "La cuota mensual todavía no está configurada." });

    const { data: previousPayments, error: previousError } = await admin
      .from("monthly_payments")
      .select("period_month,validation_status")
      .eq("player_id", player.id)
      .order("period_month", { ascending: true });

    if (previousError) return reply(500, { error: "No Se Pudo Verificar El Historial De Pagos." });

    const expectedPeriod = oldestUnpaidPeriod(previousPayments || [], maxEligiblePeriod);
    if (!expectedPeriod) return reply(409, { error: "No Tenés Cuotas Habilitadas Pendientes." });
    if (periodMonth !== expectedPeriod) {
      return reply(409, { error: `El Período Correcto A Pagar Es ${expectedPeriod.slice(0, 7)}.` });
    }

    const folder = periodMonth.slice(0, 7);
    if (!receiptPath.startsWith(`${player.id}/${folder}/`)) {
      return reply(403, { error: "El archivo no corresponde a este Jugador@ o período." });
    }

    const { data: existing } = await admin
      .from("monthly_payments")
      .select("id,receipt_path")
      .eq("player_id", player.id)
      .eq("period_month", periodMonth)
      .maybeSingle();

    const now = new Date().toISOString();
    const pendingRow = {
      player_id: player.id,
      period_month: periodMonth,
      amount_due: Number(player.monthly_fee),
      receipt_path: receiptPath,
      receipt_name: receiptName,
      receipt_type: receiptType,
      uploaded_at: now,
      updated_at: now,
      validation_status: "pending_validation",
      validation_reason: "Comprobante cargado. Se verificará en segundo plano. Podés cerrar esta ventana y seguir usando la aplicación.",
      validation_confidence: null,
      detected_payment_date: null,
      detected_amount: null,
      detected_provider: "Verificación automática",
      validated_at: null,
      destination_verified: false,
      detected_recipient_name: null,
      detected_recipient_alias: null,
      detected_recipient_cvu: null,
    };

    const { data: saved, error: saveError } = await admin
      .from("monthly_payments")
      .upsert(pendingRow, { onConflict: "player_id,period_month" })
      .select("id,receipt_path")
      .single();

    if (saveError || !saved) {
      await admin.storage.from(BUCKET).remove([receiptPath]).catch(() => {});
      return reply(200, { status: "rejected", reason: "No se pudo registrar el comprobante. Intentá nuevamente." });
    }

    if (existing?.receipt_path && existing.receipt_path !== receiptPath) {
      await admin.storage.from(BUCKET).remove([existing.receipt_path]).catch(() => {});
    }

    const finalize = async (status: "validated" | "manual_review" | "rejected", reason: string, extras: Record<string, unknown> = {}) => {
      const finishedAt = new Date().toISOString();
      const update = {
        validation_status: status,
        validation_reason: reason,
        validation_confidence: extras.validation_confidence ?? null,
        detected_payment_date: extras.detected_payment_date ?? null,
        detected_amount: extras.detected_amount ?? null,
        detected_provider: extras.detected_provider ?? (status === "validated" ? "Verificación automática" : "Revisión manual"),
        validated_at: status === "validated" ? finishedAt : null,
        destination_verified: typeof extras.destination_verified === "boolean" ? extras.destination_verified : status === "validated",
        detected_recipient_name: extras.detected_recipient_name ?? null,
        detected_recipient_alias: extras.detected_recipient_alias ?? null,
        detected_recipient_cvu: extras.detected_recipient_cvu ?? null,
        updated_at: finishedAt,
      };

      await admin
        .from("monthly_payments")
        .update(update)
        .eq("id", saved.id)
        .eq("receipt_path", receiptPath)
        .eq("validation_status", "pending_validation");
    };

    const processReceipt = async () => {
      try {
        const { data: file, error: downloadError } = await admin.storage.from(BUCKET).download(receiptPath);
        if (downloadError || !file) {
          await finalize("manual_review", "Comprobante cargado. No pudo leerse automáticamente y será revisado por el Super Administrador.");
          return;
        }

        if (receiptType === "image/jpeg" || receiptType === "image/png") {
          try {
            const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(receiptPath, 600);
            if (signError || !signed?.signedUrl) throw signError || new Error("No se pudo crear URL temporal");

            const ocrResponse = await fetch(OCR_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: authorization,
                "x-supabase-anon-key": anonKey,
              },
              body: JSON.stringify({
                signed_url: signed.signedUrl,
                mime_type: receiptType,
                filename: receiptName,
                period: folder,
              }),
            });

            const ocr = await ocrResponse.json().catch(() => null);
            if (!ocrResponse.ok || !ocr?.status) throw new Error(`OCR HTTP ${ocrResponse.status}`);

            if (ocr.status === "validated") {
              await finalize("validated", String(ocr.reason || "Comprobante válido: cuenta oficial y período verificados automáticamente."), {
                validation_confidence: ocr.confidence,
                detected_payment_date: ocr.payment_date,
                detected_amount: ocr.amount,
                detected_provider: ocr.provider || "Mercado Pago",
                detected_recipient_name: ocr.recipient_name,
                detected_recipient_cvu: ocr.recipient_cvu,
                destination_verified: ocr.destination_verified === true,
              });
              return;
            }

            if (ocr.status === "rejected") {
              await finalize("rejected", String(ocr.reason || "Comprobante no válido."), {
                validation_confidence: ocr.confidence,
                detected_payment_date: ocr.payment_date,
                detected_amount: ocr.amount,
                detected_provider: ocr.provider,
                detected_recipient_name: ocr.recipient_name,
                detected_recipient_cvu: ocr.recipient_cvu,
              });
              return;
            }

            await finalize("manual_review", String(ocr.reason || "Comprobante cargado. No pudo verificarse automáticamente y será revisado por el Super Administrador."), {
              validation_confidence: ocr.confidence,
              detected_payment_date: ocr.payment_date,
              detected_amount: ocr.amount,
              detected_provider: ocr.provider || "Revisión manual",
              detected_recipient_name: ocr.recipient_name,
              detected_recipient_cvu: ocr.recipient_cvu,
            });
            return;
          } catch (ocrError) {
            console.error("La lectura automática no pudo completarse", ocrError);
            await finalize("manual_review", "Comprobante cargado. La lectura automática no pudo completarse y será revisado por el Super Administrador.");
            return;
          }
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const text = await extractPdfText(bytes);
        const paymentDate = extractPaymentDate(text);
        const window = paymentWindow(periodMonth);
        const destination = destinationCvuStatus(text);
        const normalized = normalizeText(text);
        const nameOk = normalized.includes(normalizeText(OFFICIAL.name));

        if (destination.explicitWrong) {
          await finalize("rejected", "Comprobante inválido: cuenta de destino incorrecta.", {
            detected_payment_date: paymentDate,
            detected_provider: "Mercado Pago",
            detected_recipient_name: null,
            detected_recipient_cvu: destination.detected,
            destination_verified: false,
          });
          return;
        }

        if (paymentDate && !dateInsideWindow(paymentDate, periodMonth)) {
          await finalize("manual_review", `Comprobante inválido: fecha de pago fuera del período permitido (${window?.start || "—"} al ${window?.end || "—"}). Pendiente de verificación manual.`, {
            detected_payment_date: paymentDate,
            detected_provider: "Mercado Pago",
            detected_recipient_name: nameOk ? OFFICIAL.name : null,
            detected_recipient_cvu: destination.detected,
            destination_verified: destination.verified,
          });
          return;
        }

        if (!text.trim()) {
          await finalize("manual_review", "Comprobante cargado. El PDF no contiene texto legible para verificar fecha y CVU de destino. Será revisado manualmente.");
          return;
        }

        if (!paymentDate) {
          await finalize("manual_review", "Comprobante cargado. No se pudo leer con seguridad la fecha real de la transferencia y requiere revisión manual.", {
            detected_recipient_name: nameOk ? OFFICIAL.name : null,
            detected_recipient_cvu: destination.detected,
          });
          return;
        }

        if (!destination.verified) {
          await finalize("manual_review", "Comprobante cargado. No se pudo confirmar con seguridad que el CVU de destino sea la cuenta oficial y requiere revisión manual.", {
            detected_payment_date: paymentDate,
            detected_recipient_name: nameOk ? OFFICIAL.name : null,
            detected_recipient_cvu: destination.detected,
          });
          return;
        }

        await finalize("validated", `Comprobante válido: fecha dentro del período permitido (${window?.start || "—"} al ${window?.end || "—"}) y CVU oficial de destino verificado.`, {
          validation_confidence: 1,
          detected_payment_date: paymentDate,
          detected_provider: "Mercado Pago",
          detected_recipient_name: nameOk ? OFFICIAL.name : OFFICIAL.name,
          detected_recipient_cvu: OFFICIAL.cvu,
        });
        return;
      } catch (error) {
        console.error("Error de verificación en segundo plano", error);
        await finalize("manual_review", "Comprobante cargado. No pudo verificarse automáticamente y será revisado por el Super Administrador.");
      }
    };

    const background = processReceipt();
    // @ts-ignore
    if (globalThis.EdgeRuntime?.waitUntil) globalThis.EdgeRuntime.waitUntil(background);
    else await background;

    return reply(200, {
      status: "pending_validation",
      reason: "Comprobante cargado. Se verificará en segundo plano. Podés cerrar esta ventana y seguir usando la aplicación.",
      payment_id: saved.id,
    });
  } catch (error) {
    console.error("Error al registrar comprobante", error);
    return reply(200, {
      status: "rejected",
      reason: "No se pudo registrar el comprobante. Intentá nuevamente.",
    });
  }
});
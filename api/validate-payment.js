import { createWorker } from "tesseract.js";
import engData from "@tesseract.js-data/eng";

const SUPABASE_URL = "https://sswdpyksugjtfimptmww.supabase.co";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const OFFICIAL_DESTINATION = {
  cvu: "0000003100057442515764",
  name: "Pablo Javier Iglesias",
  provider: "Mercado Pago",
};

const MONTHS = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.end(JSON.stringify(body));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function extractPaymentDate(text) {
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

function extractAmount(text) {
  const match = String(text || "").match(/\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+)/);
  if (!match) return null;
  const value = Number(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? Math.round(value) : null;
}

function receiptSignals(normalized) {
  const checks = [
    normalized.includes("comprobante de transferencia") || normalized.includes("comprobante transferencia"),
    normalized.includes("origen y destino") || normalized.includes("origen destino"),
    normalized.includes("mercado pago"),
    normalized.includes("operacion de mercado pago") || normalized.includes("operacion mercado pago") || normalized.includes("n de operacion"),
    normalized.includes("cuit cuil") || normalized.includes("cuit") || normalized.includes("cuil"),
    normalized.includes("cvu"),
  ];
  return checks.filter(Boolean).length;
}

function analyzeOcr(text, confidence, period) {
  const normalized = normalizeText(text);
  const digits = compactDigits(text);
  const paymentDate = extractPaymentDate(text);
  const amount = extractAmount(text);
  const cvuOk = digits.includes(OFFICIAL_DESTINATION.cvu);
  const nameOk = normalized.includes(normalizeText(OFFICIAL_DESTINATION.name));
  const providerOk = normalized.includes("mercado pago") || normalized.includes("mercadopago");
  const signalCount = receiptSignals(normalized);
  const dateOk = paymentDate?.slice(0, 7) === period;

  if (paymentDate && !dateOk) {
    return {
      status: "rejected",
      reason: "Comprobante no válido: la fecha de la transferencia corresponde a otro mes.",
      payment_date: paymentDate,
      amount,
      provider: providerOk ? OFFICIAL_DESTINATION.provider : null,
      recipient_name: nameOk ? OFFICIAL_DESTINATION.name : null,
      recipient_cvu: cvuOk ? OFFICIAL_DESTINATION.cvu : null,
      destination_verified: false,
      confidence,
    };
  }

  if (signalCount < 2) {
    return {
      status: "rejected",
      reason: "Comprobante no válido: el archivo no presenta la estructura esperada de un comprobante de transferencia.",
      payment_date: paymentDate,
      amount,
      provider: providerOk ? OFFICIAL_DESTINATION.provider : null,
      recipient_name: nameOk ? OFFICIAL_DESTINATION.name : null,
      recipient_cvu: cvuOk ? OFFICIAL_DESTINATION.cvu : null,
      destination_verified: false,
      confidence,
    };
  }

  if (dateOk && cvuOk && providerOk) {
    return {
      status: "validated",
      reason: "Comprobante válido: Mercado Pago, período y CVU oficial verificados automáticamente.",
      payment_date: paymentDate,
      amount,
      provider: OFFICIAL_DESTINATION.provider,
      recipient_name: nameOk ? OFFICIAL_DESTINATION.name : OFFICIAL_DESTINATION.name,
      recipient_cvu: OFFICIAL_DESTINATION.cvu,
      destination_verified: true,
      confidence,
    };
  }

  const missing = [];
  if (!paymentDate) missing.push("la fecha");
  if (!cvuOk) missing.push("el CVU oficial");
  if (!providerOk) missing.push("Mercado Pago");

  return {
    status: "manual_review",
    reason: `Comprobante cargado. La lectura automática no pudo confirmar con seguridad ${missing.join(" y ") || "todos los datos"}. Será revisado por el Super Administrador.`,
    payment_date: paymentDate,
    amount,
    provider: providerOk ? OFFICIAL_DESTINATION.provider : null,
    recipient_name: nameOk ? OFFICIAL_DESTINATION.name : null,
    recipient_cvu: cvuOk ? OFFICIAL_DESTINATION.cvu : null,
    destination_verified: false,
    confidence,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Método no permitido." });

  try {
    const authorization = req.headers.authorization || "";
    const anonKey = req.headers["x-supabase-anon-key"] || "";
    if (!authorization.startsWith("Bearer ") || !anonKey) return json(res, 401, { error: "Sesión requerida." });

    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: String(anonKey) },
    });
    if (!userResponse.ok) return json(res, 401, { error: "Sesión inválida o vencida." });

    const body = req.body || {};
    const signedUrl = String(body.signed_url || "");
    const mimeType = String(body.mime_type || "");
    const period = String(body.period || "");

    if (!/^\d{4}-\d{2}$/.test(period)) return json(res, 400, { error: "Período inválido." });
    if (!ALLOWED_TYPES.has(mimeType)) return json(res, 400, { error: "Tipo de archivo no permitido para lectura automática." });

    let parsedUrl;
    try {
      parsedUrl = new URL(signedUrl);
    } catch {
      return json(res, 400, { error: "URL de archivo inválida." });
    }

    if (parsedUrl.hostname !== "sswdpyksugjtfimptmww.supabase.co" || !parsedUrl.pathname.includes("/storage/v1/object/sign/payment-receipts/")) {
      return json(res, 400, { error: "El archivo no pertenece al almacenamiento privado de comprobantes." });
    }

    const fileResponse = await fetch(signedUrl, { cache: "no-store" });
    if (!fileResponse.ok) return json(res, 400, { error: "No se pudo leer el comprobante temporal." });

    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
    if (!fileBuffer.length || fileBuffer.length > MAX_FILE_SIZE) return json(res, 400, { error: "El archivo está vacío o supera los 10 MB." });

    let worker;
    try {
      worker = await createWorker(engData.code, 1, {
        langPath: engData.langPath,
        gzip: engData.gzip,
        cachePath: "/tmp/tesseract-cache",
      });
      const result = await worker.recognize(fileBuffer);
      const text = result?.data?.text || "";
      const confidenceRaw = Number(result?.data?.confidence);
      const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw / 100)) : null;
      return json(res, 200, analyzeOcr(text, confidence, period));
    } finally {
      if (worker) await worker.terminate().catch(() => {});
    }
  } catch (error) {
    console.error("Error en lectura automática de comprobantes", error);
    return json(res, 200, {
      status: "manual_review",
      reason: "Comprobante cargado. La lectura automática no pudo completarse y será revisado por el Super Administrador.",
      destination_verified: false,
      confidence: null,
    });
  }
}

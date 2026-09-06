const SUPABASE_URL = "https://sswdpyksugjtfimptmww.supabase.co";
const AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/responses";
const AI_MODEL = "google/gemini-2.5-flash";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const OFFICIAL_DESTINATION = {
  alias: "comision.voley.mgsm",
  cvu: "0000003100057442515764",
  name: "Pablo Javier Iglesias",
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
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeAlias(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function destinationEvidence(value) {
  const recipientName = String(value?.recipient_name || "").trim().slice(0, 160) || null;
  const recipientAlias = String(value?.recipient_alias || "").trim().slice(0, 120) || null;
  const recipientCvu = String(value?.recipient_cvu || "").trim().slice(0, 80) || null;

  const aliasMatch = recipientAlias && normalizeAlias(recipientAlias) === normalizeAlias(OFFICIAL_DESTINATION.alias);
  const cvuMatch = recipientCvu && normalizeDigits(recipientCvu) === OFFICIAL_DESTINATION.cvu;
  const nameMatch = recipientName && normalizeText(recipientName) === normalizeText(OFFICIAL_DESTINATION.name);

  const explicitMismatch =
    (recipientAlias && !aliasMatch) ||
    (recipientCvu && normalizeDigits(recipientCvu).length >= 10 && !cvuMatch) ||
    (recipientName && !nameMatch);

  return {
    recipientName,
    recipientAlias,
    recipientCvu,
    exactEvidence: Boolean(aliasMatch || cvuMatch || nameMatch),
    explicitMismatch,
  };
}

function normalizeResult(value, period) {
  const confidence = Number(value?.confidence);
  const safeConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value?.payment_date || "")) ? value.payment_date : null;
  const amount = Number(value?.amount);
  const safeAmount = Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : null;
  const provider = String(value?.provider || "").trim().slice(0, 120) || null;
  const reason = String(value?.reason || "No se pudo verificar el comprobante.").trim().slice(0, 700);
  const evidence = destinationEvidence(value);

  if (date && date.slice(0, 7) !== period) {
    return {
      status: "rejected",
      confidence: Math.max(safeConfidence, 0.95),
      payment_date: date,
      amount: safeAmount,
      provider,
      reason: "Comprobante no válido: la fecha de la operación no corresponde al mes en curso.",
      destination_verified: false,
      recipient_name: evidence.recipientName,
      recipient_alias: evidence.recipientAlias,
      recipient_cvu: evidence.recipientCvu,
    };
  }

  if (!date) {
    return {
      status: "rejected",
      confidence: safeConfidence,
      payment_date: null,
      amount: safeAmount,
      provider,
      reason: "Comprobante no válido: no se pudo verificar la fecha de la operación.",
      destination_verified: false,
      recipient_name: evidence.recipientName,
      recipient_alias: evidence.recipientAlias,
      recipient_cvu: evidence.recipientCvu,
    };
  }

  if (evidence.explicitMismatch) {
    return {
      status: "rejected",
      confidence: Math.max(safeConfidence, 0.98),
      payment_date: date,
      amount: safeAmount,
      provider,
      reason: "Comprobante no válido: la transferencia no fue enviada a la cuenta oficial de VOLEY.",
      destination_verified: false,
      recipient_name: evidence.recipientName,
      recipient_alias: evidence.recipientAlias,
      recipient_cvu: evidence.recipientCvu,
    };
  }

  if (!evidence.exactEvidence) {
    return {
      status: "rejected",
      confidence: safeConfidence,
      payment_date: date,
      amount: safeAmount,
      provider,
      reason: "Comprobante no válido: no se pudo comprobar que el dinero haya sido enviado a la cuenta oficial de VOLEY.",
      destination_verified: false,
      recipient_name: evidence.recipientName,
      recipient_alias: evidence.recipientAlias,
      recipient_cvu: evidence.recipientCvu,
    };
  }

  if (String(value?.status || "").toLowerCase() !== "validated") {
    return {
      status: "rejected",
      confidence: safeConfidence,
      payment_date: date,
      amount: safeAmount,
      provider,
      reason: reason.startsWith("Comprobante") ? reason : `Comprobante no válido: ${reason}`,
      destination_verified: false,
      recipient_name: evidence.recipientName,
      recipient_alias: evidence.recipientAlias,
      recipient_cvu: evidence.recipientCvu,
    };
  }

  return {
    status: "validated",
    confidence: safeConfidence,
    payment_date: date,
    amount: safeAmount,
    provider,
    reason: "Comprobante válido: transferencia del mes en curso enviada a la cuenta oficial de VOLEY.",
    destination_verified: true,
    recipient_name: evidence.recipientName,
    recipient_alias: evidence.recipientAlias,
    recipient_cvu: evidence.recipientCvu,
  };
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") return content.text;
    }
  }
  return "";
}

function parseJsonText(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("La respuesta del analizador no tuvo un formato válido.");
  }
}

function runtimeGatewayToken(req) {
  const explicitKey = process.env.AI_GATEWAY_API_KEY;
  if (explicitKey) return explicitKey;
  const headerValue = req.headers["x-vercel-oidc-token"];
  if (Array.isArray(headerValue)) return headerValue[0] || "";
  if (typeof headerValue === "string" && headerValue) return headerValue;
  return process.env.VERCEL_OIDC_TOKEN || "";
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
    const filename = String(body.filename || "comprobante").slice(0, 160);
    const period = String(body.period || "");

    if (!/^\d{4}-\d{2}$/.test(period)) return json(res, 400, { error: "Período inválido." });
    if (!ALLOWED_TYPES.has(mimeType)) return json(res, 400, { error: "Tipo de archivo no permitido." });

    let parsedUrl;
    try { parsedUrl = new URL(signedUrl); } catch { return json(res, 400, { error: "URL de archivo inválida." }); }
    if (parsedUrl.hostname !== "sswdpyksugjtfimptmww.supabase.co" || !parsedUrl.pathname.includes("/storage/v1/object/sign/payment-receipts/")) {
      return json(res, 400, { error: "El archivo no pertenece al almacenamiento privado de comprobantes." });
    }

    const fileResponse = await fetch(signedUrl, { cache: "no-store" });
    if (!fileResponse.ok) return json(res, 400, { error: "No se pudo leer el comprobante temporal." });
    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
    if (!fileBuffer.length || fileBuffer.length > MAX_FILE_SIZE) return json(res, 400, { error: "El archivo está vacío o supera los 10 MB." });

    const base64 = fileBuffer.toString("base64");
    const instruction = `Analizá este archivo como comprobante de una cuota deportiva del período ${period}.

CUENTA OFICIAL DE DESTINO OBLIGATORIA:
- Plataforma: Mercado Pago
- Alias: ${OFFICIAL_DESTINATION.alias}
- CVU: ${OFFICIAL_DESTINATION.cvu}
- Titular: ${OFFICIAL_DESTINATION.name}

Reglas obligatorias y conservadoras:
1. VALIDATED sólo si el archivo es claramente un comprobante real de pago o transferencia de un banco o billetera virtual.
2. La FECHA DE LA OPERACIÓN debe pertenecer exactamente al período ${period}.
3. La transferencia debe estar dirigida a la cuenta oficial indicada arriba. Extraé literalmente, si aparecen, nombre del destinatario, alias y CVU. No los inventes ni los infieras.
4. Si el comprobante muestra otro destinatario, otro alias o otro CVU, REJECTED.
5. Si no se puede confirmar en el archivo al menos uno de estos identificadores exactos de destino (alias, CVU o titular), REJECTED.
6. Si el archivo no es un comprobante de pago, REJECTED.
7. El pagador puede ser cualquier persona. NO compares el nombre del pagador con el jugador.
8. El importe puede ser distinto de la cuota. NO rechaces por importe.
9. Ante cualquier duda o dato ilegible, REJECTED.
10. Toda explicación debe estar en español.

Respondé EXCLUSIVAMENTE JSON válido con esta forma exacta:
{"status":"validated|rejected","confidence":0.0,"payment_date":"YYYY-MM-DD o null","amount":12345,"provider":"banco o billetera o null","recipient_name":"nombre exacto o null","recipient_alias":"alias exacto o null","recipient_cvu":"CVU exacto o null","reason":"explicación breve en español"}`;

    const content = [
      { type: "input_text", text: instruction },
      mimeType === "application/pdf"
        ? { type: "input_file", filename, file_data: `data:application/pdf;base64,${base64}` }
        : { type: "input_image", image_url: `data:${mimeType};base64,${base64}`, detail: "high" },
    ];

    const gatewayToken = runtimeGatewayToken(req);
    if (!gatewayToken) {
      console.error("No se recibió credencial OIDC de Vercel para el analizador de comprobantes.");
      return json(res, 503, {
        code: "validator_unavailable",
        error: "No se pudo verificar el comprobante en este momento. El archivo no fue aceptado. Intentá nuevamente más tarde.",
      });
    }

    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${gatewayToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: AI_MODEL, input: [{ role: "user", content }], max_output_tokens: 800 }),
    });

    const aiPayload = await aiResponse.json().catch(() => null);
    if (!aiResponse.ok) {
      console.error("Error del analizador de comprobantes", aiResponse.status, aiPayload);
      const unavailable = aiResponse.status === 403 || aiResponse.status === 429 || aiResponse.status >= 500;
      return json(res, unavailable ? 503 : 502, {
        code: "validator_unavailable",
        error: "No se pudo verificar el comprobante en este momento. El archivo no fue aceptado. Intentá nuevamente más tarde.",
      });
    }

    return json(res, 200, normalizeResult(parseJsonText(extractOutputText(aiPayload)), period));
  } catch (error) {
    console.error("Error al validar comprobante", error);
    return json(res, 503, {
      code: "validator_unavailable",
      error: "No se pudo verificar el comprobante en este momento. El archivo no fue aceptado. Intentá nuevamente más tarde.",
    });
  }
}

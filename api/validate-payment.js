const SUPABASE_URL = "https://sswdpyksugjtfimptmww.supabase.co";
const AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/responses";
const AI_MODEL = "google/gemini-2.5-flash";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.end(JSON.stringify(body));
}

function normalizeResult(value, period) {
  const status = ["validated", "manual_review", "rejected"].includes(value?.status)
    ? value.status
    : "manual_review";
  const confidence = Number(value?.confidence);
  const safeConfidence = Number.isFinite(confidence)
    ? Math.max(0, Math.min(1, confidence))
    : 0.5;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value?.payment_date || ""))
    ? value.payment_date
    : null;
  const amount = Number(value?.amount);
  const safeAmount = Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : null;
  const provider = String(value?.provider || "").trim().slice(0, 120) || null;
  const reason = String(value?.reason || "No se pudo determinar con certeza el comprobante.")
    .trim()
    .slice(0, 700);

  // Defensa adicional: una fecha inequívoca fuera del período nunca puede quedar validada.
  if (date && date.slice(0, 7) !== period) {
    return {
      status: "rejected",
      confidence: Math.max(safeConfidence, 0.95),
      payment_date: date,
      amount: safeAmount,
      provider,
      reason: `El comprobante corresponde a ${date.slice(0, 7)} y no al período ${period}.`,
    };
  }

  return { status, confidence: safeConfidence, payment_date: date, amount: safeAmount, provider, reason };
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

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Método no permitido." });

  try {
    const authorization = req.headers.authorization || "";
    const anonKey = req.headers["x-supabase-anon-key"] || "";
    if (!authorization.startsWith("Bearer ") || !anonKey) {
      return json(res, 401, { error: "Sesión requerida." });
    }

    // Verifica que el JWT pertenezca a un usuario real del proyecto Supabase.
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
    if (!fileBuffer.length || fileBuffer.length > MAX_FILE_SIZE) {
      return json(res, 400, { error: "El archivo está vacío o supera los 10 MB." });
    }

    const base64 = fileBuffer.toString("base64");
    const instruction = `Analizá este archivo como comprobante de una cuota deportiva del período ${period}.\n\nTu trabajo es clasificarlo con criterio conservador:\n1. VALIDATED sólo si el archivo es claramente un comprobante real de pago/transferencia de un banco o billetera virtual y la FECHA DE LA OPERACIÓN pertenece a ${period}. Puede estar a nombre de cualquier persona: NO compares ni exijas el nombre del pagador con el jugador.\n2. REJECTED si claramente NO es un comprobante de pago (por ejemplo turno médico, receta, certificado, factura de un servicio, documento personal, foto cualquiera) o si es un comprobante de pago cuya fecha inequívoca corresponde a otro mes.\n3. MANUAL_REVIEW si parece comprobante pero la fecha no se puede leer, hay varias fechas ambiguas, está borroso, recortado, o existe cualquier duda razonable. Ante duda, no inventes datos y elegí manual_review.\n4. El importe puede ser distinto de la cuota: NO rechaces por importe.\n5. Detectá, si es posible, fecha de operación, importe y banco/billetera.\n\nRespondé EXCLUSIVAMENTE JSON válido con esta forma exacta:\n{"status":"validated|manual_review|rejected","confidence":0.0,"payment_date":"YYYY-MM-DD o null","amount":12345,"provider":"nombre o null","reason":"explicación breve en español"}`;

    const content = [
      { type: "input_text", text: instruction },
      mimeType === "application/pdf"
        ? { type: "input_file", filename, file_data: `data:application/pdf;base64,${base64}` }
        : { type: "input_image", image_url: `data:${mimeType};base64,${base64}`, detail: "high" },
    ];

    const oidcToken = process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY;
    if (!oidcToken) return json(res, 503, { error: "El analizador inteligente no está disponible en este entorno." });

    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oidcToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        input: [{ role: "user", content }],
        max_output_tokens: 700,
      }),
    });

    const aiPayload = await aiResponse.json().catch(() => null);
    if (!aiResponse.ok) {
      console.error("AI Gateway validation error", aiResponse.status, aiPayload);
      return json(res, 502, { error: "No se pudo analizar el comprobante en este momento." });
    }

    const result = normalizeResult(parseJsonText(extractOutputText(aiPayload)), period);
    return json(res, 200, result);
  } catch (error) {
    console.error("validate-payment error", error);
    return json(res, 500, { error: "No se pudo validar el comprobante." });
  }
}

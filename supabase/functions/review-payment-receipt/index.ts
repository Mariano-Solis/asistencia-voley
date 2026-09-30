import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Método no permitido." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return reply(401, { error: "Sesión requerida." });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return reply(401, { error: "Sesión inválida o vencida." });

    const { data: profile } = await admin
      .from("profiles")
      .select("role,active,can_approve_payments")
      .eq("id", userData.user.id)
      .maybeSingle();

    const canApprovePayments = profile?.role === "super_admin" || (profile?.role === "admin" && profile?.can_approve_payments === true);
    if (!canApprovePayments || profile?.active === false) {
      return reply(403, { error: "No Tenés Permiso Para Aprobar O Rechazar Comprobantes." });
    }
    const reviewerLabel = profile?.role === "super_admin" ? "El Super Administrador" : "Un Profe Autorizado";

    const payload = await req.json();
    const action = String(payload?.action || "single");
    const now = new Date().toISOString();

    if (action === "bulk_validate") {
      const periodMonth = String(payload?.period_month || "");
      if (!/^\d{4}-\d{2}-01$/.test(periodMonth)) {
        return reply(400, { error: "Período inválido." });
      }

      const note = `Aprobado En Bloque Por ${reviewerLabel} Después De Revisar Los Comprobantes Del Período.`;
      const { data: payments, error } = await admin
        .from("monthly_payments")
        .update({
          validation_status: "validated",
          validation_reason: note,
          validated_at: now,
          updated_at: now,
          destination_verified: true,
          detected_provider: "Revisión manual",
          validation_confidence: null,
        })
        .eq("period_month", periodMonth)
        .not("receipt_path", "is", null)
        .in("validation_status", ["pending_validation", "manual_review"])
        .select("id,player_id,validation_status");

      if (error) return reply(500, { error: "No se pudieron aprobar los comprobantes del período." });
      return reply(200, { ok: true, action, updated_count: payments?.length || 0, payments: payments || [] });
    }

    const paymentId = String(payload?.payment_id || "");
    if (!paymentId) return reply(400, { error: "Comprobante inválido." });

    if (action === "revoke") {
      const { data: payment, error } = await admin
        .from("monthly_payments")
        .update({
          validation_status: "manual_review",
          validation_reason: `Aprobación Revocada Por ${reviewerLabel}. El Comprobante Requiere Una Nueva Revisión.`,
          validated_at: null,
          updated_at: now,
          destination_verified: false,
          detected_provider: "Revisión manual",
          validation_confidence: null,
        })
        .eq("id", paymentId)
        .eq("validation_status", "validated")
        .select("id,validation_status,validation_reason,destination_verified")
        .maybeSingle();

      if (error) return reply(500, { error: "No se pudo revocar la aprobación." });
      if (!payment) return reply(409, { error: "El comprobante ya no está aprobado o cambió de estado." });
      return reply(200, { ok: true, action, payment });
    }

    const decision = String(payload?.decision || "");
    if (!["validated", "rejected"].includes(decision)) {
      return reply(400, { error: "Decisión inválida." });
    }

    const approved = decision === "validated";
    const note = approved
      ? `Aprobado Manualmente Por ${reviewerLabel} Después De Revisar El Comprobante.`
      : `Rechazado Manualmente Por ${reviewerLabel} Después De Revisar El Comprobante.`;

    const { data: payment, error } = await admin
      .from("monthly_payments")
      .update({
        validation_status: decision,
        validation_reason: note,
        validated_at: approved ? now : null,
        updated_at: now,
        destination_verified: approved,
        detected_provider: "Revisión manual",
        validation_confidence: null,
      })
      .eq("id", paymentId)
      .in("validation_status", ["manual_review", "pending_validation", "rejected"])
      .select("id,validation_status,validation_reason,destination_verified")
      .maybeSingle();

    if (error) return reply(500, { error: "No se pudo actualizar el comprobante." });
    if (!payment) return reply(409, { error: "El comprobante ya fue resuelto o cambió de estado." });

    return reply(200, { ok: true, action: "single", payment });
  } catch (error) {
    console.error("Error al resolver comprobante", error);
    return reply(500, { error: "No se pudo resolver el comprobante." });
  }
});
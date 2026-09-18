import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const properCase = (value: string) => value.trim().toLocaleLowerCase("es-AR").replace(/(^|[\s'-])([\p{L}])/gu, (_m, sep, letter) => sep + letter.toLocaleUpperCase("es-AR"));
const upperCase = (value: string) => value.trim().toLocaleUpperCase("es-AR");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Sesión no válida." }, 401);

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  let createdUserId = "";

  try {
    const { data: callerAuth, error: callerAuthError } = await admin.auth.getUser(token);
    if (callerAuthError || !callerAuth?.user) return json({ error: "Sesión no válida." }, 401);

    const { data: callerProfile, error: callerProfileError } = await admin.from("profiles").select("id,role,active,approval_status").eq("id", callerAuth.user.id).maybeSingle();
    if (callerProfileError) throw callerProfileError;
    if (callerProfile?.role !== "super_admin" || callerProfile.active === false || callerProfile.approval_status !== "approved") {
      return json({ error: "Solo el Super Administrador puede crear cuentas de Profes." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const firstName = properCase(String(body?.first_name || ""));
    const lastName = upperCase(String(body?.last_name || ""));
    const email = String(body?.email || "").trim().toLocaleLowerCase("es-AR");
    const password = String(body?.password || "");
    if (!firstName || !lastName) return json({ error: "Completá nombre y apellido del Profe." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Ingresá un correo electrónico válido." }, 400);
    if (password.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);

    const fullName = `${firstName} ${lastName}`.trim();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, full_name: fullName, name: fullName, registration_type: "superadmin_created_professor" },
    });
    if (createError) {
      if (/already|registered|exists/i.test(String(createError.message || ""))) return json({ error: "Ya existe una cuenta registrada con ese correo." }, 409);
      throw createError;
    }
    createdUserId = created.user?.id || "";
    if (!createdUserId) throw new Error("No se pudo identificar la nueva cuenta.");

    const { error: profileError } = await admin.from("profiles").upsert({
      id: createdUserId, full_name: fullName, role: "admin", active: true, approval_status: "approved",
      approved_by: callerAuth.user.id, approved_at: new Date().toISOString(), rejected_by: null, rejected_at: null, rejection_reason: null,
    }, { onConflict: "id" });
    if (profileError) throw profileError;

    return json({ ok: true, professor: { id: createdUserId, full_name: fullName, email, role: "admin", active: true, approval_status: "approved" } });
  } catch (error) {
    console.error("create-professor error", error);
    if (createdUserId) {
      try { await admin.auth.admin.deleteUser(createdUserId); } catch (rollbackError) { console.error("create-professor rollback error", rollbackError); }
    }
    return json({ error: error?.message || "No se pudo crear la cuenta del Profe." }, 500);
  }
});

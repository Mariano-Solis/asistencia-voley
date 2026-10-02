import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{...cors,"Content-Type":"application/json"}
});

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Método no permitido."},405);

  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token) return json({error:"Sesión no válida."},401);

  const admin=createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}}
  );

  try{
    const {data:caller,error:callerErr}=await admin.auth.getUser(token);
    if(callerErr||!caller?.user) return json({error:"Sesión no válida."},401);

    const {data:callerProfile,error:callerProfileErr}=await admin
      .from("profiles")
      .select("role,active,approval_status")
      .eq("id",caller.user.id)
      .maybeSingle();

    if(callerProfileErr) throw callerProfileErr;
    if(
      callerProfile?.role!=="super_admin" ||
      callerProfile.active===false ||
      callerProfile.approval_status!=="approved"
    ) return json({error:"Solo el Super Administrador puede cambiar contraseñas de jugador@s."},403);

    const body=await req.json().catch(()=>({}));
    const userId=String(body?.user_id||"").trim();
    const password=String(body?.password||"");

    if(!userId) return json({error:"Falta identificar la cuenta."},400);
    if(password.length<8) return json({error:"La nueva contraseña debe tener al menos 8 caracteres."},400);

    const {data:player,error:playerErr}=await admin
      .from("players")
      .select("id,user_id,active,approval_status")
      .eq("user_id",userId)
      .maybeSingle();

    if(playerErr) throw playerErr;
    if(!player) return json({error:"La cuenta indicada no corresponde a un jugador/a."},400);
    if(player.active===false) return json({error:"El jugador/a está inactivo."},400);

    const {error:updateErr}=await admin.auth.admin.updateUserById(userId,{password});
    if(updateErr) throw updateErr;

    return json({ok:true,player_id:player.id});
  }catch(error){
    console.error("update-player-account",error);
    return json({error:error?.message||"No se pudo cambiar la contraseña del jugador/a."},500);
  }
});

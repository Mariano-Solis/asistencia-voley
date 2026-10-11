import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import "./mgsm-match-stats.css";

const SKILLS = [
  {key:"serve",label:"Saque",icon:"🏐",outcomes:[
    {key:"ace",label:"Ace",icon:"⚡",point:"us"},
    {key:"positive",label:"Positivo",icon:"✓"},
    {key:"error",label:"Error",icon:"✕",point:"opponent"},
  ]},
  {key:"reception",label:"Recepción",icon:"🤲",outcomes:[
    {key:"perfect",label:"Perfecta",icon:"★"},
    {key:"positive",label:"Positiva",icon:"+"},
    {key:"negative",label:"Negativa",icon:"−"},
    {key:"error",label:"Error",icon:"✕",point:"opponent"},
  ]},
  {key:"set",label:"Armado",icon:"🙌",completeOnly:true,outcomes:[
    {key:"perfect",label:"Perfecto",icon:"★"},
    {key:"positive",label:"Positivo",icon:"+"},
    {key:"error",label:"Error",icon:"✕",point:"opponent"},
  ]},
  {key:"attack",label:"Ataque",icon:"💥",outcomes:[
    {key:"point",label:"Punto",icon:"💥",point:"us"},
    {key:"continue",label:"Continúa",icon:"✓"},
    {key:"blocked",label:"Bloqueado",icon:"🚫",point:"opponent"},
    {key:"error",label:"Error",icon:"✕",point:"opponent"},
  ]},
  {key:"block",label:"Bloqueo",icon:"🧱",outcomes:[
    {key:"point",label:"Punto",icon:"★",point:"us"},
    {key:"touch",label:"Toque",icon:"✓"},
    {key:"error",label:"Error",icon:"✕",point:"opponent"},
  ]},
  {key:"defense",label:"Defensa",icon:"🛡️",completeOnly:true,outcomes:[
    {key:"positive",label:"Buena",icon:"+"},
    {key:"continue",label:"Continúa",icon:"✓"},
    {key:"error",label:"Error",icon:"✕",point:"opponent"},
  ]},
  {key:"error",label:"Error",icon:"❌",outcomes:[
    {key:"error",label:"No Forzado",icon:"✕",point:"opponent"},
  ]},
];

const SIMPLE_ACTIONS = [
  {skill:"serve",outcome:"ace",point:"us",label:"Ace",icon:"⚡"},
  {skill:"reception",outcome:"positive",point:null,label:"Recep +",icon:"🤲"},
  {skill:"attack",outcome:"point",point:"us",label:"Kill",icon:"💥"},
  {skill:"block",outcome:"point",point:"us",label:"Bloqueo",icon:"🧱"},
  {skill:"error",outcome:"error",point:"opponent",label:"Error",icon:"✕"},
];

const COURT_ZONES = ["Z4","Z3","Z2","Z5","Z6","Z1"];

function uuid(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{
    const r=Math.random()*16|0,v=c==="x"?r:(r&0x3|0x8);
    return v.toString(16);
  });
}
function normalize(value=""){
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]/g,"");
}
function isoDate(value){
  const text=String(value||"").trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;
  const dmy=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(dmy){
    const year=dmy[3].length===2?"20"+dmy[3]:dmy[3];
    return `${year}-${String(dmy[2]).padStart(2,"0")}-${String(dmy[1]).padStart(2,"0")}`;
  }
  return null;
}
function pct(value){return Number.isFinite(value)?`${Math.round(value)}%`:"—"}
function queueKey(sessionId){return `mgsm-match-stats-queue:${sessionId}`}
function readQueue(sessionId){
  try{return JSON.parse(localStorage.getItem(queueKey(sessionId))||"[]")}catch{return[]}
}
function writeQueue(sessionId,rows){
  try{localStorage.setItem(queueKey(sessionId),JSON.stringify(rows))}catch{}
}
function networkish(error){
  const msg=String(error?.message||"");
  return !navigator.onLine||/fetch|network|timeout|offline|load failed/i.test(msg);
}
function playerName(player){
  return player?.full_name||[player?.last_name,player?.first_name].filter(Boolean).join(" ")||"Jugador@";
}
function shortName(player){
  const last=String(player?.last_name||"").trim();
  if(last)return last.split(" ")[0];
  const full=playerName(player).trim().split(/\s+/);
  return full.length>1?full[full.length-1]:full[0]||"Jugador@";
}
function initials(player){
  return playerName(player).split(/\s+/).filter(Boolean).slice(0,2).map(item=>item[0]).join("").toUpperCase()||"?";
}
function actionLabel(event){
  if(event.skill==="team_point")return "Punto MSM";
  if(event.skill==="opponent_point")return "Punto Rival";
  const skill=SKILLS.find(item=>item.key===event.skill);
  const outcome=skill?.outcomes.find(item=>item.key===event.outcome);
  return [skill?.label,outcome?.label].filter(Boolean).join(" · ");
}
function sortEvents(rows){
  return [...rows].sort((a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||"")));
}
function computeTeamSummary(events){
  const row={
    serve:0,aces:0,serveErrors:0,receptions:0,receptionPositive:0,receptionPerfect:0,receptionErrors:0,
    sets:0,setPositive:0,setErrors:0,attacks:0,attackPoints:0,attackErrors:0,blocked:0,
    blockPoints:0,blockErrors:0,defenses:0,defensePositive:0,defenseErrors:0,unforcedErrors:0,
  };
  for(const event of events){
    if(event.skill==="serve"){row.serve++;if(event.outcome==="ace")row.aces++;if(event.outcome==="error")row.serveErrors++;}
    if(event.skill==="reception"){row.receptions++;if(["perfect","positive"].includes(event.outcome))row.receptionPositive++;if(event.outcome==="perfect")row.receptionPerfect++;if(event.outcome==="error")row.receptionErrors++;}
    if(event.skill==="set"){row.sets++;if(["perfect","positive"].includes(event.outcome))row.setPositive++;if(event.outcome==="error")row.setErrors++;}
    if(event.skill==="attack"){row.attacks++;if(event.outcome==="point")row.attackPoints++;if(event.outcome==="error")row.attackErrors++;if(event.outcome==="blocked")row.blocked++;}
    if(event.skill==="block"){if(event.outcome==="point")row.blockPoints++;if(event.outcome==="error")row.blockErrors++;}
    if(event.skill==="defense"){row.defenses++;if(["positive","continue"].includes(event.outcome))row.defensePositive++;if(event.outcome==="error")row.defenseErrors++;}
    if(event.skill==="error")row.unforcedErrors++;
  }
  return {
    ...row,
    receptionPositivePct:row.receptions?(row.receptionPositive/row.receptions)*100:null,
    receptionPerfectPct:row.receptions?(row.receptionPerfect/row.receptions)*100:null,
    attackEfficiency:row.attacks?((row.attackPoints-row.attackErrors-row.blocked)/row.attacks)*100:null,
    totalErrors:row.serveErrors+row.receptionErrors+row.setErrors+row.attackErrors+row.blockErrors+row.defenseErrors+row.unforcedErrors,
  };
}
function computeSetScores(events){
  const map=new Map();
  for(const event of events){
    const set=Number(event.set_number||0);
    if(!set)continue;
    if(!map.has(set))map.set(set,{set,us:0,opponent:0});
    const row=map.get(set);
    if(event.point_for==="us")row.us++;
    if(event.point_for==="opponent")row.opponent++;
  }
  return [...map.values()].sort((a,b)=>a.set-b.set);
}
function computePlayerSummary(events,players){
  const byId=new Map(players.map(player=>[player.id,{
    id:player.id,name:playerName(player),
    serve:0,aces:0,serveErrors:0,receptions:0,receptionPositive:0,receptionPerfect:0,receptionErrors:0,
    sets:0,setPositive:0,setErrors:0,attacks:0,attackPoints:0,attackErrors:0,blocked:0,
    blockPoints:0,blockErrors:0,defenses:0,defensePositive:0,defenseErrors:0,errors:0,
  }]));
  for(const event of events){
    if(!event.player_id||!byId.has(event.player_id))continue;
    const row=byId.get(event.player_id);
    if(event.skill==="serve"){row.serve++;if(event.outcome==="ace")row.aces++;if(event.outcome==="error")row.serveErrors++;}
    if(event.skill==="reception"){row.receptions++;if(["perfect","positive"].includes(event.outcome))row.receptionPositive++;if(event.outcome==="perfect")row.receptionPerfect++;if(event.outcome==="error")row.receptionErrors++;}
    if(event.skill==="set"){row.sets++;if(["perfect","positive"].includes(event.outcome))row.setPositive++;if(event.outcome==="error")row.setErrors++;}
    if(event.skill==="attack"){row.attacks++;if(event.outcome==="point")row.attackPoints++;if(event.outcome==="error")row.attackErrors++;if(event.outcome==="blocked")row.blocked++;}
    if(event.skill==="block"){if(event.outcome==="point")row.blockPoints++;if(event.outcome==="error")row.blockErrors++;}
    if(event.skill==="defense"){row.defenses++;if(["positive","continue"].includes(event.outcome))row.defensePositive++;if(event.outcome==="error")row.defenseErrors++;}
    if(event.skill==="error")row.errors++;
  }
  return [...byId.values()].map(row=>({
    ...row,
    attackEfficiency:row.attacks?((row.attackPoints-row.attackErrors-row.blocked)/row.attacks)*100:null,
    receptionPositivePct:row.receptions?(row.receptionPositive/row.receptions)*100:null,
    totalErrors:row.errors+row.serveErrors+row.receptionErrors+row.setErrors+row.attackErrors+row.blockErrors+row.defenseErrors,
  })).filter(row=>events.some(event=>event.player_id===row.id));
}

export default function MatchStatsPanel({match,category,canManage=false,canView=false,currentPlayerId=null,onClose}){
  const [session,setSession]=useState(null);
  const [events,setEvents]=useState([]);
  const [players,setPlayers]=useState([]);
  const [selectedPlayer,setSelectedPlayer]=useState(currentPlayerId||"");
  const [selectedSkill,setSelectedSkill]=useState("attack");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [syncing,setSyncing]=useState(false);
  const [message,setMessage]=useState("");
  const [lastAction,setLastAction]=useState("");
  const [pending,setPending]=useState([]);
  const [captureView,setCaptureView]=useState(canManage?"live":"summary");
  const [lineupDraft,setLineupDraft]=useState([]);
  const [editingLineup,setEditingLineup]=useState(false);
  const [realtimeStatus,setRealtimeStatus]=useState("connecting");
  const actorRef=useRef(null);
  const flashTimer=useRef(null);

  const ourIsLocal=normalize(match?.local).startsWith("MSM");
  const ourIsVisitor=normalize(match?.visitor).startsWith("MSM");
  const validMsmMatch=ourIsLocal||ourIsVisitor;
  const ourTeam=ourIsLocal?match?.local:ourIsVisitor?match?.visitor:"MSM";
  const rivalTeam=ourIsLocal?match?.visitor:ourIsVisitor?match?.local:"Rival";

  function flash(text){
    setLastAction(text);
    if(flashTimer.current)clearTimeout(flashTimer.current);
    flashTimer.current=setTimeout(()=>setLastAction(""),1800);
  }
  async function actorId(){
    if(actorRef.current)return actorRef.current;
    const result=await supabase.auth.getUser();
    actorRef.current=result.data?.user?.id||null;
    return actorRef.current;
  }
  async function load(){
    if(!validMsmMatch){setLoading(false);setMessage("Las Estadísticas Institucionales Sólo Se Habilitan En Partidos Donde Participa MSM.");return;}
    if(!category?.id){setLoading(false);setMessage("No Se Pudo Vincular Este Partido Con Una Categoría Interna.");return;}
    setLoading(true);setMessage("");
    try{
      const uid=await actorId();
      let sessionResult=await supabase.from("match_stat_sessions")
        .select("*")
        .eq("external_match_id",String(match.id))
        .eq("category_id",category.id)
        .maybeSingle();
      if(sessionResult.error)throw sessionResult.error;
      let current=sessionResult.data;
      if(!current&&canManage){
        if(!uid)throw new Error("No Hay Una Sesión De Usuario Activa.");
        const inserted=await supabase.from("match_stat_sessions").insert({
          external_match_id:String(match.id),
          category_id:category.id,
          category_label:match.categoryLabel||category.name,
          branch:match.branch||category.gender||"female",
          match_date:isoDate(match.date),
          location:match.place||null,
          our_team:ourTeam||"MSM",
          rival_team:rivalTeam||"Rival",
          created_by:uid,
          input_mode:"rally",
          rotation:1,
        }).select("*").single();
        if(inserted.error){
          if(inserted.error.code==="23505"){
            sessionResult=await supabase.from("match_stat_sessions").select("*").eq("external_match_id",String(match.id)).eq("category_id",category.id).maybeSingle();
            if(sessionResult.error)throw sessionResult.error;
            current=sessionResult.data;
          }else throw inserted.error;
        }else current=inserted.data;
      }
      if(!current){setMessage("Todavía No Hay Estadísticas Cargadas Para Este Partido.");setSession(null);return;}
      setSession(current);

      const queue=readQueue(current.id);
      setPending(queue);

      const [eventResult,playerResult]=await Promise.all([
        supabase.from("match_stat_events").select("*").eq("session_id",current.id).order("created_at"),
        canManage
          ? supabase.from("players").select("id,full_name,first_name,last_name").eq("category_id",category.id).eq("active",true).eq("approval_status","approved").order("full_name")
          : currentPlayerId
            ? supabase.from("players").select("id,full_name,first_name,last_name").eq("id",currentPlayerId).maybeSingle()
            : Promise.resolve({data:null,error:null})
      ]);
      if(eventResult.error)throw eventResult.error;
      if(playerResult.error)throw playerResult.error;
      const roster=canManage?(playerResult.data||[]):playerResult.data?[playerResult.data]:[];
      setPlayers(roster);
      const lineup=(current.current_lineup||[]).filter(id=>roster.some(player=>player.id===id));
      setLineupDraft(lineup);
      if(!selectedPlayer&&lineup.length)setSelectedPlayer(lineup[0]);
      const dbEvents=eventResult.data||[];
      const ids=new Set(dbEvents.map(item=>item.id));
      setEvents(sortEvents([...dbEvents,...queue.filter(item=>!ids.has(item.id)).map(item=>({...item,local_pending:true}))]));
      if(canManage&&queue.length)void syncQueue(current,queue);
    }catch(error){
      setMessage(String(error?.message||"No Se Pudieron Cargar Las Estadísticas."));
    }finally{setLoading(false);}
  }
  useEffect(()=>{void load()},[match?.id,category?.id,canManage,currentPlayerId]);
  useEffect(()=>()=>{if(flashTimer.current)clearTimeout(flashTimer.current)},[]);

  useEffect(()=>{
    if(!session?.id)return;
    setRealtimeStatus("connecting");
    const channel=supabase.channel(`match-stats-live:${session.id}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"match_stat_events",filter:`session_id=eq.${session.id}`},payload=>{
        const row={...payload.new,local_pending:false};
        setEvents(current=>sortEvents([...current.filter(item=>item.id!==row.id),row]));
        setPending(current=>{
          const next=current.filter(item=>item.id!==row.id);
          writeQueue(session.id,next);
          return next;
        });
      })
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"match_stat_events",filter:`session_id=eq.${session.id}`},payload=>{
        const row={...payload.new,local_pending:false};
        setEvents(current=>sortEvents([...current.filter(item=>item.id!==row.id),row]));
      })
      .on("postgres_changes",{event:"DELETE",schema:"public",table:"match_stat_events"},payload=>{
        const oldRow=payload.old||{};
        if(oldRow.session_id!==session.id)return;
        if(oldRow.id)setEvents(current=>current.filter(item=>item.id!==oldRow.id));
      })
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"match_stat_sessions",filter:`id=eq.${session.id}`},payload=>{
        setSession(current=>({...current,...payload.new}));
        if(Array.isArray(payload.new?.current_lineup))setLineupDraft(payload.new.current_lineup);
      })
      .subscribe(status=>{
        setRealtimeStatus(status==="SUBSCRIBED"?"live":status==="CHANNEL_ERROR"||status==="TIMED_OUT"?"error":"connecting");
      });
    return()=>{void supabase.removeChannel(channel)};
  },[session?.id]);

  useEffect(()=>{
    if(!session?.id||!canManage)return;
    const online=()=>{const queue=readQueue(session.id);if(queue.length)void syncQueue(session,queue)};
    window.addEventListener("online",online);
    return()=>window.removeEventListener("online",online);
  },[session?.id,canManage]);

  async function syncQueue(current=session,queue=pending){
    if(!current||!queue.length||syncing)return;
    setSyncing(true);
    let remaining=[...queue];
    try{
      for(const payload of queue){
        const inserted=await supabase.from("match_stat_events").insert(payload);
        if(inserted.error&&inserted.error.code!=="23505"){
          if(networkish(inserted.error))break;
          throw inserted.error;
        }
        remaining=remaining.filter(item=>item.id!==payload.id);
        writeQueue(current.id,remaining);
      }
      setPending(remaining);
      if(!remaining.length){
        const refreshed=await supabase.from("match_stat_events").select("*").eq("session_id",current.id).order("created_at");
        if(!refreshed.error)setEvents(refreshed.data||[]);
      }
    }catch(error){setMessage(String(error?.message||"No Se Pudieron Sincronizar Los Eventos."));}
    finally{setSyncing(false);}
  }

  async function record(skill,outcome,pointFor,needsPlayer=true){
    if(!session||!canManage||session.status==="completed")return;
    if(needsPlayer&&!selectedPlayer){flash("Elegí Un Jugador@");return;}
    const uid=await actorId();
    if(!uid){setMessage("No Hay Una Sesión De Usuario Activa.");return;}
    const payload={
      id:uuid(),session_id:session.id,set_number:session.current_set,
      player_id:needsPlayer?selectedPlayer:null,skill,outcome,point_for:pointFor||null,
      created_by:uid,created_at:new Date().toISOString(),
    };
    setEvents(current=>sortEvents([...current,{...payload,local_pending:true}]));
    const p=players.find(player=>player.id===selectedPlayer);
    flash(`✓ ${needsPlayer?shortName(p)+" · ":""}${actionLabel(payload)}`);
    const inserted=await supabase.from("match_stat_events").insert(payload);
    if(inserted.error){
      if(networkish(inserted.error)){
        setPending(current=>{
          const next=[...current.filter(item=>item.id!==payload.id),payload];
          writeQueue(session.id,next);
          return next;
        });
      }else{
        setEvents(current=>current.filter(item=>item.id!==payload.id));
        setMessage(inserted.error.message||"No Se Pudo Registrar La Acción.");
      }
    }else{
      setEvents(current=>current.map(item=>item.id===payload.id?{...payload,local_pending:false}:item));
    }
  }

  async function removeEvent(event,{confirm=false}={}){
    if(!canManage||!session||!event)return;
    if(confirm&&!window.confirm(`Eliminar Esta Acción: ${actionLabel(event)}?`))return;
    setEvents(current=>current.filter(item=>item.id!==event.id));
    if(event.local_pending){
      setPending(current=>{
        const next=current.filter(item=>item.id!==event.id);
        writeQueue(session.id,next);
        return next;
      });
      return;
    }
    const removed=await supabase.from("match_stat_events").delete().eq("id",event.id);
    if(removed.error){
      setMessage(removed.error.message||"No Se Pudo Eliminar La Acción.");
      const refreshed=await supabase.from("match_stat_events").select("*").eq("session_id",session.id).order("created_at");
      if(!refreshed.error)setEvents(refreshed.data||[]);
    }
  }
  async function undo(){
    if(!events.length)return;
    const last=events[events.length-1];
    await removeEvent(last);
    flash(`↶ Deshecho · ${actionLabel(last)}`);
  }

  async function updateSession(patch){
    if(!session||!canManage||busy)return false;
    setBusy(true);setMessage("");
    const optimistic={...session,...patch};
    setSession(optimistic);
    try{
      const result=await supabase.from("match_stat_sessions")
        .update({...patch,updated_at:new Date().toISOString()})
        .eq("id",session.id)
        .select("*").single();
      if(result.error)throw result.error;
      setSession(result.data);
      return true;
    }catch(error){
      setSession(session);
      setMessage(error?.message||"No Se Pudo Actualizar La Sesión.");
      return false;
    }finally{setBusy(false);}
  }
  async function changeMode(mode){await updateSession({input_mode:mode});}
  async function saveLineup(){
    const target=Math.min(6,players.length);
    if(lineupDraft.length!==target){flash(`Elegí ${target} Jugador@${target===1?"":"s"}`);return;}
    if(await updateSession({current_lineup:lineupDraft})){
      setEditingLineup(false);
      if(!lineupDraft.includes(selectedPlayer))setSelectedPlayer(lineupDraft[0]||"");
      flash("✓ Jugador@s En Cancha Actualizados");
    }
  }
  function toggleLineup(id){
    setLineupDraft(current=>{
      if(current.includes(id))return current.filter(item=>item!==id);
      if(current.length>=Math.min(6,players.length)){flash("Máximo 6 En Cancha");return current;}
      return [...current,id];
    });
  }
  async function rotate(){
    const lineup=session.current_lineup||[];
    if(lineup.length!==6){setEditingLineup(true);flash("Primero Configurá Las 6 En Cancha");return;}
    const rotated=[lineup[3],lineup[0],lineup[1],lineup[4],lineup[5],lineup[2]];
    if(await updateSession({current_lineup:rotated,rotation:(Number(session.rotation||1)%6)+1})){
      setLineupDraft(rotated);
      flash("↻ Rotación Actualizada");
    }
  }
  async function nextSet(){
    if(!session||session.current_set>=5)return;
    if(!window.confirm(`Finalizar Set ${session.current_set} y Comenzar Set ${session.current_set+1}?`))return;
    await updateSession({current_set:session.current_set+1,rotation:1});
  }
  async function finish(){
    if(!session||!window.confirm("Finalizar La Toma De Estadísticas De Este Partido?"))return;
    if(await updateSession({status:"completed",completed_at:new Date().toISOString()}))setCaptureView("summary");
  }
  async function reopen(){
    if(!session||session.status!=="completed")return;
    await updateSession({status:"in_progress",completed_at:null});
  }

  const visibleEvents=useMemo(()=>currentPlayerId&&!canManage?events.filter(item=>item.player_id===currentPlayerId):events,[events,currentPlayerId,canManage]);
  const currentSetEvents=events.filter(item=>item.set_number===session?.current_set);
  const score={
    us:currentSetEvents.filter(item=>item.point_for==="us").length,
    opponent:currentSetEvents.filter(item=>item.point_for==="opponent").length,
  };
  const summaries=useMemo(()=>computePlayerSummary(visibleEvents,players),[visibleEvents,players]);
  const teamSummary=useMemo(()=>computeTeamSummary(events),[events]);
  const setScores=useMemo(()=>computeSetScores(events),[events]);
  const playerById=useMemo(()=>Object.fromEntries(players.map(player=>[player.id,player])),[players]);
  const selectedSkillConfig=SKILLS.find(item=>item.key===selectedSkill)||SKILLS[0];
  const recent=visibleEvents.slice(-6).reverse();
  const lineup=(session?.current_lineup||[]).filter(id=>playerById[id]);
  const mode=session?.input_mode||"rally";
  const modeSkills=SKILLS.filter(skill=>mode==="complete"||!skill.completeOnly);

  return createPortal(<div className="match-stats-backdrop" role="dialog" aria-modal="true">
    <section className="match-stats-panel ultra-live">
      <header className="match-stats-head">
        <div><span>📊 Estadísticas Ultra Live</span><h2>{ourTeam||"MSM"} vs {rivalTeam||"Rival"}</h2><small>{match.categoryLabel||category?.name}</small></div>
        <button type="button" onClick={onClose} aria-label="Cerrar">×</button>
      </header>

      {loading?<div className="match-stats-empty">Cargando Estadísticas...</div>:!session?<div className="match-stats-empty">{message||"Sin Estadísticas Disponibles."}</div>:<>
        <section className="match-live-scorebar">
          <div className="match-live-team ours"><span>{ourTeam||"MSM"}</span><strong>{score.us}</strong></div>
          <div className="match-live-center"><b>Set {session.current_set}</b><small>Rotación {session.rotation||1}</small><span className={"match-live-status "+realtimeStatus}>{realtimeStatus==="live"?"● EN TIEMPO REAL":realtimeStatus==="error"?"● SIN REALTIME":"● CONECTANDO"}</span></div>
          <div className="match-live-team"><strong>{score.opponent}</strong><span>{rivalTeam||"Rival"}</span></div>
          {canManage&&<button type="button" className="match-live-undo" disabled={!events.length} onClick={()=>void undo()}>↶ Deshacer</button>}
        </section>

        {pending.length>0&&<div className="match-stats-pending"><b>📴 {pending.length} Pendiente{pending.length===1?"":"s"} · Guardado Local</b><button type="button" disabled={syncing} onClick={()=>void syncQueue()}>{syncing?"Sincronizando...":"Sincronizar"}</button></div>}
        {message&&<div className="match-stats-message">{message}</div>}
        {lastAction&&<div className="match-live-flash">{lastAction}</div>}

        {canManage&&<div className="match-live-main-tabs">
          <button type="button" className={captureView==="live"?"active":""} onClick={()=>setCaptureView("live")}>⚡ En Vivo</button>
          <button type="button" className={captureView==="summary"?"active":""} onClick={()=>setCaptureView("summary")}>📊 Resumen</button>
        </div>}

        {canManage&&captureView==="live"&&session.status!=="completed"?<>
          <div className="match-live-mode">
            <button type="button" className={mode==="simple"?"active":""} onClick={()=>void changeMode("simple")}><b>Simple</b><small>2 Toques</small></button>
            <button type="button" className={mode==="rally"?"active":""} onClick={()=>void changeMode("rally")}><b>Rally</b><small>3 Toques</small></button>
            <button type="button" className={mode==="complete"?"active":""} onClick={()=>void changeMode("complete")}><b>Completo</b><small>Todo</small></button>
          </div>

          {editingLineup||lineup.length!==Math.min(6,players.length)?<section className="match-lineup-editor">
            <div className="match-live-section-head"><div><span>Antes De Empezar</span><h3>Elegí Quiénes Están En Cancha</h3></div><b>{lineupDraft.length}/{Math.min(6,players.length)}</b></div>
            <div className="match-lineup-roster">{players.map(player=><button type="button" key={player.id} className={lineupDraft.includes(player.id)?"active":""} onClick={()=>toggleLineup(player.id)}><i>{initials(player)}</i><span>{shortName(player)}</span></button>)}</div>
            <div className="match-lineup-editor-actions">{lineup.length>0&&<button type="button" onClick={()=>{setLineupDraft(lineup);setEditingLineup(false)}}>Cancelar</button>}<button type="button" className="primary" onClick={()=>void saveLineup()}>✓ Usar Esta Alineación</button></div>
          </section>:<>
            <section className="match-live-court-card">
              <div className="match-live-section-head"><div><span>Jugador@s En Cancha</span><h3>Tocá A Quien Intervino</h3></div><div className="match-court-tools"><button type="button" onClick={()=>{setLineupDraft(lineup);setEditingLineup(true)}}>Cambiar</button><button type="button" onClick={()=>void rotate()}>↻ Rotar</button></div></div>
              <div className="match-live-court">
                <div className="match-court-net">RED</div>
                {lineup.map((id,index)=>{
                  const player=playerById[id];
                  return <button type="button" key={id} className={"match-court-player "+(selectedPlayer===id?"active":"")} onClick={()=>setSelectedPlayer(id)}>
                    <small>{COURT_ZONES[index]}</small><i>{initials(player)}</i><b>{shortName(player)}</b>
                  </button>;
                })}
              </div>
            </section>

            <section className="match-live-action-card">
              <div className="match-live-section-head">
                <div><span>Acción Rápida</span><h3>{selectedPlayer?shortName(playerById[selectedPlayer]):"Elegí Un Jugador@"}</h3></div>
                {selectedPlayer&&<button type="button" className="match-clear-player" onClick={()=>setSelectedPlayer("")}>Cambiar</button>}
              </div>

              {mode==="simple"?<div className="match-simple-actions">{SIMPLE_ACTIONS.map(action=><button type="button" key={action.label} disabled={!selectedPlayer} className={action.point==="us"?"positive":action.point==="opponent"?"negative":""} onClick={()=>void record(action.skill,action.outcome,action.point,true)}><i>{action.icon}</i><b>{action.label}</b></button>)}</div>:<>
                <div className="match-live-skills">{modeSkills.map(skill=><button type="button" key={skill.key} className={selectedSkill===skill.key?"active":""} onClick={()=>setSelectedSkill(skill.key)}><i>{skill.icon}</i><b>{skill.label}</b></button>)}</div>
                <div className="match-live-outcomes">{selectedSkillConfig.outcomes.map(outcome=><button type="button" key={outcome.key} disabled={!selectedPlayer} className={outcome.point==="us"?"positive":outcome.point==="opponent"?"negative":""} onClick={()=>void record(selectedSkillConfig.key,outcome.key,outcome.point,true)}><i>{outcome.icon}</i><b>{outcome.label}</b></button>)}</div>
              </>}
            </section>

            <section className="match-live-rally-result">
              <div><span>Resultado Del Rally</span><b>Un Toque</b></div>
              <button type="button" className="for" onClick={()=>void record("team_point","point","us",false)}>🏆 Punto A Favor</button>
              <button type="button" className="against" onClick={()=>void record("opponent_point","point","opponent",false)}>🏆 Punto En Contra</button>
            </section>

            {recent.length>0&&<section className="match-live-recent">
              <div className="match-live-section-head"><div><span>Últimas Acciones</span><h3>Lo Recién Registrado</h3></div></div>
              {recent.map(item=><div key={item.id}><span>Set {item.set_number}</span><i>{item.player_id?initials(playerById[item.player_id]):"•"}</i><b>{item.player_id?shortName(playerById[item.player_id])+" · ":""}{actionLabel(item)}</b>{item.local_pending&&<small>Local</small>}<button type="button" onClick={()=>void removeEvent(item,{confirm:true})}>×</button></div>)}
            </section>}
          </>}

          <div className="match-live-session-actions">
            <button type="button" disabled={session.current_set>=5} onClick={()=>void nextSet()}>Finalizar Set {session.current_set}</button>
            <button type="button" className="danger" onClick={()=>void finish()}>Finalizar Partido</button>
          </div>
        </>:null}

        {(captureView==="summary"||!canManage)&&<>
          {canManage&&<section className="match-stats-team-summary">
            <div className="match-stats-section-title"><div><span>Equipo</span><h3>Resumen Técnico De MSM</h3></div><b>{events.length} Acciones</b></div>
            <div className="match-stats-team-metrics">
              <div><span>Aces</span><b>{teamSummary.aces}</b><small>{teamSummary.serve} Saques</small></div>
              <div><span>Recepción +</span><b>{pct(teamSummary.receptionPositivePct)}</b><small>{teamSummary.receptions} Recepciones</small></div>
              <div><span>Recepción Perfecta</span><b>{pct(teamSummary.receptionPerfectPct)}</b><small>{teamSummary.receptionPerfect} Perfectas</small></div>
              <div><span>Ataque</span><b>{teamSummary.attackPoints}/{teamSummary.attacks}</b><small>{pct(teamSummary.attackEfficiency)} Eficiencia</small></div>
              <div><span>Bloqueos</span><b>{teamSummary.blockPoints}</b><small>Puntos Directos</small></div>
              <div><span>Errores</span><b>{teamSummary.totalErrors}</b><small>Técnicos</small></div>
            </div>
            {setScores.length?<div className="match-stats-set-summary">{setScores.map(row=><div key={row.set}><span>Set {row.set}</span><b>{row.us} – {row.opponent}</b></div>)}</div>:null}
          </section>}

          {!canManage&&<div className="match-stats-readonly-banner">Solo Lectura · Tus Estadísticas Personales</div>}
          <section className="match-stats-summary">
            <div className="match-stats-section-title"><div><span>Resumen</span><h3>{canManage?"Rendimiento Por Jugador@":"Mis Estadísticas"}</h3></div><b>{visibleEvents.length} Acciones</b></div>
            {summaries.length?<div className="match-stats-summary-grid">{summaries.map(row=><article key={row.id}>
              <h4>{row.name}</h4>
              <div><span>Aces</span><b>{row.aces}</b></div>
              <div><span>Recepción +</span><b>{pct(row.receptionPositivePct)}</b></div>
              <div><span>Ataque</span><b>{row.attackPoints}/{row.attacks}</b></div>
              <div><span>Ef. Ataque</span><b>{pct(row.attackEfficiency)}</b></div>
              <div><span>Bloqueos</span><b>{row.blockPoints}</b></div>
              <div><span>Errores</span><b>{row.totalErrors}</b></div>
            </article>)}</div>:<div className="match-stats-empty compact">Todavía No Hay Acciones Registradas.</div>}
          </section>
        </>}

        {canManage&&session.status==="completed"&&<div className="match-stats-completed-actions"><span>✓ Toma De Estadísticas Finalizada</span><button type="button" onClick={()=>void reopen()}>Reabrir Para Corregir</button></div>}
      </>}
    </section>
  </div>,document.body);
}

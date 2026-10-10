import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import "./mgsm-match-stats.css";

const SKILLS = [
  {key:"serve",label:"🏐 Saque",outcomes:[
    {key:"ace",label:"Ace",point:"us"},
    {key:"positive",label:"Positivo"},
    {key:"error",label:"Error",point:"opponent"},
  ]},
  {key:"reception",label:"🤲 Recepción",outcomes:[
    {key:"perfect",label:"Perfecta"},
    {key:"positive",label:"Positiva"},
    {key:"negative",label:"Negativa"},
    {key:"error",label:"Error",point:"opponent"},
  ]},
  {key:"attack",label:"💥 Ataque",outcomes:[
    {key:"point",label:"Punto",point:"us"},
    {key:"continue",label:"Continúa"},
    {key:"blocked",label:"Bloqueado",point:"opponent"},
    {key:"error",label:"Error",point:"opponent"},
  ]},
  {key:"block",label:"🧱 Bloqueo",outcomes:[
    {key:"point",label:"Punto",point:"us"},
    {key:"touch",label:"Toque"},
    {key:"error",label:"Error",point:"opponent"},
  ]},
  {key:"error",label:"❌ Error No Forzado",outcomes:[{key:"error",label:"Registrar Error",point:"opponent"}]},
];

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
function actionLabel(event){
  if(event.skill==="team_point")return "Punto Del Equipo";
  if(event.skill==="opponent_point")return "Punto Rival";
  const skill=SKILLS.find(item=>item.key===event.skill);
  const outcome=skill?.outcomes.find(item=>item.key===event.outcome);
  return [skill?.label?.replace(/^[^ ]+ /,""),outcome?.label].filter(Boolean).join(" · ");
}
function computeTeamSummary(events){
  const row={
    serve:0,aces:0,serveErrors:0,receptions:0,receptionPositive:0,receptionPerfect:0,receptionErrors:0,
    attacks:0,attackPoints:0,attackErrors:0,blocked:0,blockPoints:0,blockErrors:0,unforcedErrors:0,
    pointsUs:0,pointsOpponent:0,
  };
  for(const event of events){
    if(event.point_for==="us")row.pointsUs++;
    if(event.point_for==="opponent")row.pointsOpponent++;
    if(event.skill==="serve"){row.serve++;if(event.outcome==="ace")row.aces++;if(event.outcome==="error")row.serveErrors++;}
    if(event.skill==="reception"){row.receptions++;if(["perfect","positive"].includes(event.outcome))row.receptionPositive++;if(event.outcome==="perfect")row.receptionPerfect++;if(event.outcome==="error")row.receptionErrors++;}
    if(event.skill==="attack"){row.attacks++;if(event.outcome==="point")row.attackPoints++;if(event.outcome==="error")row.attackErrors++;if(event.outcome==="blocked")row.blocked++;}
    if(event.skill==="block"){if(event.outcome==="point")row.blockPoints++;if(event.outcome==="error")row.blockErrors++;}
    if(event.skill==="error")row.unforcedErrors++;
  }
  return {
    ...row,
    receptionPositivePct:row.receptions?(row.receptionPositive/row.receptions)*100:null,
    receptionPerfectPct:row.receptions?(row.receptionPerfect/row.receptions)*100:null,
    attackEfficiency:row.attacks?((row.attackPoints-row.attackErrors-row.blocked)/row.attacks)*100:null,
    totalErrors:row.serveErrors+row.receptionErrors+row.attackErrors+row.blockErrors+row.unforcedErrors,
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
    id:player.id,name:player.full_name||[player.last_name,player.first_name].filter(Boolean).join(" ")||"Jugador@",
    serve:0,aces:0,serveErrors:0,receptions:0,receptionPositive:0,receptionPerfect:0,receptionErrors:0,
    attacks:0,attackPoints:0,attackErrors:0,blocked:0,blockPoints:0,blockErrors:0,errors:0,
  }]));
  for(const event of events){
    if(!event.player_id||!byId.has(event.player_id))continue;
    const row=byId.get(event.player_id);
    if(event.skill==="serve"){row.serve++;if(event.outcome==="ace")row.aces++;if(event.outcome==="error")row.serveErrors++;}
    if(event.skill==="reception"){row.receptions++;if(["perfect","positive"].includes(event.outcome))row.receptionPositive++;if(event.outcome==="perfect")row.receptionPerfect++;if(event.outcome==="error")row.receptionErrors++;}
    if(event.skill==="attack"){row.attacks++;if(event.outcome==="point")row.attackPoints++;if(event.outcome==="error")row.attackErrors++;if(event.outcome==="blocked")row.blocked++;}
    if(event.skill==="block"){if(event.outcome==="point")row.blockPoints++;if(event.outcome==="error")row.blockErrors++;}
    if(event.skill==="error")row.errors++;
  }
  return [...byId.values()].map(row=>({
    ...row,
    attackEfficiency:row.attacks?((row.attackPoints-row.attackErrors-row.blocked)/row.attacks)*100:null,
    receptionPositivePct:row.receptions?(row.receptionPositive/row.receptions)*100:null,
  })).filter(row=>events.some(event=>event.player_id===row.id));
}

export default function MatchStatsPanel({match,category,canManage=false,canView=false,currentPlayerId=null,onClose}){
  const [session,setSession]=useState(null);
  const [events,setEvents]=useState([]);
  const [players,setPlayers]=useState([]);
  const [selectedPlayer,setSelectedPlayer]=useState(currentPlayerId||"");
  const [selectedSkill,setSelectedSkill]=useState("serve");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [syncing,setSyncing]=useState(false);
  const [message,setMessage]=useState("");
  const [pending,setPending]=useState([]);

  const readOnly=!canManage;
  const ourIsLocal=normalize(match?.local).startsWith("MSM");
  const ourIsVisitor=normalize(match?.visitor).startsWith("MSM");
  const validMsmMatch=ourIsLocal||ourIsVisitor;
  const ourTeam=ourIsLocal?match?.local:ourIsVisitor?match?.visitor:"MSM";
  const rivalTeam=ourIsLocal?match?.visitor:ourIsVisitor?match?.local:"Rival";

  async function actorId(){
    const result=await supabase.auth.getUser();
    return result.data?.user?.id||null;
  }
  async function load(){
    if(!validMsmMatch){setLoading(false);setMessage("Las Estadísticas Institucionales Sólo Se Habilitan En Partidos Donde Participa MSM.");return;}
    if(!category?.id){setLoading(false);setMessage("No Se Pudo Vincular Este Partido Con Una Categoría Interna.");return;}
    setLoading(true);setMessage("");
    try{
      let sessionResult=await supabase.from("match_stat_sessions")
        .select("*")
        .eq("external_match_id",String(match.id))
        .eq("category_id",category.id)
        .maybeSingle();
      if(sessionResult.error)throw sessionResult.error;
      let current=sessionResult.data;
      if(!current&&canManage){
        const uid=await actorId();
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
      if(!selectedPlayer&&roster.length)setSelectedPlayer(currentPlayerId||roster[0].id);
      const dbEvents=eventResult.data||[];
      const ids=new Set(dbEvents.map(item=>item.id));
      setEvents([...dbEvents,...queue.filter(item=>!ids.has(item.id)).map(item=>({...item,local_pending:true}))]);
      if(canManage&&queue.length)void syncQueue(current,queue);
    }catch(error){
      setMessage(String(error?.message||"No Se Pudieron Cargar Las Estadísticas."));
    }finally{setLoading(false);}
  }
  useEffect(()=>{void load()},[match?.id,category?.id,canManage,currentPlayerId]);

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
      if(remaining.length===0){
        const refreshed=await supabase.from("match_stat_events").select("*").eq("session_id",current.id).order("created_at");
        if(!refreshed.error)setEvents(refreshed.data||[]);
      }
    }catch(error){setMessage(String(error?.message||"No Se Pudieron Sincronizar Los Eventos."));}
    finally{setSyncing(false);}
  }

  async function record(skill,outcome,pointFor,needsPlayer=true){
    if(!session||!canManage||saving)return;
    if(needsPlayer&&!selectedPlayer){setMessage("Seleccioná Un Jugador@.");return;}
    setSaving(true);setMessage("");
    try{
      const uid=await actorId();
      if(!uid)throw new Error("No Hay Una Sesión De Usuario Activa.");
      const payload={
        id:uuid(),session_id:session.id,set_number:session.current_set,
        player_id:needsPlayer?selectedPlayer:null,skill,outcome,point_for:pointFor||null,
        created_by:uid,created_at:new Date().toISOString(),
      };
      setEvents(current=>[...current,{...payload,local_pending:true}]);
      const inserted=await supabase.from("match_stat_events").insert(payload);
      if(inserted.error){
        if(networkish(inserted.error)){
          const next=[...pending,payload];
          setPending(next);writeQueue(session.id,next);
          setMessage("Sin Conexión: La Acción Quedó Guardada En Este Dispositivo y Se Sincronizará Al Tocar Sincronizar.");
        }else{
          setEvents(current=>current.filter(item=>item.id!==payload.id));
          throw inserted.error;
        }
      }else{
        setEvents(current=>current.map(item=>item.id===payload.id?{...payload,local_pending:false}:item));
      }
    }catch(error){setMessage(String(error?.message||"No Se Pudo Registrar La Acción."));}
    finally{setSaving(false);}
  }

  async function removeEvent(event,{quick=false}={}){
    if(!canManage||!session||!event||saving)return;
    if(!quick&&!window.confirm(`Eliminar Esta Acción: ${actionLabel(event)}?`))return;
    setSaving(true);setMessage("");
    try{
      if(event.local_pending){
        const next=pending.filter(item=>item.id!==event.id);
        setPending(next);writeQueue(session.id,next);
      }else{
        const removed=await supabase.from("match_stat_events").delete().eq("id",event.id);
        if(removed.error)throw removed.error;
      }
      setEvents(current=>current.filter(item=>item.id!==event.id));
    }catch(error){setMessage(String(error?.message||"No Se Pudo Eliminar La Acción."));}
    finally{setSaving(false);}
  }
  async function undo(){
    if(!canManage||!session||!events.length||saving)return;
    const last=events[events.length-1];
    if(!window.confirm(`Deshacer La Última Acción: ${actionLabel(last)}?`))return;
    await removeEvent(last,{quick:true});
  }

  async function nextSet(){
    if(!canManage||!session||session.current_set>=5)return;
    if(!window.confirm(`Finalizar Set ${session.current_set} y Comenzar Set ${session.current_set+1}?`))return;
    const result=await supabase.from("match_stat_sessions").update({current_set:session.current_set+1,updated_at:new Date().toISOString()}).eq("id",session.id).select("*").single();
    if(result.error){setMessage(result.error.message);return;}
    setSession(result.data);
  }
  async function finish(){
    if(!canManage||!session)return;
    if(!window.confirm("Finalizar La Toma De Estadísticas De Este Partido?"))return;
    const result=await supabase.from("match_stat_sessions").update({status:"completed",completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",session.id).select("*").single();
    if(result.error){setMessage(result.error.message);return;}
    setSession(result.data);
  }
  async function reopen(){
    if(!canManage||!session||session.status!=="completed")return;
    if(!window.confirm("Reabrir Este Partido Para Corregir O Continuar La Toma De Estadísticas?"))return;
    const result=await supabase.from("match_stat_sessions").update({status:"in_progress",completed_at:null,updated_at:new Date().toISOString()}).eq("id",session.id).select("*").single();
    if(result.error){setMessage(result.error.message);return;}
    setSession(result.data);
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
  const playerNameById=useMemo(()=>Object.fromEntries(players.map(player=>[player.id,player.full_name||[player.last_name,player.first_name].filter(Boolean).join(" ")||"Jugador@"])),[players]);
  const selectedSkillConfig=SKILLS.find(item=>item.key===selectedSkill)||SKILLS[0];
  const recent=visibleEvents.slice(-10).reverse();

  return createPortal(<div className="match-stats-backdrop" role="dialog" aria-modal="true">
    <section className="match-stats-panel">
      <header className="match-stats-head">
        <div><span>📊 Estadísticas De Partido</span><h2>{ourTeam||"MSM"} vs {rivalTeam||"Rival"}</h2><small>{match.categoryLabel||category?.name}</small></div>
        <button type="button" onClick={onClose} aria-label="Cerrar">×</button>
      </header>

      {loading?<div className="match-stats-empty">Cargando Estadísticas...</div>:!session?<div className="match-stats-empty">{message||"Sin Estadísticas Disponibles."}</div>:<>
        {canManage?<div className="match-stats-scoreboard">
          <div><small>Set {session.current_set}</small><strong>{score.us}</strong><span>{ourTeam||"MSM"}</span></div>
          <em>–</em>
          <div><small>{session.status==="completed"?"Finalizado":"En Curso"}</small><strong>{score.opponent}</strong><span>{rivalTeam||"Rival"}</span></div>
        </div>:<div className="match-stats-readonly-banner">Solo Lectura · Tus Estadísticas Personales</div>}

        {pending.length>0&&<div className="match-stats-pending"><b>{pending.length} Acción{pending.length===1?"":"es"} Pendiente{pending.length===1?"":"s"}</b><button type="button" disabled={syncing} onClick={()=>void syncQueue()}>{syncing?"Sincronizando...":"Sincronizar"}</button></div>}
        {message&&<div className="match-stats-message">{message}</div>}

        {canManage&&<section className="match-stats-team-summary">
          <div className="match-stats-section-title"><div><span>Equipo</span><h3>Resumen Técnico De MSM</h3></div><b>{events.length} Acciones</b></div>
          <div className="match-stats-team-metrics">
            <div><span>Aces</span><b>{teamSummary.aces}</b><small>{teamSummary.serve} Saques</small></div>
            <div><span>Recepción +</span><b>{pct(teamSummary.receptionPositivePct)}</b><small>{teamSummary.receptions} Recepciones</small></div>
            <div><span>Recepción Perfecta</span><b>{pct(teamSummary.receptionPerfectPct)}</b><small>{teamSummary.receptionPerfect} Perfectas</small></div>
            <div><span>Ataque</span><b>{teamSummary.attackPoints}/{teamSummary.attacks}</b><small>{pct(teamSummary.attackEfficiency)} Eficiencia</small></div>
            <div><span>Bloqueos</span><b>{teamSummary.blockPoints}</b><small>Puntos Directos</small></div>
            <div><span>Errores</span><b>{teamSummary.totalErrors}</b><small>Técnicos Registrados</small></div>
          </div>
          {setScores.length?<div className="match-stats-set-summary">{setScores.map(row=><div key={row.set}><span>Set {row.set}</span><b>{row.us} – {row.opponent}</b></div>)}</div>:null}
        </section>}

        {canManage&&session.status!=="completed"?<>
          <div className="match-stats-roster">
            <span>Jugador@</span>
            <div>{players.map(player=><button type="button" key={player.id} className={selectedPlayer===player.id?"active":""} onClick={()=>setSelectedPlayer(player.id)}>{player.full_name||[player.last_name,player.first_name].filter(Boolean).join(" ")}</button>)}</div>
          </div>

          <div className="match-stats-skills">{SKILLS.map(skill=><button type="button" key={skill.key} className={selectedSkill===skill.key?"active":""} onClick={()=>setSelectedSkill(skill.key)}>{skill.label}</button>)}</div>
          <div className="match-stats-outcomes">{selectedSkillConfig.outcomes.map(outcome=><button type="button" key={outcome.key} disabled={saving} onClick={()=>record(selectedSkillConfig.key,outcome.key,outcome.point,true)}>{outcome.label}</button>)}</div>

          <div className="match-stats-quick-points">
            <button type="button" disabled={saving} onClick={()=>record("team_point","point","us",false)}>✅ Punto {ourTeam||"MSM"}</button>
            <button type="button" disabled={saving} onClick={()=>record("opponent_point","point","opponent",false)}>➕ Punto Rival</button>
          </div>

          <div className="match-stats-actions">
            <button type="button" disabled={!events.length||saving} onClick={undo}>↶ Deshacer</button>
            <button type="button" disabled={session.current_set>=5} onClick={nextSet}>Finalizar Set</button>
            <button type="button" className="danger" onClick={finish}>Finalizar Partido</button>
          </div>
        </>:canManage&&session.status==="completed"?<div className="match-stats-completed-actions"><span>✓ Toma De Estadísticas Finalizada</span><button type="button" onClick={reopen}>Reabrir Para Corregir</button></div>:null}

        <section className="match-stats-summary">
          <div className="match-stats-section-title"><div><span>Resumen</span><h3>{canManage?"Rendimiento Por Jugador@":"Mis Estadísticas"}</h3></div><b>{visibleEvents.length} Acciones</b></div>
          {summaries.length?<div className="match-stats-summary-grid">{summaries.map(row=><article key={row.id}>
            <h4>{row.name}</h4>
            <div><span>Aces</span><b>{row.aces}</b></div>
            <div><span>Recepción +</span><b>{pct(row.receptionPositivePct)}</b></div>
            <div><span>Ataque</span><b>{row.attackPoints}/{row.attacks}</b></div>
            <div><span>Ef. Ataque</span><b>{pct(row.attackEfficiency)}</b></div>
            <div><span>Bloqueos</span><b>{row.blockPoints}</b></div>
            <div><span>Errores</span><b>{row.errors+row.serveErrors+row.receptionErrors+row.attackErrors+row.blockErrors}</b></div>
          </article>)}</div>:<div className="match-stats-empty compact">Todavía No Hay Acciones Registradas.</div>}
        </section>

        {canManage&&recent.length?<section className="match-stats-recent"><h3>Últimas Acciones</h3>{recent.map(item=><div key={item.id}><span>Set {item.set_number}</span><b>{item.player_id&&playerNameById[item.player_id]?playerNameById[item.player_id]+" · ":""}{actionLabel(item)}</b>{item.local_pending&&<small>Local</small>}<button type="button" aria-label="Eliminar acción" disabled={saving} onClick={()=>void removeEvent(item)}>×</button></div>)}</section>:null}
      </>}
    </section>
  </div>,document.body);
}

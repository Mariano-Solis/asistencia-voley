import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { createPortal } from "react-dom";
import MatchStatsPanel from "./MatchStatsPanel";
import { supabase } from "./supabase";

const API_PATH="/api/fmv-partidos";
const NATIVE_API="https://www.voleysanmartin.com.ar/api/fmv-partidos";

function normalizeName(value=""){
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]/g,"");
}

function categoryPermissionKeys(category){
  const name=normalizeName(category?.name);
  const gender=String(category?.gender||"").toLowerCase();
  const branch=["female","femenino","femenina","mujer","f"].includes(gender)?"female":"male";
  if(branch==="female"&&name==="MASTERA")return["female:master:master_a"];
  if(branch==="female"&&name==="MASTERC")return["female:master:master_c"];
  if(branch==="female"&&name==="SUB12B")return["female:level3:sub12"];
  if(branch==="female"&&name==="SUB14B")return["female:level3:sub14b"];
  let key="";
  if(name.includes("SUB12"))key="sub12";
  else if(name.includes("SUB14"))key="sub14";
  else if(name.includes("SUB16"))key="sub16";
  else if(name.includes("SUB18"))key="sub18";
  else if(name.includes("PRIMERA")||name.includes("MAYORES")||name.includes("MAYOR"))key="mayores";
  return key?[branch+":level1:"+key]:[];
}

function branchLabel(value){return value==="female"?"Femenino":"Masculino"}
function formatUpdated(value){
  if(!value)return"—";
  try{return new Intl.DateTimeFormat("es-AR",{hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone:"America/Argentina/Mendoza"}).format(new Date(value))}
  catch{return"—"}
}
function matchInstitution(match,value){
  if(value==="all")return true;
  const target=normalizeName(value);
  return (match.institutionKeys||[]).some(item=>normalizeName(item)===target);
}
function scoreText(match){
  return Number.isFinite(match.scoreA)&&Number.isFinite(match.scoreB)?[match.scoreA,match.scoreB]:["—","—"];
}
function isMsmMatch(match){
  const local=normalizeName(match?.local);
  const visitor=normalizeName(match?.visitor);
  return local.startsWith("MSM")||visitor.startsWith("MSM");
}
function archiveMatch(session){
  return {
    id:session.external_match_id,
    kind:session.status==="completed"?"result":"live",
    local:session.our_team||"MSM",
    visitor:session.rival_team||"Rival",
    categoryLabel:session.category_label,
    branch:session.branch,
    date:session.match_date||"",
    place:session.location||"",
    permissionKey:null,
  };
}

export default function PartidosHub({allowedCategories=null,unrestricted=false,compact=false,canManageStats=false,canViewStats=false,currentPlayerId=null}){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [message,setMessage]=useState("");
  const [mode,setMode]=useState("live");
  const [branch,setBranch]=useState("all");
  const [category,setCategory]=useState("all");
  const [institution,setInstitution]=useState("all");
  const [selectedId,setSelectedId]=useState("");
  const [statsTarget,setStatsTarget]=useState(null);
  const [statsArchiveOpen,setStatsArchiveOpen]=useState(false);
  const [statsArchive,setStatsArchive]=useState([]);
  const [statsArchiveLoading,setStatsArchiveLoading]=useState(false);
  const [statsArchiveMessage,setStatsArchiveMessage]=useState("");
  const [deletingStatsId,setDeletingStatsId]=useState("");
  const abortRef=useRef(null);

  const allowedKeys=useMemo(()=>{
    if(unrestricted)return null;
    const keys=new Set();
    for(const item of Array.isArray(allowedCategories)?allowedCategories:[]){
      for(const key of categoryPermissionKeys(item))keys.add(key);
    }
    return keys;
  },[allowedCategories,unrestricted]);

  async function load({quiet=false}={}){
    abortRef.current?.abort();
    const controller=new AbortController();
    abortRef.current=controller;
    quiet?setRefreshing(true):setLoading(true);
    setMessage("");
    try{
      let payload;
      if(Capacitor.isNativePlatform()){
        const response=await CapacitorHttp.get({url:NATIVE_API,headers:{Accept:"application/json"},connectTimeout:12000,readTimeout:12000});
        payload=typeof response.data==="string"?JSON.parse(response.data||"{}"):(response.data||{});
        if(response.status<200||response.status>=300)throw new Error(payload?.message||"No Se Pudieron Consultar Los Partidos.");
      }else{
        const response=await fetch(API_PATH,{signal:controller.signal,headers:{Accept:"application/json"},cache:"no-store"});
        payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(payload?.message||"No Se Pudieron Consultar Los Partidos.");
      }
      if(payload?.error)throw new Error(payload.message||"No Se Pudieron Consultar Los Partidos.");
      setData(payload);
    }catch(error){
      if(String(error?.name||"")==="AbortError")return;
      setMessage(error?.message||"No Se Pudieron Consultar Los Partidos.");
    }finally{
      quiet?setRefreshing(false):setLoading(false);
    }
  }

  useEffect(()=>{void load();return()=>abortRef.current?.abort();},[]);

  const permitted=useMemo(()=>{
    const source=mode==="live"?(data?.live||[]):(data?.results||[]);
    if(!allowedKeys)return source;
    return source.filter(match=>allowedKeys.has(match.permissionKey));
  },[data,mode,allowedKeys]);

  const branches=useMemo(()=>[...new Set(permitted.map(match=>match.branch).filter(Boolean))],[permitted]);
  const categories=useMemo(()=>{
    const source=branch==="all"?permitted:permitted.filter(match=>match.branch===branch);
    const map=new Map();
    source.forEach(match=>map.set(match.permissionKey,{key:match.permissionKey,label:match.categoryLabel}));
    return [...map.values()].sort((a,b)=>a.label.localeCompare(b.label,"es"));
  },[permitted,branch]);

  useEffect(()=>{if(category!=="all"&&!categories.some(item=>item.key===category))setCategory("all")},[category,categories]);

  const institutions=useMemo(()=>{
    const source=permitted.filter(match=>(branch==="all"||match.branch===branch)&&(category==="all"||match.permissionKey===category));
    return [...new Set(source.flatMap(match=>[match.localInstitution,match.visitorInstitution]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
  },[permitted,branch,category]);

  useEffect(()=>{if(institution!=="all"&&!institutions.includes(institution))setInstitution("all")},[institution,institutions]);

  const visible=useMemo(()=>permitted.filter(match=>
    (branch==="all"||match.branch===branch)&&
    (category==="all"||match.permissionKey===category)&&
    matchInstitution(match,institution)
  ),[permitted,branch,category,institution]);

  const categoryByPermissionKey=useMemo(()=>{
    const map=new Map();
    for(const item of Array.isArray(allowedCategories)?allowedCategories:[]){
      for(const key of categoryPermissionKeys(item))map.set(key,item);
    }
    return map;
  },[allowedCategories]);

  const selectedMatch=useMemo(()=>{
    if(!selectedId)return null;
    const all=[...(data?.live||[]),...(data?.results||[])];
    return all.find(match=>match.id===selectedId)||null;
  },[data,selectedId]);

  function openMatch(match){setSelectedId(match.id)}
  function closeMatch(){setSelectedId("")}
  function openStats(match,categoryOverride=null){
    const targetCategory=categoryOverride||categoryByPermissionKey.get(match.permissionKey)||null;
    if(!targetCategory)return;
    setStatsTarget({match,category:targetCategory});
  }
  function closeStats(){setStatsTarget(null)}
  async function loadStatsArchive(){
    if(!(canManageStats||canViewStats))return;
    setStatsArchiveLoading(true);
    setStatsArchiveMessage("");
    try{
      const result=await supabase.from("match_stat_sessions")
        .select("id,external_match_id,category_id,category_label,branch,match_date,location,our_team,rival_team,status,current_set,created_at,updated_at,completed_at")
        .order("match_date",{ascending:false,nullsFirst:false})
        .order("created_at",{ascending:false})
        .limit(60);
      if(result.error)throw result.error;
      setStatsArchive(result.data||[]);
    }catch(error){
      setStatsArchiveMessage(error?.message||"No Se Pudieron Cargar Las Estadísticas Guardadas.");
    }finally{
      setStatsArchiveLoading(false);
    }
  }
  async function toggleStatsArchive(){
    const next=!statsArchiveOpen;
    setStatsArchiveOpen(next);
    if(next)await loadStatsArchive();
  }
  function openArchivedStats(item){
    openStats(archiveMatch(item),{id:item.category_id,name:item.category_label,gender:item.branch});
  }
  async function deleteArchivedStats(item){
    if(!canManageStats||!item?.id||deletingStatsId)return;
    const label=[item.our_team,item.rival_team].filter(Boolean).join(" vs ");
    const confirmed=window.confirm(
      `Eliminar Definitivamente Las Estadísticas De ${label||"Este Partido"}?\n\nSe Borrará La Sesión Completa y Todas Las Acciones Registradas. Esta Acción No Se Puede Deshacer.`
    );
    if(!confirmed)return;
    setDeletingStatsId(item.id);
    setStatsArchiveMessage("");
    try{
      const result=await supabase.from("match_stat_sessions")
        .delete()
        .eq("id",item.id)
        .select("id")
        .maybeSingle();
      if(result.error)throw result.error;
      if(!result.data?.id)throw new Error("No Tenés Permiso Para Eliminar Esta Estadística O Ya Fue Eliminada.");
      try{localStorage.removeItem(`mgsm-match-stats-queue:${item.id}`)}catch{}
      setStatsArchive(current=>current.filter(row=>row.id!==item.id));
      if(statsTarget?.match?.id===item.external_match_id&&statsTarget?.category?.id===item.category_id)setStatsTarget(null);
      setStatsArchiveMessage("✓ Estadística Eliminada Correctamente.");
    }catch(error){
      setStatsArchiveMessage(error?.message||"No Se Pudo Eliminar La Estadística Guardada.");
    }finally{
      setDeletingStatsId("");
    }
  }
  function cardKeyDown(event,match){
    if(event.key==="Enter"||event.key===" "){event.preventDefault();openMatch(match)}
  }

  return <section className={"partidos-page "+(compact?"compact":"")}>
    <div className="partidos-hero">
      <div><span className="eyebrow">Federación Mendocina De Voleibol</span><h1>Partidos</h1><p>Resultados y partidos marcados como en vivo por la fuente oficial. Sin consultas automáticas en segundo plano.</p></div>
      <div className="partidos-source-state"><span>Última Consulta</span><b>{formatUpdated(data?.fetchedAt)}</b></div>
    </div>

    <div className="partidos-toolbar">
      <div className="partidos-mode" role="tablist" aria-label="Tipo de partidos">
        <button type="button" className={mode==="live"?"active":""} onClick={()=>setMode("live")}>● En Vivo</button>
        <button type="button" className={mode==="results"?"active":""} onClick={()=>setMode("results")}>✓ Resultados</button>
      </div>
      <button type="button" className="partidos-refresh" onClick={()=>void load({quiet:true})} disabled={loading||refreshing}><span className={refreshing?"spinning":""}>↻</span>{refreshing?"Actualizando...":"Actualizar"}</button>
      {(canManageStats||canViewStats)&&<button type="button" className={"partidos-stats-archive-button "+(statsArchiveOpen?"active":"")} onClick={()=>void toggleStatsArchive()}>📊 Estadísticas Guardadas</button>}
    </div>

    <div className="partidos-filters card">
      <label>Rama<select value={branch} onChange={event=>{setBranch(event.target.value);setCategory("all");setInstitution("all");}}><option value="all">Todas</option>{branches.includes("female")&&<option value="female">Femenino</option>}{branches.includes("male")&&<option value="male">Masculino</option>}</select></label>
      <label>Equipo / Categoría<select value={category} onChange={event=>{setCategory(event.target.value);setInstitution("all");}}><option value="all">Todos</option>{categories.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label>Institución<select value={institution} onChange={event=>setInstitution(event.target.value)}><option value="all">Todas</option>{institutions.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
    </div>

    {statsArchiveOpen&&<section className="partidos-stats-archive card">
      <div className="partidos-stats-archive-head">
        <div><span>Historial Técnico</span><h2>{currentPlayerId?"Mis Estadísticas De Partido":"Estadísticas Guardadas"}</h2><p>{currentPlayerId?"Sólo Tus Propias Acciones, En Modo Lectura.":"Partidos De MSM Con Estadísticas Registradas."}</p></div>
        <button type="button" onClick={()=>void loadStatsArchive()} disabled={statsArchiveLoading}>↻ {statsArchiveLoading?"Actualizando...":"Actualizar"}</button>
      </div>
      {statsArchiveMessage&&<div className="partidos-message">{statsArchiveMessage}</div>}
      {statsArchiveLoading&&!statsArchive.length?<div className="partidos-empty">Cargando Estadísticas...</div>:statsArchive.length?<div className="partidos-stats-archive-grid">{statsArchive.map(item=><article className="partidos-stats-archive-item" key={item.id}>
        <button type="button" className="partidos-stats-archive-open" onClick={()=>openArchivedStats(item)}>
          <span>{item.branch==="female"?"Femenino":"Masculino"} · {item.category_label}</span>
          <b>{item.our_team} vs {item.rival_team}</b>
          <small>{item.match_date||"Fecha Sin Registrar"} · {item.status==="completed"?"Finalizado":"En Curso"}</small>
        </button>
        {canManageStats&&<button
          type="button"
          className="partidos-stats-archive-delete"
          disabled={deletingStatsId===item.id}
          onClick={()=>void deleteArchivedStats(item)}
          aria-label={`Eliminar Estadísticas De ${item.our_team} Contra ${item.rival_team}`}
          title="Eliminar Estadística Completa"
        >{deletingStatsId===item.id?"…":"🗑"}</button>}
      </article>)}</div>:<div className="partidos-empty">{currentPlayerId?"Todavía No Tenés Estadísticas Personales Cargadas.":"Todavía No Hay Partidos Con Estadísticas Guardadas."}</div>}
    </section>}
    {message&&<div className="partidos-message">{message}</div>}
    {loading?<div className="partidos-empty">Consultando Partidos...</div>:
      visible.length?<div className="partidos-grid">{visible.map(match=>{
        const scores=scoreText(match);
        const hasPoints=Number.isFinite(match.pointA)&&Number.isFinite(match.pointB);
        return <article className={"partido-card partido-card-clickable "+(mode==="live"?"live":"")} key={match.id} role="button" tabIndex={0} aria-label={"Ver detalle de "+match.local+" contra "+match.visitor} onClick={()=>openMatch(match)} onKeyDown={event=>cardKeyDown(event,match)}>
          <div className="partido-card-head"><div><span>{branchLabel(match.branch)}</span><b>{match.categoryLabel}</b></div><strong className={mode==="live"?"live-badge":"result-badge"}>{mode==="live"?"En Vivo":"Finalizado"}</strong></div>
          <div className="partido-score"><div><span>{match.local}</span><b>{scores[0]}</b></div><em>–</em><div><b>{scores[1]}</b><span>{match.visitor}</span></div></div>
          {mode==="live"&&hasPoints&&<div className="partido-live-points">{match.currentSet?("Set "+match.currentSet+" · "):""}{match.pointA} - {match.pointB}</div>}
          <div className="partido-meta">{(match.date||match.time)&&<span>📅 {[match.date,match.time].filter(Boolean).join(" · ")}</span>}{match.place&&<span>📍 {match.place}</span>}</div>
        </article>
      })}</div>:<div className="partidos-empty">{mode==="live"?"No Hay Partidos Marcados Como En Vivo Para Estos Filtros.":"No Hay Resultados Disponibles Para Estos Filtros."}</div>
    }
    <p className="partidos-footnote">Los datos se consultan únicamente al abrir esta pestaña o al tocar “Actualizar”. No hay seguimiento ni consumo en segundo plano.</p>
    {selectedMatch&&<MatchDetail
      match={selectedMatch}
      updatedAt={data?.fetchedAt}
      refreshing={refreshing}
      onRefresh={()=>void load({quiet:true})}
      onClose={closeMatch}
      category={categoryByPermissionKey.get(selectedMatch.permissionKey)||null}
      canManageStats={canManageStats}
      canViewStats={canViewStats}
      onOpenStats={()=>openStats(selectedMatch)}
    />}
    {statsTarget&&<MatchStatsPanel
      match={statsTarget.match}
      category={statsTarget.category}
      canManage={canManageStats}
      canView={canViewStats}
      currentPlayerId={currentPlayerId}
      onClose={closeStats}
    />}
  </section>;
}

function MatchDetail({match,updatedAt,refreshing,onRefresh,onClose,category,canManageStats,canViewStats,onOpenStats}){
  const live=match.kind==="live";
  const scores=scoreText(match);
  const setRows=Array.isArray(match.setScores)?match.setScores:[];
  const hasLivePoints=live&&Number.isFinite(match.pointA)&&Number.isFinite(match.pointB);
  return createPortal(<div className="partido-detail-backdrop" role="dialog" aria-modal="true" aria-label={"Detalle de "+match.local+" contra "+match.visitor}>
    <section className="partido-detail-card">
      <header className="partido-detail-head">
        <div><span>{branchLabel(match.branch)} · {match.categoryLabel}</span><h2>{match.local} vs {match.visitor}</h2></div>
        <button type="button" onClick={onClose} aria-label="Cerrar">×</button>
      </header>

      <div className="partido-detail-body">
        <div className="partido-detail-status-row">
          <strong className={live?"live-badge":"result-badge"}>{live?"En Vivo":"Finalizado"}</strong>
          <span>Última Consulta · {formatUpdated(updatedAt)}</span>
        </div>

        <div className="partido-detail-scoreboard">
          <div className="partido-detail-team">
            {match.logoA?<img src={match.logoA} alt="" loading="lazy"/>:<div className="partido-detail-logo-fallback">{String(match.local||"?").slice(0,2)}</div>}
            <b>{match.local}</b>
            <strong>{scores[0]}</strong>
          </div>
          <div className="partido-detail-separator">–</div>
          <div className="partido-detail-team">
            {match.logoB?<img src={match.logoB} alt="" loading="lazy"/>:<div className="partido-detail-logo-fallback">{String(match.visitor||"?").slice(0,2)}</div>}
            <b>{match.visitor}</b>
            <strong>{scores[1]}</strong>
          </div>
        </div>

        {hasLivePoints&&<div className="partido-detail-live-score">
          <span>{match.currentSet?"Set "+match.currentSet:"Set En Juego"}</span>
          <b>{match.pointA} <em>–</em> {match.pointB}</b>
          {match.service&&<small>Saque: {match.service==="A"?match.local:match.service==="B"?match.visitor:match.service}</small>}
        </div>}

        <div className="partido-detail-sets">
          <div className="partido-detail-sets-head"><span>Set</span><span>{match.local}</span><span>{match.visitor}</span></div>
          {setRows.length?setRows.map(item=><div className={"partido-detail-set-row "+(live&&item.set===match.currentSet?"current":"")} key={item.set}>
            <b>{item.set}</b><span>{item.a}</span><span>{item.b}</span>
          </div>):<div className="partido-detail-no-sets">La Fuente Todavía No Publicó El Tanteador Por Set.</div>}
        </div>

        <div className="partido-detail-meta">
          {(match.date||match.time)&&<span>📅 {[match.date,match.time].filter(Boolean).join(" · ")}</span>}
          {match.place&&<span>📍 {match.place}</span>}
          {match.matchNumber&&<span>🏐 Partido {match.matchNumber}</span>}
        </div>

        {(canManageStats||canViewStats)&&category&&isMsmMatch(match)?<button type="button" className="partido-detail-stats-button" onClick={onOpenStats}>📊 {canManageStats?"Tomar / Ver Estadísticas":"Ver Mis Estadísticas"}</button>:null}
        <button type="button" className="partido-detail-refresh" disabled={refreshing} onClick={onRefresh}>
          <span className={refreshing?"spinning":""}>↻</span>{refreshing?"Actualizando Tanteador...":"Actualizar Tanteador"}
        </button>
        <p>El tanteador sólo cambia cuando tocás “Actualizar Tanteador”. No se consulta en segundo plano.</p>
      </div>
    </section>
  </div>,document.body);
}

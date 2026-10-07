import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor, CapacitorHttp } from "@capacitor/core";

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

export default function PartidosHub({allowedCategories=null,unrestricted=false,compact=false}){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [message,setMessage]=useState("");
  const [mode,setMode]=useState("live");
  const [branch,setBranch]=useState("all");
  const [category,setCategory]=useState("all");
  const [institution,setInstitution]=useState("all");
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
    return [...new Set(source.flatMap(match=>[match.local,match.visitor]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
  },[permitted,branch,category]);

  useEffect(()=>{if(institution!=="all"&&!institutions.includes(institution))setInstitution("all")},[institution,institutions]);

  const visible=useMemo(()=>permitted.filter(match=>
    (branch==="all"||match.branch===branch)&&
    (category==="all"||match.permissionKey===category)&&
    matchInstitution(match,institution)
  ),[permitted,branch,category,institution]);

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
    </div>

    <div className="partidos-filters card">
      <label>Rama<select value={branch} onChange={event=>{setBranch(event.target.value);setCategory("all");setInstitution("all");}}><option value="all">Todas</option>{branches.includes("female")&&<option value="female">Femenino</option>}{branches.includes("male")&&<option value="male">Masculino</option>}</select></label>
      <label>Equipo / Categoría<select value={category} onChange={event=>{setCategory(event.target.value);setInstitution("all");}}><option value="all">Todos</option>{categories.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label>Institución<select value={institution} onChange={event=>setInstitution(event.target.value)}><option value="all">Todas</option>{institutions.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
    </div>

    {message&&<div className="partidos-message">{message}</div>}
    {loading?<div className="partidos-empty">Consultando Partidos...</div>:
      visible.length?<div className="partidos-grid">{visible.map(match=>{
        const scores=scoreText(match);
        const hasPoints=Number.isFinite(match.pointA)&&Number.isFinite(match.pointB);
        return <article className={"partido-card "+(mode==="live"?"live":"")} key={match.id}>
          <div className="partido-card-head"><div><span>{branchLabel(match.branch)}</span><b>{match.categoryLabel}</b></div><strong className={mode==="live"?"live-badge":"result-badge"}>{mode==="live"?"En Vivo":"Finalizado"}</strong></div>
          <div className="partido-score"><div><span>{match.local}</span><b>{scores[0]}</b></div><em>–</em><div><b>{scores[1]}</b><span>{match.visitor}</span></div></div>
          {mode==="live"&&hasPoints&&<div className="partido-live-points">{match.currentSet?("Set "+match.currentSet+" · "):""}{match.pointA} - {match.pointB}</div>}
          <div className="partido-meta">{(match.date||match.time)&&<span>📅 {[match.date,match.time].filter(Boolean).join(" · ")}</span>}{match.place&&<span>📍 {match.place}</span>}</div>
        </article>
      })}</div>:<div className="partidos-empty">{mode==="live"?"No Hay Partidos Marcados Como En Vivo Para Estos Filtros.":"No Hay Resultados Disponibles Para Estos Filtros."}</div>
    }
    <p className="partidos-footnote">Los datos se consultan únicamente al abrir esta pestaña o al tocar “Actualizar”. No hay seguimiento ni consumo en segundo plano.</p>
  </section>;
}

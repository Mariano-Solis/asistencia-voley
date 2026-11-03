import {useEffect,useMemo,useState} from "react";
import {Capacitor,CapacitorHttp} from "@capacitor/core";
import {projectStandings,VOLLEY_RESULTS} from "./fmvScenarioEngine";

const norm=value=>String(value||"").trim().toUpperCase();
const institution=value=>norm(value).replace(/\s+[A-C]$/,"");
const score=position=>Math.max(0,13-position);
const label={sub14:"Sub 14",sub16:"Sub 16",sub18:"Sub 18",mayores:"Primera"};
async function loadFixtures(){
  let payload;
  if(Capacitor.isNativePlatform()){
    const response=await CapacitorHttp.get({url:"https://www.voleysanmartin.com.ar/api/fmv-programacion",headers:{Accept:"application/json"}});
    if(response.status<200||response.status>=300)throw Error("No se pudo consultar Courtrack");
    payload=typeof response.data==="string"?JSON.parse(response.data):response.data;
  }else{
    const response=await fetch("/api/fmv-programacion",{cache:"no-store"});
    if(!response.ok)throw Error("No se pudo consultar Courtrack");
    payload=await response.json();
  }
  if(payload?.error)throw Error(payload.message||"Error de programación");
  return {fixtures:Array.isArray(payload?.leagueFixtures)?payload.leagueFixtures:[],coverage:payload?.leagueFixtureCoverage?.complete===true};
}
function rankInstitutions(tables,fixtures,predictions){
  const totals=new Map();
  for(const table of tables){
    const standings=(table.positions||[]).map(r=>({id:norm(r.id_equipo),name:r.id_equipo,points:Number(r.puntos||0),played:Number(r.jugados||0),won:Number(r.ganados||0),lost:Number(r.perdidos||0),setsFor:Number(r.setGanados||0),setsAgainst:Number(r.setPerdidos||0)}));
    const ids=new Set(standings.map(r=>r.id));
    const eligible=fixtures.filter(f=>f.permissionKey===table.tableKey&&ids.has(norm(f.local))&&ids.has(norm(f.visitor))&&f.courtrackStatus==="upcoming").map(f=>({id:String(f.id),homeId:norm(f.local),awayId:norm(f.visitor)}));
    const projected=projectStandings(standings,eligible,predictions);
    const unique=new Map();
    for(const row of projected){
      const id=institution(row.id);
      if(!unique.has(id))unique.set(id,row);
    }
    for(const [id,row] of unique){
      const previous=totals.get(id)||{id,points:0,categories:0,details:[]};
      previous.points+=score(row.position);
      previous.categories++;
      previous.details.push({category:table.categoryLabel,position:row.position,points:score(row.position)});
      totals.set(id,previous);
    }
  }
  return [...totals.values()].sort((a,b)=>b.points-a.points||a.id.localeCompare(b.id)).map((r,i)=>({...r,position:i+1}));
}
function autoPredictions(fixtures,target,optimistic){
  const predictions={};
  for(const f of fixtures){
    const home=institution(f.local)===target,away=institution(f.visitor)===target;
    if(home===away)continue;
    const targetWins=optimistic;
    predictions[String(f.id)]=(home===targetWins)?{homeSets:3,awaySets:0}:{homeSets:0,awaySets:3};
  }
  return predictions;
}

function objectiveMet(ranking,targets,safeTargets){
  if(ranking.length<3)return false;
  const relegated=new Set(ranking.slice(-2).map(r=>r.id));
  return targets.every(id=>relegated.has(id))&&safeTargets.every(id=>!relegated.has(id));
}
function decisiveMatches(tables,fixtures,predictions,targets,safeTargets){
  // One-match counterfactual: keep every other projected result unchanged.
  // Only display a fixture if a valid alternative flips the chosen objective.
  return fixtures.filter(f=>{
    const current=predictions[String(f.id)];
    if(!current)return false;
    return VOLLEY_RESULTS.some(([homeSets,awaySets])=>{
      if(homeSets===current.homeSets&&awaySets===current.awaySets)return false;
      const changed={...predictions,[String(f.id)]:{homeSets,awaySets}};
      return !objectiveMet(rankInstitutions(tables,fixtures,changed),targets,safeTargets);
    });
  });
}
function findRelegationExamples(tables,fixtures,targets,safeTargets,fixed={},maxChecks=12000){
  const pending=fixtures.filter(f=>!fixed[String(f.id)]);
  const total=6**pending.length;
  const complete=Number.isSafeInteger(total)&&total<=maxChecks;
  const checks=complete?total:maxChecks;
  const results={matching:[]};
  let seed=2166136261;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296};
  for(let i=0;i<checks;i++){
    let index=i;
    const predictions={...fixed};
    for(const f of pending){
      const choice=complete?index%6:Math.floor(random()*6);
      if(complete)index=Math.floor(index/6);
      const [homeSets,awaySets]=VOLLEY_RESULTS[choice];
      predictions[String(f.id)]={homeSets,awaySets};
    }
    const ranking=rankInstitutions(tables,fixtures,predictions);
    if(ranking.length<3)continue;
    const cutoff=ranking.length-1;
    const descend=ranking.filter(r=>r.position>=cutoff).map(r=>r.id);
    if(!objectiveMet(ranking,targets,safeTargets))continue;
    if(results.matching.length<8){
      const signature=descend.join("|");
      if(!results.matching.some(item=>item.signature===signature&&item.positions===targets.map(id=>ranking.find(r=>r.id===id)?.position).join(","))){
        results.matching.push({ranking,predictions,signature,positions:targets.map(id=>ranking.find(r=>r.id===id)?.position).join(","),decisive:decisiveMatches(tables,fixtures,predictions,targets,safeTargets)});
      }
    }
    if(results.matching.length>=8&&!complete)break;
  }
  return {complete,checks,total,results,remaining:pending.length};
}

export default function FmvInstitutionalSimulator({entries=[],loadTable}){
  const [tables,setTables]=useState([]);
  const [fixtures,setFixtures]=useState([]);
  const [coverage,setCoverage]=useState(false);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const [target,setTarget]=useState("MSM");
  const [predictions,setPredictions]=useState({});
  const [scenario,setScenario]=useState("manual");
  const [examples,setExamples]=useState(null);
  const [relegate,setRelegate]=useState([]);
  const [protect,setProtect]=useState([]);
  const [threshold,setThreshold]=useState("");
  useEffect(()=>{
    let active=true;
    setBusy(true);setError("");setTables([]);setFixtures([]);
    Promise.all([Promise.allSettled(entries.map(e=>loadTable(e))),loadFixtures()]).then(([results,source])=>{
      if(!active)return;
      const loaded=results.filter(r=>r.status==="fulfilled").map(r=>r.value);
      setTables(loaded);setFixtures(source.fixtures);setCoverage(source.coverage&&loaded.length===entries.length);
      if(results.some(r=>r.status==="rejected"))setError("Algunas categorías no pudieron cargarse; no se certifican conclusiones.");
    }).catch(e=>{if(active)setError(e.message||"Error al cargar el simulador institucional")}).finally(()=>{if(active)setBusy(false)});
    return()=>{active=false};
  },[entries.map(e=>e.key).join("|"),loadTable]);
  const relevant=useMemo(()=>fixtures.filter(f=>tables.some(t=>t.tableKey===f.permissionKey)&&f.courtrackStatus==="upcoming"),[fixtures,tables]);
  const base=useMemo(()=>rankInstitutions(tables,[],{}),[tables]);
  const teams=base.map(r=>r.id);
  const selected=teams.includes(target)?target:teams[0]||"";
  useEffect(()=>setExamples(null),[selected,scenario,predictions,relevant,relegate,protect]);
  const activePredictions=useMemo(()=>scenario==="manual"?predictions:autoPredictions(relevant,selected,scenario==="best"),[scenario,predictions,relevant,selected]);
  const ranking=useMemo(()=>rankInstitutions(tables,relevant,activePredictions),[tables,relevant,activePredictions]);
  const best=useMemo(()=>rankInstitutions(tables,relevant,autoPredictions(relevant,selected,true)),[tables,relevant,selected]);
  const worst=useMemo(()=>rankInstitutions(tables,relevant,autoPredictions(relevant,selected,false)),[tables,relevant,selected]);
  const find=(rows)=>rows.find(r=>r.id===selected);
  const cutoff=ranking.length>=2?ranking.length-1:0;
  const status=(row)=>{
    if(!row)return "Sin datos";
    if(!cutoff)return "Sin suficientes instituciones";
    return row.position>=cutoff?"En zona de descenso (2 últimos)":"Fuera de zona de descenso";
  };
  if(entries.length!==4)return <section className="card"><h2>Simulador institucional</h2><p>No están disponibles las cuatro categorías de esta rama y nivel. No se mezclan torneos ni ramas.</p></section>;
  return <section className="card" style={{padding:18,marginTop:18}}>
    <h2>Simulador institucional · Ascensos y descensos</h2>
    <p>Integra Sub 14, Sub 16, Sub 18 y Primera. Sub 12 queda excluida. Se calcula una clasificación orientativa por suma de puntos por posición (1.º=12, 2.º=11…). No altera las posiciones oficiales.</p>
    {busy?<p>Cargando las cuatro tablas y los encuentros pendientes…</p>:null}
    {error?<p role="alert">{error}</p>:null}
    {!coverage&&!busy?<p role="alert">Cobertura incompleta de tablas o partidos. No es posible certificar permanencia, ascenso ni descenso.</p>:null}
    <p>Categorías cargadas: {tables.length} de {entries.length}. Partidos pendientes detectados: {relevant.length}.</p>
    <label>Institución <select value={selected} onChange={e=>{setTarget(e.target.value);setScenario("manual");setPredictions({})}}>{teams.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
    <label>Escenario <select value={scenario} onChange={e=>setScenario(e.target.value)}><option value="manual">Resultados que elijo</option><option value="best">MSM / institución elegida gana todos sus pendientes</option><option value="worst">MSM / institución elegida pierde todos sus pendientes</option></select></label>
    <p>Los escenarios favorable y desfavorable son simulaciones de los partidos de la institución, <strong>no máximos o mínimos matemáticos globales</strong>: los partidos entre rivales no elegidos quedan sin pronóstico.</p>
    <p>Descenso: los últimos dos puestos de la clasificación institucional, según el cupo informado por el usuario. Para Nivel I con 12 instituciones corresponden los puestos 11.º y 12.º.</p>
    <div style={{overflowX:"auto"}}><table className="standings-table"><thead><tr><th>Situación</th><th>Posición institucional</th><th>Puntos</th><th>Interpretación</th></tr></thead><tbody>
      {[["Actual",find(base)],["Ganando sus partidos",find(best)],["Perdiendo sus partidos",find(worst)],["Pronóstico elegido",find(ranking)]].map(([name,row])=><tr key={name}><td>{name}</td><td>{row?.position||"—"}</td><td>{row?.points??"—"}</td><td>{status(row)}</td></tr>)}
    </tbody></table></div>
    <h3>Objetivo inverso: ¿qué instituciones querés que desciendan?</h3>
    <p>Elegí una o dos instituciones para descender y, si querés, otras que deban salvarse. El buscador combina los resultados pendientes de todas las instituciones y categorías simultáneamente.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
      <fieldset><legend>Quiero que desciendan (máximo 2)</legend>
        {teams.map(id=><label key={id} style={{display:"block",marginBottom:5}}><input type="checkbox" checked={relegate.includes(id)} disabled={!relegate.includes(id)&&(relegate.length>=2||protect.includes(id))} onChange={e=>setRelegate(old=>e.target.checked?[...old,id]:old.filter(x=>x!==id))}/> {id}</label>)}
      </fieldset>
      <fieldset><legend>Quiero que se salven</legend>
        {teams.map(id=><label key={id} style={{display:"block",marginBottom:5}}><input type="checkbox" checked={protect.includes(id)} disabled={!protect.includes(id)&&relegate.includes(id)} onChange={e=>setProtect(old=>e.target.checked?[...old,id]:old.filter(x=>x!==id))}/> {id}</label>)}
      </fieldset>
    </div>
    <p>Las selecciones se evalúan a la vez. El sistema no acepta que una misma institución descienda y se salve, ni más de dos descensos.</p>
    <button type="button" disabled={busy||!coverage||(!relegate.length&&!protect.length)||relevant.length===0} onClick={()=>{setScenario("manual");setExamples(findRelegationExamples(tables,relevant,relegate,protect,predictions))}}>Buscar resultados que cumplan mi objetivo</button>
    {examples?<div>
      <p>Se evaluaron {examples.checks.toLocaleString("es-AR")} combinaciones. {examples.complete?"Búsqueda exhaustiva sobre los encuentros incluidos.":"Búsqueda por muestreo: no garantiza encontrar todos los escenarios ni permite declarar imposible un objetivo."}</p>
      <h4>Escenarios encontrados: {examples.results.matching.length}</h4>
      {!examples.results.matching.length?<p>No se encontraron combinaciones que cumplan el objetivo en esta búsqueda. {examples.complete?"Con los encuentros y criterios incluidos, no existe una combinación válida.":"Puede haber combinaciones que el muestreo no haya encontrado."}</p>:null}
      {examples.results.matching.map((item,i)=><details key={i}><summary>Escenario {i+1}: descienden {item.ranking.slice(-2).map(r=>r.id).join(" y ")}</summary>
        <p>Posiciones finales: {item.ranking.map(r=>r.position+".º "+r.id).join(" · ")}</p>
        <p><strong>Resultados decisivos:</strong> {item.decisive.length}. Solo se muestran los partidos cuyo marcador, al cambiarlo individualmente y mantener los demás resultados de este escenario, puede hacer que el objetivo deje de cumplirse.</p>\n        {item.decisive.length?<ol>{item.decisive.map(f=>{const p=item.predictions[String(f.id)];return <li key={f.id}>{f.categoryLabel}: {f.local} – {f.visitor}: {p.homeSets}–{p.awaySets}</li>})}</ol>:<p>No se detectó un partido decisivo individual. El objetivo puede depender de varios resultados combinados; no significa que los partidos restantes sean irrelevantes.</p>}
        <button type="button" onClick={()=>{setPredictions(item.predictions);setScenario("manual")}}>Aplicar este escenario</button>
      </details>)}
      <p>Filtro de relevancia: cambio individual de cada marcador con los demás fijos. No identifica todas las dependencias conjuntas ni demuestra un conjunto mínimo de resultados. Los resultados son proyecciones; para certificar un descenso oficial deben verificarse la cobertura de encuentros y los desempates reglamentarios.</p>
    </div>:null}
    <h3>Tabla institucional proyectada</h3>
    <div style={{overflowX:"auto"}}><table className="standings-table"><thead><tr><th>#</th><th>Institución</th><th>Puntos</th><th>Categorías</th></tr></thead><tbody>{ranking.map(row=><tr key={row.id}><td>{row.position}</td><td>{row.id}</td><td>{row.points}</td><td>{row.categories}/4</td></tr>)}</tbody></table></div>
    <details><summary>Ver partidos pendientes de las cuatro categorías ({relevant.length})</summary>
      {relevant.map(f=><div key={f.id} style={{padding:"8px 0",borderBottom:"1px solid #ddd"}}><span>{label[String(f.permissionKey).split(":").pop()]||f.categoryLabel}: {f.local} – {f.visitor} · {f.date}</span> <select disabled={scenario!=="manual"} aria-label={f.local+" contra "+f.visitor} value={predictions[f.id]?predictions[f.id].homeSets+"-"+predictions[f.id].awaySets:""} onChange={e=>setPredictions(current=>{const next={...current};if(!e.target.value)delete next[f.id];else{const [homeSets,awaySets]=e.target.value.split("-").map(Number);next[f.id]={homeSets,awaySets}}return next})}><option value="">Sin pronóstico</option>{VOLLEY_RESULTS.map(([h,a])=><option key={h+"-"+a} value={h+"-"+a}>{h}–{a}</option>)}</select></div>)}
    </details>
    <p><strong>Importante:</strong> el cupo de dos ascensos y dos descensos fue informado por el usuario. La posición por categorías es una proyección; los criterios oficiales de desempate institucional requieren datos completos de puntos, sets y tantos. Tampoco considera partidos faltantes fuera de la fuente.</p>
  </section>;
}

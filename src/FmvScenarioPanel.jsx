import {useEffect,useMemo,useState} from "react";
import {Capacitor,CapacitorHttp} from "@capacitor/core";
import {projectStandings,searchScenarios,positionObjective,VOLLEY_RESULTS} from "./fmvScenarioEngine";
const normalize=value=>String(value||"").trim().toUpperCase();
async function getFixtures(){
  if(Capacitor.isNativePlatform()){
    const response=await CapacitorHttp.get({url:"https://www.voleysanmartin.com.ar/api/fmv-programacion",headers:{Accept:"application/json"}});
    if(response.status<200||response.status>=300)throw Error("No se pudo consultar la programación");
    const payload=typeof response.data==="string"?JSON.parse(response.data):response.data;
    if(payload?.error)throw Error(payload.message||"Error de programación");
    return payload.leagueFixtures||[];
  }
  const response=await fetch("/api/fmv-programacion",{cache:"no-store"});
  if(!response.ok)throw Error("No se pudo consultar la programación");
  const payload=await response.json();
  if(payload.error)throw Error(payload.message||"Error de programación");
  return payload.leagueFixtures||[];
}
export default function FmvScenarioPanel({tables=[]}){
  const [key,setKey]=useState("");
  const [fixtures,setFixtures]=useState([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [predictions,setPredictions]=useState({});
  const [favor,setFavor]=useState([]);
  const [oppose,setOppose]=useState([]);
  const [search,setSearch]=useState(null);
  const [fixtureCoverage,setFixtureCoverage]=useState(null);
  const table=tables.find(t=>t.tableKey===key)||tables[0];
  const selectedKey=table?.tableKey||"";
  useEffect(()=>{if(!tables.some(t=>t.tableKey===key))setKey(tables[0]?.tableKey||"")},[tables,key]);
  useEffect(()=>{let live=true;setBusy(true);getFixtures().then(data=>{if(live){setFixtures(data);setFixtureCoverage(true)}}).catch(e=>{if(live){setError(e.message);setFixtureCoverage(false)}}).finally(()=>{if(live)setBusy(false)});return()=>{live=false}},[]);
  useEffect(()=>{setPredictions({});setSearch(null);setFavor([]);setOppose([])},[selectedKey]);
  const standings=useMemo(()=>(table?.positions||[]).map(r=>({id:normalize(r.id_equipo),name:r.id_equipo,points:Number(r.puntos||0),played:Number(r.jugados||0),won:Number(r.ganados||0),lost:Number(r.perdidos||0),setsFor:Number(r.setGanados||0),setsAgainst:Number(r.setPerdidos||0)})),[table]);
  const teamIds=useMemo(()=>new Set(standings.map(t=>t.id)),[standings]);
  const pending=useMemo(()=>fixtures.filter(f=>f.permissionKey===selectedKey&&teamIds.has(normalize(f.local))&&teamIds.has(normalize(f.visitor))&&f.local&&f.visitor&&f.courtrackStatus==="upcoming").map((f,i)=>({id:String(f.id||[selectedKey,f.local,f.visitor,f.date,i].join(":")),homeId:normalize(f.local),awayId:normalize(f.visitor),date:f.date||"",time:f.time||""})).filter((f,i,arr)=>arr.findIndex(x=>x.id===f.id)===i),[fixtures,selectedKey,teamIds]);
  const projected=useMemo(()=>{try{return projectStandings(standings,pending,predictions)}catch{return standings}},[standings,pending,predictions]);
  const change=(id,value)=>{setSearch(null);setPredictions(current=>{const next={...current};if(value==="")delete next[id];else{const [homeSets,awaySets]=value.split("-").map(Number);next[id]={homeSets,awaySets}}return next})};
  const toggle=(setter,id)=>{setSearch(null);setter(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id])};
  const optimize=()=>{
    setError("");setSearch(null);
    if(fixtureCoverage!==true){setError("No se pudo verificar la programación completa.");return}
    if(!favor.length&&!oppose.length){setError("Elegí al menos un equipo para favorecer o perjudicar.");return}
    if(favor.some(id=>oppose.includes(id))){setError("Un equipo no puede estar simultáneamente en ambos objetivos.");return}
    const remaining=pending.filter(f=>!predictions[f.id]);
    try{
      const result=searchScenarios({standings:projectStandings(standings,pending,predictions),fixtures:remaining,objective:positionObjective([...teamIds],{favor,oppose}),limit:46656});
      setSearch(result);
    }catch(e){setError(e.message)}
  };
  if(!tables.length)return <section className="card"><p>Cargá primero las tablas oficiales para usar el simulador.</p></section>;
  return <section className="card" style={{padding:18,marginTop:18}}>
    <h2>Simulador de escenarios · FMV</h2>
    <p>Resultados hipotéticos. No se modifican los datos oficiales. Ascensos y descensos requieren confirmar el reglamento específico de cada torneo.</p>
    <label>Tabla / categoría <select value={selectedKey} onChange={e=>setKey(e.target.value)}>{tables.map(t=><option key={t.tableKey} value={t.tableKey}>{t.categoryLabel} · {t.branch==="female"?"Femenino":"Masculino"} · {t.competition}</option>)}</select></label>
    {busy?<p>Consultando partidos pendientes…</p>:null}
    {error?<p role="alert" style={{color:"#b91c1c"}}>{error}</p>:null}
    <p>Fuente: Courtrack, encuentros con estado upcoming. Los cálculos sólo abarcan las categorías y encuentros que devuelve la fuente. Las reglas de desempate y ascenso/descenso siguen sin certificar.</p>
    <h3>Partidos para pronosticar ({pending.length})</h3>
    {pending.length===0?<p>No se encontraron partidos pendientes compatibles con esta tabla. No se inventan encuentros.</p>:pending.map(f=><div key={f.id} style={{display:"flex",gap:12,alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #ddd",flexWrap:"wrap"}}>
      <span>{f.homeId} – {f.awayId} <small>{f.date}</small></span>
      <select aria-label={`Resultado hipotético ${f.homeId} contra ${f.awayId}`} value={predictions[f.id]?`${predictions[f.id].homeSets}-${predictions[f.id].awaySets}`:""} onChange={e=>change(f.id,e.target.value)}>
        <option value="">Sin pronóstico</option>{VOLLEY_RESULTS.map(([a,b])=><option key={`${a}-${b}`} value={`${a}-${b}`}>{a}–{b}</option>)}
      </select>
    </div>)}
    <h3>Objetivos combinados</h3>
    <p>Marcá uno o varios equipos. La búsqueda encuentra el mejor y el peor resultado global para el conjunto elegido.</p>
    <div style={{overflowX:"auto"}}><table className="standings-table"><thead><tr><th>Equipo</th><th>Favorecer</th><th>Perjudicar</th></tr></thead><tbody>{standings.map(t=><tr key={t.id}><td>{t.name}</td><td><input type="checkbox" checked={favor.includes(t.id)} onChange={()=>toggle(setFavor,t.id)}/></td><td><input type="checkbox" checked={oppose.includes(t.id)} onChange={()=>toggle(setOppose,t.id)}/></td></tr>)}</tbody></table></div>
    <button type="button" onClick={optimize} disabled={busy}>Buscar mejores y peores escenarios</button>
    {search?<div><h3>Resultado de la búsqueda</h3>{search.complete?<><p>Se evaluaron {search.checked} combinaciones completas de los encuentros no fijados.</p><p>Mejor puntuación del objetivo: {search.best?.value}. Peor: {search.worst?.value}.</p>{[["Mejor",search.best],["Peor",search.worst]].map(([label,item])=><details key={label}><summary>{label} escenario · ver resultados y posiciones</summary><ol>{Object.entries(item.predictions).map(([id,r])=><li key={id}>{pending.find(f=>f.id===id)?.homeId} – {pending.find(f=>f.id===id)?.awayId}: {r.homeSets}–{r.awaySets}</li>)}</ol><p>{item.table.map(t=>`${t.position}° ${t.name}: ${t.points} pts`).join(" · ")}</p></details>)}</>:<p>La búsqueda exhaustiva requiere {search.total} combinaciones y supera el límite seguro. No se declara un escenario óptimo sin calcularlo.</p>}</div>:null}
    <h3>Tabla proyectada</h3>
    <div style={{overflowX:"auto"}}><table className="standings-table"><thead><tr><th>#</th><th>Equipo</th><th>PTS</th><th>PJ</th><th>SG</th><th>SP</th></tr></thead><tbody>{projected.map(t=><tr key={t.id}><td>{t.position}</td><td>{t.name}</td><td>{t.points}</td><td>{t.played}</td><td>{t.setsFor}</td><td>{t.setsAgainst}</td></tr>)}</tbody></table></div>
    <button type="button" onClick={()=>{setPredictions({});setSearch(null)}}>Restablecer pronósticos</button>
  </section>;
}

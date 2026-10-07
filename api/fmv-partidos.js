const COURTRACK_BASE="https://api.courtrack.com/api/torneo";

const COMPETITIONS=[
  {permissionKey:"male:level1:mayores",categoryLabel:"Primera Masculino",branch:"male",tournamentId:893,stageId:3636},
  {permissionKey:"male:level1:sub18",categoryLabel:"Sub 18 Masculino",branch:"male",tournamentId:894,stageId:3637},
  {permissionKey:"male:level1:sub16",categoryLabel:"Sub 16 Masculino",branch:"male",tournamentId:895,stageId:3638},
  {permissionKey:"male:level1:sub14",categoryLabel:"Sub 14 Masculino",branch:"male",tournamentId:896,stageId:3639},
  {permissionKey:"female:level1:sub12",categoryLabel:"Sub 12 Femenino",branch:"female",tournamentId:897,stageId:3640},
  {permissionKey:"female:level1:sub14",categoryLabel:"Sub 14 Femenino",branch:"female",tournamentId:898,stageId:3641},
  {permissionKey:"female:level1:sub16",categoryLabel:"Sub 16 Femenino",branch:"female",tournamentId:899,stageId:3642},
  {permissionKey:"female:level1:sub18",categoryLabel:"Sub 18 Femenino",branch:"female",tournamentId:900,stageId:3643},
  {permissionKey:"female:level1:mayores",categoryLabel:"Primera Femenino",branch:"female",tournamentId:901,stageId:3644},
  {permissionKey:"female:level3:sub14a",categoryLabel:"Sub 14 Femenino · Nivel 3 · Zona A",branch:"female",tournamentId:913,stageId:3691},
  {permissionKey:"female:level3:sub14b",categoryLabel:"Sub 14 Femenino · Nivel 3 · Zona B",branch:"female",tournamentId:913,stageId:3692},
  {permissionKey:"female:level3:sub12",categoryLabel:"Sub 12 Femenino · Nivel 3",branch:"female",tournamentId:915,stageId:3694},
  {permissionKey:"female:master:master_a",categoryLabel:"Master A",branch:"female",tournamentId:886,stageId:3626},
  {permissionKey:"female:master:master_c",categoryLabel:"Master C",branch:"female",tournamentId:888,stageId:3628},
];

function send(res,status,body){
  res.status(status);
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  return res.end(JSON.stringify(body));
}

function text(value){return String(value??"").trim()}
function norm(value){return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim()}
function number(value){
  if(value===null||value===undefined||value==="")return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function firstNumber(row,keys){
  for(const key of keys){const n=number(row?.[key]);if(n!==null)return n}
  return null;
}
function firstText(row,keys){
  for(const key of keys){const value=text(row?.[key]);if(value)return value}
  return "";
}
function statusKind(raw){
  const value=norm(raw).replace(/[_-]+/g," ");
  if(/\b(EN VIVO|LIVE|PLAYING|IN PROGRESS|ONGOING|STARTED)\b/.test(value))return"live";
  if(/\b(FINISHED|FINAL|FINALIZADO|TERMINADO|COMPLETED|CLOSED|PLAYED|ENDED)\b/.test(value))return"result";
  return"other";
}
function scorePair(row){
  const pairs=[
    ["sets_a","sets_b"],["set_a","set_b"],["sets_local","sets_visitante"],["setsLocal","setsVisitante"],
    ["resultado_a","resultado_b"],["resultado_local","resultado_visitante"],["resultadoLocal","resultadoVisitante"],
    ["score_a","score_b"],["score_local","score_visitante"],["scoreLocal","scoreVisitante"],
    ["marcador_a","marcador_b"],["marcador_local","marcador_visitante"],
    ["puntos_a","puntos_b"],["puntos_local","puntos_visitante"],["puntosLocal","puntosVisitante"]
  ];
  for(const [a,b] of pairs){
    const left=number(row?.[a]),right=number(row?.[b]);
    if(left!==null&&right!==null)return[left,right];
  }
  const combined=firstText(row,["resultado","score","marcador","sets"]);
  const match=combined.match(/(\d+)\s*[-:]\s*(\d+)/);
  return match?[Number(match[1]),Number(match[2])]:[null,null];
}
function livePoints(row){
  const left=firstNumber(row,["puntos_actual_a","puntos_set_a","puntosA","puntos_local_actual","score_current_a","point_a"]);
  const right=firstNumber(row,["puntos_actual_b","puntos_set_b","puntosB","puntos_visitante_actual","score_current_b","point_b"]);
  return left!==null&&right!==null?[left,right]:[null,null];
}
function currentSet(row){
  return firstNumber(row,["set_actual","setActual","current_set","set","numero_set"]);
}
function scheduledAt(row){
  const raw=text(row?.fecha);
  if(!raw)return null;
  const d=new Date(raw);
  return Number.isNaN(d.getTime())?null:d.toISOString();
}
function displayDate(value){
  if(!value)return"";
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return"";
  return new Intl.DateTimeFormat("es-AR",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"America/Argentina/Mendoza"}).format(d);
}
function displayTime(raw){
  const n=Number(raw);
  if(!Number.isFinite(n))return"";
  const h=Math.floor(n/100),m=n%100;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

async function loadCompetition(config){
  const url=`${COURTRACK_BASE}/findPartidos?id_torneos=${config.tournamentId}&id_etapas=${config.stageId}`;
  const response=await fetch(url,{headers:{Accept:"application/json"},cache:"no-store"});
  if(!response.ok)return[];
  const payload=await response.json().catch(()=>({}));
  const rows=Array.isArray(payload?.data)?payload.data:[];
  return rows.map((row,index)=>{
    const rawStatus=firstText(row,["status","estado","partido_status","estado_partido"]);
    const kind=statusKind(rawStatus);
    const [scoreA,scoreB]=scorePair(row);
    const [pointA,pointB]=livePoints(row);
    const set=currentSet(row);
    const local=firstText(row,["id_equipo_a","equipo_a","local","team_a"]);
    const visitor=firstText(row,["id_equipo_b","equipo_b","visitante","team_b"]);
    if(!local||!visitor)return null;
    const when=scheduledAt(row);
    return{
      id:`${config.permissionKey}:${row?.id??index}`,
      permissionKey:config.permissionKey,
      categoryLabel:config.categoryLabel,
      branch:config.branch,
      tournamentId:config.tournamentId,
      stageId:config.stageId,
      local,
      visitor,
      institutionKeys:[norm(local),norm(visitor)],
      status:rawStatus||"",
      kind,
      scoreA,
      scoreB,
      pointA,
      pointB,
      currentSet:set,
      date:displayDate(when),
      time:displayTime(row?.horario),
      scheduledAt:when,
      place:firstText(row,["id_cancha","cancha","lugar"]),
    };
  }).filter(Boolean);
}

export default async function handler(req,res){
  if(req.method!=="GET")return send(res,405,{error:true,message:"Método No Permitido."});
  try{
    const settled=await Promise.allSettled(COMPETITIONS.map(loadCompetition));
    const all=settled.filter(item=>item.status==="fulfilled").flatMap(item=>item.value);
    const live=all.filter(match=>match.kind==="live");
    const results=all
      .filter(match=>match.kind==="result")
      .sort((a,b)=>String(b.scheduledAt||"").localeCompare(String(a.scheduledAt||"")));
    return send(res,200,{
      error:false,
      source:"Courtrack · Federación Mendocina De Voleibol",
      fetchedAt:new Date().toISOString(),
      live,
      results,
      competitions:COMPETITIONS.map(({permissionKey,categoryLabel,branch})=>({permissionKey,categoryLabel,branch}))
    });
  }catch(error){
    return send(res,502,{error:true,message:error?.message||"No Se Pudieron Consultar Los Partidos."});
  }
}

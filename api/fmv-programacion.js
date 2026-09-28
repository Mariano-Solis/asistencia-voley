const SOURCE_URL="https://programacionvoley.jimdofree.com/programacion/";
const COURTRACK_BASE="https://api.courtrack.com/api/torneo";

const SCHEDULE_TABLES=[
  {permissionKey:"male:level1:mayores",categoryLabel:"Primera Masculino",tournamentId:893,stageId:3636,teams:["MSM"]},
  {permissionKey:"male:level1:sub18",categoryLabel:"Sub 18 Masculino",tournamentId:894,stageId:3637,teams:["MSM"]},
  {permissionKey:"male:level1:sub16",categoryLabel:"Sub 16 Masculino",tournamentId:895,stageId:3638,teams:["MSM"]},
  {permissionKey:"male:level1:sub14",categoryLabel:"Sub 14 Masculino",tournamentId:896,stageId:3639,teams:["MSM"]},
  {permissionKey:"female:level1:mayores",categoryLabel:"Primera Femenino",tournamentId:901,stageId:3644,teams:["MSM"]},
  {permissionKey:"female:level1:sub18",categoryLabel:"Sub 18 Femenino",tournamentId:900,stageId:3643,teams:["MSM"]},
  {permissionKey:"female:level1:sub16",categoryLabel:"Sub 16 Femenino",tournamentId:899,stageId:3642,teams:["MSM"]},
  {permissionKey:"female:level1:sub14",categoryLabel:"Sub 14 Femenino",tournamentId:898,stageId:3641,teams:["MSM"]},
  {permissionKey:"female:level1:sub12",categoryLabel:"Sub 12 Femenino",tournamentId:897,stageId:3640,teams:["MSM"]},
  {permissionKey:"female:level3:sub14b",categoryLabel:"Sub 14 Femenino · Nivel 3 · Zona B",tournamentId:913,stageId:3692,teams:["MSM B"]},
  {permissionKey:"female:level3:sub12",categoryLabel:"Sub 12 Femenino · Nivel 3",tournamentId:915,stageId:3694,teams:["MSM B"]},
  {permissionKey:"female:master:master_a",categoryLabel:"Master A",tournamentId:886,stageId:3626,teams:["MSM"]},
  {permissionKey:"female:master:master_c",categoryLabel:"Master C",tournamentId:888,stageId:3628,teams:["MSM B"]},
];

function decode(v=""){return String(v).replace(/&nbsp;/gi," ").replace(/&quot;/gi,'"').replace(/&ordm;/gi,"º").replace(/&amp;/gi,"&").replace(/&#39;/gi,"'").replace(/&aacute;/gi,"á").replace(/&eacute;/gi,"é").replace(/&iacute;/gi,"í").replace(/&oacute;/gi,"ó").replace(/&uacute;/gi,"ú").replace(/&ntilde;/gi,"ñ")}
function clean(v=""){return decode(String(v).replace(/<br\s*\/?>/gi," ").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim()}
function norm(v=""){return clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim()}
function isMsm(v){const x=norm(v);return x==="MSM"||x==="MSM B"}
function send(res,status,body,cache=false){res.status(status);res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control",cache?"public, s-maxage=45, stale-while-revalidate=120":"no-store");return res.end(JSON.stringify(body))}

function pageDate(value){
  const text=String(value||"").trim().toLowerCase();
  const slash=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(slash){const y=Number(slash[3])<100?2000+Number(slash[3]):Number(slash[3]);return new Date(Date.UTC(y,Number(slash[2])-1,Number(slash[1]),12))}
  const dash=text.match(/^(\d{1,2})-([a-záéíóú]{3})$/i);
  if(dash){const months={ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11};const m=months[norm(dash[2]).toLowerCase()];if(Number.isInteger(m))return new Date(Date.UTC(2026,m,Number(dash[1]),12))}
  return null;
}
function displayDate(iso){const d=new Date(iso);if(Number.isNaN(d.getTime()))return"Fecha A Confirmar";return new Intl.DateTimeFormat("es-AR",{day:"2-digit",month:"2-digit",year:"2-digit",timeZone:"UTC"}).format(d)}
function displayTime(raw){const n=Number(raw);if(!Number.isFinite(n))return"Hora A Confirmar";const h=Math.floor(n/100),m=n%100;return m?`${h}:${String(m).padStart(2,"0")}HS`:`${h}HS`}

function headerRounds(html){
  return [...html.matchAll(/<h1\b[^>]*>\s*(\d{1,2})(?:º|&ordm;|°)\s*FECHA\s*<\/h1>/gi)]
    .map(m=>Number(m[1])).filter(Number.isInteger);
}

function actualRoundSections(html){
  const rx=/<tr\b[\s\S]{0,2500}?TORNEO\s+CLAUSURA[\s\S]*?<\/tr>\s*<tr\b[\s\S]{0,2500}?(\d{1,2})(?:º|&ordm;|°)\s*FECHA[\s\S]*?<\/tr>/gi;
  const hits=[];let m;
  while((m=rx.exec(html)))hits.push({round:Number(m[1]),index:m.index});
  const unique=new Map();for(const hit of hits){if(!unique.has(hit.round))unique.set(hit.round,hit)}
  return[...unique.values()].sort((a,b)=>a.index-b.index);
}

function inferMeta(raw){
  const text=norm(raw);
  const headings=[...text.matchAll(/MASTER\s+[A-E]|MAYORES(?:\s+NIVEL\s+(?:III|II|I|3|2|1))?|SUB\s+(?:12|14|16|18)(?:\s+NIVEL\s+(?:III|II|I|3|2|1))?/g)];
  if(!headings.length)return null;
  const last=headings[headings.length-1],heading=last[0],idx=last.index||0;
  if(heading.startsWith("MASTER ")){
    if(heading==="MASTER A")return{permissionKey:"female:master:master_a",categoryLabel:"Master A"};
    if(heading==="MASTER C")return{permissionKey:"female:master:master_c",categoryLabel:"Master C"};
    return null;
  }
  const lastFem=text.lastIndexOf("FEMENINO"),lastMasc=text.lastIndexOf("MASCULINO");
  let branch=lastFem>lastMasc?"female":"male";
  const own=heading.match(/NIVEL\s+(III|II|I|3|2|1)/);
  const prior=[...text.slice(0,idx).matchAll(/NIVEL\s+(III|II|I|3|2|1)/g)];
  const level=own?.[1]||(prior.length?prior[prior.length-1][1]:"I");
  const competition=(level==="III"||level==="3")?"level3":(level==="II"||level==="2")?"level2":"level1";
  let category=heading.startsWith("MAYORES")?"mayores":heading.startsWith("SUB 12")?"sub12":heading.startsWith("SUB 14")?"sub14":heading.startsWith("SUB 16")?"sub16":heading.startsWith("SUB 18")?"sub18":"";
  if(competition==="level3"){
    branch="female";
    if(category==="sub12")return{permissionKey:"female:level3:sub12",categoryLabel:"Sub 12 Femenino · Nivel 3"};
    if(category==="sub14"){const tail=text.slice(idx),zone=tail.includes('ZONA "A"')||tail.includes("ZONA A")?"A":tail.includes('ZONA "B"')||tail.includes("ZONA B")?"B":"";if(zone)return{permissionKey:`female:level3:sub14${zone.toLowerCase()}`,categoryLabel:`Sub 14 Femenino · Nivel 3 · Zona ${zone}`}}
    return null;
  }
  if(competition!=="level1"||!category)return null;
  const label=category==="mayores"?"Primera":category.replace("sub","Sub ");
  return{permissionKey:`${branch}:level1:${category}`,categoryLabel:`${label} ${branch==="female"?"Femenino":"Masculino"}`};
}

function parseConfirmedRound(segment,description=""){
  const matches=[],allDates=[],desc=norm(description);
  for(const rm of segment.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)){
    const row=rm[0],cells=[...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>clean(x[1]));
    if(cells.length<5)continue;
    const[date,time,local,visitor,place]=cells,d=pageDate(date);if(d)allDates.push(d);
    if(!isMsm(local)&&!isMsm(visitor))continue;
    let meta=inferMeta(segment.slice(Math.max(0,rm.index-90000),rm.index));
    if(desc){const needle=norm(`${date} ${time} ${local} ${visitor} ${place}`),di=needle?desc.indexOf(needle):-1;if(di>=0)meta=inferMeta(desc.slice(Math.max(0,di-60000),di))}
    if(!meta)continue;
    matches.push({categoryLabel:meta.categoryLabel,permissionKey:meta.permissionKey,date,time,local,visitor,place,confirmed:/color\s*:\s*#(?:000000|000)\b/i.test(row)});
  }
  const maxDate=allDates.length?new Date(Math.max(...allDates.map(d=>d.getTime()))):null;
  return{matches,maxDate};
}

async function courtrackMatches(config,cutoff){
  const r=await fetch(`${COURTRACK_BASE}/findPartidos?id_torneos=${config.tournamentId}&id_etapas=${config.stageId}`,{headers:{Accept:"application/json"},cache:"no-store"});
  if(!r.ok)return[];
  const payload=await r.json().catch(()=>({}));
  const rows=Array.isArray(payload?.data)?payload.data:[];
  const max= new Date(cutoff.getTime()+12*86400000);
  return rows.filter(row=>{
    const a=norm(row.id_equipo_a),b=norm(row.id_equipo_b);
    if(!config.teams.some(team=>norm(team)===a||norm(team)===b))return false;
    const d=new Date(row.fecha);return row.status==="upcoming"&&!Number.isNaN(d.getTime())&&d.getUTCFullYear()>2000&&d>cutoff&&d<=max;
  }).sort((a,b)=>new Date(a.fecha)-new Date(b.fecha)||Number(a.horario||0)-Number(b.horario||0));
}

async function tentativeFromCourtrack(cutoff){
  const settled=await Promise.allSettled(SCHEDULE_TABLES.map(async config=>{
    const rows=await courtrackMatches(config,cutoff);const row=rows[0];if(!row)return null;
    return{categoryLabel:config.categoryLabel,permissionKey:config.permissionKey,date:displayDate(row.fecha),time:displayTime(row.horario),local:String(row.id_equipo_a||"").trim(),visitor:String(row.id_equipo_b||"").trim(),place:String(row.id_cancha||"").trim()||"Lugar A Confirmar",confirmed:false};
  }));
  return settled.filter(x=>x.status==="fulfilled"&&x.value).map(x=>x.value);
}

async function buildRounds(html){
  const dm=html.match(/<meta\s+name=["']twitter:description["']\s+content=["']([\s\S]*?)["']\s*\/?>/i),description=dm?clean(dm[1]):"";
  const sections=actualRoundSections(html),headers=[...new Set(headerRounds(html))];
  const actual=new Map();
  for(let i=0;i<sections.length;i++){const cur=sections[i],next=sections[i+1];const parsed=parseConfirmedRound(html.slice(cur.index,next?.index||html.length),description);actual.set(cur.round,parsed)}
  const requested=(headers.length?headers:[...actual.keys()]).slice(0,2).sort((a,b)=>a-b);
  if(requested.length<2){const fallback=[...actual.keys()].sort((a,b)=>b-a);for(const n of fallback){if(!requested.includes(n))requested.push(n);if(requested.length===2)break}requested.sort((a,b)=>a-b)}
  let cutoff=null;for(const round of requested){const d=actual.get(round)?.maxDate;if(d&&(!cutoff||d>cutoff))cutoff=d}
  if(!cutoff)cutoff=new Date(Date.now()-86400000);
  const output=[];
  for(const round of requested){
    const found=actual.get(round);
    if(found?.matches?.length){output.push({round,confirmed:found.matches.every(x=>x.confirmed),matches:found.matches});continue}
    const matches=await tentativeFromCourtrack(cutoff);
    output.push({round,confirmed:false,matches});
  }
  return output;
}

export default async function handler(req,res){
  if(req.method!=="GET")return send(res,405,{error:true,message:"Método No Permitido."});
  try{
    const url=`${SOURCE_URL}?_mgsm=${Date.now()}`;
    const r=await fetch(url,{headers:{Accept:"text/html,application/xhtml+xml","User-Agent":"Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36","Cache-Control":"no-cache","Pragma":"no-cache"},cache:"no-store"});
    if(!r.ok)throw new Error(`La Programación FMV Respondió HTTP ${r.status}.`);
    const html=await r.text(),rounds=await buildRounds(html);
    return send(res,200,{error:false,source:"Federación Mendocina De Voleibol",sourceUrl:SOURCE_URL,fetchedAt:new Date().toISOString(),rounds},true);
  }catch(error){return send(res,502,{error:true,message:error?.message||"No Se Pudo Consultar La Programación."})}
}

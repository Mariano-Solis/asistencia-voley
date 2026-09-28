const SOURCE_URL="https://programacionvoley.jimdofree.com/programacion/";
function clean(v=""){return String(v).replace(/&nbsp;/gi," ").replace(/&quot;/gi,'"').replace(/&ordm;/gi,"º").replace(/&amp;/gi,"&").replace(/<br\s*\/?>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}
function norm(v=""){return clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim()}
function team(v){const x=norm(v);return x==="MSM"||x==="MSM B"}
function send(res,status,body,cache=false){res.status(status);res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control",cache?"public, s-maxage=45, stale-while-revalidate=120":"no-store");return res.end(JSON.stringify(body))}
function candidates(html){const out=[],rx=/(\d{1,2})(?:º|&ordm;|°)\s*FECHA/gi;let m;while((m=rx.exec(html))){const round=Number(m[1]),index=m.index,after=html.slice(index,index+20000);if(Number.isInteger(round)&&/<table\b/i.test(after)&&/MAYORES[\s\S]{0,2500}?(?:NIVEL\s*I|NIVEL\s*1)/i.test(after))out.push({round,index})}const map=new Map();for(const x of out){const c=map.get(x.round);if(!c||x.index>c.index)map.set(x.round,x)}return[...map.values()].sort((a,b)=>a.index-b.index)}
function meta(h,b,c){const t=norm(h);if(t.includes("MASCULINO"))b="male";if(t.includes("FEMENINO"))b="female";if(t.includes("MASTER A"))return{branch:"female",competition:"master",permissionKey:"female:master:master_a",categoryLabel:"Master A"};if(t.includes("MASTER C"))return{branch:"female",competition:"master",permissionKey:"female:master:master_c",categoryLabel:"Master C"};if(t.includes("NIVEL III")||t.includes("NIVEL 3"))c="level3";else if(t.includes("NIVEL II")||t.includes("NIVEL 2"))c="level2";else if(t.includes("NIVEL I")||t.includes("NIVEL 1"))c="level1";let k="";if(t.includes("MAYORES"))k="mayores";else if(t.includes("SUB 12"))k="sub12";else if(t.includes("SUB 14"))k="sub14";else if(t.includes("SUB 16"))k="sub16";else if(t.includes("SUB 18"))k="sub18";if(!k)return{branch:b,competition:c,permissionKey:"",categoryLabel:""};if(c==="level3"&&b==="female"){if(k==="sub12")return{branch:b,competition:c,permissionKey:"female:level3:sub12",categoryLabel:"Sub 12 Femenino · Nivel 3"};if(k==="sub14"){const z=t.includes("ZONA A")||t.includes('ZONA "A"')?"A":t.includes("ZONA B")||t.includes('ZONA "B"')?"B":"";if(z)return{branch:b,competition:c,permissionKey:`female:level3:sub14${z.toLowerCase()}`,categoryLabel:`Sub 14 Femenino · Nivel 3 · Zona ${z}`}}return{branch:b,competition:c,permissionKey:"",categoryLabel:""}}if(c!=="level1")return{branch:b,competition:c,permissionKey:"",categoryLabel:""};const base=k==="mayores"?"Primera":k.replace("sub","Sub ");return{branch:b,competition:c,permissionKey:`${b}:level1:${k}`,categoryLabel:`${base} ${b==="female"?"Femenino":"Masculino"}`}}
function parseRound(segment){
  const out=[];
  const rowRx=/<tr\b[\s\S]*?<\/tr>/gi;
  let rowMatch, branch="male", competition="level1", current={permissionKey:"",categoryLabel:"",branch:"male",competition:"level1"}, previousEnd=0;

  while((rowMatch=rowRx.exec(segment))){
    const between=norm(segment.slice(previousEnd,rowMatch.index));
    const row=rowMatch[0];
    const cells=[...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>clean(x[1]));
    const rowText=norm(cells.join(" "));
    const context=`${between} ${rowText}`;
    const lastFem=context.lastIndexOf("FEMENINO");
    const lastMasc=context.lastIndexOf("MASCULINO");
    if(lastFem>=0||lastMasc>=0) branch=lastFem>lastMasc?"female":"male";
    if(context.includes("MASTER")) competition="master";

    const firstCell=String(cells[0]||"").trim();
    const isData=/^\d{1,2}(?:[-/][A-Za-zÁÉÍÓÚáéíóú0-9]+){1,2}$/.test(firstCell);
    const looksLikeHeading =
      !isData &&
      (
        rowText.includes("MAYORES") ||
        rowText.includes("SUB 12") ||
        rowText.includes("SUB 14") ||
        rowText.includes("SUB 16") ||
        rowText.includes("SUB 18") ||
        rowText.includes("MASTER A") ||
        rowText.includes("MASTER B") ||
        rowText.includes("MASTER C") ||
        rowText.includes("MASTER D") ||
        rowText.includes("MASTER E")
      );

    if(looksLikeHeading){
      const next=meta(rowText,branch,competition);
      branch=next.branch||branch;
      competition=next.competition||competition;
      current=next;
      previousEnd=rowRx.lastIndex;
      continue;
    }

    if(cells.length>=5 && isData && current.permissionKey){
      const [date,time,local,visitor,place]=cells;
      if(team(local)||team(visitor)){
        out.push({
          categoryLabel:current.categoryLabel,
          permissionKey:current.permissionKey,
          branch:current.branch,
          competition:current.competition,
          date:String(date||"").trim(),
          time:String(time||"").trim(),
          local:String(local||"").trim(),
          visitor:String(visitor||"").trim(),
          place:String(place||"").trim(),
          confirmed:/color\s*:\s*#(?:000000|000)\b/i.test(row)
        });
      }
    }

    previousEnd=rowRx.lastIndex;
  }
  return out;
}
function parse(html){const c=candidates(html);if(!c.length)throw new Error("No Se Encontraron Fechas Del Torneo Clausura.");const nums=[...new Set(c.map(x=>x.round))].sort((a,b)=>b-a).slice(0,2).sort((a,b)=>a-b);return nums.map(round=>{const cur=c.filter(x=>x.round===round).sort((a,b)=>b.index-a.index)[0],next=c.find(x=>x.index>cur.index),matches=parseRound(html.slice(cur.index,next?.index||html.length));return{round,confirmed:matches.length>0&&matches.every(x=>x.confirmed),matches}})}
export default async function handler(req,res){if(req.method!=="GET")return send(res,405,{error:true,message:"Método No Permitido."});try{const r=await fetch(SOURCE_URL,{headers:{Accept:"text/html,application/xhtml+xml"},cache:"no-store"});if(!r.ok)throw new Error(`La Programación FMV Respondió HTTP ${r.status}.`);const html=await r.text();return send(res,200,{error:false,source:"Federación Mendocina De Voleibol",sourceUrl:SOURCE_URL,fetchedAt:new Date().toISOString(),rounds:parse(html)},true)}catch(error){return send(res,502,{error:true,message:error?.message||"No Se Pudo Consultar La Programación."})}}
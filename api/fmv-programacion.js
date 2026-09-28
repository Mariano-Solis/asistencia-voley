const SOURCE_URL="https://programacionvoley.jimdofree.com/programacion/";
function clean(v=""){return String(v).replace(/&nbsp;/gi," ").replace(/&quot;/gi,'"').replace(/&ordm;/gi,"º").replace(/&amp;/gi,"&").replace(/<br\s*\/?>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}
function norm(v=""){return clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim()}
function team(v){const x=norm(v);return x==="MSM"||x==="MSM B"}
function send(res,status,body,cache=false){res.status(status);res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control",cache?"public, s-maxage=45, stale-while-revalidate=120":"no-store");return res.end(JSON.stringify(body))}
function candidates(html){
  const out=[],rx=/(\d{1,2})(?:º|&ordm;|°)\s*FECHA/gi;let m;
  while((m=rx.exec(html))){
    const round=Number(m[1]),index=m.index;
    const before=norm(html.slice(Math.max(0,index-8000),index));
    const marker=before.lastIndexOf("TORNEO CLAUSURA");
    const markerDistance=marker>=0?before.length-(marker+"TORNEO CLAUSURA".length):Number.POSITIVE_INFINITY;
    const after=html.slice(index,index+30000);
    if(Number.isInteger(round)&&markerDistance<=250&&/<table\b/i.test(after))out.push({round,index});
  }
  const map=new Map();
  for(const x of out){const c=map.get(x.round);if(!c||x.index>c.index)map.set(x.round,x)}
  return[...map.values()].sort((a,b)=>a.index-b.index);
}
function meta(h,b,c){const t=norm(h);if(t.includes("MASCULINO"))b="male";if(t.includes("FEMENINO"))b="female";if(t.includes("MASTER A"))return{branch:"female",competition:"master",permissionKey:"female:master:master_a",categoryLabel:"Master A"};if(t.includes("MASTER C"))return{branch:"female",competition:"master",permissionKey:"female:master:master_c",categoryLabel:"Master C"};if(t.includes("NIVEL III")||t.includes("NIVEL 3"))c="level3";else if(t.includes("NIVEL II")||t.includes("NIVEL 2"))c="level2";else if(t.includes("NIVEL I")||t.includes("NIVEL 1"))c="level1";let k="";if(t.includes("MAYORES"))k="mayores";else if(t.includes("SUB 12"))k="sub12";else if(t.includes("SUB 14"))k="sub14";else if(t.includes("SUB 16"))k="sub16";else if(t.includes("SUB 18"))k="sub18";if(!k)return{branch:b,competition:c,permissionKey:"",categoryLabel:""};if(c==="level3"&&b==="female"){if(k==="sub12")return{branch:b,competition:c,permissionKey:"female:level3:sub12",categoryLabel:"Sub 12 Femenino · Nivel 3"};if(k==="sub14"){const z=t.includes("ZONA A")||t.includes('ZONA "A"')?"A":t.includes("ZONA B")||t.includes('ZONA "B"')?"B":"";if(z)return{branch:b,competition:c,permissionKey:`female:level3:sub14${z.toLowerCase()}`,categoryLabel:`Sub 14 Femenino · Nivel 3 · Zona ${z}`}}return{branch:b,competition:c,permissionKey:"",categoryLabel:""}}if(c!=="level1")return{branch:b,competition:c,permissionKey:"",categoryLabel:""};const base=k==="mayores"?"Primera":k.replace("sub","Sub ");return{branch:b,competition:c,permissionKey:`${b}:level1:${k}`,categoryLabel:`${base} ${b==="female"?"Femenino":"Masculino"}`}}
function inferMetaFromPrefix(raw){
  const text=norm(raw);
  const headings=[...text.matchAll(/MASTER\s+[A-E]|MAYORES(?:\s+NIVEL\s+(?:III|II|I|3|2|1))?|SUB\s+(?:12|14|16|18)(?:\s+NIVEL\s+(?:III|II|I|3|2|1))?/g)];
  if(!headings.length)return{permissionKey:"",categoryLabel:"",branch:"male",competition:"level1"};
  const last=headings[headings.length-1],heading=last[0],headingIndex=last.index||0;
  const lastFem=text.lastIndexOf("FEMENINO");
  const lastMasc=text.lastIndexOf("MASCULINO");
  const branch=lastFem>lastMasc?"female":"male";

  if(heading.startsWith("MASTER ")){
    if(heading==="MASTER A")return{branch:"female",competition:"master",permissionKey:"female:master:master_a",categoryLabel:"Master A"};
    if(heading==="MASTER C")return{branch:"female",competition:"master",permissionKey:"female:master:master_c",categoryLabel:"Master C"};
    return{branch:"female",competition:"master",permissionKey:"",categoryLabel:""};
  }

  let level="";
  const ownLevel=heading.match(/NIVEL\s+(III|II|I|3|2|1)/);
  if(ownLevel)level=ownLevel[1];
  else{
    const prior=[...text.slice(0,headingIndex).matchAll(/NIVEL\s+(III|II|I|3|2|1)/g)];
    level=prior.length?prior[prior.length-1][1]:"I";
  }
  const competition=(level==="III"||level==="3")?"level3":(level==="II"||level==="2")?"level2":"level1";

  let category="";
  if(heading.startsWith("MAYORES"))category="mayores";
  else if(heading.startsWith("SUB 12"))category="sub12";
  else if(heading.startsWith("SUB 14"))category="sub14";
  else if(heading.startsWith("SUB 16"))category="sub16";
  else if(heading.startsWith("SUB 18"))category="sub18";
  if(!category)return{branch,competition,permissionKey:"",categoryLabel:""};

  if(competition==="level3"&&branch==="female"){
    if(category==="sub12")return{branch,competition,permissionKey:"female:level3:sub12",categoryLabel:"Sub 12 Femenino · Nivel 3"};
    if(category==="sub14"){
      const tail=text.slice(headingIndex);
      const zone=tail.includes('ZONA "A"')||tail.includes("ZONA A")?"A":tail.includes('ZONA "B"')||tail.includes("ZONA B")?"B":"";
      if(zone)return{branch,competition,permissionKey:`female:level3:sub14${zone.toLowerCase()}`,categoryLabel:`Sub 14 Femenino · Nivel 3 · Zona ${zone}`};
    }
    return{branch,competition,permissionKey:"",categoryLabel:""};
  }
  if(competition!=="level1")return{branch,competition,permissionKey:"",categoryLabel:""};
  const label=category==="mayores"?"Primera":category.replace("sub","Sub ");
  return{branch,competition,permissionKey:`${branch}:level1:${category}`,categoryLabel:`${label} ${branch==="female"?"Femenino":"Masculino"}`};
}

function parseRound(segment,description=""){
  const out=[];
  const rowRx=/<tr\b[\s\S]*?<\/tr>/gi;
  let rowMatch;
  const desc=norm(description);

  while((rowMatch=rowRx.exec(segment))){
    const row=rowMatch[0];
    const cells=[...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>clean(x[1]));
    if(cells.length<5)continue;
    const [date,time,local,visitor,place]=cells;
    if(!/^\d{1,2}(?:[-/][A-Za-zÁÉÍÓÚáéíóú0-9]+){1,2}$/.test(String(date||"").trim()))continue;
    if(!team(local)&&!team(visitor))continue;

    let m=inferMetaFromPrefix(segment.slice(Math.max(0,rowMatch.index-60000),rowMatch.index));
    if(desc){
      const needle=norm(`${date} ${time} ${local} ${visitor} ${place}`);
      const idx=needle?desc.indexOf(needle):-1;
      if(idx>=0)m=inferMetaFromPrefix(desc.slice(Math.max(0,idx-60000),idx));
    }
    if(!m.permissionKey)continue;

    out.push({
      categoryLabel:m.categoryLabel,
      permissionKey:m.permissionKey,
      branch:m.branch,
      competition:m.competition,
      date:String(date||"").trim(),
      time:String(time||"").trim(),
      local:String(local||"").trim(),
      visitor:String(visitor||"").trim(),
      place:String(place||"").trim(),
      confirmed:/color\s*:\s*#(?:000000|000)\b/i.test(row)
    });
  }
  return out;
}
function parse(html){
  const c=candidates(html);
  if(!c.length)throw new Error("No Se Encontraron Fechas Del Torneo Clausura.");
  const descriptionMatch=html.match(/<meta\s+name=["']twitter:description["']\s+content=["']([\s\S]*?)["']\s*\/?>/i);
  const description=descriptionMatch?clean(descriptionMatch[1]):"";
  const nums=[...new Set(c.map(x=>x.round))].sort((a,b)=>b-a).slice(0,2).sort((a,b)=>a-b);
  return nums.map(round=>{
    const cur=c.filter(x=>x.round===round).sort((a,b)=>b.index-a.index)[0];
    const next=c.find(x=>x.index>cur.index);
    const matches=parseRound(html.slice(cur.index,next?.index||html.length),description);
    return{round,confirmed:matches.length>0&&matches.every(x=>x.confirmed),matches};
  });
}
export default async function handler(req,res){
  if(req.method!=="GET")return send(res,405,{error:true,message:"Método No Permitido."});
  try{
    const r=await fetch(SOURCE_URL,{headers:{Accept:"text/html,application/xhtml+xml"},cache:"no-store"});
    if(!r.ok)throw new Error(`La Programación FMV Respondió HTTP ${r.status}.`);
    const html=await r.text();

    if(String(req.query?.debug||"")==="1"){
      const c=candidates(html);
      const allHeadings=[...html.matchAll(/(\d{1,2})(?:º|&ordm;|°)\s*FECHA/gi)].map(m=>({
        round:Number(m[1]),
        index:m.index,
        before:clean(html.slice(Math.max(0,m.index-800),m.index)).slice(-500),
        after:clean(html.slice(m.index,m.index+1200)).slice(0,800),
        raw:html.slice(Math.max(0,m.index-500),m.index+700)
      })).filter(x=>x.round===8||x.round===9);
      const dm=html.match(/<meta\s+name=["']twitter:description["']\s+content=["']([\s\S]*?)["']\s*\/?>/i);
      const desc=dm?clean(dm[1]):"";
      const nd=norm(desc);
      const debug=c.map(cur=>{
        const next=c.find(x=>x.index>cur.index);
        const seg=html.slice(cur.index,next?.index||html.length);
        const rows=[];
        for(const rm of seg.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)){
          const cells=[...rm[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>clean(x[1]));
          if(cells.length<5)continue;
          const [date,time,local,visitor,place]=cells;
          if(!team(local)&&!team(visitor))continue;
          const needle=norm(`${date} ${time} ${local} ${visitor} ${place}`);
          const di=needle?nd.indexOf(needle):-1;
          rows.push({
            cells,
            di,
            htmlMeta:inferMetaFromPrefix(seg.slice(Math.max(0,rm.index-60000),rm.index)),
            descMeta:di>=0?inferMetaFromPrefix(nd.slice(Math.max(0,di-60000),di)):null
          });
        }
        return{round:cur.round,index:cur.index,rowCount:rows.length,rows:rows.slice(0,30)};
      });
      return send(res,200,{candidates:c,allHeadings,descLength:nd.length,debug});
    }

    return send(res,200,{error:false,source:"Federación Mendocina De Voleibol",sourceUrl:SOURCE_URL,fetchedAt:new Date().toISOString(),rounds:parse(html)},true);
  }catch(error){
    return send(res,502,{error:true,message:error?.message||"No Se Pudo Consultar La Programación."});
  }
}

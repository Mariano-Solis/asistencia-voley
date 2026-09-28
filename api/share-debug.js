function clean(v=""){return String(v).replace(/&nbsp;/gi," ").replace(/&quot;/gi,'"').replace(/&ordm;/gi,"º").replace(/<br\s*\/?>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}
export default async function handler(req,res){
  const r=await fetch("https://programacionvoley.jimdofree.com/programacion/",{headers:{"User-Agent":"Mozilla/5.0"},cache:"no-store"});
  const html=await r.text();
  const hits=[...html.matchAll(/9(?:º|&ordm;|°)\s*FECHA/gi)].map(m=>m.index);
  const start=Math.max(...hits);
  const hit8=[...html.matchAll(/8(?:º|&ordm;|°)\s*FECHA/gi)].map(m=>m.index).filter(x=>x>start);
  const end=hit8.length?Math.max(...hit8):html.length;
  const seg=html.slice(start,end);
  const rows=[...seg.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].slice(0,80).map((m,i)=>{
    const cells=[...m[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>clean(x[1]));
    return {i,cells,text:clean(m[0]),black:/color\s*:\s*#(?:000000|000)\b/i.test(m[0])};
  });
  res.status(200).json({hits,start,end,rows});
}
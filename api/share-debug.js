function strip(html){
  return html.replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/g," ")
    .replace(/&quot;/g,'"')
    .replace(/&ordm;/g,"º")
    .replace(/\s+/g," ")
    .trim();
}
export default async function handler(req,res){
  try{
    const r=await fetch("https://share.google/96trGNCE0FGN0YfVn",{redirect:"follow",headers:{"User-Agent":"Mozilla/5.0"}});
    const html=await r.text();
    const headings=[...html.matchAll(/(?:8|9)(?:º|&ordm;|°)\s*FECHA/gi)].map(m=>({match:m[0],index:m.index}));
    const snippets=headings.map((h,i)=>{
      const start=Math.max(0,h.index-2500);
      const end=Math.min(html.length,(headings[i+1]?.index||h.index+50000));
      const segment=html.slice(start,end);
      const msmRows=[...segment.matchAll(/<tr[\s\S]*?<\/tr>/gi)]
        .map(m=>m[0])
        .filter(row=>/\bMSM(?:\s+B)?\b/i.test(strip(row)))
        .slice(0,20)
        .map(row=>({text:strip(row),html:row.slice(0,4000)}));
      return {heading:h.match,plain:strip(segment).slice(0,12000),msmRows};
    });
    res.status(200).json({url:r.url,headings,snippets});
  }catch(error){
    res.status(500).json({error:String(error?.message||error)});
  }
}
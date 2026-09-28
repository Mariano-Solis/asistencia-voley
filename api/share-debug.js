export default async function handler(req,res){
  try{
    const r=await fetch("https://share.google/96trGNCE0FGN0YfVn",{redirect:"follow",headers:{"User-Agent":"Mozilla/5.0"}});
    const text=await r.text();
    res.status(200).json({status:r.status,url:r.url,contentType:r.headers.get("content-type"),text:text.slice(0,250000)});
  }catch(error){
    res.status(500).json({error:String(error?.message||error)});
  }
}
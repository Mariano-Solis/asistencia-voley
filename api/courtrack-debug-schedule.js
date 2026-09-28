const BASE="https://api.courtrack.com/api/torneo";
export default async function handler(req,res){
  const path=String(req.query.path||"findPartidos");
  const params=new URLSearchParams();
  for(const [k,v] of Object.entries(req.query||{})){
    if(k!=="path") params.set(k,String(v));
  }
  const url=`${BASE}/${path}?${params.toString()}`;
  try{
    const r=await fetch(url,{headers:{Accept:"application/json"},cache:"no-store"});
    const text=await r.text();
    res.status(200).json({upstreamStatus:r.status,url,data:text.slice(0,200000)});
  }catch(error){
    res.status(500).json({error:String(error?.message||error),url});
  }
}
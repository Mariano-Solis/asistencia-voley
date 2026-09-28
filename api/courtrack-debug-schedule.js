const BASE="https://api.courtrack.com/api/torneo";
export default async function handler(req,res){
  const tests=[
    ["sub16m","/findPartidos?id_torneos=895"],
    ["sub14n3","/findPartidos?id_torneos=913"],
    ["masterA","/findPartidos?id_torneos=886"]
  ];
  const out={};
  for(const [name,path] of tests){
    try{
      const r=await fetch(BASE+path,{headers:{Accept:"application/json"},cache:"no-store"});
      const text=await r.text();
      out[name]={status:r.status,data:text.slice(0,120000)};
    }catch(error){
      out[name]={error:String(error?.message||error)};
    }
  }
  res.status(200).json(out);
}
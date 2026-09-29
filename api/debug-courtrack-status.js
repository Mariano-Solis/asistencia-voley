const BASE="https://api.courtrack.com/api/torneo";
const tables=[
["male:level1:mayores",893,3636,["MSM"]],
["male:level1:sub18",894,3637,["MSM"]],
["male:level1:sub16",895,3638,["MSM"]],
["male:level1:sub14",896,3639,["MSM"]],
["female:level1:mayores",901,3644,["MSM"]],
["female:level1:sub18",900,3643,["MSM"]],
["female:level1:sub16",899,3642,["MSM"]],
["female:level1:sub14",898,3641,["MSM"]],
["female:level1:sub12",897,3640,["MSM"]],
["female:level3:sub14b",913,3692,["MSM B"]],
["female:level3:sub12",915,3694,["MSM B"]],
["female:master:master_a",886,3626,["MSM"]],
["female:master:master_c",888,3628,["MSM B"]],
];
const n=v=>String(v||"").trim().toUpperCase();
export default async function handler(req,res){
 const today=new Date(); today.setUTCHours(0,0,0,0);
 const rows=[];
 for(const [key,t,s,teams] of tables){
   const r=await fetch(`${BASE}/findPartidos?id_torneos=${t}&id_etapas=${s}`,{headers:{Accept:"application/json"},cache:"no-store"});
   const p=await r.json().catch(()=>({}));
   for(const x of Array.isArray(p.data)?p.data:[]){
     if(!teams.some(team=>[n(x.id_equipo_a),n(x.id_equipo_b)].includes(n(team)))) continue;
     const d=new Date(x.fecha);
     const valid=!Number.isNaN(d.getTime())&&d.getUTCFullYear()>2000;
     rows.push({key,id:x.id,status:x.status,fecha:x.fecha,valid,past:valid&&d<today,a:x.id_equipo_a,b:x.id_equipo_b,cancha:x.id_cancha,horario:x.horario});
   }
 }
 res.status(200).json({
   totals:{
     all:rows.length,
     played:rows.filter(x=>x.status==="played").length,
     upcoming:rows.filter(x=>x.status==="upcoming").length,
     upcomingPast:rows.filter(x=>x.status==="upcoming"&&x.past).length,
     upcomingUndated:rows.filter(x=>x.status==="upcoming"&&!x.valid).length,
     upcomingFuture:rows.filter(x=>x.status==="upcoming"&&x.valid&&!x.past).length
   },
   upcomingPast:rows.filter(x=>x.status==="upcoming"&&x.past),
   upcomingUndated:rows.filter(x=>x.status==="upcoming"&&!x.valid),
   upcomingFuture:rows.filter(x=>x.status==="upcoming"&&x.valid&&!x.past)
 });
}
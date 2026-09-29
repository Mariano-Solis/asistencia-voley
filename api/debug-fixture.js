const BASE="https://api.courtrack.com/api/torneo";
const tests=[
  {name:"fem-primera",t:901,s:3644,team:["MSM"]},
  {name:"fem-sub18",t:900,s:3643,team:["MSM"]},
  {name:"masc-primera",t:893,s:3636,team:["MSM"]},
  {name:"n3-sub12",t:915,s:3694,team:["MSM B"]},
  {name:"master-a",t:886,s:3626,team:["MSM"]},
  {name:"master-c",t:888,s:3628,team:["MSM B"]}
];
function n(v){return String(v||"").trim().toUpperCase()}
export default async function handler(req,res){
 const out={};
 for(const x of tests){
  const r=await fetch(`${BASE}/findPartidos?id_torneos=${x.t}&id_etapas=${x.s}`,{headers:{Accept:"application/json"},cache:"no-store"});
  const p=await r.json().catch(()=>({}));
  out[x.name]=(Array.isArray(p.data)?p.data:[]).filter(row=>x.team.some(t=>[n(row.id_equipo_a),n(row.id_equipo_b)].includes(n(t)))).map(row=>({id:row.id,fecha:row.fecha,horario:row.horario,a:row.id_equipo_a,b:row.id_equipo_b,cancha:row.id_cancha,status:row.status,fecha_nro:row.fecha_nro||row.numero_fecha||row.nro_fecha||null}));
 }
 res.status(200).json(out);
}
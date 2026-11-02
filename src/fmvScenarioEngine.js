// Pure, side-effect-free scenario engine. Never writes official standings.
export const VOLLEY_RESULTS = Object.freeze([[3,0],[3,1],[3,2],[2,3],[1,3],[0,3]]);
export function matchPoints(homeSets, awaySets) {
  const h=Number(homeSets),a=Number(awaySets);
  if (!VOLLEY_RESULTS.some(([x,y])=>x===h&&y===a)) throw new Error("Resultado de sets inválido");
  return h===3 ? [a===2?2:3,a===2?1:0] : [h===2?1:0,h===2?2:3];
}
export function projectStandings(standings, fixtures, predictions, rules={}) {
  const table=new Map(standings.map(team=>[String(team.id),{...team,points:Number(team.points||0),played:Number(team.played||0),won:Number(team.won||0),lost:Number(team.lost||0),setsFor:Number(team.setsFor||0),setsAgainst:Number(team.setsAgainst||0)}]));
  for(const fixture of fixtures) {
    const result=predictions[String(fixture.id)];
    if(!result)continue;
    const home=table.get(String(fixture.homeId)),away=table.get(String(fixture.awayId));
    if(!home||!away)throw new Error("Equipo no encontrado en la tabla");
    const [hp,ap]=matchPoints(result.homeSets,result.awaySets);
    home.points+=hp;away.points+=ap;home.played++;away.played++;
    home.won+=hp>ap?1:0;away.won+=ap>hp?1:0;
    home.lost+=hp<ap?1:0;away.lost+=ap<hp?1:0;
    home.setsFor+=Number(result.homeSets);home.setsAgainst+=Number(result.awaySets);
    away.setsFor+=Number(result.awaySets);away.setsAgainst+=Number(result.homeSets);
  }
  const comparator=rules.compare || ((a,b)=>b.points-a.points||(b.setsFor-b.setsAgainst)-(a.setsFor-a.setsAgainst)||String(a.id).localeCompare(String(b.id)));
  return [...table.values()].sort(comparator).map((team,index)=>({...team,position:index+1}));
}
// Exhaustive multi-team optimization for bounded fixtures. Report incomplete searches explicitly.
export function searchScenarios({standings,fixtures,objective,limit=100000,rules={}}) {
  if(typeof objective!=="function")throw new Error("Se requiere una función objetivo");
  const total=6**fixtures.length;
  if(!Number.isFinite(total)||total>limit)return {complete:false,total,reason:"Demasiadas combinaciones para una búsqueda exhaustiva",best:null,worst:null};
  let best=null,worst=null,checked=0;
  const predictions={};
  function visit(index) {
    if(index===fixtures.length){
      const table=projectStandings(standings,fixtures,predictions,rules);
      const value=objective(table);
      if(!Number.isFinite(value))throw new Error("Objetivo inválido");
      const candidate={value,table,predictions:{...predictions}};
      if(!best||value>best.value)best=candidate;
      if(!worst||value<worst.value)worst=candidate;
      checked++;return;
    }
    const fixture=fixtures[index];
    for(const [homeSets,awaySets] of VOLLEY_RESULTS){
      predictions[String(fixture.id)]={homeSets,awaySets};
      visit(index+1);
    }
    delete predictions[String(fixture.id)];
  }
  visit(0);
  return {complete:true,total,checked,best,worst};
}
export function positionObjective(teamIds,{favor=[],oppose=[]}={}) {
  const favored=new Set(favor.map(String)),opposed=new Set(oppose.map(String));
  return table=>table.reduce((score,team)=>{
    const id=String(team.id);
    return score+(favored.has(id)?teamIds.length-team.position:0)-(opposed.has(id)?teamIds.length-team.position:0);
  },0);
}

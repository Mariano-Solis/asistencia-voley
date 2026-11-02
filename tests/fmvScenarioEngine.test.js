import test from 'node:test';
import assert from 'node:assert/strict';
import {matchPoints,projectStandings,searchScenarios,positionObjective} from '../src/fmvScenarioEngine.js';
test('all six legal outcomes distribute three points',()=>{
  assert.deepEqual(matchPoints(3,0),[3,0]);
  assert.deepEqual(matchPoints(3,2),[2,1]);
  assert.deepEqual(matchPoints(2,3),[1,2]);
  assert.throws(()=>matchPoints(2,2));
});
test('predictions do not mutate official table',()=>{
  const standings=[{id:'A',points:0},{id:'B',points:0}];
  const fixtures=[{id:'m1',homeId:'A',awayId:'B'}];
  const projected=projectStandings(standings,fixtures,{m1:{homeSets:3,awaySets:2}});
  assert.equal(projected.find(t=>t.id==='A').points,2);
  assert.equal(projected.find(t=>t.id==='B').points,1);
  assert.equal(standings[0].points,0);
});
test('exhaustive optimizer searches all six outcomes and handles opposing goals',()=>{
  const standings=[{id:'A',points:0},{id:'B',points:0}];
  const fixtures=[{id:'m1',homeId:'A',awayId:'B'}];
  const objective=positionObjective(['A','B'],{favor:['A'],oppose:['B']});
  const result=searchScenarios({standings,fixtures,objective});
  assert.equal(result.complete,true);
  assert.equal(result.checked,6);
  assert.equal(result.best.table[0].id,'A');
  assert.equal(result.worst.table[0].id,'B');
});
test('large search explicitly reports incomplete',()=>{
  const fixtures=Array.from({length:8},(_,i)=>({id:String(i),homeId:'A',awayId:'B'}));
  const result=searchScenarios({standings:[{id:'A'},{id:'B'}],fixtures,objective:()=>0,limit:1000});
  assert.equal(result.complete,false);
});

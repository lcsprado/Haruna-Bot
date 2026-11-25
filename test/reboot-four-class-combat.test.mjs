import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Imports dinâmicos: PVP_AWAKENING_ROLES é selecionado no carregamento do módulo.
const previous=process.env.ALPHA_REBOOT_MODE;
process.env.ALPHA_REBOOT_MODE='classes_only';
const {auditFourClasses,buildClassFighter,compileClassDuel}=await import('../scripts/reboot-four-class-combat.mjs');
const source=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
test('auditoria V2 usa quatro classes, quinze cenários e lado alternado',()=>{
 const r=auditFourClasses(source,{duelsPerOrder:20});
 assert.equal(r.scenarios.length,15);assert.equal(r.battles,3600);
 for(const s of r.scenarios){assert.equal(s.pairs.length,6);
  assert.equal(s.battles,240);assert.ok(Object.values(s.rates).every(x=>x>=0&&x<=100));}
 assert.ok(Number.isInteger(r.flagged)); // incluindo duelos hipotéticos abaixo do nível permitido
});
test('atributos equivalentes respeitam papel das quatro classes e evolução',()=>{
 const p=buildClassFighter('paladin',100,5,'none'),b=buildClassFighter('berserker',100,5,'none');
 const s=buildClassFighter('samurai',100,5,'none');
 assert.ok(p.hp>b.hp);assert.ok(p.def>b.def);assert.ok(b.atk>p.atk);assert.ok(s.spd>b.spd);
 assert.ok(buildClassFighter('paladin',100,5,'gear').hp>p.hp);
 assert.throws(()=>buildClassFighter('pecado_ban',100,5,'none'),/inválido/);
});
test.after(()=>{if(previous===undefined)delete process.env.ALPHA_REBOOT_MODE;else process.env.ALPHA_REBOOT_MODE=previous});

test('V2: níveis liberados e estágios incompletos passam em duas sementes determinísticas',()=>{
 for(const seed of [11827341,88209117]){
  const r=auditFourClasses(source,{eligibleOnly:true,duelsPerOrder:seed===11827341?70:180,seed});
  assert.equal(r.scenarios.length,78);
  assert.equal(r.flagged,0,JSON.stringify(r.scenarios.filter(x=>x.flagged)));
 }
});
test('proteção simétrica e ajuste exclusivo de dano V2 sem alterar V1 ou Despertar V',async()=>{
 const {assertV2PvpAccess,v2PvpDamageAdjustment}=await import('../src/neon/reboot-combat-progression.js');
 assert.throws(()=>assertV2PvpAccess(20,21),/Lv.21/);
 assert.throws(()=>assertV2PvpAccess(21,20),/Lv.21/);
 assert.equal(assertV2PvpAccess(21,21),true);
 assert.equal(assertV2PvpAccess(1,21,{enabled:false}),true);
 assert.equal(v2PvpDamageAdjustment(1000,'samurai',4),975);
 assert.equal(v2PvpDamageAdjustment(1000,'necromancer',1),1020);
 assert.equal(v2PvpDamageAdjustment(1000,'paladin',2),1020);
 for(const id of ['paladin','necromancer','samurai','berserker']){
  assert.equal(v2PvpDamageAdjustment(1000,id,5),1000);
  assert.equal(v2PvpDamageAdjustment(1000,id,1,true,{enabled:false}),1000);
  assert.equal(v2PvpDamageAdjustment(1000,id,1,false),1000);
 }
 assert.match(source,/assertV2PvpAccess\(au\?\.level,bu\?\.level\)/);
 const start=source.indexOf('export async function battle(');
 assert.ok(source.indexOf('assertV2PvpAccess(au',start)<source.indexOf('claimCooldown(client',start));
});

test('política de counters V2 é moderada, direcional e não afeta V1 ou heróis',async()=>{
 const {pvpDefenseCoefficient,v2PvpMatchupAdjustment}=await import('../src/neon/pvp-equipment-counter-policy.js')
 const f=(classId,awakeningStage=3)=>({classId,awakeningStage,classApplied:true})
 assert.equal(pvpDefenseCoefficient(true),.50)
 assert.equal(pvpDefenseCoefficient(false),.45)
 assert.equal(pvpDefenseCoefficient(true,f('paladin',2),f('samurai',2)),.475)
 assert.equal(pvpDefenseCoefficient(true,f('paladin'),f('samurai')),.50)
 assert.ok(Math.abs(v2PvpMatchupAdjustment(f('paladin',2),f('samurai',2),true)-.0175)<1e-9)
 assert.equal(v2PvpMatchupAdjustment(f('paladin'),f('samurai'),true),.025)
 assert.equal(v2PvpMatchupAdjustment(f('berserker'),f('paladin',5),true),.09)
 assert.equal(v2PvpMatchupAdjustment(f('berserker'),f('paladin',4),true),0)
 assert.equal(v2PvpMatchupAdjustment(f('paladin'),f('necromancer'),true),0)
 assert.equal(v2PvpMatchupAdjustment(f('paladin'),f('samurai'),false),0)
 assert.equal(v2PvpMatchupAdjustment({...f('paladin'),heroId:'hero'},f('samurai'),true),0)
 assert.equal(v2PvpMatchupAdjustment({...f('paladin'),classApplied:false},f('samurai'),true),0)
})
test('equipamento 25% superior prevalece contra os counters; quatro classes sem dominância',()=>{
 const duel=compileClassDuel(source),ids=['paladin','samurai','necromancer','berserker']
 function randomFor(seed){let x=seed>>>0;return ()=>{x=(x+0x6d2b79f5)>>>0;let y=Math.imul(x^(x>>>15),1|x);y^=y+Math.imul(y^(y>>>7),61|y);return ((y^(y>>>14))>>>0)/4294967296}}
 for(const [level,stage] of [[21,0],[25,1],[50,3],[75,4],[100,3],[100,5]]){
  const wins=Object.fromEntries(ids.map(id=>[id,0]))
  let betterWins=0,totalBetter=0
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
   const a=ids[i],b=ids[j];let winsA=0
   for(let n=0;n<400;n++){
    const seed=991000+n,run=(ga,gb)=>duel(buildClassFighter(a,level,stage,'gear',ga),buildClassFighter(b,level,stage,'gear',gb),randomFor(seed)).winner
    const winner=run(1,1);wins[winner]++;winsA+=Number(winner===a)
    betterWins+=Number(run(1.25,1)===a)+Number(run(1,1.25)===b);totalBetter+=2
   }
   assert.ok(winsA/400>=.28&&winsA/400<=.72,`Confronto desequilibrado: ${level}/${stage} ${a}/${b} ${winsA/400}`)
  }
  assert.ok(betterWins/totalBetter>=.75,`Equipamento não prevalece: ${level}/${stage} ${betterWins/totalBetter}`)
  for(const id of ids)assert.ok(wins[id]/1200>=.35&&wins[id]/1200<=.65,`Classe desequilibrada: ${level}/${stage} ${id}`)
 }
})

test('V2: habilidades ativam durante duelos curtos sem inflar os bônus',async()=>{
 const {classPvpAttack,classPvpDefense}=await import('../src/neon/pvp-class-powers.js')
 const attack=(id,stage,idx,extra={})=>classPvpAttack({classId:id,awakeningStage:stage,attackIndex:idx,damage:200,hp:400,maxHp:1000,roll:.5,...extra})
 const pal=attack('paladin',3,4)
 assert.equal(pal.heal,10);assert.equal(pal.shieldCreated,15);assert.equal(pal.skillBonusPct,.05)
 assert.deepEqual(pal.techniques,['Bênção Restauradora','Julgamento Divino','Égide Celestial'])
 assert.equal(attack('paladin',3,3).heal,0)
 assert.equal(attack('paladin',3,4,{hp:800}).shieldCreated,0)
 assert.equal(attack('paladin',1,4).shieldCreated,0)
 const block=classPvpDefense({classId:'paladin',awakeningStage:3,damage:100,hp:400,maxHp:1000,roll:.5,awakeningState:pal.awakeningState})
 assert.equal(block.shieldAbsorbed,15)
 const nec=attack('necromancer',3,4)
 assert.equal(nec.heal,10);assert.equal(nec.skillBonusPct,.04)
 assert.ok(nec.techniques.includes('Drenagem de Almas'));assert.ok(nec.techniques.includes('Maldição'))
 let state={},sam
 for(let i=1;i<=4;i++){sam=attack('samurai',3,i,{awakeningState:state});state=sam.awakeningState}
 assert.equal(sam.skillBonusPct,.03);assert.equal(state.focus,2);assert.ok(sam.techniques.includes('Postura Iai'))
 const crit=attack('samurai',3,5,{critical:true,awakeningState:state});assert.equal(crit.awakeningState.focus,0);assert.ok(crit.skillBonusPct>.03)
 const ber=attack('berserker',3,2,{hp:440});assert.ok(ber.techniques.includes('Fúria Crescente'));assert.ok(ber.skillBonusPct>0)
 assert.equal(attack('berserker',3,2,{hp:600}).skillBonusPct,0)
 assert.equal(attack('paladin',0,4).heal,0)
 assert.equal(attack('paladin',3,4,{applied:false}).heal,0)
})
